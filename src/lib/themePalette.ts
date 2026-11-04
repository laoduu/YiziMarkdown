/**
 * themePalette.ts — 从当前主题的 computed CSS 变量读出一份「可渲染」调色板。
 *
 * Mermaid / 未来插件需要具体的 RGB 色，而不是 CSS 变量名；主题变量又可能是
 * `rgba()` / `color-mix()` / `var()` 链，必须在真实 DOM 里解析。这里用 probe
 * 让浏览器完成归一化，再把半透明色合成到背景上，输出稳定 hex。
 *
 * 纯读取函数依赖 DOM；下方的颜色运算/映射是纯函数，可在 node 测试。
 */

export interface ThemePalette {
  bg: string
  text: string
  accent: string
  surface: string
  border: string
  secondaryText: string
  fontFamily: string
  fontMono: string
  isDark: boolean
}

interface Rgba { r: number; g: number; b: number; a: number }

const FALLBACK: ThemePalette = {
  bg: '#ffffff',
  text: '#333333',
  accent: '#0066cc',
  surface: '#f5f5f5',
  border: '#dddddd',
  secondaryText: '#666666',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif',
  fontMono: 'Consolas, monospace',
  isDark: false,
}

function parseRgba(input: string): Rgba | null {
  const v = (input || '').trim().toLowerCase()
  if (!v) return null
  if (v === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }
  if (v.startsWith('#')) {
    const h = v.slice(1)
    if (!/^[0-9a-f]+$/.test(h)) return null
    if (h.length === 3 || h.length === 4) {
      const [r, g, b] = h.slice(0, 3).split('').map((c) => parseInt(c, 16) * 17)
      return { r, g, b, a: h.length === 4 ? (parseInt(h[3], 16) * 17) / 255 : 1 }
    }
    if (h.length === 6 || h.length === 8) {
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
        a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
      }
    }
    return null
  }
  const m = v.match(/^rgba?\(([^)]+)\)$/)
  if (!m) return null
  const body = m[1]
  const parts = body.includes(',')
    ? body.split(',').map((s) => s.trim())
    : body.split('/').flatMap((part) => part.trim().split(/\s+/))
  if (parts.length < 3) return null
  const channel = (s: string) => s.endsWith('%') ? (parseFloat(s) / 100) * 255 : parseFloat(s)
  const nums = parts.slice(0, 3).map(channel)
  if (!nums.every(Number.isFinite)) return null
  const rawAlpha = parts.length > 3 ? parseFloat(parts[3]) / (parts[3].endsWith('%') ? 100 : 1) : 1
  return {
    r: Math.max(0, Math.min(255, Math.round(nums[0]))),
    g: Math.max(0, Math.min(255, Math.round(nums[1]))),
    b: Math.max(0, Math.min(255, Math.round(nums[2]))),
    a: Number.isFinite(rawAlpha) ? Math.max(0, Math.min(1, rawAlpha)) : 1,
  }
}

function toHex(c: Rgba): string {
  const b = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${b(c.r)}${b(c.g)}${b(c.b)}`
}

/** 把半透明颜色合成到不透明底色上；PPT/Mermaid 不需要 alpha。 */
export function flattenColor(color: string, backdrop: string): string {
  const fg = parseRgba(color)
  const bg = parseRgba(backdrop) || { ...FALLBACK, r: 255, g: 255, b: 255, a: 1 }
  if (!fg) return backdrop
  const a = fg.a
  return toHex({
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
    a: 1,
  })
}

/** 两色混合（t=0 取 a，t=1 取 b）；两者先按背景合成。 */
export function mixColor(a: string, b: string, t: number): string {
  const ca = parseRgba(a)
  const cb = parseRgba(b)
  if (!ca || !cb) return a
  const k = Math.max(0, Math.min(1, t))
  return toHex({
    r: ca.r * (1 - k) + cb.r * k,
    g: ca.g * (1 - k) + cb.g * k,
    b: ca.b * (1 - k) + cb.b * k,
    a: 1,
  })
}

function isTransparent(color: string): boolean {
  const c = parseRgba(color)
  return !c || c.a <= 0.01
}

function findDark(el: Element, boundary?: Element | null): boolean {
  let cur: Element | null = el
  while (cur) {
    if (cur.classList.contains('dark')) return true
    if (boundary && cur === boundary) return false
    cur = cur.parentElement
  }
  // 没有边界时回退到文档根（预览/演示使用 :root.theme-x.dark）。
  // 阅读模式传入 .yizi-reader 边界，避免把应用根 .dark 误当成阅读页暗色。
  return !!boundary ? false : el.ownerDocument.documentElement.classList.contains('dark')
}

/**
 * 读取当前元素继承到的主题。必须传入真正带主题 class 的容器：
 * 预览是 `.editor-content`、演示是 `.ys-slide`、阅读是 `.yizi-reader`。
 * `boundary` 可选：阅读模式传 `.yizi-reader`，暗色只认该根节点上的 `.dark`，
 * 不继承应用根主题的 `.dark`。
 */
export function readThemePalette(el: Element | null, boundary?: Element | null): ThemePalette {
  if (!el || typeof document === 'undefined') return FALLBACK
  const doc = el.ownerDocument
  const win = doc.defaultView
  if (!win) return FALLBACK

  const probe = doc.createElement('span')
  probe.style.display = 'none'
  doc.body.appendChild(probe)
  const color = (name: string, fallback: string): string => {
    const raw = win.getComputedStyle(el).getPropertyValue(name).trim()
    if (!raw) return fallback
    probe.style.color = ''
    probe.style.color = raw
    const computed = win.getComputedStyle(probe).color
    return computed && !isTransparent(computed) ? computed : fallback
  }
  const font = (name: string, fallback: string): string => {
    const raw = win.getComputedStyle(el).getPropertyValue(name).trim()
    if (!raw) return fallback
    probe.style.fontFamily = ''
    probe.style.fontFamily = raw
    return win.getComputedStyle(probe).fontFamily || fallback
  }
  try {
    const dark = findDark(el, boundary)
    const bgFallback = dark ? '#0a0f1e' : '#ffffff'
    const bg = color('--editor-bg', bgFallback)
    const text = color('--editor-text', dark ? '#e5e7eb' : FALLBACK.text)
    const accent = color('--editor-accent', color('--editor-cursor', FALLBACK.accent))
    const surfaceRaw = color('--editor-surface', '')
    const borderRaw = color('--editor-border', '')
    const secondaryText = color('--sidebar-text', FALLBACK.secondaryText)
    const cs = win.getComputedStyle(el)
    return {
      bg: flattenColor(bg, bgFallback),
      text: flattenColor(text, bg),
      accent: flattenColor(accent, bg),
      surface: surfaceRaw ? flattenColor(surfaceRaw, bg) : mixColor(bg, text, 0.06),
      border: borderRaw ? flattenColor(borderRaw, bg) : mixColor(bg, text, 0.18),
      secondaryText: flattenColor(secondaryText, bg),
      fontFamily: cs.fontFamily || FALLBACK.fontFamily,
      fontMono: font('--font-mono', FALLBACK.fontMono),
      isDark: dark,
    }
  } finally {
    probe.remove()
  }
}
