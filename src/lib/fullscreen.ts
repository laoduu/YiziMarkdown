/**
 * fullscreen.ts — 跨平台全屏切换（Windows / macOS / Linux 体验一致）。
 *
 * 策略：Tauri window API 优先，等待后校验是否生效，未生效则降级到
 * HTML5 Fullscreen API。macOS 的 WKWebView 对 HTML5 Fullscreen API 支持
 * 不可靠，因此以 Tauri 原生全屏为准。
 */

type WinApi = {
  setFullscreen: (fullscreen: boolean) => Promise<unknown>
  isFullscreen: () => Promise<boolean>
} | null

function getWinApi(): WinApi {
  try {
    const internals = (window as any).__TAURI_INTERNALS__
    if (!internals || typeof internals.invoke !== 'function') return null
    const label = internals.metadata?.currentWindow?.label || 'main'
    const invoke = internals.invoke.bind(internals)
    return {
      setFullscreen: (fullscreen) => invoke('plugin:window|set_fullscreen', { label, fullscreen }),
      isFullscreen: () => invoke('plugin:window|is_fullscreen', { label }),
    }
  } catch {
    return null
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** 进入全屏。返回是否成功。 */
export async function enterFullscreen(): Promise<boolean> {
  const win = getWinApi()
  if (win) {
    try {
      await win.setFullscreen(true)
      await sleep(50)
      if (await win.isFullscreen()) return true
    } catch {}
  }
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen()
      return true
    }
  } catch {}
  return false
}

/** 退出全屏。返回是否成功。 */
export async function exitFullscreen(): Promise<boolean> {
  const win = getWinApi()
  if (win) {
    try {
      if (await win.isFullscreen()) {
        await win.setFullscreen(false)
        return true
      }
    } catch {}
  }
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
      return true
    }
  } catch {}
  return false
}

/** 切换全屏。返回操作是否成功。 */
export async function toggleFullscreen(): Promise<boolean> {
  const win = getWinApi()
  if (win) {
    try {
      if (await win.isFullscreen()) {
        await win.setFullscreen(false)
        return true
      }
      await win.setFullscreen(true)
      await sleep(50)
      if (await win.isFullscreen()) return true
    } catch {}
  }
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
    } else {
      await document.documentElement.requestFullscreen()
    }
    return true
  } catch {}
  return false
}
