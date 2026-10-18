import { invokeTauri } from '../lib/tauri'
import { useState, useEffect } from 'react'
import { FileText, Clock, Check, FolderOpen, Save, PanelLeftClose, Eye, Code, TriangleAlert } from 'lucide-react'
import { useI18n } from '../i18n'

interface StatusBarProps {
  wordCount: number
  readingTime: number
  cursorLine: number
  cursorColumn: number
  filePath: string | null
  isSaved: boolean
  isPreviewMode?: boolean
  onTogglePreview?: (preview: boolean) => void
  onToggleSidebar?: () => void
  onOpenAbout?: () => void
  /** 本地缓存降级 / 写入失败的说明；非空时状态栏常驻一个警示标记，悬停即全文 */
  storageWarning?: string | null
}

export default function StatusBar({
  wordCount, readingTime, cursorLine, cursorColumn,
  filePath, isSaved,
  isPreviewMode, onTogglePreview, onToggleSidebar, onOpenAbout, storageWarning,
}: StatusBarProps) {
  const { t } = useI18n()
  const [version, setVersion] = useState('')

  useEffect(() => {
    invokeTauri<string>('get_app_version').then((v) => { if (v) setVersion(v) })
  }, [])

  return (
    <div className="statusbar">
      {/* 左侧控制区 */}
      <button
        onClick={onToggleSidebar}
        className="statusbar-item"
        title={t('statusbar.toggleSidebar')}
      >
        <PanelLeftClose size={12} />
      </button>

      <button
        onClick={() => onTogglePreview?.(!isPreviewMode)}
        className="statusbar-item"
        title={isPreviewMode ? t('statusbar.toSource') : t('statusbar.toPreview')}
      >
        {isPreviewMode ? <Code size={12} /> : <Eye size={12} />}
      </button>

      {filePath && (
        <div className="flex items-center gap-1.5 max-w-[200px] truncate">
          <FolderOpen size={12} />
          <span className="truncate">{filePath}</span>
        </div>
      )}

      <div className="flex items-center gap-1.5">
        <FileText size={12} />
        <span>{t('statusbar.chars', { n: wordCount })}</span>
      </div>

      <div className="flex items-center gap-1.5">
        <Clock size={12} />
        <span>{t('statusbar.readingTime', { n: readingTime })}</span>
      </div>

      <div className="flex-1" />

      <div className="statusbar-item" onClick={onOpenAbout} style={{ cursor: onOpenAbout ? 'pointer' : 'default' }} title={t('statusbar.about')}>
        <span>YiziMarkdown {version}</span>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-1.5">
        <span>{t('statusbar.line', { n: cursorLine })}</span>
        <span>{t('statusbar.col', { n: cursorColumn })}</span>
      </div>

      <div className="flex items-center gap-1.5">
        {isSaved ? (
          <><Check size={12} /><span>{t('statusbar.saved')}</span></>
        ) : (
          <><Save size={12} /><span>{t('statusbar.unsaved')}</span></>
        )}
      </div>

      {/* 本地缓存降级/写入失败：常驻提示，不随时间消失（配额满时持久化会静默失效） */}
      {storageWarning && (
        <div className="flex items-center" style={{ color: 'var(--danger)' }} title={storageWarning}>
          <TriangleAlert size={12} />
        </div>
      )}

      <div className="flex items-center gap-1.5"><span>Markdown</span></div>
      <div className="flex items-center gap-1.5"><span>UTF-8</span></div>
    </div>
  )
}