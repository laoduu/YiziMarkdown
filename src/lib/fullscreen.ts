/**
 * fullscreen.ts — 跨平台全屏切换。
 *
 * 策略：优先使用 HTML5 Fullscreen API（从用户手势调用完全合法），
 * 降级到 Tauri window API。HTML5 fullscreen 在 WebView2（Edge 内核）上
 * 表现可靠，能覆盖整个屏幕（含任务栏），且 enter/exit 都能正常工作。
 *
 * 窗口状态（fullscreen/maximized/进入前快照）由 windowStateStore 统一持有：
 * 这里只负责「怎么进/怎么出」，退出后「还原成什么」由 store 的
 * 「全屏 → 非全屏」转移钩子消费快照完成（按钮 / Esc / 演示卸载等所有
 * 退出路径都会经过该钩子）。
 */
import { useWindowStateStore } from '../stores/windowStateStore'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** 当前是否处于全屏（HTML5 或原生）。
 *  HTML5 全屏时原生 is_fullscreen 不置位，必须先查 DOM 再查原生。 */
export async function isFullscreenActive(): Promise<boolean> {
  if (document.fullscreenElement) return true
  try {
    const internals = (window as any).__TAURI_INTERNALS__
    if (internals?.invoke) {
      const label = internals.metadata?.currentWindow?.label || 'main'
      return !!(await internals.invoke('plugin:window|is_fullscreen', { label }))
    }
  } catch {}
  return false
}

/** 进入全屏。
 *  进入前把当前窗口状态（最大化/全屏）拍进 windowStateStore 的快照，
 *  退出后由 store 统一还原——所有退出路径（按钮 / Esc / 卸载）共享同一份快照。 */
export async function enterFullscreen(): Promise<boolean> {
  const internals = (window as any).__TAURI_INTERNALS__
  const label = internals?.metadata?.currentWindow?.label || 'main'

  // 必须在取消最大化之前拍快照（store 内部幂等，叠加进入时保留最早的快照）
  await useWindowStateStore.getState().snapshotForFullscreen()

  // 关键：如果窗口已最大化，必须先取消最大化。
  // HTML5 fullscreen 从最大化窗口触发时，只能覆盖 WebView 区域（小窗全屏），
  // 而非整个屏幕。取消最大化后 HTML5 fullscreen 才能正确覆盖全屏。
  if (internals?.invoke) {
    try {
      const maximized = await internals.invoke('plugin:window|is_maximized', { label })
      if (maximized) {
        await internals.invoke('plugin:window|unmaximize', { label })
        await sleep(150)
      }
    } catch {}
  }

  // HTML5 Fullscreen（从用户手势触发，WebView2 支持）
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen()
      await sleep(100)
      return !!document.fullscreenElement
    }
    return true
  } catch {}

  // Tauri window API 降级
  if (internals?.invoke) {
    try {
      await internals.invoke('plugin:window|set_fullscreen', { label, fullscreen: true })
      await sleep(150)
      return await internals.invoke('plugin:window|is_fullscreen', { label }) as boolean
    } catch {}
  }
  return false
}

/** 退出全屏 */
export async function exitFullscreen(): Promise<boolean> {
  // 方法一：HTML5 Fullscreen
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
      await sleep(100)
      return !document.fullscreenElement
    }
  } catch {}

  // 方法二：Tauri window API 降级
  try {
    const internals = (window as any).__TAURI_INTERNALS__
    if (internals?.invoke) {
      const label = internals.metadata?.currentWindow?.label || 'main'
      await internals.invoke('plugin:window|set_fullscreen', { label, fullscreen: false })
      await sleep(150)
      return !(await internals.invoke('plugin:window|is_fullscreen', { label }))
    }
  } catch {}
  return false
}

/** 切换全屏。
 *  修复（v0.3.4）：从最大化进入时必须先取消最大化——WebView2 的 HTML5 fullscreen
 *  从最大化窗口触发只能「小窗全屏」（表现为任务栏变黑但窗口底部不顶满，即实测的假全屏）。
 *  进入前快照与退出后还原都走 windowStateStore（enterFullscreen 内部拍快照，
 *  store 的「全屏 → 非全屏」转移钩子消费快照还原最大化）。 */
export async function toggleFullscreen(): Promise<boolean> {
  if (await isFullscreenActive()) return exitFullscreen()
  return enterFullscreen()
}
