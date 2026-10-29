/**
 * 剪贴板 → Markdown（lib/clipboardMarkdown.ts）。
 *
 * 守三类真实来源：
 *   1. 网页富文本（标题/段落/嵌套列表/表格/代码/引用/链接）；
 *   2. Word 剪贴板（CF_HTML 头、MsoHeading、mso-list 多级列表、&nbsp;、file:// 图片）；
 *   3. 决策与落点（纯 Markdown 源不拦截、块级内容粘贴到行中/行尾自动补空行）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  convertHtmlToMarkdown,
  decideClipboardPaste,
  extractHtmlFragment,
  looksLikeMarkdownSource,
  materializeLocalImages,
  normalizeMarkdown,
  planPasteInsert,
} from '../src/lib/clipboardMarkdown.ts'

test('网页：标题/段落/粗体/链接/引用/代码/表格', () => {
  const md = convertHtmlToMarkdown(`
    <h1>大标题</h1>
    <p>第一段 <strong>粗体</strong> 与 <a href="https://example.com">链接</a>。</p>
    <h2>小节</h2>
    <blockquote><p>引用内容</p></blockquote>
    <pre><code class="language-js">const a = 1;</code></pre>
    <table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>
  `)
  assert.match(md, /^# 大标题$/m)
  assert.match(md, /^## 小节$/m)
  assert.match(md, /\*\*粗体\*\*/)
  assert.match(md, /\[链接\]\(https:\/\/example\.com\)/)
  assert.match(md, /^> 引用内容$/m)
  assert.match(md, /```js\nconst a = 1;\n```/)
  assert.match(md, /^\| A   \| B   \|$/m)
  assert.match(md, /^\| --- \| --- \|$/m)
  // 块之间必须有空行，标题不能被顶进上一行
  assert.ok(!/。\n# /m.test(md))
})

test('网页：无序/有序嵌套列表逐项成行且保留层级', () => {
  const md = convertHtmlToMarkdown(
    '<ul><li>甲</li><li>乙<ul><li>乙一</li><li>乙二</li></ul></li></ul><ol><li>一</li><li>二</li></ol>',
  )
  assert.match(md, /^- 甲$/m)
  assert.match(md, /^- 乙$/m)
  assert.match(md, /^  - 乙一$/m)
  assert.match(md, /^  - 乙二$/m)
  assert.match(md, /^1\. 一$/m)
  assert.match(md, /^2\. 二$/m)
  assert.ok(!/- 甲- 乙/.test(md))
})

test('CF_HTML：去掉头部与 Fragment 标记，只留正文', () => {
  const raw = [
    'Version:0.9',
    'StartHTML:0000000105',
    'EndHTML:0000000200',
    'StartFragment:0000000140',
    'EndFragment:0000000180',
    '<!--StartFragment--><h2>标题</h2><p>正文</p><!--EndFragment-->',
  ].join('\r\n')
  const fragment = extractHtmlFragment(raw)
  assert.ok(!fragment.includes('StartHTML'))
  assert.ok(fragment.includes('<h2>标题</h2>'))
  assert.equal(convertHtmlToMarkdown(raw), '## 标题\n\n正文')
})

test('Word：MsoHeading 与 mso-list 多级/编号列表', () => {
  const html = `
    <html><head><meta name=ProgId content=Word.Document></head><body>
    <p class=MsoHeading1>文档标题</p>
    <p style='mso-list:l0 level1 lfo1'><![if !supportLists]><span>•<span>&nbsp;&nbsp; </span></span><![endif]>列表项一</p>
    <p style='mso-list:l0 level2 lfo1'><![if !supportLists]><span>–<span>&nbsp;&nbsp; </span></span><![endif]>嵌套项</p>
    <p style='mso-list:l0 level1 lfo1'><![if !supportLists]><span>•<span>&nbsp;&nbsp; </span></span><![endif]>列表项二</p>
    <p>普通段落</p>
    <p style='mso-list:l1 level1 lfo2'><![if !supportLists]><span>1.<span>&nbsp;&nbsp; </span></span><![endif]>编号项</p>
    </body></html>
  `
  const md = convertHtmlToMarkdown(html)
  assert.match(md, /^# 文档标题$/m)
  assert.match(md, /^- 列表项一$/m)
  assert.match(md, /^  - 嵌套项$/m)
  assert.match(md, /^- 列表项二$/m)
  assert.match(md, /^普通段落$/m)
  assert.match(md, /^1\. 编号项$/m)
  // 列表项之间不能粘连（每一行最多只含一个列表项文字）
  assert.ok(!md.split('\n').some((line) => line.includes('列表项一') && line.includes('列表项二')))
})

test('Word：file:// 图片写成占位 token，可由调用方读成 data URL', async () => {
  const md = convertHtmlToMarkdown(
    '<p>图：<img src="file:///C:/tmp/a.png" alt="本地图"> 与 <img src="https://example.com/b.png" alt="网络图"></p>',
  )
  assert.match(md, /!\[本地图\]\(<yizi-local-image:[^>]+>\)/)
  assert.match(md, /!\[网络图\]\(https:\/\/example\.com\/b\.png\)/)

  const ok = await materializeLocalImages(md, async () => 'data:image/png;base64,AAAA')
  assert.match(ok, /!\[本地图\]\(data:image\/png;base64,AAAA\)/)
  assert.match(ok, /!\[网络图\]\(https:\/\/example\.com\/b\.png\)/)

  // 读不到（临时文件已被清理）时退回 alt 文本，不留坏链接
  const fail = await materializeLocalImages(md, async () => {
    throw new Error('missing')
  })
  assert.equal((fail.match(/yizi-local-image/g) || []).length, 0)
  assert.match(fail, /本地图/)
})

test('Word/WPS：没有 thead 的表格不再多出空表头', () => {
  const md = convertHtmlToMarkdown(
    '<table><tr><td>表头1</td><td>表头2</td></tr><tr><td>值1</td><td>值2</td></tr></table>',
  )
  assert.ok(!/^[ \t]*\|[ \t]*\|[ \t]*\|$/m.test(md), '出现空表头行: ' + md)
  assert.match(md, /^\| 表头1 \| 表头2 \|$/m)
  assert.match(md, /^\| --- \| --- \|$/m)
  assert.match(md, /^\| 值1\s+\| 值2\s+\|$/m)
})

test('上标/下标：保留语义，Word 脚注引用不再留下 `[2]`', () => {
  // HTML 原生 sup/sub
  assert.equal(convertHtmlToMarkdown('<p>E=mc<sup>2</sup></p>'), 'E=mc<sup>2</sup>')
  assert.equal(convertHtmlToMarkdown('<p>H<sub>2</sub>O</p>'), 'H<sub>2</sub>O')
  // 上标里的引用编号 [2] → <sup>2</sup>
  assert.equal(convertHtmlToMarkdown('<p>结论<sup>[2]</sup></p>'), '结论<sup>2</sup>')
  // CSS vertical-align
  assert.equal(
    convertHtmlToMarkdown('<p>平方<span style="vertical-align:super">2</span></p>'),
    '平方<sup>2</sup>',
  )
  assert.equal(
    convertHtmlToMarkdown('<p>水<span style="vertical-align:sub">2</span></p>'),
    '水<sub>2</sub>',
  )

  // Word 脚注引用（span + a 两种常见形态）
  const spanForm =
    '<p>正文<span style="mso-special-character:footnote">[1]</span>继续</p>'
  assert.equal(convertHtmlToMarkdown(spanForm), '正文<sup>1</sup>继续')

  // Word 的 mso-text-raise / MsoFootnoteReference 形态
  assert.equal(
    convertHtmlToMarkdown('<p>正文<span style="mso-text-raise:4.0pt">[3]</span></p>'),
    '正文<sup>3</sup>',
  )
  assert.equal(
    convertHtmlToMarkdown('<p>正文<span class=MsoFootnoteReference>[3]</span></p>'),
    '正文<sup>3</sup>',
  )

  const anchorForm =
    '<p>正文<a href="#_ftn1" name="_ftnref1" style="mso-footnote-id:ftn1">' +
    '<span class=MsoFootnoteReference><span style="mso-special-character:footnote">[1]</span></span></a>继续</p>'
  const md = convertHtmlToMarkdown(anchorForm)
  assert.equal(md, '正文<sup>1</sup>继续')
  // 不能生成没有定义的 Markdown 脚注引用
  assert.ok(!/\[\^1\]/.test(md))
})

test('只有内联富文本（span + sup）也要拦截转换', () => {
  // 真实 DOCX 选区的 CF_HTML 可能只有一个 <span>，块级标签一个都没有；
  // 若按「没有 p/div 就不转换」处理，上标会退化成纯文本 `[3]`。
  const r = decideClipboardPaste('<span>正文<sup>[3]</sup>继续</span>', '正文[3]继续')
  assert.equal(r.intercept, true)
  assert.equal(r.text, '正文<sup>3</sup>继续')

  // 只有 span 且没有语义标签：仍然走原生粘贴
  const plain = decideClipboardPaste('<span style="color:red">纯文本</span>', '纯文本')
  assert.equal(plain.intercept, false)
})

test('WPS：大字号加粗段落识别为标题，负缩进项目符识别为多级列表', () => {
  const md = convertHtmlToMarkdown(`
    <p style="font-size:16pt;font-weight:bold">文档标题</p>
    <p style="font-size:10.5pt">正文</p>
    <p style="margin-left:21pt;text-indent:-21pt">•&nbsp;&nbsp;项目一</p>
    <p style="margin-left:21pt;text-indent:-21pt">•&nbsp;&nbsp;项目二</p>
    <p style="margin-left:42pt;text-indent:-21pt">–&nbsp;&nbsp;嵌套</p>
  `)
  assert.match(md, /^# 文档标题$/m)
  assert.match(md, /^正文$/m)
  assert.match(md, /^- 项目一$/m)
  assert.match(md, /^- 项目二$/m)
  assert.match(md, /^  - 嵌套$/m)
  // 10.5pt 的加粗正文不能被当成标题
  const body = convertHtmlToMarkdown('<p style="font-size:10.5pt;font-weight:bold">这是正文</p>')
  assert.ok(!body.startsWith('#'))
})

test('纯文本已是 Markdown 源时不拦截（Obsidian / VS Code）', () => {
  assert.equal(looksLikeMarkdownSource('# 标题\n\n正文\n\n- 列表'), true)
  assert.equal(looksLikeMarkdownSource('见 [文档](https://example.com)'), true)
  assert.equal(looksLikeMarkdownSource('```js\nconst a = 1\n```'), true)
  // Word 纯文本里的编号列表不算强信号，否则会放弃 HTML 结构
  assert.equal(looksLikeMarkdownSource('文档标题\n1. 第一项\n2. 第二项'), false)
})

test('决策：富文本拦截、纯 Markdown 源放行、只有装饰标签放行', () => {
  const r1 = decideClipboardPaste('<h1>标题</h1><p>正文</p>', '标题\n正文')
  assert.equal(r1.intercept, true)
  assert.match(r1.text, /^# 标题$/m)

  const r2 = decideClipboardPaste('<h1>标题</h1><p>正文</p>', '# 标题\n\n正文')
  assert.equal(r2.intercept, false)

  const r3 = decideClipboardPaste('<span style="color:red">纯文本</span>', '纯文本')
  assert.equal(r3.intercept, false)

  const r4 = decideClipboardPaste('<h1>只有 HTML</h1>', '')
  assert.equal(r4.intercept, true)
  assert.equal(r4.text, '# 只有 HTML')
})

test('落点：块级内容粘在行中补空行，行首/空行不重复补', () => {
  const doc = '上一段\n\n下一段'
  // 行中（「上一段」末尾）插入标题
  const mid = planPasteInsert(doc, 3, 3, '# 标题')
  assert.equal(mid, '\n\n# 标题')
  // 空行行首插入：上方已是空行，不额外补
  const emptyLine = planPasteInsert('上一段\n\n', 5, 5, '# 标题')
  assert.equal(emptyLine, '# 标题')
  // 段落行首（上一行有正文）：补一个换行形成空行
  const lineStart = planPasteInsert('上一段\n', 4, 4, '# 标题')
  assert.equal(lineStart, '\n# 标题')
  // 行内普通句子不补空行
  assert.equal(planPasteInsert(doc, 3, 3, '补充文字'), '补充文字')
  // 插入点后面还有文字：末尾补空行
  const withAfter = planPasteInsert('前文后文', 2, 2, '# 标题')
  assert.equal(withAfter, '\n\n# 标题\n\n')
})

test('规范化：压掉多余空行、保留嵌套缩进与硬换行', () => {
  const md = normalizeMarkdown('标题\n\n\n\n正文\n  - 嵌套\n行尾  ')
  assert.equal(md, '标题\n\n正文\n  - 嵌套\n行尾')
  // 恰好两个空格是硬换行，保留
  assert.equal(normalizeMarkdown('第一行  \n第二行'), '第一行  \n第二行')
  assert.equal(normalizeMarkdown('\n\n内容\n\n'), '内容')
})
