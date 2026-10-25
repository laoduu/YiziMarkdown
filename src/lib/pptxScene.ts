/**
 * pptxScene.ts — 把「已经渲染好的演示 DOM」测量成 **场景图**（见 pptxTypes.ts）。
 *
 * 为什么先量再画：PowerPoint 没有 CSS 布局。要让导出与演示逐块对齐，唯一可行的做法
 * 是在 1280×720 的真实视口里让浏览器排一次版，再把每个盒子的位置 / 字号 / 颜色读出来，
 * 翻译成 pt / inch。这里**不复制** slideshow.css 的数值，而是读 computed style：
 * 主题、明暗、字号缩放、填充比例、分栏样式改了，场景图自动跟着变。
 *
 * 装饰（标题下划线、章节大序号、金句对角引号、agenda 数字、列表圆点/序号）来自
 * 伪元素：几何（left/top/width/height）、颜色、字号/字重都从 `getComputedStyle(el, '::before'|'::after')`
 * 读，只有**文本内容**（计数器 / attr()）由这里按语义补上 —— 浏览器不会把 counter 解析成字符串。
 *
 * 单位：场景图里 x/y/w/h 是 inch，字号是 pt，颜色是 6 位十六进制（已 flatten 到幻灯片背景上）。
 */
import type { SlideKind } from './slides.ts'
import type { PptxFrame } from './pptxFrame.ts'
import type {
  CodeLine, MathNode, PptxWarning, SceneNode, SceneParagraph, SceneRun, SceneRunStyle,
  SceneTableCell, SlideScene, TextNode,
} from './pptxTypes.ts'
import {
  borderRadiusPx, cleanText, colorAlpha, contentBoxPx, flattenColor, fontSizePx, hasStrike,
  hasUnderline, isBold, letterSpacingPt, lineHeightPx, num, parseBoxShadow, parseColor, pxToIn,
  pxToPt, rectOf, resolveFontStack, round2, round3, styleOf, textAlignOf,
} from './pptxTheme.ts'

export interface SceneOptions {
  /** 1 起的页码 */
  index: number
  kind: SlideKind
  title?: string
  notes: string
  /** 页脚章节名（不含时传空） */
  chapter?: string
  /** 页脚 `3 / 12` */
  pos?: string
  includeFooter: boolean
}

interface Box { x: number; y: number; w: number; h: number }

const EPS = 2

/** 判断两个 run 样式是否完全一致（用于合并相邻文本片段，减少 XML 体积） */
function sameStyle(a: SceneRunStyle, b: SceneRunStyle): boolean {
  return a.color === b.color && a.sizePt === b.sizePt && a.bold === b.bold &&
    a.italic === b.italic && a.underline === b.underline && a.strike === b.strike &&
    a.latin === b.latin && a.ea === b.ea && a.charSpacingPt === b.charSpacingPt &&
    a.highlight === b.highlight && a.link === b.link && !a.mathTex
}

/** `annotation[encoding="application/x-tex"]` → TeX；KaTeX 的可见 HTML 不可信，必须取源。 */
function katexTex(el: Element): string {
  const ann = el.querySelector('annotation[encoding="application/x-tex"]')
  const tex = (ann?.textContent || '').trim()
  return tex
}

/** 元素的内容盒（文字真正开始的位置，去掉 padding / border） */
function contentBox(el: Element, win: Window): Box {
  const b = contentBoxPx(el, win)
  return { x: b.x, y: b.y, w: b.w, h: b.h }
}

function textBoxOf(el: Element, win: Window): Box {
  const b = contentBox(el, win)
  return { x: b.x, y: b.y, w: b.w, h: b.h + EPS }
}

/** 绝对定位伪元素的盒子：优先用它自己的 left/right/top/bottom + 尺寸。 */
function pseudoBox(host: Element, pcs: CSSStyleDeclaration, w: number, h: number): Box {
  const r = rectOf(host)
  const left = pcs.left !== 'auto' ? num(pcs.left, NaN) : NaN
  const right = pcs.right !== 'auto' ? num(pcs.right, NaN) : NaN
  const top = pcs.top !== 'auto' ? num(pcs.top, NaN) : NaN
  const bottom = pcs.bottom !== 'auto' ? num(pcs.bottom, NaN) : NaN
  const x = Number.isFinite(left) ? r.x + left
    : Number.isFinite(right) ? r.x + r.w - right - w
    : r.x
  const y = Number.isFinite(top) ? r.y + top
    : Number.isFinite(bottom) ? r.y + r.h - bottom - h
    : r.y
  return { x, y, w, h }
}

function pseudoSize(pcs: CSSStyleDeclaration): { w: number; h: number } {
  const w = num(pcs.width, 0)
  const h = num(pcs.height, 0)
  return { w, h }
}

function pseudoColor(pcs: CSSStyleDeclaration, slideBg: string, extraOpacity = 1): string {
  const opacity = extraOpacity * (num(pcs.opacity, 1) || 1)
  return flattenColor(pcs.color || pcs.backgroundColor, slideBg, opacity)
}

function hasVisiblePseudo(pcs: CSSStyleDeclaration): boolean {
  const c = (pcs.content || '').trim()
  return !!c && c !== 'none' && c !== 'normal' && pcs.display !== 'none'
}

/** `linear-gradient(...)` 里的第一个颜色（封面/内容页下划线就是 accent → transparent） */
function gradientFirstColor(backgroundImage: string): string | null {
  if (!backgroundImage || backgroundImage === 'none') return null
  if (!backgroundImage.includes('gradient')) return null
  const m = /(rgba?\([^)]+\)|color\([^)]+\)|#[0-9a-f]{3,8})/i.exec(backgroundImage)
  return m ? m[1] : null
}

/** 伪元素背景：渐变取首个色标，否则取 background-color */
function pseudoFill(pcs: CSSStyleDeclaration, slideBg: string): { color: string; gradient: boolean } | null {
  const grad = gradientFirstColor(pcs.backgroundImage)
  if (grad) return { color: flattenColor(grad, slideBg), gradient: true }
  const bg = parseColor(pcs.backgroundColor)
  if (!bg || bg.a <= 0) return null
  return { color: flattenColor(pcs.backgroundColor, slideBg), gradient: false }
}

const BLOCK_TAGS = new Set([
  'P', 'DIV', 'UL', 'OL', 'LI', 'PRE', 'TABLE', 'BLOCKQUOTE', 'NAV', 'SECTION', 'ASIDE',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR', 'FIGURE', 'FIGCAPTION',
])

export function buildSlideScene(frame: PptxFrame, opts: SceneOptions): SlideScene {
  const win = frame.window
  const doc = frame.document
  const slide = frame.slide
  const warnings: PptxWarning[] = []
  const nodes: SceneNode[] = []

  const slideRect = rectOf(slide)
  const slideCS = styleOf(slide, win)
  const slideBg = flattenColor(slideCS.backgroundColor, '#FFFFFF')
  const padL = num(slideCS.paddingLeft)
  const padR = num(slideCS.paddingRight)

  // 文本宽度测量（金句大引号是文字，Georgia 的“宽度”必须量，不能猜）
  let measureCtx: CanvasRenderingContext2D | null = null
  const measure = (text: string, cs: CSSStyleDeclaration): number => {
    try {
      if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')
      if (!measureCtx) return fontSizePx(cs) * 0.6
      measureCtx.font = `${cs.fontStyle} ${cs.fontWeight} ${fontSizePx(cs)}px ${cs.fontFamily}`
      return measureCtx.measureText(text).width
    } catch {
      return fontSizePx(cs) * 0.6
    }
  }

  // ---------- 样式 ----------

  const runStyleOf = (el: Element, bg = slideBg): SceneRunStyle => {
    const cs = styleOf(el, win)
    const font = resolveFontStack(cs.fontFamily)
    const isCode = el.tagName === 'CODE' && !el.closest('pre')
    const bgColor = parseColor(cs.backgroundColor)
    const highlight = isCode && bgColor && bgColor.a > 0
      ? flattenColor(cs.backgroundColor, bg)
      : undefined
    const anchor = el.tagName === 'A' ? el as HTMLAnchorElement : null
    const href = anchor?.getAttribute('href') || ''
    return {
      color: flattenColor(cs.color, bg),
      sizePt: pxToPt(fontSizePx(cs)),
      bold: isBold(cs) || undefined,
      italic: /italic|oblique/i.test(cs.fontStyle) || undefined,
      underline: hasUnderline(cs) || undefined,
      strike: hasStrike(cs) || undefined,
      latin: font.latin,
      ea: font.ea,
      charSpacingPt: letterSpacingPt(cs),
      highlight,
      link: /^https?:\/\//i.test(href) ? href : undefined,
    }
  }

  const trimRun = (r: SceneRunStyle): SceneRunStyle => {
    const out: SceneRunStyle = { ...r }
    if (!out.bold) delete out.bold
    if (!out.italic) delete out.italic
    if (!out.underline) delete out.underline
    if (!out.strike) delete out.strike
    if (out.charSpacingPt === undefined) delete out.charSpacingPt
    if (!out.highlight) delete out.highlight
    if (!out.link) delete out.link
    return out
  }

  // ---------- 行内文本收集 ----------

  const collectInline = (root: Element, skipNestedBlocks: boolean, bg = slideBg): SceneParagraph[] => {
    const paragraphs: SceneParagraph[] = []
    let current: SceneRun[] = []

    const flush = () => {
      const runs = current
      current = []
      if (!runs.length) return
      // 去掉块首/块尾空白（HTML 的软换行不进 PPT）
      runs[0].text = runs[0].text.replace(/^ +/, '')
      const last = runs[runs.length - 1]
      last.text = last.text.replace(/ +$/, '')
      const kept = runs.filter((r) => r.text !== '' || r.style.mathTex)
      if (kept.length) paragraphs.push({ runs: kept })
    }

    const push = (text: string, el: Element, extra?: Partial<SceneRunStyle>) => {
      if (!text) return
      const style = trimRun({ ...runStyleOf(el, bg), ...extra })
      const prev = current[current.length - 1]
      if (prev && sameStyle(prev.style, style)) {
        prev.text += text
        return
      }
      current.push({ text, style })
    }

    const visit = (node: Node, parentEl: Element) => {
      if (node.nodeType === 3) {
        const t = cleanText(node.nodeValue || '')
        if (t) push(t, parentEl)
        return
      }
      if (node.nodeType !== 1) return
      const el = node as Element
      const tag = el.tagName
      if (tag === 'SCRIPT' || tag === 'STYLE') return
      const cs = styleOf(el, win)
      if (cs.display === 'none' || cs.visibility === 'hidden') return
      if (el.classList.contains('katex')) {
        const tex = katexTex(el)
        if (tex) {
          // KaTeX 的 `.katex` 自带 `font-size: 1.21em`（它的字体按这个比例设计），
          // 直接取它会比正文大 21%。字号取**外层行内上下文**，才是 PPT 里该用的值。
          const host = el.parentElement || el
          const style = trimRun({ ...runStyleOf(host, bg), mathTex: tex })
          current.push({ text: `$${tex}$`, style })
        } else {
          push(cleanText(el.textContent || ''), el)
        }
        return
      }
      if (tag === 'BR') { flush(); return }
      if (tag === 'IMG') return
      if (tag === 'INPUT') {
        const input = el as HTMLInputElement
        if (input.type === 'checkbox') {
          const accent = flattenColor(win.getComputedStyle(el).accentColor || '#4f46e5', bg)
          push(input.checked ? '☑' : '☐', el, {
            color: input.checked ? accent : flattenColor(styleOf(el, win).color, bg),
            checkbox: true,
          })
        }
        return
      }
      if (skipNestedBlocks && BLOCK_TAGS.has(tag) && el !== root) return
      const children = el.childNodes
      for (let i = 0; i < children.length; i++) visit(children[i], el)
    }

    const children = root.childNodes
    for (let i = 0; i < children.length; i++) visit(children[i], root)
    flush()
    return paragraphs
  }

  // ---------- 节点 ----------

  const pushText = (
    box: Box,
    paragraphs: SceneParagraph[],
    cs: CSSStyleDeclaration,
    opt?: { align?: 'left' | 'center' | 'right'; decorative?: boolean; noWrap?: boolean; bg?: string },
  ) => {
    if (!paragraphs.length) return
    const font = resolveFontStack(cs.fontFamily)
    const bg = opt?.bg || slideBg
    const node: TextNode = {
      t: 'text',
      x: pxToIn(box.x),
      y: pxToIn(box.y),
      w: pxToIn(Math.max(1, box.w)),
      h: pxToIn(Math.max(1, box.h)),
      align: opt?.align || textAlignOf(cs),
      valign: 'top',
      lineSpacingPt: round2(lineHeightPx(cs) * 0.75),
      paragraphs,
      baseColor: flattenColor(cs.color, bg),
      baseSizePt: pxToPt(fontSizePx(cs)),
      latin: font.latin,
      ea: font.ea,
      decorative: opt?.decorative || undefined,
      noWrap: opt?.noWrap || undefined,
    }
    nodes.push(node)
  }

  const emitTextBlock = (el: Element) => {
    const cs = styleOf(el, win)
    const paragraphs = collectInline(el, true)
    if (!paragraphs.length) return
    pushText(textBoxOf(el, win), paragraphs, cs, { align: textAlignOf(cs) })
  }

  const emitImage = (img: HTMLImageElement) => {
    const r = rectOf(img)
    if (r.w < 1 || r.h < 1) return
    const src = img.currentSrc || img.src || img.getAttribute('src') || ''
    if (!src.startsWith('data:')) {
      warnings.push({
        kind: 'image',
        messageKey: 'pptxExport.warnImageNotEmbedded',
        messageArgs: { src: (img.getAttribute('src') || '').slice(0, 80) },
      })
      return
    }
    const cs = styleOf(img, win)
    // Mermaid 栅格化后的 img 是导出侧产物：演示里它是 svg，本来就没有主题给图片加的阴影/圆角。
    const fromMermaid = img.hasAttribute('data-ys-mermaid')
    const shadow = fromMermaid ? undefined : parseBoxShadow(cs)
    nodes.push({
      t: 'image',
      x: pxToIn(r.x), y: pxToIn(r.y), w: pxToIn(r.w), h: pxToIn(r.h),
      src,
      radiusPt: borderRadiusPx(cs) * 0.75,
      shadow,
      alt: img.getAttribute('alt') || undefined,
    })
  }

  const emitHr = (el: Element) => {
    const cs = styleOf(el, win)
    const r = rectOf(el)
    const width = Math.max(1, num(cs.borderTopWidth, 1))
    nodes.push({
      t: 'rect',
      x: pxToIn(r.x), y: pxToIn(r.y), w: pxToIn(r.w), h: pxToIn(width),
      fill: flattenColor(cs.borderTopColor, slideBg),
    })
  }

  const emitCard = (el: Element, box?: Box) => {
    const cs = styleOf(el, win)
    const bg = parseColor(cs.backgroundColor)
    const borderW = Math.max(
      num(cs.borderTopWidth), num(cs.borderRightWidth), num(cs.borderBottomWidth), num(cs.borderLeftWidth),
    )
    const shadow = parseBoxShadow(cs)
    const radius = borderRadiusPx(cs)
    if ((!bg || bg.a <= 0) && borderW <= 0 && !shadow) return
    const r = box || rectOf(el)
    nodes.push({
      t: 'card',
      x: pxToIn(r.x), y: pxToIn(r.y), w: pxToIn(r.w), h: pxToIn(r.h),
      fill: bg && bg.a > 0 ? flattenColor(cs.backgroundColor, slideBg) : undefined,
      lineColor: borderW > 0 ? flattenColor(cs.borderTopColor, slideBg) : undefined,
      linePt: borderW > 0 ? round2(borderW * 0.75) : undefined,
      radiusPt: radius * 0.75,
      shadow,
    })
  }

  const emitBoxDecoration = (el: Element) => {
    const cs = styleOf(el, win)
    const r = rectOf(el)
    const sides: Array<'Top' | 'Right' | 'Bottom' | 'Left'> = ['Top', 'Right', 'Bottom', 'Left']
    for (const side of sides) {
      const w = num((cs as any)[`border${side}Width`])
      if (w < 0.5) continue
      const color = flattenColor((cs as any)[`border${side}Color`] || cs.borderTopColor, slideBg)
      if (side === 'Left' || side === 'Right') {
        const x = side === 'Left' ? r.x : r.x + r.w - w
        nodes.push({ t: 'rect', x: pxToIn(x), y: pxToIn(r.y), w: pxToIn(w), h: pxToIn(r.h), fill: color })
      } else {
        const y = side === 'Top' ? r.y : r.y + r.h - w
        nodes.push({ t: 'rect', x: pxToIn(r.x), y: pxToIn(y), w: pxToIn(r.w), h: pxToIn(w), fill: color })
      }
    }
  }

  const emitCode = (pre: Element) => {
    const cs = styleOf(pre, win)
    const r = rectOf(pre)
    const box = contentBox(pre, win)
    const code = pre.querySelector('code') || pre
    const codeCS = styleOf(code, win)

    const lines: CodeLine[] = [[]]
    const pushRun = (text: string, el: Element) => {
      if (!text) return
      const t = text.replace(/\r/g, '')
      if (!t) return
      const parts = t.split('\n')
      parts.forEach((part, i) => {
        if (i > 0) lines.push([])
        if (!part) return
        const style = trimRun(runStyleOf(el, slideBg))
        const line = lines[lines.length - 1]
        const prev = line[line.length - 1]
        if (prev && sameStyle(prev.style, style)) prev.text += part
        else line.push({ text: part, style })
      })
    }
    const visit = (node: Node, parentEl: Element) => {
      if (node.nodeType === 3) { pushRun(node.nodeValue || '', parentEl); return }
      if (node.nodeType !== 1) return
      const el = node as Element
      if (el.tagName === 'BR') { lines.push([]); return }
      const children = el.childNodes
      for (let i = 0; i < children.length; i++) visit(children[i], el)
    }
    visit(code, code)
    if (lines.length > 1) {
      const last = lines[lines.length - 1]
      if (!last.length) lines.pop()
    }
    lines.forEach((line) => {
      if (!line.length) line.push({ text: ' ', style: trimRun(runStyleOf(code, slideBg)) })
    })

    const naturalW = Math.max(box.w, code.scrollWidth, pre.scrollWidth - (r.w - box.w))
    const scale = naturalW > box.w + 1 ? Math.max(0.6, Math.min(1, box.w / naturalW)) : 1
    if (scale < 0.999) {
      warnings.push({
        kind: 'shrink',
        messageKey: 'pptxExport.warnCodeShrink',
        messageArgs: { percent: Math.round(scale * 100) },
      })
    }

    const font = resolveFontStack(codeCS.fontFamily)
    // 背景/边框按**边框盒**（含 pre 的内边距）单独画，文本仍按内容盒排 ——
    // PowerPoint 的精确行距会把首行整体下移约半个行距，若背景也只覆盖内容盒，
    // 末行（尤其收尾的 `}`）会露到色块外。演示里的色块本来就是含 padding 的。
    const fill = (parseColor(cs.backgroundColor)?.a || 0) > 0 ? flattenColor(cs.backgroundColor, slideBg) : undefined
    const linePt = num(cs.borderTopWidth) > 0 ? round2(num(cs.borderTopWidth) * 0.75) : undefined
    if (fill || linePt) {
      nodes.push({
        t: 'rect',
        x: pxToIn(r.x), y: pxToIn(r.y), w: pxToIn(r.w), h: pxToIn(r.h),
        fill,
        lineColor: linePt ? flattenColor(cs.borderTopColor, slideBg) : undefined,
        linePt,
        radiusPt: borderRadiusPx(cs) * 0.75,
      })
    }
    nodes.push({
      t: 'code',
      x: pxToIn(box.x), y: pxToIn(box.y), w: pxToIn(box.w), h: pxToIn(box.h),
      lines,
      sizePt: pxToPt(fontSizePx(codeCS)),
      lineSpacingPt: round2(lineHeightPx(codeCS) * 0.75),
      latin: font.latin,
      ea: font.ea,
      scale,
    })
  }

  const cellFill = (cell: Element, row: Element): string | undefined => {
    for (const el of [cell, row]) {
      const cs = styleOf(el, win)
      const c = parseColor(cs.backgroundColor)
      if (c && c.a > 0.01) return flattenColor(cs.backgroundColor, slideBg)
    }
    return undefined
  }

  const emitTable = (table: Element) => {
    const rows = Array.from(table.querySelectorAll('tr'))
    if (!rows.length) return
    const tableRect = rectOf(table)
    const colWidths: number[] = []
    const rowHeights: number[] = []
    rows.forEach((row) => {
      rowHeights.push(row.getBoundingClientRect().height)
      Array.from(row.children).forEach((cell, idx) => {
        const w = cell.getBoundingClientRect().width
        colWidths[idx] = Math.max(colWidths[idx] || 0, w)
      })
    })
    const sceneRows: SceneTableCell[][] = rows.map((row) => {
      const cells = Array.from(row.children)
      return cells.map((cell) => {
        const cs = styleOf(cell, win)
        const font = resolveFontStack(cs.fontFamily)
        const borders: SceneTableCell['borders'] = []
        for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const) {
          const w = num((cs as any)[`border${side}Width`])
          borders.push(w > 0.3
            ? { color: flattenColor((cs as any)[`border${side}Color`] || cs.borderTopColor, slideBg), pt: round2(w * 0.75) }
            : null)
        }
        const paragraphs = collectInline(cell, true)
        const text = paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join('\n')
        return {
          text,
          bold: isBold(cs) || undefined,
          color: flattenColor(cs.color, slideBg),
          sizePt: pxToPt(fontSizePx(cs)),
          latin: font.latin,
          ea: font.ea,
          fill: cellFill(cell, row),
          borders,
          align: textAlignOf(cs),
          valign: cs.verticalAlign === 'middle' ? 'middle' : cs.verticalAlign === 'bottom' ? 'bottom' : 'top',
          margin: [num(cs.paddingTop) / 96, num(cs.paddingRight) / 96, num(cs.paddingBottom) / 96, num(cs.paddingLeft) / 96],
          header: cell.tagName === 'TH' || undefined,
        }
      })
    })
    nodes.push({
      t: 'table',
      x: pxToIn(tableRect.x), y: pxToIn(tableRect.y),
      w: pxToIn(colWidths.reduce((a, b) => a + b, 0) || tableRect.w),
      h: pxToIn(rowHeights.reduce((a, b) => a + b, 0) || tableRect.h),
      colW: colWidths.map((w) => round3(w / 96)),
      rowH: rowHeights.map((h) => round3(h / 96)),
      rows: sceneRows,
    })
  }

  const emitMathDisplay = (display: Element) => {
    const r = rectOf(display)
    // 同样避开 `.katex` 的 1.21em：display 容器继承正文的 font-size
    const cs = styleOf(display, win)
    const tex = katexTex(display)
    if (!tex) return
    const font = resolveFontStack(cs.fontFamily)
    const node: MathNode = {
      t: 'math',
      x: pxToIn(r.x), y: pxToIn(r.y), w: pxToIn(r.w), h: pxToIn(r.h),
      tex,
      sizePt: pxToPt(fontSizePx(cs)),
      color: flattenColor(cs.color, slideBg),
      latin: font.latin,
      ea: font.ea,
    }
    nodes.push(node)
  }

  const isOnlyDisplayMath = (el: Element, display: Element): boolean => {
    const kids = Array.from(el.childNodes)
    return kids.every((n) =>
      (n.nodeType === 3 && !(n.nodeValue || '').trim()) ||
      (n.nodeType === 1 && (n === display || (n as Element).contains(display)))
    )
  }

  // ---------- 列表 ----------

  const emitList = (list: Element, ordered: boolean, agenda: boolean) => {
    const lis = Array.from(list.children).filter((c) => c.tagName === 'LI')
    lis.forEach((li, i) => {
      if (styleOf(li, win).display === 'none') return
      const isTask = li.classList.contains('task-list-item')
      const liCS = styleOf(li, win)
      const liBox = contentBox(li, win)

      if (!agenda && !isTask) {
        const pcs = styleOf(li, win, '::before')
        if (hasVisiblePseudo(pcs) && (pcs.content || '').trim() !== 'none') {
          if (ordered) {
            const text = `${i + 1}.`
            const w = Math.max(num(pcs.minWidth, 0), liBox.x - rectOf(li).x + 1)
            const h = Math.max(fontSizePx(pcs), lineHeightPx(pcs))
            const box = pseudoBox(li, pcs, w, h)
            const font = resolveFontStack(pcs.fontFamily || liCS.fontFamily)
            const style: SceneRunStyle = {
              color: pseudoColor(pcs, slideBg),
              sizePt: pxToPt(fontSizePx(pcs)),
              bold: isBold(pcs) || undefined,
              latin: font.latin,
              ea: font.ea,
            }
            // 伪元素的 left/right 决定对齐方向
            const align = pcs.right !== 'auto' && pcs.left === 'auto' ? 'right' : 'left'
            pushText(box, [{ runs: [{ text, style }] }], pcs, { align })
          } else {
            const size = pseudoSize(pcs)
            if (size.w > 0.5 && size.h > 0.5) {
              const box = pseudoBox(li, pcs, size.w, size.h)
              nodes.push({
                t: 'ellipse',
                x: pxToIn(box.x), y: pxToIn(box.y), w: pxToIn(box.w), h: pxToIn(box.h),
                fill: flattenColor(pcs.backgroundColor, slideBg),
              })
            }
          }
        }
      }

      if (agenda) {
        const pcs = styleOf(li, win, '::before')
        const w = Math.max(liBox.x - rectOf(li).x, fontSizePx(pcs) * 1.6)
        // 盒高必须 >= 实际行高：伪元素是 1.6em 大字号，若行距大于字号，
        // 只按 font-size 给高度会让大数字在 PPT 里被裁掉半截。
        const h = Math.max(fontSizePx(pcs), lineHeightPx(pcs), 1)
        const box = pseudoBox(li, pcs, w * 0.9, h)
        const font = resolveFontStack(pcs.fontFamily || liCS.fontFamily)
        const style: SceneRunStyle = {
          color: pseudoColor(pcs, slideBg),
          sizePt: pxToPt(fontSizePx(pcs)),
          bold: isBold(pcs) || undefined,
          latin: font.latin,
          ea: font.ea,
        }
        pushText(box, [{ runs: [{ text: String(i + 1), style }] }], pcs, { align: textAlignOf(pcs), decorative: true })
      }

      // 列表项自身内容（跳过嵌套列表，它们单独排版）。
      // 松散列表会生成 `<li><p>…</p></li>`：此时按块渲染，否则 collectInline 会把 p 整块跳过。
      const ownBlocks = Array.from(li.children).filter((c) =>
        c.tagName === 'P' || c.tagName === 'PRE' || c.tagName === 'TABLE' || c.tagName === 'BLOCKQUOTE')
      if (ownBlocks.length) {
        ownBlocks.forEach((child) => emitBlock(child))
      } else {
        const paragraphs = collectInline(li, true)
        if (paragraphs.length) {
          pushText(textBoxOf(li, win), paragraphs, liCS, { align: textAlignOf(liCS) })
        }
      }

      // 嵌套列表
      Array.from(li.children).forEach((child) => {
        if (child.tagName === 'UL') emitList(child, false, false)
        else if (child.tagName === 'OL') emitList(child, true, false)
      })
    })
  }

  // ---------- 走块 ----------

  const emitChildrenAsBlocks = (el: Element) => {
    Array.from(el.children).forEach((child) => emitBlock(child))
  }

  const emitBlock = (el: Element) => {
    const tag = el.tagName
    const cls = el.classList
    const cs = styleOf(el, win)
    if (cs.display === 'none' || cs.visibility === 'hidden') return

    if (tag === 'HR') { emitHr(el); return }

    if (tag === 'PRE') { emitCode(el); return }

    if (tag === 'TABLE') { emitTable(el); return }

    if (tag === 'IMG') { emitImage(el as HTMLImageElement); return }

    if (cls.contains('katex-display')) { emitMathDisplay(el); return }

    if (tag === 'P') {
      const display = el.querySelector('.katex-display')
      if (display && isOnlyDisplayMath(el, display)) { emitMathDisplay(display); return }
      const imgs = Array.from(el.querySelectorAll('img'))
      if (imgs.length === 1 && isOnlyDisplayMath(el, imgs[0])) { emitImage(imgs[0] as HTMLImageElement); return }
      const onlyImg = el.childNodes.length === 1 && el.firstElementChild?.tagName === 'IMG'
      if (onlyImg) { emitImage(el.firstElementChild as HTMLImageElement); return }
      emitTextBlock(el)
      return
    }

    if (tag === 'UL' || tag === 'OL') {
      emitList(el, tag === 'OL', !!el.closest('.ys-layout-agenda'))
      return
    }

    if (cls.contains('markdown-toc')) {
      emitCard(el)
      // TOC 的条目没有项目符号（CSS content:none）；作为普通文本逐条渲染
      const lis = Array.from(el.querySelectorAll('li'))
      lis.forEach((li) => {
        const paragraphs = collectInline(li, true)
        if (paragraphs.length) pushText(textBoxOf(li, win), paragraphs, styleOf(li, win), { align: textAlignOf(styleOf(li, win)) })
      })
      return
    }

    if (cls.contains('ys-cols')) {
      const cols = Array.from(el.children).filter((c) => c.classList.contains('ys-col'))
      // 卡片：先铺底再放内容
      const style = styleOf(el, win)
      const lineMode = !!slide.closest('.yizi-slideshow')?.classList.contains('ys-col-style-line') ||
        !!el.closest('.ys-col-style-line')
      if (lineMode) {
        cols.forEach((col, idx) => {
          if (idx === 0) return
          const pcs = styleOf(col, win, '::before')
          const w = Math.max(1, num(pcs.width, 1))
          const r = rectOf(col)
          const left = pcs.left !== 'auto' ? num(pcs.left) : -18
          nodes.push({
            t: 'rect',
            x: pxToIn(r.x + left), y: pxToIn(r.y), w: pxToIn(w), h: pxToIn(r.h),
            fill: flattenColor(pcs.backgroundColor || style.borderTopColor, slideBg),
          })
        })
      }
      cols.forEach((col) => {
        emitCard(col)
        Array.from(col.children).forEach((child) => emitBlock(child))
      })
      return
    }

    if (tag === 'BLOCKQUOTE') {
      emitBoxDecoration(el)
      const hasBlockChild = Array.from(el.children).some((c) => BLOCK_TAGS.has(c.tagName))
      if (hasBlockChild) {
        // 子块（p / 列表 / 代码…）各自成文本块。容器自身若还有裸文本，
        // 才额外补一个文本块；否则 collectInline 会把子块里的文字再输出一遍。
        Array.from(el.children).forEach((child) => {
          if (BLOCK_TAGS.has(child.tagName)) emitBlock(child)
        })
        const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.nodeValue || '').trim())
        if (own) {
          const paragraphs = collectInline(el, true)
          if (paragraphs.length) pushText(textBoxOf(el, win), paragraphs, cs, { align: textAlignOf(cs) })
        }
      } else {
        // 只有行内元素（常见：`> 引用` 单段）⇒ 整块作为一个文本块输出
        const paragraphs = collectInline(el, true)
        if (paragraphs.length) pushText(textBoxOf(el, win), paragraphs, cs, { align: textAlignOf(cs) })
      }
      return
    }

    if (tag === 'DIV' || tag === 'SECTION' || tag === 'NAV' || tag === 'ASIDE' || tag === 'FIGURE') {
      // 容器里只有一个 <img> —— 典型是 Mermaid 栅格化后的 `.mermaid > img`：
      // 它既没有块级子元素也没有文本，`collectInline` 会跳过 IMG，不特判就会整块丢失。
      if (el.childNodes.length === 1 && el.firstElementChild?.tagName === 'IMG') {
        emitImage(el.firstElementChild as HTMLImageElement)
        return
      }
      // 有可见背景 / 边框的容器先画成卡片（分栏卡片、目录块、脚注块……）
      emitCard(el)
      const hasBlockChild = Array.from(el.children).some((c) => BLOCK_TAGS.has(c.tagName))
      if (hasBlockChild) {
        emitChildrenAsBlocks(el)
        // 容器自身的纯文本（rare）：只取不在子块里的文本
        const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.nodeValue || '').trim())
        if (own) {
          const paragraphs = collectInline(el, true)
          if (paragraphs.length) pushText(textBoxOf(el, win), paragraphs, cs, { align: textAlignOf(cs) })
        }
      } else {
        const paragraphs = collectInline(el, true)
        if (paragraphs.length) pushText(textBoxOf(el, win), paragraphs, cs, { align: textAlignOf(cs) })
      }
      return
    }

    // 标题 / 其它行内块
    emitTextBlock(el)
  }

  // ---------- 装饰（先画：文字压在上面） ----------

  // 1) 章节大序号（伪元素在流内，不能直接量；用首块位置反推）
  if (opts.kind === 'section' && slide.hasAttribute('data-num')) {
    const pcs = styleOf(slide, win, '::before')
    if (hasVisiblePseudo(pcs)) {
      const first = slide.firstElementChild
      const fsz = fontSizePx(pcs)
      const lh = lineHeightPx(pcs)
      const mb = num(pcs.marginBottom)
      const firstTop = first ? rectOf(first).y : slideRect.y + num(slideCS.paddingTop)
      const box: Box = {
        x: slideRect.x + padL,
        y: firstTop - mb - lh,
        w: Math.max(1, slideRect.w - padL - padR),
        h: lh,
      }
      const font = resolveFontStack(pcs.fontFamily)
      const style: SceneRunStyle = {
        color: pseudoColor(pcs, slideBg),
        sizePt: pxToPt(fsz),
        bold: isBold(pcs) || undefined,
        latin: font.latin,
        ea: font.ea,
      }
      pushText(box, [{ runs: [{ text: slide.getAttribute('data-num') || '', style }] }], pcs, {
        align: textAlignOf(pcs), decorative: true,
      })
    }
  }

  // 2) 标题下划线（内容页 h2 / 封面·结尾页首块；渐变用 objectName 标给 JSZip 后处理）
  Array.from(slide.querySelectorAll('h1, h2, h3, h4')).forEach((h) => {
    const pcs = styleOf(h, win, '::after')
    if (!hasVisiblePseudo(pcs)) return
    const fill = pseudoFill(pcs, slideBg)
    if (!fill) return
    const size = pseudoSize(pcs)
    if (size.w < 1 || size.h < 1) return
    const r = rectOf(h)
    let box: Box
    if (pcs.position === 'absolute') {
      box = pseudoBox(h, pcs, size.w, size.h)
    } else {
      // 封面 / 结尾页的下划线是块级伪元素：margin auto 居中，贴在元素底部
      box = { x: r.x + (r.w - size.w) / 2, y: r.y + r.h - size.h, w: size.w, h: size.h }
    }
    nodes.push({
      t: 'rect',
      x: pxToIn(box.x), y: pxToIn(box.y), w: pxToIn(box.w), h: pxToIn(box.h),
      fill: fill.color,
      gradient: fill.gradient ? { color: fill.color } : undefined,
      radiusPt: borderRadiusPx(pcs) * 0.75,
    })
  })

  // 3) 金句页对角大引号
  const quoteHosts: Element[] = []
  if (slide.firstElementChild) quoteHosts.push(slide.firstElementChild)
  if (slide.lastElementChild && slide.lastElementChild !== slide.firstElementChild) quoteHosts.push(slide.lastElementChild)
  quoteHosts.forEach((host, idx) => {
    const which = idx === 0 ? '::before' : '::after'
    const pcs = styleOf(host, win, which)
    if (!hasVisiblePseudo(pcs)) return
    const raw = (pcs.content || '').trim().replace(/^["']|["']$/g, '')
    if (!raw || raw.length > 4) return
    const fsz = fontSizePx(pcs)
    if (fsz < 24) return
    const w = Math.max(1, measure(raw, pcs) + fsz * 0.08)
    const h = Math.max(fsz, lineHeightPx(pcs))
    let box: Box
    if (idx === 0) {
      // 上引号：right:100%; bottom:calc(100% - .35em) ⇒ 右下角贴着文案左上角
      const r = rectOf(host)
      const right = pcs.right !== 'auto' ? num(pcs.right) : r.w
      const bottom = pcs.bottom !== 'auto' ? num(pcs.bottom) : r.h - fsz * 0.35
      box = { x: r.x + r.w - right - w, y: r.y + r.h - bottom - h, w, h }
    } else {
      const r = rectOf(host)
      const left = pcs.left !== 'auto' ? num(pcs.left) : r.w
      const top = pcs.top !== 'auto' ? num(pcs.top) : r.h
      box = { x: r.x + left, y: r.y + top, w, h }
    }
    const font = resolveFontStack(pcs.fontFamily)
    const style: SceneRunStyle = {
      color: pseudoColor(pcs, slideBg),
      sizePt: pxToPt(fsz),
      latin: font.latin,
      ea: font.ea,
    }
    pushText(box, [{ runs: [{ text: raw, style }] }], pcs, {
      align: idx === 0 ? 'right' : 'left', decorative: true,
    })
  })

  // ---------- 正文 ----------

  // 分栏页：先铺卡片/分隔线（在 .ys-cols 分支里完成）
  Array.from(slide.children).forEach((child) => emitBlock(child))

  // ---------- 页脚 ----------

  if (opts.includeFooter && (opts.chapter || opts.pos)) {
    const footer = doc.querySelector('.ys-footer')
    const chapterEl = footer?.querySelector('.ys-chapter') || null
    const posEl = footer?.querySelector('.ys-pos') || null
    if (footer && (chapterEl || posEl)) {
      const fcs = styleOf(footer, win)
      const runs: SceneRun[] = []
      if (chapterEl && (chapterEl.textContent || '').trim()) {
        runs.push({ text: (chapterEl.textContent || '').trim(), style: trimRun(runStyleOf(chapterEl, slideBg)) })
      }
      if (chapterEl && posEl) {
        runs.push({ text: '   ', style: trimRun(runStyleOf(footer, slideBg)) })
      }
      if (posEl && (posEl.textContent || '').trim()) {
        runs.push({ text: (posEl.textContent || '').trim(), style: trimRun(runStyleOf(posEl, slideBg)) })
      }
      if (runs.length) {
        // 页脚是 `position:fixed` + flex 的收缩宽度：DOM 里刚好一行，但 PowerPoint
        // 的字体度量（尤其 CJK 的 em 宽度）会把 `3 / 9` 折到下一行 —— 直接禁掉换行。
        const box: Box = { x: rectOf(footer).x, y: rectOf(footer).y, w: rectOf(footer).w, h: rectOf(footer).h + EPS }
        pushText(box, [{ runs }], fcs, { align: 'left', noWrap: true })
      }
    }
  }

  // ---------- 快速体检 ----------

  const padT = num(slideCS.paddingTop)
  const padB = num(slideCS.paddingBottom)
  const viewportH = Math.max(1, slide.clientHeight - padT - padB)
  const contentH = Math.max(0, slide.scrollHeight - padT - padB)
  const overflowPx = Math.max(0, contentH - viewportH)
  if (overflowPx > EPS) {
    warnings.push({
      kind: 'overflow',
      slide: opts.index,
      messageKey: 'pptxExport.warnOverflowPx',
      messageArgs: { px: Math.round(overflowPx) },
    })
  }

  return {
    index: opts.index,
    kind: opts.kind,
    title: opts.title,
    background: slideBg,
    notes: opts.notes,
    nodes,
    overflowPx,
    warnings,
    fontScale: 1,
  }
}

/** 供调试/日志：场景节点计数 */
export function sceneSummary(scene: SlideScene): string {
  const counts: Record<string, number> = {}
  scene.nodes.forEach((n) => { counts[n.t] = (counts[n.t] || 0) + 1 })
  return Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(' ')
}

/** 装饰色辅助（导出层调试用） */
export function accentOf(frame: PptxFrame): string {
  return flattenColor(frame.window.getComputedStyle(frame.slide).color, '#ffffff')
}

export { colorAlpha }
