/**
 * Word 导出排版规范（DOCX layout）。
 *
 * 这是 DOCX 版式的**唯一事实源**：Rust 侧只负责把这里的数值序列化成 OOXML，
 * 不再自己猜标题比例、段距、引用块颜色。主题只提供颜色/字体/代码高亮，
 * 版式值固定，从而保证「换主题不换版式、跨文档一致」。
 *
 * 规范基准：A4、正文 11pt、1.5 倍行距；标题 18/15/13/12/11/11pt；
 * 段前 0/段后 6pt；列表 0.74cm 缩进、0.37cm 悬挂；引用 10.5pt；代码 9pt；表格 10pt。
 * 所有 em 值都以「11pt 正文」为基准换算，字号随 `body.sizePt` / 预览设置变化。
 */

export interface DocxFonts {
  /** 正文西文字体 */
  latin: string
  /** 正文东亚字体 */
  eastAsia: string
  /** 标题西文字体 */
  headingLatin: string
  /** 标题东亚字体 */
  headingEastAsia: string
  /** 等宽字体 */
  mono: string
}

/** 「字体跟随预览」关闭时使用的 Word 经典默认字体（Windows / macOS Office 均自带或可回退） */
export const WORD_DEFAULT_FONTS: DocxFonts = {
  latin: 'Calibri',
  eastAsia: 'DengXian',
  headingLatin: 'Calibri Light',
  headingEastAsia: 'DengXian Light',
  mono: 'Consolas',
}

export interface DocxLayoutOptions {
  /** false = 使用 Word 默认字体；缺省/true = 正文与标题都跟随预览字体 */
  followPreviewFont?: boolean
}

export interface DocxBodyLayout {
  /** 正文字号（pt）；规范基准 11pt */
  sizePt: number
  /** 行高倍数；规范基准 1.5 */
  lineHeight: number
  /** true = 正文字号跟随设置里的「预览字号」；false = 固定用 sizePt */
  followPreviewSize: boolean
  /** 正文对齐：`both` = 两端对齐（中文文档默认），`left` = 左对齐 */
  align: 'left' | 'both'
  /** 首行缩进（em）；技术文档默认 0 */
  firstLineIndentEm: number
}

export interface DocxHeadingsLayout {
  /** H1-H6 相对正文字号的倍数（规范：18/15/13/12/11/11pt ÷ 11pt） */
  scales: number[]
  /** H1-H6 段前（em）（规范：18/12/10/8/6/6pt ÷ 11pt） */
  beforeEm: number[]
  /** H1-H6 段后（em）；当前版本统一走段前，保留字段给后续细调 */
  afterEm: number[]
  bold: boolean
}

export interface DocxParagraphLayout {
  /** 段前（em）；规范段前 0、段后 6pt，因此取 6pt/11pt */
  beforeEm: number
}

export interface DocxListLayout {
  /** 列表整体段前（em） */
  beforeEm: number
  /** 列表项之间的段前（em）；规范 3pt */
  itemGapEm: number
  /** 每级左缩进（em）；规范 0.74cm */
  indentEm: number
  /** 悬挂缩进（em）；规范 0.37cm */
  hangingEm: number
}

export interface DocxQuoteLayout {
  /** 引用字号相对正文的倍数；规范 10.5pt */
  scale: number
  /** 引用行距（Word 口径：1.0 = 单倍）；规范用单倍，避免多倍行距把文字顶到行框上沿 */
  lineHeight: number
  paddingXEm: number
  paddingYEm: number
  /** 引用块内段落之间（em） */
  paragraphGapEm: number
  /** 左侧强调边框宽度（pt） */
  borderPt: number
  /** 引用文字色；空串 = 跟随正文色 */
  textColor: string
}

export interface DocxCodeLayout {
  /** 代码字号相对正文的倍数；规范 9pt */
  scale: number
  /** 代码块段前（em） */
  beforeEm: number
  /** 内边距（em）；规范 0.2cm */
  paddingXEm: number
  paddingYEm: number
}

export interface DocxTableLayout {
  /** 表格字号相对正文的倍数；规范 10pt */
  scale: number
  /** 表格/引用块之后的间隔（em） */
  gapEm: number
  /** 单元格边距（em）；规范 0.1cm */
  cellMarginXEm: number
  cellMarginYEm: number
  borderPt: number
}

export interface DocxRuleLayout {
  beforeEm: number
  afterEm: number
}

export interface DocxTocLayout {
  /** 收录到第几级标题（1-6） */
  maxLevel: number
  /** 目录条目行高（相对正文字号的倍数） */
  lineHeight: number
  /** 目录条目之间的段前（em） */
  entryGapEm: number
  /** 「目录」标题相对正文字号的倍数 */
  headingScale: number
  /** 「目录」标题与第一条之间的间距（em） */
  headingAfterEm: number
}

export interface DocxLayout {
  fonts: DocxFonts
  body: DocxBodyLayout
  headings: DocxHeadingsLayout
  paragraph: DocxParagraphLayout
  list: DocxListLayout
  quote: DocxQuoteLayout
  code: DocxCodeLayout
  table: DocxTableLayout
  rule: DocxRuleLayout
  toc: DocxTocLayout
}

const PX_PER_CM = 96 / 2.54
const CM = (cm: number) => (cm * PX_PER_CM * 0.75) / 11 // cm → em（以 11pt 为基准）

/** 通用族 / 系统关键字 → 具体字体名（与 Rust 侧 `css_generic_to_font` 保持同一口径） */
const GENERIC_FONTS: Record<string, string> = {
  'system-ui': 'Microsoft YaHei',
  '-apple-system': 'Microsoft YaHei',
  blinkmacsystemfont: 'Microsoft YaHei',
  'ui-sans-serif': 'Microsoft YaHei',
  'sans-serif': 'Calibri',
  'ui-serif': 'SimSun',
  serif: 'SimSun',
  monospace: 'Consolas',
  'ui-monospace': 'Consolas',
}

const CJK_RE =
  /(misans|yahei|pingfang|noto sans (sc|tc|cjk)|source han|simsun|simhei|harmonyos|hiragino|heiti|songti|kaiti|宋体|微软雅黑|苹方|思源|黑体|楷体)/i

/** CSS font-family 栈 → 族名数组（去掉引号与空项）。 */
export function splitFontStack(stack: string): string[] {
  if (!stack || /var\(/i.test(stack)) return []
  return stack
    .split(',')
    .map((part) => part.trim().replace(/^['"]|['"]$/g, '').trim())
    .filter(Boolean)
}

function concreteFont(name: string, fallback: string): string {
  const key = name.toLowerCase()
  return GENERIC_FONTS[key] || name || fallback
}

/**
 * 从预览字体栈里拆出「拉丁字体 / 东亚字体 / 等宽字体」。
 *
 * 之前 Rust 把同一个字体名同时写进 `w:ascii` 和 `w:eastAsia`，当主题第一个族是
 * `Inter` 这类纯拉丁字体时，Word 只能逐字回退（常见是宋体），导出结果不可控。
 */
export function resolveDocxFonts(fontFamily: string, monoFamily: string): DocxFonts {
  const families = splitFontStack(fontFamily)
  const cjk = families.find((name) => CJK_RE.test(name))
  const first = families[0]

  const latin = first
    ? concreteFont(first, 'Calibri')
    : cjk
      ? concreteFont(cjk, 'Microsoft YaHei')
      : 'Calibri'
  const eastAsia = cjk
    ? concreteFont(cjk, 'Microsoft YaHei')
    : first && CJK_RE.test(first)
      ? concreteFont(first, 'Microsoft YaHei')
      : 'Microsoft YaHei'
  const mono = concreteFont(splitFontStack(monoFamily)[0] || '', 'Consolas')

  // 跟随预览时标题与正文同一族；标题的层级只靠字号/加粗表达（与现有行为一致）
  return { latin, eastAsia, headingLatin: latin, headingEastAsia: eastAsia, mono }
}

/**
 * 生成 Word 版式规范（前面确定的 Word 文档规范）。
 *
 * 默认：A4 / 11pt / 1.5 倍行距；标题 18/15/13/12/11/11pt；
 * 段前 0、段后 6pt；列表 0.74cm / 0.37cm；引用 10.5pt；代码 9pt；表格 10pt。
 *
 * `followPreviewSize = true` 时正文字号跟随设置里的「预览字号」，其余比例不变；
 * 默认 false，即任何电脑上导出的 Word 都是同一套标准字号。
 * `followPreviewFont = false` 时改用 `WORD_DEFAULT_FONTS`（Word 经典默认字体），
 * 标题与正文使用不同的字体族（Calibri Light / DengXian Light vs Calibri / DengXian）。
 */
export function buildDocxLayout(
  fontFamily: string,
  monoFamily: string,
  options: DocxLayoutOptions = {},
): DocxLayout {
  const bodyPt = 11
  const fonts = options.followPreviewFont === false
    ? { ...WORD_DEFAULT_FONTS }
    : resolveDocxFonts(fontFamily, monoFamily)
  return {
    fonts,
    body: { sizePt: bodyPt, lineHeight: 1.5, followPreviewSize: false, align: 'both', firstLineIndentEm: 0 },
    headings: {
      // 18/15/13/12/11/11pt ÷ 11pt
      scales: [18 / 11, 15 / 11, 13 / 11, 12 / 11, 1, 1],
      // 18/12/10/8/6/6pt ÷ 11pt
      beforeEm: [18 / 11, 12 / 11, 10 / 11, 8 / 11, 6 / 11, 6 / 11],
      afterEm: [0, 0, 0, 0, 0, 0],
      bold: true,
    },
    // 段前 0、段后 6pt（只走段前，等价于 6pt 间隔）
    paragraph: { beforeEm: 6 / 11 },
    list: {
      beforeEm: 6 / 11,
      itemGapEm: 3 / 11,
      indentEm: CM(0.74),
      hangingEm: CM(0.37),
    },
    quote: {
      scale: 10.5 / 11,
      lineHeight: 1.0,
      paddingXEm: CM(0.4),
      paddingYEm: CM(0.4),
      paragraphGapEm: 6 / 11,
      borderPt: 3,
      textColor: '',
    },
    code: {
      // 预览代码块是 0.9em（11pt 正文 → 约 10pt）；9pt 会明显偏小。
      scale: 10 / 11,
      beforeEm: 6 / 11,
      paddingXEm: CM(0.2),
      paddingYEm: CM(0.2),
    },
    table: {
      scale: 10 / 11,
      gapEm: 6 / 11,
      cellMarginXEm: CM(0.2),
      cellMarginYEm: CM(0.1),
      borderPt: 0.5,
    },
    rule: { beforeEm: 6 / 11, afterEm: 6 / 11 },
    toc: { maxLevel: 6, lineHeight: 1.15, entryGapEm: 3 / 11, headingScale: 13 / 11, headingAfterEm: 6 / 11 },
  }
}