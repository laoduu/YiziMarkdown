import { useState, useEffect, useCallback } from 'react'
import { Minus, Square, X, Copy, Maximize, Minimize2 } from 'lucide-react'
import { useI18n } from '../i18n'
import { windowOps } from '../lib/windowOps'

interface WindowControlsProps {
  isDark?: boolean
}

export default function WindowControls({ }: WindowControlsProps) {
  const { t } = useI18n()
  const [isMaximized, setIsMaximized] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isMac, setIsMac] = useState(false)

  const checkWindow = useCallback(async () => {
    try {
      // mac：最大化概念不存在（中键 = 原生全屏），沿用「全屏态显示还原图标」；
      // Windows：两个态都轮询（全屏按钮态需要 HTML5 感知的 isFullscreen）
      const [maxed, fs] = await Promise.all([windowOps.isMaximized(), windowOps.isFullscreen()])
      setIsMaximized(maxed)
      setIsFullscreen(fs)
    } catch {}
  }, [])

  useEffect(() => {
    windowOps.getPlatform().then((p) => setIsMac(p === 'macos'))
    checkWindow()
    // Poll window state every 500ms
    const interval = setInterval(() => checkWindow(), 500)
    return () => clearInterval(interval)
  }, [checkWindow])

  const handleMinimize = async () => {
    try { await windowOps.minimize() } catch {}
  }

  const handleMaximize = async () => {
    try { const v = await windowOps.toggleMaximize(); setIsMaximized(v) } catch {}
  }

  const handleToggleFullscreen = async () => {
    try { const v = await windowOps.toggleFullscreen(); setIsFullscreen(v) } catch {}
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

  // 通用按钮样式：w-9（用户实测反馈再收紧一档；四钮共 144px）
  const btn = 'w-9 h-11 flex items-center justify-center hover:bg-[var(--editor-hover)] text-[var(--editor-text)] transition-colors'

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
      <button
        onMouseDown={(e) => e.stopPropagation()}
        onClick={handleMaximize}
        className={btn}
        title={isMac
          // mac：中键实际是原生全屏切换（toggle_window_size 的 mac 分支），如实标注
          ? (isFullscreen ? t('window.exitFullscreen') : t('window.enterFullscreen'))
          : (isMaximized ? t('window.restore') : t('window.maximize'))}
      >
        {isMaximized || (isMac && isFullscreen) ? <Copy size={14} /> : <Square size={12} />}
      </button>
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
        className="w-9 h-11 flex items-center justify-center hover:bg-red-500 hover:text-white text-[var(--editor-text)] transition-colors"
        title={t('window.close')}
      >
        <X size={16} />
      </button>
    </div>
  )
}
