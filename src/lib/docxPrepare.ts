/**
 * DOCX 导出前的 Markdown 预处理。
 *
 * Rust 侧 `export_docx` 直接解析 Markdown，看不到预览 DOM，所以几类「预览里已经不是
 * Markdown 代码」的内容必须在这里先落成 Rust 认识的形式：
 *   · `[toc]` → `<!--yizi:toc-->` 标记，Rust 侧在该处输出 Word 的 TOC 域（见 TOC_MARKER）；
 *   · ` ```mermaid ` 围栏 → `data:image/svg+xml;base64,…` 图片（Rust 会转成 PNG/SVG 嵌入）；
 *   · 提示块自定义标题 → `<!--yizi:alert-title:base64-->` 标记（见 DOCX_ALERT_TITLE_MARKER）。
 *
 * 这里只做纯文本变换（Mermaid 的实际渲染由调用方注入），便于单元测试。
 */

import MarkdownIt from 'markdown-it'
import { splitFrontMatter } from './frontMatter.ts'
import {
  collectTocItems,
  hasTocPlaceholder,
  tocToMarkdownList,
  replaceTocPlaceholders,
} from './toc.ts'

/** UTF-8 字符串 → base64（浏览器与 Node 都有 TextEncoder / btoa） */
export function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${utf8ToBase64(svg)}`
}

/**
 * DOCX 目录域的占位标记。
 *
 * 与 Rust 侧 `docx_export.rs` 的 `TOC_MARKER` 是同一个字符串：导出时 `[toc]` 先被替换成
 * 这一行 HTML 注释，Rust 渲染到它时输出 `<w:fldChar>` 包裹的 TOC 域，目录内容与页码
 * 交给 Word 按标题的大纲级别（Heading1-6 的 `w:outlineLvl`）在「更新域」时生成。
 * 用 HTML 注释而不是可见文本，是为了它不会在 Word 里留下任何痕迹。
 */
export const DOCX_TOC_MARKER = '<!--yizi:toc-->'

/**
 * 从 Markdown 生成纯文本目录列表（按层级缩进的项目符号）。
 *
 * 导出流程已改走 TOC 域，这里不再被 `prepareMarkdownForDocx` 调用，保留作
 * 「不想要域、只要一份静态目录文本」的备用实现。
 */
export function buildTocMarkdown(markdown: string): string {
  const md = new MarkdownIt({ html: true })
  const body = splitFrontMatter(markdown).body
  return tocToMarkdownList(collectTocItems(md.parse(body, {})))
}

/**
 * 把每个 ```mermaid 围栏替换成 SVG 图片。
 * 渲染失败 / 插件未启用时保留原代码块（绝不静默丢内容）。
 */
export async function replaceMermaidFences(
  markdown: string,
  renderSvg: (code: string) => Promise<string | null>,
): Promise<string> {
  const lines = markdown.split('\n')
  let i = 0
  while (i < lines.length) {
    const open = /^(\s*)```\s*mermaid\s*$/i.exec(lines[i])
    if (!open) { i++; continue }

    let close = -1
    for (let j = i + 1; j < lines.length; j++) {
      if (/^\s*```\s*$/.test(lines[j])) { close = j; break }
    }
    if (close < 0) break

    const code = lines.slice(i + 1, close).join('\n')
    let svg: string | null = null
    try {
      svg = await renderSvg(code)
    } catch {
      svg = null
    }
    if (svg && svg.trim()) {
      lines.splice(i, close - i + 1, `${open[1]}![Mermaid diagram](${svgToDataUrl(svg)})`)
      i += 1
    } else {
      i = close + 1
    }
  }
  return lines.join('\n')
}

/**
 * 提示块自定义标题的占位标记：与 Rust `docx_export.rs` 的 `ALERT_TITLE_MARKER` 同字符串。
 * 标题用 base64 编码，避免标题里的 `-->` 等字符提前截断 HTML 注释。
 */
export const DOCX_ALERT_TITLE_MARKER = '<!--yizi:alert-title:'

/**
 * 提示块自定义标题：`> [!TIP] 小技巧` →
 * `> [!TIP]` + `> <!--yizi:alert-title:5bCP5oqA5ben-->`。
 *
 * Rust 侧的 GFM 解析器（pulldown-cmark）只在 `[!TYPE]` **独占一行**时识别提示块；
 * 标题跟在后面会让整行退化成普通引用文本，`[!TIP]` 原样漏进 Word。把标题改成标记行
 * 之后的 HTML 注释，Rust 就能按类型渲染「图标 + 彩色标题」，不出现裸露的标记。
 * 代码围栏里的内容不处理（否则会改坏示例代码）。
 */
// `]` 后与标题之间的空格可有可无（预览/实时模式同样允许 `[!TIP]小技巧`），
// 末尾的 `(.+?)` 至少一个字符，保证 `[!TIP]` 独占一行时保持原样、不被误改成空标题。
const ALERT_TITLE_LINE_RE = /^(\s*(?:>\s*)+)\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(.+?)[ \t]*$/i

export function normalizeAlertTitles(markdown: string): string {
  const out: string[] = []
  // 围栏标记与长度：只有同字符、长度不短于开围栏的行才算闭合（避免内容里的 `~~~` 提前结束）
  let fence: { char: string; len: number } | null = null
  for (const line of markdown.split('\n')) {
    const fenceMark = /^\s*(`{3,}|~{3,})/.exec(line)
    if (fence) {
      if (fenceMark && fenceMark[1][0] === fence.char && fenceMark[1].length >= fence.len) fence = null
      out.push(line)
      continue
    }
    if (fenceMark) {
      fence = { char: fenceMark[1][0], len: fenceMark[1].length }
      out.push(line)
      continue
    }

    const m = ALERT_TITLE_LINE_RE.exec(line)
    if (!m || !m[3]) { out.push(line); continue }
    out.push(
      `${m[1]}[!${m[2]}]`,
      `${m[1]}${DOCX_ALERT_TITLE_MARKER}${utf8ToBase64(m[3].trim())}-->`,
    )
  }
  return out.join('\n')
}

/** 导出 DOCX 前的完整预处理：目录 → TOC 域标记；Mermaid → 图片（行内扩展由 Rust 统一转换） */
export async function prepareMarkdownForDocx(
  markdown: string,
  renderMermaid?: (code: string) => Promise<string | null>,
  tocMaxLevel = 6,
): Promise<string> {
  // 目录域只收 1..tocMaxLevel 级；如果文档只有更深的标题，域结果会是空的，
  // 这时不生成目录（与 Word 里的实际结果一致，避免只留一个空「目录」标题）。
  const md = new MarkdownIt({ html: true })
  const hasHeadings = collectTocItems(md.parse(splitFrontMatter(markdown).body, {}))
    .some((item) => item.level <= tocMaxLevel)
  let out = normalizeAlertTitles(markdown)
  out = replaceTocPlaceholders(out, hasHeadings ? DOCX_TOC_MARKER : '')
  // 行内扩展（`^上标^` / `~下标~` / `==高亮==`）**不在这里转换**：Rust 侧
  // `inline_markers_to_html` 是唯一实现。前端再写一套规则曾导致预览已修好、
  // 导出的 DOCX 仍按旧规则把 `64K~512K、0~20` 与 `[^1]` 误判成下标/上标。
  if (renderMermaid) out = await replaceMermaidFences(out, renderMermaid)
  return out
}

/**
 * Pandoc 导出前的预处理。
 *
 * Pandoc 自己支持提示块和常见 Markdown 扩展，所以这里不做 DOCX 生成器专用的
 * 注释标记转换；只处理两类缺少 Pandoc 等价能力会明显丢效果的内容：
 *   · 显式 `[toc]` → `--toc` 参数（同时移除占位行）；普通带标题文档绝不自动加目录
 *   · Mermaid → SVG 图片，失败时仍保留原代码块
 */
export async function prepareMarkdownForPandoc(
  markdown: string,
  renderMermaid?: (code: string) => Promise<string | null>,
  tocMaxLevel = 6,
): Promise<{ markdown: string; includeToc: boolean }> {
  const md = new MarkdownIt({ html: true })
  const hasEligibleHeading = collectTocItems(md.parse(splitFrontMatter(markdown).body, {}))
    .some((item) => item.level <= tocMaxLevel)
  const includeToc = hasTocPlaceholder(markdown) && hasEligibleHeading
  let out = replaceTocPlaceholders(markdown, '')
  if (renderMermaid) out = await replaceMermaidFences(out, renderMermaid)
  return { markdown: out, includeToc }
}
