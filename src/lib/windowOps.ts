/**
 * windowOps.ts — 窗口控制的 invoke 封装（原 WindowControls 内联实现抽出）。
 *
 * 供 WindowControls 按钮与顶栏右键菜单共用；全部走 plugin:window 命令，
 * 权限已在 capabilities/default.json 授予（minimize/maximize/close 等）。
 */

const getInternals = (): { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>; label: string } | null => {
  const internals = (window as any).__TAURI_INTERNALS__
  if (!internals?.invoke) return null
  const label = internals.metadata?.currentWindow?.label || 'main'
  return { invoke: internals.invoke.bind(internals), label }
}

/** 平台标识（只查一次，窗口运行期不变） */
let platformCache: string | null = null
async function getPlatformCached(): Promise<string> {
  if (platformCache === null) {
    const t = getInternals()
    if (!t) platformCache = 'unknown'
    else {
      try { platformCache = (await t.invoke('get_platform')) as string }
      catch { platformCache = 'unknown' }
    }
  }
  return platformCache
}

async function plugin(cmd: string, args?: Record<string, unknown>): Promise<void> {
  const t = getInternals()
  if (!t) return
  try { await t.invoke(cmd, { label: t.label, ...args }) } catch {}
}

export const windowOps = {
  /** 切换最大化 / 还原（toggle_window_size 返回切换后的最大化状态；
   *  ⚠️ macOS 分支 = 原生全屏切换，见 toggleFullscreen） */
  toggleMaximize: async (): Promise<boolean> => {
    const t = getInternals()
    if (!t) return false
    try { return (await t.invoke('toggle_window_size')) as boolean } catch { return false }
  },
  minimize: () => plugin('plugin:window|minimize'),
  maximize: () => plugin('plugin:window|maximize'),
  unmaximize: () => plugin('plugin:window|unmaximize'),
  close: () => plugin('plugin:window|close'),
  startDragging: () => plugin('plugin:window|start_dragging'),
  isMaximized: async (): Promise<boolean> => {
    const t = getInternals()
    if (!t) return false
    try { return (await t.invoke('plugin:window|is_maximized', { label: t.label })) as boolean } catch { return false }
  },
  /** 当前是否全屏（HTML5 感知：HTML5 全屏时原生 is_fullscreen 不置位） */
  isFullscreen: async (): Promise<boolean> => {
    const { isFullscreenActive } = await import('./fullscreen')
    return isFullscreenActive()
  },
  getPlatform: async (): Promise<string> => getPlatformCached(),
  /** 全屏切换（按平台分流）：
   *  - macOS：toggle_window_size = 原生 set_fullscreen 切换（产生原生 Space，符合 mac 惯性；
   *    HTML5 fullscreen 在 WKWebView 不产生原生 Space，故不走）
   *  - Windows/Linux：fullscreen.ts（HTML5 优先，Windows 实测可靠，已修复最大化假全屏） */
  toggleFullscreen: async (): Promise<boolean> => {
    if (await getPlatformCached() === 'macos') {
      const t = getInternals()
      if (!t) return false
      try { return (await t.invoke('toggle_window_size')) as boolean } catch { return false }
    }
    const { toggleFullscreen } = await import('./fullscreen')
    return toggleFullscreen()
  },
}
