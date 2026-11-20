/**
 * 会话历史纯逻辑测试：文档键、记录构建、迁移、裁剪、锚点搜索、存取。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  HISTORY_SCHEMA_VERSION,
  HISTORY_STORAGE_KEY,
  MAX_RECORDS_GLOBAL,
  MAX_RECORDS_PER_DOC,
  appendRecord,
  buildHistoryRecord,
  deleteRecord,
  emptyHistoryStore,
  findUniqueRange,
  listRecords,
  loadHistory,
  migrateTabHistory,
  pruneHistory,
  resolveDocKey,
  saveHistory,
  type InlineAIHistoryRecord,
  type KVStorage,
} from '../src/lib/inlineAIHistory.ts'

function record(ts: number, id: string): InlineAIHistoryRecord {
  return {
    id,
    ts,
    mode: 'rewrite',
    ctx: 'none',
    instruction: 'hi',
    originalSelection: 'sel',
    result: 'out',
    from: 0,
    to: 0,
    status: 'complete',
  }
}

function memStorage(): KVStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  }
}

/* ---------- resolveDocKey ---------- */

test('resolveDocKey：remote > path > tab 优先级', () => {
  assert.equal(
    resolveDocKey({ id: 't1', filePath: '/a/b.md', remote: { path: '/Notes/b.md' } }),
    'remote:/Notes/b.md',
  )
  assert.equal(resolveDocKey({ id: 't1', filePath: '/a/b.md' }), 'path:/a/b.md')
  assert.equal(resolveDocKey({ id: 't1', filePath: null }), 'tab:t1')
  assert.equal(resolveDocKey(null), '')
})

/* ---------- buildHistoryRecord ---------- */

test('buildHistoryRecord：截断超长字段并推导 mode', () => {
  const r = buildHistoryRecord({
    mode: 'rewrite',
    skillName: 'polish-skill',
    ctx: 'section',
    instruction: 'x'.repeat(3000),
    originalSelection: 's'.repeat(9000),
    result: 'r'.repeat(9000),
    from: 3,
    to: 10,
    status: 'complete',
    ts: 123,
  })
  assert.equal(r.instruction.length, 2000)
  assert.equal(r.originalSelection.length, 8000)
  assert.equal(r.result.length, 8000)
  assert.equal(r.mode, 'skill')
  assert.equal(r.skillName, 'polish-skill')
  assert.equal(r.ts, 123)
  assert.equal(r.status, 'complete')
})

test('buildHistoryRecord：create 模式与无技能的 rewrite', () => {
  const c = buildHistoryRecord({
    mode: 'create',
    ctx: 'none',
    instruction: 'write',
    originalSelection: '',
    result: 'text',
    from: 0,
    to: 0,
    status: 'partial',
  })
  assert.equal(c.mode, 'create')
  const w = buildHistoryRecord({
    mode: 'rewrite',
    ctx: 'none',
    instruction: 'x',
    originalSelection: 'y',
    result: 'z',
    from: 0,
    to: 1,
    status: 'complete',
  })
  assert.equal(w.mode, 'rewrite')
  assert.equal(w.skillName, undefined)
})

/* ---------- append / list / delete ---------- */

test('appendRecord：新记录在前，单文档上限 50', () => {
  let store = emptyHistoryStore()
  for (let i = 0; i < 60; i++) {
    store = appendRecord(store, 'path:/a.md', record(Date.now() + i, `r${i}`))
  }
  const list = listRecords(store, 'path:/a.md')
  assert.equal(list.length, MAX_RECORDS_PER_DOC)
  assert.equal(list[0].id, 'r59')
  assert.equal(appendRecord(store, '', record(1, 'x')), store)
})

test('deleteRecord：删完后键一并移除', () => {
  let store = appendRecord(emptyHistoryStore(), 'path:/a.md', record(1, 'r1'))
  store = deleteRecord(store, 'path:/a.md', 'r1')
  assert.deepEqual(store.docs, {})
  // 不存在的 id 原样返回
  const same = deleteRecord(store, 'path:/a.md', 'nope')
  assert.equal(same, store)
})

/* ---------- migrateTabHistory ---------- */

test('migrateTabHistory：并入目标键、按时间排序、源键删除', () => {
  let store = emptyHistoryStore()
  store = appendRecord(store, 'tab:t1', record(100, 'old'))
  store = appendRecord(store, 'path:/a.md', record(200, 'newer'))
  store = migrateTabHistory(store, 'tab:t1', 'path:/a.md')
  assert.equal(store.docs['tab:t1'], undefined)
  const list = listRecords(store, 'path:/a.md')
  assert.deepEqual(list.map((r) => r.id), ['newer', 'old'])
})

test('migrateTabHistory：同 id 去重；from===to 或源为空时不动', () => {
  const r = record(5, 'dup')
  let store = emptyHistoryStore()
  store = { ...store, docs: { 'tab:t1': [r], 'path:/a.md': [{ ...r, ts: 6 }] } }
  const next = migrateTabHistory(store, 'tab:t1', 'path:/a.md')
  assert.equal(listRecords(next, 'path:/a.md').length, 1)
  assert.equal(migrateTabHistory(store, 'tab:t1', 'tab:t1'), store)
  assert.equal(migrateTabHistory(store, 'tab:missing', 'path:/a.md'), store)
})

/* ---------- pruneHistory ---------- */

test('pruneHistory：TTL 90 天淘汰过期记录', () => {
  const now = 1_000_000_000_000
  const store = {
    v: HISTORY_SCHEMA_VERSION,
    docs: {
      'path:/a.md': [
        record(now - 91 * 86400_000, 'stale'),
        record(now - 89 * 86400_000, 'fresh'),
      ],
    },
  }
  const pruned = pruneHistory(store, { now })
  assert.deepEqual(listRecords(pruned, 'path:/a.md').map((r) => r.id), ['fresh'])
})

test('pruneHistory：单文档上限 50', () => {
  const now = 1_000_000_000_000
  const list: InlineAIHistoryRecord[] = []
  for (let i = 0; i < 60; i++) list.push(record(now - i, `r${i}`))
  const pruned = pruneHistory({ v: 1, docs: { 'path:/a.md': list } }, { now })
  assert.equal(listRecords(pruned, 'path:/a.md').length, MAX_RECORDS_PER_DOC)
  assert.equal(listRecords(pruned, 'path:/a.md')[0].id, 'r0')
})

test('pruneHistory：孤儿 tab 键 —— 不在打开列表且超 30 天才删', () => {
  const now = 1_000_000_000_000
  const docs = {
    'tab:closed-old': [record(now - 31 * 86400_000, 'a')],
    'tab:closed-new': [record(now - 1 * 86400_000, 'b')],
    'tab:open-old': [record(now - 60 * 86400_000, 'c')],
  }
  const pruned = pruneHistory({ v: 1, docs }, { now, activeTabIds: new Set(['open-old']) })
  assert.equal(pruned.docs['tab:closed-old'], undefined)
  assert.ok(pruned.docs['tab:closed-new'])
  assert.ok(pruned.docs['tab:open-old'])
  // 没有 activeTabIds 时不判孤儿
  const noIds = pruneHistory({ v: 1, docs }, { now })
  assert.ok(noIds.docs['tab:closed-old'])
})

test('pruneHistory：全局上限 500，丢最旧的', () => {
  const now = 1_000_000_000_000
  const docs: Record<string, InlineAIHistoryRecord[]> = {}
  for (let d = 0; d < 11; d++) {
    const key = `path:/d${d}.md`
    docs[key] = []
    for (let i = 0; i < MAX_RECORDS_PER_DOC; i++) {
      // d 越大越旧：d0 = 最新一批，d10 = 最旧一批
      docs[key].push(record(now - (d * MAX_RECORDS_PER_DOC + i), `r${d}-${i}`))
    }
  }
  const pruned = pruneHistory({ v: 1, docs }, { now })
  const total = Object.values(pruned.docs).reduce((n, l) => n + l.length, 0)
  assert.equal(total, MAX_RECORDS_GLOBAL)
  // 最旧的一批（d10）整键被丢；最新的 d0 完整保留
  assert.equal(pruned.docs['path:/d10.md'], undefined)
  assert.equal(listRecords(pruned, 'path:/d0.md').length, MAX_RECORDS_PER_DOC)
})

/* ---------- findUniqueRange ---------- */

test('findUniqueRange：唯一命中 / 多处 / 未命中 / 空 needle', () => {
  assert.deepEqual(findUniqueRange('alpha beta gamma', 'beta'), { from: 6, to: 10 })
  assert.equal(findUniqueRange('alpha beta gamma beta', 'beta'), null)
  assert.equal(findUniqueRange('alpha beta gamma', 'missing'), null)
  assert.equal(findUniqueRange('alpha', ''), null)
  assert.deepEqual(findUniqueRange('only', 'nly'), { from: 1, to: 4 })
})

/* ---------- load / save ---------- */

test('saveHistory / loadHistory：往返一致', () => {
  const storage = memStorage()
  const store = appendRecord(emptyHistoryStore(), 'path:/a.md', record(1, 'r1'))
  assert.equal(saveHistory(store, storage), true)
  const loaded = loadHistory(storage)
  assert.equal(loaded.v, HISTORY_SCHEMA_VERSION)
  assert.deepEqual(listRecords(loaded, 'path:/a.md').map((r) => r.id), ['r1'])
  assert.equal(storage.data.has(HISTORY_STORAGE_KEY), true)
})

test('loadHistory：缺失 / 损坏 / 版本不符都回空 store', () => {
  assert.deepEqual(loadHistory(memStorage()), emptyHistoryStore())
  const bad = memStorage()
  bad.data.set(HISTORY_STORAGE_KEY, '{not json')
  assert.deepEqual(loadHistory(bad), emptyHistoryStore())
  const wrongV = memStorage()
  wrongV.data.set(HISTORY_STORAGE_KEY, JSON.stringify({ v: 99, docs: {} }))
  assert.deepEqual(loadHistory(wrongV), emptyHistoryStore())
  assert.deepEqual(loadHistory(null), emptyHistoryStore())
})

test('saveHistory：首次写入抛配额错 → 砍 25% 重试；再抛则静默失败', () => {
  // 首次抛、重试成功
  let calls = 0
  const flaky: KVStorage = {
    getItem: () => null,
    setItem: () => {
      calls++
      if (calls === 1) throw new Error('QuotaExceededError')
    },
  }
  let store = emptyHistoryStore()
  for (let i = 0; i < 8; i++) store = appendRecord(store, 'path:/a.md', record(i + 1, `r${i}`))
  assert.equal(saveHistory(store, flaky), true)
  assert.equal(calls, 2)

  // 一直抛 → false，不抛错
  const dead: KVStorage = {
    getItem: () => null,
    setItem: () => {
      throw new Error('QuotaExceededError')
    },
  }
  assert.equal(saveHistory(store, dead), false)
})
