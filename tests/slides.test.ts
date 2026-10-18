/**
 * slides.test.ts — 演示模式分页/版式推断/指令解析的单元测试。
 *
 * 运行方式：npm test（node --test，Node 原生 TS 类型剥离，无额外依赖）。
 * 注意：被测模块必须零依赖（不能 import npm 包或 ./tauri），
 * import 需带显式 .ts 后缀（见 tests/remotePath.test.ts 头部说明）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  stripFrontMatter, parseFrontMatter, splitSlides, splitColumns, extractNotes, extractDirectives,
  scanBlocks, detectLayout, detectSlideKind, isValidLayout, LAYOUT_KINDS,
  COLUMN_BREAK, MAX_COLUMNS, COLUMN_REGION_MIN, COLUMN_REGION_SNIPPET, COLUMN_REGION_CURSOR,
} from '../src/lib/slides.ts'

// ---------- splitSlides ----------

test('splitSlides: 按 --- 分页', () => {
  const slides = splitSlides('# A\n\n---\n\n# B\n\n---\n\n# C')
  assert.equal(slides.length, 3)
  assert.match(slides[0], /# A/)
  assert.match(slides[2], /# C/)
})

test('splitSlides: fence 内的 --- 不切分', () => {
  const src = '```md\n---\n```\n\n---\n\n# B'
  const slides = splitSlides(src)
  assert.equal(slides.length, 2)
  assert.match(slides[0], /---/)
})

test('splitSlides: 空输入返回单页', () => {
  assert.deepEqual(splitSlides(''), [''])
})

// ---------- front matter ----------

test('stripFrontMatter/parseFrontMatter: 剥离并解析元信息', () => {
  const src = '---\ntitle: 演示标题\nauthor: 张三\nslideshow-fragments: off\n---\n\n# A'
  assert.equal(parseFrontMatter(src).title, '演示标题')
  assert.equal(parseFrontMatter(src).author, '张三')
  assert.equal(parseFrontMatter(src)['slideshow-fragments'], 'off')
  assert.match(stripFrontMatter(src), /# A/)
})

test('parseFrontMatter: 无 front matter 返回空对象', () => {
  assert.deepEqual(parseFrontMatter('# A'), {})
})

// ---------- extractNotes ----------

test('extractNotes: 单行备注', () => {
  const { body, notes } = extractNotes('# A\n\n<!-- notes: 提醒自己 -->')
  assert.equal(notes, '提醒自己')
  assert.equal(body.includes('notes'), false)
})

test('extractNotes: 多行备注', () => {
  const { notes } = extractNotes('<!-- notes\n第一行\n第二行\n-->')
  assert.match(notes, /第一行/)
  assert.match(notes, /第二行/)
})

// ---------- extractDirectives ----------

test('extractDirectives: 合法 layout/align/fragments', () => {
  const { body, directives } = extractDirectives('<!-- layout: quote -->\n<!-- align: center -->\n<!-- fragments: off -->\n内容')
  assert.equal(directives.layout, 'quote')
  assert.equal(directives.align, 'center')
  assert.equal(directives.fragments, 'off')
  assert.equal(body.includes('layout'), false)
})

test('extractDirectives: 非法 layout 被忽略（回落自动推断）', () => {
  const { directives } = extractDirectives('<!-- layout: foo -->\n内容')
  assert.equal(directives.layout, undefined)
})

test('extractDirectives: 非法 align/fragments 被忽略', () => {
  const d1 = extractDirectives('<!-- align: middle -->')
  assert.equal(d1.directives.align, undefined)
  const d2 = extractDirectives('<!-- fragments: maybe -->')
  assert.equal(d2.directives.fragments, undefined)
})

// ---------- 指令/备注的误触防护（v0.3.4）----------
// 口径与 `---` 分页、`***` 分栏一致：**独占一行**且**不在代码围栏内**才算数。
// 否则任何想「讲解指令」的文档都会被自己讲的内容坑到（指令被真的执行 + 正文被吃掉）。

test('extractDirectives: 正文里提到指令不误触', () => {
  const { body, directives } = extractDirectives('## 标题\n\n想强制版式就写 <!-- layout: quote --> 即可\n\n正文还在')
  assert.equal(directives.layout, undefined)
  assert.ok(body.includes('<!-- layout: quote -->'), '提到的字样必须原样保留在正文里')
  assert.ok(body.includes('正文还在'))
})

test('extractDirectives: 代码围栏内的指令是代码内容，不执行也不剥离', () => {
  const src = '## 标题\n\n```md\n<!-- layout: quote -->\n<!-- align: center -->\n```\n\n正文'
  const { body, directives } = extractDirectives(src)
  assert.equal(directives.layout, undefined)
  assert.equal(directives.align, undefined)
  assert.ok(body.includes('<!-- layout: quote -->'), '围栏内容不能被吃掉')
  assert.ok(body.includes('<!-- align: center -->'))
})

test('extractDirectives: 行内代码与表格单元格里提到指令不误触', () => {
  const inline = extractDirectives('用 `<!-- fragments: off -->` 关掉')
  assert.equal(inline.directives.fragments, undefined)
  assert.ok(inline.body.includes('<!-- fragments: off -->'))

  const table = extractDirectives('| 指令 | 说明 |\n|---|---|\n| <!-- layout: cover --> | 封面 |')
  assert.equal(table.directives.layout, undefined)
  assert.ok(table.body.includes('<!-- layout: cover -->'))
})

test('extractDirectives: 行首有缩进的指令仍生效（与 --- / *** 的 trim 口径一致）', () => {
  const { directives } = extractDirectives('    <!-- layout: code -->\n内容')
  assert.equal(directives.layout, 'code')
})

test('extractDirectives: 指令与其它文字同行时不生效（必须独占一行）', () => {
  const { directives, body } = extractDirectives('## 标题 <!-- layout: quote -->')
  assert.equal(directives.layout, undefined)
  assert.ok(body.includes('<!-- layout: quote -->'))
})

test('extractNotes: 备注块同样受围栏与独占一行保护', () => {
  // 围栏里的 notes 字样是代码内容
  const fenced = extractNotes('正文\n\n```md\n<!-- notes: 这是代码 -->\n```\n\n尾行')
  assert.equal(fenced.notes, '')
  assert.ok(fenced.body.includes('<!-- notes: 这是代码 -->'))
  // 正文里提到 notes 不会被当成备注、也不会被吃掉
  const prose = extractNotes('想写备注就用 <!-- notes: xxx --> 这种注释\n\n正文')
  assert.equal(prose.notes, '')
  assert.ok(prose.body.includes('<!-- notes: xxx -->'))
})

test('extractNotes: 备注文本里提到 --> 不会被提前截断', () => {
  const { notes, body } = extractNotes('<!-- notes: 讲清楚 <!-- 与 --> 的写法 -->\n\n正文')
  assert.equal(notes, '讲清楚 <!-- 与 --> 的写法')
  assert.ok(body.includes('正文'))
})

test('isValidLayout: 合法值与非法值', () => {
  assert.equal(isValidLayout('cover'), true)
  assert.equal(isValidLayout('content-list'), true)
  assert.equal(isValidLayout('foo'), false)
  assert.equal(LAYOUT_KINDS.length, 14)
})

// ---------- scanBlocks v2 ----------

test('scanBlocks: 连续文本行合并为一个 p（软换行）', () => {
  const blocks = scanBlocks('第一行\n第二行\n第三行')
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].type, 'p')
})

test('scanBlocks: 列表跨空行合并（loose list），items 计数', () => {
  const blocks = scanBlocks('- a\n- b\n\n- c\n\n正文')
  const ul = blocks.find((b) => b.type === 'ul')
  assert.ok(ul)
  assert.equal(ul.items, 3)
  assert.equal(blocks.filter((b) => b.type === 'p').length, 1)
})

test('scanBlocks: 列表 depth 取最大前导缩进', () => {
  const blocks = scanBlocks('- a\n  - b')
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].depth, 2)
})

test('scanBlocks: 标题各自成块不合并', () => {
  const blocks = scanBlocks('## A\n## B')
  assert.equal(blocks.length, 2)
  assert.equal(blocks[0].type, 'h2')
  assert.equal(blocks[1].type, 'h2')
})

test('scanBlocks: 连续引用/表格/图片合并', () => {
  assert.equal(scanBlocks('> a\n> b').length, 1)
  assert.equal(scanBlocks('| a |\n| b |').length, 1)
  const imgs = scanBlocks('![a](a.png)\n![b](b.png)')
  assert.equal(imgs.length, 1)
  assert.equal(imgs[0].items, 2)
})

test('scanBlocks: mermaid 与代码围栏', () => {
  assert.equal(scanBlocks('```mermaid\ngraph LR\n```\n')[0].type, 'chart')
  assert.equal(scanBlocks('```js\nconst a = 1\n```\n')[0].type, 'code')
})

// ---------- detectLayout：全部 14 种版式 ----------

test('detectLayout: cover 封面页', () => {
  assert.equal(detectLayout('# 标题\n\n副标题').kind, 'cover')
})

test('detectLayout: thanks 结尾页（语义匹配优先于 cover）', () => {
  assert.equal(detectLayout('# 谢谢').kind, 'thanks')
  assert.equal(detectLayout('# Thanks').kind, 'thanks')
  assert.equal(detectLayout('# Q & A').kind, 'thanks')
})

test('detectLayout: section 章节页（仅标题无正文）', () => {
  assert.equal(detectLayout('## 第一章').kind, 'section')
  // 标题下有正文 → 不是章节页
  assert.equal(detectLayout('## 第一章\n\n正文').kind, 'content')
})

test('detectLayout: agenda 目录页（标题语义 + ol）', () => {
  assert.equal(detectLayout('## 目录\n\n1. a\n2. b\n3. c').kind, 'agenda')
  assert.equal(detectLayout('## Agenda\n\n1. a\n2. b\n3. c').kind, 'agenda')
})

test('detectLayout: agenda 目录页（纯 ol ≥3 项）', () => {
  assert.equal(detectLayout('1. a\n2. b\n3. c').kind, 'agenda')
  // 2 项不是目录页
  assert.equal(detectLayout('1. a\n2. b').kind, 'content')
})

test('detectLayout: content-list 列表页', () => {
  assert.equal(detectLayout('## 标题\n\n- a\n- b').kind, 'content-list')
  assert.equal(detectLayout('## 标题\n\n1. a\n2. b').kind, 'content-list')
})

test('detectLayout: table 数据表页', () => {
  assert.equal(detectLayout('## 标题\n\n| a | b |\n|---|---|\n| 1 | 2 |').kind, 'table')
  assert.equal(detectLayout('| a | b |\n|---|---|\n| 1 | 2 |').kind, 'table')
})

test('detectLayout: roadmap 路线图页', () => {
  assert.equal(detectLayout('## 标题\n\n- [x] 完成\n- [ ] 待办').kind, 'roadmap')
})

test('detectLayout: image 图片页（figure 已退出自动推断）', () => {
  // v0.3.4：图片 + 文字不再自动变成左图右文（figure）—— 图按书写顺序纵向排列、自身居中，
  // 想并排请用 `***` 分栏。只要首块是图片，无论后面跟不跟文字都是 image。
  assert.equal(detectLayout('![图](a.png)\n\n说明文字').kind, 'image')
  assert.equal(detectLayout('![图](a.png)').kind, 'image')
  assert.equal(detectLayout('## 标题\n\n![图](a.png)').kind, 'content')
  // figure 不会自动命中，但仍是 layout 指令的合法取值（样式未删，只摘掉自动路径）
  assert.ok(LAYOUT_KINDS.includes('figure'), 'figure 应仍可被 <!-- layout: figure --> 指定')
})

test('detectLayout: quote 引用页（仅首块引用；H2+引用 → content）', () => {
  assert.equal(detectLayout('> 金句').kind, 'quote')
  assert.equal(detectLayout('## 标题\n\n> 金句').kind, 'content')
})

test('detectLayout: code 代码页', () => {
  assert.equal(detectLayout('## 标题\n\n```js\nconst a = 1\n```\n').kind, 'code')
})

test('detectLayout: chart 图表页', () => {
  assert.equal(detectLayout('## 标题\n\n```mermaid\ngraph LR\n```\n').kind, 'chart')
})

test('detectLayout: formula 公式页', () => {
  assert.equal(detectLayout('## 标题\n\n$$\nE=mc^2\n$$').kind, 'formula')
})

test('detectLayout: content 默认兜底', () => {
  assert.equal(detectLayout('## 标题\n\n正文段落').kind, 'content')
  assert.equal(detectLayout('正文段落').kind, 'content')
})

test('detectLayout: 空页返回 content', () => {
  assert.equal(detectLayout('').kind, 'content')
})

test('detectSlideKind: 兼容旧接口', () => {
  assert.equal(detectSlideKind('# 标题'), 'cover')
})

test('detectLayout: title 提取（供章节标记）', () => {
  assert.equal(detectLayout('## 第一章 **重点**').title, '第一章 重点')
})

// ---------- splitColumns（页内 `***` 分栏） ----------

test('splitColumns: 无 *** 返回单栏（与 splitSlides 一致的空输入行为）', () => {
  assert.deepEqual(splitColumns('正文'), { intro: '', before: '', parts: ['正文'], after: '' })
  assert.deepEqual(splitColumns(''), { intro: '', before: '', parts: [''], after: '' })
})

test('splitColumns: 两个 *** 切三栏（退化规则：2 条按分隔读）', () => {
  assert.deepEqual(splitColumns('左\n***\n中\n***\n右'), { intro: '', before: '', parts: ['左', '中', '右'], after: '' })
})

test('splitColumns: 围栏内的 *** 不分栏', () => {
  const { parts } = splitColumns('```md\n***\n```\n\n***\n\n正文')
  assert.equal(parts.length, 2)
  assert.match(parts[0], /\*\*\*/)
})

test('splitColumns: 空栏被丢弃（连续 *** 与首尾 ***）', () => {
  assert.deepEqual(splitColumns('A\n***\n\n***\nB').parts, ['A', 'B'])
  assert.deepEqual(splitColumns('***\nA').parts, ['A'])
  assert.deepEqual(splitColumns('A\n***').parts, ['A'])
})

test('splitColumns: 行内必须恰好是 ***（与 --- 的逐字约定一致）', () => {
  assert.equal(splitColumns('A\n  ***\nB').parts.length, 1)   // 前导空格 = 不切
  assert.equal(splitColumns('A\n***   \nB').parts.length, 2)  // 尾随空格 = 切
  assert.equal(splitColumns('A\n___\nB').parts.length, 1)     // ___ 仍是普通分隔线
  assert.equal(splitColumns('A\n- - -\nB').parts.length, 1)
  assert.equal(splitColumns('A\n****\nB').parts.length, 1)    // 四个星号不算
})

test('splitColumns: 超过上限并入最后一栏且不丢内容', () => {
  // 圈定写法：首尾两条是边界，中间 5 条切出 5 栏 ⇒ 超过上限 4，后续并入最后一栏
  const { parts, before, after } = splitColumns('0\n***\n1\n***\n2\n***\n3\n***\n4\n***\n5\n***\n6')
  assert.equal(before, '0')
  assert.equal(after, '6')
  assert.equal(parts.length, MAX_COLUMNS)
  assert.equal(parts[MAX_COLUMNS - 1].includes('4'), true)
  assert.equal(parts[MAX_COLUMNS - 1].includes('5'), true)
})

test('COLUMN_BREAK 是 ***', () => {
  assert.equal(COLUMN_BREAK, '***')
})

// ---------- splitColumns：页标题不参与分栏 ----------

test('splitColumns: 页内第一个标题抽成 intro，不落进第 1 栏', () => {
  const r = splitColumns('## 对比\n\n左侧内容\n\n***\n\n右侧内容')
  assert.equal(r.intro, '## 对比')
  assert.deepEqual(r.parts, ['左侧内容', '右侧内容'])
})

test('splitColumns: 页标题与首个 *** 相邻时同样抽出（两栏对称）', () => {
  const r = splitColumns('## 对比\n\n***\n\n### 方案 A\n- a\n\n***\n\n### 方案 B\n- b')
  assert.equal(r.intro, '## 对比')
  assert.equal(r.parts.length, 2)
  assert.match(r.parts[0], /方案 A/)
  assert.match(r.parts[1], /方案 B/)
})

test('splitColumns: 前导空行不影响标题抽取', () => {
  const r = splitColumns('\n\n## 标题\n\nA\n***\nB')
  assert.equal(r.intro, '## 标题')
  assert.deepEqual(r.parts, ['A', 'B'])
})

test('splitColumns: 首块不是标题时 intro 为空（整页都参与分栏）', () => {
  const r = splitColumns('- a\n- b\n***\n- c')
  assert.equal(r.intro, '')
  assert.deepEqual(r.parts, ['- a\n- b', '- c'])
})

test('splitColumns: 未分栏时不动内容（intro 归零、parts 为整页）', () => {
  // 无 *** ⇒ parts 长度 1 ⇒ 调用方（Slideshow）用原 src 渲染，行为与分栏前一致
  assert.deepEqual(splitColumns('# 标题\n\n正文'), { intro: '# 标题', before: '', parts: ['正文'], after: '' })
})

test('splitColumns: 只有标题没有正文时 parts 为空栏占位', () => {
  assert.deepEqual(splitColumns('## 只有标题'), { intro: '## 只有标题', before: '', parts: [''], after: '' })
})

// ---------- splitColumns：圈定写法（≥3 条 *** ⇒ 首尾是栏区边界） ----------
// 语义类比表格的 `|`：既是左右外框，也是内线，靠位置决定身份。
// 退化规则：1 / 2 条时圈定读法退化成空栏区 / 单栏 ⇒ 按分隔读（旧语义），见 COLUMN_REGION_MIN。

test('splitColumns: 圈定写法 —— 首尾两条是边界，栏区外的文案不参与分栏', () => {
  const r = splitColumns('引言\n\n***\n\n左栏\n\n***\n\n右栏\n\n***\n\n落款')
  assert.equal(r.intro, '')
  assert.equal(r.before, '引言')
  assert.equal(r.after, '落款')
  assert.deepEqual(r.parts, ['左栏', '右栏'])
})

test('splitColumns: 圈定写法 —— 页标题与栏外文案三者并存', () => {
  const r = splitColumns('## 标题\n\n引言\n\n***\n\nA\n\n***\n\nB\n\n***\n\n脚注')
  assert.equal(r.intro, '## 标题')
  assert.equal(r.before, '引言')
  assert.equal(r.after, '脚注')
  assert.deepEqual(r.parts, ['A', 'B'])
})

test('splitColumns: 退化规则 —— 1 条 / 2 条按分隔读（存量文档不受影响）', () => {
  // 1 条：首尾是同一条 ⇒ 圈定读法退化成空栏区，不可能是作者本意
  assert.deepEqual(splitColumns('A\n***\nB'), { intro: '', before: '', parts: ['A', 'B'], after: '' })
  // 2 条：圈定读法只有「单栏」，同样无意义 ⇒ 按 3 栏读
  assert.deepEqual(splitColumns('A\n***\nB\n***\nC').parts, ['A', 'B', 'C'])
})

test('splitColumns: 圈定写法 —— 栏外无文案时也不受影响（中间条数即分隔数）', () => {
  const r = splitColumns('***\nA\n***\nB\n***')
  assert.equal(r.before, '')
  assert.equal(r.after, '')
  assert.deepEqual(r.parts, ['A', 'B'])
})

test('splitColumns: 圈定写法 —— 围栏内的 *** 不参与计数，否则会破坏圈定', () => {
  // 栏内代码块里有一条 ***：若被计数，总条数会变成 4 ⇒ 退化判断与切分全错
  const r = splitColumns('引言\n\n***\n\n```md\n***\n```\n\n***\n\n右栏\n\n***\n\n落款')
  assert.equal(r.before, '引言')
  assert.equal(r.after, '落款')
  assert.equal(r.parts.length, 2)
  assert.match(r.parts[0], /\*\*\*/)
})

test('splitColumns: 圈定写法 —— 空栏（连续两条 ***）仍被丢弃', () => {
  const r = splitColumns('引言\n***\nA\n***\n\n***\nB\n***\n脚注')
  assert.equal(r.before, '引言')
  assert.equal(r.after, '脚注')
  assert.deepEqual(r.parts, ['A', 'B'])
})

test('COLUMN_REGION_MIN / COLUMN_REGION_SNIPPET：插入片段自洽', () => {
  // 圈定门槛 = 3 条：低于它圈定读法无意义
  assert.equal(COLUMN_REGION_MIN, 3)
  // 工具栏插的就是 3 条 ⇒ 插完即是「2 栏 + 两个待填空档」的完整形状
  const marks = COLUMN_REGION_SNIPPET.split('\n').filter((l) => l.trim() === COLUMN_BREAK).length
  assert.equal(marks, 3)
  // 光标落在第一个 *** 之后的空行上（左栏位置）
  assert.equal(COLUMN_REGION_SNIPPET[COLUMN_REGION_CURSOR - 1], '\n')
  assert.equal(COLUMN_REGION_SNIPPET.slice(COLUMN_REGION_CURSOR).startsWith('\n'), true)
  // 刚插入、两个空档都还没填时：栏外文案已就位，栏区是空占位（不会误判成分隔语义）
  const r = splitColumns(`上文${COLUMN_REGION_SNIPPET}下文`)
  assert.equal(r.before, '上文')
  assert.equal(r.after, '下文')
  assert.deepEqual(r.parts, [''])
})

// ---------- scanBlocks / detectLayout：分栏分隔块 ----------

test('scanBlocks: *** 独占一块且不合并同类型块', () => {
  const blocks = scanBlocks('- a\n- b\n***\n- c')
  assert.deepEqual(blocks.map((b) => b.type), ['ul', 'columns', 'ul'])
  assert.equal(blocks[0].items, 2)   // 没有被合并成 3
  assert.equal(blocks[2].items, 1)
})

test('detectLayout: 分栏页仍按各栏内容推断版式', () => {
  // 标题 + 两栏列表 → 仍是列表页（columns 块不参与首块判定）
  assert.equal(detectLayout('## 对比\n\n- a\n***\n- b').kind, 'content-list')
  // 页标题抽出后重拼（Slideshow 的 layoutSrc 逻辑）：标题仍是首块 ⇒ cover
  const r = splitColumns('# 标题\n\n***\n\n正文')
  assert.equal(detectLayout([r.intro, ...r.parts].filter(Boolean).join('\n\n***\n\n')).kind, 'cover')
  // 纯 ol 目录规则要求 every(ol) ⇒ 分栏页不会再被误判成"居中大号目录"
  assert.equal(detectLayout('1. a\n2. b\n***\n3. c').kind, 'content')
})

test('detectLayout: 未分栏页的既有版式不受影响（回归）', () => {
  assert.equal(detectLayout('# 标题\n\n副标题').kind, 'cover')
  assert.equal(detectLayout('## 标题\n\n- a\n- b').kind, 'content-list')
  assert.equal(detectLayout('> 引用一句').kind, 'quote')
})
