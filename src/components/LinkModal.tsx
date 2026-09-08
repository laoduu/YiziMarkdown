import { useState, useEffect } from 'react'
import Dialog from './Dialog'
import { useI18n } from '../i18n'

interface LinkModalProps {
  open: boolean
  onClose: () => void
  onConfirm: (text: string, url: string) => void
  initialText?: string
}

export default function LinkModal({ open, onClose, onConfirm, initialText = '' }: LinkModalProps) {
  const { t } = useI18n()
  const [text, setText] = useState(initialText)
  const [url, setUrl] = useState('')

  useEffect(() => {
    if (open) {
      setText(initialText)
      setUrl('')
    }
  }, [open, initialText])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (url.trim()) {
      onConfirm(text.trim() || url.trim(), url.trim())
      onClose()
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('dialog.insertLink')}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs text-[var(--sidebar-text)] mb-1">{t('dialog.linkText')}</label>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('dialog.linkTextPlaceholder')}
            className="w-full px-3 py-2 text-[13px] bg-[var(--editor-surface)] border border-[var(--editor-border)] rounded-lg outline-none focus:border-[var(--editor-accent)] text-[var(--editor-text)]"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--sidebar-text)] mb-1">{t('dialog.linkUrl')}</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t('dialog.linkUrlPlaceholder')}
            className="w-full px-3 py-2 text-[13px] bg-[var(--editor-surface)] border border-[var(--editor-border)] rounded-lg outline-none focus:border-[var(--editor-accent)] text-[var(--editor-text)]"
            required
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-[12px] rounded-lg border border-[var(--editor-border)] hover:bg-[var(--editor-hover)] text-[var(--editor-text)]"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            className="px-3 py-1.5 text-[12px] rounded-lg bg-[var(--editor-accent)] text-white hover:opacity-90"
          >
            {t('common.confirm')}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
