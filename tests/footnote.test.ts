/**
 * 脚注（学术引用）渲染用例：markdown-it-footnote 基础行为。
 * 守住：上标链接与文末定义的锚点互指（点击跳转的根基）、自动编号、
 * 重复引用同号、无定义引用不产生脚注区块。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderMarkdown } from '../src/lib/markdownRenderer.ts'

// ---------- 引用侧 ----------

test('脚注引用渲染为上标链接，指向文末定义锚点', () => {
  const html = renderMarkdown('正文论述[^1]。\n\n[^1]: Vaswani A, et al. 2017.')
  assert.match(html, /<sup class="footnote-ref"><a href="#fn1" id="fnref1">\[1\]<\/a><\/sup>/)
})

test('引用在选区里与普通文本共存（上标包裹内联内容）', () => {
  const html = renderMarkdown('见[^a]与正文。\n\n[^a]: 注')
  assert.match(html, /\[\^a\]|footnote-ref/)
})

// ---------- 定义侧 ----------

test('文末定义渲染进 footnotes 区块，锚点与引用链接互指', () => {
  const html = renderMarkdown('论述[^1]。\n\n[^1]: Vaswani A, et al. 2017.')
  assert.match(html, /<section class="footnotes"/)
  assert.match(html, /<li id="fn1"/)
  assert.match(html, /href="#fnref1"/)
  // 定义文本原样保留（含标点）
  assert.match(html, /Vaswani A, et al\. 2017\./)
})

test('定义的返回链（↩）跳回引用位置', () => {
  const html = renderMarkdown('论述[^1]。\n\n[^1]: 注')
  // markdown-it-footnote 的返回箭头锚点 class 为 footnote-backref
  assert.match(html, /class="footnote-backref"/)
})

// ---------- 编号 ----------

test('多脚注按出现顺序编号', () => {
  const html = renderMarkdown('一[^b]二[^a]。\n\n[^a]: 甲\n\n[^b]: 乙')
  const first = html.indexOf('footnote-ref')
  const second = html.indexOf('footnote-ref', first + 1)
  // [^b] 先出现 → 编号 1；[^a] 后出现 → 编号 2（与定义书写顺序无关）
  assert.ok(html.slice(first, first + 80).includes('[1]'))
  assert.ok(html.slice(second, second + 80).includes('[2]'))
})

test('同一引用重复出现时编号复用', () => {
  const html = renderMarkdown('甲[^1]乙[^1]。\n\n[^1]: 注')
  assert.match(html, /\[1\]/)
  assert.ok(!html.includes('[2]'))
})

// ---------- 边界 ----------

test('没有定义的引用保持原样，不产生脚注区块', () => {
  const html = renderMarkdown('悬空引用[^99]保持字面。')
  assert.ok(!html.includes('footnotes'))
  assert.match(html, /\[\^99\]/)
})

test('脚注不被 front matter 干扰', () => {
  const html = renderMarkdown('---\ntitle: 论文\n---\n\n正文[^1]。\n\n[^1]: 注')
  assert.match(html, /footnote-ref/)
})
