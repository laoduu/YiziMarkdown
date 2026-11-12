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
import {
  replaceMermaidFences,
  prepareMarkdownForDocx,
  prepareMarkdownForPandoc,
  pandocTocField,
  svgToDataUrl,
  DOCX_TOC_MARKER,
} from '../src/lib/docxPrepare.ts'

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

test('DOCX 预处理：行内上下标/高亮原样交给 Rust（前端不再各写一套规则）', async () => {
  const src = 'x^2^ H~2~O ==重点== 区间 64K~512K、0~20 脚注[^1] 与 [^2]\n'
  const out = await prepareMarkdownForDocx(src)
  // 前端只做 toc / mermaid；标记本身原样保留，由 Rust 统一转换，避免规则漂移
  assert.ok(out.includes('x^2^'), out)
  assert.ok(out.includes('H~2~O'), out)
  assert.ok(out.includes('==重点=='), out)
  assert.ok(out.includes('64K~512K、0~20'), out)
  assert.ok(out.includes('[^1]'), out)
  assert.ok(!out.includes('<sup>'), out)
  assert.ok(!out.includes('<sub>'), out)
  assert.ok(!out.includes('<mark>'), out)
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

test('DOCX 预处理：提示块自定义标题写成 base64 占位注释', async () => {
  const src = '> [!TIP] 小技巧\n> 正文\n'
  const out = await prepareMarkdownForDocx(src)
  assert.equal(
    out,
    '> [!TIP]\n> <!--yizi:alert-title:5bCP5oqA5ben-->\n> 正文\n',
  )
})

test('DOCX 预处理：类型与标题之间没有空格也能识别', async () => {
  const src = '> [!IMPORTANT]重要提醒\n> 正文\n'
  const out = await prepareMarkdownForDocx(src)
  assert.equal(
    out,
    '> [!IMPORTANT]\n> <!--yizi:alert-title:6YeN6KaB5o+Q6YaS-->\n> 正文\n',
  )
})

test('DOCX 预处理：无标题的提示块保持原样，嵌套提示块同样写占位注释', async () => {
  const src = '> [!NOTE]\n> 正文\n\n> > [!WARNING] 小心\n'
  const out = await prepareMarkdownForDocx(src)
  assert.ok(out.includes('> [!NOTE]\n> 正文\n'), out)
  assert.ok(out.includes('> > [!WARNING]\n> > <!--yizi:alert-title:5bCP5b+D-->'), out)
})

test('DOCX 预处理：代码围栏里的提示块示例不被改写', async () => {
  const src = '```markdown\n> [!TIP] 小技巧\n```\n'
  assert.equal(await prepareMarkdownForDocx(src), src)
})

test('Pandoc 预处理：目录转成原位 Word TOC 域，提示块保持 Pandoc 原生语法', async () => {
  const src = '# 标题\n\n[toc]\n\n> [!TIP] 小技巧\n> 正文\n'
  const out = await prepareMarkdownForPandoc(src)
  assert.equal(out.includeToc, true)
  assert.ok(!out.markdown.includes('[toc]'), out.markdown)
  assert.ok(out.markdown.includes('```{=openxml}'), out.markdown)
  assert.ok(out.markdown.includes('TOC \\o "1-6" \\h \\z \\u'), out.markdown)
  assert.ok(out.markdown.includes('> [!TIP] 小技巧'), out.markdown)
  assert.ok(!out.markdown.includes('<!--yizi:'), out.markdown)
})

test('Pandoc TOC 域：使用本地化标题并转义 XML', () => {
  const block = pandocTocField('A & B', 3)
  assert.match(block, /TOC \\o "1-3"/)
  assert.match(block, /<w:t>A &amp; B<\/w:t>/)
})

test('Pandoc 预处理：普通带标题文档不自动生成目录', async () => {
  const out = await prepareMarkdownForPandoc('# 一级标题\n\n正文\n\n## 二级标题\n')
  assert.equal(out.includeToc, false)
  assert.ok(!out.markdown.includes('[toc]'), out.markdown)
})

test('Pandoc 预处理：代码块里的 [toc] 不启用目录', async () => {
  const src = '# 标题\n\n```markdown\n[toc]\n```\n'
  const out = await prepareMarkdownForPandoc(src)
  assert.equal(out.includeToc, false)
  assert.ok(out.markdown.includes('```markdown\n[toc]\n```'), out.markdown)
})

test('Pandoc 预处理：没有可用标题时不启用目录，仍清理占位行', async () => {
  const out = await prepareMarkdownForPandoc('#### 太深的标题\n\n[toc]\n', undefined, 3)
  assert.equal(out.includeToc, false)
  assert.ok(!out.markdown.includes('[toc]'), out.markdown)
})

test('Pandoc 预处理：Mermaid 渲染为图片，失败时保留代码块', async () => {
  const src = '# 标题\n\n```mermaid\ngraph LR\nA-->B\n```\n'
  const rendered = await prepareMarkdownForPandoc(src, async () => '<svg></svg>')
  assert.match(rendered.markdown, /!\[Mermaid diagram\]\(data:image\/svg\+xml;base64,/)

  const fallback = await prepareMarkdownForPandoc(MERMAID, async () => null)
  assert.equal(fallback.markdown, MERMAID)
})
