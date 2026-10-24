/**
 * DOCX 导出前的 Markdown 预处理。
 *
 * Rust 侧 `export_docx` 直接解析 Markdown，看不到预览 DOM，所以两类「预览里已经不是
 * Markdown 代码」的内容必须在这里先落成 Rust 认识的形式：
 *   · `[toc]` → 按标题层级缩进的项目符号列表；
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

/** 从 Markdown 生成 DOCX 用的目录列表文本 */
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

/** 导出 DOCX 前的完整预处理：目录 → Mermaid 图片 */
export async function prepareMarkdownForDocx(
  markdown: string,
  renderMermaid?: (code: string) => Promise<string | null>,
): Promise<string> {
  let out = replaceTocPlaceholders(markdown, buildTocMarkdown(markdown))
  if (renderMermaid) out = await replaceMermaidFences(out, renderMermaid)
  return out
}
