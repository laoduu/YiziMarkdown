/**
 * DOCX 导出前预处理。
 *
 * Rust 侧 `export_docx` 直接解析 Markdown，看不到预览 DOM。因此「预览里已经不是 Markdown」
 * 的内容必须在导出前落回可解析形式：
 *   · `[toc]` → TOC 域标记（域由 Rust 侧输出，见 toc.test.ts）；
 *   · ` ```mermaid ` → SVG data URL 图片（Mermaid 默认 htmlLabels 产生 foreignObject，
 *     resvg 不支持，所以导出侧单独渲染纯文本标签 SVG）。
 * 渲染失败必须保留原代码块，绝不能静默丢内容。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { replaceMermaidFences, prepareMarkdownForDocx, svgToDataUrl, DOCX_TOC_MARKER, inlineMarkersToHtml } from '../src/lib/docxPrepare.ts'

const MERMAID = '```mermaid\ngraph LR\nA-->B\n```\n'

test('mermaid 围栏替换为 SVG data URL 图片', async () => {
  const out = await replaceMermaidFences(MERMAID, async () => '<svg xmlns="http://www.w3.org/2000/svg"></svg>')
  assert.match(out, /^!\[Mermaid diagram\]\(data:image\/svg\+xml;base64,/, out)
  assert.ok(!out.includes('```mermaid'), out)
  // 解码后仍是原始 SVG
  const b64 = /base64,([^)]+)\)/.exec(out)?.[1] ?? ''
  assert.equal(Buffer.from(b64, 'base64').toString('utf8'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>')
})

test('渲染失败 / 返回空时保留原代码块', async () => {
  assert.equal(await replaceMermaidFences(MERMAID, async () => null), MERMAID)
  assert.equal(await replaceMermaidFences(MERMAID, async () => ''), MERMAID)
  assert.equal(await replaceMermaidFences(MERMAID, async () => { throw new Error('boom') }), MERMAID)
})

test('只处理 mermaid 围栏，其它语言与普通文本不动', async () => {
  const src = '```js\nconst a = 1\n```\n\n```mermaid\ngraph TD\n```\n'
  const out = await replaceMermaidFences(src, async () => '<svg></svg>')
  assert.ok(out.includes('```js\nconst a = 1\n```'), out)
  assert.match(out, /!\[Mermaid diagram\]/, out)
})

test('多处 mermaid 围栏全部替换', async () => {
  const out = await replaceMermaidFences(`${MERMAID}\n${MERMAID}`, async () => '<svg></svg>')
  assert.equal((out.match(/!\[Mermaid diagram\]/g) || []).length, 2, out)
})

test('未闭合的 mermaid 围栏原样保留', async () => {
  const src = '```mermaid\ngraph LR\n'
  assert.equal(await replaceMermaidFences(src, async () => '<svg></svg>'), src)
})

test('SVG data URL 使用 UTF-8 base64（中文标签不损坏）', () => {
  const url = svgToDataUrl('<svg><text>中文标签</text></svg>')
  const b64 = url.replace('data:image/svg+xml;base64,', '')
  assert.equal(Buffer.from(b64, 'base64').toString('utf8'), '<svg><text>中文标签</text></svg>')
})

test('完整预处理：目录换成 TOC 域标记，Mermaid 同时生效', async () => {
  const src = '# 标题\n\n[toc]\n\n```mermaid\ngraph LR\nA-->B\n```\n'
  const out = await prepareMarkdownForDocx(src, async () => '<svg></svg>')
  assert.ok(out.includes(DOCX_TOC_MARKER), out)
  assert.ok(!out.includes('[toc]'), out)
  assert.ok(!out.includes('```mermaid'), out)
  assert.match(out, /!\[Mermaid diagram\]/, out)
})

test('DOCX 预处理：^上标^ / ~下标~ / ==高亮== 落成 HTML，代码与公式不改写', () => {
  const out = inlineMarkersToHtml('x^2^ H~2~O ==重点== `a==b==` $x^2^$\n')
  assert.ok(out.includes('<sup>2</sup>'), out)
  assert.ok(out.includes('<sub>2</sub>'), out)
  assert.ok(out.includes('<mark>重点</mark>'), out)
  assert.ok(out.includes('a==b=='), out)
  assert.ok(out.includes('$x^2^$'), out)
  assert.ok(!inlineMarkersToHtml('1~5 与 64K~512K\n').includes('<sub>'), '区间被误转')
})

test('显式限制 3 级：只有 H4 时不生成 TOC 域', async () => {
  const src = '#### 太深的标题\n\n[toc]\n'
  const out = await prepareMarkdownForDocx(src, undefined, 3)
  assert.ok(!out.includes(DOCX_TOC_MARKER), out)
  assert.ok(out.includes('#### 太深的标题'), out)
})

test('默认收 1-6 级：只有 H4 也生成 TOC 域', async () => {
  const src = '#### 深标题\n\n[toc]\n'
  const out = await prepareMarkdownForDocx(src)
  assert.ok(out.includes(DOCX_TOC_MARKER), out)
})

test('不传 renderMermaid 时只处理目录，代码块保持原样', async () => {
  const out = await prepareMarkdownForDocx(MERMAID)
  assert.equal(out, MERMAID)
})
