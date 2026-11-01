/**
 * mermaidTheme.ts — YiziMarkdown 主题 → Mermaid `base` themeVariables 的纯映射。
 *
 * 不直接使用 Mermaid 的 default/dark/forest/neutral：这些预设无法跟随应用主题
 * （尤其是自定义主题和用户 CSS）。这里只做「语义色 → Mermaid 变量」的映射；
 * Mermaid 的 `theme: 'base'` 会以这些变量生成各图种的样式。
 */
import type { ThemePalette } from '../lib/themePalette.ts'
import { mixColor } from '../lib/themePalette.ts'

export type MermaidThemeVariables = Record<string, string | number | boolean>

export function buildMermaidThemeVariables(palette: ThemePalette): MermaidThemeVariables {
  const { bg, text, accent, surface, border, secondaryText, fontFamily, isDark } = palette
  const nodeFill = mixColor(surface, accent, 0.08)
  const nodeBorder = mixColor(border, accent, 0.35)
  const line = mixColor(text, accent, 0.28)
  const subtleFill = mixColor(surface, bg, 0.35)
  const noteFill = mixColor(surface, accent, 0.12)

  return {
    darkMode: isDark,
    background: bg,

    // 通用节点 / 容器
    primaryColor: nodeFill,
    primaryTextColor: text,
    primaryBorderColor: nodeBorder,
    secondaryColor: subtleFill,
    tertiaryColor: bg,
    mainBkg: nodeFill,
    nodeBorder,
    clusterBkg: surface,
    clusterBorder: border,
    lineColor: line,
    textColor: text,
    titleColor: text,
    edgeLabelBackground: bg,
    fontFamily,
    fontSize: '16px',

    // 时序图
    actorBkg: nodeFill,
    actorBorder: nodeBorder,
    actorTextColor: text,
    actorLineColor: line,
    signalColor: line,
    signalTextColor: text,
    labelBoxBkgColor: surface,
    labelBoxBorderColor: border,
    labelTextColor: text,
    loopTextColor: text,
    noteBkgColor: noteFill,
    noteBorderColor: border,
    noteTextColor: text,
    activationBkgColor: noteFill,
    activationBorderColor: nodeBorder,

    // 状态图 / 类图 / 甘特图常用的补充变量
    labelColor: text,
    altBackground: bg,
    gridColor: border,
    doneTaskBkgColor: subtleFill,
    doneTaskBorderColor: border,
    taskBkgColor: nodeFill,
    taskBorderColor: nodeBorder,
    taskTextColor: text,
    activeTaskBkgColor: noteFill,
    activeTaskBorderColor: nodeBorder,
    activeTaskTextColor: text,
    todayLineColor: accent,
    critBkgColor: accent,
    critBorderColor: accent,
    critTextColor: bg,

    // 类图/思维导图
    classText: text,
    sectBkgColor: surface,
    sectionBkgColor: surface,
    sectionBkgColor2: subtleFill,
    altSectionBkgColor: bg,
    attributeBackgroundColorOdd: surface,
    attributeBackgroundColorEven: bg,

    // 饼图
    pieTitleTextColor: text,
    pieSectionTextColor: text,
    pieStrokeColor: border,
    pieLegendTextColor: text,

    // 错误/强调文字
    errorBkgColor: noteFill,
    errorTextColor: accent,
    tertiaryTextColor: secondaryText,
  }
}

export interface MermaidConfigOptions {
  /** 预览用 true（HTML labels 更清晰）；DOCX/PPTX 导出用 false（resvg 不认 foreignObject）。 */
  htmlLabels?: boolean
}

export function buildMermaidConfig(palette: ThemePalette, opts: MermaidConfigOptions = {}) {
  return {
    startOnLoad: false,
    theme: 'base',
    themeVariables: buildMermaidThemeVariables(palette),
    securityLevel: 'loose' as const,
    htmlLabels: opts.htmlLabels ?? true,
    fontFamily: palette.fontFamily,
  }
}
