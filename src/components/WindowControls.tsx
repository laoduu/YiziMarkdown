import { useState, useEffect } from 'react'
import { Minus, Square, X, Copy, Maximize, Minimize2 } from 'lucide-react'
import { useI18n } from '../i18n'
import { windowOps } from '../lib/windowOps'
import { useWindowStateStore } from '../stores/windowStateStore'

interface WindowControlsProps {
  isDark?: boolean
}

export default function WindowControls({ }: WindowControlsProps) {
  const { t } = useI18n()
  // 窗口状态单一数据源（windowStateStore 内部已接 fullscreenchange + 轮询兜底）
  const isMaximized = useWindowStateStore((s) => s.maximized)
  const isFullscreen = useWindowStateStore((s) => s.fullscreen)
  const [isMac, setIsMac] = useState(false)

  useEffect(() => {
    windowOps.getPlatform().then((p) => setIsMac(p === 'macos')).catch(() => {})
  }, [])

  const handleMinimize = async () => {
    try { await windowOps.minimize() } catch {}
  }

  const handleMaximize = async () => {
    // Windows 全屏中该钮不渲染（见下方条件渲染）；mac 中键 = toggle_window_size 原生切换
    try { await windowOps.toggleMaximize() } catch {}
  }

  const handleToggleFullscreen = async () => {
    try { await windowOps.toggleFullscreen() } catch {}
  }

  const handleClose = async () => {
    try { await windowOps.close() } catch {}
  }

  // Export drag handler for parent to use on toolbar
  if (typeof window !== 'undefined') {
    (window as any).__TAURI_START_DRAG = async () => {
      try { await windowOps.startDragging() } catch {}
    }
  }

  // 通用按钮样式：w-9（用户实测反馈再收紧一档；四钮共 144px）。
  // focus-visible:outline-none —— 窗口按钮点击后由键盘（Esc 等）触发的
  // :focus-visible 会在按钮上残留焦点框（实测 A12），窗口按钮无需焦点可见性。
  const btn = 'w-9 h-11 flex items-center justify-center hover:bg-[var(--editor-hover)] text-[var(--editor-text)] transition-colors focus-visible:outline-none'

  return (
    <div className="flex items-center h-full">
      <button
        onMouseDown={(e) => e.stopPropagation()}
        onClick={handleMinimize}
        className={btn}
        title={t('window.minimize')}
      >
        <Minus size={16} />
      </button>
      {/* 最大化/还原钮：Windows 全屏中隐藏——此时它与全屏钮都是「退出全屏」图标，
          两个相同图标并排无意义（退出全屏由全屏钮承担）；mac 保留（中键即全屏切换） */}
      {(!isFullscreen || isMac) && (
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={handleMaximize}
          className={btn}
          title={isMac
            // mac：中键实际是原生全屏切换（toggle_window_size 的 mac 分支），如实标注
            ? (isFullscreen ? t('window.exitFullscreen') : t('window.enterFullscreen'))
            : (isMaximized ? t('window.restore') : t('window.maximize'))
          }
        >
          {isMaximized || (isMac && isFullscreen) ? <Copy size={14} /> : <Square size={12} />}
        </button>
      )}
      {/* 全屏按钮：仅 Windows —— mac 的中键本身就是全屏，不设重复入口 */}
      {!isMac && (
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={handleToggleFullscreen}
          className={btn}
          title={isFullscreen ? t('window.exitFullscreen') : t('window.enterFullscreen')}
        >
          {isFullscreen ? <Minimize2 size={14} /> : <Maximize size={13} />}
        </button>
      )}
      <button
        onMouseDown={(e) => e.stopPropagation()}
        onClick={handleClose}
        className="w-9 h-11 flex items-center justify-center hover:bg-red-500 hover:text-white text-[var(--editor-text)] transition-colors focus-visible:outline-none"
        title={t('window.close')}
      >
        <X size={16} />
      </button>
    </div>
  )
}
