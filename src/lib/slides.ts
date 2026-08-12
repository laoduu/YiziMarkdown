/**
 * slides.ts — 演示模式（幻灯片）的分页与自动版式推断。
 *
 * 设计原则：用户无需在 Markdown 中书写任何额外格式。
 *   - `---`（单独成行，标准 Markdown 水平分割线）→ 分页。
 *   - 版式由引擎根据每页的 Markdown 结构自动推断（见 detectSlideKind）。
 *   - 主题继承应用当前主题/明暗，不依赖 front matter 配置。
 *   - 唯一可选的非视觉语法：`<!-- notes -->` 演讲者备注（仅演示者可见）。
 */

/** 去掉文档顶部的 front matter（首个 `--- ... ---` 块），避免其成为一页幻灯片 */
export function stripFrontMatter(src: string): string {
  return src.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
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

/** 自动版式：根据每页的 Markdown 结构推断出的布局 */
export type SlideKind =
  | 'title' | 'content'
  | 'image' | 'quote' | 'code' | 'chart'

/**
 * 根据幻灯片正文推断自动版式。
 * 规则：
 *   - 首行 `# `（H1）→ title（封面标题强调，居中大标题）
 *   - 首行 `## `~`###### `、段落、列表、表格等 → content（块居中、正文左对齐）
 *   - 首行图片 → image；mermaid 代码围栏 → chart；代码围栏 → code
 *   - 首行引用 → quote
 *   - 其余 → content
 */
export function detectSlideKind(src: string): SlideKind {
  const body = src.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '')
  const first = body[0] || ''
  if (/^#\s/.test(first)) return 'title'
  if (/^#{1,6}\s/.test(first)) return 'content'
  if (/^!\[/.test(first)) return 'image'
  if (/^```mermaid/i.test(first)) return 'chart'
  if (/^```/.test(first)) return 'code'
  if (/^>\s?/.test(first)) return 'quote'
  return 'content'
}
