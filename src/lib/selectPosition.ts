/**
 * 下拉列表定位计算（零依赖，可被 Node 单测直接加载）。
 *
 * 设置页的自绘下拉把列表 portal 到 body 上，坐标全部来自触发按钮的
 * `getBoundingClientRect()`：这里只管纯几何 —— 夹到视口内、下方放不下就翻到上方。
 */

export interface AnchorRect {
  left: number
  top: number
  bottom: number
  width: number
}

export interface ViewportSize {
  width: number
  height: number
}

export interface SelectMenuPosition {
  left: number
  /** 最终位置；高度按实际内容与上限取小 */
  top: number
  width: number
  maxHeight: number
}

/** 列表最大高度（内容更多时自己滚） */
export const SELECT_MENU_MAX_HEIGHT = 280
/** 列表最小宽度：窄按钮（如只有「无」两个字）也能放下选项 */
export const SELECT_MENU_MIN_WIDTH = 160
/** 列表与视口边缘的最小留白 */
export const SELECT_MENU_EDGE = 8
/** 触发按钮与列表之间的缝 */
const GAP = 4
/** 视口极矮时的保底高度 */
const MIN_HEIGHT = 80

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max))

/**
 * @param anchor 触发按钮的视口矩形
 * @param contentHeight 列表内容自然高度（未限制前的 offsetHeight）
 * @param viewport 视口尺寸（取 window.innerWidth / innerHeight）
 */
export function computeSelectPosition(
  anchor: AnchorRect,
  contentHeight: number,
  viewport: ViewportSize,
): SelectMenuPosition {
  const available = Math.max(viewport.width - SELECT_MENU_EDGE * 2, 0)
  const width = Math.min(Math.max(anchor.width, Math.min(SELECT_MENU_MIN_WIDTH, available)), available)
  const left = clamp(anchor.left, SELECT_MENU_EDGE, viewport.width - width - SELECT_MENU_EDGE)

  const spaceBelow = viewport.height - anchor.bottom - GAP - SELECT_MENU_EDGE
  const spaceAbove = anchor.top - GAP - SELECT_MENU_EDGE
  const maxHeight = Math.max(
    Math.min(SELECT_MENU_MAX_HEIGHT, Math.max(spaceBelow, spaceAbove)),
    Math.min(MIN_HEIGHT, Math.max(viewport.height - SELECT_MENU_EDGE * 2, 0)),
  )
  const height = Math.min(contentHeight, maxHeight)

  // 下方放得下就用下方；下方不够且上方更宽敞时向上展开
  const openUp = height > spaceBelow && spaceAbove > spaceBelow
  const top = openUp ? anchor.top - GAP - height : anchor.bottom + GAP

  return {
    left,
    top: clamp(top, SELECT_MENU_EDGE, viewport.height - height - SELECT_MENU_EDGE),
    width,
    maxHeight,
  }
}
