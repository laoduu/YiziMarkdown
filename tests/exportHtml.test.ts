/**
 * 导出文档组装（`src/lib/exportHtml.ts`）的回归测试。
 *
 * 钉住 0.3.5 里 PDF 导出的两条硬要求：
 * 1. **预览的排版现场必须搬进导出文档** —— 字体/字号/行高/列宽在预览里是内联在
 *    `.editor-content` 上的，设置变量在 `<html style>` 上；漏搬就退回主题默认字体字号。
 * 2. **纸面一律白底、暗色主题按亮色配色导出** —— PDF 不铺主题底色（与 Word 一致），
 *    因此打印时要去掉 `dark` 类，否则主题暗色变量会让正文变成浅色字。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildExportHtml } from '../src/lib/exportHtml.ts'

const base = {
  css: { base: '/* base */', math: '/* math */', theme: '/* theme */', user: '/* user */', outline: '/* outline */' },
  bodyHtml: '<h1 id="t">标题</h1>',
  bodyClass: 'editor-content prose prose-lg max-w-none theme-tech dark',
  bodyStyle: 'font-family: var(--font-preview); font-size: 20px; line-height: 2; max-width: 900px;',
  rootStyle: '--font-preview: MiSans, "Microsoft YaHei"; --preview-font-size: 20px;',
  theme: 'tech',
  isDark: true,
}

// ---------- 预览现场 ----------

test('把 <html> 上的 CSS 变量原样带进导出文档（设置面板的字体/字号不至于丢失）', () => {
  const html = buildExportHtml({ ...base, print: true })
  assert.match(html, /<html class="theme-tech" style="--font-preview/)
  assert.match(html, /--preview-font-size: 20px;/)
  // 属性里的引号必须转义，否则 style 属性会被截断
  assert.match(html, /&quot;Microsoft YaHei&quot;/)
  assert.doesNotMatch(html, /style="[^"]*"Microsoft YaHei"/)
})

test('把预览正文元素的内联样式带到导出正文（字号/行高/列宽与预览一致）', () => {
  const html = buildExportHtml({ ...base, print: true })
  assert.match(html, /<div class="editor-content prose prose-lg max-w-none theme-tech dark" style="font-family: var\(--font-preview\); font-size: 20px; line-height: 2; max-width: 900px;">/)
  assert.match(html, /<h1 id="t">标题<\/h1>/)
})

test('主题类同时落在 html 与 body 上（主题选择器两种写法都能命中）', () => {
  const html = buildExportHtml({ ...base })
  assert.match(html, /<html class="theme-tech dark"/)
  assert.match(html, /<body class="theme-tech dark">/)
})

test('打印时去掉 dark 类：暗色主题按主题自己的亮色配色导出（与 Word 一致）', () => {
  const html = buildExportHtml({ ...base, print: true })
  assert.match(html, /<html class="theme-tech"/)
  assert.match(html, /<body class="theme-tech">/)
  assert.doesNotMatch(html, /<html class="theme-tech dark"/)
  assert.doesNotMatch(html, /<body class="theme-tech dark">/)
})

// ---------- 打印样式（PDF） ----------

test('打印去掉页面背景与页面边框（主题把正文做成"卡片"时也不上纸）', () => {
  const html = buildExportHtml({ ...base, print: true })
  // 液态玻璃 Prism / Facebook 这类主题给 .editor-content 加了渐变底 + 圆角 + box-shadow 描边
  assert.match(html, /\.editor-content\{[^}]*background:none!important/)
  assert.match(html, /box-shadow:none!important/)
  assert.match(html, /border:none!important/)
  assert.match(html, /border-radius:0!important/)
  // 只清容器：代码块/表头/引用的局部底色还靠 print-color-adjust 照常打印
  assert.match(html, /print-color-adjust:exact/)
})

test('打印一律白底：亮色主题不铺主题底色，暗色主题也不印深色纸面', () => {
  const html = buildExportHtml({ ...base, print: true })
  assert.match(html, /html,body\{[^}]*background:#fff!important/)
  // 不能再用主题底色当纸面背景
  assert.doesNotMatch(html, /background(-color)?:\s*var\(--editor-bg\)/)
  // 但代码块/表头/引用的**局部**底色仍要照实打印
  assert.match(html, /print-color-adjust:exact/)
})

test('打印用 A4 + 18mm 页边距，与 Rust 侧 PrintSettings 保持一致', () => {
  const html = buildExportHtml({ ...base, print: true })
  assert.match(html, /@page\{size:A4;margin:18mm\}/)
})

test('打印有分页保护：标题不落页尾、代码/表格/公式不跨页断开', () => {
  const html = buildExportHtml({ ...base, print: true })
  assert.match(html, /break-after:avoid/)
  assert.match(html, /\.editor-content pre,\.editor-content table,\.editor-content blockquote/)
  assert.match(html, /break-inside:avoid/)
  assert.match(html, /display:table-header-group/)
})

test('打印时隐藏预览里的悬浮控件，并让代码块长行折行（纸面上没有横向滚动条）', () => {
  const html = buildExportHtml({ ...base, print: true })
  assert.match(html, /\.code-block-actions,\.code-block-lang,\.code-block-lang-input\{display:none!important\}/)
  assert.match(html, /white-space:pre-wrap!important/)
})

test('PDF 不带大纲侧栏，也不注入大纲样式', () => {
  const outline = { title: '目录', items: [{ level: 1, id: 't', text: '标题' }] }
  const html = buildExportHtml({ ...base, print: true, outline })
  assert.doesNotMatch(html, /export-toc/)
  assert.doesNotMatch(html, /\/\* outline \*\//)
})

// ---------- 独立 HTML ----------

test('HTML 导出带大纲侧栏，且不做打印专属设置', () => {
  const outline = { title: '目录', items: [{ level: 2, id: 't', text: '标题' }] }
  const html = buildExportHtml({ ...base, outline })
  assert.match(html, /<nav class="export-toc"><div class="export-toc-title">目录<\/div><a href="#t" style="--lv:2">标题<\/a><\/nav>/)
  assert.match(html, /\/\* outline \*\//)
  assert.doesNotMatch(html, /@page\{size:A4/)
  // 屏幕导出同样要解开应用 UI 的视口锁定，否则文档高度锁死、无法滚动
  assert.match(html, /html,body\{height:auto!important;overflow:visible!important\}/)
})

test('没有标题时不生成空大纲', () => {
  const html = buildExportHtml({ ...base, outline: { title: '目录', items: [] } })
  assert.doesNotMatch(html, /export-toc/)
})

// ---------- 转义 ----------

test('正文内的尖括号/& 不被二次转义（正文本身已是 HTML）', () => {
  const html = buildExportHtml({ ...base, print: true, bodyHtml: '<p>a &amp; b &lt;c&gt;</p>' })
  assert.match(html, /<p>a &amp; b &lt;c&gt;<\/p>/)
})
