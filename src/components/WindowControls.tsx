import { useState, useEffect, useCallback } from 'react'
import { Minus, Square, X, Copy } from 'lucide-react'

type WindowCtrl = {
  minimize: () => Promise<void>
  maximize: () => Promise<void>
  unmaximize: () => Promise<void>
  toggleMaximize: () => Promise<boolean>
  close: () => Promise<void>
  startDragging: () => Promise<void>
  isMaximized: () => Promise<boolean>
  isFullscreen: () => Promise<boolean>
  getPlatform: () => Promise<string>
} | null

const getTauriWindow = (): WindowCtrl => {
  try {
    const internals = (window as any).__TAURI_INTERNALS__
    if (!internals) return null

    // Use the metadata to get current window label
    const label = internals.metadata?.currentWindow?.label || 'main'

    const invoke = internals.invoke.bind(internals)

    return {
      minimize: () => invoke('plugin:window|minimize', { label }),
      maximize: () => invoke('plugin:window|maximize', { label }),
      unmaximize: () => invoke('plugin:window|unmaximize', { label }),
      toggleMaximize: () => invoke('toggle_window_size'),
      close: () => invoke('plugin:window|close', { label }),
      startDragging: () => invoke('plugin:window|start_dragging', { label }),
      isMaximized: () => invoke('plugin:window|is_maximized', { label }),
      isFullscreen: () => invoke('plugin:window|is_fullscreen', { label }),
      getPlatform: () => invoke('get_platform'),
    }
  } catch {
    return null
  }
}

interface WindowControlsProps {
  isDark?: boolean
}

export default function WindowControls({ }: WindowControlsProps) {
  const [isMaximized, setIsMaximized] = useState(false)
  const [isMac, setIsMac] = useState(false)

  const checkMaximized = useCallback(async (win: WindowCtrl) => {
    if (!win) return
    try {
      const result = isMac ? await win.isFullscreen() : await win.isMaximized()
      setIsMaximized(result)
    } catch {}
  }, [isMac])

  useEffect(() => {
    const win = getTauriWindow()
    if (!win) return

    win.getPlatform().then((p) => setIsMac(p === 'macos'))

    checkMaximized(win)

    // Poll maximized state every 500ms
    const interval = setInterval(() => checkMaximized(win), 500)
    return () => clearInterval(interval)
  }, [checkMaximized])

  const handleMinimize = async () => {
    const win = getTauriWindow()
    if (win) try { await win.minimize() } catch {}
  }

  const handleMaximize = async () => {
    const win = getTauriWindow()
    if (win) try { const v = await win.toggleMaximize(); setIsMaximized(v) } catch {}
  }

  const handleClose = async () => {
    const win = getTauriWindow()
    if (win) try { await win.close() } catch {}
  }

  // Export drag handler for parent to use on toolbar
  if (typeof window !== 'undefined') {
    (window as any).__TAURI_START_DRAG = async () => {
      const win = getTauriWindow()
      if (win) {
        try { await win.startDragging() } catch {}
      }
    }
  }

  return (
    <div className="flex items-center h-full">
      <button
        onMouseDown={(e) => e.stopPropagation()}
        onClick={handleMinimize}
        className="w-11 h-11 flex items-center justify-center hover:bg-[var(--editor-hover)] text-[var(--editor-text)] transition-colors"
        title="最小化"
      >
        <Minus size={16} />
      </button>
      <button
        onMouseDown={(e) => e.stopPropagation()}
        onClick={handleMaximize}
        className="w-11 h-11 flex items-center justify-center hover:bg-[var(--editor-hover)] text-[var(--editor-text)] transition-colors"
        title={isMaximized ? '还原' : '最大化'}
      >
        {isMaximized ? <Copy size={14} /> : <Square size={12} />}
      </button>
      <button
        onMouseDown={(e) => e.stopPropagation()}
        onClick={handleClose}
        className="w-11 h-11 flex items-center justify-center hover:bg-red-500 hover:text-white text-[var(--editor-text)] transition-colors"
        title="关闭"
      >
        <X size={16} />
      </button>
    </div>
  )
}
