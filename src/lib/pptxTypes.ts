/**
 * pptxTypes.ts — PPTX 导出的场景图（DOM 测量结果）与告警类型。
 *
 * 单位约定：所有 x/y/w/h 都是**英寸**（相对幻灯片左上角），所有字号都是 **pt**。
 * 颜色一律是不带 `#` 的 6 位十六进制（已 flatten，不透明）。
 * 场景图是 DOM 与 pptxgenjs 之间的唯一中间层：测量与生成解耦，纯函数可单测。
 */

import type { SlideKind } from './slides.ts'

export type PptxAlign = 'left' | 'center' | 'right'

/** 导出告警：超页 / 公式回退 / 图片失败 / 图表失败 / 自动压缩 */
export interface PptxWarning {
  kind: 'overflow' | 'math' | 'image' | 'mermaid' | 'shrink' | 'other'
  /**
   * i18n key（`pptxExport.warn*`）。**优先**使用它：告警最终在弹窗里按用户
   * 当前语言渲染，而不是把中文写死进测量层 / 导出编排层。
   */
  messageKey?: string
  /** `messageKey` 的插值参数（`{n}` / `{px}` / `{percent}` / `{error}` …） */
  messageArgs?: Record<string, string | number>
  /** 无 `messageKey` 时的兜底文案（第三方错误信息等无法翻译的情况） */
  message?: string
  /** 关联页码（1 起）；跨页汇总类告警不放这里 */
  slide?: number
}

export interface SceneRunStyle {
  color: string
  sizePt: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  /** 字体拆分：latin / ea（PptxGenJS 只接受单个 fontFace，生成后由 JSZip 拆分） */
  latin: string
  ea: string
  /** 字距（pt） */
  charSpacingPt?: number
  /** 行内代码底色（已 flatten），对应 PptxGenJS 的 highlight */
  highlight?: string
  /** 超链接（仅 http/https/mailto） */
  link?: string
  /** 行内公式的 TeX（生成层替换成 OMML；失败回退纯文本） */
  mathTex?: string
  /** Rust `latex_to_omml` 的产物（`<m:oMath>…`）；缺失时回退纯文本 */
  mathOmml?: string
  /** 复选框字形（☑ / ☐） */
  checkbox?: boolean
}

export interface SceneRun {
  /** 公式 run 这里为空串（用私有区标记代替），其余为真实文本 */
  text: string
  style: SceneRunStyle
}

export interface SceneParagraph {
  runs: SceneRun[]
}

export interface TextNode {
  t: 'text'
  x: number
  y: number
  w: number
  h: number
  align: PptxAlign
  valign: 'top' | 'middle' | 'bottom'
  /** 精确行距（pt，取 computed line-height） */
  lineSpacingPt: number
  paragraphs: SceneParagraph[]
  /** 段落级默认样式（外层 options，run 可覆盖） */
  baseColor: string
  baseSizePt: number
  latin: string
  ea: string
  /** 装饰性文本（大序号 / 引号 / agenda 数字）：不参与超页检测的编辑性修正 */
  decorative?: boolean
  /** 文本框不换行（代码块：用横向滚动语义，宁可溢出也不折行） */
  noWrap?: boolean
}

export interface RectNode {
  t: 'rect'
  x: number
  y: number
  w: number
  h: number
  fill?: string
  lineColor?: string
  linePt?: number
  radiusPt?: number
  shadow?: { color: string; opacity: number; blurPt: number; offsetPt: number; angle: number }
  /** 渐变下划线：生成后由 JSZip 把 solidFill 换成 gradFill（accent → transparent） */
  gradient?: { color: string }
}

export interface EllipseNode {
  t: 'ellipse'
  x: number
  y: number
  w: number
  h: number
  fill: string
}

export interface LineNode {
  t: 'line'
  /** 线段中心线 */
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
  widthPt: number
}

export interface ImageNode {
  t: 'image'
  x: number
  y: number
  w: number
  h: number
  /** data URL（`data:image/png;base64,…`） */
  src: string
  radiusPt?: number
  shadow?: { color: string; opacity: number; blurPt: number; offsetPt: number; angle: number }
  alt?: string
}

export interface SceneTableCell {
  text: string
  bold?: boolean
  color: string
  sizePt: number
  latin: string
  ea: string
  fill?: string
  /** [top,right,bottom,left] */
  borders: Array<{ color: string; pt: number } | null>
  align: PptxAlign
  valign: 'top' | 'middle' | 'bottom'
  /** [top,right,bottom,left] in inch */
  margin: [number, number, number, number]
  header?: boolean
}

export interface TableNode {
  t: 'table'
  x: number
  y: number
  w: number
  h: number
  colW: number[]
  rowH: number[]
  rows: SceneTableCell[][]
}

/** 一行代码 = 若干 run。换行由「行」这一结构表达，不写进 run.text（避免 PPT 里多出空行）。 */
export type CodeLine = SceneRun[]

export interface CodeNode {
  t: 'code'
  x: number
  y: number
  w: number
  h: number
  lines: CodeLine[]
  /** 代码框背景（已 flatten；透明时不画） */
  fill?: string
  lineColor?: string
  linePt?: number
  radiusPt?: number
  sizePt: number
  /** 精确行距（pt） */
  lineSpacingPt: number
  latin: string
  ea: string
  /** 内容横向超宽时整体缩放的系数（0.6~1） */
  scale: number
}

export interface MathNode {
  t: 'math'
  x: number
  y: number
  w: number
  h: number
  tex: string
  /** Rust `latex_to_omml` 的产物（`<m:oMath>…`）；缺失时回退纯文本 */
  omml?: string
  sizePt: number
  color: string
  latin: string
  ea: string
}

export interface CardNode {
  t: 'card'
  x: number
  y: number
  w: number
  h: number
  fill?: string
  lineColor?: string
  linePt?: number
  radiusPt?: number
  shadow?: { color: string; opacity: number; blurPt: number; offsetPt: number; angle: number }
}

export type SceneNode = TextNode | RectNode | EllipseNode | LineNode | ImageNode | TableNode | CodeNode | MathNode | CardNode

export interface SlideScene {
  /** 1 起的页码（与演示页序一致） */
  index: number
  kind: SlideKind
  title?: string
  /** 幻灯片背景（flatten 后的 hex） */
  background: string
  notes: string
  /** 按 z 序：装饰 / 卡片在前，内容在后 */
  nodes: SceneNode[]
  /** 内容超出可视区的高度（px），0 = 不溢出 */
  overflowPx: number
  warnings: PptxWarning[]
  /** 自动压缩模式下该页的字号系数（0.6~1） */
  fontScale: number
}
