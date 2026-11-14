/**
 * pptxCompatibility.ts — PPTX 导出的兼容性边界。
 *
 * 演示端现在固定 1280×720 画布，正文设计字号为 23.04px（画布宽的 1.8%）。
 * 归一化到 13.333×7.5in 的幻灯片后，正文 = 23.04px * 72 / 96 = 17.28pt。
 *
 * 自动压缩允许把字号缩小，但不能低于 14pt 正文——再小就属于“影响观感”，
 * 此时页面应被标记为“超出兼容上限”，而不是继续无声压缩。
 */

export const PPTX_BODY_PX = 23.04
export const PX_PER_IN = 96
export const PPTX_BODY_PT = PPTX_BODY_PX * 72 / PX_PER_IN
/** 正文允许的最小字号（pt） */
export const PPTX_MIN_BODY_PT = 14
/** 压缩系数下限（防止极端设置导致无意义档位） */
export const PPTX_MIN_SCALE_FLOOR = 0.4

/** 基础字号系数（设置里的 slideFontScale）对应的最小压缩系数 */
export function pptxMinFontScale(baseFontScale = 1): number {
  if (!(baseFontScale > 0)) return 1
  const scale = PPTX_MIN_BODY_PT / (PPTX_BODY_PT * baseFontScale)
  return Math.min(1, Math.max(PPTX_MIN_SCALE_FLOOR, scale))
}

/**
 * 可用的压缩档位：从 0.94 逐级向下，过滤掉低于可读下限的档位。
 * 如果列表里没有恰好等于 minScale 的档位，会补上这一档，确保“尽力缩到下限”。
 */
export function pptxShrinkFactors(minScale: number): number[] {
  if (minScale >= 1 - 1e-9) return []
  const base = [0.94, 0.88, 0.82, 0.76, 0.70, 0.64, 0.60]
  const out = base.filter((f) => f >= minScale - 1e-9)
  const last = out[out.length - 1]
  if (last === undefined || last > minScale + 1e-9) out.push(Math.max(PPTX_MIN_SCALE_FLOOR, minScale))
  return out
}
