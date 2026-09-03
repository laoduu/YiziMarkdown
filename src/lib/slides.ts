/**
 * slides.ts — 演示模式（幻灯片）的分页与自动版式推断。
 *
 * 设计原则：用户无需在 Markdown 中书写任何额外格式。
 *   - `---`（单独成行，标准 Markdown 水平分割线）→ 分页。
 *   - 版式由引擎根据每页的**整页块结构**自动推断（见 detectLayout），
 *     而非只看首块：标题层级、块组合、内容类型共同决定版式。
 *   - 主题继承应用当前主题/明暗，不依赖 front matter 配置。
 *   - 可选的非视觉语法（均为 HTML 注释，渲染时不可见）：
 *       `<!-- notes: 内容 -->`    演讲者备注（仅演示者可见）
 *       `<!-- layout: xxx -->`    显式指定版式，覆盖自动推断
 *       `<!-- align: left -->`    显式指定对齐方向
 *   - 文档顶部 front matter（首个 `--- ... ---` 块）自动剥离：
 *     可提供 title/author/date 供封面页展示，不会成为一页幻灯片。
 */

/** 去掉文档顶部的 front matter（首个 `--- ... ---` 块），避免其成为一页幻灯片 */
export function stripFrontMatter(src: string): string {
  return src.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
}

/** 解析文档顶部 front matter（简易 YAML：仅支持 `key: value` 单行键值） */
export function parseFrontMatter(src: string): Record<string, string> {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
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

/** 显式版式/对齐指令（HTML 注释形式，可选） */
export interface Directives {
  layout?: SlideKind
  align?: 'left' | 'center' | 'right'
}

/** 提取 `<!-- layout: xxx -->` 与 `<!-- align: xxx -->` 指令并剥离它们 */
export function extractDirectives(raw: string): { body: string; directives: Directives } {
  const directives: Directives = {}
  const re = /<!--\s*(layout|align)\s*:\s*([a-z-]+)\s*-->/gi
  const body = raw.replace(re, (_m, key: string, val: string) => {
    const k = key.toLowerCase()
    const v = val.toLowerCase()
    if (k === 'layout') directives.layout = v as SlideKind
    if (k === 'align') directives.align = v as Directives['align']
    return ''
  })
  return { body, directives }
}

/** 自动版式：根据整页 Markdown 结构推断出的布局 */
export type SlideKind =
  | 'cover' | 'section' | 'thanks' | 'agenda'
  | 'content' | 'content-list' | 'table' | 'roadmap'
  | 'figure' | 'image' | 'quote' | 'code' | 'chart' | 'formula'

export interface SlideLayout {
  kind: SlideKind
  /** 页内第一个标题的纯文本（供章节标记 / 封面展示） */
  title?: string
}

/** 扫描整页的块类型序列（轻量行扫描，fence 感知） */
function scanBlocks(src: string): string[] {
  const lines = src.split(/\r?\n/)
  const blocks: string[] = []
  let inFence = false
  let fenceLang = ''
  for (const line of lines) {
    const t = line.trim()
    if (inFence) {
      if (/^```/.test(t)) { inFence = false; blocks.push(fenceLang === 'mermaid' ? 'chart' : 'code') }
      continue
    }
    if (/^```/.test(t)) { inFence = true; fenceLang = t.replace(/^```/, '').trim().toLowerCase(); continue }
    if (t === '') continue
    if (/^#{1,6}\s/.test(t)) {
      const level = t.match(/^#{1,6}/)![0].length
      blocks.push(`h${level}`)
      continue
    }
    if (/^>\s?/.test(t)) { blocks.push('quote'); continue }
    if (/^\|/.test(t)) { blocks.push('table'); continue }
    if (/^!\[/.test(t)) { blocks.push('image'); continue }
    if (/^\$\$/.test(t)) { blocks.push('formula'); continue }
    if (/^[-*+]\s+\[[ xX]\]/.test(t)) { blocks.push('task'); continue }
    if (/^[-*+]\s/.test(t)) { blocks.push('ul'); continue }
    if (/^\d+[.)]\s/.test(t)) { blocks.push('ol'); continue }
    blocks.push('p')
  }
  if (inFence) blocks.push(fenceLang === 'mermaid' ? 'chart' : 'code')
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

/**
 * 根据整页块结构推断自动版式（规则按优先级排列）：
 *   - H1 且文本为 谢谢/感谢/Thanks/Q&A → thanks 结尾页
 *   - H1（含副标题段落）→ cover 封面页
 *   - 仅 H2/H3 无正文 → section 章节过渡页
 *   - 整页有序列表 → agenda 目录页
 *   - mermaid 围栏 → chart；代码围栏 → code；引用 → quote
 *   - 图片 + 文字 → figure 图文页；仅图片 → image
 *   - 表格 → table；任务列表 → roadmap；公式 → formula
 *   - H2/H3 + 列表 → content-list；其余 → content
 */
export function detectLayout(src: string): SlideLayout {
  const blocks = scanBlocks(src)
  const first = blocks[0]
  if (!first) return { kind: 'content' }
  const title = extractTitle(src)
  const t = (title || '').toLowerCase()

  if (first === 'h1' && /^(谢谢|感谢|thanks|thank you|q\s*&\s*a|the end)$/i.test(t)) {
    return { kind: 'thanks', title }
  }
  if (first === 'h1') return { kind: 'cover', title }
  if (first === 'h2' || first === 'h3') {
    if (blocks.length === 1) return { kind: 'section', title }
    // 目录页：标题含 目录/大纲/agenda 且含有序列表
    if (blocks.some((b) => b === 'ol') && /^(目录|大纲|agenda|contents|table of contents|toc)$/i.test(t)) {
      return { kind: 'agenda', title }
    }
    const rest = blocks.slice(1)
    if (rest.some((b) => b === 'chart')) return { kind: 'chart', title }
    if (rest.some((b) => b === 'code')) return { kind: 'code', title }
    if (rest.some((b) => b === 'table')) return { kind: 'table', title }
    if (rest.some((b) => b === 'task')) return { kind: 'roadmap', title }
    if (rest.some((b) => b === 'formula')) return { kind: 'formula', title }
    if (rest.some((b) => b === 'ul' || b === 'ol' || b === 'task')) return { kind: 'content-list', title }
    return { kind: 'content', title }
  }
  if (first === 'ol' && blocks.length >= 3 && blocks.every((b) => b === 'ol')) return { kind: 'agenda', title }
  if (first === 'chart') return { kind: 'chart', title }
  if (first === 'code') return { kind: 'code', title }
  if (first === 'quote') return { kind: 'quote', title }
  if (first === 'image') {
    const hasText = blocks.some((b) => b === 'p' || b === 'ul' || b === 'ol' || b === 'h2' || b === 'h3')
    return hasText ? { kind: 'figure', title } : { kind: 'image', title }
  }
  if (first === 'table') return { kind: 'table', title }
  if (first === 'task') return { kind: 'roadmap', title }
  if (first === 'formula') return { kind: 'formula', title }
  if ((first === 'h2' || first === 'h3') && blocks.some((b) => b === 'ul' || b === 'ol' || b === 'task')) {
    return { kind: 'content-list', title }
  }
  return { kind: 'content', title }
}

/** 兼容旧接口：仅返回版式名 */
export function detectSlideKind(src: string): SlideKind {
  return detectLayout(src).kind
}
