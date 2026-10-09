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
  COLUMN_BREAK, MAX_COLUMNS,
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

test('detectLayout: figure 图文页 / image 图片页', () => {
  assert.equal(detectLayout('![图](a.png)\n\n说明文字').kind, 'figure')
  assert.equal(detectLayout('![图](a.png)').kind, 'image')
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
  assert.deepEqual(splitColumns('正文'), { intro: '', parts: ['正文'] })
  assert.deepEqual(splitColumns(''), { intro: '', parts: [''] })
})

test('splitColumns: 两个 *** 切三栏', () => {
  assert.deepEqual(splitColumns('左\n***\n中\n***\n右'), { intro: '', parts: ['左', '中', '右'] })
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
  const { parts } = splitColumns('1\n***\n2\n***\n3\n***\n4\n***\n5')
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
  assert.deepEqual(splitColumns('# 标题\n\n正文'), { intro: '# 标题', parts: ['正文'] })
})

test('splitColumns: 只有标题没有正文时 parts 为空栏占位', () => {
  assert.deepEqual(splitColumns('## 只有标题'), { intro: '## 只有标题', parts: [''] })
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
