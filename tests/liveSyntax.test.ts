/**
 * `src/lib/liveSyntax.ts` 的纯函数回归测试。
 *
 * 这些函数决定实时模式「能不能把源码渲染成预览的样子」，而且全部不依赖 DOM，
 * 所以在这里逐条钉住：实体解码、行内 HTML 解析、表格对齐、脚注续行、引用式定义、
 * 行内图片、目录标题、行内公式拆分。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  addTableColumn,
  addTableRow,
  analyzeFootnotes,
  collectHeadings,
  decodeHtmlEntity,
  deleteTableColumns,
  deleteTableRows,
  inSpans,
  inlineCodeSpans,
  insertTableColumn,
  insertTableRow,
  isStandaloneImageLine,
  moveTableColumn,
  moveTableRow,
  parseHtmlTag,
  parseImageMarkdown,
  parseReferenceDefinition,
  parseReferenceImage,
  parseTableAlignments,
  parseTableRow,
  sanitizeInlineStyle,
  setTableColumnAlign,
  sortTableRows,
  splitInlineMath,
  stripInlineMarkers,
  TOC_LINE_RE,
} from '../src/lib/liveSyntax.ts'

test('decodeHtmlEntity：数字实体 / 十六进制 / 常用命名实体', () => {
  assert.equal(decodeHtmlEntity('&#169;'), '©')
  assert.equal(decodeHtmlEntity('&#xA9;'), '©')
  assert.equal(decodeHtmlEntity('&amp;'), '&')
  assert.equal(decodeHtmlEntity('&copy;'), '©')
  assert.equal(decodeHtmlEntity('&hellip;'), '…')
  // 不认识的实体原样返回，不能吞字符
  assert.equal(decodeHtmlEntity('&notareal;'), '&notareal;')
})

test('parseHtmlTag：起止标签 / 自闭合 / 属性引号', () => {
  const open = parseHtmlTag('<span style="color: red" data-x=\'1\'>')
  assert.ok(open)
  assert.equal(open!.closing, false)
  assert.equal(open!.name, 'span')
  assert.equal(open!.attrs.style, 'color: red')
  assert.equal(open!.attrs['data-x'], '1')

  assert.equal(parseHtmlTag('</sup>')!.closing, true)
  assert.equal(parseHtmlTag('</sup>')!.name, 'sup')
  assert.equal(parseHtmlTag('<br/>')!.selfClosing, true)
  assert.equal(parseHtmlTag('<!-- comment -->'), null)
  assert.equal(parseHtmlTag('not a tag'), null)
})

test('sanitizeInlineStyle：只保留文字视觉属性，危险值丢弃', () => {
  const style = sanitizeInlineStyle('color: #f00; background-image: url(x); width: 200px; font-weight: 700')
  assert.equal(style, 'color: #f00; font-weight: 700')
  assert.equal(sanitizeInlineStyle('color: expression(alert(1))'), '')
})

test('parseTableAlignments：对齐 + 列数不足补 left', () => {
  assert.deepEqual(parseTableAlignments('| :--- | :---: | ---: | --- |', 4), ['left', 'center', 'right', 'left'])
  assert.deepEqual(parseTableAlignments('| --- | --- |', 4), ['left', 'left', 'left', 'left'])
  // 无首尾竖线也要认
  assert.deepEqual(parseTableAlignments(':-- | --:', 2), ['left', 'right'])
})

test('parseTableRow：空单元格与转义竖线都保留，位置可直接编辑', () => {
  const cells = parseTableRow('| a | b |  |', 100)
  assert.deepEqual(cells.map((c) => c.text), ['a', 'b', ''])
  assert.deepEqual(cells.map((c) => [c.from - 100, c.to - 100]), [[1, 4], [5, 8], [9, 11]])
  // 无首尾竖线的写法
  assert.deepEqual(parseTableRow('a | b').map((c) => c.text), ['a', 'b'])
  // 转义竖线不切分
  assert.deepEqual(parseTableRow('| a \\| b | c |').map((c) => c.text), ['a \\| b', 'c'])
})

test('addTableColumn：每行末尾补单元格，分隔行补 ---', () => {
  const src = '| a | b |\n| --- | --- |\n| 1 | 2 |'
  assert.equal(
    addTableColumn(src),
    '| a | b |  |\n| --- | --- | --- |\n| 1 | 2 |  |',
  )
  // 没有首尾竖线的写法也能识别
  const loose = addTableColumn('a | b\n--- | ---')
  assert.equal(loose, 'a | b|  \n--- | ---| --- ')
  // 新增列后分隔行列数与表头一致
  const out = addTableColumn(src)
  assert.equal(parseTableAlignments(out.split('\n')[1], 3).length, 3)
})

test('addTableRow：按表头列数补空行，保留缩进与首尾竖线', () => {
  const src = '| a | b |\n| --- | --- |\n| 1 | 2 |'
  assert.equal(addTableRow(src), src + '\n|  |  |')
  // 列表内缩进表格
  const indented = '  | a | b |\n  | --- | --- |'
  assert.equal(addTableRow(indented), indented + '\n  |  |  |')
})

test('insertTableRow / deleteTableRows / moveTableRow：正文行增删与移动', () => {
  const src = '| a | b |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |'
  // 在第 2 行（第一条正文）前插入
  assert.equal(
    insertTableRow(src, 2),
    '| a | b |\n| --- | --- |\n|  |  |\n| 1 | 2 |\n| 3 | 4 |',
  )
  // 末尾插入
  assert.equal(
    insertTableRow(src, 4),
    '| a | b |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n|  |  |',
  )
  assert.equal(deleteTableRows(src, [2]), '| a | b |\n| --- | --- |\n| 3 | 4 |')
  // 表头与分隔行不可删除
  assert.equal(deleteTableRows(src, [0, 1]), src)
  assert.equal(moveTableRow(src, 2, 1), '| a | b |\n| --- | --- |\n| 3 | 4 |\n| 1 | 2 |')
  // 第一条正文不能再上移
  assert.equal(moveTableRow(src, 2, -1), src)
})

test('insertTableColumn / deleteTableColumns / moveTableColumn：列增删与移动', () => {
  const src = '| a | b |\n| --- | --- |\n| 1 | 2 |'
  assert.equal(
    insertTableColumn(src, 1),
    '| a |  | b |\n| --- | --- | --- |\n| 1 |  | 2 |',
  )
  assert.equal(
    insertTableColumn(src, 2),
    '| a | b |  |\n| --- | --- | --- |\n| 1 | 2 |  |',
  )
  assert.equal(deleteTableColumns(src, [0]), '| b |\n| --- |\n| 2 |')
  // 删光列时至少保留一列
  assert.equal(deleteTableColumns(src, [0, 1]), '|  |\n|  |\n|  |')
  assert.equal(moveTableColumn(src, 0, 1), '| b | a |\n| --- | --- |\n| 2 | 1 |')
  // 转义竖线在重建时保持转义
  const escaped = insertTableColumn('| a \\| b | c |\n| --- | --- |', 1)
  assert.equal(escaped, '| a \\| b |  | c |\n| --- | --- | --- |')
})

test('setTableColumnAlign / sortTableRows：对齐标记与排序', () => {
  const src = '| a | b |\n| --- | --- |\n| 1 | 2 |'
  assert.equal(
    setTableColumnAlign(src, 1, 'right'),
    '| a | b |\n| --- | ---: |\n| 1 | 2 |',
  )
  assert.deepEqual(parseTableAlignments(setTableColumnAlign(src, 0, 'center').split('\n')[1], 2), ['center', 'left'])

  const numbers = '| n |\n| --- |\n| 10 |\n| 2 |\n| 1 |'
  assert.equal(sortTableRows(numbers, 0, 'asc'), '| n |\n| --- |\n| 1 |\n| 2 |\n| 10 |')
  assert.equal(sortTableRows(numbers, 0, 'desc'), '| n |\n| --- |\n| 10 |\n| 2 |\n| 1 |')
  // 行数不足时原样返回
  assert.equal(sortTableRows('| a |\n| --- |', 0, 'asc'), '| a |\n| --- |')
})

test('analyzeFootnotes：引用编号 + 多行续行 + 多段定义', () => {
  const lines = [
    'ref[^a] and [^b] and `code [^c]`',
    '',
    '[^a]: first',
    '    continuation',
    '',
    '    second paragraph',
    '',
    '[^b]: bee',
  ]
  const fn = analyzeFootnotes(lines)
  assert.equal(fn.order.get('a'), 1)
  assert.equal(fn.order.get('b'), 2)
  // 行内代码里的 [^c] 不算引用
  assert.equal(fn.order.has('c'), false)

  const defA = fn.byMarkerLine.get(2)
  assert.ok(defA)
  assert.equal(defA!.label, 'a')
  assert.deepEqual(defA!.continuationLines, [3, 4, 5])
  assert.equal(fn.firstDefinitionLine, 2)
  assert.equal(fn.definitionLines.has(6), false)
  assert.equal(fn.continuationLines.has(7), false)
})

test('inlineCodeSpans / inSpans：行内代码区间', () => {
  const spans = inlineCodeSpans('a `x` b `y`')
  assert.equal(spans.length, 2)
  assert.equal(inSpans(spans, 3), true)
  assert.equal(inSpans(spans, 5), false)
})

test('parseImageMarkdown：title 三种写法 / 带括号的 URL / 尖括号', () => {
  assert.deepEqual(parseImageMarkdown('![alt](x.png)'), { alt: 'alt', src: 'x.png', title: '' })
  assert.deepEqual(parseImageMarkdown('![alt](x.png "T")'), { alt: 'alt', src: 'x.png', title: 'T' })
  assert.deepEqual(parseImageMarkdown("![alt](x.png 'T')"), { alt: 'alt', src: 'x.png', title: 'T' })
  assert.deepEqual(parseImageMarkdown('![alt](x.png (T))'), { alt: 'alt', src: 'x.png', title: 'T' })
  assert.deepEqual(parseImageMarkdown('![alt](a_(b).png)'), { alt: 'alt', src: 'a_(b).png', title: '' })
  assert.deepEqual(parseImageMarkdown('![alt](<my image.png> "T")'), { alt: 'alt', src: 'my image.png', title: 'T' })
  assert.equal(parseImageMarkdown('text ![a](x.png) more'), null)
})

test('isStandaloneImageLine：独占一行才交给块级 widget', () => {
  assert.equal(isStandaloneImageLine('  ![a](x.png "T")  '), true)
  assert.equal(isStandaloneImageLine('文字 ![a](x.png)'), false)
  assert.equal(isStandaloneImageLine('![a](x.png) 文字'), false)
})

test('parseReferenceImage：完整引用 / 折叠引用 / 定义缺失', () => {
  const defs = new Map([
    ['bar', { label: 'bar', dest: 'b.png', title: 'B' }],
    ['alt', { label: 'alt', dest: 'c.png', title: '' }],
  ])
  assert.deepEqual(parseReferenceImage('![alt][bar]', defs), { alt: 'alt', src: 'b.png', title: 'B' })
  // `![alt][]` = 折叠引用，label 取 alt（大小写不敏感）
  assert.deepEqual(parseReferenceImage('![ALT][]', defs), { alt: 'ALT', src: 'c.png', title: '' })
  // 定义缺失：返回 null，调用方保留源码
  assert.equal(parseReferenceImage('![alt][nope]', defs), null)
  // 普通行内图片不是引用式
  assert.equal(parseReferenceImage('![alt](x.png)', defs), null)
})

test('parseReferenceDefinition：普通定义 / 尖括号 / 标题；脚注定义不算', () => {
  assert.deepEqual(parseReferenceDefinition('[foo]: https://e.com "T"'), {
    label: 'foo', dest: 'https://e.com', title: 'T',
  })
  assert.deepEqual(parseReferenceDefinition('   [bar]: <a b>'), {
    label: 'bar', dest: 'a b', title: '',
  })
  assert.equal(parseReferenceDefinition('[^note]: 脚注定义'), null)
  assert.equal(parseReferenceDefinition('[foo]: '), null)
})

test('collectHeadings：跳过元信息块 / 围栏代码 / 注释，支持 Setext', () => {
  const lines = [
    '---',
    'title: x',
    '---',
    '# A',
    '```',
    '# not a heading',
    '```',
    'B',
    '===',
    '<!--',
    '# hidden',
    '-->',
    '## C',
  ]
  const heads = collectHeadings(lines)
  assert.deepEqual(heads.map((h) => [h.level, h.text, h.line]), [
    [1, 'A', 4],
    [1, 'B', 8],
    [2, 'C', 13],
  ])
})

test('stripInlineMarkers：目录里显示纯文字', () => {
  assert.equal(stripInlineMarkers('**Bold** and `code` and [link](x)'), 'Bold and code and link')
  assert.equal(stripInlineMarkers('![alt](x.png) heading'), 'alt heading')
})

test('splitInlineMath：跳过行内代码 / 转义 $ / $$，公式与其它行内语法共存', () => {
  assert.deepEqual(splitInlineMath('a $x^2$ b'), [
    { type: 'text', value: 'a ' },
    { type: 'math', value: 'x^2' },
    { type: 'text', value: ' b' },
  ])
  assert.equal(splitInlineMath('`$x$`'), null)
  assert.equal(splitInlineMath('$$x$$'), null)
  assert.deepEqual(splitInlineMath('\\$5 and $y$'), [
    { type: 'text', value: '\\$5 and ' },
    { type: 'math', value: 'y' },
  ])
  // `**b**` 必须留给 markdown-it 渲染，不能被公式拆分吞掉
  assert.deepEqual(splitInlineMath('$a$ and **b**'), [
    { type: 'math', value: 'a' },
    { type: 'text', value: ' and **b**' },
  ])
})

test('TOC_LINE_RE：[toc] / [[toc]] 独立成行', () => {
  assert.equal(TOC_LINE_RE.test('[toc]'), true)
  assert.equal(TOC_LINE_RE.test('[[toc]]'), true)
  assert.equal(TOC_LINE_RE.test('  [toc]  '), true)
  assert.equal(TOC_LINE_RE.test('see [toc] here'), false)
})
