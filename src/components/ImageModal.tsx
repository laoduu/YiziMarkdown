import { useState, useEffect } from 'react'
import Dialog from './Dialog'
import { useI18n } from '../i18n'
import { FolderOpen, Globe, FileImage } from 'lucide-react'

type ImageMode = 'local' | 'network'

interface ImageModalProps {
  open: boolean
  onClose: () => void
  onConfirm: (markdown: string) => void
}

export default function ImageModal({ open, onClose, onConfirm }: ImageModalProps) {
  const { t } = useI18n()
  const [mode, setMode] = useState<ImageMode>('network')
  const [alt, setAlt] = useState('')
  const [url, setUrl] = useState('')
  const [localPath, setLocalPath] = useState('')

  useEffect(() => {
    if (open) {
      setMode('network')
      setAlt('')
      setUrl('')
      setLocalPath('')
    }
  }, [open])

  const handleBrowseFile = async () => {
    // 尝试使用 Tauri，失败则降级到浏览器原生 input
    const tauri = (window as any).__TAURI_INTERNALS__
    if (tauri && typeof tauri.invoke === 'function') {
      try {
        const result = await tauri.invoke('pick_image_file')
        if (result) {
          setLocalPath(result)
          const fileName = result.split(/[\\/]/).pop() || ''
          setAlt(fileName.replace(/\.[^.]+$/, ''))
          return
        }
      } catch {
        // Tauri 命令不存在，降级到浏览器方式
      }
    }

    // 浏览器降级方案
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/bmp'
    input.style.display = 'none'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        // 在浏览器环境中，创建本地 URL
        const localUrl = URL.createObjectURL(file)
        setLocalPath(localUrl)
        setAlt(file.name.replace(/\.[^.]+$/, ''))
      }
    }
    document.body.appendChild(input)
    input.click()
    document.body.removeChild(input)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const imagePath = mode === 'local' ? localPath : url
    if (!imagePath.trim()) return
    const altText = alt.trim() || 'image'
    const markdown = `![${altText}](${imagePath})`
    onConfirm(markdown)
    onClose()
  }

  const isValid = mode === 'local' ? localPath.trim() : url.trim()

  return (
    <Dialog open={open} onClose={onClose} title={t('dialog.insertImage')}>
      <form onSubmit={handleSubmit} className="space-y-3">
        {/* 模式切换 */}
        <div className="flex gap-1 p-0.5 bg-[var(--editor-surface)] rounded-lg border border-[var(--editor-border)]">
          <button
            type="button"
            onClick={() => setMode('local')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[12px] rounded-md transition-colors ${
              mode === 'local'
                ? 'bg-[var(--editor-accent)] text-white'
                : 'text-[var(--sidebar-text)] hover:bg-[var(--editor-hover)]'
            }`}
          >
            <FolderOpen size={13} />
            {t('dialog.imageLocal')}
          </button>
          <button
            type="button"
            onClick={() => setMode('network')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[12px] rounded-md transition-colors ${
              mode === 'network'
                ? 'bg-[var(--editor-accent)] text-white'
                : 'text-[var(--sidebar-text)] hover:bg-[var(--editor-hover)]'
            }`}
          >
            <Globe size={13} />
            {t('dialog.imageNetwork')}
          </button>
        </div>

        {/* 图片地址 */}
        {mode === 'local' ? (
          <div>
            <label className="block text-xs text-[var(--sidebar-text)] mb-1">{t('dialog.imageLocalPath')}</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={localPath}
                readOnly
                placeholder={t('dialog.imageLocalPlaceholder')}
                className="flex-1 px-3 py-2 text-[13px] bg-[var(--editor-surface)] border border-[var(--editor-border)] rounded-lg text-[var(--editor-text)] placeholder:text-[var(--sidebar-text)]"
              />
              <button
                type="button"
                onClick={handleBrowseFile}
                className="flex items-center gap-1.5 px-3 py-2 text-[12px] rounded-lg border border-[var(--editor-border)] hover:bg-[var(--editor-hover)] text-[var(--editor-text)]"
              >
                <FileImage size={13} />
                {t('dialog.browse')}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <label className="block text-xs text-[var(--sidebar-text)] mb-1">{t('dialog.imageUrl')}</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t('dialog.imageUrlPlaceholder')}
              className="w-full px-3 py-2 text-[13px] bg-[var(--editor-surface)] border border-[var(--editor-border)] rounded-lg outline-none focus:border-[var(--editor-accent)] text-[var(--editor-text)]"
              autoFocus
            />
          </div>
        )}

        {/* 图片描述 */}
        <div>
          <label className="block text-xs text-[var(--sidebar-text)] mb-1">{t('dialog.imageAlt')}</label>
          <input
            type="text"
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            placeholder={t('dialog.imageAltPlaceholder')}
            className="w-full px-3 py-2 text-[13px] bg-[var(--editor-surface)] border border-[var(--editor-border)] rounded-lg outline-none focus:border-[var(--editor-accent)] text-[var(--editor-text)]"
          />
        </div>

        {/* 按钮 */}
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
            disabled={!isValid}
            className="px-3 py-1.5 text-[12px] rounded-lg bg-[var(--editor-accent)] text-white hover:opacity-90 disabled:opacity-40"
          >
            {t('common.confirm')}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
