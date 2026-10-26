/**
 * windowStateStore.ts — 窗口状态的单一数据源（v0.4.1 全屏/窗口状态整治）。
 *
 * 背景：此前窗口状态有 3 个互不同步的来源——DOM `fullscreenElement`、原生
 * `is_fullscreen`/`is_maximized`、fullscreen.ts 的模块级 `toggleSavedMaximized`
 * 标记——仅靠 WindowControls 的 500ms 轮询勉强对齐，导致全屏中拖动、全屏中
 * 点最大化、退出全屏不还原最大化等一系列状态错乱（实测矩阵 A2/A4/A7 实锤）。
 *
 * 现在所有消费者（WindowControls、Toolbar、Slideshow、fullscreen.ts）只读这里；
 * 状态由 `fullscreenchange` 事件即时刷新 + 500ms 轮询兜底（原生全屏变化没有
 * DOM 事件）；进入全屏前的窗口快照（preFullscreen）也存这里——任何退出路径
 * （按钮 / Esc / 演示卸载）都经由 refresh() 的「全屏 → 非全屏」转移统一消费
 * 快照并还原（set 语义，幂等）。
 */
import { create } from 'zustand'

interface PreFullscreenSnapshot {
  /** 进入前是否原生最大化（退出后按需还原） */
  maximized: boolean
  /** 进入前是否原生全屏（叠加进入的场景：退出后还原全屏） */
  fullscreen: boolean
}

interface WindowStateStore {
  /** 当前是否全屏（HTML5 或原生，取并集） */
  fullscreen: boolean
  /** 当前是否原生最大化 */
  maximized: boolean
  /** 进入全屏前的快照；退出全屏时消费（消费后置 null，保证幂等） */
  preFullscreen: PreFullscreenSnapshot | null
  /** 从 DOM + 原生刷新状态；检测到「全屏 → 非全屏」转移时消费快照并还原 */
  refresh: () => Promise<void>
  /** 进入全屏前拍快照（幂等：已有快照则保留最早的） */
  snapshotForFullscreen: () => Promise<void>
}

const getInternals = (): { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>; label: string } | null => {
  const internals = (window as any).__TAURI_INTERNALS__
  if (!internals?.invoke) return null
  const label = internals.metadata?.currentWindow?.label || 'main'
  return { invoke: internals.invoke.bind(internals), label }
}

async function nativeIsFullscreen(): Promise<boolean> {
  const t = getInternals()
  if (!t) return false
  try { return !!(await t.invoke('plugin:window|is_fullscreen', { label: t.label })) } catch { return false }
}

async function nativeIsMaximized(): Promise<boolean> {
  const t = getInternals()
  if (!t) return false
  try { return !!(await t.invoke('plugin:window|is_maximized', { label: t.label })) } catch { return false }
}

export const useWindowStateStore = create<WindowStateStore>((set, get) => ({
  fullscreen: false,
  maximized: false,
  preFullscreen: null,

  refresh: async () => {
    // HTML5 全屏时原生 is_fullscreen 不置位，必须取并集
    const [domFs, natFs, maxed] = await Promise.all([
      Promise.resolve(!!document.fullscreenElement),
      nativeIsFullscreen(),
      nativeIsMaximized(),
    ])
    const fsNow = domFs || natFs
    const wasFullscreen = get().fullscreen
    set({ fullscreen: fsNow, maximized: maxed })
    // 「全屏 → 非全屏」转移：消费快照，还原进入前的窗口状态。
    // 先置 null 再做异步还原——即使还原期间再触发 refresh 也不会二次执行。
    if (wasFullscreen && !fsNow) {
      const snap = get().preFullscreen
      if (!snap) return
      set({ preFullscreen: null })
      const t = getInternals()
      if (!t) return
      try {
        if (snap.fullscreen) {
          // 进入前就是原生全屏（叠加场景）→ 还原原生全屏
          await t.invoke('plugin:window|set_fullscreen', { label: t.label, fullscreen: true })
        } else if (snap.maximized && !maxed) {
          // set 语义（幂等）：只在仍非最大化时补一次 maximize
          await t.invoke('plugin:window|maximize', { label: t.label })
        }
      } catch {}
    }
  },

  snapshotForFullscreen: async () => {
    if (get().preFullscreen) return // 幂等：保留最早快照（叠加进入场景）
    const [maxed, fs] = await Promise.all([nativeIsMaximized(), nativeIsFullscreen()])
    set({ preFullscreen: { maximized: maxed, fullscreen: fs } })
  },
}))

// —— 全局监听（模块加载时安装一次）——
// HTML5 全屏进出 → fullscreenchange 立即刷新；其余窗口状态变化（最大化/还原/
// 原生全屏）没有可靠 DOM 事件 → 500ms 轮询兜底（沿用 WindowControls 旧轮询频率）。
if (typeof document !== 'undefined') {
  document.addEventListener('fullscreenchange', () => { void useWindowStateStore.getState().refresh() })
  if (getInternals()) {
    setInterval(() => { void useWindowStateStore.getState().refresh() }, 500)
  }
}
