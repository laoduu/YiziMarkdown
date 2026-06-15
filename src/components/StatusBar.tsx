import { invokeTauri } from '../lib/tauri'
import { useState, useEffect } from 'react'
import { FileText, Clock, Check, FolderOpen, Save, PanelLeftClose, Eye, Code } from 'lucide-react'

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
}

export default function StatusBar({
  wordCount, readingTime, cursorLine, cursorColumn,
  filePath, isSaved,
  isPreviewMode, onTogglePreview, onToggleSidebar, onOpenAbout,
}: StatusBarProps) {
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
        title="切换侧边栏"
      >
        <PanelLeftClose size={12} />
      </button>

      <button
        onClick={() => onTogglePreview?.(!isPreviewMode)}
        className="statusbar-item"
        title={isPreviewMode ? '切换到源代码' : '切换到预览'}
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
        <span>{wordCount} 字</span>
      </div>

      <div className="flex items-center gap-1.5">
        <Clock size={12} />
        <span>{readingTime} 分钟阅读</span>
      </div>

      <div className="flex-1" />

      <div className="statusbar-item" onClick={onOpenAbout} style={{ cursor: onOpenAbout ? 'pointer' : 'default' }} title="关于 YiziMarkdown">
        <span>YiziMarkdown {version}</span>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-1.5">
        <span>行 {cursorLine}</span>
        <span>列 {cursorColumn}</span>
      </div>

      <div className="flex items-center gap-1.5">
        {isSaved ? (
          <><Check size={12} /><span>已保存</span></>
        ) : (
          <><Save size={12} /><span>未保存</span></>
        )}
      </div>

      <div className="flex items-center gap-1.5"><span>Markdown</span></div>
      <div className="flex items-center gap-1.5"><span>UTF-8</span></div>
    </div>
  )
}