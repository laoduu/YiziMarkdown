/**
 * 导出成功后的两个动作：打开文件 / 打开所在目录。
 * PPTX、EPUB 等导出弹窗和统一的导出完成弹窗共用。
 */
import { useState } from 'react'
import { ExternalLink, FolderOpen } from 'lucide-react'
import { useI18n } from '../i18n'
import { openExportedFile, revealExportedFile } from '../lib/exportOpen'

interface Props {
  path: string
  /** 打开或定位后是否关闭当前弹窗 */
  onDone?: () => void
}

export default function ExportResultActions({ path, onDone }: Props) {
  const { t } = useI18n()
  const [error, setError] = useState<string | null>(null)

  const run = async (fn: (p: string) => Promise<void>) => {
    setError(null)
    try {
      await fn(path)
      onDone?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <>
      {error && <span className="text-[0.6875rem] text-red-500 break-all">{error}</span>}
      <button
        onClick={() => run(revealExportedFile)}
        className="px-3 py-1.5 rounded border border-[var(--editor-border)] hover:bg-[var(--editor-hover)] flex items-center gap-1.5"
      >
        <FolderOpen size={14} />
        {t('common.openFolder')}
      </button>
      <button
        onClick={() => run(openExportedFile)}
        className="px-3 py-1.5 rounded text-white flex items-center gap-1.5"
        style={{ background: 'var(--editor-accent)' }}
      >
        <ExternalLink size={14} />
        {t('common.open')}
      </button>
    </>
  )
}
