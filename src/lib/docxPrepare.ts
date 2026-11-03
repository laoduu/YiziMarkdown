/**
 * DOCX 导出前的 Markdown 预处理。
 *
 * Rust 侧 `export_docx` 直接解析 Markdown，看不到预览 DOM，所以两类「预览里已经不是
 * Markdown 代码」的内容必须在这里先落成 Rust 认识的形式：
 *   · `[toc]` → `<!--yizi:toc-->` 标记，Rust 侧在该处输出 Word 的 TOC 域（见 TOC_MARKER）；
 *   · ` ```mermaid ` 围栏 → `data:image/svg+xml;base64,…` 图片（Rust 会转成 PNG/SVG 嵌入）。
 *
 * 这里只做纯文本变换（Mermaid 的实际渲染由调用方注入），便于单元测试。
 */

import MarkdownIt from 'markdown-it'
import { splitFrontMatter } from './frontMatter.ts'
import { collectTocItems, tocToMarkdownList, replaceTocPlaceholders } from './toc.ts'

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

/** 与 markdown-it / Rust 侧同口径：中文上下标允许，`1~5`、`64K~512K` 这类区间排除。 */
function validInlineMarker(content: string, marker: string): boolean {
  if (!content.trim() || content !== content.trim()) return false
  if (marker === '==') return true
  if (marker === '^') return content.length <= 32
  if (/\s/.test(content) || content.length > 8) return false
  return !/^\d+[A-Za-z]+$/.test(content)
}

function convertInlineMarkersLine(line: string): string {
  let out = ''
  let i = 0
  while (i < line.length) {
    const rest = line.slice(i)
    const c = line[i]
    // 行内代码
    if (c === '`') {
      const run = rest.match(/^`+/)?.[0].length ?? 1
      const marker = '`'.repeat(run)
      const close = line.indexOf(marker, i + run)
      if (close >= 0) {
        out += line.slice(i, close + run)
        i = close + run
      } else {
        out += line.slice(i, i + run)
        i += run
      }
      continue
    }
    // `$…$` / `$$…$$` 数学公式
    if (c === '$') {
      const run = rest.startsWith('$$') ? 2 : 1
      const marker = '$'.repeat(run)
      const close = line.indexOf(marker, i + run)
      if (close >= 0) {
        out += line.slice(i, close + run)
        i = close + run
      } else {
        out += c
        i += 1
      }
      continue
    }
    if (c === '\\') {
      out += line.slice(i, i + 2)
      i += 2
      continue
    }
    // HTML 标签 / 裸 URL / 链接目标不改写
    if (c === '<') {
      const close = line.indexOf('>', i)
      if (close >= 0) {
        out += line.slice(i, close + 1)
        i = close + 1
        continue
      }
    }
    if (rest.startsWith('http://') || rest.startsWith('https://')) {
      const m = /^[^\s)\]>"']+/.exec(rest)
      const end = m ? m[0].length : rest.length
      out += rest.slice(0, end)
      i += end
      continue
    }
    if (rest.startsWith('](')) {
      const close = line.indexOf(')', i)
      if (close >= 0) {
        out += line.slice(i, close + 1)
        i = close + 1
        continue
      }
    }
    // `~~删除线~~` 不当下标
    if (rest.startsWith('~~')) {
      out += '~~'
      i += 2
      continue
    }
    const prevDigit = i > 0 && /[0-9]/.test(line[i - 1])
    let marker = ''
    let open = ''
    let close = ''
    if (rest.startsWith('==')) {
      marker = '=='
      open = '<mark>'
      close = '</mark>'
    } else if (c === '^') {
      marker = '^'
      open = '<sup>'
      close = '</sup>'
    } else if (c === '~' && !prevDigit) {
      marker = '~'
      open = '<sub>'
      close = '</sub>'
    }
    if (!marker) {
      out += c
      i += 1
      continue
    }
    const end = line.indexOf(marker, i + marker.length)
    if (end < 0) {
      out += c
      i += 1
      continue
    }
    const content = line.slice(i + marker.length, end)
    if (!validInlineMarker(content, marker)) {
      out += c
      i += 1
      continue
    }
    out += open + content + close
    i = end + marker.length
  }
  return out
}

/**
 * `^上标^` / `~下标~` / `==高亮==` → `<sup>` / `<sub>` / `<mark>`。
 *
 * 前端先转成行内 HTML，Rust 侧对新旧版本都已有 `<sup>/<sub>/<mark>` 映射，
 * 这样即使运行的是未重编译的旧 Rust 二进制，Word 导出也不会丢这几种格式。
 */
export function inlineMarkersToHtml(markdown: string): string {
  const lines = markdown.split('\n')
  const out: string[] = []
  let i = 0
  // YAML front matter 原样跳过
  if (lines[0]?.trim() === '---') {
    out.push(lines[0])
    for (i = 1; i < lines.length; i++) {
      out.push(lines[i])
      if (lines[i].trim() === '---') { i++; break }
    }
  }
  let fence: string | null = null
  let mathBlock = false
  for (; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (mathBlock) {
      out.push(line)
      if (trimmed.endsWith('$$')) mathBlock = false
      continue
    }
    if (trimmed.startsWith('$$')) {
      out.push(line)
      mathBlock = !trimmed.slice(2).endsWith('$$')
      continue
    }
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line)
    if (fence) {
      out.push(line)
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) fence = null
      continue
    }
    if (fenceMatch) {
      fence = fenceMatch[1]
      out.push(line)
      continue
    }
    out.push(convertInlineMarkersLine(line))
  }
  return out.join('\n')
}

/** 导出 DOCX 前的完整预处理：目录 → TOC 域标记；行内扩展 → HTML；Mermaid → 图片 */
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
  let out = replaceTocPlaceholders(markdown, hasHeadings ? DOCX_TOC_MARKER : '')
  // 先落成 HTML，再替换 Mermaid 围栏（转换器会跳过围栏内容）
  out = inlineMarkersToHtml(out)
  if (renderMermaid) out = await replaceMermaidFences(out, renderMermaid)
  return out
}
