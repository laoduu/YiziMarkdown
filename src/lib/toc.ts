/**
 * `[toc]` / `[[toc]]` 目录。
 *
 * 存在两套消费方：
 *   · 预览 / PDF / HTML / 演示模式 —— markdown-it 插件直接输出 `<nav class="markdown-toc">`；
 *   · DOCX —— Rust 侧只认 Markdown，所以把占位行替换成按标题层级缩进的项目符号列表。
 *
 * 标题 id 必须和 `markdown-it` 渲染标题时的算法一致（markdownRenderer.ts 的
 * `injectHeadingIds`），否则目录链接会跳空。这里刻意复用同一份
 * `generateHeadingId`，并按「text / code_inline 子节点」取标题纯文本 —— 与渲染器完全同源。
 */

import { generateHeadingId } from './headingId.ts'

export interface TocItem {
  level: number
  text: string
  id: string
}

const TOC_PLACEHOLDER = /^(?:\[toc\]|\[\[toc\]\])$/i

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** 渲染器生成 id 时只看 text / code_inline 子节点 */
function headingIdText(inline: any): string {
  if (!inline?.children) return String(inline?.content ?? '')
  return inline.children
    .filter((t: any) => t.type === 'text' || t.type === 'code_inline')
    .map((t: any) => t.content)
    .join('')
}

/** 目录里展示的标题文本：比 id 更完整（保留公式、图片 alt、行内 HTML 的可见文字） */
function headingDisplayText(inline: any): string {
  if (!inline?.children) return String(inline?.content ?? '').trim()
  const parts: string[] = []
  for (const child of inline.children) {
    if (child.type === 'text' || child.type === 'code_inline') parts.push(child.content)
    else if (child.type === 'math_inline' || child.type === 'math_inline_double') parts.push(child.content)
    else if (child.type === 'image') parts.push(child.content || '')
    else if (child.type === 'html_inline') parts.push(String(child.content || '').replace(/<[^>]*>/g, ''))
  }
  return parts.join('').trim()
}

/**
 * 从 markdown-it token 流收集标题。
 * 只遍历真正的 heading token，代码块里的 `#` 不会混进来。
 */
export function collectTocItems(tokens: any[]): TocItem[] {
  const counter: Record<string, number> = {}
  const items: TocItem[] = []
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== 'heading_open') continue
    const inline = tokens[i + 1]
    if (!inline) continue
    const level = Number(tokens[i].tag?.slice(1) || 1)
    const text = headingDisplayText(inline) || String(inline.content ?? '').trim()
    const id = generateHeadingId(headingIdText(inline), counter)
    if (!id) continue
    items.push({ level, text, id })
  }
  return items
}

export function renderTocHtml(items: TocItem[]): string {
  if (items.length === 0) return ''
  const lis = items
    .map((it) => `<li class="markdown-toc-level-${it.level}"><a href="#${escapeHtml(it.id)}">${escapeHtml(it.text)}</a></li>`)
    .join('')
  return `<nav class="markdown-toc"><ul>${lis}</ul></nav>`
}

export interface DeckTocEntry {
  /** 标题 / 页面名 */
  text: string
  /** 目标页索引（0-based） */
  slide: number
  /** 缩进层级，默认 2 */
  level?: number
}

/**
 * 演示模式的整册目录。
 *
 * 演示文稿按 `---` 切页后，每页是**独立渲染**的（见 Slideshow.tsx 的 getSlideHtml），
 * 因此 markdown-it 的 `[toc]` 插件只能看到当前页的标题 —— 目录页通常一个标题都没有，
 * 会原样显示 `[toc]`。这里改成「整册页面清单」：链接带 `data-slide`，由 Slideshow
 * 的点击委托翻到对应页，而不是在页内做锚点跳转。
 */
export function renderDeckTocHtml(entries: DeckTocEntry[]): string {
  if (entries.length === 0) return ''
  const lis = entries
    .map((e) => `<li class="markdown-toc-level-${e.level || 2}"><a href="#" data-slide="${e.slide}">${escapeHtml(e.text)}</a></li>`)
    .join('')
  return `<nav class="markdown-toc ys-deck-toc"><ul>${lis}</ul></nav>`
}

/**
 * DOCX：把目录做成按层级缩进的项目符号列表。
 * 以最浅的标题级别为基准（有的文档没有 H1，不能固定按 level-1 缩进）。
 */
export function tocToMarkdownList(items: TocItem[]): string {
  if (items.length === 0) return ''
  const minLevel = Math.min(...items.map((it) => it.level))
  return items
    .map((it) => {
      const indent = '  '.repeat(Math.max(0, it.level - minLevel))
      const text = it.text.replace(/\r?\n/g, ' ').trim()
      return `${indent}- ${text}`
    })
    .join('\n')
}

/**
 * 把独立成段的 `[toc]` / `[[toc]]` 替换为给定文本。
 * 逐行扫描并跟踪围栏，代码块里的 `[toc]` 原样保留。
 */
export function replaceTocPlaceholders(markdown: string, replacement: string): string {
  const lines = markdown.split('\n')
  let fence: '```' | '~~~' | null = null
  return lines
    .map((line) => {
      const trimmed = line.trim()
      const fenceMatch = /^(`{3,}|~{3,})/.exec(trimmed)
      if (fenceMatch) {
        const marker = fenceMatch[1].startsWith('`') ? '```' : '~~~'
        if (fence === null) fence = marker
        else if (marker === fence) fence = null
        return line
      }
      if (fence !== null || !TOC_PLACEHOLDER.test(trimmed)) return line
      const indent = /^\s*/.exec(line)?.[0] ?? ''
      return replacement
        .split('\n')
        .map((r) => (r ? indent + r : r))
        .join('\n')
    })
    .join('\n')
}

/** markdown-it 插件：在 inline 解析之后把目录段落替换成 HTML 区块 */
export function tocPlugin(md: any): void {
  md.core.ruler.after('inline', 'toc_placeholder', (state: any) => {
    const items = collectTocItems(state.tokens)
    if (items.length === 0) return
    const html = renderTocHtml(items)
    for (let i = 0; i < state.tokens.length; i++) {
      const open = state.tokens[i]
      if (open.type !== 'paragraph_open') continue
      const inline = state.tokens[i + 1]
      if (!inline || inline.type !== 'inline') continue
      if (!TOC_PLACEHOLDER.test(String(inline.content ?? '').trim())) continue
      const token = new state.Token('html_block', '', 0)
      token.content = html
      token.block = true
      state.tokens.splice(i, 3, token)
    }
  })
}
