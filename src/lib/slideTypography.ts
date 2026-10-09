/**
 * slideTypography.ts — 演示模式排版旋钮（字体 / 字重 / 字号 / 内容填充宽度 / 内容填充高度）。
 *
 * 为什么单独一个模块：这些值既要从设置持久化（settingsStore）、又要变成
 * CSS 变量（Slideshow.tsx 的行内样式）、还要能被 `node --test` 直接单测
 * ⇒ 纯函数 + 零依赖（不 import npm 包、不 import React）。
 *
 * 约定：**默认值一律不产出变量**，交给 globals.css 的默认声明 ——
 * 没调过的演示与加入这些旋钮之前逐像素一致，也不会压过主题/user.css。
 *
 * 「内容填充宽度/高度」的语义 = **内容区占整屏的百分比**（50%~95%）。
 * 之所以不是「页边距」：页边距只能改内边距，而内容宽度原先被 9 处写死的 rem
 * 上限（66rem / 58rem / …）钉住 ⇒ 调页边距看不出任何变化。填充比例是**唯一**
 * 依据：slideshow.css 里那些上限已全部改为 100%，由它接管。
 * 默认 82% / 84% 恰好等于原来的 `9vw` / `8vh` 页边距。
 */

/** 字体预设：存 id 而不是字体栈，字体栈改名不会让存量存档失效 */
export type SlideFontId = 'default' | 'sans' | 'serif' | 'mono'

export const SLIDE_FONT_IDS: SlideFontId[] = ['default', 'sans', 'serif', 'mono']

/** default = 跟随主题 / 预览字体（不写变量） */
export const SLIDE_FONT_STACKS: Record<SlideFontId, string> = {
  default: '',
  sans: "'MiSans', 'Mi Sans', system-ui, -apple-system, 'PingFang SC', 'Segoe UI', 'Microsoft YaHei', 'Noto Sans SC', sans-serif",
  serif: "'Songti SC', 'SimSun', 'Noto Serif SC', Georgia, 'Times New Roman', serif",
  mono: "'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, 'Courier New', monospace",
}

export const SLIDE_FONT_WEIGHTS: number[] = [300, 400, 500, 600, 700]

export const DEFAULT_SLIDE_FONT_WEIGHT = 400

/** 字号缩放区间（HUD 滑杆与边界收敛共用同一份定义） */
export const SLIDE_FONT_SCALE = { min: 0.7, max: 1.6, step: 0.05, default: 1 }

/** 内容填充比例：界面以**百分数**（50~95）呈现，CSS 变量以**小数**（0.50~0.95）下发。
 *  默认值 = 原 `9vw` / `8vh` 页边距对应的占比（82% / 84%）⇒ 默认观感不变。 */
export const SLIDE_FILL = { min: 50, max: 95, step: 1, defaultW: 82, defaultH: 84 }

export interface SlideTypography {
  fontFamily: SlideFontId
  fontWeight: number
  fontScale: number
  /** 内容区宽度占整屏百分比（50~95） */
  fillWidth: number
  /** 内容区高度占整屏百分比（50~95） */
  fillHeight: number
}

export const DEFAULT_SLIDE_TYPOGRAPHY: SlideTypography = {
  fontFamily: 'default',
  fontWeight: DEFAULT_SLIDE_FONT_WEIGHT,
  fontScale: SLIDE_FONT_SCALE.default,
  fillWidth: SLIDE_FILL.defaultW,
  fillHeight: SLIDE_FILL.defaultH,
}

/** 收敛到合法区间（存档可能被手改 / 旧版本残留 / 滑杆越界）。
 *  只接受数字与数字字符串：null / undefined / '' / 布尔 一律视为"未设置"回落默认值。
 *  （⚠️ 不能直接用 Number()：Number(null) === 0 是合法数值，会把"缺失的存档"
 *   静默改成 0，字号/填充比例直接归零。） */
export function clampNumber(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== 'number' && typeof v !== 'string') return fallback
  if (typeof v === 'string' && v.trim() === '') return fallback
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

export function isSlideFontId(v: unknown): v is SlideFontId {
  return typeof v === 'string' && (SLIDE_FONT_IDS as string[]).includes(v)
}

/**
 * 转成挂在 .yizi-slideshow 根节点上的行内 CSS 变量。
 * 默认值不产出条目 ⇒ 交给 globals.css 的默认声明（见 globals.css 的 --ys-*）。
 */
export function slideTypographyVars(t: Partial<SlideTypography>): Record<string, string> {
  const out: Record<string, string> = {}

  const stack = SLIDE_FONT_STACKS[isSlideFontId(t.fontFamily) ? t.fontFamily : 'default']
  if (stack) out['--ys-font-family'] = stack

  const weight = clampNumber(t.fontWeight, 100, 900, DEFAULT_SLIDE_FONT_WEIGHT)
  if (weight !== DEFAULT_SLIDE_FONT_WEIGHT) out['--ys-font-weight'] = String(weight)

  const fontScale = clampNumber(t.fontScale, SLIDE_FONT_SCALE.min, SLIDE_FONT_SCALE.max, SLIDE_FONT_SCALE.default)
  if (fontScale !== SLIDE_FONT_SCALE.default) out['--ys-font-scale'] = String(fontScale)

  // 填充比例：百分数 → 小数（整数区间，n/100 不会有浮点尾巴）
  const fillW = clampNumber(t.fillWidth, SLIDE_FILL.min, SLIDE_FILL.max, SLIDE_FILL.defaultW)
  if (fillW !== SLIDE_FILL.defaultW) out['--ys-fill-w'] = String(fillW / 100)

  const fillH = clampNumber(t.fillHeight, SLIDE_FILL.min, SLIDE_FILL.max, SLIDE_FILL.defaultH)
  if (fillH !== SLIDE_FILL.defaultH) out['--ys-fill-h'] = String(fillH / 100)

  return out
}
