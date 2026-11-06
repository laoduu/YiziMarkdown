/**
 * 通用「导出完成」弹窗：DOCX / PDF / HTML / Markdown / TXT 等走保存对话框的格式，
 * 导出成功后统一提供「打开文件 / 打开所在目录」，避免用户再去文件夹里找。
 */
import { createPortal } from 'react-dom'
import { CheckCircle2, X } from 'lucide-react'
import { useI18n } from '../i18n'
import ExportResultActions from './ExportResultActions'

interface Props {
  path: string | null
  onClose: () => void
}

export default function ExportResultDialog({ path, onClose }: Props) {
  const { t } = useI18n()
  if (!path) return null

  const overlay = (
    <div
      className="fixed inset-0 z-[10040] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.32)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-[430px] max-w-[92vw] border rounded-pop overflow-hidden animate-dialog-in"
        style={{ background: 'var(--dialog-bg)', borderColor: 'var(--dialog-border)', boxShadow: 'var(--dialog-shadow)' }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--dialog-border)]">
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle2 size={15} style={{ color: 'var(--editor-success,#16a34a)' }} />
            {t('pluginExport.done')}
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--editor-hover)]" title={t('common.close')}>
            <X size={14} />
          </button>
        </div>
        <div className="px-4 py-3">
          <div className="break-all text-[0.75rem] text-[var(--sidebar-text)]">{path}</div>
        </div>
        <div className="px-4 py-3 border-t border-[var(--editor-border)] flex items-center justify-end gap-2 flex-wrap">
          <button onClick={onClose} className="px-3 py-1.5 rounded border border-[var(--editor-border)] hover:bg-[var(--editor-hover)]">
            {t('common.close')}
          </button>
          <ExportResultActions path={path} onDone={onClose} />
        </div>
      </div>
    </div>
  )
  return createPortal(overlay, document.body)
}
