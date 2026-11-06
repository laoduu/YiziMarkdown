/**
 * themeCursor.ts — 生成主题色光标（加粗 I-beam + 箭头），设置到 <html> 的 CSS 变量上。
 *
 * 原生档：基础光标走系统 default，文本 I-beam 用自绘细光标（--cursor-text，
 * 仅锁死明暗两色，形状与原生一致），避免系统指针位图在 Windows 11 上偶发变白；
 * 「加粗（高可见度）」档才是主题色自绘箭头/I-beam。
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

/** 重新读取主题色并刷新 --cursor-text / --cursor-bold / --cursor-arrow 三个变量 */
export function refreshThemeCursorVars() {
  const root = document.documentElement
  const cs = getComputedStyle(root)
  const isDark = root.classList.contains('dark')
  const accent = (cs.getPropertyValue('--editor-cursor') || '').trim() || (isDark ? '#8ab4f8' : '#2f6fed')
  const outline = isDark ? '#1e1e1e' : '#ffffff'
  const style = root.style
  // 原生档的文本 I-beam：固定明暗两色，不依赖系统的指针位图。
  // 背景：Windows 11 + WebView2 下系统 I-beam 会偶发被合成成一整块白色
  // （硬件光标/指针位图 alpha 丢失，偶发于 AMD/Intel 核显 + MPO），
  // 白底上几乎不可见。自绘同形状的细 I-beam 后颜色由我们锁死，
  // 不受系统深浅色、Edge 主题与 GPU 合成影响。
  style.setProperty('--cursor-text', makeUrl(
    12, 26,
    'M5.25 3h1.5v20h-1.5zM1 2h10v1.5H1zM1 22.5h10v1.5H1z',
    6, 13,
    isDark ? '#f5f5f5' : '#111111',
    isDark ? '#1e1e1e' : '#ffffff',
    'text', '0 0 12 26', 0.5,
  ))
  // 加粗档 I-beam（16×30，加高）
  style.setProperty('--cursor-bold', makeUrl(16, 30, 'M7 7h2v18H7zM5 4.5h6v2.5H5zM5 23h6v2.5H5z', 8, 16, accent, outline, 'text'))
  // 常规箭头（24×24，viewBox 1024）：用户提供的 iconfont 光标路径，尖端 (227,95)→(5,2)
  style.setProperty('--cursor-arrow', makeUrl(24, 24, 'M603.136 509.44l120.832 208.896-182.784 111.104-125.952-218.112-148.48 143.872-39.424-660.48 551.936 364.544-176.128 50.176z', 5, 2, accent, outline, 'default', '0 0 1024 1024'))
}
