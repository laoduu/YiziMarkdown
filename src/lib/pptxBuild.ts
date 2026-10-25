/**
 * pptxBuild.ts — 场景图 → PptxGenJS → 原生 PPTX（含 XML 后处理）。
 *
 * 分工：
 *   · pptxgenjs 负责「合法的 PresentationML 骨架」：slide / shape / text / table / image；
 *   · 这里负责 PPTX 里 pptxgenjs 表达不了、或者表达得不对的四件事，用 JSZip 直接改 XML：
 *       1. 原生公式（`a14:m` + OMML）—— 以私有区标记定位 run，整段替换成
 *          `mc:AlternateContent`，`mc:Fallback` 保留纯文本，老旧播放器也能看；
 *       2. CJK 字体拆分 —— run 的 fontFace 写成 `latin|ea` 哨兵，生成后拆到
 *          `a:latin` / `a:ea` / `a:cs`，避免中文被西文字体渲染成方框；
 *       3. 渐变装饰（封面/标题下划线）—— 形状按 `yz-grad-*` 命名，把 solidFill 换成 gradFill；
 *       4. 清理 —— 同一段内重复的 `<a:pPr>`（pptxgenjs 每个 run 写一份）、`<a:t>` 缺
 *          `xml:space`、根节点缺 a14/mc 命名空间。
 *
 * 单位：场景图已经是 inch / pt；这里只做「翻译」。
 */
import JSZip from 'jszip'
import type PptxGenJS from 'pptxgenjs'
import type {
  CardNode, CodeNode, ImageNode, MathNode, RectNode, SceneNode, SceneRun, SceneRunStyle,
  SceneTableCell, SlideScene, TableNode, TextNode,
} from './pptxTypes.ts'
import { round2 } from './pptxTheme.ts'

export interface BuildOptions {
  title: string
  author?: string
  subject?: string
  scenes: SlideScene[]
  includeNotes: boolean
  includeFooter: boolean
  /** 0-based 完成页数回调 */
  onProgress?: (done: number, total: number) => void
}

interface MathJob {
  marker: string
  tex: string
  omml?: string
  display: boolean
  sizePt: number
  color: string
}

const MC_NS = 'http://schemas.openxmlformats.org/markup-compatibility/2006'
const A14_NS = 'http://schemas.microsoft.com/office/drawing/2010/main'
const MATH_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math'

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 给 OMML 的每个 `m:r` 补上字号/颜色（DrawingML 里公式 run 的 rPr 是 a:rPr，不是 w:rPr）。 */
function decorateOmml(omml: string, sizePt: number, color: string): string {
  const sz = Math.max(100, Math.round(sizePt * 100))
  return omml.replace(/<m:r>(?:(?!<\/m:r>)[\s\S])*?<\/m:r>/g, (run) => {
    if (run.includes('<a:rPr')) return run
    if (!run.includes('<m:t')) return run
    const rpr = `<a:rPr lang="en-US" sz="${sz}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:rPr>`
    return run.replace(/<m:t/, rpr + '<m:t')
  })
}

function mathAlternateContent(job: MathJob): string {
  const omml = decorateOmml(job.omml || '', job.sizePt, job.color)
  // 行内公式：`m:` 前缀必须就地声明，否则生成的 slide XML 是非法 XML
  // （显示公式把它声明在 m:oMathPara 上；行内没有那层，只能声明在 a14:m 上）。
  const inner = job.display
    ? `<a14:m xmlns:a14="${A14_NS}"><m:oMathPara xmlns:m="${MATH_NS}">${omml}</m:oMathPara></a14:m>`
    : `<a14:m xmlns:a14="${A14_NS}" xmlns:m="${MATH_NS}">${omml}</a14:m>`
  const fallbackText = escapeXml(`$${job.tex}$`)
  return `<mc:AlternateContent xmlns:mc="${MC_NS}" xmlns:a14="${A14_NS}">`
    + `<mc:Choice Requires="a14">${inner}</mc:Choice>`
    + `<mc:Fallback><a:r><a:t xml:space="preserve">${fallbackText}</a:t></a:r></mc:Fallback>`
    + `</mc:AlternateContent>`
}

function fontSentinel(latin: string, ea: string): string {
  return `${latin}|${ea}`
}

function runOptions(run: SceneRun, jobs: Map<string, MathJob>, display = false): { text: string; options: any } {
  const style: SceneRunStyle = run.style
  if (style.mathTex) {
    const marker = `\uE000YZM${jobs.size + 1}\uE001`
    jobs.set(marker, {
      marker,
      tex: style.mathTex,
      omml: style.mathOmml,
      display,
      sizePt: style.sizePt,
      color: style.color,
    })
    return {
      text: marker,
      options: {
        fontSize: style.sizePt,
        color: style.color,
        fontFace: fontSentinel(style.latin, style.ea),
      },
    }
  }
  const options: any = {
    fontSize: style.sizePt,
    color: style.color,
    fontFace: fontSentinel(style.latin, style.ea),
  }
  if (style.bold) options.bold = true
  if (style.italic) options.italic = true
  if (style.underline) options.underline = true
  if (style.strike) options.strike = true
  if (style.charSpacingPt) options.charSpacing = style.charSpacingPt
  if (style.highlight) options.highlight = style.highlight
  if (style.link) options.hyperlink = { url: style.link }
  return { text: run.text, options }
}

function textShape(slide: any, node: TextNode, jobs: Map<string, MathJob>): void {
  const runs: any[] = []
  node.paragraphs.forEach((paragraph, pIdx) => {
    const isLastParagraph = pIdx === node.paragraphs.length - 1
    paragraph.runs.forEach((run, rIdx) => {
      const { text, options } = runOptions(run, jobs)
      if (!text && !run.style.mathTex) return
      const isLastRun = rIdx === paragraph.runs.length - 1
      if (isLastRun && !isLastParagraph) options.breakLine = true
      runs.push({ text, options })
    })
  })
  if (!runs.length) return
  slide.addText(runs, {
    x: node.x,
    y: node.y,
    w: Math.max(0.02, node.w),
    h: Math.max(0.02, node.h),
    margin: 0,
    valign: node.valign,
    align: node.align,
    lineSpacing: Math.max(1, node.lineSpacingPt),
    wrap: !node.noWrap,
    isTextBox: true,
  })
}

function mathShape(slide: any, node: MathNode, jobs: Map<string, MathJob>): void {
  const marker = `\uE000YZM${jobs.size + 1}\uE001`
  jobs.set(marker, {
    marker,
    tex: node.tex,
    omml: node.omml,
    display: true,
    sizePt: node.sizePt,
    color: node.color,
  })
  slide.addText([{ text: marker, options: { fontSize: node.sizePt, color: node.color, fontFace: fontSentinel(node.latin, node.ea) } }], {
    x: node.x,
    y: node.y,
    w: Math.max(0.02, node.w),
    h: Math.max(0.02, node.h),
    margin: 0,
    valign: 'middle',
    align: 'center',
    wrap: false,
    isTextBox: true,
  })
}

function shapeFill(color?: string): any {
  return color ? { color } : { type: 'none' }
}

function shapeShadow(shadow: any): any {
  if (!shadow) return undefined
  return {
    type: 'outer',
    color: shadow.color,
    opacity: shadow.opacity,
    blur: shadow.blurPt,
    offset: shadow.offsetPt,
    angle: shadow.angle,
  }
}

function addRect(pptx: any, slide: any, node: RectNode, gradIndex: { n: number }): void {
  const isRound = (node.radiusPt || 0) > 0.5
  const shape = isRound ? pptx.ShapeType.roundRect : pptx.ShapeType.rect
  const opts: any = {
    x: node.x, y: node.y, w: Math.max(0.01, node.w), h: Math.max(0.01, node.h),
    fill: shapeFill(node.gradient?.color || node.fill),
  }
  if (isRound) {
    // pptxgenjs 的 rectRadius 收的是**英寸**（内部换算 adj = r / min(cx,cy)），
    // 不是比例。传成「点」或「点/短边」都会被二次除，圆角要么爆表要么消失。
    // 上限 = 短边的一半（PPTX 的 adj 上限 50000）。
    opts.rectRadius = Math.min((node.radiusPt || 0) / 72, Math.min(node.w, node.h) / 2)
  }
  if (node.lineColor && (node.linePt || 0) > 0) opts.line = { color: node.lineColor, width: node.linePt }
  const shadow = shapeShadow(node.shadow)
  if (shadow) opts.shadow = shadow
  if (node.gradient) {
    gradIndex.n += 1
    opts.objectName = `yz-grad-${gradIndex.n}`
  }
  slide.addShape(shape, opts)
}

function addCard(pptx: any, slide: any, node: CardNode): void {
  const radius = node.radiusPt || 0
  const isRound = radius > 0.5
  const shape = isRound ? pptx.ShapeType.roundRect : pptx.ShapeType.rect
  const opts: any = {
    x: node.x, y: node.y, w: Math.max(0.01, node.w), h: Math.max(0.01, node.h),
    fill: shapeFill(node.fill),
  }
  // 同 addRect：传英寸，封顶短边一半
  if (isRound) opts.rectRadius = Math.min(radius / 72, Math.min(node.w, node.h) / 2)
  if (node.lineColor && (node.linePt || 0) > 0) opts.line = { color: node.lineColor, width: node.linePt }
  const shadow = shapeShadow(node.shadow)
  if (shadow) opts.shadow = shadow
  slide.addShape(shape, opts)
}

function addImage(slide: any, node: ImageNode): void {
  const data = node.src.replace(/^data:/, '')
  if (!data) return
  const opts: any = {
    data,
    x: node.x, y: node.y, w: Math.max(0.01, node.w), h: Math.max(0.01, node.h),
  }
  const shadow = shapeShadow(node.shadow)
  if (shadow) opts.shadow = shadow
  slide.addImage(opts)
}

function addCode(slide: any, node: CodeNode, jobs: Map<string, MathJob>): void {
  const runs: any[] = []
  const scale = node.scale || 1
  node.lines.forEach((line, i) => {
    const isLastLine = i === node.lines.length - 1
    line.forEach((run, j) => {
      const { text, options } = runOptions(run, jobs)
      options.fontSize = round2(node.sizePt * scale)
      options.fontFace = fontSentinel(node.latin, node.ea)
      const isLastRun = j === line.length - 1
      if (isLastRun && !isLastLine) options.breakLine = true
      runs.push({ text, options })
    })
  })
  if (!runs.length) return
  const opts: any = {
    x: node.x, y: node.y, w: Math.max(0.02, node.w), h: Math.max(0.02, node.h),
    margin: 0, valign: 'top', align: 'left',
    lineSpacing: Math.max(1, round2(node.lineSpacingPt * scale)),
    wrap: false, isTextBox: true,
  }
  // 代码框背景 + 边框：用文本框自身的填充/线（与 pre 的盒子一致）
  if (node.fill) opts.fill = { color: node.fill }
  if (node.lineColor && (node.linePt || 0) > 0) opts.line = { color: node.lineColor, width: node.linePt }
  slide.addText(runs, opts)
}

function cellOptions(cell: SceneTableCell): any {
  const border = cell.borders.map((b) => b
    ? { type: 'solid' as const, color: b.color, pt: b.pt }
    : { type: 'none' as const })
  return {
    fontSize: cell.sizePt,
    color: cell.color,
    bold: cell.bold || undefined,
    fontFace: fontSentinel(cell.latin, cell.ea),
    align: cell.align,
    valign: cell.valign,
    margin: cell.margin,
    fill: cell.fill ? { color: cell.fill } : { type: 'none' },
    border: border as any,
  }
}

function addTable(slide: any, node: TableNode): void {
  const rows = node.rows.map((row) => row.map((cell) => {
    const text = cell.text || ' '
    return {
      text,
      options: cellOptions(cell),
    }
  }))
  if (!rows.length) return
  const opts: any = {
    x: node.x, y: node.y,
    w: Math.max(0.05, node.w),
    h: Math.max(0.05, node.h),
    colW: node.colW,
    rowH: node.rowH,
    autoPage: false,
    valign: 'middle',
    margin: 0,
  }
  slide.addTable(rows, opts)
}

async function postprocessSlideXml(
  xml: string,
  jobs: Map<string, MathJob>,
  gradNames: string[],
): Promise<string> {
  let out = xml

  // 1) 公式：把带私有区标记的 <a:r> 整段换成 mc:AlternateContent
  if (jobs.size) {
    out = out.replace(/<a:r>(?:(?!<\/a:r>)[\s\S])*?<\/a:r>/g, (run) => {
      for (const job of jobs.values()) {
        if (!run.includes(`>${job.marker}</a:t>`)) continue
        // 保留原 run 的字号/颜色做 fallback（字体哨兵交给后续统一拆分）
        const rpr = /<a:rPr\b[^>]*\/>|<a:rPr\b[^>]*>[\s\S]*?<\/a:rPr>/.exec(run)?.[0] || ''
        const ac = mathAlternateContent(job).replace(
          '<mc:Fallback><a:r><a:t',
          `<mc:Fallback><a:r>${rpr}<a:t`,
        )
        return ac
      }
      return run
    })
  }

  // 2) 渐变下划线：按 objectName 定位 <p:sp>，把形状填充的 solidFill 换成 gradFill
  if (gradNames.length) {
    out = out.replace(/<p:sp>[\s\S]*?<\/p:sp>/g, (sp) => {
      const hit = gradNames.find((name) => sp.includes(`name="${name}"`))
      if (!hit) return sp
      const color = /<a:srgbClr val="([0-9A-Fa-f]{6})"\/>/.exec(sp)?.[1] || '4F46E5'
      const grad = `<a:gradFill rotWithShape="1"><a:gsLst>`
        + `<a:gs pos="0"><a:srgbClr val="${color}"/></a:gs>`
        + `<a:gs pos="100000"><a:srgbClr val="${color}"><a:alpha val="0"/></a:srgbClr></a:gs>`
        + `</a:gsLst><a:lin ang="0" scaled="1"/></a:gradFill>`
      let replaced = false
      return sp.replace(/<a:solidFill>[\s\S]*?<\/a:solidFill>/, (sf) => {
        if (replaced) return sf
        replaced = true
        return grad
      })
    })
  }

  // 3) 字体哨兵拆分：latin 取左，ea/cs 取右。
  //    pptxgenjs 输出的是 `<a:latin typeface="..." pitchFamily="34" charset="0"/>`，
  //    所以必须把 typeface 之后的属性一起捕获（v4 一次写 latin/ea/cs 三个）。
  out = out.replace(/<a:latin typeface="([^"]*)\|([^"]*)"([^>]*)\/>/g, '<a:latin typeface="$1"$3/>')
  out = out.replace(/<a:(ea|cs) typeface="([^"]*)\|([^"]*)"([^>]*)\/>/g, '<a:$1 typeface="$3"$4/>')

  // 4) 重复段落属性：同一 <a:p> 只保留第一个 <a:pPr>
  out = out.replace(/<a:p>([\s\S]*?)<\/a:p>/g, (_m, inner: string) => {
    let seen = false
    const cleaned = inner.replace(/<a:pPr\b[^>]*\/>|<a:pPr\b[^>]*>[\s\S]*?<\/a:pPr>/g, (ppr) => {
      if (seen) return ''
      seen = true
      return ppr
    })
    return `<a:p>${cleaned}</a:p>`
  })

  // 5) <a:t> 统一补 xml:space（代码缩进 / 首尾空格必须保留）
  //    必须排除 `<a:tbl>` / `<a:tabLst>` 等以 `a:t` 开头但更长的标签。
  out = out.replace(/<a:t(?![a-zA-Z])(?![^>]*\bxml:space=)([^>]*)>/g, '<a:t xml:space="preserve"$1>')

  // 6) 根节点补命名空间（mc:Ignorable 是 PowerPoint 识别 a14:m 的前提）
  out = out.replace(/<p:sld\b([^>]*)>/, (_m, attrs: string) => {
    let a = attrs
    if (!/xmlns:a14=/.test(a)) a += ` xmlns:a14="${A14_NS}"`
    if (!/xmlns:mc=/.test(a)) a += ` xmlns:mc="${MC_NS}"`
    if (!/mc:Ignorable=/.test(a)) a += ' mc:Ignorable="a14"'
    return `<p:sld${a}>`
  })

  // 7) 健康检查：解析失败直接抛错，避免产出打不开的 PPTX
  if (typeof DOMParser !== 'undefined') {
    const parsed = new DOMParser().parseFromString(out, 'application/xml')
    if (parsed.querySelector('parsererror')) {
      throw new Error('PPTX 后处理生成了非法 XML（公式/渐变注入失败）')
    }
  }
  return out
}

export async function buildPptx(opts: BuildOptions): Promise<ArrayBuffer> {
  const mod = await import('pptxgenjs')
  const PptxCtor: typeof PptxGenJS = (mod as any).default || mod
  const pptx = new PptxCtor()
  // 13.333…×7.5in 恰好等于 PowerPoint 16:9 的 12192000×6858000 EMU
  pptx.defineLayout({ name: 'YIZI_16x9', width: 40 / 3, height: 7.5 })
  pptx.layout = 'YIZI_16x9'
  pptx.title = opts.title
  if (opts.author) pptx.author = opts.author
  if (opts.subject) pptx.subject = opts.subject
  pptx.company = 'YiziMarkdown'

  // marker → job 的全局表：每页一个 Map，但后处理按页独立替换
  const perSlideJobs: Map<string, MathJob>[] = []
  const perSlideGrads: string[][] = []
  let gradCounter = 0

  opts.scenes.forEach((scene, idx) => {
    const slide = pptx.addSlide()
    if (scene.background) slide.background = { color: scene.background }
    const jobs = new Map<string, MathJob>()
    const gradNames: string[] = []
    const gradIndex = {
      get n() { return gradCounter },
      set n(v: number) { gradCounter = v; gradNames.push(`yz-grad-${v}`) },
    }

    scene.nodes.forEach((node: SceneNode) => {
      switch (node.t) {
        case 'text':
          textShape(slide, node, jobs)
          break
        case 'rect':
          addRect(pptx, slide, node, gradIndex)
          break
        case 'ellipse':
          slide.addShape(pptx.ShapeType.ellipse, {
            x: node.x, y: node.y, w: Math.max(0.01, node.w), h: Math.max(0.01, node.h),
            fill: { color: node.fill },
          })
          break
        case 'card':
          addCard(pptx, slide, node)
          break
        case 'image':
          addImage(slide, node)
          break
        case 'code':
          addCode(slide, node, jobs)
          break
        case 'table':
          addTable(slide, node)
          break
        case 'math':
          mathShape(slide, node, jobs)
          break
        case 'line':
          // 场景层用细矩形画分隔线；LineNode 仅作兼容
          slide.addShape(pptx.ShapeType.line, {
            x: node.x1, y: node.y1,
            w: Math.abs(node.x2 - node.x1) || 0.01,
            h: Math.abs(node.y2 - node.y1),
            line: { color: node.color, width: node.widthPt },
          })
          break
      }
    })

    if (opts.includeNotes && scene.notes) {
      slide.addNotes(scene.notes)
    }
    perSlideJobs.push(jobs)
    perSlideGrads.push(gradNames)
    opts.onProgress?.(idx + 1, opts.scenes.length)
  })

  const raw = await pptx.write({ outputType: 'arraybuffer' }) as ArrayBuffer
  const zip = await JSZip.loadAsync(raw)

  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = parseInt(a.replace(/\D+/g, ''), 10)
      const nb = parseInt(b.replace(/\D+/g, ''), 10)
      return na - nb
    })

  for (let i = 0; i < slideFiles.length; i++) {
    const name = slideFiles[i]
    const xml = await zip.file(name)!.async('string')
    const patched = await postprocessSlideXml(xml, perSlideJobs[i] || new Map(), perSlideGrads[i] || [])
    zip.file(name, patched)
  }

  return await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })
}
