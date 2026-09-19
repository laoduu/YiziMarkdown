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
 *   - 文档顶部 front matter（首个 `--- ... ---` 块）自动剥离：
 *     可提供 title/author/date 供封面页展示；`slideshow-fragments: off`
 *     可整副关闭片段逐步显示（默认开）。不会成为一页幻灯片。
 */

/** 去掉文档顶部的 front matter（首个 `--- ... ---` 块），避免其成为一页幻灯片 */
export function stripFrontMatter(src: string): string {
  return src.replace(/^\s*---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
}

/** 解析文档顶部 front matter（简易 YAML：仅支持 `key: value` 单行键值） */
export function parseFrontMatter(src: string): Record<string, string> {
  const m = src.match(/^\s*---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!m) return {}
  const meta: Record<string, string> = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-zA-Z_][\w-]*)\s*:\s*(.*)$/)
    if (kv) meta[kv[1].toLowerCase()] = kv[2].trim().replace(/^["']|["']$/g, '')
  }
  return meta
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

export interface NotesResult {
  body: string
  notes: string
}

/**
 * 提取并剥离演讲者备注注释（`<!-- notes ... -->`），返回剥离后的正文与备注文本。
 * 支持单行 `<!-- notes: 内容 -->` 与多行 `<!-- notes\n内容\n-->`。
 */
export function extractNotes(raw: string): NotesResult {
  const parts: string[] = []
  const re = /<!--\s*notes([\s\S]*?)-->/gi
  const body = raw.replace(re, (_, content: string) => {
    const text = content.replace(/^[ \t]*/gm, '').trim()
    parts.push(text.replace(/^:\s*/, ''))
    return ''
  })
  return { body, notes: parts.join('\n').trim() }
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

/**
 * 提取 `<!-- layout: xxx -->`、`<!-- align: xxx -->`、`<!-- fragments: xxx -->`
 * 指令并剥离它们。layout 非法值 → 忽略该指令（回落自动推断）并 console.warn。
 */
export function extractDirectives(raw: string): { body: string; directives: Directives } {
  const directives: Directives = {}
  const re = /<!--\s*(layout|align|fragments)\s*:\s*([a-z-]+)\s*-->/gi
  const body = raw.replace(re, (_m, key: string, val: string) => {
    const k = key.toLowerCase()
    const v = val.toLowerCase()
    if (k === 'layout') {
      if (isValidLayout(v)) directives.layout = v
      else console.warn(`[slideshow] 未知版式 "${val}"，已忽略该指令并使用自动推断。可用值：${LAYOUT_KINDS.join(' / ')}`)
    }
    if (k === 'align') {
      if (v === 'left' || v === 'center' || v === 'right') directives.align = v
      else console.warn(`[slideshow] 未知对齐 "${val}"，已忽略该指令。可用值：left / center / right`)
    }
    if (k === 'fragments') {
      if (v === 'on' || v === 'off') directives.fragments = v
      else console.warn(`[slideshow] 未知 fragments 值 "${val}"，已忽略该指令。可用值：on / off`)
    }
    return ''
  })
  return { body, directives }
}

/** 自动版式：根据整页 Markdown 结构推断出的布局 */
export type SlideKind =
  | 'cover' | 'section' | 'thanks' | 'agenda'
  | 'content' | 'content-list' | 'table' | 'roadmap'
  | 'figure' | 'image' | 'quote' | 'code' | 'chart' | 'formula'

/** 全部合法版式（注册表派生的唯一事实源，供指令校验与帮助文档） */
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
  // 图文页 / 图片页：图片开头，后跟文字 → figure，否则整页图
  {
    kind: 'figure',
    match: (ctx) => {
      if (first(ctx)?.type !== 'image') return false
      return restHas(ctx, ['p', 'ul', 'ol', 'h2', 'h3'])
    },
  },
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
