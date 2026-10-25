/**
 * pptxFrame.ts — 隐藏 iframe（1280×720 真实视口）里的「演示复刻」与测量宿主。
 *
 * 为什么必须是 iframe 而不是容器：slideshow.css 的排版大量依赖 `vw/vh`
 * （内容边距、字号 clamp、栏距）。父窗口里放一个 1280px 宽的 div 不会改变
 * `vw` 的解析基准 —— 只有 iframe 自己的 viewport 是 1280×720，布局才等同于
 * 「16:9 全屏演示」。这也是导出基准固定 1280×720 的唯一实现方式。
 *
 * 本模块只负责「把页面渲染成可测量的 DOM」：克隆样式、逐页挂载、插件后处理、
 * 图片/图表落成 data URL、等字体与图片就绪。DOM → 场景图在 pptxScene.ts。
 */
import { postRender as pluginPostRender } from '../plugins/registry'
import { renderMermaidSvgForExport } from '../plugins/built-in/mermaid'
import { resolveLocalImageSrc } from './localImages'
import { invokeTauri, invokeTauriOrThrow } from './tauri'
import { colStyleClass, type SlideColAlign, type SlideColStyle } from './slideColumns'
import type { SlideKind } from './slides'
import type { PptxWarning } from './pptxTypes'
import { escapeHtml } from './slideDeck'
import { rectOf } from './pptxTheme'

export interface FrameCreateOptions {
  /** 主题 id（用于 `.yizi-slideshow.theme-*`） */
  theme: string
  dark: boolean
  colStyle: SlideColStyle
  /** slideTypographyVars() 的产物：行内 CSS 变量 */
  typographyVars: Record<string, string>
  /** `scopeThemeVars()` 的产物（从主题文件读出的变量块） */
  themeCss: string
  /** 文档标题（写进 iframe 的 <title>，无实义） */
  docTitle?: string
  /** 演示字号系数（settings 里的 slideFontScale；用于超页时按比例回缩重排） */
  baseFontScale?: number
}

export interface RenderSlideSpec {
  /** 页面 HTML（buildSlideHtml 产物） */
  html: string
  kind: SlideKind
  align?: 'left' | 'center' | 'right'
  columns?: number
  /** 分栏页的栏内对齐（已由 resolveColAlign 合成） */
  colAlign?: SlideColAlign
  /** 章节页大序号（data-num） */
  sectionNum?: number
  /** 页脚：章节名 */
  chapter?: string
  /** 页脚：`3 / 12` */
  pos?: string
  notes?: string
}

export interface RenderResult {
  warnings: PptxWarning[]
}

const FRAME_W = 1280
const FRAME_H = 720
const LOAD_TIMEOUT = 15000
const IMAGE_TIMEOUT = 8000

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

/** 克隆父窗口全部样式表。Vite 生产是 `<link>`，dev 是运行时注入的 `<style>`，两者都要。 */
function cloneStyleTags(): string {
  const parts: string[] = []
  const base = document.baseURI
  document.head.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
    if (node.tagName === 'LINK') {
      const link = node as HTMLLinkElement
      if (!link.href) return
      let href = link.href
      try { href = new URL(href, base).href } catch { /* 保持原样 */ }
      parts.push(`<link rel="stylesheet" href="${escapeAttr(href)}">`)
    } else {
      const text = (node as HTMLStyleElement).textContent || ''
      if (text.trim()) parts.push(`<style>${text.replace(/<\/style/gi, '<\\/style')}</style>`)
    }
  })
  return parts.join('\n')
}

/** 导出期必须覆盖的 CSS：见方案 §3.2 */
const EXPORT_OVERRIDES = `
html, body { margin: 0 !important; padding: 0 !important; overflow: hidden !important; background: transparent !important; }
*, *::before, *::after { transition: none !important; animation: none !important; }
.ys-slide { overflow: hidden !important; opacity: 1 !important; visibility: visible !important; transform: none !important; }
.ys-hud, .ys-progress, .ys-exit-btn, .ys-flip-layer, .ys-notes-panel, .ys-notes-edge, .ys-notes-hint,
.ys-theme-menu, .ys-dismiss, .ys-title, .ys-overlay { display: none !important; }
[data-fragment] { opacity: 1 !important; transform: none !important; }
.ys-slide::-webkit-scrollbar { display: none; }
`

function buildSrcdoc(opts: FrameCreateOptions): string {
  const cls = [
    'yizi-slideshow',
    `theme-${opts.theme}`,
    opts.dark ? 'dark' : '',
    colStyleClass(opts.colStyle),
  ].filter(Boolean).join(' ')
  const styleAttr = Object.entries(opts.typographyVars)
    .map(([k, v]) => `${k}:${v}`)
    .join(';')
  // `<html>` 上的内联变量（--font-preview / --preview-font-size 等）由 App 写在主文档
  // documentElement 上，iframe 不会继承 —— 必须原样带进来，否则演示内容字体与设置不一致。
  const rootStyle = document.documentElement.getAttribute('style') || ''
  // 演示时 `<html>` 仍带着应用主题（`theme-*` / `dark`）：主题的元素级规则（如
  // `.theme-x.dark h2`）与用户 CSS 的 `:root.theme-*` 作用域都依赖它，照抄进来才与
  // 演示一致。配色变量本身仍由 `.yizi-slideshow.theme-*` 上的作用域副本提供（HUD 里
  // 临时切主题/明暗时以入口状态为准）。
  const rootCls = Array.from(document.documentElement.classList)
    .filter((c) => c === 'dark' || c.startsWith('theme-'))
    .join(' ')
  const themeCss = opts.themeCss ? `<style id="pptx-theme-css">${opts.themeCss.replace(/<\/style/gi, '<\\/style')}</style>` : ''
  return `<!doctype html>
<html${rootCls ? ` class="${escapeAttr(rootCls)}"` : ''}${rootStyle ? ` style="${escapeAttr(rootStyle)}"` : ''}><head>
<meta charset="utf-8">
<base href="${escapeAttr(document.baseURI)}">
<title>${escapeHtml(opts.docTitle || '')}</title>
${cloneStyleTags()}
${themeCss}
<style id="pptx-export-overrides">${EXPORT_OVERRIDES}</style>
</head>
<body>
<div class="${cls}"${styleAttr ? ` style="${escapeAttr(styleAttr)}"` : ''}>
  <div class="ys-deck">
    <section id="pptx-slide" class="ys-slide"></section>
  </div>
  <div class="ys-footer"><span class="ys-chapter"></span><span class="ys-pos"></span></div>
</div>
</body></html>`
}

function nextFrame(win: Window): Promise<void> {
  return new Promise((resolve) => win.requestAnimationFrame(() => win.requestAnimationFrame(() => resolve())))
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout: ${label}`)), ms)
    promise.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) },
    )
  })
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'))
    reader.readAsDataURL(blob)
  })
}

async function loadImageElement(img: HTMLImageElement): Promise<void> {
  if (!img.getAttribute('src')) return
  try {
    if (img.complete && img.naturalWidth > 0) {
      if (typeof img.decode === 'function') await withTimeout(img.decode().catch(() => undefined), IMAGE_TIMEOUT, 'img.decode').catch(() => undefined)
      return
    }
    await withTimeout(new Promise<void>((resolve) => {
      const done = () => { img.removeEventListener('load', done); img.removeEventListener('error', done); resolve() }
      img.addEventListener('load', done, { once: true })
      img.addEventListener('error', done, { once: true })
      // 已经在缓存里时 load 可能已触发过
      if (img.complete) done()
    }), IMAGE_TIMEOUT, 'img.load').catch(() => undefined)
    if (typeof img.decode === 'function') {
      await withTimeout(img.decode().catch(() => undefined), IMAGE_TIMEOUT, 'img.decode2').catch(() => undefined)
    }
  } catch {
    /* 图片加载失败不阻塞导出；场景层会跳过无 src 的图片 */
  }
}

export class PptxFrame {
  private iframe: HTMLIFrameElement
  private doc: Document
  private win: Window
  private slideEl: HTMLElement
  private chapterEl: HTMLElement | null
  private posEl: HTMLElement | null
  private destroyed = false
  private enabledPlugins: string[]
  private pluginConfigs: Record<string, Record<string, unknown>>
  private mermaidTheme: string
  private docBaseDir: string | null
  private rootEl: HTMLElement
  private baseFontScale: number

  private constructor(
    iframe: HTMLIFrameElement,
    opts: FrameCreateOptions & {
      enabledPlugins: string[]
      pluginConfigs: Record<string, Record<string, unknown>>
      mermaidTheme: string
      docBaseDir: string | null
    },
  ) {
    this.iframe = iframe
    this.doc = iframe.contentDocument!
    this.win = iframe.contentWindow!
    this.slideEl = this.doc.getElementById('pptx-slide')!
    this.chapterEl = this.doc.querySelector('.ys-chapter')
    this.posEl = this.doc.querySelector('.ys-pos')
    this.rootEl = this.doc.querySelector('.yizi-slideshow') as HTMLElement
    this.baseFontScale = opts.baseFontScale && opts.baseFontScale > 0 ? opts.baseFontScale : 1
    this.enabledPlugins = opts.enabledPlugins
    this.pluginConfigs = opts.pluginConfigs
    this.mermaidTheme = opts.mermaidTheme
    this.docBaseDir = opts.docBaseDir
  }

  static async create(
    opts: FrameCreateOptions & {
      enabledPlugins: string[]
      pluginConfigs: Record<string, Record<string, unknown>>
      mermaidTheme: string
      docBaseDir: string | null
    },
  ): Promise<PptxFrame> {
    const iframe = document.createElement('iframe')
    iframe.setAttribute('aria-hidden', 'true')
    iframe.style.cssText = [
      'position:fixed',
      'left:-20000px',
      'top:0',
      `width:${FRAME_W}px`,
      `height:${FRAME_H}px`,
      'border:0',
      'pointer-events:none',
      'visibility:visible',
      'opacity:1',
      'z-index:-2147483647',
    ].join(';')
    const loaded = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('PPTX iframe load timeout')), LOAD_TIMEOUT)
      iframe.addEventListener('load', () => { clearTimeout(timer); resolve() }, { once: true })
    })
    iframe.srcdoc = buildSrcdoc(opts)
    document.body.appendChild(iframe)
    await loaded

    const doc = iframe.contentDocument
    const win = iframe.contentWindow
    if (!doc || !win) throw new Error('PPTX iframe is not accessible')
    const frame = new PptxFrame(iframe, opts)
    frame.doc = doc
    frame.win = win
    frame.slideEl = doc.getElementById('pptx-slide') as HTMLElement
    frame.chapterEl = doc.querySelector('.ys-chapter')
    frame.posEl = doc.querySelector('.ys-pos')
    if (!frame.slideEl) throw new Error('PPTX iframe root missing')

    await frame.waitStylesheets()
    try {
      await withTimeout(doc.fonts.ready as Promise<unknown>, 10000, 'fonts.ready')
    } catch { /* 字体超时也继续：布局会用回退字体，至少不阻塞 */ }
    await nextFrame(win)
    return frame
  }

  private async waitStylesheets(): Promise<void> {
    const links = Array.from(this.doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
    await Promise.all(links.map((link) => {
      if (link.sheet) return Promise.resolve()
      return withTimeout(new Promise<void>((resolve) => {
        const done = () => resolve()
        link.addEventListener('load', done, { once: true })
        link.addEventListener('error', done, { once: true })
      }), 10000, 'stylesheet').catch(() => undefined)
    }))
  }

  async setSlide(spec: RenderSlideSpec): Promise<RenderResult> {
    const warnings: PptxWarning[] = []
    // 类名与 Slideshow.tsx 完全同源（布局规则只看这几个类）
    const classes = ['ys-slide', `ys-layout-${spec.kind}`]
    if (spec.columns && spec.columns > 1) {
      classes.push('ys-has-cols')
      if (spec.colAlign) classes.push(`ys-col-align-${spec.colAlign}`)
    }
    if (spec.align) classes.push(`ys-align-${spec.align}`)
    this.slideEl.className = classes.join(' ')
    if (spec.sectionNum) this.slideEl.setAttribute('data-num', String(spec.sectionNum))
    else this.slideEl.removeAttribute('data-num')
    this.slideEl.innerHTML = spec.html || ''
    if (this.chapterEl) this.chapterEl.textContent = spec.chapter || ''
    if (this.posEl) this.posEl.textContent = spec.pos || ''

    await nextFrame(this.win)

    // 插件后处理：KaTeX 兜底 / Mermaid 渲染（与演示同一套插件实现）
    if (this.enabledPlugins.length > 0) {
      try {
        await pluginPostRender(this.slideEl, this.enabledPlugins, this.pluginConfigs)
      } catch (e) {
        warnings.push({
          kind: 'other',
          messageKey: 'pptxExport.warnPluginFailed',
          messageArgs: { error: (e as Error).message },
        })
      }
    }
    await this.mermaidToImages(warnings)
    await this.hydrateImages(warnings)
    await this.waitImages()

    try {
      await withTimeout(this.doc.fonts.ready as Promise<unknown>, 10000, 'fonts.ready.slide')
    } catch { /* 忽略 */ }
    await nextFrame(this.win)
    await delay(16)
    return { warnings }
  }

  /** `.mermaid` 里的 SVG → Rust resvg 栅格化 → `<img>`（与 DOCX 同源） */
  private async mermaidToImages(warnings: PptxWarning[]): Promise<void> {
    const els = Array.from(this.slideEl.querySelectorAll<HTMLElement>('.mermaid'))
    for (const el of els) {
      const code = el.getAttribute('data-source') || el.textContent || ''
      if (!code.trim()) continue
      const svgEl = el.querySelector('svg')
      const rect = svgEl ? rectOf(svgEl) : null
      let svg = ''
      try {
        svg = (await renderMermaidSvgForExport(code, this.mermaidTheme)) || ''
      } catch (e) {
        warnings.push({
          kind: 'mermaid',
          messageKey: 'pptxExport.warnMermaidRender',
          messageArgs: { error: (e as Error).message?.slice(0, 120) },
        })
        continue
      }
      if (!svg) {
        warnings.push({ kind: 'mermaid', messageKey: 'pptxExport.warnMermaidEmpty' })
        continue
      }
      try {
        const png = await invokeTauriOrThrow<{ data_url: string; width: number; height: number }>(
          'rasterize_svg', { svg },
        )
        // 尺寸：优先用页面里已渲染 SVG 的实际盒子（演示中的视觉高度），
        // 没有则退到 SVG 固有尺寸，按内容区宽 / 78% 高封顶。
        const contentW = Math.max(1, this.slideEl.clientWidth
          - parseFloat(this.win.getComputedStyle(this.slideEl).paddingLeft || '0')
          - parseFloat(this.win.getComputedStyle(this.slideEl).paddingRight || '0'))
        const contentH = Math.max(1, this.slideEl.clientHeight
          - parseFloat(this.win.getComputedStyle(this.slideEl).paddingTop || '0')
          - parseFloat(this.win.getComputedStyle(this.slideEl).paddingBottom || '0'))
        let w = rect && rect.w > 1 ? rect.w : png.width
        let h = rect && rect.h > 1 ? rect.h : png.height
        const capW = contentW
        const capH = contentH * 0.78
        const k = Math.min(1, capW / w, capH / h)
        w *= k
        h *= k
        el.innerHTML = `<img src="${png.data_url}" alt="" data-ys-mermaid="1" style="width:${Math.round(w)}px;height:${Math.round(h)}px;max-width:100%">`
      } catch (e) {
        warnings.push({
          kind: 'mermaid',
          messageKey: 'pptxExport.warnMermaidRaster',
          messageArgs: { error: (e as Error).message?.slice(0, 120) },
        })
      }
    }
    // 兜底：任何最终既没有图片也没有可见文字的图表都必须留痕，
    // 否则用户只会看到「这一页莫名其妙空了」却不知道原因。
    for (const el of els) {
      if (el.querySelector('img')) continue
      if ((el.textContent || '').trim()) continue
      warnings.push({ kind: 'mermaid', messageKey: 'pptxExport.warnMermaidMissing' })
    }
    await nextFrame(this.win)
  }

  /** 本地图片 → data URL；远程图片交给 fetch（CORS 失败则跳过并告警） */
  private async hydrateImages(warnings: PptxWarning[]): Promise<void> {
    const imgs = Array.from(this.slideEl.querySelectorAll<HTMLImageElement>('img'))
    await Promise.all(imgs.map(async (img) => {
      const src = img.getAttribute('src') || ''
      if (!src || src.startsWith('data:') || src.startsWith('asset://') || src.startsWith('blob:')) return
      if (/^https?:\/\//i.test(src)) {
        try {
          const res = await fetch(src)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          img.src = await blobToDataUrl(await res.blob())
        } catch (e) {
          warnings.push({
            kind: 'image',
            messageKey: 'pptxExport.warnImageRemote',
            messageArgs: { src: src.slice(0, 80) },
          })
        }
        return
      }
      try {
        const path = await resolveLocalImageSrc(src, this.docBaseDir)
        if (!path) return
        const dataUrl = await invokeTauri<string>('read_image_base64', { path })
        if (dataUrl) img.src = dataUrl
        else {
          warnings.push({
            kind: 'image',
            messageKey: 'pptxExport.warnImageLocal',
            messageArgs: { src: src.slice(0, 80) },
          })
        }
      } catch {
        warnings.push({
          kind: 'image',
          messageKey: 'pptxExport.warnImageLocal',
          messageArgs: { src: src.slice(0, 80) },
        })
      }
    }))
  }

  private async waitImages(): Promise<void> {
    const imgs = Array.from(this.slideEl.querySelectorAll<HTMLImageElement>('img'))
    await Promise.all(imgs.map((img) => loadImageElement(img)))
  }

  get document(): Document { return this.doc }
  get window(): Window { return this.win }
  get slide(): HTMLElement { return this.slideEl }
  /** 超页自动压缩：把演示字号旋钮再乘一个系数（CSS 会真正重排，不是缩放截图） */
  setFontScale(scale: number): void {
    this.rootEl.style.setProperty('--ys-font-scale', String(this.baseFontScale * scale))
  }
  get footerEls(): { chapter: HTMLElement | null; pos: HTMLElement | null } {
    return { chapter: this.chapterEl, pos: this.posEl }
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.iframe.remove()
  }
}
