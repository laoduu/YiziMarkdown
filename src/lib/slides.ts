/**
 * slides.ts — 演示模式（幻灯片）的分页与自动版式推断。
 *
 * 设计原则：用户无需在 Markdown 中书写任何额外格式。
 *   - `---`（单独成行，标准 Markdown 水平分割线）→ 分页。
 *   - 版式由引擎根据每页的**整页块结构**自动推断（见 detectLayout），
 *     而非只看首块：标题层级、块组合、内容类型共同决定版式。
 *     推断规则集中维护在 LAYOUT_RULES 有序注册表中（按优先级排列），
 *     新增版式 = 注册一条规则 + slideshow.css 加对应 .ys-layout-* 样式。
 *   - 主题继承应用当前主题/明暗，不依赖 front matter 配置。
 *   - 可选的非视觉语法（均为 HTML 注释，渲染时不可见）：
 *       `<!-- notes: 内容 -->`      演讲者备注（仅演示者可见）
 *       `<!-- layout: xxx -->`      显式指定版式，覆盖自动推断（非法值忽略并回落推断）
 *       `<!-- align: xxx -->`       显式指定对齐方向（left / center / right）
 *       `<!-- fragments: off -->`   关闭该页片段逐步显示（on 恢复）
 *   - 分栏：页内**单独成行的 `***`**（标准主题分割线），与 `---` = 分页配对。
 *     它同时承担**栏区边界**与**栏分隔**两种身份（类比表格的 `|`，靠位置决定）：
 *     N 栏写 N+1 条，首尾两条圈住栏区，栏区**之外**的内容是页级文案（引言 / 落款）。
 *     1 / 2 条时圈定读法退化成空栏区 / 单栏，按分隔读（旧语义）—— 见 COLUMN_BREAK。
 *     页内第一个标题块视为**页标题**，也不参与分栏（见 splitColumns）。
 *   - 文档顶部 front matter（首个 `--- ... ---` 块）自动剥离：
 *     可提供 title/author/date 供封面页展示；`slideshow-fragments: off`
 *     可整副关闭片段逐步显示（默认开）。不会成为一页幻灯片。
 */

// 带 .ts 扩展名是**必须的**：本模块要被 `node --test` 直接加载（tests/slides.test.ts），
// 而 Node 的 ESM 解析器不做扩展名补全（见 lib/remotePath.ts 的同类说明）。
import { splitFrontMatter } from './frontMatter.ts'

/** 去掉文档顶部的 front matter（首个 `--- ... ---` 块），避免其成为一页幻灯片。
 *  解析逻辑统一在 lib/frontMatter.ts —— 此前这里与 markdownRenderer 各有一份
 *  规则不一致的正则，同一份文档在演示模式与预览模式下可能给出不同判断。 */
export function stripFrontMatter(src: string): string {
  return splitFrontMatter(src).body
}

/** 解析文档顶部 front matter（简易 YAML：仅支持 `key: value` 单行键值） */
export function parseFrontMatter(src: string): Record<string, string> {
  return splitFrontMatter(src).meta
}

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 按 `---`（单独成行）切分幻灯片，返回扁平的一页页正文。
 * fence 感知：``` 内的 `---` 视为内容不切分。
 */
export function splitSlides(src: string, hor = '---'): string[] {
  if (!src) return ['']
  const lines = src.split(/\r?\n/)
  const slides: string[] = []
  let buf: string[] = []
  let inFence = false
  const reHor = new RegExp(`^${esc(hor)}\\s*$`)

  const push = () => {
    const s = buf.join('\n')
    if (s.trim() !== '') slides.push(s)
    buf = []
  }

  for (const line of lines) {
    if (/^```/.test(line)) inFence = !inFence
    if (!inFence && reHor.test(line)) push()
    else buf.push(line)
  }
  push()

  // 去掉开头的空页（防 front matter 残留的防御性处理）
  if (slides.length > 1 && slides[0].trim() === '') slides.shift()
  return slides
}

/** 分栏标记：单独成行的标准主题分割线 `***`
 *  （`---` 已被 splitSlides 用作分页；`___` / `- - -` 仍是普通分隔线 → <hr>）
 *
 *  它同时承担**栏区边界**与**栏分隔**两种身份 —— 类比表格的 `|`：
 *  既是左右外框，也是内线，靠位置决定身份：
 *
 *      `***` 左栏 `***` 右栏 `***`
 *
 *  首尾两条是栏区边界，中间的是分隔 ⇒ **N 栏写 N+1 条**。
 *  栏区**之外**的内容是页级文案（before / after），整页横跨、不参与分栏。
 *
 *  ⚠️ 退化规则（不是兼容垫片，是语义逼出来的）：条数 ≤2 时圈定读法退化成
 *  「空栏区」（1 条：首尾是同一条）或「单栏」（2 条：中间没有分隔），
 *  作者不可能是那个意思 ⇒ 这两档一律按**分隔**读（旧语义：条数 + 1 = 栏数）。
 *  唯一的代价：写满 4 栏（3 条）会被读成「2 栏 + 栏外文案」，语法上无法区分，见 changelog。 */
export const COLUMN_BREAK = '***'

/** 分栏上限：超过则把后续各栏并入最后一栏（一页切太多栏没人看得清）。 */
export const MAX_COLUMNS = 4

/** 达到这个条数才启用「圈定」读法（首尾为边界）。1 / 2 条按分隔读，见 COLUMN_BREAK。 */
export const COLUMN_REGION_MIN = 3

/** 工具栏 / 斜杠菜单插入的**分栏区间**片段：三条 `***` = 2 栏的形状
 *  （首尾两条是栏区边界，中间一条是分隔），两个空档正好是左栏与右栏。
 *  之所以插三条而不是两条：两条按退化规则会被读成「3 栏」，写法必须自洽。 */
export const COLUMN_REGION_SNIPPET = `\n${COLUMN_BREAK}\n\n${COLUMN_BREAK}\n\n${COLUMN_BREAK}\n`

/** 插入 COLUMN_REGION_SNIPPET 后光标的落点（相对插入点的偏移）：
 *  第一个空档，也就是左栏。用户照着光标位置填即可，不必先理解语法 ——
 *  填完左栏，下面那个空档自然就是右栏。 */
export const COLUMN_REGION_CURSOR = `\n${COLUMN_BREAK}\n`.length

/** 分栏结果：页标题 + 栏外文案（前/后）+ 各栏正文 */
export interface ColumnSplit {
  /** 页标题：页内**第一个标题块**（ATX `#`~`######`）。单独整页渲染，不参与分栏；
   *  无标题时为空串。为什么必须抽出来 —— 否则标题会落进第 1 栏，
   *  表现为「左栏带标题、右栏内容顶端高于标题」的错位观感。 */
  intro: string
  /** 栏区**之前**的页级文案（引言）：整页横跨、不参与分栏；未圈定时恒为空串 */
  before: string
  /** 各栏 Markdown 源；**长度 1 = 未分栏** */
  parts: string[]
  /** 栏区**之后**的页级文案（落款 / 脚注）：同 before；未圈定时恒为空串 */
  after: string
}

/** 取出页内第一个标题块（ATX 标题单行成块），返回 { intro, body } */
function splitLeadingHeading(src: string): { intro: string; body: string } {
  const lines = src.split(/\r?\n/)
  let i = 0
  // 跳过前导空行
  while (i < lines.length && lines[i].trim() === '') i++
  // 不做 fence 判断：页首第一个非空行若是围栏（```）就不可能是 ATX 标题
  if (i >= lines.length || !/^#{1,6}\s/.test(lines[i].trim())) return { intro: '', body: src }
  const intro = lines[i].trim()
  // 标题行之后的内容：丢掉紧随其后的空行，避免首栏内容以换行开头
  const rest = lines.slice(i + 1)
  while (rest.length && rest[0].trim() === '') rest.shift()
  return { intro, body: rest.join('\n') }
}

/** 只去掉首尾**空行**（不动行首缩进 —— 缩进的代码块 / 嵌套列表是合法内容） */
function trimBlankLines(lines: string[]): string {
  const buf = [...lines]
  while (buf.length && buf[0].trim() === '') buf.shift()
  while (buf.length && buf[buf.length - 1].trim() === '') buf.pop()
  return buf.join('\n')
}

/** 找出栏标记所在行的下标（fence 感知、逐字匹配，口径与 splitColumns 历史实现一致） */
function findColumnMarkers(lines: string[]): number[] {
  const re = new RegExp(`^${esc(COLUMN_BREAK)}\\s*$`)
  const idx: number[] = []
  let inFence = false
  lines.forEach((line, i) => {
    if (/^```/.test(line)) { inFence = !inFence; return }
    if (!inFence && re.test(line)) idx.push(i)
  })
  return idx
}

/**
 * 按 `***`（单独成行）把一页切成多栏。
 *   - 与 splitSlides 对称：fence 感知（``` 内的 `***` 是内容）、逐字匹配（行内只有 `***`）。
 *   - **页内第一个标题块会被抽成 `intro`**（页标题），不参与分栏 —— 见 ColumnSplit。
 *   - **圈定读法**：条数 ≥ COLUMN_REGION_MIN 时首尾两条是栏区边界 ⇒ 栏区外的内容落入
 *     before / after（页级文案，不参与分栏）；条数 ≤2 时全部内容参与分栏（旧语义）。
 *   - 空栏（连续两个 `***`）被丢弃；**parts 长度 1 = 未分栏**。
 *   - 超过 max：保留前 max-1 栏，其余并入最后一栏并 console.warn
 *     （与 extractDirectives 的 warn 风格一致）—— 任何内容都不会被丢弃。
 */
export function splitColumns(src: string, max = MAX_COLUMNS): ColumnSplit {
  if (!src) return { intro: '', before: '', parts: [''], after: '' }
  const { intro, body } = splitLeadingHeading(src)
  const lines = body.split(/\r?\n/)
  const markers = findColumnMarkers(lines)

  // 圈定：首尾两条当边界吃掉，中间的才是分隔；栏区外的落入 before / after
  const balanced = markers.length >= COLUMN_REGION_MIN
  let before = ''
  let after = ''
  let region = lines
  let seps = markers
  if (balanced) {
    const first = markers[0]
    const last = markers[markers.length - 1]
    before = trimBlankLines(lines.slice(0, first))
    after = trimBlankLines(lines.slice(last + 1))
    region = lines.slice(first + 1, last)
    seps = markers.slice(1, -1).map((i) => i - first - 1)
  }

  const parts: string[] = []
  let start = 0
  for (const end of [...seps, region.length]) {
    const s = trimBlankLines(region.slice(start, end))
    if (s !== '') parts.push(s)   // 空栏丢弃
    start = end + 1
  }

  if (!parts.length) return { intro, before, parts: [''], after }
  if (parts.length <= max) return { intro, before, parts, after }

  console.warn(`[slideshow] 分栏数 ${parts.length} 超过上限 ${max}，已把后续内容并入第 ${max} 栏。`)
  const head = parts.slice(0, max - 1)
  head.push(parts.slice(max - 1).join('\n\n'))
  return { intro, before, parts: head, after }
}

/** 逐行标记「这一行是否在代码围栏内」（``` 开/关，与 splitSlides / splitColumns 同一口径）。
 *
 *  指令与备注的提取**必须**做这个判断：此前 `extractDirectives` / `extractNotes` 是直接在
 *  **原始文本**上跑正则，分不清正文与代码块 ⇒ 文档里只要**提到** `<!-- layout: xxx -->`
 *  （哪怕是在代码块里教语法、在表格里列表格、在行内代码里举例子），它就会被真的执行、
 *  并从正文里剥掉 —— 写说明文档的人会被自己讲的内容坑到。
 *  `---` 分页与 `***` 分栏早就做了 fence 感知，这里补齐同样的约定。 */
function fenceMask(lines: string[]): boolean[] {
  const mask: boolean[] = []
  let inFence = false
  for (const line of lines) {
    const t = line.trim()
    if (/^```/.test(t)) { mask.push(true); inFence = !inFence; continue }
    mask.push(inFence)
  }
  return mask
}

/** 指令的识别口径：**独占一行**（trim 后整行就是这条注释）。
 *  与 `---` / `***` 完全一致 —— 那两个也正是「单独成行」才算数。
 *  一条规则同时挡掉正文、表格单元格、行内代码三种误触：它们的行都以别的字符开头。 */
const DIRECTIVE_LINE = /^<!--\s*(layout|align|fragments)\s*:\s*([a-z-]+)\s*-->$/i

/** 备注块的起始行：同样必须独占一行 */
const NOTES_OPEN = /^<!--\s*notes\b/i

export interface NotesResult {
  body: string
  notes: string
}

/**
 * 提取并剥离演讲者备注注释（`<!-- notes ... -->`），返回剥离后的正文与备注文本。
 * 支持单行 `<!-- notes: 内容 -->` 与多行 `<!-- notes\n内容\n-->`。
 * 只认**独占一行**的注释，且**跳过代码围栏**（见 fenceMask）。
 */
export function extractNotes(raw: string): NotesResult {
  const lines = raw.split(/\r?\n/)
  const inFence = fenceMask(lines)
  const parts: string[] = []
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (inFence[i] || !NOTES_OPEN.test(line.trim())) {
      out.push(line)
      i++
      continue
    }
    // 备注块：起始行独占一行；同一行闭合，或一直收到 `-->` 所在行为止（多行形态）
    let content = line.trim().replace(/^<!--\s*notes/i, '')
    if (content.includes('-->')) {
      content = content.replace(/-->\s*$/, '')
    } else {
      i++
      while (i < lines.length && !lines[i].includes('-->')) {
        content += '\n' + lines[i]
        i++
      }
      if (i < lines.length) content += '\n' + lines[i].replace(/-->\s*$/, '')
    }
    const text = content.replace(/^[ \t]*/gm, '').trim().replace(/^:\s*/, '')
    if (text) parts.push(text)
    out.push('')   // 留一个空行，免得把上下两段正文粘在一起
    i++
  }
  return { body: out.join('\n'), notes: parts.join('\n').trim() }
}

/** 显式版式/对齐/片段指令（HTML 注释形式，可选） */
export interface Directives {
  layout?: SlideKind
  align?: 'left' | 'center' | 'right'
  /** 片段逐步显示覆盖：off 关闭该页分段，on 恢复（未设置 = 跟随 deck 级配置） */
  fragments?: 'on' | 'off'
}

/** 合法版式值（与 SlideKind 一致，供指令校验） */
export function isValidLayout(v: string): v is SlideKind {
  return (LAYOUT_KINDS as readonly string[]).includes(v)
}

/** 落一条指令；非法值一律忽略并 console.warn（不打断播放） */
function applyDirective(directives: Directives, rawKey: string, rawVal: string): void {
  const k = rawKey.toLowerCase()
  const v = rawVal.toLowerCase()
  if (k === 'layout') {
    if (isValidLayout(v)) directives.layout = v
    else console.warn(`[slideshow] 未知版式 "${rawVal}"，已忽略该指令并使用自动推断。可用值：${LAYOUT_KINDS.join(' / ')}`)
  }
  if (k === 'align') {
    if (v === 'left' || v === 'center' || v === 'right') directives.align = v
    else console.warn(`[slideshow] 未知对齐 "${rawVal}"，已忽略该指令。可用值：left / center / right`)
  }
  if (k === 'fragments') {
    if (v === 'on' || v === 'off') directives.fragments = v
    else console.warn(`[slideshow] 未知 fragments 值 "${rawVal}"，已忽略该指令。可用值：on / off`)
  }
}

/**
 * 提取 `<!-- layout: xxx -->`、`<!-- align: xxx -->`、`<!-- fragments: xxx -->`
 * 指令并剥离它们。layout 非法值 → 忽略该指令（回落自动推断）并 console.warn。
 *
 * ⚠️ 只认**独占一行**且**不在代码围栏内**的注释（见 DIRECTIVE_LINE / fenceMask）——
 * 在正文、代码块、行内代码、表格里「提到」指令**不会**被误当成指令。
 */
export function extractDirectives(raw: string): { body: string; directives: Directives } {
  const directives: Directives = {}
  const lines = raw.split(/\r?\n/)
  const inFence = fenceMask(lines)
  const body = lines.map((line, i) => {
    if (inFence[i]) return line
    const m = DIRECTIVE_LINE.exec(line.trim())
    if (!m) return line
    applyDirective(directives, m[1], m[2])
    return ''   // 整行剥掉（留空行，行号不漂）
  }).join('\n')
  return { body, directives }
}

/** 版式：根据整页 Markdown 结构推断出的布局。
 *  `figure` 是例外 —— 它**不会被自动推断命中**（见 LAYOUT_RULES 里的说明），
 *  只作为 `<!-- layout: figure -->` 的合法取值保留。 */
export type SlideKind =
  | 'cover' | 'section' | 'thanks' | 'agenda'
  | 'content' | 'content-list' | 'table' | 'roadmap'
  | 'figure' | 'image' | 'quote' | 'code' | 'chart' | 'formula'

/** 全部合法版式（供指令校验与帮助文档；**不是**都能被自动推断命中 ——
 *  figure 仅能通过 `<!-- layout: figure -->` 显式指定，自动路径共 13 种） */
export const LAYOUT_KINDS: SlideKind[] = [
  'cover', 'section', 'thanks', 'agenda',
  'content', 'content-list', 'table', 'roadmap',
  'figure', 'image', 'quote', 'code', 'chart', 'formula',
]

export interface SlideLayout {
  kind: SlideKind
  /** 页内第一个标题的纯文本（供章节标记 / 封面展示） */
  title?: string
}

/** 块类型（scanBlocks 产出） */
export type BlockType =
  | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  | 'p' | 'ul' | 'ol' | 'task' | 'quote' | 'table'
  | 'image' | 'formula' | 'code' | 'chart'
  /** 分栏分隔（`***`）：独占一块、不参与合并 —— 仅用于打断同类型块合并，
   *  使版式推断不会把跨栏的两个列表当成一个（见 splitColumns）。 */
  | 'columns'

/** 块级分组结果：类型 + 列表项/图片张数 + 最大嵌套深度（前导缩进空格数） */
export interface BlockInfo {
  type: BlockType
  /** 列表项数 / 图片张数（其他类型为 1） */
  items: number
  /** 列表最大前导缩进（空格数），非列表为 0 */
  depth: number
}

const isListLine = (t: string): BlockType | null => {
  if (/^[-*+]\s+\[[ xX]\]/.test(t)) return 'task'
  if (/^[-*+]\s/.test(t)) return 'ul'
  if (/^\d+[.)]\s/.test(t)) return 'ol'
  return null
}

/**
 * 扫描整页的块结构（块级分组，fence 感知）：
 *   - 连续普通文本行合并为一个 p（Markdown 软换行语义）
 *   - 连续列表项行合并为一块，跨空行（loose list）直到出现非列表行
 *   - 连续 `>` 行合并为一块 quote；连续 `|` 行为一块 table；连续 `![` 行为一块 image
 *   - 标题、fence、`$$` 各自成块（标题不合并）
 */
export function scanBlocks(src: string): BlockInfo[] {
  const lines = src.split(/\r?\n/)
  const blocks: BlockInfo[] = []
  let inFence = false
  let fenceLang = ''

  const pushBlock = (type: BlockType, items = 1, depth = 0) => {
    const last = blocks[blocks.length - 1]
    // 同类型连续块合并：p（软换行）、列表跨空行（loose list）、quote/table/image 连续行
    if (last && last.type === type) {
      last.items += items
      last.depth = Math.max(last.depth, depth)
      return
    }
    blocks.push({ type, items, depth })
  }

  for (const line of lines) {
    const t = line.trim()
    if (inFence) {
      if (/^```/.test(t)) { inFence = false; pushBlock(fenceLang === 'mermaid' ? 'chart' : 'code') }
      continue
    }
    if (/^```/.test(t)) { inFence = true; fenceLang = t.replace(/^```/, '').trim().toLowerCase(); continue }
    if (t === '') continue
    // 分栏分隔独占一块、不参与合并：否则 pushBlock 会把跨栏的两个同类型块
    // （如两个列表）合并成一个，版式推断结果随之改变。
    if (t === COLUMN_BREAK) { blocks.push({ type: 'columns', items: 1, depth: 0 }); continue }
    const heading = t.match(/^#{1,6}\s/)
    if (heading) { blocks.push({ type: `h${heading[0].length - 1}` as BlockType, items: 1, depth: 0 }); continue }
    if (/^>\s?/.test(t)) { pushBlock('quote'); continue }
    if (/^\|/.test(t)) { pushBlock('table'); continue }
    if (/^!\[/.test(t)) { pushBlock('image'); continue }
    if (/^\$\$/.test(t)) { blocks.push({ type: 'formula', items: 1, depth: 0 }); continue }
    const list = isListLine(t)
    if (list) {
      const indent = line.length - line.trimStart().length
      pushBlock(list, 1, indent)
      continue
    }
    pushBlock('p')
  }
  if (inFence) pushBlock(fenceLang === 'mermaid' ? 'chart' : 'code')
  return blocks
}

/** 从页内第一个标题行提取纯文本（去掉 markdown 标记） */
export function extractTitle(src: string): string | undefined {
  const line = src.split(/\r?\n/).find((l) => /^#{1,6}\s/.test(l.trim()))
  if (!line) return undefined
  return line
    .replace(/^#{1,6}\s+/, '')
    .replace(/[*_`~]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .trim()
}

/** 版式规则上下文 */
export interface LayoutContext {
  /** 块级分组结果（scanBlocks 产出） */
  blocks: BlockInfo[]
  /** 页内第一个标题的纯文本（小写，供语义匹配） */
  title: string
}

/** 版式注册表条目：kind + 按优先级排列的匹配谓词 */
export interface LayoutRule {
  kind: SlideKind
  match: (ctx: LayoutContext) => boolean
}

const first = (ctx: LayoutContext): BlockInfo | undefined => ctx.blocks[0]
const rest = (ctx: LayoutContext): BlockInfo[] => ctx.blocks.slice(1)
const firstIsHeading = (ctx: LayoutContext): boolean => {
  const f = first(ctx)
  return !!f && /^h[23]$/.test(f.type)
}
const restHas = (ctx: LayoutContext, types: BlockType[]): boolean =>
  rest(ctx).some((b) => types.includes(b.type))

/**
 * 版式注册表（有序，按优先级排列；detectLayout 按序折叠取首个命中）。
 * 新增版式：在此注册一条规则 + slideshow.css 加 .ys-layout-{kind} 样式
 * + LAYOUT_KINDS 登记（校验与文档自动跟随）。
 */
export const LAYOUT_RULES: LayoutRule[] = [
  // 结尾页：H1 且文本为 谢谢/感谢/Thanks/Q&A
  {
    kind: 'thanks',
    match: (ctx) => first(ctx)?.type === 'h1'
      && /^(谢谢|感谢|thanks|thank you|q\s*&\s*a|the end)$/i.test(ctx.title),
  },
  // 封面页：H1 开头
  { kind: 'cover', match: (ctx) => first(ctx)?.type === 'h1' },
  // 章节过渡页：仅 H2/H3 无正文
  { kind: 'section', match: (ctx) => firstIsHeading(ctx) && ctx.blocks.length === 1 },
  // 目录页：标题含 目录/大纲/agenda 且含有序列表
  {
    kind: 'agenda',
    match: (ctx) => firstIsHeading(ctx)
      && ctx.blocks.some((b) => b.type === 'ol')
      && /^(目录|大纲|agenda|contents|table of contents|toc)$/i.test(ctx.title),
  },
  // 图表页 / 代码页 / 数据表页 / 路线图页 / 公式页：H2/H3 + 对应内容块，或整页该内容
  { kind: 'chart', match: (ctx) => (firstIsHeading(ctx) && restHas(ctx, ['chart'])) || first(ctx)?.type === 'chart' },
  { kind: 'code', match: (ctx) => (firstIsHeading(ctx) && restHas(ctx, ['code'])) || first(ctx)?.type === 'code' },
  { kind: 'table', match: (ctx) => (firstIsHeading(ctx) && restHas(ctx, ['table'])) || first(ctx)?.type === 'table' },
  { kind: 'roadmap', match: (ctx) => (firstIsHeading(ctx) && restHas(ctx, ['task'])) || first(ctx)?.type === 'task' },
  { kind: 'formula', match: (ctx) => (firstIsHeading(ctx) && restHas(ctx, ['formula'])) || first(ctx)?.type === 'formula' },
  // 列表内容页：H2/H3 + 列表
  { kind: 'content-list', match: (ctx) => firstIsHeading(ctx) && restHas(ctx, ['ul', 'ol', 'task']) },
  // 目录页（纯有序列表）：整页 ≥3 项的 ol
  {
    kind: 'agenda',
    match: (ctx) => {
      const f = first(ctx)
      return !!f && f.type === 'ol'
        && ctx.blocks.every((b) => b.type === 'ol')
        && ctx.blocks.reduce((n, b) => n + b.items, 0) >= 3
    },
  },
  // 引用页（金句页）：引用开头（仅首块；H2+引用 → content）
  { kind: 'quote', match: (ctx) => first(ctx)?.type === 'quote' },
  // 图片页：图片开头（无论后面还有没有文字）。
  // ⚠️ 曾经这里还有一条 `figure` 规则（图片开头 + 后跟文字 → 左图右文 45/55 双栏），
  // v0.3.4 起**移除自动推断**：左右并排是「想要才要」的版式，不该由引擎猜。
  // 想并排就用 `***` 分栏（还能自由指定几栏、栏内对齐与卡片）；确实要左图右文的人
  // 仍可显式 `<!-- layout: figure -->`，对应样式全部保留。
  // 图与文的默认表现改为**按书写顺序纵向排列**，图片自身居中（见 .ys-slide > img）。
  { kind: 'image', match: (ctx) => first(ctx)?.type === 'image' },
  // 内容页：默认兜底
  { kind: 'content', match: () => true },
]

/**
 * 根据整页块结构推断自动版式：按 LAYOUT_RULES 注册表顺序折叠，取首个命中。
 * 规则清单见 LAYOUT_RULES 注释。
 */
export function detectLayout(src: string): SlideLayout {
  const blocks = scanBlocks(src)
  if (!blocks.length) return { kind: 'content' }
  const title = extractTitle(src) || ''
  const ctx: LayoutContext = { blocks, title: title.toLowerCase() }
  const rule = LAYOUT_RULES.find((r) => r.match(ctx))
  return { kind: rule!.kind, title: title || undefined }
}

/** 兼容旧接口：仅返回版式名 */
export function detectSlideKind(src: string): SlideKind {
  return detectLayout(src).kind
}
