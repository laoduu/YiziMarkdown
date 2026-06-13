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
}

export default function StatusBar({ 
  wordCount, readingTime, cursorLine, cursorColumn,
  filePath, isSaved,
  isPreviewMode, onTogglePreview, onToggleSidebar,
}: StatusBarProps) {
  return (
    <div className="statusbar">
      {/* 左侧控制区 */}
      <button
        onClick={onToggleSidebar}
        className="flex items-center justify-center p-1 rounded hover:bg-[var(--editor-hover)] text-[var(--sidebar-text)] transition-colors"
        title="切换侧边栏"
      >
        <PanelLeftClose size={14} />
      </button>

      <button
        onClick={() => onTogglePreview?.(!isPreviewMode)}
        className="flex items-center justify-center p-1 rounded hover:bg-[var(--editor-hover)] text-[var(--sidebar-text)] transition-colors"
        title={isPreviewMode ? '切换到源代码' : '切换到预览'}
      >
        {isPreviewMode ? <Code size={14} /> : <Eye size={14} />}
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

      <div className="flex items-center gap-1.5 text-[var(--sidebar-text)] opacity-60 select-none" style={{ fontSize: '11px' }}>
        <span>YiziMarkdown 0.1.0</span>
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
