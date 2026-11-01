/**
 * renderers/index.ts — Markdown 核心渲染层的统一入口。
 *
 * 数学公式与 Mermaid 是文档语义的一部分，默认永远可用；它们不再是
 * `enabledPlugins` 里的可选插件。Mermaid 的模块按需加载，KaTeX 需要在
 * markdown-it 创建前预热（否则 `$...$` 会先渲染成源码）。
 */
import type MarkdownIt from 'markdown-it'
import type { ThemePalette } from '../lib/themePalette.ts'
import { ensureKatex, extendKatexMarkdownIt, postRenderKatex } from './katex.ts'
import {
  ensureMermaid, extendMermaidMarkdownIt, postRenderMermaid, renderMermaidSvgForExport,
} from './mermaid.ts'

/** 启动时预热数学公式；Mermaid 仍保持按需加载（只有出现图表才 import）。 */
export function ensureCoreRenderers(): Promise<boolean> {
  return ensureKatex()
}

/** 所有 markdown-it 实例都安装核心扩展；Mermaid fence 不依赖重模块。 */
export function extendCoreMarkdownIt(md: MarkdownIt): void {
  extendMermaidMarkdownIt(md)
  extendKatexMarkdownIt(md)
}

/** 预览/实时/演示/阅读共用的 core postRender（公式兜底 + Mermaid 主题渲染）。
 *  htmlLabels 默认 true（预览更清晰）；阅读模式传 false，避免 foreignObject 在 3D 翻页层里渲染成黑色。 */
export async function postRenderCore(
  container: HTMLElement,
  palette?: ThemePalette,
  options?: { htmlLabels?: boolean },
): Promise<void> {
  await postRenderKatex(container)
  await postRenderMermaid(container, palette, options?.htmlLabels ?? true)
}

export { ensureMermaid, renderMermaidSvgForExport }
