/**
 * katex.ts — 数学公式核心渲染器（不再是可关闭插件）。
 *
 * 公式是 Markdown 文档内容的一部分，默认必须渲染；这里只保留「懒加载模块 +
 * markdown-it 扩展 + postRender 兜底」三件事。模块由 App 启动时预热，
 * 预览/实时/演示/阅读/导出都直接使用同一份实现。
 */
import type MarkdownIt from 'markdown-it'
import { splitInlineMath } from '../lib/inlineMath.ts'

let mkPlugin: any = null
let katexModule: any = null
let loadPromise: Promise<boolean> | null = null

/** 动态加载 KaTeX 与 markdown-it 扩展（只执行一次）。 */
export function ensureKatex(): Promise<boolean> {
  if (loadPromise) return loadPromise
  loadPromise = Promise.all([
    import('@traptitech/markdown-it-katex'),
    import('katex'),
    // 动态导入 CSS，Vite 会将其作为独立 CSS chunk 按需加载
    import('katex/dist/katex.min.css'),
  ]).then(([mkMod, ktMod]) => {
    mkPlugin = (mkMod as any).default || (mkMod as any).i || mkMod
    katexModule = (ktMod as any).default || ktMod
    return true
  }).catch((e) => {
    console.error('[katex] load failed:', e)
    loadPromise = null
    return false
  })
  return loadPromise
}

export function isKatexReady(): boolean {
  return !!mkPlugin && !!katexModule
}

/** markdown-it 实例创建时安装；必须在 ensureKatex 成功之后调用，否则本轮先降级为源码。 */
export function extendKatexMarkdownIt(md: MarkdownIt): void {
  if (!mkPlugin) return
  md.use(mkPlugin)
}

/** 渲染兜底：markdown-it-katex 已生成完整 HTML 时通常无需执行。 */
export async function postRenderKatex(container: HTMLElement): Promise<void> {
  await ensureKatex()
  if (!katexModule) return
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

  // markdown-it-katex 在某些增量渲染 / 缓存路径里可能把 `$...$` 留成普通文本。
  // 导出前补一次 DOM 转换，让后续场景采集始终能看到 `.katex`，而不是只拿到源码。
  const walker = container.ownerDocument.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  const rawMathNodes: Text[] = []
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text
    const parent = text.parentElement
    if (!parent || parent.closest('pre, code, script, style, .katex')) continue
    if (splitInlineMath(text.nodeValue || '').some((segment) => segment.kind === 'math')) {
      rawMathNodes.push(text)
    }
  }

  for (const node of rawMathNodes) {
    const parent = node.parentNode
    if (!parent) continue
    const fragment = container.ownerDocument.createDocumentFragment()
    for (const segment of splitInlineMath(node.nodeValue || '')) {
      if (segment.kind === 'text') {
        fragment.appendChild(container.ownerDocument.createTextNode(segment.text))
        continue
      }
      const span = container.ownerDocument.createElement('span')
      span.className = 'katex'
      span.setAttribute('data-tex', segment.tex)
      try {
        span.innerHTML = katexModule.renderToString(segment.tex, {
          displayMode: false,
          throwOnError: false,
        })
      } catch {
        span.textContent = `$${segment.tex}$`
      }
      fragment.appendChild(span)
    }
    parent.replaceChild(fragment, node)
  }
}

/** 实时模式复用同一个 KaTeX 实例。 */
export async function renderKatexToString(tex: string, displayMode: boolean): Promise<string> {
  await ensureKatex()
  if (!katexModule) throw new Error('KaTeX not loaded')
  return katexModule.renderToString(tex, { displayMode, throwOnError: false })
}
