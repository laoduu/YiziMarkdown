/**
 * zenMode.ts — 禅模式的纯逻辑与常量（无 DOM 依赖，可单测）。
 *
 * 口径（见 README「禅模式」）：
 *   · 禅 = **消隐**，不是塌陷：所有界面构件原地淡出，不改变任何 width/height/grid/
 *     transform，正文列的矩形全程逐像素不变；退出后原样淡回。
 *   · 只适用于**源码 / 实时**编辑；预览、分栏、阅读、演示都不进禅境。
 *   · 边缘唤回：鼠标贴哪条边，哪个区域原地淡回；离开 1.2s 再淡出。
 *   · 错峰 + 淡辉光：面板 → 工具栏 → Tab 栏 → 状态栏（回归时反向），配合一层极淡光晕。
 *
 * 这里只放能被单测的判定：视图白名单、边缘命中、Esc 优先级、动画时序。
 * 真正的淡入淡出在 App.tsx 的状态机与 globals.css。
 */

/** 当前标签页的视图模式（与 stores/editorStore 的 ViewMode 同集合） */
export type ZenViewMode = 'edit' | 'split' | 'live' | 'preview'

/** 禅模式只服务编辑态：源码（edit）与实时（live） */
export function zenAllowedForViewMode(viewMode: string | null | undefined): boolean {
  return viewMode === 'edit' || viewMode === 'live'
}

/** 可被边缘唤回的四个区域 */
export type ZenRegion = 'top' | 'left' | 'right' | 'bottom'

/** 边缘命中：先判上下再判左右（角落按上下优先，避免贴着顶边时被判定成侧栏） */
export function zenEdgeRegionAt(
  x: number,
  y: number,
  width: number,
  height: number,
  edge = 8,
): ZenRegion | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  if (y <= edge) return 'top'
  if (y >= height - edge) return 'bottom'
  if (x <= edge) return 'left'
  if (x >= width - edge) return 'right'
  return null
}

export interface ZenRect {
  top: number
  left: number
  right: number
  bottom: number
}

/** 指针是否落在某区域矩形内（pad 用来容忍边缘出发后的 1~2px 抖动） */
export function pointInRect(x: number, y: number, rect: ZenRect, pad = 4): boolean {
  return (
    x >= rect.left - pad &&
    x <= rect.right + pad &&
    y >= rect.top - pad &&
    y <= rect.bottom + pad
  )
}

/** Esc 是否该退出禅模式：输入法组合、任何浮层打开时都让位 */
export interface ZenEscapeContext {
  imeComposing: boolean
  overlayOpen: boolean
}

export function shouldExitZenOnEscape(ctx: ZenEscapeContext): boolean {
  if (ctx.imeComposing) return false
  if (ctx.overlayOpen) return false
  return true
}

/**
 * 动画时序（毫秒）。
 *
 * 收折（消失）不是渐隐，而是每个布局块**朝最近的屏幕边收折**（clip-path + 轻微位移，
 * 纯视觉、不改布局），并按"一块一块"的节奏错开：
 *   面板 0 → 工具栏 260 → Tab 栏 520 → 状态栏 760（每块约 360~380ms）
 * 回归是严格的反向：状态栏 0 → Tab 栏 260 → 工具栏 520 → 面板 780。
 */
export const ZEN_TIMING = {
  /** 边缘判定宽度（px）：屏幕四边的热区 */
  edge: 8,
  /** 单个区块的收折 / 展开时长 */
  fold: 380,
  /** 收折（进入禅）的起始延迟 */
  enterPanelDelay: 0,
  enterToolbarDelay: 260,
  enterTabbarDelay: 520,
  enterStatusDelay: 760,
  /** 展开（退出禅）的反向延迟 */
  exitStatusDelay: 0,
  exitTabbarDelay: 260,
  exitToolbarDelay: 520,
  exitPanelDelay: 780,
  /** 面板朝屏幕外滑动的视觉位移（px，transform 不影响布局） */
  foldShift: 18,
  /** 边缘唤回的淡入 / 离开后的淡出 */
  awakeIn: 160,
  awakeOut: 240,
  /** 指针离开唤回区后多久收回 */
  awakeLinger: 1200,
  /** 指针静止多久隐藏 */
  idleCursor: 2000,
  /** 鼠标静止后滚动条重新隐藏 */
  scrollLinger: 1400,
  /** 暗角淡入淡出 */
  vignette: 700,
  /** 进出场的那一层淡光晕（比旧版更明显一档） */
  halo: 1100,
  /** 拖动阈值（与 Toolbar 一致：超过才真正 startDragging，保留双击最大化） */
  dragThreshold: 4,
} as const

/** 进入禅模式的整体时长（最后一块 = 状态栏收起） */
export const zenEnterTotalMs = ZEN_TIMING.enterStatusDelay + ZEN_TIMING.fold
/** 退出禅模式的整体时长（最后一块 = 面板展开） */
export const zenExitTotalMs = ZEN_TIMING.exitPanelDelay + ZEN_TIMING.fold

/** 缓动：easeInOutCubic（收折/展开都用它：起步柔和、中段利落、收尾缓缓落定） */
export function easeInOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return x < 0.5 ? 4 * x * x * x / 2 : 1 - Math.pow(-2 * x + 2, 3) / 2
}
