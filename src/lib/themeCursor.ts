/**
 * themeCursor.ts — 生成主题色光标（标准/加粗 I-beam + 箭头），设置到 <html> 的 CSS 变量上。
 *
 * SVG data URI 无法引用 CSS 变量，因此由 JS 读取当前主题的 --editor-cursor 计算样式，
 * 动态生成双色调光标（主题色填充 + 明暗适配描边），供全站 cursor 规则使用。
 */

function makeUrl(
  w: number,
  h: number,
  geo: string,
  hotspotX: number,
  hotspotY: number,
  accent: string,
  outline: string,
  fallback: 'text' | 'default',
  viewBox = `0 0 ${w} ${h}`,
  strokeWidth = 1.5,
): string {
  // viewBox 与输出尺寸不一致时（如 1024 图标缩到 24px），描边宽度需按比例放大，否则会细到不可见
  const vbW = Number(viewBox.split(' ')[2])
  const sw = strokeWidth * (vbW / w)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${viewBox}"><path d="${geo}" fill="none" stroke="${outline}" stroke-width="${sw}" stroke-linejoin="round"/><path d="${geo}" fill="${accent}"/></svg>`
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") ${hotspotX} ${hotspotY}, ${fallback}`
}

/** 重新读取主题色并刷新 --cursor-standard / --cursor-bold / --cursor-arrow 三个变量 */
export function refreshThemeCursorVars() {
  const root = document.documentElement
  const cs = getComputedStyle(root)
  const isDark = root.classList.contains('dark')
  const accent = (cs.getPropertyValue('--editor-cursor') || '').trim() || (isDark ? '#8ab4f8' : '#2f6fed')
  const outline = isDark ? '#1e1e1e' : '#ffffff'
  const style = root.style
  // 标准档 I-beam（16×24，细）
  style.setProperty('--cursor-standard', makeUrl(16, 24, 'M7 6h2v12H7zM5 4h6v2H5zM5 18h6v2H5z', 8, 12, accent, outline, 'text'))
  // 加粗档 I-beam（16×30，加高）
  style.setProperty('--cursor-bold', makeUrl(16, 30, 'M7 7h2v18H7zM5 4.5h6v2.5H5zM5 23h6v2.5H5z', 8, 16, accent, outline, 'text'))
  // 常规箭头（24×24，viewBox 1024）：用户提供的 iconfont 光标路径，尖端 (227,95)→(5,2)
  style.setProperty('--cursor-arrow', makeUrl(24, 24, 'M603.136 509.44l120.832 208.896-182.784 111.104-125.952-218.112-148.48 143.872-39.424-660.48 551.936 364.544-176.128 50.176z', 5, 2, accent, outline, 'default', '0 0 1024 1024'))
}
