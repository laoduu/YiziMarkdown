/**
 * 文档内 AI 会话历史：按文档键存储的生成记录（指令 / 选区原文 / 结果 / 时间）。
 *
 * 约定：
 * - 单一 localStorage 键，与 `yizimarkdown-editor*` 隔离 —— 编辑器存储的配额降级不会波及历史；
 * - 文档键（docKey）与编辑器去重同一套约定：remote:path > file:path > tab:id（未命名兜底）；
 * - 历史与内容无关、永不因外部修改删除；重新应用时按内容搜索锚点（findUniqueRange），
 *   不信任记录里的 from/to 偏移；
 * - 未命名文档保存后由 editorStore 的 updateTabFilePath / setTabRemote 迁移键；
 *   孤儿 tab: 键在裁剪时按「不在打开列表且超过 30 天」淘汰。
 *
 * 本模块不依赖 Tauri / React / DOM（localStorage 以参数注入），便于 Node 单测。
 */
import { MAX_SELECTION_CHARS } from './inlineAI.ts'

export const HISTORY_STORAGE_KEY = 'yizimarkdown-inline-ai-history'
export const HISTORY_SCHEMA_VERSION = 1

/** 单文档保留条数 */
export const MAX_RECORDS_PER_DOC = 50
/** 全局保留条数 */
export const MAX_RECORDS_GLOBAL = 500
/** 记录保留天数 */
export const HISTORY_TTL_DAYS = 90
/** 未命名（tab:）孤儿键的宽限天数 */
export const ORPHAN_TAB_GRACE_DAYS = 30
/** 指令截断上限 */
export const MAX_INSTRUCTION_CHARS = 2000

export type InlineAIMode = 'rewrite' | 'create' | 'skill'

export interface InlineAIHistoryRecord {
  id: string
  ts: number
  mode: InlineAIMode
  skillName?: string
  ctx: 'none' | 'section' | 'document'
  instruction: string
  originalSelection: string
  result: string
  /** 生成时的选区偏移，仅作提示；重新应用一律走内容搜索 */
  from: number
  to: number
  status: 'complete' | 'partial'
}

export interface InlineAIHistoryStore {
  v: number
  docs: Record<string, InlineAIHistoryRecord[]>
}

/** resolveDocKey 接受的最小 tab 形状（editorStore.FileTab 的子集） */
export interface DocIdentity {
  id: string
  filePath: string | null
  remote?: { path: string }
}

export function emptyHistoryStore(): InlineAIHistoryStore {
  return { v: HISTORY_SCHEMA_VERSION, docs: {} }
}

/**
 * 文档键：remote > path > tab。与 editorStore 的云端/本地去重约定一致
 * （云端只按 canonicalRemotePath，不带 baseUrl —— 历史存本地，同配置根即同列表）。
 */
export function resolveDocKey(tab: DocIdentity | null | undefined): string {
  if (!tab) return ''
  if (tab.remote?.path) return `remote:${tab.remote.path}`
  if (tab.filePath) return `path:${tab.filePath}`
  return `tab:${tab.id}`
}

export interface BuildRecordInput {
  mode: 'rewrite' | 'create'
  skillName?: string
  ctx: 'none' | 'section' | 'document'
  instruction: string
  originalSelection: string
  result: string
  from: number
  to: number
  status: 'complete' | 'partial'
  ts?: number
}

/** 构建记录：截断超长字段，推导 mode（技能直通记为 skill） */
export function buildHistoryRecord(input: BuildRecordInput): InlineAIHistoryRecord {
  const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max) : s)
  return {
    id: crypto.randomUUID(),
    ts: input.ts ?? Date.now(),
    mode: input.mode === 'create' ? 'create' : input.skillName ? 'skill' : input.mode,
    ...(input.skillName ? { skillName: input.skillName } : {}),
    ctx: input.ctx,
    instruction: clip(input.instruction, MAX_INSTRUCTION_CHARS),
    originalSelection: clip(input.originalSelection, MAX_SELECTION_CHARS),
    result: clip(input.result, MAX_SELECTION_CHARS),
    from: input.from,
    to: input.to,
    status: input.status,
  }
}

/** 新记录插到最前面（列表新在上） */
export function appendRecord(
  store: InlineAIHistoryStore,
  docKey: string,
  record: InlineAIHistoryRecord,
): InlineAIHistoryStore {
  if (!docKey) return store
  const list = [record, ...(store.docs[docKey] ?? [])].slice(0, MAX_RECORDS_PER_DOC)
  return { ...store, docs: { ...store.docs, [docKey]: list } }
}

export function listRecords(
  store: InlineAIHistoryStore,
  docKey: string,
): InlineAIHistoryRecord[] {
  return store.docs[docKey] ?? []
}

export function deleteRecord(
  store: InlineAIHistoryStore,
  docKey: string,
  recordId: string,
): InlineAIHistoryStore {
  const list = store.docs[docKey]
  if (!list) return store
  const next = list.filter((r) => r.id !== recordId)
  const docs = { ...store.docs }
  if (next.length === 0) delete docs[docKey]
  else docs[docKey] = next
  return { ...store, docs }
}

/**
 * 文档身份变化（保存 / 另存 / 绑定云端）时迁移历史：
 * fromKey 的记录并入 toKey（按时间合并、去重、裁剪），再删掉 fromKey。
 */
export function migrateTabHistory(
  store: InlineAIHistoryStore,
  fromKey: string,
  toKey: string,
): InlineAIHistoryStore {
  if (!fromKey || !toKey || fromKey === toKey) return store
  const fromList = store.docs[fromKey]
  if (!fromList) return store
  const merged = [...(store.docs[toKey] ?? []), ...fromList]
  const seen = new Set<string>()
  const deduped = merged
    .sort((a, b) => b.ts - a.ts)
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .slice(0, MAX_RECORDS_PER_DOC)
  const docs = { ...store.docs, [toKey]: deduped }
  delete docs[fromKey]
  return { ...store, docs }
}

export interface PruneOptions {
  now?: number
  /** 当前打开的 tab id 集合（用于识别孤儿 tab: 键） */
  activeTabIds?: ReadonlySet<string>
}

/** 按 TTL / 孤儿宽限 / 单文档上限 / 全局上限裁剪；返回新 store（无变化时原样返回） */
export function pruneHistory(
  store: InlineAIHistoryStore,
  opts: PruneOptions = {},
): InlineAIHistoryStore {
  const now = opts.now ?? Date.now()
  const ttlMs = HISTORY_TTL_DAYS * 86400_000
  const graceMs = ORPHAN_TAB_GRACE_DAYS * 86400_000
  const docs: Record<string, InlineAIHistoryRecord[]> = {}
  let changed = false

  for (const [key, list] of Object.entries(store.docs)) {
    let kept = list.filter((r) => now - r.ts <= ttlMs)
    if (kept.length !== list.length) changed = true

    if (key.startsWith('tab:') && opts.activeTabIds) {
      const tabId = key.slice(4)
      const newest = kept.reduce((m, r) => Math.max(m, r.ts), 0)
      const orphan = !opts.activeTabIds.has(tabId) && now - newest > graceMs
      if (orphan) {
        changed = true
        continue
      }
    }

    if (kept.length > MAX_RECORDS_PER_DOC) {
      kept = kept.slice(0, MAX_RECORDS_PER_DOC)
      changed = true
    }
    if (kept.length > 0) docs[key] = kept
    else if (list.length > 0) changed = true
  }

  // 全局上限：超了从最旧的记录开始丢
  const total = Object.values(docs).reduce((n, l) => n + l.length, 0)
  if (total > MAX_RECORDS_GLOBAL) {
    changed = true
    const stamped = Object.entries(docs).flatMap(([k, l]) => l.map((r) => ({ k, id: r.id, ts: r.ts })))
    stamped.sort((a, b) => b.ts - a.ts)
    const drop = new Set(stamped.slice(MAX_RECORDS_GLOBAL).map((x) => `${x.k}\u0000${x.id}`))
    for (const k of Object.keys(docs)) {
      const next = docs[k].filter((r) => !drop.has(`${k}\u0000${r.id}`))
      if (next.length === 0) delete docs[k]
      else docs[k] = next
    }
  }

  if (!changed && Object.keys(docs).length === Object.keys(store.docs).length) {
    // 逐键比对，确认真的没变化才复用原对象
    const same = Object.keys(docs).every(
      (k) => docs[k].length === store.docs[k]?.length && docs[k].every((r, i) => r === store.docs[k]?.[i]),
    )
    if (same) return store
  }
  return { ...store, docs }
}

/**
 * 在文档全文里找 `needle` 的唯一出现位置；多处或未命中返回 null。
 * 历史重新应用的锚点判定 —— 存储的 from/to 可能因外部修改而失效。
 */
export function findUniqueRange(
  doc: string,
  needle: string,
): { from: number; to: number } | null {
  if (!needle) return null
  const first = doc.indexOf(needle)
  if (first === -1) return null
  if (doc.indexOf(needle, first + 1) !== -1) return null
  return { from: first, to: first + needle.length }
}

/* ---------- 读写封装（Storage 注入，便于测试） ---------- */

export interface KVStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function defaultStorage(): KVStorage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

/** 读取并解析历史；缺失 / 损坏 / 版本不符一律返回空 store */
export function loadHistory(storage: KVStorage | null = defaultStorage()): InlineAIHistoryStore {
  if (!storage) return emptyHistoryStore()
  try {
    const raw = storage.getItem(HISTORY_STORAGE_KEY)
    if (!raw) return emptyHistoryStore()
    const parsed = JSON.parse(raw) as InlineAIHistoryStore
    if (parsed?.v !== HISTORY_SCHEMA_VERSION || typeof parsed.docs !== 'object' || !parsed.docs) {
      return emptyHistoryStore()
    }
    return parsed
  } catch {
    return emptyHistoryStore()
  }
}

/**
 * 写回历史。配额耗尽时全局丢掉最旧的 25% 重试一次，再失败静默放弃
 * （历史可弃，绝不冒抛错打断保存 / 生成流程）。
 */
export function saveHistory(
  store: InlineAIHistoryStore,
  storage: KVStorage | null = defaultStorage(),
): boolean {
  if (!storage) return false
  const payload = JSON.stringify(store)
  try {
    storage.setItem(HISTORY_STORAGE_KEY, payload)
    return true
  } catch {
    // QuotaExceeded：砍最旧 25% 再试一次
    try {
      const stamped = Object.entries(store.docs).flatMap(([k, l]) => l.map((r) => ({ k, id: r.id, ts: r.ts })))
      if (stamped.length === 0) return false
      stamped.sort((a, b) => b.ts - a.ts)
      const keep = new Set(stamped.slice(Math.ceil(stamped.length * 0.75)).map((x) => `${x.k}\u0000${x.id}`))
      const docs: Record<string, InlineAIHistoryRecord[]> = {}
      for (const [k, list] of Object.entries(store.docs)) {
        const next = list.filter((r) => keep.has(`${k}\u0000${r.id}`))
        if (next.length > 0) docs[k] = next
      }
      storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify({ v: HISTORY_SCHEMA_VERSION, docs }))
      return true
    } catch {
      return false
    }
  }
}

/** 读 → 改 → 写 的便捷入口；无 storage 时原样返回 store */
export function withHistory(
  mutate: (store: InlineAIHistoryStore) => InlineAIHistoryStore,
  storage: KVStorage | null = defaultStorage(),
): InlineAIHistoryStore {
  const next = mutate(loadHistory(storage))
  saveHistory(next, storage)
  return next
}
