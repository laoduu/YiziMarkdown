import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  width?: number
}

export default function Dialog({ open, onClose, title, children, width = 400 }: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={dialogRef}
        className="relative bg-[var(--editor-bg)] border border-[var(--editor-border)] rounded-xl shadow-2xl overflow-hidden animate-dialog-in"
        style={{ width }}
      >
        <div className="flex items-center justify-between px-4 h-11 border-b border-[var(--editor-border)]">
          <span className="text-sm font-semibold text-[var(--editor-text)]">{title}</span>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--editor-hover)] text-[var(--sidebar-text)]">
            <X size={14} />
          </button>
        </div>
        <div className="p-4">
          {children}
        </div>
      </div>
    </div>
  )
}
