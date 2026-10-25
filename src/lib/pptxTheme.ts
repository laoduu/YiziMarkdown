/**
 * pptxTheme.ts — PPTX 导出的「单位 / 颜色 / 字体 / 计算样式」工具层。
 *
 * 为什么单独一层：导出链路里所有坐标必须统一成 inch、字号统一成 pt，
 * 而 DOM 给的是 CSS px；颜色又常常是 `rgba()` / `color-mix()`（带透明度），
 * 而 PowerPoint 的显式 RGB 不接受这些形式。把换算与 flatten 收敛到一处，
 * 场景图与生成层就不必各自重复实现（也就不会出现两套换算口径）。
 *
 * 约定（方案 §4）：1px = 1/96in = 0.75pt；幻灯片基准 1280×720 CSS px。
 */

export const PX_PER_IN = 96
export const PX_TO_PT = 0.75
export const SLIDE_W_IN = 13.333
export const SLIDE_H_IN = 7.5
export const SLIDE_W_PX = 1280
export const SLIDE_H_PX = 720

export function pxToIn(px: number): number {
  return round3(px / PX_PER_IN)
}

export function pxToPt(px: number): number {
  return round2(px * PX_TO_PT)
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

export function num(value: string | null | undefined, fallback = 0): number {
  if (!value) return fallback
  const n = parseFloat(value)
  return Number.isFinite(n) ? n : fallback
}

export interface Rgba {
  r: number
  g: number
  b: number
  /** 0..1 */
  a: number
}

const COLOR_CACHE = new Map<string, Rgba | null>()

/** canvas 归一化上下文（仅浏览器；把 oklch/lab 等现代语法转成 rgb 再解析） */
let normCtx: CanvasRenderingContext2D | null | undefined

function normalizeWithCanvas(raw: string): string | null {
  if (typeof document === 'undefined') return null
  if (normCtx === undefined) {
    try {
      normCtx = document.createElement('canvas').getContext('2d')
    } catch {
      normCtx = null
    }
  }
  if (!normCtx) return null
  // fillStyle 对非法值会**保持原值**：先写一个哨兵色，再看是否被改掉
  normCtx.fillStyle = '#010203'
  try {
    normCtx.fillStyle = raw
  } catch {
    return null
  }
  const out = String(normCtx.fillStyle)
  if (out === '#010203') return null
  return out
}

/** 解析浏览器 computed color（rgb/rgba/hex/`color(srgb …)`/transparent）。 */
export function parseColor(input: string): Rgba | null {
  const raw = (input || '').trim().toLowerCase()
  if (!raw) return null
  const cached = COLOR_CACHE.get(raw)
  if (cached !== undefined) return cached
  let out = parseColorUncached(raw)
  if (!out) {
    // 兜底：Chromium 对 `oklch()` / `lab()` / `hwb()` 等会原样返回，canvas 能归一成 rgb
    const normalized = normalizeWithCanvas(raw)
    if (normalized) out = parseColorUncached(normalized.trim().toLowerCase())
  }
  COLOR_CACHE.set(raw, out)
  return out
}

function parseColorUncached(raw: string): Rgba | null {
  if (raw === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }
  // PPTX 侧的颜色是**不带 # 的** 6/8 位十六进制（flattenColor 的产物）。
  // flattenColor(color, bg) 的 bg 经常就是这种形态：不认它就会退回白底，
  // 把暗色主题里半透明的行条纹 / 淡色描边错误地合成到白色上。
  if (/^[0-9a-f]{6}([0-9a-f]{2})?$/.test(raw)) {
    return {
      r: parseInt(raw.slice(0, 2), 16),
      g: parseInt(raw.slice(2, 4), 16),
      b: parseInt(raw.slice(4, 6), 16),
      a: raw.length === 8 ? parseInt(raw.slice(6, 8), 16) / 255 : 1,
    }
  }
  if (raw.startsWith('#')) {
    const h = raw.slice(1)
    if (h.length === 3) {
      return {
        r: parseInt(h[0] + h[0], 16),
        g: parseInt(h[1] + h[1], 16),
        b: parseInt(h[2] + h[2], 16),
        a: 1,
      }
    }
    if (h.length === 6) {
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
        a: 1,
      }
    }
    if (h.length === 8) {
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
        a: parseInt(h.slice(6, 8), 16) / 255,
      }
    }
    return null
  }
  // rgb(1 2 3) / rgb(1, 2, 3) / rgba(1, 2, 3, 0.5) / rgb(1 2 3 / 50%)
  // ⚠️ Chrome 对普通颜色（hex / hsl / 命名色）的 computed value 一律是**逗号分隔**的
  //    `rgb(r, g, b)`，所以这条分支是最常走的那条：逗号分隔时通道必须按 `,` 切，
  //    不能再按空白切（否则只拿到第一个通道 → 解析失败 → flatten 退化成黑色）。
  const m = /^rgba?\(([^)]+)\)$/.exec(raw)
  if (m) {
    const body = m[1]
    let channels: string[]
    let alphaStr: string | undefined
    if (body.includes(',')) {
      const parts = body.split(',').map((s) => s.trim())
      channels = parts.slice(0, 3)
      if (parts.length > 3) alphaStr = parts[3]
    } else {
      const parts = body.split('/')
      channels = parts[0].trim().split(/\s+/)
      if (parts.length > 1) alphaStr = parts[1]
    }
    if (channels.length < 3) return null
    const channel = (s: string) => {
      const v = s.trim()
      if (v.endsWith('%')) return Math.round((parseFloat(v) / 100) * 255)
      return Math.round(parseFloat(v))
    }
    const alpha = alphaStr !== undefined ? parseAlpha(alphaStr) : 1
    const r = channel(channels[0])
    const g = channel(channels[1])
    const b = channel(channels[2])
    if (![r, g, b].every(Number.isFinite)) return null
    return { r: clamp255(r), g: clamp255(g), b: clamp255(b), a: clamp01(alpha) }
  }
  // 广色域：color(srgb 0.1 0.2 0.3 / 0.5)
  const m2 = /^color\(srgb\s+([^)]+)\)$/.exec(raw)
  if (m2) {
    const parts = m2[1].split('/')
    const ch = parts[0].trim().split(/\s+/)
    if (ch.length < 3) return null
    return {
      r: clamp255(Math.round(parseFloat(ch[0]) * 255)),
      g: clamp255(Math.round(parseFloat(ch[1]) * 255)),
      b: clamp255(Math.round(parseFloat(ch[2]) * 255)),
      a: parts[1] ? clamp01(parseAlpha(parts[1])) : 1,
    }
  }
  return null
}

function parseAlpha(v: string): number {
  const s = v.trim()
  if (s.endsWith('%')) return parseFloat(s) / 100
  return parseFloat(s)
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 1
  return Math.min(1, Math.max(0, n))
}

function clamp255(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(255, Math.max(0, n))
}

export function hexOf(c: Rgba): string {
  const h = (n: number) => clamp255(Math.round(n)).toString(16).padStart(2, '0')
  return (h(c.r) + h(c.g) + h(c.b)).toUpperCase()
}

/** 把任意 CSS 颜色合成到不透明背景上，返回 `RRGGBB`（PPTX 用的 6 位十六进制，无 `#`）。 */
export function flattenColor(color: string, bg: string | Rgba, extraAlpha = 1): string {
  const fg = parseColor(color)
  if (!fg) return '000000'
  const back = typeof bg === 'string' ? parseColor(bg) : bg
  const b = back && back.a > 0 ? compositeOverWhite(back) : { r: 255, g: 255, b: 255, a: 1 }
  const a = clamp01(fg.a * extraAlpha)
  return hexOf({
    r: fg.r * a + b.r * (1 - a),
    g: fg.g * a + b.g * (1 - a),
    b: fg.b * a + b.b * (1 - a),
    a: 1,
  })
}

/** 计算颜色的不透明度（用于 `opacity:0.35` 的装饰） */
export function colorAlpha(color: string): number {
  return parseColor(color)?.a ?? 0
}

/** 背景若本身半透明，先叠到白底上（PPTX 没有「半透明背景」的显式路径）。 */
function compositeOverWhite(c: Rgba): Rgba {
  return {
    r: c.r * c.a + 255 * (1 - c.a),
    g: c.g * c.a + 255 * (1 - c.a),
    b: c.b * c.a + 255 * (1 - c.a),
    a: 1,
  }
}

/** `rgb(...)` → Rgba（给需要 alpha 判定的地方用） */
export function colorWithAlpha(color: string, alpha: number): string {
  const c = parseColor(color)
  if (!c) return color
  return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${clamp01(alpha)})`
}

/** 把 `#rrggbb` 与 `rgb()` 互转后叠加额外透明度（用于 PPTX 里没有对应语义的近似） */
export function mixHex(hex: string, other: string, amount: number): string {
  const a = parseColor(hex)
  const b = parseColor(other)
  if (!a || !b) return hex.replace('#', '').toUpperCase()
  const t = clamp01(amount)
  return hexOf({
    r: a.r * (1 - t) + b.r * t,
    g: a.g * (1 - t) + b.g * t,
    b: a.b * (1 - t) + b.b * t,
    a: 1,
  })
}

// ---- 字体 ----

/** 字体名映射：把主题/设计字体栈落到「查看端基本必有」的字体上。
 *  PowerPoint 不会回退到 CSS 字体栈，只会按单个 typeface 找字体；
 *  直接把 `MiSans` 写进去，在没装该字体的机器上会变成 Calibri（宽度变化→换行漂移）。 */
const FONT_ALIASES: Record<string, { latin: string; ea: string }> = {
  misans: { latin: 'Segoe UI', ea: 'Microsoft YaHei' },
  'mi sans': { latin: 'Segoe UI', ea: 'Microsoft YaHei' },
  'pingfang sc': { latin: 'Segoe UI', ea: 'Microsoft YaHei' },
  'noto sans sc': { latin: 'Segoe UI', ea: 'Microsoft YaHei' },
  'noto serif sc': { latin: 'Georgia', ea: 'SimSun' },
  'songti sc': { latin: 'Georgia', ea: 'SimSun' },
  simsun: { latin: 'Georgia', ea: 'SimSun' },
  'jetbrains mono': { latin: 'Consolas', ea: 'SimSun' },
  'fira code': { latin: 'Consolas', ea: 'SimSun' },
  'sf mono': { latin: 'Consolas', ea: 'SimSun' },
  'cascadia code': { latin: 'Consolas', ea: 'SimSun' },
  menlo: { latin: 'Consolas', ea: 'SimSun' },
  monaco: { latin: 'Consolas', ea: 'SimSun' },
}

const GENERIC_FONTS: Record<string, { latin: string; ea: string }> = {
  'sans-serif': { latin: 'Segoe UI', ea: 'Microsoft YaHei' },
  'system-ui': { latin: 'Segoe UI', ea: 'Microsoft YaHei' },
  '-apple-system': { latin: 'Segoe UI', ea: 'Microsoft YaHei' },
  blinkmacsystemfont: { latin: 'Segoe UI', ea: 'Microsoft YaHei' },
  serif: { latin: 'Georgia', ea: 'SimSun' },
  monospace: { latin: 'Consolas', ea: 'SimSun' },
  cursive: { latin: 'Segoe UI', ea: 'Microsoft YaHei' },
  fantasy: { latin: 'Segoe UI', ea: 'Microsoft YaHei' },
}

function isCjkFont(name: string): boolean {
  return /pingfang|yahei|simsun|songti|noto (sans|serif) (sc|tc|jp|kr)|source han|hei|kai|ming|jhenghei|meiryo|malgun|hiragino/i.test(name)
}

/** 拆 CSS 字体栈（引号内的逗号不算分隔符） */
export function splitFontStack(stack: string): string[] {
  const out: string[] = []
  let buf = ''
  let quote = ''
  for (const ch of stack || '') {
    if (quote) {
      if (ch === quote) quote = ''
      else buf += ch
      continue
    }
    if (ch === '"' || ch === "'") { quote = ch; continue }
    if (ch === ',') { out.push(buf.trim()); buf = ''; continue }
    buf += ch
  }
  if (buf.trim()) out.push(buf.trim())
  return out.filter(Boolean)
}

/**
 * 解析字体栈 → `{ latin, ea }`。
 * 规则：latin 取栈里第一个「非 CJK、非通用族」的字体；通用族按映射表换成安全字体。
 *       ea 取栈里第一个 CJK 字体；没有则用 latin 对应的东亚字体。
 * 找不到时回落到 Segoe UI / Microsoft YaHei。
 */
export function resolveFontStack(stack: string): { latin: string; ea: string } {
  const names = splitFontStack(stack)
  let latin = ''
  let ea = ''
  for (const raw of names) {
    const key = raw.toLowerCase()
    const alias = FONT_ALIASES[key]
    const generic = GENERIC_FONTS[key]
    if (alias) {
      if (!latin) latin = alias.latin
      if (!ea) ea = alias.ea
      continue
    }
    if (generic) {
      if (!latin) latin = generic.latin
      if (!ea) ea = generic.ea
      continue
    }
    if (isCjkFont(raw)) {
      if (!ea) ea = raw
      continue
    }
    if (!latin) latin = raw
  }
  return {
    latin: latin || 'Segoe UI',
    ea: ea || 'Microsoft YaHei',
  }
}

// ---- 计算样式辅助 ----

export type CssStyle = CSSStyleDeclaration

export function styleOf(el: Element, win: Window, pseudo?: string | null): CssStyle {
  return win.getComputedStyle(el, pseudo ?? undefined)
}

export function fontSizePx(cs: CssStyle): number {
  return num(cs.fontSize, 16)
}

/** computed line-height（可能为 `normal`）→ px */
export function lineHeightPx(cs: CssStyle): number {
  const raw = (cs.lineHeight || '').trim()
  if (!raw || raw === 'normal') return fontSizePx(cs) * 1.2
  const n = parseFloat(raw)
  return Number.isFinite(n) ? n : fontSizePx(cs) * 1.2
}

export function isBold(cs: CssStyle): boolean {
  const w = parseInt(cs.fontWeight, 10)
  if (Number.isFinite(w)) return w >= 600
  return cs.fontWeight === 'bold' || cs.fontWeight === 'bolder'
}

export function textAlignOf(cs: CssStyle): 'left' | 'center' | 'right' {
  const a = (cs.textAlign || '').toLowerCase()
  if (a === 'center') return 'center'
  if (a === 'right' || a === 'end') return 'right'
  return 'left'
}

export function hasUnderline(cs: CssStyle): boolean {
  return /underline/i.test(cs.textDecorationLine || cs.textDecoration || '')
}

export function hasStrike(cs: CssStyle): boolean {
  return /line-through/i.test(cs.textDecorationLine || cs.textDecoration || '')
}

export function letterSpacingPt(cs: CssStyle): number | undefined {
  const raw = (cs.letterSpacing || '').trim()
  if (!raw || raw === 'normal') return undefined
  const px = parseFloat(raw)
  if (!Number.isFinite(px)) return undefined
  return round2(px * PX_TO_PT)
}

export interface SimpleShadow {
  color: string
  /** 0..1 */
  opacity: number
  blurPt: number
  offsetPt: number
  angle: number
}

/** 解析 computed box-shadow（只取第一层；PPTX 也只支持单层阴影）。 */
export function parseBoxShadow(cs: CssStyle): SimpleShadow | undefined {
  const raw = (cs.boxShadow || '').trim()
  if (!raw || raw === 'none') return undefined
  const first = splitShadowLayers(raw)[0]
  if (!first) return undefined
  const colorMatch = /(rgba?\([^)]+\)|color\([^)]+\)|#[0-9a-f]{3,8}|transparent)/i.exec(first)
  const color = colorMatch ? colorMatch[1] : 'rgba(0,0,0,0.25)'
  const rest = first.replace(color, ' ')
  const lengths = (rest.match(/-?\d*\.?\d+px/g) || []).map((s) => parseFloat(s))
  // box-shadow: offsetX offsetY blur spread
  const ox = lengths[0] ?? 0
  const oy = lengths[1] ?? 0
  const blur = lengths[2] ?? 0
  const c = parseColor(color) || { r: 0, g: 0, b: 0, a: 0.25 }
  return {
    color: hexOf(c),
    opacity: c.a,
    blurPt: round2((blur * PX_TO_PT) / 2),
    offsetPt: round2(Math.hypot(ox, oy) * PX_TO_PT),
    angle: round2((Math.atan2(ox, oy) * 180) / Math.PI),
  }
}

function splitShadowLayers(raw: string): string[] {
  const out: string[] = []
  let depth = 0
  let buf = ''
  for (const ch of raw) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) { out.push(buf.trim()); buf = ''; continue }
    buf += ch
  }
  if (buf.trim()) out.push(buf.trim())
  return out
}

/** `border-radius` 的像素值（矩形取第一个角；胶囊形按较小边封顶） */
export function borderRadiusPx(cs: CssStyle): number {
  const raw = (cs.borderRadius || cs.borderTopLeftRadius || '').trim()
  if (!raw) return 0
  const first = raw.split(/[\s/]+/)[0]
  const n = parseFloat(first)
  return Number.isFinite(n) ? n : 0
}

/** 元素的内容盒（去掉 padding / border），返回相对幻灯片的 px 坐标。 */
export function contentBoxPx(el: Element, win: Window): { x: number; y: number; w: number; h: number } {
  const r = el.getBoundingClientRect()
  const cs = win.getComputedStyle(el)
  const pl = num(cs.paddingLeft) + num(cs.borderLeftWidth)
  const pr = num(cs.paddingRight) + num(cs.borderRightWidth)
  const pt = num(cs.paddingTop) + num(cs.borderTopWidth)
  const pb = num(cs.paddingBottom) + num(cs.borderBottomWidth)
  return {
    x: r.left + pl,
    y: r.top + pt,
    w: Math.max(0, r.width - pl - pr),
    h: Math.max(0, r.height - pt - pb),
  }
}

export function rectOf(el: Element): { x: number; y: number; w: number; h: number } {
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, w: r.width, h: r.height }
}

/** 首尾空白清理（PPT 文本框不需要 DOM 里的软换行空白） */
export function cleanText(s: string): string {
  return s.replace(/\u00a0/g, ' ').replace(/[ \t\r\n\f]+/g, ' ')
}

/** 取伪元素的 content 文本（判断 `content:none` 用） */
export function pseudoContent(el: Element, win: Window, which: '::before' | '::after'): string {
  const cs = win.getComputedStyle(el, which)
  const c = cs.content
  if (!c || c === 'none' || c === 'normal') return ''
  return c
}
