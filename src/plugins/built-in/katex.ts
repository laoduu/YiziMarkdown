import type MarkdownIt from 'markdown-it'
import type { EditorPlugin } from '../types'

let mkPlugin: any = null
let katexModule: any = null

export const katexPlugin: EditorPlugin = {
  id: 'katex',
  name: '数学公式',
  description: '使用 KaTeX 渲染 LaTeX 数学公式，支持行内 $...$ 和块级 $$...$$',

  configFields: [],

  async load(): Promise<boolean> {
    try {
      const [mkMod, ktMod, _css] = await Promise.all([
        import('@traptitech/markdown-it-katex'),
        import('katex'),
        // 动态导入 CSS，Vite 会将其作为独立 CSS chunk 按需加载
        import('katex/dist/katex.min.css'),
      ])
      mkPlugin = (mkMod as any).default || (mkMod as any).i || mkMod
      katexModule = ktMod.default || ktMod
      return true
    } catch (e) {
      console.error('[katex plugin] load failed:', e)
      return false
    }
  },

  extendMarkdownIt(md: MarkdownIt, _configs: Record<string, unknown>): void {
    if (!mkPlugin) return
    md.use(mkPlugin)
  },

  async postRender(container: HTMLElement, _configs: Record<string, unknown>): Promise<void> {
    if (!katexModule) return
    // markdown-it-katex 已通过 renderToString 生成完整 HTML（含 .katex-mathml）
    // 正常情况无需再次渲染；以下仅作极端情况的兜底
    const katexEls = container.querySelectorAll('.katex, .katex-display, .katex-inline')
    for (const el of Array.from(katexEls)) {
      if (el.querySelector('.katex-mathml')) continue
      const tex = el.getAttribute('data-tex') || el.textContent || ''
      if (!tex) continue
      try {
        const displayMode = el.classList.contains('katex-display')
        katexModule.render(tex, el, { displayMode, throwOnError: false })
      } catch {
        el.textContent = tex
      }
    }
  },

  destroy(): void {
    mkPlugin = null
    katexModule = null
  },
}
