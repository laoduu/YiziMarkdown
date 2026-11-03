/**
 * Word 导出排版规范：字体拆分与默认版式。
 *
 * 重点不是断言某个像素值，而是锁住「拉丁 / 东亚字体分开」「段距只走段前」
 * 「目录默认 1-6 级」这三条规则，避免又回到 Rust 里各写一套常量。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDocxLayout, resolveDocxFonts, splitFontStack } from '../src/lib/docxLayout.ts'

test('字体栈：拉丁与东亚字体拆分（Inter + 微软雅黑）', () => {
  const fonts = resolveDocxFonts("Inter, 'Microsoft YaHei', system-ui, sans-serif", 'Consolas')
  assert.equal(fonts.latin, 'Inter')
  assert.equal(fonts.eastAsia, 'Microsoft YaHei')
  assert.equal(fonts.mono, 'Consolas')
})

test('字体栈：CJK 字体同时承担拉丁与东亚', () => {
  const fonts = resolveDocxFonts("'MiSans', 'Microsoft YaHei', sans-serif", 'Consolas')
  assert.equal(fonts.latin, 'MiSans')
  assert.equal(fonts.eastAsia, 'MiSans')
})

test('字体栈：system-ui 映射为具体字体，不把 CSS 关键字写进 Word', () => {
  const fonts = resolveDocxFonts('system-ui, sans-serif', 'ui-monospace')
  assert.equal(fonts.latin, 'Microsoft YaHei')
  assert.equal(fonts.eastAsia, 'Microsoft YaHei')
  assert.equal(fonts.mono, 'Consolas')
})

test('字体栈：空值/var() 回落到规范默认值', () => {
  const fonts = resolveDocxFonts('', '')
  assert.equal(fonts.latin, 'Calibri')
  assert.equal(fonts.eastAsia, 'Microsoft YaHei')
  assert.equal(fonts.mono, 'Consolas')
  assert.deepEqual(splitFontStack('var(--font-preview)'), [])
})

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9

test('版式：目录默认收 1-6 级，段距只走段前', () => {
  const layout = buildDocxLayout('Inter, Microsoft YaHei, sans-serif', 'Consolas')
  assert.equal(layout.toc.maxLevel, 6)
  assert.equal(layout.body.align, 'both')
  // Word 段前/段后是相加的：规范必须把段后固定为 0
  assert.deepEqual(layout.headings.afterEm, [0, 0, 0, 0, 0, 0])
  // 规范段前 0、段后 6pt；只走段前，所以是 6pt/11pt
  assert.ok(near(layout.paragraph.beforeEm, 6 / 11), String(layout.paragraph.beforeEm))
  assert.equal(layout.headings.scales.length, 6)
  assert.equal(layout.headings.beforeEm.length, 6)
})

test('版式：前面确定的 Word 规范值全部落地', () => {
  const l = buildDocxLayout('Inter, Microsoft YaHei', 'Consolas')
  // 正文 11pt / 1.5 倍；默认不跟预览字号
  assert.equal(l.body.sizePt, 11)
  assert.equal(l.body.lineHeight, 1.5)
  assert.equal(l.body.followPreviewSize, false)
  // 标题 18/15/13/12/11/11pt
  const specHeading = [18, 15, 13, 12, 11, 11]
  specHeading.forEach((pt, i) => assert.ok(near(l.headings.scales[i], pt / 11), `H${i + 1}`))
  // 标题段前 18/12/10/8/6/6pt
  const specBefore = [18, 12, 10, 8, 6, 6]
  specBefore.forEach((pt, i) => assert.ok(near(l.headings.beforeEm[i], pt / 11), `H${i + 1} before`))
  // 列表 0.74cm / 0.37cm；项间距 3pt
  assert.ok(near(l.list.indentEm, (0.74 * 96 / 2.54 * 0.75) / 11))
  assert.ok(near(l.list.hangingEm, (0.37 * 96 / 2.54 * 0.75) / 11))
  assert.ok(near(l.list.itemGapEm, 3 / 11))
  // 引用 10.5pt、代码 10pt、表格 10pt
  assert.ok(near(l.quote.scale, 10.5 / 11))
  assert.ok(near(l.code.scale, 10 / 11))
  assert.ok(near(l.table.scale, 10 / 11))
  // 表格 0.5pt 边框、0.1cm 单元格边距
  assert.equal(l.table.borderPt, 0.5)
  assert.ok(near(l.table.cellMarginXEm, (0.2 * 96 / 2.54 * 0.75) / 11))
  assert.ok(near(l.table.cellMarginYEm, (0.1 * 96 / 2.54 * 0.75) / 11))
})

test('版式：标题比例与表格/引用/代码间距是固定值，不跟主题走', () => {
  const a = buildDocxLayout('Inter, Microsoft YaHei', 'Consolas')
  const b = buildDocxLayout('Georgia, PingFang SC', 'Menlo')
  assert.deepEqual(a.headings, b.headings)
  assert.deepEqual(a.paragraph, b.paragraph)
  assert.deepEqual(a.list, b.list)
  assert.deepEqual(a.quote, b.quote)
  assert.deepEqual(a.code, b.code)
  assert.deepEqual(a.table, b.table)
  assert.deepEqual(a.toc, b.toc)
  // 只有字体随主题/设置变化
  assert.notDeepEqual(a.fonts, b.fonts)
})