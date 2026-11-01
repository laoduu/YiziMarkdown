/**
 * mermaid.ts — Mermaid 核心渲染器（不再是可关闭插件）。
 *
 * 关键约束：
 *   · 主题不读官方 default/dark/forest/neutral，而是由当前容器的 ThemePalette 生成
 *     `theme: 'base'` 的 themeVariables（见 mermaidTheme.ts）。
 *   · Mermaid 的 initialize 是全局状态，预览 / 实时 / 演示 / DOCX / PPTX 可能并发调用；
 *     所有 render 统一走这里的串行队列，避免「DOCX 导出把预览主题改掉」。
 *   · 模块按需加载：只在页面真的出现 .mermaid / 导出真的遇到图表时 import。
 */
import type MarkdownIt from 'markdown-it'
import { readThemePalette, type ThemePalette } from '../lib/themePalette.ts'
import { buildMermaidConfig } from './mermaidTheme.ts'

let mermaidModule: any = null
let loadPromise: Promise<boolean> | null = null

/** Mermaid 渲染全局串行：initialize + render 必须在同一段内完成。 */
let renderChain: Promise<unknown> = Promise.resolve()
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = renderChain.then(job, job)
  renderChain = run.then(() => undefined, () => undefined)
  return run
}

export function ensureMermaid(): Promise<boolean> {
  if (loadPromise) return loadPromise
  loadPromise = import('mermaid').then((mod) => {
    mermaidModule = (mod as any).default || mod
    return true
  }).catch((e) => {
    console.error('[mermaid] load failed:', e)
    loadPromise = null
    return false
  })
  return loadPromise
}

export function isMermaidReady(): boolean {
  return !!mermaidModule
}

/** 安装 ```mermaid fence 的占位渲染；真正 SVG 由 postRender/queue 生成。 */
export function extendMermaidMarkdownIt(md: MarkdownIt): void {
  const defaultFence = md.renderer.rules.fence || function (tokens, idx, options, _env, self) {
    return self.renderToken(tokens, idx, options)
  }

  md.renderer.rules.fence = function (tokens, idx, options, env, self) {
    const token = tokens[idx]
    const lang = token.info.trim().split(/\s+/)[0].toLowerCase()
    if (lang === 'mermaid') {
      const code = token.content || ''
      return `<div class="mermaid" data-source="${escapeHtml(code)}" data-source-line="${token.attrGet('data-source-line') || ''}">${escapeHtml(code)}</div>`
    }
    return defaultFence(tokens, idx, options, env, self)
  }
}

function errorHtml(message: string): string {
  return `<div class="mermaid-error" style="color:var(--editor-accent);padding:8px;font-size:12px;">图表渲染失败: ${escapeHtml(message.slice(0, 100))}</div>`
}

/** 预览/演示/阅读：渲染容器内所有 .mermaid。主题来自传入 palette 或容器计算值。 */
export async function postRenderMermaid(container: HTMLElement, palette?: ThemePalette, htmlLabels = true): Promise<void> {
  const els = Array.from(container.querySelectorAll<HTMLElement>('.mermaid'))
  if (!els.length) return
  const ok = await ensureMermaid()
  if (!ok || !mermaidModule) return
  const theme = palette ?? readThemePalette(container)
  await enqueue(async () => {
    mermaidModule.initialize(buildMermaidConfig(theme, { htmlLabels }))
    for (const el of els) {
      const code = el.getAttribute('data-source') || el.textContent || ''
      if (!code.trim()) continue
      try {
        const id = `mmd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
        const { svg } = await mermaidModule.render(id, code)
        el.innerHTML = svg
      } catch (e) {
        el.innerHTML = errorHtml((e as Error).message || String(e))
      }
    }
  })
}

/** 实时模式单个图表块：加载、初始化、渲染都在队列内；返回时 DOM 已有 SVG。 */
export async function renderMermaidInto(el: HTMLElement, code: string, palette?: ThemePalette): Promise<void> {
  const ok = await ensureMermaid()
  if (!ok || !mermaidModule) throw new Error('Mermaid not loaded')
  const theme = palette ?? readThemePalette(el)
  await enqueue(async () => {
    mermaidModule.initialize(buildMermaidConfig(theme, { htmlLabels: true }))
    const id = `cm-mmd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    const { svg } = await mermaidModule.render(id, code)
    el.innerHTML = svg
  })
}

/**
 * 导出专用：htmlLabels=false（Rust resvg 不支持 foreignObject），
 * 主题由调用方按导出目标（DOCX 白底 / PPTX 幻灯片）传入。
 */
export async function renderMermaidSvgForExport(
  code: string,
  palette: ThemePalette,
  htmlLabels = false,
): Promise<string | null> {
  const ok = await ensureMermaid()
  if (!ok || !mermaidModule) return null
  return enqueue(async () => {
    mermaidModule.initialize(buildMermaidConfig(palette, { htmlLabels }))
    const { svg } = await mermaidModule.render(
      `mmd-export-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      code,
    )
    return svg as string
  })
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
