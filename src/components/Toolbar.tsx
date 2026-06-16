import { useState, useCallback, useEffect, useRef } from 'react'
import { 
  FileText,
  SaveAll, 
  FolderOpen, 
  Save,
  FileUp, 
  Sun, 
  Moon, 
  PanelLeftClose,
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
  Sigma,
  Workflow,
  Pi,
  FunctionSquare,
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
  onUndo?: () => void
  onRedo?: () => void
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

export default function Toolbar({ 
  onNew, onOpen, onSave, onSaveAs, onToggleSidebar, onToggleDark, onUndo, onRedo,
  onInsertMarkdown, onExport, onSearch, onSettings,
  isDark,
}: ToolbarProps) {
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [exportMenuPos, setExportMenuPos] = useState<{top: number; left: number}>({top: 0, left: 0})
  const exportBtnRef = useRef<HTMLDivElement>(null)
  const [showTablePicker, setShowTablePicker] = useState(false)
  const [tablePickerPos, setTablePickerPos] = useState({top: 0, left: 0})
  const [tablePickerSize, setTablePickerSize] = useState({rows: 0, cols: 0})
  const tableBtnRef = useRef<HTMLDivElement>(null)
  const [showMathMenu, setShowMathMenu] = useState(false)
  const [mathMenuPos, setMathMenuPos] = useState({top: 0, left: 0})
  const mathBtnRef = useRef<HTMLDivElement>(null)
  const [showThemeMenu, setShowThemeMenu] = useState(false)
  const { currentTheme, setField } = useSettingsStore()
  const [themeFiles, setThemeFiles] = useState<string[]>([])
  const [themeMeta, setThemeMeta] = useState<Record<string, { name: string }>>({})

  // 动态加载主题列表和元信息
  useEffect(() => {
    const load = async () => {
      try {
        const tauri = (window as any).__TAURI_INTERNALS__
        if (tauri && typeof tauri.invoke === 'function') {
          const [files, json] = await Promise.all([
            tauri.invoke('list_themes') as Promise<string[]>,
            tauri.invoke('read_theme_json') as Promise<string>,
          ])
          if (files) setThemeFiles(files)
          try { setThemeMeta(JSON.parse(json || '{}')) } catch {}
        }
      } catch {}
    }
    load()
  }, [])

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
      <div className="flex items-center gap-px overflow-hidden min-w-0 flex-1">
        <span className="text-[15px] font-extrabold tracking-tight text-[var(--editor-accent)] select-none mr-1.5 shrink-0">YiziMarkdown</span>
        <ToolbarButton icon={<FileText size={16} />} tooltip="新建 (Ctrl+N)" onClick={onNew} accent />
        <ToolbarButton icon={<FolderOpen size={16} />} tooltip="打开 (Ctrl+O)" onClick={onOpen} accent />
        <ToolbarButton icon={<Save size={16} />} tooltip="保存 (Ctrl+S)" onClick={onSave} accent />
        <ToolbarButton icon={<SaveAll size={16} />} tooltip="另存为" onClick={onSaveAs} accent />
        <div className="relative" ref={exportBtnRef}>
          <ToolbarButton 
            icon={<FileUp size={16} />} 
            tooltip="导出" 
            onClick={() => {
              if (exportBtnRef.current) {
                const rect = exportBtnRef.current.getBoundingClientRect()
                setExportMenuPos({ top: rect.bottom + 4, left: rect.left })
              }
              setShowExportMenu(!showExportMenu)
            }} 
            accent
          />
          {showExportMenu && (
            <>
              <div 
                className="fixed inset-0 z-40" 
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => setShowExportMenu(false)}
              />
              <div 
                className="fixed py-1 w-52 bg-[var(--editor-surface)] border border-[var(--editor-border)] rounded-lg shadow-lg z-50"
                style={{ top: exportMenuPos.top, left: exportMenuPos.left }}
              >
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
        <ToolbarButton icon={<Undo2 size={16} />} tooltip="撤销 (Ctrl+Z)" onClick={() => onUndo?.()} accent />
        <ToolbarButton icon={<Redo2 size={16} />} tooltip="重做 (Ctrl+Y)" onClick={() => onRedo?.()} accent />
        <ToolbarButton icon={<Search size={16} />} tooltip="搜索 (Ctrl+F)" onClick={onSearch} accent />
        <ToolbarDivider />
        <ToolbarButton icon={<Bold size={16} />} tooltip="粗体 (Ctrl+B)" onClick={() => onInsertMarkdown('**', 'wrap')} />
        <ToolbarButton icon={<Italic size={16} />} tooltip="斜体 (Ctrl+I)" onClick={() => onInsertMarkdown('*', 'wrap')} />
        <ToolbarButton icon={<Strikethrough size={16} />} tooltip="删除线" onClick={() => onInsertMarkdown('~~', 'wrap')} />
        <ToolbarButton icon={<Code size={16} />} tooltip="行内代码" onClick={() => onInsertMarkdown('\`', 'wrap')} />
        <ToolbarDivider />
        <ToolbarButton icon={<Heading1 size={16} />} tooltip="标题 1" onClick={() => onInsertMarkdown('# ', 'prefix')} />
        <ToolbarButton icon={<Heading2 size={16} />} tooltip="标题 2" onClick={() => onInsertMarkdown('## ', 'prefix')} />
        <ToolbarButton icon={<Heading3 size={16} />} tooltip="标题 3" onClick={() => onInsertMarkdown('### ', 'prefix')} />
        <ToolbarDivider />
        <ToolbarButton icon={<List size={16} />} tooltip="无序列表" onClick={() => onInsertMarkdown('- ', 'prefix')} />
        <ToolbarButton icon={<ListOrdered size={16} />} tooltip="有序列表" onClick={() => onInsertMarkdown('1. ', 'prefix')} />
        <ToolbarButton icon={<CheckSquare size={16} />} tooltip="任务列表" onClick={() => onInsertMarkdown('- [ ] ', 'prefix')} />
        <ToolbarButton icon={<Quote size={16} />} tooltip="引用" onClick={() => onInsertMarkdown('> ', 'prefix')} />
        <ToolbarDivider />
        <ToolbarButton icon={<Link size={16} />} tooltip="链接" onClick={() => onInsertMarkdown('[链接](url)', 'link')} />
        <ToolbarButton icon={<Image size={16} />} tooltip="图片" onClick={() => onInsertMarkdown('![alt](url)', 'link')} />
        <div className="relative" ref={tableBtnRef}>
          <ToolbarButton 
            icon={<Table size={16} />} 
            tooltip="表格" 
            onClick={() => {
              if (tableBtnRef.current) {
                const rect = tableBtnRef.current.getBoundingClientRect()
                setTablePickerPos({ top: rect.bottom + 4, left: rect.left })
              }
              setTablePickerSize({rows: 0, cols: 0})
              setShowTablePicker(!showTablePicker)
            }}
            accent
          />
          {showTablePicker && (
            <>
              <div 
                className="fixed inset-0 z-40" 
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => setShowTablePicker(false)}
              />
              <div 
                className="fixed bg-[var(--editor-surface)] border border-[var(--editor-border)] rounded-lg shadow-lg z-50 p-3"
                style={{ top: tablePickerPos.top, left: tablePickerPos.left }}
              >
                <div className="text-xs text-[var(--editor-text-muted)] mb-2 h-4">
                  {tablePickerSize.rows > 0 ? `${tablePickerSize.rows} × ${tablePickerSize.cols}` : '选择大小'}
                </div>
                <div 
                  className="grid gap-px"
                  style={{ gridTemplateColumns: `repeat(8, 18px)` }}
                  onMouseLeave={() => setTablePickerSize({rows: 0, cols: 0})}
                >
                  {Array.from({length: 64}, (_, i) => {
                    const row = Math.floor(i / 8) + 1
                    const col = (i % 8) + 1
                    const isHighlight = row <= tablePickerSize.rows && col <= tablePickerSize.cols
                    return (
                      <div
                        key={i}
                        className={`w-[18px] h-[18px] rounded-sm border transition-colors duration-75 cursor-pointer ${
                          isHighlight 
                            ? 'bg-[var(--editor-accent)] border-[var(--editor-accent)]' 
                            : 'bg-transparent border-[var(--editor-border)]'
                        }`}
                        onMouseEnter={() => setTablePickerSize({rows: row, cols: col})}
                        onClick={() => {
                          if (row > 0 && col > 0) {
                            const md = generateTableMd(row, col)
                            onInsertMarkdown(md)
                            setShowTablePicker(false)
                          }
                        }}
                      />
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>
        <div className="relative" ref={mathBtnRef}>
          <ToolbarButton 
            icon={<Sigma size={16} />} 
            tooltip="公式" 
            onClick={() => {
              if (mathBtnRef.current) {
                const rect = mathBtnRef.current.getBoundingClientRect()
                setMathMenuPos({ top: rect.bottom + 4, left: rect.left })
              }
              setShowMathMenu(!showMathMenu)
            }} 
            accent
          />
          {showMathMenu && (
            <>
              <div 
                className="fixed inset-0 z-40" 
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => setShowMathMenu(false)}
              />
              <div 
                className="fixed py-1 w-40 bg-[var(--editor-surface)] border border-[var(--editor-border)] rounded-lg shadow-lg z-50"
                style={{ top: mathMenuPos.top, left: mathMenuPos.left }}
              >
                <ExportMenuItem 
                  icon={<Pi size={14} />} 
                  label="行内公式 ($...$)" 
                  onClick={() => { onInsertMarkdown('$', 'wrap'); setShowMathMenu(false) }} 
                />
                <ExportMenuItem 
                  icon={<FunctionSquare size={14} />} 
                  label="块级公式 ($$...$$)" 
                  onClick={() => { onInsertMarkdown('\n$$\n公式\n$$\n'); setShowMathMenu(false) }} 
                />
              </div>
            </>
          )}
        </div>
        <ToolbarButton icon={<Workflow size={16} />} tooltip="Mermaid 图表" onClick={() => onInsertMarkdown('\n```mermaid\ngraph LR\n  A[开始] --> B[结束]\n```\n')} />
        <ToolbarButton icon={<Minus size={16} />} tooltip="分割线" onClick={() => onInsertMarkdown('\n---\n')} />
      </div>

      {/* 右侧工具组：永远不被压缩 */}
      <div className="flex items-center gap-px shrink-0">
        {/* 主题切换 */}
        <div className="relative">
          <ToolbarButton 
            icon={<Palette size={16} />} 
            tooltip={themeMeta[currentTheme]?.name || (currentTheme === 'academic' ? '学术蓝' : currentTheme)}
            onClick={() => setShowThemeMenu(!showThemeMenu)} 
            accent
          />
          {showThemeMenu && (
            <>
              <div 
                className="fixed inset-0 z-40" 
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => setShowThemeMenu(false)}
              />
              <div className="absolute top-full right-0 mt-1 py-1 w-48 bg-[var(--editor-surface)] border border-[var(--editor-border)] rounded-lg shadow-lg z-50">
                {themeFiles.map((file) => {
                  const id = file.replace(/\.css$/, '')
                  const name = themeMeta[id]?.name || (id === 'academic' ? '学术蓝' : id)
                  return (
                  <button
                    key={file}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => { setField('currentTheme', id); setShowThemeMenu(false) }}
                    className="w-full px-3 py-2 text-sm text-left text-[var(--editor-text)] hover:bg-[var(--editor-hover)] flex items-center gap-2"
                  >
                    {currentTheme === id && <Check size={14} className="text-[var(--editor-accent)]" />}
                    <span className={currentTheme === id ? 'text-[var(--editor-accent)] font-medium' : ''}>{name}</span>
                  </button>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* 明暗切换 */}
        <ToolbarButton 
          icon={isDark ? <Sun size={16} /> : <Moon size={16} />} 
          tooltip={isDark ? "亮色模式" : "暗色模式"} 
          onClick={onToggleDark} 
          accent
        />

        <ToolbarButton 
          icon={<PanelLeftClose size={16} />} 
          tooltip="切换侧边栏" 
          onClick={onToggleSidebar} 
          accent
        />
        <ToolbarButton icon={<Settings size={16} />} tooltip="设置" onClick={onSettings} accent />
        
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
  accent?: boolean
}

function ToolbarButton({ icon, tooltip, onClick, active, accent }: ToolbarButtonProps) {
  return (
    <button
      onMouseDown={(e) => e.stopPropagation()}
      onClick={onClick}
      title={tooltip}
      className={`
        w-7 h-7 flex items-center justify-center rounded-md
        transition-colors duration-150
        ${active 
          ? 'bg-[var(--editor-accent)] text-white' 
          : accent
            ? 'hover:bg-[var(--editor-hover)] text-[var(--editor-accent)] opacity-80 hover:opacity-100'
            : 'hover:bg-[var(--editor-hover)] text-[var(--editor-text)] opacity-80 hover:opacity-100'
        }
      `}
    >
      {icon}
    </button>
  )
}

function ToolbarDivider() {
  return <div className="w-px h-5 bg-[var(--editor-border)] mx-px shrink-0" />
}

function generateTableMd(rows: number, cols: number): string {
  const header = '| ' + Array.from({length: cols}, (_, i) => `列${i + 1}`).join(' | ') + ' |'
  const sep = '| ' + Array.from({length: cols}, () => '------').join(' | ') + ' |'
  const bodyRows = Array.from({length: rows - 1}, () => 
    '| ' + Array.from({length: cols}, () => '内容').join(' | ') + ' |'
  ).join('\n')
  return '\n' + header + '\n' + sep + '\n' + bodyRows + '\n'
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
