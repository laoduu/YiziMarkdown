/**
 * 把屏幕尺寸收敛成演示模式的 16:9 测量视口。
 *
 * 不能固定用 1280×720 测量：CSS 的 clamp() 有 px 上下限，1080p 全屏下
 * 正文最多仍是 30px，而页面容器更大；固定 1280×720 会让内容相对变大，
 * 原本演示里放得下的页面在 PPTX 中溢出。
 */
export function presentationViewport(width: number, height: number): { width: number; height: number } {
  const sw = Number.isFinite(width) && width > 0 ? width : 1280
  const sh = Number.isFinite(height) && height > 0 ? height : 720
  const w = Math.min(sw, sh * 16 / 9)
  return { width: Math.round(w), height: Math.round(w * 9 / 16) }
}
