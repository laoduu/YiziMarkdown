/**
 * `editorStore` 的持久化存储层（自定义 zustand `PersistStorage`）。
 *
 * **为什么不用默认的 `createJSONStorage(() => localStorage)`：**
 *
 * 1) **写入放大**（实测问题）：默认实现每次 `set` 都把整份 `partialize` 结果 `JSON.stringify`
 *    后整串写一遍，而 `partialize` 里含**每个标签页的正文** ⇒ 每敲一个字符都要把所有打开
 *    文档整体序列化 + 整串落盘。开着十几个大文档输入会明显滞涩，成本随「打开的文档数 × 文档大小」
 *    线性增长，而真正变化的只有当前那一个字符。
 *    ⇒ 本实现把正文**按标签页拆成独立键**，且只写正文真正变化的那一个。
 *
 * 2) **配额静默失败**（实测问题）：localStorage 有配额（WebView2 下按来源计量：
 *    上限约 5,238,000 字符，按 UTF-16 码元 2 字节计 ≈ 10MB）。超限时 `setItem` 抛
 *    `QuotaExceededError`，而 zustand 默认实现**不捕获** ⇒ 持久化悄悄停止、
 *    用户还在打字，重启后才发现内容没了。
 *    ⇒ 本实现捕获失败，并按「内容的可替代性」降级：
 *    先放弃磁盘上**已有权威副本**的正文（已保存文件的内容、云端文档的本地镜像），
 *    保住真正不可再生的部分（未保存 / 未命名文档），并把降级状态报给界面。
 *    **正文键和清单键任一写失败都走这一套**：清单写失败同样是配额满的信号（只是后果轻一些，
 *    标签页列表会停在旧版本），只记录不处理等于让用户失去唯一的提示。
 *
 * **键布局**
 *   - `yizimarkdown-editor`            清单：标签页元信息 + 活动页 + 最近文件（正常不含正文）
 *   - `yizimarkdown-editor:doc:<tabId>` 单个标签页的正文
 *
 * **不变式**：某标签页的正文要么在自己的内容键里、要么内嵌在清单里（写入失败/旧版迁移时的兜底，
 * 且有 `INLINE_CONTENT_LIMIT` 体积上限），读取时**内嵌优先**（内嵌的一定是更新的那份）。
 * 绝不允许出现「键里没有、清单里也没有，却被当作已保存」的标签页 —— 那会让用户按 Ctrl+S
 * 把磁盘上的文件截断成空。
 */
import type { PersistStorage, StorageValue } from 'zustand/middleware'
import type { RemoteRef, SaveStatus, ViewMode } from '../stores/editorStore'

/** 清单键名。沿用旧版键名：旧版数据就在这个键里，改名会丢掉所有人的标签页 */
export const META_KEY = 'yizimarkdown-editor'
/** 正文键前缀 */
export const CONTENT_PREFIX = 'yizimarkdown-editor:doc:'

/**
 * 清单兜底内嵌正文的大小上限（字符）。**为什么必须有上限**：清单是每次按键都要重写的，
 * 把一大段正文塞进清单等于把刚修掉的写入放大又请回来 —— 每个字符都要把这段正文重新
 * 序列化一遍，而且清单本身就更容易写失败。超过上限的只报警（`lost`），不倒灌进清单。
 */
export const INLINE_CONTENT_LIMIT = 4 * 1024

/** 计划与判定只需要这些字段，不必依赖完整的 `FileTab`（便于单测） */
export interface ContentTab {
  id: string
  name: string
  filePath: string | null
  /** `null` = 正文未缓存（待从磁盘恢复），见 `PendingContentLoad` */
  content: string | null
  isSaved: boolean
  saveStatus: SaveStatus
  viewMode: ViewMode
  remote?: RemoteRef
}

/** 持久化形态：正文可能为 `null`（未缓存） */
export interface PersistedEditorState {
  tabs: ContentTab[]
  activeTabId: string | null
  recentFiles: string[]
}

/**
 * 正文需要从磁盘恢复的标签页（正文键缺失时由 `getItem` 产出，界面负责恢复）。
 * `recoverable` 决定了「恢复失败」的严重性：为 true 只是少一个标签页；为 false 说明
 * 未保存的修改已经丢了（本地缓存是它唯一的副本）。
 */
export interface PendingContentLoad {
  id: string
  name: string
  /** `null` = 未命名文档（磁盘上没有任何副本，无从恢复） */
  filePath: string | null
  recoverable: boolean
}

/** 磁盘上已有权威副本：本地文件本身 / 云端文档的本地镜像（都在 config 目录，是持久目录） */
export function isRecoverableFromDisk(tab: Pick<ContentTab, 'filePath' | 'saveStatus'>): boolean {
  if (!tab.filePath) return false
  return tab.saveStatus === 'saved' || tab.saveStatus === 'just-saved'
}

/** 正文**必须**缓存：磁盘上没有权威副本（未命名 / 未保存），丢了就真丢了 */
export function mustCacheContent(tab: Pick<ContentTab, 'filePath' | 'saveStatus'>): boolean {
  return !isRecoverableFromDisk(tab)
}

export interface StoragePlan {
  /** 本次要写的内容键（只含正文真正变化的） */
  writes: Array<{ id: string; key: string; content: string }>
  /** 本次要删的内容键（标签页已关闭 / 正文改为不缓存 / 上次写入留下的孤儿键） */
  deletes: Array<{ id: string; key: string }>
  /** 本次有意不缓存的标签页（可省内容 + 已降级，或正文待恢复） */
  skipped: string[]
}

/**
 * 决定本次要写 / 要删哪些内容键。**纯函数**（单测的主要目标）。
 *
 * @param prev 已知的内容键 → 正文；值为 `null` 表示键存在但内容未知（上次写入中断留下的孤儿键）
 * @param degraded 已降级：不再缓存「磁盘上已有权威副本」的正文
 */
export function planEditorStorage(
  prev: ReadonlyMap<string, string | null>,
  tabs: ReadonlyArray<ContentTab>,
  degraded: boolean
): StoragePlan {
  const writes: StoragePlan['writes'] = []
  const deletes: StoragePlan['deletes'] = []
  const skipped: string[] = []
  const seen = new Set<string>()

  for (const tab of tabs) {
    seen.add(tab.id)
    const key = CONTENT_PREFIX + tab.id
    // 正文待恢复时不写：此刻内存里是占位空串，写下去会把磁盘上的真实内容覆盖成一个空壳
    const want = tab.content !== null && (mustCacheContent(tab) || !degraded)
    if (!want) {
      if (prev.has(tab.id)) deletes.push({ id: tab.id, key })
      skipped.push(tab.id)
      continue
    }
    if (prev.get(tab.id) !== tab.content) {
      writes.push({ id: tab.id, key, content: tab.content as string })
    }
  }

  // 孤儿键：清单里已经没有这个标签页了（上次写入中断、标签页已关闭但清单没写成）
  for (const id of prev.keys()) {
    if (!seen.has(id)) deletes.push({ id, key: CONTENT_PREFIX + id })
  }

  return { writes, deletes, skipped }
}

/**
 * 生成清单里的标签页：正文键里已有**同一份**内容就只留元信息（省空间）；
 * 否则若这份正文「必须缓存」，且体积在 `INLINE_CONTENT_LIMIT` 以内，就把正文内嵌进清单兜底。
 *
 * 兜底为什么必要：内容键写入失败（配额）时，若清单也不带正文，这份正文就彻底没有落盘 ——
 * 未保存的内容会静默消失。内嵌进清单等于退回「旧版布局」，至少不会丢。
 * 兜底为什么有上限：见 `INLINE_CONTENT_LIMIT` 的说明。
 */
export function buildMetaTabs(
  tabs: ReadonlyArray<ContentTab>,
  known: ReadonlyMap<string, string | null>
): ContentTab[] {
  return tabs.map((tab) => {
    if (typeof tab.content !== 'string') return { ...tab, content: null }
    if (known.get(tab.id) === tab.content) return { ...tab, content: null }
    if (mustCacheContent(tab) && tab.content.length <= INLINE_CONTENT_LIMIT) return tab
    return { ...tab, content: null }
  })
}

export type EditorStorageWarningLevel = 'degraded' | 'lost'
export interface EditorStorageWarning {
  /** `degraded` = 已停止缓存可省内容；`lost` = 连未保存的内容都没能缓存 */
  level: EditorStorageWarningLevel
  /** 为腾出空间而放弃缓存的标签页数（这些正文仍在磁盘上，不受影响） */
  evicted: number
}

const RANK: Record<EditorStorageWarningLevel, number> = { degraded: 1, lost: 2 }
const warningListeners = new Set<(w: EditorStorageWarning) => void>()
let lastWarning: EditorStorageWarning | null = null
let warnedLevel: EditorStorageWarningLevel | null = null

/**
 * 订阅持久化降级 / 失败通知。
 *
 * 只报**首次降级**与**升级为真丢内容**各一次：配额满时每个字符都会写失败，
 * 每次都报会把界面刷爆，反而让用户学会无视这个提示。
 */
export function onEditorStorageWarning(fn: (w: EditorStorageWarning) => void): () => void {
  warningListeners.add(fn)
  return () => { warningListeners.delete(fn) }
}

/**
 * 读最近一次通知。**启动期需要它**：hydration 触发的第一次写入可能就失败，
 * 而那时界面还没挂载、订阅者还没注册，只靠事件会把这次失败丢掉。
 */
export function getLastEditorStorageWarning(): EditorStorageWarning | null {
  return lastWarning
}

/** 仅供单测：复位「本会话已报警」状态与订阅者 */
export function resetEditorStorageWarningsForTests(): void {
  warningListeners.clear()
  lastWarning = null
  warnedLevel = null
}

function emitWarning(w: EditorStorageWarning): boolean {
  if (warnedLevel !== null && RANK[w.level] <= RANK[warnedLevel]) return false
  warnedLevel = w.level
  lastWarning = w
  for (const fn of [...warningListeners]) {
    try {
      fn(w)
    } catch (e) {
      console.error('[editorStorage] 降级通知的订阅者抛错:', e)
    }
  }
  return true
}

/**
 * 一次性诊断信息：当前本地缓存占用了多少键 / 多少字符。
 *
 * 只在首次降级时打一条。配额满时每个字符都会写失败，逐条打日志只会把现场淹掉；
 * 而这一条能把「到底是不是配额问题、占用了多少」直接说清楚（WebView2 实测上限约
 * 5,238,000 字符 ≈ 10MB，按 UTF-16 码元 2 字节计）。
 */
function describeStorageUse(ls: KeyValueStore): string {
  let keys = 0
  let chars = 0
  try {
    for (let i = 0; i < ls.length; i++) {
      const key = ls.key(i)
      if (!key) continue
      keys++
      chars += key.length + (ls.getItem(key)?.length ?? 0)
    }
  } catch {
    return '无法统计'
  }
  return `${keys} 个键 / ${chars} 字符`
}

/** localStorage 的子集（`Storage` 正好满足），便于单测注入假实现 */
export interface KeyValueStore {
  readonly length: number
  key(index: number): string | null
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const defaultStore = (): KeyValueStore | null =>
  typeof localStorage === 'undefined' ? null : localStorage

/**
 * @param getStore 取底层存储；返回 `null` 表示环境没有 localStorage（Node 单测、
 *                 WebView2 禁用存储等）——此时全部操作静默跳过，不抛错。
 */
export function createEditorStorage(
  getStore: () => KeyValueStore | null = defaultStore
): PersistStorage<PersistedEditorState> {
  /** 已知内容键 → 正文；`null` = 键存在但内容未知（孤儿键） */
  const known = new Map<string, string | null>()
  /** 已降级：不再缓存「磁盘上已有权威副本」的正文（进程内状态，下次启动重新尝试） */
  let degraded = false

  /** 登记所有内容键（含清单里已无对应标签页的孤儿键） */
  const scanContentKeys = (ls: KeyValueStore): void => {
    try {
      for (let i = 0; i < ls.length; i++) {
        const key = ls.key(i)
        if (!key || !key.startsWith(CONTENT_PREFIX)) continue
        const id = key.slice(CONTENT_PREFIX.length)
        if (!known.has(id)) known.set(id, null)
      }
    } catch (e) {
      console.error('[editorStorage] 扫描内容键失败:', e)
    }
  }

  const dropContentKey = (ls: KeyValueStore, id: string): void => {
    try {
      ls.removeItem(CONTENT_PREFIX + id)
    } catch (e) {
      console.error('[editorStorage] 删除内容键失败:', e)
    }
    known.delete(id)
  }

  /** 写一批内容键，返回写入失败的标签页 id */
  const applyWrites = (
    ls: KeyValueStore,
    writes: StoragePlan['writes']
  ): Set<string> => {
    const failed = new Set<string>()
    for (const w of writes) {
      try {
        ls.setItem(w.key, w.content)
        known.set(w.id, w.content)
      } catch {
        // 写不进去就删掉这个键：一是让清单的「内嵌正文兜底」有空间放（旧值留着只会占位，
        // 而且读取时内嵌优先，旧键本就是死重量）；二是避免下次读到「旧正文」被当成最新内容。
        failed.add(w.id)
        dropContentKey(ls, w.id)
      }
    }
    return failed
  }

  /**
   * 放弃「磁盘上已有权威副本」的正文，为必须缓存的正文腾空间；返回放弃的键数。
   *
   * 计数必须对照**本次写入之前**的键集合：写入失败的正文键已经被 `applyWrites` 清掉了
   * （见那里的说明），若对照 `known` 的当前状态就会少算。
   * `evicted` 累计到调用方传入的集合里：正文与清单两次失败会各清一遍，只应算一次。
   */
  const evictRecoverable = (
    ls: KeyValueStore,
    tabs: ReadonlyArray<ContentTab>,
    keysBefore: ReadonlySet<string>,
    evicted: Set<string>
  ): number => {
    for (const tab of tabs) {
      if (!isRecoverableFromDisk(tab)) continue
      if (keysBefore.has(tab.id)) evicted.add(tab.id)
      dropContentKey(ls, tab.id)
    }
    return evicted.size
  }

  /** 清单写失败时每个字符都会再失败一次：只把第一次打进控制台，避免把现场刷掉 */
  let metaWriteLogged = false

  /** 写清单（正文键里已有的只留元信息）。返回是否写成 */
  const writeMeta = (
    ls: KeyValueStore,
    name: string,
    value: StorageValue<PersistedEditorState>
  ): boolean => {
    const metaState: PersistedEditorState = {
      tabs: buildMetaTabs(value?.state?.tabs ?? [], known),
      activeTabId: value?.state?.activeTabId ?? null,
      recentFiles: value?.state?.recentFiles ?? [],
    }
    try {
      ls.setItem(name, JSON.stringify({ state: metaState, version: value?.version }))
      metaWriteLogged = false
      return true
    } catch (e) {
      if (!metaWriteLogged) {
        metaWriteLogged = true
        console.error('[editorStorage] 清单写入失败：本地缓存空间不足（标签页列表会停在旧版本，正文不受影响）:', e)
      }
      return false
    }
  }

  return {
    getItem(name) {
      const ls = getStore()
      if (!ls) return null
      known.clear()
      scanContentKeys(ls)

      const raw = ls.getItem(name)
      if (raw === null) return null
      let parsed: StorageValue<PersistedEditorState>
      try {
        parsed = JSON.parse(raw) as StorageValue<PersistedEditorState>
      } catch (e) {
        console.error('[editorStorage] 清单解析失败，忽略旧数据:', e)
        return null
      }
      const state = parsed?.state
      if (!state || !Array.isArray(state.tabs)) return null

      const tabs: ContentTab[] = state.tabs.map((tab) => {
        // 内嵌正文优先：只有内容键写入失败时才会内嵌，所以内嵌的那份一定更新
        if (typeof tab.content === 'string') {
          try {
            ls.setItem(CONTENT_PREFIX + tab.id, tab.content)
            known.set(tab.id, tab.content)
          } catch {
            // 迁不出去就先留在清单里（下次 setItem 仍会带着它），并清掉可能存在的旧键
            dropContentKey(ls, tab.id)
          }
          return { ...tab, content: tab.content }
        }
        const stored = ls.getItem(CONTENT_PREFIX + tab.id)
        if (stored !== null) {
          known.set(tab.id, stored)
          return { ...tab, content: stored }
        }
        known.delete(tab.id)
        return { ...tab, content: null }
      })

      return { state: { ...state, tabs }, version: parsed.version }
    },

    setItem(name, value) {
      const ls = getStore()
      if (!ls) return
      const tabs = value?.state?.tabs ?? []
      const tabsById = new Map(tabs.map((t) => [t.id, t]))
      /** 本次写入之前的键集合：用于统计「为腾空间放弃了几个键」 */
      const keysBefore = new Set(known.keys())
      /** 本次放弃缓存的标签页（正文键写失败 + 为腾空间清理，可能重复，只算一次） */
      const evicted = new Set<string>()
      /** 本次发生了降级（即使腾出空间后重试成功，也必须告诉用户「已停止缓存可省正文」） */
      let degradedNow = false

      // 1) 正文键：只写正文真正变化的那一个
      let plan = planEditorStorage(known, tabs, degraded)
      let failed = applyWrites(ls, plan.writes)

      // 2) 写不进去 ⇒ 配额耗尽：牺牲「磁盘上已有权威副本」的正文（已保存文件的内容、云端文档的镜像），
      //    保住真正不可再生的部分（未保存 / 未命名），再重试一次
      if (failed.size > 0 && !degraded) {
        degraded = true
        degradedNow = true
        evictRecoverable(ls, tabs, keysBefore, evicted)
        plan = planEditorStorage(known, tabs, true)
        failed = applyWrites(ls, plan.writes)
      }

      for (const d of plan.deletes) dropContentKey(ls, d.id)

      // 3) 清单。写不进去同样是配额满，而且后果更麻烦：标签页列表会停在旧版本，
      //    连「内嵌正文兜底」这个更小的落脚点也一起失效 ⇒ 与正文同等待遇（降级 + 腾空间 + 重试）
      let metaFailed = !writeMeta(ls, name, value)
      if (metaFailed && !degraded) {
        degraded = true
        degradedNow = true
        evictRecoverable(ls, tabs, keysBefore, evicted)
        metaFailed = !writeMeta(ls, name, value)
      }

      // 4) 报警：只报「首次降级」与「升级为丢内容」各一次（见 `emitWarning`）
      if (degradedNow || failed.size > 0 || metaFailed) {
        const level: EditorStorageWarningLevel = [...failed].some((id) => {
          const tab = tabsById.get(id)
          return !!tab && mustCacheContent(tab)
        })
          ? 'lost'
          : 'degraded'
        if (emitWarning({ level, evicted: evicted.size })) {
          console.warn(
            `[editorStorage] 本地缓存写入失败（${level === 'lost' ? '未保存的修改没能落盘' : '已停止缓存可省正文'}）：` +
              `当前占用 ${describeStorageUse(ls)}，已放弃 ${evicted.size} 个可省正文键`
          )
        }
      }
    },

    removeItem(name) {
      const ls = getStore()
      if (!ls) return
      scanContentKeys(ls)
      for (const id of [...known.keys()]) dropContentKey(ls, id)
      known.clear()
      try {
        ls.removeItem(name)
      } catch (e) {
        console.error('[editorStorage] 删除清单失败:', e)
      }
    },
  }
}
