// editorStore 持久化存储层的单测（node --test 直跑，见 package.json）。
// 运行：node --experimental-transform-types --test tests/editorStorage.test.ts
//
// 覆盖两类内容：
//   1) 纯决策函数（planEditorStorage / buildMetaTabs / isRecoverableFromDisk）—— 写入放大与降级策略
//   2) 适配器全流程 —— 用带配额的假存储把「配额耗尽」这条少数派路径真的跑一遍，
//      否则它只会在用户机器上以「静默丢数据」的形式被发现
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  META_KEY, CONTENT_PREFIX, INLINE_CONTENT_LIMIT, createEditorStorage,
  isRecoverableFromDisk, mustCacheContent, planEditorStorage, buildMetaTabs,
  onEditorStorageWarning, getLastEditorStorageWarning, resetEditorStorageWarningsForTests,
  resetEditorStorageWarning,
  type ContentTab, type PersistedEditorState, type KeyValueStore, type EditorStorageWarning,
} from '../src/lib/editorStorage.ts'

beforeEach(() => {
  resetEditorStorageWarningsForTests()
})

// ---------- 测试替身 ----------

/** 按「键名 + 值」的总字符数计量的假 localStorage；超预算即抛 QuotaExceededError */
class FakeStore implements KeyValueStore {
  map = new Map<string, string>()
  budget = Infinity
  /** 记录每次写入的键，用于断言「只写了该写的那一个」 */
  puts: string[] = []
  /**
   * 只让特定键写失败。用于复现「正文挤得下、清单挤不下」——清单比单份正文大，
   * 这是配额快满时真实会发生的组合（用户实测：每个字符都报清单写入失败）。
   */
  failFor: ((key: string) => boolean) | null = null

  get length() { return this.map.size }
  key(index: number) { return [...this.map.keys()][index] ?? null }
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null }

  setItem(k: string, v: string) {
    if (this.failFor?.(k)) {
      const e = new Error('quota exceeded')
      e.name = 'QuotaExceededError'
      throw e
    }
    const next = new Map(this.map)
    next.set(k, v)
    let total = 0
    for (const [key, value] of next) total += key.length + value.length
    if (total > this.budget) {
      const e = new Error('quota exceeded')
      e.name = 'QuotaExceededError'
      throw e
    }
    this.map = next
    this.puts.push(k)
  }

  removeItem(k: string) { this.map.delete(k) }
  size() {
    let total = 0
    for (const [key, value] of this.map) total += key.length + value.length
    return total
  }
}

const tab = (over: Partial<ContentTab> & { id: string }): ContentTab => ({
  id: over.id,
  name: over.id,
  filePath: `C:/docs/${over.id}.md`,
  content: '',
  isSaved: true,
  saveStatus: 'saved',
  viewMode: 'edit',
  ...over,
})

const stateOf = (tabs: ContentTab[]): PersistedEditorState => ({
  tabs,
  activeTabId: tabs[0]?.id ?? null,
  recentFiles: [],
})

const contentWrites = (ls: FakeStore) => ls.puts.filter((k) => k.startsWith(CONTENT_PREFIX))

// ---------- isRecoverableFromDisk ----------

test('isRecoverableFromDisk: 只有「已保存且知道落在哪个文件」才算磁盘上有副本', () => {
  assert.equal(isRecoverableFromDisk({ filePath: 'C:/a.md', saveStatus: 'saved' }), true)
  assert.equal(isRecoverableFromDisk({ filePath: 'C:/a.md', saveStatus: 'just-saved' }), true)
  assert.equal(isRecoverableFromDisk({ filePath: 'C:/a.md', saveStatus: 'unsaved' }), false)
  // 未命名文档：没有任何磁盘副本，丢了就是真丢了
  assert.equal(isRecoverableFromDisk({ filePath: null, saveStatus: 'saved' }), false)
  assert.equal(mustCacheContent({ filePath: 'C:/a.md', saveStatus: 'unsaved' }), true)
  assert.equal(mustCacheContent({ filePath: 'C:/a.md', saveStatus: 'saved' }), false)
})

// ---------- planEditorStorage ----------

test('planEditorStorage: 只有正文真正变化的标签页才写（写入放大的根因）', () => {
  const a = tab({ id: 'a', content: 'A2' })
  const b = tab({ id: 'b', content: 'B1' })
  const c = tab({ id: 'c', content: 'C1' })
  const prev = new Map([['a', 'A1'], ['b', 'B1'], ['c', 'C1']])
  const plan = planEditorStorage(prev, [a, b, c], false)
  assert.deepEqual(plan.writes.map((w) => w.id), ['a'])
  assert.deepEqual(plan.deletes, [])
})

test('planEditorStorage: 内容键里的值一样就不重写（同一份字符串引用，比较是 O(1)）', () => {
  const a = tab({ id: 'a', content: 'A' })
  const plan = planEditorStorage(new Map([['a', 'A']]), [a], false)
  assert.deepEqual(plan.writes, [])
})

test('planEditorStorage: 已关闭的标签页与上次写入留下的孤儿键都要删掉', () => {
  const a = tab({ id: 'a', content: 'A' })
  const prev = new Map([['a', 'A'], ['gone', 'X'], ['orphan', null]])
  const plan = planEditorStorage(prev, [a], false)
  assert.deepEqual(plan.deletes.map((d) => d.id).sort(), ['gone', 'orphan'])
})

test('planEditorStorage: 降级后不再缓存「磁盘上已有副本」的正文，并删掉旧键', () => {
  const clean = tab({ id: 'clean', content: 'C' })
  const dirty = tab({ id: 'dirty', content: 'D', saveStatus: 'unsaved', isSaved: false })
  const prev = new Map([['clean', 'C'], ['dirty', 'D']])
  const plan = planEditorStorage(prev, [clean, dirty], true)
  assert.deepEqual(plan.writes, [])                       // 两者都没变
  assert.deepEqual(plan.deletes.map((d) => d.id), ['clean']) // 只有可省的被放弃
  assert.deepEqual(plan.skipped, ['clean'])

  // 降级后未保存的正文**必须**继续写
  const changed = { ...dirty, content: 'D2' }
  const plan2 = planEditorStorage(prev, [clean, changed], true)
  assert.deepEqual(plan2.writes.map((w) => w.id), ['dirty'])
})

test('planEditorStorage: 正文待恢复（content=null）时不写，并清掉可能残留的旧键', () => {
  const pending = tab({ id: 'a', content: null })
  const plan = planEditorStorage(new Map([['a', '旧正文']]), [pending], false)
  assert.deepEqual(plan.writes, [])
  assert.deepEqual(plan.deletes.map((d) => d.id), ['a'])
  assert.deepEqual(plan.skipped, ['a'])
})

// ---------- buildMetaTabs ----------

test('buildMetaTabs: 内容键里已有同一份正文，清单里就不再重复留一份', () => {
  const a = tab({ id: 'a', content: 'A' })
  const meta = buildMetaTabs([a], new Map([['a', 'A']]))
  assert.equal(meta[0].content, null)
})

test('buildMetaTabs: 内容键不可用且这份正文「必须缓存」时，内嵌进清单兜底（不丢正文）', () => {
  const dirty = tab({ id: 'dirty', content: 'D', saveStatus: 'unsaved', isSaved: false })
  const meta = buildMetaTabs([dirty], new Map())
  assert.equal(meta[0].content, 'D')
})

test('buildMetaTabs: 可省正文（已保存）没写成就不留，它本来就在磁盘上', () => {
  const clean = tab({ id: 'clean', content: 'C' })
  const meta = buildMetaTabs([clean], new Map())
  assert.equal(meta[0].content, null)
})

// ---------- 适配器：正常读写 ----------

test('setItem → getItem：正文与元信息完整往返，且按标签页拆键', () => {
  const ls = new FakeStore()
  const storage = createEditorStorage(() => ls)
  const tabs = [
    tab({ id: 'a', content: 'A' }),
    tab({ id: 'b', content: 'B', remote: { path: '/Notes/b.md', etag: 'e1' } }),
  ]
  storage.setItem(META_KEY, { state: stateOf(tabs), version: 0 })

  // 正文在各自的键里，清单里不再重复
  assert.equal(ls.getItem(CONTENT_PREFIX + 'a'), 'A')
  assert.equal(ls.getItem(CONTENT_PREFIX + 'b'), 'B')
  const meta = JSON.parse(ls.getItem(META_KEY)!)
  assert.deepEqual(meta.state.tabs.map((t: ContentTab) => t.content), [null, null])

  const got = storage.getItem(META_KEY)
  assert.equal(got!.state.tabs[0].content, 'A')
  assert.equal(got!.state.tabs[1].content, 'B')
  assert.deepEqual(got!.state.tabs[1].remote, { path: '/Notes/b.md', etag: 'e1' })
})

test('getItem: 正文键缺失 ⇒ content=null（交给界面从磁盘恢复，而不是假装是空文档）', () => {
  const ls = new FakeStore()
  const storage = createEditorStorage(() => ls)
  const meta = { state: { tabs: [{ ...tab({ id: 'a' }), content: null }], activeTabId: 'a', recentFiles: [] }, version: 0 }
  ls.setItem(META_KEY, JSON.stringify(meta))

  const got = storage.getItem(META_KEY)
  assert.equal(got!.state.tabs[0].content, null)
})

test('getItem: 旧版布局（正文内嵌在清单里）自动迁移到独立内容键', () => {
  const ls = new FakeStore()
  const storage = createEditorStorage(() => ls)
  const legacy = { state: stateOf([tab({ id: 'a', content: 'LEGACY' })]), version: 0 }
  ls.setItem(META_KEY, JSON.stringify(legacy))

  const got = storage.getItem(META_KEY)
  assert.equal(got!.state.tabs[0].content, 'LEGACY')
  assert.equal(ls.getItem(CONTENT_PREFIX + 'a'), 'LEGACY')
})

test('removeItem: 清单与所有内容键一并清掉', () => {
  const ls = new FakeStore()
  const storage = createEditorStorage(() => ls)
  storage.setItem(META_KEY, { state: stateOf([tab({ id: 'a', content: 'A' })]), version: 0 })
  storage.removeItem(META_KEY)
  assert.equal(ls.getItem(META_KEY), null)
  assert.equal(ls.getItem(CONTENT_PREFIX + 'a'), null)
  assert.equal(ls.length, 0)
})

test('没有 localStorage 的环境（Node/禁用存储）下全部静默跳过，不抛错', () => {
  const storage = createEditorStorage(() => null)
  assert.equal(storage.getItem(META_KEY), null)
  storage.setItem(META_KEY, { state: stateOf([tab({ id: 'a', content: 'A' })]), version: 0 })
  storage.removeItem(META_KEY)
})

// ---------- 适配器：配额耗尽 ----------

test('配额耗尽：先放弃「磁盘上已有副本」的正文，未保存的正文照旧落盘', () => {
  const ls = new FakeStore()
  const storage = createEditorStorage(() => ls)
  const clean = tab({ id: 'clean', content: 'x'.repeat(400) })
  const dirty = tab({ id: 'dirty', content: 'y'.repeat(20), saveStatus: 'unsaved', isSaved: false })

  // 正常写一次：两份正文都缓存了
  storage.setItem(META_KEY, { state: stateOf([clean, dirty]), version: 0 })
  assert.ok(ls.getItem(CONTENT_PREFIX + 'clean'))
  assert.ok(ls.getItem(CONTENT_PREFIX + 'dirty'))

  // 收紧预算到「再写不下 clean 这份大正文」，并让 clean 的正文发生变化（触发写入）
  ls.budget = ls.size() - 50
  storage.setItem(META_KEY, {
    state: stateOf([{ ...clean, content: 'x'.repeat(500) }, { ...dirty, content: 'y'.repeat(30) }]),
    version: 0,
  })

  // 可省的正文被放弃（它的权威副本在磁盘上），未保存的正文保住了
  assert.equal(ls.getItem(CONTENT_PREFIX + 'clean'), null)
  assert.equal(ls.getItem(CONTENT_PREFIX + 'dirty'), 'y'.repeat(30))

  const warning = getLastEditorStorageWarning()
  assert.equal(warning?.level, 'degraded')
  assert.ok((warning?.evicted ?? 0) >= 1)
})

test('配额耗尽且腾不出空间：未保存的正文退回「内嵌在清单里」，并升级为 lost 报警', () => {
  const ls = new FakeStore()
  const storage = createEditorStorage(() => ls)
  storage.setItem(META_KEY, {
    state: stateOf([tab({ id: 'dirty', content: 'D', saveStatus: 'unsaved', isSaved: false })]),
    version: 0,
  })

  // 正文长到 21 个字符：增量（20）超过 10 的余量 ⇒ 独立正文键写不下；
  // 但失败时会清掉旧键（省下 29+1 个字符），改内嵌只多 21+2-4 个字符 ⇒ 清单仍放得下
  ls.budget = ls.size() + 10
  storage.setItem(META_KEY, {
    state: stateOf([tab({ id: 'dirty', content: 'y'.repeat(21), saveStatus: 'unsaved', isSaved: false })]),
    version: 0,
  })

  assert.equal(getLastEditorStorageWarning()?.level, 'lost')
  assert.equal(ls.getItem(CONTENT_PREFIX + 'dirty'), null)      // 独立键确实写不进去
  const meta = JSON.parse(ls.getItem(META_KEY)!)
  assert.equal(meta.state.tabs[0].content, 'y'.repeat(21))      // 只好内嵌进清单，正文不丢
})

test('降级只报一次；升级严重程度时才再报一次', () => {
  const ls = new FakeStore()
  const storage = createEditorStorage(() => ls)
  const seen: string[] = []
  onEditorStorageWarning((w) => seen.push(w.level))

  const clean = () => tab({ id: 'clean', content: 'x'.repeat(400) })
  const dirty = (content: string) => tab({ id: 'dirty', content, saveStatus: 'unsaved', isSaved: false })

  storage.setItem(META_KEY, { state: stateOf([clean(), dirty('D1')]), version: 0 })
  assert.deepEqual(seen, [])

  ls.budget = ls.size() - 50
  storage.setItem(META_KEY, { state: stateOf([{ ...clean(), content: 'x'.repeat(500) }, dirty('D2')]), version: 0 })
  assert.deepEqual(seen, ['degraded'])

  // 降级后只剩「必须缓存」的正文还会尝试写入；它再失败就是真丢内容 ⇒ 升级为 lost 并再报一次
  storage.setItem(META_KEY, { state: stateOf([clean(), dirty('y'.repeat(1000))]), version: 0 })
  assert.deepEqual(seen, ['degraded', 'lost'])

  // 继续同类失败：不再重复轰炸（配额满时每个字符都会失败，反复报只会让用户学会无视它）
  storage.setItem(META_KEY, { state: stateOf([clean(), dirty('y'.repeat(2000))]), version: 0 })
  assert.deepEqual(seen, ['degraded', 'lost'])
})

// ---------- 适配器：清单写失败（用户实测路径） ----------

test('清单写失败同样按配额耗尽处理：降级 + 腾空间重试，并把降级报给界面', () => {
  const ls = new FakeStore()
  const storage = createEditorStorage(() => ls)
  const clean = tab({ id: 'clean', content: 'x'.repeat(400) })
  const dirty = tab({ id: 'dirty', content: 'D', saveStatus: 'unsaved', isSaved: false })
  storage.setItem(META_KEY, { state: stateOf([clean, dirty]), version: 0 })
  assert.ok(ls.getItem(CONTENT_PREFIX + 'clean'))
  assert.ok(ls.getItem(CONTENT_PREFIX + 'dirty'))
  assert.equal(getLastEditorStorageWarning(), null)

  // 正文挤得下、只有清单挤不下
  ls.failFor = (k) => k === META_KEY
  storage.setItem(META_KEY, { state: stateOf([clean, { ...dirty, content: 'D2' }]), version: 0 })

  // 放弃可省正文换来空间；未保存的正文照旧落盘
  assert.equal(ls.getItem(CONTENT_PREFIX + 'clean'), null)
  assert.equal(ls.getItem(CONTENT_PREFIX + 'dirty'), 'D2')
  const warning = getLastEditorStorageWarning()
  assert.equal(warning?.level, 'degraded')
  assert.equal(warning?.evicted, 1)
})

test('清单写失败不再逐字符刷日志（配额满时曾把控制台刷爆）', () => {
  const ls = new FakeStore()
  const storage = createEditorStorage(() => ls)
  const dirty = tab({ id: 'dirty', content: 'D', saveStatus: 'unsaved', isSaved: false })
  storage.setItem(META_KEY, { state: stateOf([dirty]), version: 0 })

  const errors: unknown[][] = []
  const warns: unknown[][] = []
  const origError = console.error
  const origWarn = console.warn
  console.error = (...args: unknown[]) => { errors.push(args) }
  console.warn = (...args: unknown[]) => { warns.push(args) }
  try {
    ls.failFor = () => true
    for (let i = 0; i < 20; i++) {
      storage.setItem(META_KEY, { state: stateOf([{ ...dirty, content: 'D'.repeat(i + 2) }]), version: 0 })
    }
  } finally {
    console.error = origError
    console.warn = origWarn
  }

  assert.equal(errors.length, 1)  // 只把第一次写失败打进控制台
  assert.equal(warns.length, 1)   // 降级只报一次
  // 这份正文是未保存的、唯一副本，始终没能落盘 ⇒ 必须报成 lost（用户得自己按 Ctrl+S）
  assert.equal(getLastEditorStorageWarning()?.level, 'lost')
})

test('内嵌正文兜底有体积上限：大段正文不倒灌进清单（否则每次按键都要重写它）', () => {
  const dirty = (content: string) => tab({ id: 'dirty', content, saveStatus: 'unsaved', isSaved: false })
  const small = buildMetaTabs([dirty('x'.repeat(INLINE_CONTENT_LIMIT))], new Map())
  assert.equal(small[0].content, 'x'.repeat(INLINE_CONTENT_LIMIT))

  const big = buildMetaTabs([dirty('x'.repeat(INLINE_CONTENT_LIMIT + 1))], new Map())
  assert.equal(big[0].content, null)
})

// ---------- 适配器：界面里的「清理本地缓存」（状态栏 ⚠ 点开） ----------
// 这一组是「报警了却没有出路」那个洞的回归测试：配额满时用户必须能自己把空间要回来，
// 而且**清完不能立刻被填回去**（否则看起来像清理没用）。

test('usage: 统计整个存储（含别的应用写进来的键）的键数与字符数', () => {
  const ls = new FakeStore()
  const storage = createEditorStorage(() => ls)
  storage.setItem(META_KEY, { state: stateOf([tab({ id: 'a', content: 'A' })]), version: 0 })
  // 占用算的是整个来源：别的应用/测试残留的键同样吃掉配额，界面上的数字必须如实反映
  ls.setItem('filler', 'x'.repeat(100))

  const usage = storage.usage()
  assert.equal(usage!.keys, 3)
  assert.equal(usage!.chars, ls.size())

  // 没有存储（Node、WebView2 禁用存储）时不报错，返回 null 由界面自己兜底
  assert.equal(createEditorStorage(() => null).usage(), null)
})

test('dropRecoverableContent: 只清「磁盘上有副本」的正文，未保存的正文一个不动', () => {
  const ls = new FakeStore()
  const storage = createEditorStorage(() => ls)
  const clean = tab({ id: 'clean', content: 'C', saveStatus: 'saved' })
  const dirty = tab({ id: 'dirty', content: 'D', saveStatus: 'unsaved', isSaved: false })
  storage.setItem(META_KEY, { state: stateOf([clean, dirty]), version: 0 })

  const result = storage.dropRecoverableContent()
  assert.equal(result!.removed, 1)
  assert.ok(result!.freedChars > 0)

  assert.equal(ls.getItem(CONTENT_PREFIX + 'clean'), null)
  // 唯一副本：动了就是真丢数据
  assert.equal(ls.getItem(CONTENT_PREFIX + 'dirty'), 'D')
  // 清单不动：标签页列表还在，只是这一页的正文交给界面从磁盘恢复
  const got = storage.getItem(META_KEY)
  assert.equal(got!.state.tabs.find((t) => t.id === 'clean')!.content, null)
  assert.equal(got!.state.tabs.find((t) => t.id === 'dirty')!.content, 'D')
})

test('dropRecoverableContent: 清单里不认识的键不动（可能是唯一副本）', () => {
  const ls = new FakeStore()
  const storage = createEditorStorage(() => ls)
  storage.setItem(META_KEY, { state: stateOf([tab({ id: 'clean', content: 'C' })]), version: 0 })
  // 清单写入失败时会留下这种「看起来像孤儿」的正文键，它可能正是一篇未保存内容的唯一副本
  ls.setItem(CONTENT_PREFIX + 'ghost', 'G')

  storage.dropRecoverableContent()
  assert.equal(ls.getItem(CONTENT_PREFIX + 'ghost'), 'G')
})

test('dropRecoverableContent: 清理后不会把刚腾出的空间又填回去（进入降级）', () => {
  const ls = new FakeStore()
  const storage = createEditorStorage(() => ls)
  const clean = tab({ id: 'clean', content: 'C', saveStatus: 'saved' })
  storage.setItem(META_KEY, { state: stateOf([clean]), version: 0 })
  storage.dropRecoverableContent()

  // 再写一次（正文没变）。不进入降级的话，`known` 里已经没有这个键，
  // 会被当成「正文变了」而重写 —— 用户点完清理空间一点没多出来
  storage.setItem(META_KEY, { state: stateOf([clean]), version: 0 })
  assert.equal(ls.getItem(CONTENT_PREFIX + 'clean'), null)

  // 但「必须缓存」的正文（未保存/未命名）依旧要落盘
  const dirty = tab({ id: 'dirty', content: 'D', saveStatus: 'unsaved', isSaved: false })
  storage.setItem(META_KEY, { state: stateOf([clean, dirty]), version: 0 })
  assert.equal(ls.getItem(CONTENT_PREFIX + 'dirty'), 'D')
})

test('clearAll: 清单与全部正文键一起清掉；未保存的正文会在下一次写入时重新落盘', () => {
  const ls = new FakeStore()
  const storage = createEditorStorage(() => ls)
  const clean = tab({ id: 'clean', content: 'C' })
  const dirty = tab({ id: 'dirty', content: 'D', saveStatus: 'unsaved', isSaved: false })
  storage.setItem(META_KEY, { state: stateOf([clean, dirty]), version: 0 })

  const result = storage.clearAll()
  assert.equal(result!.removed, 3) // 两个正文键 + 清单
  assert.equal(ls.length, 0)

  // `known` 也清了 ⇒ 不能缓存的正文必须重建，否则「清空」等于把未保存内容一起丢掉
  storage.setItem(META_KEY, { state: stateOf([clean, dirty]), version: 0 })
  assert.equal(ls.getItem(CONTENT_PREFIX + 'dirty'), 'D')
  assert.equal(ls.getItem(CONTENT_PREFIX + 'clean'), null)
})

test('resetEditorStorageWarning: 复位「每级只报一次」，之后写失败会重新报警', () => {
  const ls = new FakeStore()
  const storage = createEditorStorage(() => ls)
  const seen: EditorStorageWarning[] = []
  onEditorStorageWarning((w) => seen.push(w))

  const meta = (content: string) => ({
    state: stateOf([tab({ id: 'a', content, saveStatus: 'unsaved', isSaved: false })]),
    version: 0,
  })
  // 只让清单写失败：正文挤得下、清单挤不下，是配额快满时真实会出现的组合
  ls.failFor = (k) => k === META_KEY

  storage.setItem(META_KEY, meta('A1'))
  assert.equal(seen.length, 1)
  storage.setItem(META_KEY, meta('A2'))
  assert.equal(seen.length, 1)

  resetEditorStorageWarning()
  assert.equal(getLastEditorStorageWarning(), null)
  storage.setItem(META_KEY, meta('A3'))
  // 用户在界面里清理完缓存后：订阅者还在，且再撞上配额满必须重新收到提示
  assert.equal(seen.length, 2)
})
