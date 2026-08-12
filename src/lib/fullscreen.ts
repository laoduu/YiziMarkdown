/**
 * fullscreen.ts — 跨平台全屏切换。
 *
 * 策略：优先使用 HTML5 Fullscreen API（从用户手势调用完全合法），
 * 降级到 Tauri window API。HTML5 fullscreen 在 WebView2（Edge 内核）上
 * 表现可靠，能覆盖整个屏幕（含任务栏），且 enter/exit 都能正常工作。
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

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

/** 切换全屏 */
export async function toggleFullscreen(): Promise<boolean> {
  // 方法一：HTML5 Fullscreen 切换
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
      await sleep(100)
      return true
    }
    await document.documentElement.requestFullscreen()
    await sleep(100)
    return !!document.fullscreenElement
  } catch {}

  // 方法二：Tauri 降级
  try {
    const internals = (window as any).__TAURI_INTERNALS__
    if (internals?.invoke) {
      const label = internals.metadata?.currentWindow?.label || 'main'
      const fs = await internals.invoke('plugin:window|is_fullscreen', { label }) as boolean
      if (fs) {
        await internals.invoke('plugin:window|set_fullscreen', { label, fullscreen: false })
      } else {
        const maximized = await internals.invoke('plugin:window|is_maximized', { label })
        if (maximized) {
          await internals.invoke('plugin:window|unmaximize', { label })
          await sleep(120)
        }
        await internals.invoke('plugin:window|set_fullscreen', { label, fullscreen: true })
      }
      await sleep(150)
      return await internals.invoke('plugin:window|is_fullscreen', { label }) as boolean
    }
  } catch {}
  return false
}
