/**
 * 保存默认文件名推导（lib/docTitle.ts）的边界用例。
 * 优先级：元信息 title → 第一个 ATX 标题行 → null（调用方回落 untitled.md）。
 * 重点守住：Windows 非法字符清洗、保留名回落、码点安全截断、
 * 非标题首行（代码围栏/表格/URL）绝不入名。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveDocumentTitle } from '../src/lib/docTitle.ts'
import { baseNameFromPath, deriveExportBaseName } from '../src/lib/exportName.ts'

// ---------- 优先级 ----------

test('元信息 title 优先于标题行', () => {
  const src = '---\ntitle: 我的设计笔记\n---\n\n# 别用这个'
  assert.equal(deriveDocumentTitle(src), '我的设计笔记')
})

test('元信息带引号的值被剥掉', () => {
  const src = '---\ntitle: "引用的标题"\n---\n\n# 正文标题'
  assert.equal(deriveDocumentTitle(src), '引用的标题')
})

test('title 为空串时落到标题行', () => {
  const src = '---\ntitle: ""\n---\n\n# 真标题'
  assert.equal(deriveDocumentTitle(src), '真标题')
})

test('无元信息时取第一个标题行', () => {
  assert.equal(deriveDocumentTitle('# Hello World\n\n正文'), 'Hello World')
})

test('取第一个标题，而不是最后一个', () => {
  assert.equal(deriveDocumentTitle('引言段\n\n# 第一\n\n## 第二'), '第一')
})

test('多级标题与闭合 # 都支持', () => {
  assert.equal(deriveDocumentTitle('## 二级 ##'), '二级')
  assert.equal(deriveDocumentTitle('### 三级标题'), '三级标题')
})

test('标题前的空行 / 缩进不影响', () => {
  assert.equal(deriveDocumentTitle('\n\n   # 缩进标题'), '缩进标题')
})

// ---------- 非标题首行不入名 ----------

test('代码围栏、表格、URL、列表等非标题首行 → null', () => {
  assert.equal(deriveDocumentTitle('```js\nconst a = 1\n```'), null)
  assert.equal(deriveDocumentTitle('| 列A | 列B |\n|---|---|\n| 1 | 2 |'), null)
  assert.equal(deriveDocumentTitle('https://example.com/very/long'), null)
  assert.equal(deriveDocumentTitle('- 列表项'), null)
})

test('`#标题`（无空格）不是标题 → null', () => {
  assert.equal(deriveDocumentTitle('#不是标题\n\n正文'), null)
})

test('7 个以上 # 不是标题 → null', () => {
  assert.equal(deriveDocumentTitle('####### 七个井号'), null)
})

// ---------- Windows 文件名清洗 ----------

test('非法字符 \\ / : * ? " < > | 换成空格并压平', () => {
  assert.equal(deriveDocumentTitle('# a/b:c*d?e"f<g>h|i\\j'), 'a b c d e f g h i j')
})

test('首尾点与空格剥掉（Windows 禁止）', () => {
  assert.equal(deriveDocumentTitle('#  标题...  '), '标题')
})

test('超长标题按码点截断到 60，中文/emoji 不劈半', () => {
  const long = deriveDocumentTitle('# ' + '汉'.repeat(80) + '😀'.repeat(80))
  assert.ok(long && long.length <= 60, `应 ≤60 字符，实际 ${long?.length}`)
  assert.ok(long!.startsWith('汉'.repeat(59)))
})

test('系统保留名（CON/NUL/COM1…）→ null 回落默认名', () => {
  assert.equal(deriveDocumentTitle('# CON'), null)
  assert.equal(deriveDocumentTitle('# com1'), null)
})

test('清洗后为空 → null', () => {
  assert.equal(deriveDocumentTitle('# ???'), null)
  assert.equal(deriveDocumentTitle('#'), null)
  assert.equal(deriveDocumentTitle(''), null)
})

// ---------- 与 front matter 严格档协同 ----------

test('正文里的 --- 不会被误当元信息，标题正常取', () => {
  const src = '前言\n\n---\n\ntitle: 这是分隔线不是元信息\n\n---\n\n# 真标题'
  assert.equal(deriveDocumentTitle(src), '真标题')
})

// ---------- 导出文件名统一口径（lib/exportName.ts） ----------
// 这份用例守的是「PPTX 与 DOCX/HTML/PDF 的默认文件名用同一套推导」这个约定。

test('已保存文件优先沿用路径文件名（Windows / POSIX 两种分隔符）', () => {
  assert.equal(deriveExportBaseName({ content: '# 文档标题', filePath: 'C:\\notes\\我的笔记.md' }), '我的笔记')
  assert.equal(deriveExportBaseName({ content: '# 文档标题', filePath: '/home/u/deck.markdown' }), 'deck')
})

test('路径文件名去掉扩展名，但保留点号开头的其余部分', () => {
  assert.equal(baseNameFromPath('C:\\a\\v1.2.3.final.md'), 'v1.2.3.final')
  assert.equal(baseNameFromPath('/a/noext'), 'noext')
})

test('未保存文档从内容推导标题（PPTX 曾经的 bug：拿 tab.name）', () => {
  assert.equal(deriveExportBaseName({ content: '# 演示大纲\n\n---\n\n## 第二页', filePath: null }), '演示大纲')
})

test('front matter title 优先于标题行', () => {
  assert.equal(deriveExportBaseName({ content: '---\ntitle: 季度汇报\n---\n\n# 封面' }), '季度汇报')
})

test('推不出标题时用调用方兜底名', () => {
  assert.equal(deriveExportBaseName({ content: '- 只有列表', fallback: 'slides' }), 'slides')
  assert.equal(deriveExportBaseName({ content: '', fallback: 'slides' }), 'slides')
})

test('路径为空串 / 只有分隔符时回到标题推导', () => {
  assert.equal(baseNameFromPath(''), null)
  assert.equal(baseNameFromPath('C:\\dir\\'), null)
  assert.equal(deriveExportBaseName({ content: '# 标题', filePath: '' }), '标题')
})
