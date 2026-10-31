/**
 * pptxExport.ts — PPTX 导出的编排层（唯一对 UI 暴露的入口）。
 *
 * 顺序：
 *   parseDeck（与演示同一份解析）
 *     → 隐藏 iframe 1280×720（PptxFrame）
 *     → 逐页 setSlide + buildSlideScene（DOM → 场景图）
 *     → 收集 TeX 调 Rust latex_to_omml
 *     → buildPptx（pptxgenjs + JSZip 后处理）
 *
 * 超页策略：
 *   · 'warn'   —— 照常导出，收集页码给弹窗提示；
 *   · 'shrink' —— 用 `--ys-font-scale` 让浏览器**真正重排**（不是缩放截图），
 *                 逐档回缩到内容装进可视区为止，并记录实际系数。
 */
import { parseDeck, buildDeckTocHtml, buildSlideHtml, deckChapters } from './slideDeck.ts'
import { extendMarkdownIt } from '../plugins/registry.ts'
import { PptxFrame } from './pptxFrame.ts'
import { buildSlideScene } from './pptxScene.ts'
import { buildPptx } from './pptxBuild.ts'
import { loadSlideshowThemeCss } from './slideTheme.ts'
import { resolveColAlign, type SlideColAlign, type SlideColStyle } from './slideColumns.ts'
import { slideTypographyVars, DEFAULT_SLIDE_TYPOGRAPHY, type SlideTypography } from './slideTypography.ts'
import { invokeTauriOrThrow } from './tauri.ts'
import type { PptxWarning, SceneNode, SlideScene } from './pptxTypes.ts'

export type PptxOverflowMode = 'warn' | 'shrink'

export interface PptxRange {
  /** 0-based，含首含尾 */
  start: number
  end: number
}

export interface PptxExportOptions {
  content: string
  fallbackTitle?: string
  theme: string
  dark: boolean
  /** 「自定义主题」的基底主题 */
  customCssBase?: string
  typography?: Partial<SlideTypography>
  colStyle?: SlideColStyle
  colAlign?: SlideColAlign
  enabledPlugins?: string[]
  pluginConfigs?: Record<string, Record<string, unknown>>
  /** Mermaid 配色主题（与插件配置一致） */
  mermaidTheme?: string
  docBaseDir?: string | null
  includeNotes: boolean
  includeFooter: boolean
  overflowMode: PptxOverflowMode
  /** 不传 = 全部页 */
  range?: PptxRange
  onProgress?: (done: number, total: number, label: string) => void
  signal?: AbortSignal
}

export interface PptxExportResult {
  buffer: ArrayBuffer
  warnings: PptxWarning[]
  /** 实际导出的页数 */
  slideCount: number
  /** 内容溢出可视区的页码（1 起，按**整副演示**编号） */
  overflowSlides: number[]
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const err = new Error('导出已取消')
    err.name = 'AbortError'
    throw err
  }
}

function warningKey(w: PptxWarning): string {
  // 同一页多条「同 key 不同参数」的告警（例如两张图片都读不到）必须各自保留，
  // 所以参数也要进去重键；没有结构化 key 时退回 message。
  const args = w.messageArgs
    ? JSON.stringify(Object.keys(w.messageArgs).sort().map((k) => [k, w.messageArgs![k]]))
    : ''
  return `${w.kind}|${w.slide ?? ''}|${w.messageKey ?? w.message ?? ''}|${args}`
}

function dedupeWarnings(list: PptxWarning[]): PptxWarning[] {
  const seen = new Set<string>()
  const out: PptxWarning[] = []
  for (const w of list) {
    const key = warningKey(w)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(w)
  }
  return out
}

function collectMath(scenes: SlideScene[]): { tex: string; slides: number[] }[] {
  const map = new Map<string, Set<number>>()
  const add = (tex: string, slide: number) => {
    if (!map.has(tex)) map.set(tex, new Set())
    map.get(tex)!.add(slide)
  }
  const visitNodes = (nodes: SceneNode[], slide: number) => {
    for (const node of nodes) {
      if (node.t === 'math' && node.tex) add(node.tex, slide)
      if (node.t === 'text') {
        for (const p of node.paragraphs) {
          for (const r of p.runs) {
            if (r.style.mathTex) add(r.style.mathTex, slide)
          }
        }
      }
      if (node.t === 'code') {
        for (const line of node.lines) {
          for (const r of line) {
            if (r.style.mathTex) add(r.style.mathTex, slide)
          }
        }
      }
    }
  }
  scenes.forEach((s) => visitNodes(s.nodes, s.index))
  return Array.from(map.entries()).map(([tex, slides]) => ({ tex, slides: Array.from(slides) }))
}

function attachOmml(scenes: SlideScene[], ommlMap: Map<string, string>): void {
  const visit = (nodes: SceneNode[]) => {
    for (const node of nodes) {
      if (node.t === 'math' && ommlMap.has(node.tex)) node.omml = ommlMap.get(node.tex)
      if (node.t === 'text') {
        for (const p of node.paragraphs) {
          for (const r of p.runs) {
            const tex = r.style.mathTex
            if (tex && ommlMap.has(tex)) r.style.mathOmml = ommlMap.get(tex)
          }
        }
      }
      if (node.t === 'code') {
        for (const line of node.lines) {
          for (const r of line) {
            const tex = r.style.mathTex
            if (tex && ommlMap.has(tex)) r.style.mathOmml = ommlMap.get(tex)
          }
        }
      }
    }
  }
  scenes.forEach((s) => visit(s.nodes))
}

/**
 * 让浏览器按缩小后的字号重新排版，直到内容装进 1280×720 的可视区。
 *
 * `initial` 必须是**在当前页基础字号下**测出来的场景（调用方已先 setFontScale(1)），
 * 不能是上一页压缩后的残留状态。每次只从更小的档位继续向下试，避免先放大再缩小的
 * 非单调过程。
 */
async function shrinkToFit(
  frame: PptxFrame,
  render: () => Promise<void>,
  build: () => SlideScene,
  initial: SlideScene,
  signal?: AbortSignal,
): Promise<{ scene: SlideScene; factor: number }> {
  const factors = [0.94, 0.88, 0.82, 0.76, 0.70, 0.64, 0.6]
  let last = initial
  if (last.overflowPx <= 2) return { scene: last, factor: 1 }
  for (const f of factors) {
    throwIfAborted(signal)
    frame.setFontScale(f)
    await render()
    throwIfAborted(signal)
    last = build()
    if (last.overflowPx <= 2) return { scene: last, factor: f }
  }
  return { scene: last, factor: factors[factors.length - 1] }
}

export async function exportPptx(opts: PptxExportOptions): Promise<PptxExportResult> {
  const parsed = parseDeck(opts.content, opts.fallbackTitle || '')
  const allSlides = parsed.slides
  if (!allSlides.length) {
    throw new Error('没有可导出的幻灯片（文档为空）')
  }

  let range = opts.range
  if (range) {
    range = {
      start: Math.max(0, Math.min(allSlides.length - 1, range.start)),
      end: Math.max(0, Math.min(allSlides.length - 1, range.end)),
    }
    if (range.end < range.start) [range.start, range.end] = [range.end, range.start]
  }
  const indices = range
    ? Array.from({ length: range.end - range.start + 1 }, (_, i) => range.start + i)
    : allSlides.map((_, i) => i)
  const totalAll = allSlides.length
  const chapters = deckChapters(allSlides, parsed.docTitle)

  const typography = opts.typography || {}
  const enabledPlugins = opts.enabledPlugins || []
  const pluginConfigs = opts.pluginConfigs || {}
  const pluginExtenders = enabledPlugins.length
    ? enabledPlugins.map(() => (md: any) => extendMarkdownIt(md, enabledPlugins, pluginConfigs))
    : []
  const deckTocHtml = buildDeckTocHtml(allSlides)
  const themeCss = await loadSlideshowThemeCss(opts.theme, opts.customCssBase)
  throwIfAborted(opts.signal)

  const frame = await PptxFrame.create({
    theme: opts.theme,
    dark: opts.dark,
    colStyle: opts.colStyle || 'card',
    typographyVars: slideTypographyVars(typography),
    themeCss,
    docTitle: parsed.docTitle,
    baseFontScale: typography.fontScale ?? DEFAULT_SLIDE_TYPOGRAPHY.fontScale,
    enabledPlugins,
    pluginConfigs,
    mermaidTheme: opts.mermaidTheme || 'default',
    docBaseDir: opts.docBaseDir ?? null,
  })

  const scenes: SlideScene[] = []
  const warnings: PptxWarning[] = []
  const overflowSlides: number[] = []

  try {
    for (let k = 0; k < indices.length; k++) {
      throwIfAborted(opts.signal)
      const i = indices[k]
      const slide = allSlides[i]
      const chapter = chapters[i]?.chapter || parsed.docTitle
      const pos = `${i + 1} / ${totalAll}`
      const html = buildSlideHtml(slide, { pluginExtenders, deckTocHtml, meta: parsed.meta })
      const colAlign = resolveColAlign(opts.colAlign || 'left', slide.align)
      const spec = {
        html,
        kind: slide.kind,
        align: slide.align,
        columns: slide.columns,
        colAlign,
        sectionNum: slide.kind === 'section' ? chapters[i]?.num : undefined,
        chapter,
        pos,
        notes: slide.notes,
      }

      const render = async () => {
        const res = await frame.setSlide(spec)
        res.warnings.forEach((w) => warnings.push({ ...w, slide: w.slide ?? i + 1 }))
      }
      // 每页都从用户设置的基础字号开始测；自动压缩只作用于当前页，禁止串页。
      // 用既有的 setFontScale(1) 复位（= baseFontScale × 1），不要新增一次性 API：
      // WebView 的 HMR 可能保留旧版 PptxFrame 实例，调用新方法会报 “is not a function”。
      frame.setFontScale(1)
      await render()

      const buildScene = () => buildSlideScene(frame, {
        index: i + 1,
        kind: slide.kind,
        title: slide.title,
        notes: slide.notes,
        chapter,
        pos,
        includeFooter: opts.includeFooter,
      })

      let scene = buildScene()
      if (opts.overflowMode === 'shrink' && scene.overflowPx > 2) {
        const fitted = await shrinkToFit(frame, render, buildScene, scene, opts.signal)
        scene = fitted.scene
        scene.fontScale = fitted.factor
        if (fitted.factor < 1) {
          warnings.push({
            kind: 'shrink',
            slide: i + 1,
            messageKey: 'pptxExport.warnShrinkPage',
            messageArgs: { percent: Math.round(fitted.factor * 100) },
          })
        }
      }
      if (scene.overflowPx > 2) overflowSlides.push(i + 1)
      scene.warnings.forEach((w) => warnings.push({ ...w, slide: w.slide ?? i + 1 }))
      scenes.push(scene)
      opts.onProgress?.(k + 1, indices.length, 'render')
    }

    throwIfAborted(opts.signal)

    // ---- 公式：TeX → OMML（Rust 复用 DOCX 的同一套解析器） ----
    const mathItems = collectMath(scenes)
    if (mathItems.length) {
      opts.onProgress?.(indices.length, indices.length, 'math')
      const ommlMap = new Map<string, string>()
      await Promise.all(mathItems.map(async (item) => {
        throwIfAborted(opts.signal)
        try {
          const omml = await invokeTauriOrThrow<string>('latex_to_omml', { tex: item.tex })
          if (omml) ommlMap.set(item.tex, omml)
          else item.slides.forEach((s) => warnings.push({
            kind: 'math',
            slide: s,
            messageKey: 'pptxExport.warnMathFallback',
            messageArgs: { tex: item.tex },
          }))
        } catch (e) {
          item.slides.forEach((s) => warnings.push({
            kind: 'math',
            slide: s,
            messageKey: 'pptxExport.warnMathError',
            messageArgs: { error: (e as Error).message?.slice(0, 80), tex: item.tex },
          }))
        }
      }))
      attachOmml(scenes, ommlMap)
    }

    throwIfAborted(opts.signal)
    opts.onProgress?.(indices.length, indices.length, 'build')
    const buffer = await buildPptx({
      title: parsed.docTitle || 'YiziMarkdown',
      author: parsed.meta.author,
      subject: parsed.docTitle || undefined,
      scenes,
      includeNotes: opts.includeNotes,
      includeFooter: opts.includeFooter,
      onProgress: (done, total) => opts.onProgress?.(done, total, 'build'),
    })

    if (overflowSlides.length) {
      warnings.push({
        kind: 'overflow',
        messageKey: 'pptxExport.warnOverflowSummary',
        messageArgs: { n: overflowSlides.length },
      })
    }

    return {
      buffer,
      warnings: dedupeWarnings(warnings),
      slideCount: scenes.length,
      overflowSlides,
    }
  } finally {
    frame.destroy()
  }
}
