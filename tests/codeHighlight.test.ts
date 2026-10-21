/**
 * DOCX 导出代码块语法高亮数据收集（lib/docxCodeHighlight.ts）的用例。
 *
 * 盯住四件事：
 *   · 键的规范化规则必须与 Rust 侧 `normalize_code()` / `code_key()` 一致（否则查表静默失效）
 *   · 片段拼接起来必须**正好等于**键里的代码（否则导出出来会多行/少字）
 *   · 类路径要带上祖先链（主题里有 `.hljs-meta .hljs-keyword` 这类后代选择器）
 *   · 预览在 `pre` 里注入的按钮/语言标签、以及被插件改成 `<div>` 的围栏（mermaid）
 *     都不能混进片段
 *
 * Node 里没有 DOM，这里用一组最小假 DOM 节点驱动收集函数（只实现收集函数真正用到的接口）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  codeHighlightKey,
  collectCodeHighlights,
  normalizeCodeText,
} from '../src/lib/docxCodeHighlight.ts'
import { renderMarkdown } from '../src/lib/markdownRenderer.ts'
import { relativeLuminance } from '../src/lib/docxPalette.ts'

// ---------- 最小假 DOM ----------

interface FakeComputedStyle {
  color: string
  fontWeight: string
  fontStyle: string
}

class FakeText {
  readonly nodeType = 3
  constructor(readonly nodeValue: string) {}
}

class FakeElement {
  readonly nodeType = 1
  readonly childNodes: Array<FakeElement | FakeText> = []
  readonly computed: Partial<FakeComputedStyle> = {}
  private readonly attrs: Record<string, string>

  constructor(readonly tagName: string, attrs: Record<string, string> = {}) {
    this.attrs = attrs
  }

  getAttribute(name: string): string | null {
    return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null
  }

  append(...nodes: Array<FakeElement | FakeText>): this {
    this.childNodes.push(...nodes)
    return this
  }

  get textContent(): string {
    return this.childNodes
      .map((n) => (n.nodeType === 3 ? (n as FakeText).nodeValue : n.textContent))
      .join('')
  }

  querySelectorAll(selector: string): FakeElement[] {
    const out: FakeElement[] = []
    const visit = (el: FakeElement): void => {
      for (const child of el.childNodes) {
        if (child.nodeType !== 1) continue
        const c = child as FakeElement
        if (matchesFake(c, selector)) out.push(c)
        visit(c)
      }
    }
    visit(this)
    return out
  }

  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null
  }
}

/** 只支持用例里出现的两种选择器：`pre.hljs` 与 `code`（元素名 + 可选类名） */
function matchesFake(el: FakeElement, selector: string): boolean {
  const m = /^([a-z]+)(?:\.([\w-]+))?$/.exec(selector)
  if (!m) throw new Error('假 DOM 不支持的 selector: ' + selector)
  if (el.tagName.toLowerCase() !== m[1]) return false
  if (!m[2]) return true
  return (el.getAttribute('class') || '').split(/\s+/).includes(m[2])
}

/** 真实 DOM 里 tagName 是大写；样式默认值取主题正文色（对应 `.hljs { color: var(--editor-text) }`） */
function el(tag: string, attrs: Record<string, string> = {}): FakeElement {
  return new FakeElement(tag.toUpperCase(), attrs)
}
function text(s: string): FakeText {
  return new FakeText(s)
}

globalThis.getComputedStyle = ((node: FakeElement) => ({
  color: 'rgb(36, 41, 47)',
  fontWeight: '400',
  fontStyle: 'normal',
  ...node.computed,
})) as unknown as typeof getComputedStyle

/** 造一棵与预览真实输出同构的树（`pre.hljs > code`，按钮在 `pre` 内、`code` 外） */
function buildPreview() {
  const root = el('div', { class: 'editor-content prose' })

  const pre1 = el('pre', { class: 'hljs', 'data-lang': 'rust' })
  const code1 = el('code', { class: 'language-rust' })
  const keyword = el('span', { class: 'hljs-keyword' })
  keyword.computed.color = 'rgb(207, 34, 46)'
  keyword.computed.fontWeight = '700'
  const str = el('span', { class: 'hljs-string' })
  str.computed.color = 'rgb(10, 48, 105)'
  str.computed.fontStyle = 'italic'
  const meta = el('span', { class: 'hljs-meta' })
  meta.computed.color = 'rgb(9, 105, 218)'
  const metaKeyword = el('span', { class: 'hljs-keyword' })
  metaKeyword.computed.color = 'rgb(130, 80, 223)'
  // 文本必须放在自己的 span 里（hljs 的真实输出：`<span class="hljs-keyword">let</span>`）
  keyword.append(text('let'))
  str.append(text('"hi"'))
  meta.append(text('meta'), metaKeyword)
  metaKeyword.append(text('@x'))
  code1.append(keyword, text(' s = '), str, text(';\n'), meta)
  code1.append(text('\n')) // 围栏内容末尾的换行：键与片段都要去掉
  pre1.append(code1)
  // 预览在 `pre` 里注入的悬浮按钮与语言标签（`Editor.tsx` 的代码块增强）
  const actions = el('div', { class: 'code-block-actions' })
  actions.append(el('button', { class: 'code-block-wrap-btn' }), text('换行'))
  const langLabel = el('b', { class: 'code-block-lang' })
  langLabel.append(text('Rust'))
  pre1.append(actions, langLabel)

  const pre2 = el('pre', { class: 'hljs', 'data-lang': 'auto' })
  const code2 = el('code')
  code2.append(text('plain\n'))
  pre2.append(code2)

  // mermaid 插件把围栏渲染成 div（不是 pre.hljs）：不得被当成代码块
  const mermaid = el('div', { class: 'mermaid', 'data-source': 'graph TD' })
  mermaid.append(text('graph TD'))
  // 没有 <code> 的 pre：跳过而不是崩溃
  const pre3 = el('pre', { class: 'hljs', 'data-lang': 'python' })

  root.append(pre1, pre2, mermaid, pre3)
  return root
}

// ---------- 用例 ----------

test('normalizeCodeText / codeHighlightKey: 与 Rust 侧规则一致', () => {
  // CRLF 与单独 CR 都算换行；末尾换行是语法产物，要去掉
  assert.equal(normalizeCodeText('a\r\nb\n\n'), 'a\nb')
  assert.equal(normalizeCodeText('a\rb'), 'a\nb')
  assert.equal(normalizeCodeText('\n\n'), '')
  assert.equal(normalizeCodeText('a\nb'), 'a\nb')
  // 键必须带分隔符，否则 ("a","bc") 与 ("ab","c") 会撞键
  assert.notEqual(codeHighlightKey('a', 'bc'), codeHighlightKey('ab', 'c'))
  assert.equal(codeHighlightKey('rust', 'x'), 'rust\u001fx')
})

test('collectCodeHighlights: 片段带祖先类路径，注入的按钮与标签不混入', () => {
  const payload = collectCodeHighlights(buildPreview() as unknown as ParentNode)
  const key = codeHighlightKey('rust', 'let s = "hi";\nmeta@x')
  assert.ok(Object.prototype.hasOwnProperty.call(payload.blocks, key), '未按 (语言, 代码) 建键: ' + Object.keys(payload.blocks).join(' | '))

  assert.deepEqual(payload.blocks[key], [
    ['hljs-keyword', 'let'],
    ['', ' s = '],
    ['hljs-string', '"hi"'],
    ['', ';\n'],
    ['hljs-meta', 'meta'],
    ['hljs-meta hljs-keyword', '@x'],
  ])

  // 预览注入的按钮/语言标签在 `code` 之外：绝不能进片段
  const allText = JSON.stringify(payload.blocks)
  assert.ok(!allText.includes('换行'), '悬浮按钮文字混进片段: ' + allText)
  assert.ok(!allText.includes('Rust'), '语言标签文字混进片段: ' + allText)
  assert.ok(!allText.includes('graph TD'), 'mermaid 图被当成代码块: ' + allText)
})

test('collectCodeHighlights: 片段拼接必须正好等于键里的代码', () => {
  const payload = collectCodeHighlights(buildPreview() as unknown as ParentNode)
  for (const [key, spans] of Object.entries(payload.blocks)) {
    const code = key.slice(key.indexOf('\u001f') + 1)
    assert.equal(
      spans.map((s) => s[1]).join(''),
      code,
      `片段文本与代码不一致（导出会多字/少字）: ${key}`,
    )
    assert.equal(spans[spans.length - 1][1].endsWith('\n'), false, '片段末尾仍带换行: ' + key)
  }
})

test('collectCodeHighlights: 无语言围栏按空语言建键，样式取自 computed style', () => {
  const payload = collectCodeHighlights(buildPreview() as unknown as ParentNode)
  const key = codeHighlightKey('', 'plain')
  assert.ok(Object.prototype.hasOwnProperty.call(payload.blocks, key), '自动检测的围栏未建键: ' + Object.keys(payload.blocks).join(' | '))
  assert.deepEqual(payload.blocks[key], [['', 'plain']])

  // 类路径 → 颜色/粗/斜：同一类名在不同祖先链下的颜色可以不同（主题里有后代选择器）
  assert.deepEqual(payload.styles['hljs-keyword'], { color: 'rgb(207, 34, 46)', bold: true, italic: false })
  assert.deepEqual(payload.styles['hljs-meta hljs-keyword'], { color: 'rgb(130, 80, 223)', bold: false, italic: false })
  assert.deepEqual(payload.styles['hljs-string'], { color: 'rgb(10, 48, 105)', bold: false, italic: true })
  // 空类路径（纯文本）以 <code> 为宿主：正文色、不加粗不斜
  assert.deepEqual(payload.styles[''], { color: 'rgb(36, 41, 47)', bold: false, italic: false })
  assert.equal(Object.keys(payload.styles).length, 5, '样式表混入了无关类: ' + Object.keys(payload.styles).join(', '))
})

/**
 * 暗色主题的白底适配：导出的 Word 页面恒为白底，而暗色主题的 token 是给深色页面配的亮色。
 * 照搬会得到「白纸上的荧光绿字」（与 v0.3.5 修的「暗色主题导出不可读」同一类问题）。
 */
test('collectCodeHighlights: 暗色主题把过亮的 token 压到白底可读，浅色主题保持原样', () => {
  const root = el('div', { class: 'editor-content' })
  const pre = el('pre', { class: 'hljs', 'data-lang': 'rust' })
  const code = el('code', { class: 'language-rust' })
  const kw = el('span', { class: 'hljs-keyword' })
  kw.computed.color = 'rgb(0, 255, 65)' // matrix 那种荧光绿
  kw.append(text('let'))
  code.append(kw)
  pre.append(code)
  root.append(pre)

  // 浅色主题：颜色原样带过去（预览与导出逐 token 一致）
  assert.equal(collectCodeHighlights(root).styles['hljs-keyword'].color, 'rgb(0, 255, 65)')

  // 暗色主题：压到白底可读的亮度，且保留色相（绿仍是主导通道）
  const dark = collectCodeHighlights(root, { isDark: true, baseColor: '#333333' })
  const hex = dark.styles['hljs-keyword'].color
  assert.match(hex, /^#[0-9a-f]{6}$/, '暗色主题下应归一成十六进制: ' + hex)
  const rgb = {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  }
  assert.ok(relativeLuminance(rgb) <= 0.31, `颜色仍过亮（白底不可读）: ${hex}`)
  assert.ok(rgb.g > rgb.r && rgb.g > rgb.b, '色相被改变: ' + hex)
  // 无着色片段（空白/标点）用 docx 侧算好的正文色（暗色主题下是白底等效的深灰）
  assert.equal(dark.styles[''].color, '#333333')
  // 片段与键不受影响（压暗只改颜色）
  assert.deepEqual(Object.keys(dark.blocks), Object.keys(collectCodeHighlights(root).blocks))
})

test('collectCodeHighlights: 取不到预览 DOM 时给出空表（导出走单色兜底）', () => {
  assert.deepEqual(collectCodeHighlights(null), { styles: {}, blocks: {} })
  assert.deepEqual(collectCodeHighlights(undefined), { styles: {}, blocks: {} })
  // 没有代码块的预览
  assert.deepEqual(collectCodeHighlights(el('div') as unknown as ParentNode), { styles: {}, blocks: {} })
})

/**
 * 收集器依赖的**预览 HTML 形状**：`pre.hljs > code`（语言来自 `<code class="language-*">`）。
 * Node 里没有 DOM，所以这条用例用**真实渲染器**的输出来钉住结构 —— 渲染器的围栏输出一旦改形状，
 * 收集器就会静默收不到任何代码块（导出悄悄退回单色），这样才能在 CI 里发现。
 */
test('预览围栏结构：pre.hljs > code[class=language-*]，缩进式代码块不高亮', () => {
  const html = renderMarkdown(
    '- 列表项：\n\n  ```python\n  def f(x):\n      return x\n  ```\n\n```\nno lang\n```\n\n    indented\n',
  )

  // 有语言：`<code class="language-python">`（收集器据此取语言，且与 Rust 侧取围栏 info 第一个词一致）
  assert.ok(/class="hljs"/.test(html), '围栏未渲染成 pre.hljs: ' + html)
  assert.ok(html.includes('data-lang="python"'), '缺少 data-lang: ' + html)
  const py = /<code class="language-python">([\s\S]*?)<\/code>/.exec(html)
  assert.ok(py, '缺少 <code class="language-python">: ' + html)
  // 片段文本（去标签、解实体）必须等于**去缩进后的围栏内容** —— pulldown-cmark 给 Rust 的也是这份
  const text = py[1]
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
  assert.equal(text.replace(/\n$/, ''), 'def f(x):\n    return x', '围栏内容（去缩进）不一致: ' + JSON.stringify(text))

  // 无语言：自动检测，`<code>` 不带 language-* ⇒ 收集器按空语言建键（Rust 侧 info 也是空）
  assert.ok(html.includes('data-lang="auto"'), '缺少 data-lang="auto": ' + html)

  // 缩进式代码块预览**不跑** highlight（没有 hljs 类）⇒ 收集器跳过、导出保持单色，两边一致
  const indented = /<pre([^>]*)><code>indented/.exec(html)
  assert.ok(indented, '缩进式代码块结构变了: ' + html)
  assert.ok(!indented[1].includes('hljs'), '缩进式代码块被当成高亮块: ' + indented[0])
})
