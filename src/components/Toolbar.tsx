import { useState, useCallback, useEffect, useRef } from 'react'
import { 
  FileText,
  FilePlus2,
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
  Code2,
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
  Presentation,
  Bot,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react'
import WindowControls from './WindowControls'
import { useSettingsStore } from '../stores/settingsStore'
import { useI18n } from '../i18n'
import LinkModal from './LinkModal'
import ImageModal from './ImageModal'

interface ToolbarProps {
  onNew: () => void
  onNewFromTemplate: (templateName: string) => void
  onOpen: () => void
  onSave: () => void
  onSaveAs: () => void
  onToggleSidebar: () => void
  onToggleDark: () => void
  onInsertMarkdown: (markdown: string, mode?: 'wrap' | 'prefix' | 'link') => void
  onExport: (format: 'html' | 'md' | 'txt') => void
  onSearch: () => void
  onSettings: () => void
  onPresent: () => void
  onAIChat: () => void
  isDark: boolean
  onUndo?: () => void
  onRedo?: () => void
}

type WindowCtrl = {
  toggleMaximize: () => Promise<boolean>
  isMaximized: () => Promise<boolean>
} | null

const getTauriWindow = (): WindowCtrl => {
  try {
    const internals = (window as any).__TAURI_INTERNALS__
    if (!internals) return null
    const label = internals.metadata?.currentWindow?.label || 'main'
    const invoke = internals.invoke.bind(internals)
    return {
      toggleMaximize: () => invoke('toggle_window_size'),
      isMaximized: () => invoke('plugin:window|is_maximized', { label }),
    }
  } catch { return null }
}

export default function Toolbar({ 
  onNew, onNewFromTemplate, onOpen, onSave, onSaveAs, onToggleSidebar, onToggleDark, onUndo, onRedo,
  onInsertMarkdown, onExport, onSearch, onSettings, onPresent, onAIChat,
  isDark,
}: ToolbarProps) {
  const { t } = useI18n()
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [exportMenuPos, setExportMenuPos] = useState<{top: number; left: number}>({top: 0, left: 0})
  const exportBtnRef = useRef<HTMLDivElement>(null)
  const exportMenuRef = useRef<HTMLDivElement>(null)
  const exportHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [showTemplateMenu, setShowTemplateMenu] = useState(false)
  const [templateMenuPos, setTemplateMenuPos] = useState({top: 0, left: 0})
  const templateBtnRef = useRef<HTMLDivElement>(null)
  const templateHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [templates, setTemplates] = useState<string[]>([])
  const [showTablePicker, setShowTablePicker] = useState(false)
  const [tablePickerPos, setTablePickerPos] = useState({top: 0, left: 0})
  const [tablePickerSize, setTablePickerSize] = useState({rows: 0, cols: 0})
  const tableBtnRef = useRef<HTMLDivElement>(null)
  const [showMathMenu, setShowMathMenu] = useState(false)
  const [mathMenuPos, setMathMenuPos] = useState({top: 0, left: 0})
  const mathBtnRef = useRef<HTMLDivElement>(null)
  const [showCodeMenu, setShowCodeMenu] = useState(false)
  const [codeMenuPos, setCodeMenuPos] = useState({top: 0, left: 0})
  const codeBtnRef = useRef<HTMLDivElement>(null)
  const codeHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tableHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [showThemeMenu, setShowThemeMenu] = useState(false)
  const { currentTheme, setField } = useSettingsStore()
  const [themeFiles, setThemeFiles] = useState<string[]>([])
  const [themeMeta, setThemeMeta] = useState<Record<string, { name: string }>>({})
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [showImageModal, setShowImageModal] = useState(false)

  // 格式工具栏收折状态
  const [isFormatCollapsed, setIsFormatCollapsed] = useState(false)
  const AUTO_COLLAPSE_THRESHOLD = 900

  // 动态加载主题列表和元信息 + 模板列表
  useEffect(() => {
    const load = async () => {
      try {
        const tauri = (window as any).__TAURI_INTERNALS__
        if (tauri && typeof tauri.invoke === 'function') {
          const [files, json, tmpl] = await Promise.all([
            tauri.invoke('list_themes') as Promise<string[]>,
            tauri.invoke('read_theme_json') as Promise<string>,
            tauri.invoke('list_templates') as Promise<string[]>,
          ])
          if (files) setThemeFiles(files)
          try { setThemeMeta(JSON.parse(json || '{}')) } catch {}
          if (tmpl) setTemplates(tmpl)
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

  // 窗口宽度检测，自动收折/展开格式工具栏
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth
      if (width < AUTO_COLLAPSE_THRESHOLD) {
        setIsFormatCollapsed(true)
      } else {
        setIsFormatCollapsed(false)
      }
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
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
        <ToolbarButton icon={<FileText size={16} />} tooltip={t('toolbar.newFile')} onClick={onNew} accent />
        <div 
          className="relative" 
          ref={templateBtnRef}
          onMouseEnter={() => {
            if (templateHideTimerRef.current) {
              clearTimeout(templateHideTimerRef.current)
              templateHideTimerRef.current = null
            }
            if (templateBtnRef.current) {
              const rect = templateBtnRef.current.getBoundingClientRect()
              setTemplateMenuPos({ top: rect.bottom + 4, left: rect.left })
            }
            setShowTemplateMenu(true)
          }}
          onMouseLeave={() => {
            templateHideTimerRef.current = setTimeout(() => {
              setShowTemplateMenu(false)
            }, 100)
          }}
        >
          <ToolbarButton 
            icon={<FilePlus2 size={16} />} 
            tooltip={t('toolbar.newFromTemplate')} 
            onClick={() => {}}
            accent
          />
          {showTemplateMenu && (
            <div 
              className="fixed py-1 w-52 bg-[var(--editor-surface)] border border-[var(--editor-border)] rounded-lg shadow-lg z-50 max-h-80 overflow-auto"
              style={{ top: templateMenuPos.top, left: templateMenuPos.left }}
              onMouseEnter={() => {
                if (templateHideTimerRef.current) {
                  clearTimeout(templateHideTimerRef.current)
                  templateHideTimerRef.current = null
                }
              }}
              onMouseLeave={() => {
                setShowTemplateMenu(false)
              }}
            >
              {templates.length === 0 ? (
                <div className="px-3 py-2 text-sm text-[var(--editor-text-muted)]">{t('toolbar.noTemplates')}</div>
              ) : templates.map((name) => (
                <ExportMenuItem 
                  key={name} 
                  icon={<FileTextIcon size={14} />} 
                  label={name.replace(/\.md$/, '')} 
                  onClick={() => { onNewFromTemplate(name); setShowTemplateMenu(false); }} 
                />
              ))}
            </div>
          )}
        </div>
        <ToolbarButton icon={<FolderOpen size={16} />} tooltip={t('toolbar.open')} onClick={onOpen} accent />
        <ToolbarButton icon={<Save size={16} />} tooltip={t('toolbar.save')} onClick={onSave} accent />
        <ToolbarButton icon={<SaveAll size={16} />} tooltip={t('toolbar.saveAs')} onClick={onSaveAs} accent />
        <div 
          className="relative" 
          ref={exportBtnRef}
          onMouseEnter={() => {
            if (exportHideTimerRef.current) {
              clearTimeout(exportHideTimerRef.current)
              exportHideTimerRef.current = null
            }
            if (exportBtnRef.current) {
              const rect = exportBtnRef.current.getBoundingClientRect()
              setExportMenuPos({ top: rect.bottom + 4, left: rect.left })
            }
            setShowExportMenu(true)
          }}
          onMouseLeave={() => {
            exportHideTimerRef.current = setTimeout(() => {
              setShowExportMenu(false)
            }, 100)
          }}
        >
          <ToolbarButton 
            icon={<FileUp size={16} />} 
            tooltip={t('toolbar.export')} 
            onClick={() => {}}
            accent
          />
          {showExportMenu && (
            <div 
              ref={exportMenuRef}
              className="fixed py-1 w-52 bg-[var(--editor-surface)] border border-[var(--editor-border)] rounded-lg shadow-lg z-50"
              style={{ top: exportMenuPos.top, left: exportMenuPos.left }}
              onMouseEnter={() => {
                if (exportHideTimerRef.current) {
                  clearTimeout(exportHideTimerRef.current)
                  exportHideTimerRef.current = null
                }
              }}
              onMouseLeave={() => {
                setShowExportMenu(false)
              }}
            >
              <ExportMenuItem 
                icon={<FileCode size={14} />} 
                label={t('toolbar.exportHtml')} 
                onClick={() => { onExport('html'); setShowExportMenu(false); }} 
              />
              <ExportMenuItem 
                icon={<FileTextIcon size={14} />} 
                label={t('toolbar.exportMd')} 
                onClick={() => { onExport('md'); setShowExportMenu(false); }} 
              />
              <ExportMenuItem 
                icon={<FileDown size={14} />} 
                label={t('toolbar.exportTxt')} 
                onClick={() => { onExport('txt'); setShowExportMenu(false); }} 
              />
            </div>
          )}
        </div>
        <ToolbarDivider />
        <ToolbarButton icon={<Undo2 size={16} />} tooltip={t('toolbar.undo')} onClick={() => onUndo?.()} accent />
        <ToolbarButton icon={<Redo2 size={16} />} tooltip={t('toolbar.redo')} onClick={() => onRedo?.()} accent />
        <ToolbarButton icon={<Search size={16} />} tooltip={t('toolbar.search')} onClick={onSearch} accent />
        <ToolbarDivider />
        {/* 格式工具栏收折按钮 */}
        <ToolbarButton 
          icon={isFormatCollapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />} 
          tooltip={isFormatCollapsed ? t('toolbar.expandFormat') : t('toolbar.collapseFormat')} 
          onClick={() => setIsFormatCollapsed(!isFormatCollapsed)} 
          accent
        />
        {!isFormatCollapsed && (
          <>
            <ToolbarButton icon={<Bold size={16} />} tooltip={t('toolbar.bold')} onClick={() => onInsertMarkdown('**', 'wrap')} />
            <ToolbarButton icon={<Italic size={16} />} tooltip={t('toolbar.italic')} onClick={() => onInsertMarkdown('*', 'wrap')} />
            <ToolbarButton icon={<Strikethrough size={16} />} tooltip={t('toolbar.strikethrough')} onClick={() => onInsertMarkdown('~~', 'wrap')} />
        <div 
          className="relative" 
          ref={codeBtnRef}
          onMouseEnter={() => {
            if (codeHideTimerRef.current) {
              clearTimeout(codeHideTimerRef.current)
              codeHideTimerRef.current = null
            }
            if (codeBtnRef.current) {
              const rect = codeBtnRef.current.getBoundingClientRect()
              setCodeMenuPos({ top: rect.bottom + 4, left: rect.left })
            }
            setShowCodeMenu(true)
          }}
          onMouseLeave={() => {
            codeHideTimerRef.current = setTimeout(() => {
              setShowCodeMenu(false)
            }, 100)
          }}
        >
          <ToolbarButton 
            icon={<Code size={16} />} 
            tooltip={t('toolbar.inlineCode')} 
            onClick={() => {}}
          />
          {showCodeMenu && (
            <div 
              className="fixed py-1 w-40 bg-[var(--editor-surface)] border border-[var(--editor-border)] rounded-lg shadow-lg z-50"
              style={{ top: codeMenuPos.top, left: codeMenuPos.left }}
              onMouseEnter={() => {
                if (codeHideTimerRef.current) {
                  clearTimeout(codeHideTimerRef.current)
                  codeHideTimerRef.current = null
                }
              }}
              onMouseLeave={() => {
                setShowCodeMenu(false)
              }}
            >
              <button
                className="w-full px-3 py-1.5 text-left text-[13px] hover:bg-[var(--editor-hover)] flex items-center gap-2"
                onClick={() => { onInsertMarkdown('`', 'wrap'); setShowCodeMenu(false); }}
              >
                <Code size={14} />
                <span>{t('toolbar.inlineCode')}</span>
              </button>
              <button
                className="w-full px-3 py-1.5 text-left text-[13px] hover:bg-[var(--editor-hover)] flex items-center gap-2"
                onClick={() => { onInsertMarkdown('\n```\n\n```\n'); setShowCodeMenu(false); }}
              >
                <Code2 size={14} />
                <span>{t('toolbar.codeBlock')}</span>
              </button>
            </div>
          )}
        </div>
        <ToolbarDivider />
        <ToolbarButton icon={<Heading1 size={16} />} tooltip={t('toolbar.heading1')} onClick={() => onInsertMarkdown('# ', 'prefix')} />
        <ToolbarButton icon={<Heading2 size={16} />} tooltip={t('toolbar.heading2')} onClick={() => onInsertMarkdown('## ', 'prefix')} />
        <ToolbarButton icon={<Heading3 size={16} />} tooltip={t('toolbar.heading3')} onClick={() => onInsertMarkdown('### ', 'prefix')} />
        <ToolbarDivider />
        <ToolbarButton icon={<List size={16} />} tooltip={t('toolbar.unorderedList')} onClick={() => onInsertMarkdown('- ', 'prefix')} />
        <ToolbarButton icon={<ListOrdered size={16} />} tooltip={t('toolbar.orderedList')} onClick={() => onInsertMarkdown('1. ', 'prefix')} />
        <ToolbarButton icon={<CheckSquare size={16} />} tooltip={t('toolbar.taskList')} onClick={() => onInsertMarkdown('- [ ] ', 'prefix')} />
        <ToolbarButton icon={<Quote size={16} />} tooltip={t('toolbar.quote')} onClick={() => onInsertMarkdown('> ', 'prefix')} />
        <ToolbarDivider />
        <ToolbarButton icon={<Link size={16} />} tooltip={t('toolbar.link')} onClick={() => setShowLinkModal(true)} />
        <ToolbarButton icon={<Image size={16} />} tooltip={t('toolbar.image')} onClick={() => setShowImageModal(true)} />
        <div 
          className="relative" 
          ref={tableBtnRef}
          onMouseEnter={() => {
            if (tableHideTimerRef.current) {
              clearTimeout(tableHideTimerRef.current)
              tableHideTimerRef.current = null
            }
            if (tableBtnRef.current) {
              const rect = tableBtnRef.current.getBoundingClientRect()
              setTablePickerPos({ top: rect.bottom + 4, left: rect.left })
            }
            setTablePickerSize({rows: 0, cols: 0})
            setShowTablePicker(true)
          }}
          onMouseLeave={() => {
            tableHideTimerRef.current = setTimeout(() => {
              setShowTablePicker(false)
            }, 100)
          }}
        >
          <ToolbarButton 
            icon={<Table size={16} />} 
            tooltip={t('toolbar.table')} 
            onClick={() => {}}
            accent
          />
          {showTablePicker && (
            <div 
              className="fixed bg-[var(--editor-surface)] border border-[var(--editor-border)] rounded-lg shadow-lg z-50 p-3"
              style={{ top: tablePickerPos.top, left: tablePickerPos.left }}
              onMouseEnter={() => {
                if (tableHideTimerRef.current) {
                  clearTimeout(tableHideTimerRef.current)
                  tableHideTimerRef.current = null
                }
              }}
              onMouseLeave={() => {
                setShowTablePicker(false)
              }}
            >
              <div className="text-xs text-[var(--editor-text-muted)] mb-2 h-4">
                {tablePickerSize.rows > 0 ? `${tablePickerSize.rows} × ${tablePickerSize.cols}` : t('toolbar.pickSize')}
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
                          const md = generateTableMd(row, col, t)
                          onInsertMarkdown(md)
                          setShowTablePicker(false)
                        }
                      }}
                    />
                  )
                })}
              </div>
            </div>
          )}
        </div>
        <div className="relative" ref={mathBtnRef}>
          <ToolbarButton 
            icon={<Sigma size={16} />} 
            tooltip={t('toolbar.math')} 
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
                  label={t('toolbar.mathInline')} 
                  onClick={() => { onInsertMarkdown('$', 'wrap'); setShowMathMenu(false) }} 
                />
                <ExportMenuItem 
                  icon={<FunctionSquare size={14} />} 
                  label={t('toolbar.mathBlock')} 
                  onClick={() => { onInsertMarkdown('\n$$\n公式\n$$\n'); setShowMathMenu(false) }} 
                />
              </div>
            </>
          )}
        </div>
        <ToolbarButton icon={<Workflow size={16} />} tooltip={t('toolbar.mermaid')} onClick={() => onInsertMarkdown('\n```mermaid\ngraph LR\n  A[开始] --> B[结束]\n```\n')} />
        <ToolbarButton icon={<Minus size={16} />} tooltip={t('toolbar.horizontalRule')} onClick={() => onInsertMarkdown('\n---\n')} />
          </>
        )}
      </div>

      {/* 右侧工具组：永远不被压缩 */}
      <div className="flex items-center gap-px shrink-0">
        {/* 主题切换 */}
        <div className="relative">
          <ToolbarButton 
            icon={<Palette size={16} />} 
            tooltip={themeMeta[currentTheme]?.name || (currentTheme === 'academic' ? t('toolbar.academic') : currentTheme)}
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
                  const name = themeMeta[id]?.name || (id === 'academic' ? t('toolbar.academic') : id)
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
          tooltip={isDark ? t('toolbar.lightMode') : t('toolbar.darkMode')} 
          onClick={onToggleDark} 
          accent
        />

        <ToolbarButton 
          icon={<PanelLeftClose size={16} />} 
          tooltip={t('toolbar.toggleSidebar')} 
          onClick={onToggleSidebar} 
          accent
        />
        <ToolbarButton icon={<Presentation size={16} />} tooltip={t('toolbar.present')} onClick={onPresent} accent />
        <ToolbarButton icon={<Bot size={16} />} tooltip={t('ai.chatTitle')} onClick={onAIChat} accent />
        <ToolbarButton icon={<Settings size={16} />} tooltip={t('toolbar.settings')} onClick={onSettings} accent />
        
        {/* 窗口控制按钮 */}
        <ToolbarDivider />
        <div className="shrink-0"><WindowControls /></div>
      </div>
      {/* 链接和图片弹窗 */}
      <LinkModal
        open={showLinkModal}
        onClose={() => setShowLinkModal(false)}
        onConfirm={(text, url) => onInsertMarkdown(`[${text}](${url})`, 'link')}
      />
      <ImageModal
        open={showImageModal}
        onClose={() => setShowImageModal(false)}
        onConfirm={(md) => onInsertMarkdown(md)}
      />
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

function generateTableMd(rows: number, cols: number, t: (key: string, params?: Record<string, string | number>) => string): string {
  const header = '| ' + Array.from({length: cols}, (_, i) => `${t('toolbar.column')}${i + 1}`).join(' | ') + ' |'
  const sep = '| ' + Array.from({length: cols}, () => '------').join(' | ') + ' |'
  const bodyRows = Array.from({length: rows - 1}, () => 
    '| ' + Array.from({length: cols}, () => t('toolbar.content')).join(' | ') + ' |'
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
