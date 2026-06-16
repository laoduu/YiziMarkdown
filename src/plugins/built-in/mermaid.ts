import type MarkdownIt from 'markdown-it'
import type { EditorPlugin } from '../types'

let mermaidModule: any = null

export const mermaidPlugin: EditorPlugin = {
  id: 'mermaid',
  name: 'Mermaid 图表',
  description: '使用 Mermaid.js 渲染流程图、时序图、甘特图等图表',

  configFields: [
    {
      key: 'theme',
      label: '主题',
      type: 'select',
      options: [
        { value: 'default', label: '默认' },
        { value: 'dark', label: '深色' },
        { value: 'forest', label: '森林' },
        { value: 'neutral', label: '中性' },
      ],
      defaultValue: 'default',
      hint: 'Mermaid 图表的配色主题',
    },
  ],

  async load(): Promise<boolean> {
    try {
      const mod = await import('mermaid')
      mermaidModule = mod.default || mod
      return true
    } catch (e) {
      console.error('[mermaid plugin] load failed:', e)
      return false
    }
  },

  extendMarkdownIt(md: MarkdownIt, _configs: Record<string, unknown>): void {
    // 自定义 fence 渲染：语言为 mermaid 时输出带标记的 div
    const defaultFence = md.renderer.rules.fence || function (tokens, idx, options, _env, self) {
      return self.renderToken(tokens, idx, options)
    }

    md.renderer.rules.fence = function (tokens, idx, options, env, self) {
      const token = tokens[idx]
      if (token.info && token.info.trim() === 'mermaid') {
        const code = token.content || ''
        return `<div class="mermaid" data-source="${escapeHtml(code)}" data-source-line="${token.attrGet('data-source-line') || ''}">${escapeHtml(code)}</div>`
      }
      return defaultFence(tokens, idx, options, env, self)
    }
  },

  async postRender(container: HTMLElement, configs: Record<string, unknown>): Promise<void> {
    if (!mermaidModule) return

    // 根据配置初始化 mermaid 主题（每次都重新初始化以确保主题切换即时生效）
    const theme = (configs.theme as string) || 'default'
    mermaidModule.initialize({
      startOnLoad: false,
      theme,
      securityLevel: 'loose',
    })

    // 渲染所有 .mermaid 元素（每次都强制重渲染，确保主题/内容变更即时生效）
    const els = container.querySelectorAll<HTMLElement>('.mermaid')
    for (const el of Array.from(els)) {
      // 获取原始代码（优先从data-source属性取，避免已渲染SVG污染textContent）
      const code = el.getAttribute('data-source') || el.textContent || ''
      if (!code.trim()) continue

      try {
        const { svg } = await mermaidModule.render(`mmd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, code)
        el.innerHTML = svg
      } catch (e) {
        el.innerHTML = `<div class="mermaid-error" style="color:var(--editor-accent);padding:8px;font-size:12px;">图表渲染失败: ${(e as Error).message?.slice(0, 100)}</div>`
      }
    }
  },

  destroy(): void {
    mermaidModule = null
  },
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
