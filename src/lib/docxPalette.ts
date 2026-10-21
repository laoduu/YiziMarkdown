/**
 * DOCX 导出调色板（纯函数，可在 node 下直接测试）。
 *
 * 背景：导出的 docx **页面恒为白底**，而主题变量是给屏幕用的 —— 暗色主题的
 * `--editor-text` 是亮色（如 matrix 的 `#00ff41`）、`--editor-surface` 接近纯黑，
 * 直接照搬会得到「白纸上的荧光字 + 黑块」，几乎不可读（v0.3.5 修复）。
 *
 * 于是这里做两件事：
 *   1. 暗色主题：正文/底色/边框改用**白底等效色**（深灰字 + 浅灰底/边框）。
 *   2. 强调色：**保留主题色相**，只把过亮的颜色压到白底可读的亮度
 *      （WCAG 相对亮度 ≤ 0.3，约合 3:1 对比度，够标题/链接这种大号字）。
 * 顺带把 `rgba()` / `#rgb` 这类写法归一成 `#rrggbb`：Rust 侧只认十六进制，
 * 遇到 `var()`/`rgb()` 会退回默认色（等于主题色丢失）。
 */

export interface Rgb {
  r: number
  g: number
  b: number
}

export interface DocxPaletteInput {
  /** 当前是否暗色主题（`isDark`） */
  isDark: boolean
  /** 主题强调色（`--editor-cursor`/`--editor-accent`） */
  accent: string
  /** 正文色（`--editor-text`） */
  text: string
  /** 底色（`--editor-surface`，用于表格表头/引用/代码块） */
  surface: string
  /** 边框色（`--editor-border`） */
  border: string
}

export interface DocxPalette {
  accent: string
  text: string
  surface: string
  border: string
}

/** 白底文档的兜底配色（与 globals.css 默认主题一致） */
export const DOCX_LIGHT_FALLBACK = {
  accent: '#0066cc',
  text: '#333333',
  surface: '#f5f5f5',
  border: '#dddddd',
} as const

/** 强调色在白底上的亮度上限：WCAG 相对亮度 0.3 ≈ 3:1 对比度 */
const MAX_ACCENT_LUMINANCE = 0.3

const clampByte = (n: number) => Math.max(0, Math.min(255, Math.round(n)))

/** 解析 `#rgb` / `#rrggbb` / `rgb()` / `rgba()`；半透明按**白底**合成（导出无法表现透明度） */
export function parseCssColor(input: string): Rgb | null {
  const v = (input || '').trim().toLowerCase()
  if (!v) return null
  if (v.startsWith('#')) {
    const h = v.slice(1)
    if (!/^[0-9a-f]+$/.test(h)) return null
    if (h.length === 3 || h.length === 4) {
      // `#abc` → `#aabbcc`（简写每位重复一次）
      const [r, g, b] = h.split('').map((c) => parseInt(c, 16) * 17)
      return { r, g, b }
    }
    if (h.length === 6 || h.length === 8) {
      return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) }
    }
    return null
  }
  const m = v.match(/^rgba?\(([^)]*)\)$/)
  if (!m) return null
  const parts = m[1].split(/[\s,/]+/).filter(Boolean)
  if (parts.length < 3) return null
  const nums = parts.slice(0, 3).map((p) => (p.endsWith('%') ? (parseFloat(p) / 100) * 255 : parseFloat(p)))
  if (nums.some((n) => !Number.isFinite(n))) return null
  const rawAlpha = parts.length > 3 ? Number(parts[3]) : 1
  const alpha = Number.isFinite(rawAlpha) ? Math.max(0, Math.min(1, rawAlpha)) : 1
  const mix = (c: number) => clampByte(c * alpha + 255 * (1 - alpha))
  return { r: mix(nums[0]), g: mix(nums[1]), b: mix(nums[2]) }
}

export function toHex({ r, g, b }: Rgb): string {
  return '#' + [r, g, b].map((c) => clampByte(c).toString(16).padStart(2, '0')).join('')
}

/** WCAG 相对亮度（0 = 黑，1 = 白） */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const f = (c: number) => {
    const s = clampByte(c) / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

/**
 * 保持色相把过亮的颜色压暗到白底可读。
 * 暗色主题的强调色常是荧光色（matrix `#00ff41`、cyberpunk `#d0d0e0`），
 * 等比缩放 RGB 只降亮度、不改色相；已经足够暗的颜色（浅色主题）原样返回。
 */
export function darkenForWhite(color: string, maxLuminance = MAX_ACCENT_LUMINANCE): string {
  const rgb = parseCssColor(color)
  if (!rgb) return DOCX_LIGHT_FALLBACK.accent
  let cur = rgb
  // 每轮 ×0.85，最多 32 轮 —— `#ffffff` 这种极端亮色也能收敛
  for (let i = 0; i < 32 && relativeLuminance(cur) > maxLuminance; i++) {
    cur = { r: cur.r * 0.85, g: cur.g * 0.85, b: cur.b * 0.85 }
  }
  return toHex(cur)
}

/** 生成 docx 用的配色（全部为 `#rrggbb`） */
export function buildDocxPalette(input: DocxPaletteInput): DocxPalette {
  const normalized = (v: string, fallback: string) => {
    const rgb = parseCssColor(v)
    return rgb ? toHex(rgb) : fallback
  }
  // 暗色主题的正文/底色/边框是给深色页面用的，白底文档必须换成白底等效色
  const text = input.isDark ? DOCX_LIGHT_FALLBACK.text : normalized(input.text, DOCX_LIGHT_FALLBACK.text)
  const surface = input.isDark ? DOCX_LIGHT_FALLBACK.surface : normalized(input.surface, DOCX_LIGHT_FALLBACK.surface)
  const border = input.isDark ? DOCX_LIGHT_FALLBACK.border : normalized(input.border, DOCX_LIGHT_FALLBACK.border)
  const accent = darkenForWhite(normalized(input.accent, DOCX_LIGHT_FALLBACK.accent))
  return { accent, text, surface, border }
}
