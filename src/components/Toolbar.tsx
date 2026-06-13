import { useState, useCallback } from 'react'
import { 
  FileText,
  SaveAll, 
  FolderOpen, 
  Save, 
  Sun, 
  Moon, 
  PanelLeftClose,
  Download,
  Search,
  Settings,
  Undo2,
  Redo2,
  Bold,
  Italic,
  Strikethrough,
  Code,
  Link,
  Image,
  List,
  ListOrdered,
  Quote,
  Heading1,
  Heading2,
  Heading3,
  Minus,
  Table,
  CheckSquare,
  FileDown,
  FileText as FileTextIcon,
  FileCode,
  Palette,
  Check,
} from 'lucide-react'
import WindowControls from './WindowControls'
import { useSettingsStore } from '../stores/settingsStore'

interface ToolbarProps {
  onNew: () => void
  onOpen: () => void
  onSave: () => void
  onSaveAs: () => void
  onToggleSidebar: () => void
  onToggleDark: () => void
  onInsertMarkdown: (markdown: string, mode?: 'wrap' | 'prefix' | 'link') => void
  onExport: (format: 'html' | 'md' | 'txt') => void
  onSearch: () => void
  onSettings: () => void
  isDark: boolean
}

type WindowCtrl = {
  toggleMaximize: () => Promise<void>
  isMaximized: () => Promise<boolean>
} | null

const getTauriWindow = (): WindowCtrl => {
  try {
    const internals = (window as any).__TAURI_INTERNALS__
    if (!internals) return null
    const label = internals.metadata?.currentWindow?.label || 'main'
    const invoke = internals.invoke.bind(internals)
    return {
      toggleMaximize: () => invoke('plugin:window|toggle_maximize', { label }),
      isMaximized: () => invoke('plugin:window|is_maximized', { label }),
    }
  } catch { return null }
}

const themeNames: Record<string, string> = {
  academic: '学术蓝', vibrant: '活力橙', minimal: '极简风', magazine: '杂志感', tech: '科技感', nature: '自然风',
}

export default function Toolbar({ 
  onNew, onOpen, onSave, onSaveAs, onToggleSidebar, onToggleDark,
  onInsertMarkdown, onExport, onSearch, onSettings,
  isDark,
}: ToolbarProps) {
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [showThemeMenu, setShowThemeMenu] = useState(false)
  const { currentTheme, setField } = useSettingsStore()

  // 空白处双击最大化/还原
  const handleDoubleClick = useCallback(async () => {
    const win = getTauriWindow()
    if (win) try { await win.toggleMaximize() } catch {}
  }, [])

  return (
    <div 
      className="toolbar"
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('.relative')) return
        const drag = (window as any).__TAURI_START_DRAG
        if (drag) drag()
      }}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('.relative')) return
        handleDoubleClick()
      }}
    >
      {/* 左侧：品牌 + 格式按钮，允许溢出裁剪 */}
      <div className="flex items-center gap-0.5 overflow-hidden min-w-0 flex-1">
        <span className="text-[15px] font-extrabold tracking-tight text-[var(--editor-accent)] select-none mr-3 shrink-0">YiziMarkdown</span>
        <ToolbarButton icon={<FileText size={16} />} tooltip="新建 (Ctrl+N)" onClick={onNew} />
        <ToolbarButton icon={<FolderOpen size={16} />} tooltip="打开 (Ctrl+O)" onClick={onOpen} />
        <ToolbarButton icon={<Save size={16} />} tooltip="保存 (Ctrl+S)" onClick={onSave} />
        <ToolbarButton icon={<SaveAll size={16} />} tooltip="另存为" onClick={onSaveAs} />
        <ToolbarDivider />
        <ToolbarButton icon={<Undo2 size={16} />} tooltip="撤销 (Ctrl+Z)" onClick={() => {}} />
        <ToolbarButton icon={<Redo2 size={16} />} tooltip="重做 (Ctrl+Y)" onClick={() => {}} />
        <ToolbarDivider />
        <ToolbarButton icon={<Bold size={16} />} tooltip="粗体 (Ctrl+B)" onClick={() => onInsertMarkdown('**', 'wrap')} />
        <ToolbarButton icon={<Italic size={16} />} tooltip="斜体 (Ctrl+I)" onClick={() => onInsertMarkdown('*', 'wrap')} />
        <ToolbarButton icon={<Strikethrough size={16} />} tooltip="删除线" onClick={() => onInsertMarkdown('~~', 'wrap')} />
        <ToolbarButton icon={<Code size={16} />} tooltip="行内代码" onClick={() => onInsertMarkdown('\`', 'wrap')} />
        <ToolbarDivider />
        <ToolbarButton icon={<Heading1 size={16} />} tooltip="标题 1" onClick={() => onInsertMarkdown('# ')} />
        <ToolbarButton icon={<Heading2 size={16} />} tooltip="标题 2" onClick={() => onInsertMarkdown('## ')} />
        <ToolbarButton icon={<Heading3 size={16} />} tooltip="标题 3" onClick={() => onInsertMarkdown('### ')} />
        <ToolbarDivider />
        <ToolbarButton icon={<List size={16} />} tooltip="无序列表" onClick={() => onInsertMarkdown('- ')} />
        <ToolbarButton icon={<ListOrdered size={16} />} tooltip="有序列表" onClick={() => onInsertMarkdown('1. ')} />
        <ToolbarButton icon={<CheckSquare size={16} />} tooltip="任务列表" onClick={() => onInsertMarkdown('- [ ] ')} />
        <ToolbarButton icon={<Quote size={16} />} tooltip="引用" onClick={() => onInsertMarkdown('> ')} />
        <ToolbarDivider />
        <ToolbarButton icon={<Link size={16} />} tooltip="链接" onClick={() => onInsertMarkdown('[链接](url)')} />
        <ToolbarButton icon={<Image size={16} />} tooltip="图片" onClick={() => onInsertMarkdown('![alt](url)')} />
        <ToolbarButton icon={<Table size={16} />} tooltip="表格" onClick={() => onInsertMarkdown('\n| 列1 | 列2 |\n|------|------|\n| 内容 | 内容 |\n')} />
        <ToolbarButton icon={<Minus size={16} />} tooltip="分割线" onClick={() => onInsertMarkdown('\n---\n')} />
      </div>

      {/* 右侧工具组：永远不被压缩 */}
      <div className="flex items-center gap-0.5 shrink-0">
        <ToolbarButton icon={<Search size={16} />} tooltip="搜索 (Ctrl+F)" onClick={onSearch} />
        
        {/* 导出按钮 */}
        <div className="relative">
          <ToolbarButton 
            icon={<Download size={16} />} 
            tooltip="导出" 
            onClick={() => setShowExportMenu(!showExportMenu)} 
          />
          {showExportMenu && (
            <>
              <div 
                className="fixed inset-0 z-40" 
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => setShowExportMenu(false)}
              />
              <div className="absolute top-full right-0 mt-1 py-1 w-52 bg-[var(--editor-surface)] border border-[var(--editor-border)] rounded-lg shadow-lg z-50">
                <ExportMenuItem 
                  icon={<FileCode size={14} />} 
                  label="导出为 HTML" 
                  onClick={() => { onExport('html'); setShowExportMenu(false); }} 
                />
                <ExportMenuItem 
                  icon={<FileTextIcon size={14} />} 
                  label="导出为 Markdown" 
                  onClick={() => { onExport('md'); setShowExportMenu(false); }} 
                />
                <ExportMenuItem 
                  icon={<FileDown size={14} />} 
                  label="导出为纯文本" 
                  onClick={() => { onExport('txt'); setShowExportMenu(false); }} 
                />
              </div>
            </>
          )}
        </div>

        <ToolbarDivider />

        {/* 主题切换 */}
        <div className="relative">
          <ToolbarButton 
            icon={<Palette size={16} />} 
            tooltip={themeNames[currentTheme] || currentTheme}
            onClick={() => setShowThemeMenu(!showThemeMenu)} 
          />
          {showThemeMenu && (
            <>
              <div 
                className="fixed inset-0 z-40" 
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => setShowThemeMenu(false)}
              />
              <div className="absolute top-full right-0 mt-1 py-1 w-48 bg-[var(--editor-surface)] border border-[var(--editor-border)] rounded-lg shadow-lg z-50">
                {Object.entries(themeNames).map(([id, name]) => (
                  <button
                    key={id}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => { setField('currentTheme', id); setShowThemeMenu(false) }}
                    className="w-full px-3 py-2 text-sm text-left text-[var(--editor-text)] hover:bg-[var(--editor-hover)] flex items-center gap-2"
                  >
                    {currentTheme === id && <Check size={14} className="text-[var(--editor-accent)]" />}
                    <span className={currentTheme === id ? 'text-[var(--editor-accent)] font-medium' : ''}>{name}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* 明暗切换 */}
        <ToolbarButton 
          icon={isDark ? <Sun size={16} /> : <Moon size={16} />} 
          tooltip={isDark ? "亮色模式" : "暗色模式"} 
          onClick={onToggleDark} 
        />

        <ToolbarButton 
          icon={<PanelLeftClose size={16} />} 
          tooltip="切换侧边栏" 
          onClick={onToggleSidebar} 
        />
        <ToolbarButton icon={<Settings size={16} />} tooltip="设置" onClick={onSettings} />
        
        {/* 窗口控制按钮 */}
        <ToolbarDivider />
        <div className="shrink-0"><WindowControls /></div>
      </div>
    </div>
  )
}

interface ToolbarButtonProps {
  icon: React.ReactNode
  tooltip: string
  onClick: () => void
  active?: boolean
}

function ToolbarButton({ icon, tooltip, onClick, active }: ToolbarButtonProps) {
  return (
    <button
      onMouseDown={(e) => e.stopPropagation()}
      onClick={onClick}
      title={tooltip}
      className={`
        w-8 h-8 flex items-center justify-center rounded-md
        transition-colors duration-150
        ${active 
          ? 'bg-[var(--editor-accent)] text-white' 
          : 'hover:bg-[var(--editor-hover)] text-[var(--editor-text)] opacity-80 hover:opacity-100'
        }
      `}
    >
      {icon}
    </button>
  )
}

function ToolbarDivider() {
  return <div className="w-px h-5 bg-[var(--editor-border)] mx-0.5 shrink-0" />
}

function ExportMenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onMouseDown={(e) => e.stopPropagation()}
      onClick={onClick}
      className="w-full px-3 py-1.5 text-sm text-left text-[var(--editor-text)] hover:bg-[var(--editor-hover)] flex items-center gap-2 whitespace-nowrap"
    >
      {icon}
      {label}
    </button>
  )
}
