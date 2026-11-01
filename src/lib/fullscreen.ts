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

  // 最大化窗口优先走原生全屏：直接从最大化进入，不会先缩回普通窗口。
  // HTML5 fullscreen 从最大化触发只能覆盖 WebView 区域（假全屏），所以只有
  // 原生全屏失败时才取消最大化再走 HTML5。
  let maximized = false
  if (internals?.invoke) {
    try {
      maximized = !!(await internals.invoke('plugin:window|is_maximized', { label }))
    } catch {}
  }
  if (maximized && internals?.invoke) {
    try {
      await internals.invoke('plugin:window|set_fullscreen', { label, fullscreen: true })
      await sleep(180)
      if (await internals.invoke('plugin:window|is_fullscreen', { label })) {
        await useWindowStateStore.getState().refresh()
        return true
      }
    } catch {}
    // 原生全屏没成功：再按旧方案取消最大化，给 HTML5 全屏让路。
    try {
      await internals.invoke('plugin:window|unmaximize', { label })
      await sleep(150)
    } catch {}
  }

  // HTML5 Fullscreen（从用户手势触发，WebView2 支持）
  let domFullscreen = false
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen()
      await sleep(100)
      domFullscreen = !!document.fullscreenElement
    } else {
      domFullscreen = true
    }
  } catch {
    domFullscreen = false
  }
  if (domFullscreen) {
    await useWindowStateStore.getState().refresh()
    return true
  }

  // Tauri window API 降级。注意：HTML5 fullscreen 可能“成功返回但没有真正进入全屏”
  // （例如打开 EPUB 这种经过原生文件对话框/异步解析、已丢失手势上下文的路径），
  // 不能直接 return false，否则会留下一个“已取消最大化、但没全屏”的普通窗口。
  if (internals?.invoke) {
    try {
      await internals.invoke('plugin:window|set_fullscreen', { label, fullscreen: true })
      await sleep(150)
      if (await internals.invoke('plugin:window|is_fullscreen', { label })) {
        await useWindowStateStore.getState().refresh()
        return true
      }
    } catch {}
  }

  // 两种全屏都没成功：把进入前取消掉的最大化还原，别让窗口卡在普通尺寸。
  const snap = useWindowStateStore.getState().preFullscreen
  if (snap) {
    useWindowStateStore.setState({ preFullscreen: null })
    if (internals?.invoke) {
      try {
        if (snap.fullscreen) {
          await internals.invoke('plugin:window|set_fullscreen', { label, fullscreen: true })
        } else if (snap.maximized) {
          await internals.invoke('plugin:window|maximize', { label })
        }
      } catch {}
    }
    await useWindowStateStore.getState().refresh()
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
      if (!document.fullscreenElement) {
        await useWindowStateStore.getState().refresh()
        return true
      }
    }
  } catch {}

  // 方法二：Tauri window API 降级
  try {
    const internals = (window as any).__TAURI_INTERNALS__
    if (internals?.invoke) {
      const label = internals.metadata?.currentWindow?.label || 'main'
      await internals.invoke('plugin:window|set_fullscreen', { label, fullscreen: false })
      await sleep(150)
      if (!(await internals.invoke('plugin:window|is_fullscreen', { label }))) {
        await useWindowStateStore.getState().refresh()
        return true
      }
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
