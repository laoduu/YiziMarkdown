/**
 * fullscreen.ts — 跨平台全屏切换。
 *
 * 策略：优先使用 HTML5 Fullscreen API（从用户手势调用完全合法），
 * 降级到 Tauri window API。HTML5 fullscreen 在 WebView2（Edge 内核）上
 * 表现可靠，能覆盖整个屏幕（含任务栏），且 enter/exit 都能正常工作。
 */

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

async function isWindowMaximized(): Promise<boolean> {
  try {
    const internals = (window as any).__TAURI_INTERNALS__
    if (!internals?.invoke) return false
    const label = internals.metadata?.currentWindow?.label || 'main'
    return !!(await internals.invoke('plugin:window|is_maximized', { label }))
  } catch { return false }
}

// toggleFullscreen 专用的最大化记忆：进入前记录，退出后恢复（set 语义，幂等）。
// 直调 enter/exitFullscreen 的消费方（演示模式）自行管理窗口状态，不受此标记影响。
let toggleSavedMaximized = false

/** 进入全屏 */
export async function enterFullscreen(): Promise<boolean> {
  const internals = (window as any).__TAURI_INTERNALS__
  const label = internals?.metadata?.currentWindow?.label || 'main'

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
 *  从最大化窗口触发只能「小窗全屏」（表现为任务栏变黑但窗口底部不顶满，即实测的假全屏）；
 *  退出后恢复进入前的最大化状态（与演示模式的存/恢复范式一致）。 */
export async function toggleFullscreen(): Promise<boolean> {
  if (await isFullscreenActive()) {
    const ok = await exitFullscreen()
    if (toggleSavedMaximized) {
      toggleSavedMaximized = false
      try {
        const internals = (window as any).__TAURI_INTERNALS__
        if (internals?.invoke) {
          const label = internals.metadata?.currentWindow?.label || 'main'
          if (!(await internals.invoke('plugin:window|is_maximized', { label }))) {
            await internals.invoke('plugin:window|maximize', { label })
          }
        }
      } catch {}
    }
    return ok
  }
  // 记录进入前状态：必须在 enterFullscreen 取消最大化之前
  toggleSavedMaximized = await isWindowMaximized()
  return enterFullscreen()
}
