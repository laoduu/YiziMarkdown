import { useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { 
  FilePlus2,
  SaveAll, 
  FolderOpen, 
  Save,
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
  Superscript,
  TextQuote,
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
  Columns2,
  FunctionSquare,
  CheckSquare,
  FileText as FileTextIcon,
  Palette,
  Check,
  Presentation,
  BookOpen,
  Bot,
  ChevronsLeft,
  ChevronsRight,
  Download,
  LayoutTemplate,
  CloudUpload,
  Square,
  X,
  Maximize,
} from 'lucide-react'
import WindowControls from './WindowControls'
import { windowOps } from '../lib/windowOps'
import { openContextMenu } from './ContextMenu'
import { useWindowStateStore } from '../stores/windowStateStore'
import { useSettingsStore } from '../stores/settingsStore'
import { orderThemes } from '../lib/themeOrder'
import { CUSTOM_THEME, readUserCss } from '../lib/themeLoader'
import { loadThemeCatalog } from '../lib/themeCatalog'
import { COLUMN_REGION_SNIPPET } from '../lib/slides'
import { useI18n } from '../i18n'
import LinkModal from './LinkModal'
import ImageModal from './ImageModal'

interface ToolbarProps {
  onNew: () => void
  onNewFromTemplate: (templateName: string) => void
  onOpen: () => void
  onSave: () => void
  onSaveAs: () => void
  /** 另存到云端（WebDAV） */
  onSaveToCloud: () => void
  onToggleSidebar: () => void
  onToggleDark: () => void
  onInsertMarkdown: (markdown: string, mode?: 'wrap' | 'prefix' | 'ordered' | 'link' | 'tag' | 'block') => void
  /** 插入脚注（正文 [^n] + 文末定义行），逻辑在编辑器内（EditorRef.insertFootnote） */
  onInsertFootnote: () => void
  onExport: (format: 'html' | 'md' | 'txt' | 'docx' | 'pdf' | 'pptx') => void
  onSearch: () => void
  onSettings: () => void
  onPresent: () => void
  onRead: () => void
  onAIChat: () => void
  isDark: boolean
  onUndo?: () => void
  onRedo?: () => void
}

/** 格式工具栏自动收折阈值：窗口内宽低于此值自动收起。
 *  实测（playwright @1400px）全量展开需 ≈1310px（brand 109 + 文件按钮区 + 格式条 533
 *  + 右组 + 窗口控件 144 + 间距/内边距），低于它必然拥挤 —— 阈值取 1320，「放得下才展开」。
 *  1320 以下若用户手动展开，则进入压缩带：格式条参与 flex 压缩（见 .fmt-strip，
 *  刻意不加 flex-shrink:0），品牌名同时缩为 YiziMD（见 .brand-name）。 */
const AUTO_COLLAPSE_THRESHOLD = 1320

export default function Toolbar({
  onNew, onNewFromTemplate, onOpen, onSave, onSaveAs, onSaveToCloud, onToggleSidebar, onToggleDark, onUndo, onRedo,
  onInsertMarkdown, onInsertFootnote, onExport, onSearch, onSettings, onPresent, onRead, onAIChat,
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
  const [showMathMenu, setShowMathMenu] = useState(false)
  const [mathMenuPos, setMathMenuPos] = useState({top: 0, left: 0})
  const [showCodeMenu, setShowCodeMenu] = useState(false)
  const [codeMenuPos, setCodeMenuPos] = useState({top: 0, left: 0})
  const codeHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tableHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mathHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [showThemeMenu, setShowThemeMenu] = useState(false)
  const { currentTheme, setField, formatManuallyCollapsed } = useSettingsStore()
  const [themeFiles, setThemeFiles] = useState<string[]>([])
  const [themeMeta, setThemeMeta] = useState<Record<string, { name: string }>>({})
  // 「自定义主题」条目：user.css 非空时才出现在主题菜单末尾（与设置-外观同一逻辑）
  const [hasUserCss, setHasUserCss] = useState(false)
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [showImageModal, setShowImageModal] = useState(false)

  // 格式工具栏收折状态：两个来源任一为真即收起 ——
  // - widthCollapsed：宽度自动策略，只随窗口 resize 变化（防 icon 挤压）
  // - formatManuallyCollapsed：用户主动收折，持久化于 settingsStore，无视宽窄保持收起，
  //   直到用户主动展开时清除 —— 此后回到宽度自动策略
  const [widthCollapsed, setWidthCollapsed] = useState(window.innerWidth < AUTO_COLLAPSE_THRESHOLD)
  const isFormatCollapsed = formatManuallyCollapsed || widthCollapsed

  // 窗口物理宽度是否低于阈值（只随 resize 变化，手动展开不改动它）：
  // 驱动品牌名 YiziMarkdown ⇄ YiziMD —— 仅在「格式条展开 && 物理窄窗」（即压缩带）时缩名让位
  const [viewportNarrow, setViewportNarrow] = useState(window.innerWidth < AUTO_COLLAPSE_THRESHOLD)

  // 动画序号：收折/展开任一状态变化都 +1，重挂载内容行以重放级联
  //（展开 = 依次浮现，收折 = 逆向依次退场，见 globals.css .fmt-cascade）。
  // 初始 0 = 应用启动不播动画（首次出现不抢戏）。
  // 用 useLayoutEffect（非 useEffect）：重挂载必须发生在状态切换首帧绘制之前，
  // 否则旧内容会先画一帧再被级联替掉 —— 肉眼可见的闪一下。
  const [animSeq, setAnimSeq] = useState(0)
  const fmtInnerRef = useRef<HTMLDivElement>(null)
  const prevCollapsedRef = useRef(isFormatCollapsed)
  useLayoutEffect(() => {
    if (prevCollapsedRef.current !== isFormatCollapsed) setAnimSeq(s => s + 1)
    prevCollapsedRef.current = isFormatCollapsed
  }, [isFormatCollapsed])

  // 级联标号：给内容行每个子元素标 --i（正向序）与 --ri（反向序）——
  // 展开按 --i 自左向右浮现，收折按 --ri 自右向左退回。useLayoutEffect 保证首帧前就绪。
  useLayoutEffect(() => {
    const el = fmtInnerRef.current
    if (!el) return
    const kids = Array.from(el.children) as HTMLElement[]
    kids.forEach((c, i) => {
      c.style.setProperty('--i', String(i))
      c.style.setProperty('--ri', String(kids.length - 1 - i))
    })
  }, [animSeq])

  // 主题列表：唯一数据源是 Rust `get_theme_catalog`（内置清单 + 用户层合并）。
  // 菜单顺序在这里做一次归位（默认主题排首），见 lib/themeOrder.ts。
  const refreshThemes = useCallback(async () => {
    const catalog = await loadThemeCatalog()
    if (!catalog.themes.length) return
    setThemeFiles(orderThemes(catalog.themes.map((entry) => `${entry.id}.css`)))
    const meta: Record<string, { name: string }> = {}
    for (const entry of catalog.themes) meta[entry.id] = { name: entry.name }
    setThemeMeta(meta)
  }, [])

  // 动态加载主题列表和元信息 + 模板列表
  useEffect(() => {
    const load = async () => {
      try {
        const tauri = (window as any).__TAURI_INTERNALS__
        if (tauri && typeof tauri.invoke === 'function') {
          const tmpl = (await tauri.invoke('list_templates')) as string[]
          if (tmpl) setTemplates(tmpl)
          await refreshThemes()
          readUserCss().then((c) => setHasUserCss(!!c.trim())).catch(() => {})
        }
      } catch {}
    }
    load()
  }, [refreshThemes])

  // user.css 是否非空：每次**打开主题菜单**时重读 —— 保存/清除自定义 CSS 都发生在
  // 设置面板里，Toolbar 无法感知；挂载时读一次会在「清空后菜单条目不消失」上过期
  // （与模板菜单「打开即刷新」同一模式，见 refreshTemplates）
  const refreshUserCssFlag = useCallback(async () => {
    try {
      const c = await readUserCss()
      setHasUserCss(!!c.trim())
    } catch {}
  }, [])

  // 模板列表：设置面板里新建模板后菜单需即时可见，故每次打开菜单都重新读取
  // （同时也能拾取用户直接在模板目录里手动增删的文件）
  const refreshTemplates = useCallback(async () => {
    const tauri = (window as any).__TAURI_INTERNALS__
    if (!tauri || typeof tauri.invoke !== 'function') return
    try {
      const tmpl = (await tauri.invoke('list_templates')) as string[]
      if (tmpl) setTemplates(tmpl)
    } catch {}
  }, [])

  // 空白处双击最大化/还原（mac = 原生全屏切换，随 toggle_window_size 平台语义）
  const handleDoubleClick = useCallback(async () => {
    try { await windowOps.toggleMaximize() } catch {}
  }, [])

  // 平台（顶栏右键菜单按平台裁剪：mac 无「最大化」心智）
  const [isMac, setIsMac] = useState(false)
  useEffect(() => {
    windowOps.getPlatform().then((p) => setIsMac(p === 'macos')).catch(() => {})
  }, [])

  // 窗口宽度检测：widthCollapsed（收折策略）与 viewportNarrow（品牌缩名）都只随 resize 变化 ——
  // 手动收折的持久化状态不参与，放大 / 最大化 / 全屏都不会把「用户主动收起」顶开
  useEffect(() => {
    const handleResize = () => {
      const narrow = window.innerWidth < AUTO_COLLAPSE_THRESHOLD
      setWidthCollapsed(narrow)
      setViewportNarrow(narrow)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <div
      className="toolbar"
      onMouseDown={(e) => {
        if (e.button !== 0) return
        // 全屏中禁止标题栏拖动：全屏窗口被 startDragging 拖走后带着 1920×1080
        // 尺寸漂移出屏（实测 A2），退出全屏才恢复——用户视为「窗口坏掉」
        if (useWindowStateStore.getState().fullscreen) return
        if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('.relative')) return
        // 不能立即 startDragging：OS 拖动循环会吞掉双击的第二次点击（双击最大化因此从未生效）。
        // 位移超过阈值才真正启动拖动（与 TabBar 拖拽同款手法），纯双击不受影响。
        const startX = e.clientX
        const startY = e.clientY
        let dragging = false
        const onMove = (ev: MouseEvent) => {
          if (dragging) return
          if (Math.abs(ev.clientX - startX) < 4 && Math.abs(ev.clientY - startY) < 4) return
          dragging = true
          cleanup()
          const drag = (window as any).__TAURI_START_DRAG
          if (drag) drag()
        }
        const cleanup = () => {
          window.removeEventListener('mousemove', onMove)
          window.removeEventListener('mouseup', onUp)
        }
        const onUp = () => cleanup()
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
      }}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('.relative')) return
        // 全屏中双击 = 无操作（toggleMaximize 会触发原生最大化，留下 40px 底部缝，实测 A4）
        if (useWindowStateStore.getState().fullscreen) return
        handleDoubleClick()
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        // 打开前查一次窗口状态，决定「最大化/还原」与「全屏」标签；mac 无「最大化」项；
        // 全屏中不提供「最大化」项（同名操作会打破全屏几何，实测 A4）
        void Promise.all([windowOps.isMaximized(), windowOps.isFullscreen()]).then(([maxed, fs]) => {
          const items = [
            { key: 'minimize', icon: <Minus size={13} />, label: t('window.minimize'), onClick: () => { void windowOps.minimize() } },
            ...(!isMac && !fs ? [{
              key: 'maximize', icon: <Square size={11} />,
              label: maxed ? t('window.restore') : t('window.maximize'),
              onClick: () => { void windowOps.toggleMaximize() },
            }] : []),
            { key: 'fullscreen', icon: <Maximize size={12} />, label: fs ? t('window.exitFullscreen') : t('window.enterFullscreen'), onClick: () => { void windowOps.toggleFullscreen() } },
            { key: 'close', icon: <X size={13} />, label: t('window.close'), danger: true, separatorBefore: true, onClick: () => { void windowOps.close() } },
          ]
          openContextMenu(e.clientX, e.clientY, items)
        })
      }}
    >
      {/* 左侧：品牌 + 格式按钮，允许溢出裁剪 */}
      <div className="flex items-center gap-px overflow-hidden min-w-0 flex-1">
        {/* 品牌名：压缩带（格式条展开 && 物理窄窗）时 YiziMarkdown ⇄ YiziMD，见 globals.css .brand-name */}
        <span
          className={`brand-name text-[15px] font-extrabold tracking-tight text-[var(--editor-accent)] select-none mr-1.5 shrink-0 ${!isFormatCollapsed && viewportNarrow ? 'short' : ''}`}
        >
          <span className="brand-full-wrap"><span className="brand-full">YiziMarkdown</span></span>
          <span className="brand-short">YiziMD</span>
        </span>
        <ToolbarButton icon={<FilePlus2 size={16} />} tooltip={t('toolbar.newFile')} onClick={onNew} accent />
        <div 
          className="relative flex min-w-0" 
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
            refreshTemplates()
          }}
          onMouseLeave={() => {
            templateHideTimerRef.current = setTimeout(() => {
              setShowTemplateMenu(false)
            }, 100)
          }}
        >
          <ToolbarButton 
            icon={<LayoutTemplate size={16} />} 
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
                <div className="px-3 py-2 text-sm text-[var(--toolbar-fg-muted)]">{t('toolbar.noTemplates')}</div>
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
        <ToolbarButton icon={<CloudUpload size={16} />} tooltip={t('toolbar.saveToCloud')} onClick={onSaveToCloud} accent />
        <div 
          className="relative flex min-w-0" 
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
            icon={<Download size={16} />} 
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
                icon={<FormatBadge letter="H" />} 
                label={t('toolbar.exportHtml')} 
                onClick={() => { onExport('html'); setShowExportMenu(false); }} 
              />
              <ExportMenuItem 
                icon={<FormatBadge letter="M" />} 
                label={t('toolbar.exportMd')} 
                onClick={() => { onExport('md'); setShowExportMenu(false); }} 
              />
              <ExportMenuItem 
                icon={<FormatBadge letter="T" />} 
                label={t('toolbar.exportTxt')} 
                onClick={() => { onExport('txt'); setShowExportMenu(false); }} 
              />
              <ExportMenuItem 
                icon={<FormatBadge letter="W" />} 
                label={t('toolbar.exportDocx')} 
                onClick={() => { onExport('docx'); setShowExportMenu(false); }} 
              />
              <ExportMenuItem 
                icon={<FormatBadge letter="P" />} 
                label={t('toolbar.exportPdf')} 
                onClick={() => { onExport('pdf'); setShowExportMenu(false); }} 
              />
              <ExportMenuItem 
                icon={<FormatBadge letter="S" />} 
                label={t('toolbar.exportPptx')} 
                onClick={() => { onExport('pptx'); setShowExportMenu(false); }} 
              />
            </div>
          )}
        </div>
        <ToolbarDivider />
        <ToolbarButton icon={<Undo2 size={16} />} tooltip={t('toolbar.undo')} onClick={() => onUndo?.()} accent />
        <ToolbarButton icon={<Redo2 size={16} />} tooltip={t('toolbar.redo')} onClick={() => onRedo?.()} accent />
        <ToolbarButton icon={<Search size={16} />} tooltip={t('toolbar.search')} onClick={onSearch} accent />
        <ToolbarDivider />
        {/* 格式工具栏收折按钮（雪佛龙交叉旋转换向，见 globals.css .fmt-chev） */}
        <ToolbarButton
          icon={
            <span className={`fmt-chev ${isFormatCollapsed ? 'collapsed' : ''}`}>
              <ChevronsLeft size={16} className="chev-open" />
              <ChevronsRight size={16} className="chev-close" />
            </span>
          }
          tooltip={isFormatCollapsed ? t('toolbar.expandFormat') : t('toolbar.collapseFormat')}
          onClick={() => {
            if (isFormatCollapsed) {
              // 主动展开：清手动标记并当下展开（widthCollapsed 一并清，否则窄窗下会被宽度策略立刻压回）；此后宽度策略随 resize 重新接管
              setField('formatManuallyCollapsed', false)
              setWidthCollapsed(false)
            } else {
              // 主动收折：持久化，之后无视窗口宽窄（放大 / 最大化 / 全屏都不再自动展开）
              setField('formatManuallyCollapsed', true)
            }
          }}
          accent
        />
        {/* 格式条：始终挂载，用 0fr↔1fr 网格宽度过渡做收折/展开（动画设计见 globals.css .fmt-strip） */}
        <div className={`fmt-strip ${isFormatCollapsed ? '' : 'open'}`}>
          <div
            ref={fmtInnerRef}
            key={animSeq}
            className={animSeq > 0 ? 'fmt-strip-inner fmt-cascade' : 'fmt-strip-inner'}
          >
            <ToolbarButton icon={<Bold size={16} />} tooltip={t('toolbar.bold')} onClick={() => onInsertMarkdown('**', 'wrap')} />
            <ToolbarButton icon={<Italic size={16} />} tooltip={t('toolbar.italic')} onClick={() => onInsertMarkdown('*', 'wrap')} />
            <ToolbarButton icon={<Strikethrough size={16} />} tooltip={t('toolbar.strikethrough')} onClick={() => onInsertMarkdown('~~', 'wrap')} />
            <ToolbarButton icon={<Superscript size={16} />} tooltip={t('toolbar.superscript')} onClick={() => onInsertMarkdown('<sup></sup>', 'tag')} />
            <ToolbarButton icon={<TextQuote size={16} />} tooltip={t('toolbar.footnote')} onClick={onInsertFootnote} />
        <div
          className="relative flex min-w-0"
          onMouseEnter={(e) => {
            if (codeHideTimerRef.current) {
              clearTimeout(codeHideTimerRef.current)
              codeHideTimerRef.current = null
            }
            // 用事件自带 currentTarget 定位，不读 ref —— ref 在收折/展开重挂载后可能短暂失联
            //（回归教训：ref.current 为 null 时菜单落到 (0,0)，currentTarget 永远是活节点）
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
            setCodeMenuPos({ top: rect.bottom + 4, left: rect.left })
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
        <ToolbarButton icon={<ListOrdered size={16} />} tooltip={t('toolbar.orderedList')} onClick={() => onInsertMarkdown('1. ', 'ordered')} />
        <ToolbarButton icon={<CheckSquare size={16} />} tooltip={t('toolbar.taskList')} onClick={() => onInsertMarkdown('- [ ] ', 'prefix')} />
        <ToolbarButton icon={<Quote size={16} />} tooltip={t('toolbar.quote')} onClick={() => onInsertMarkdown('> ', 'prefix')} />
        <ToolbarDivider />
        <ToolbarButton icon={<Link size={16} />} tooltip={t('toolbar.link')} onClick={() => setShowLinkModal(true)} />
        <ToolbarButton icon={<Image size={16} />} tooltip={t('toolbar.image')} onClick={() => setShowImageModal(true)} />
        <div
          className="relative flex min-w-0"
          onMouseEnter={(e) => {
            if (tableHideTimerRef.current) {
              clearTimeout(tableHideTimerRef.current)
              tableHideTimerRef.current = null
            }
            // 定位走 currentTarget，理由同代码块菜单
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
            setTablePickerPos({ top: rect.bottom + 4, left: rect.left })
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
              <div className="text-xs text-[var(--toolbar-fg-muted)] mb-2 h-4">
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
        <div
          className="relative flex min-w-0"
          onMouseEnter={(e) => {
            if (mathHideTimerRef.current) {
              clearTimeout(mathHideTimerRef.current)
              mathHideTimerRef.current = null
            }
            // 定位走 currentTarget，理由同代码块菜单（ref 在重挂载后可能失联）
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
            setMathMenuPos({ top: rect.bottom + 4, left: rect.left })
            setShowMathMenu(true)
          }}
          onMouseLeave={() => {
            mathHideTimerRef.current = setTimeout(() => {
              setShowMathMenu(false)
            }, 100)
          }}
        >
          <ToolbarButton
            icon={<Sigma size={16} />}
            tooltip={t('toolbar.math')}
            onClick={() => {}}
            accent
          />
          {showMathMenu && (
            <div
              className="fixed py-1 w-40 bg-[var(--editor-surface)] border border-[var(--editor-border)] rounded-lg shadow-lg z-50"
              style={{ top: mathMenuPos.top, left: mathMenuPos.left }}
              onMouseEnter={() => {
                if (mathHideTimerRef.current) {
                  clearTimeout(mathHideTimerRef.current)
                  mathHideTimerRef.current = null
                }
              }}
              onMouseLeave={() => {
                setShowMathMenu(false)
              }}
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
          )}
        </div>
        <ToolbarButton icon={<Workflow size={16} />} tooltip={t('toolbar.mermaid')} onClick={() => onInsertMarkdown('\n```mermaid\ngraph LR\n  A[开始] --> B[结束]\n```\n')} />
        <ToolbarButton icon={<Minus size={16} />} tooltip={t('toolbar.horizontalRule')} onClick={() => onInsertMarkdown('\n---\n')} />
        <ToolbarButton icon={<Columns2 size={16} />} tooltip={t('toolbar.columnBreak')} onClick={() => onInsertMarkdown(COLUMN_REGION_SNIPPET, 'block')} />
          </div>
        </div>
      </div>

      {/* 右侧工具组：永远不被压缩 */}
      <div className="flex items-center gap-px shrink-0">
        {/* 主题切换 */}
        <div className="relative">
          <ToolbarButton
            icon={<Palette size={16} />}
            tooltip={themeMeta[currentTheme]?.name || (currentTheme === 'academic' ? t('toolbar.academic') : currentTheme)}
            onClick={() => { setShowThemeMenu(!showThemeMenu); if (!showThemeMenu) { refreshUserCssFlag(); refreshThemes() } }}
            accent
          />
          {showThemeMenu && (
            <>
              <div 
                className="fixed inset-0 z-40" 
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => setShowThemeMenu(false)}
              />
              <div className="theme-menu absolute top-full right-0 mt-1 py-1 w-48 bg-[var(--editor-surface)] border border-[var(--editor-border)] rounded-lg shadow-lg z-50">
                {themeFiles.map((file, idx) => {
                  const id = file.replace(/\.css$/, '')
                  const name = themeMeta[id]?.name || (id === 'academic' ? t('toolbar.academic') : id)
                  return (
                  <button
                    key={file}
                    style={{ '--i': idx } as React.CSSProperties}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => { setField('currentTheme', id); setShowThemeMenu(false) }}
                    className="w-full px-3 py-2 text-sm text-left text-[var(--editor-text)] hover:bg-[var(--editor-hover)] flex items-center gap-2"
                  >
                    {currentTheme === id && <Check size={14} className="text-[var(--editor-accent)]" />}
                    <span className={currentTheme === id ? 'text-[var(--editor-accent)] font-medium' : ''}>{name}</span>
                  </button>
                  )
                })}
                {/* 「自定义主题」= 基底主题 + user.css，user.css 非空时才出现（放最后一条） */}
                {hasUserCss && (
                  <button
                    style={{ '--i': themeFiles.length } as React.CSSProperties}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => { setField('currentTheme', CUSTOM_THEME); setShowThemeMenu(false) }}
                    className="w-full px-3 py-2 text-sm text-left text-[var(--editor-text)] hover:bg-[var(--editor-hover)] flex items-center gap-2 border-t border-[var(--editor-border)] mt-1 pt-2"
                  >
                    {currentTheme === CUSTOM_THEME && <Check size={14} className="text-[var(--editor-accent)]" />}
                    <span className={currentTheme === CUSTOM_THEME ? 'text-[var(--editor-accent)] font-medium' : ''}>{t('settings.customTheme')}</span>
                  </button>
                )}
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
        <ToolbarButton icon={<BookOpen size={16} />} tooltip={t('toolbar.read')} onClick={onRead} accent />
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
        onConfirm={(md) => onInsertMarkdown(`\n${md}\n`)}
      />
    </div>
  )
}

interface ToolbarButtonProps {
  icon: React.ReactNode
  tooltip: string
  onClick: (e: React.MouseEvent) => void
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
        w-7 h-7 flex items-center justify-center rounded-ui
        transition-colors duration-150
        ${active 
          ? 'bg-[var(--toolbar-accent)] text-[var(--on-accent)]' 
          : accent
            ? 'hover:bg-[var(--toolbar-hover)] text-[var(--toolbar-accent)] opacity-80 hover:opacity-100'
            : 'hover:bg-[var(--toolbar-hover)] text-[var(--toolbar-fg)] opacity-80 hover:opacity-100'
        }
      `}
    >
      {icon}
    </button>
  )
}

function ToolbarDivider() {
  return <div className="w-px h-5 bg-[var(--toolbar-border)] mx-px shrink-0" />
}

function generateTableMd(rows: number, cols: number, t: (key: string, params?: Record<string, string | number>) => string): string {
  const header = '| ' + Array.from({length: cols}, (_, i) => `${t('toolbar.column')}${i + 1}`).join(' | ') + ' |'
  const sep = '| ' + Array.from({length: cols}, () => '------').join(' | ') + ' |'
  const bodyRows = Array.from({length: rows - 1}, () => 
    '| ' + Array.from({length: cols}, () => t('toolbar.content')).join(' | ') + ' |'
  ).join('\n')
  return '\n' + header + '\n' + sep + '\n' + bodyRows + '\n'
}

/** 导出格式字母徽标：无衬线大字（SVG text），标准字形、大字号小尺寸清晰；currentColor 跟随主题 */
function FormatBadge({ letter }: { letter: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <text
        x="12" y="12" textAnchor="middle" dominantBaseline="central"
        fontFamily="'Arial','Helvetica','Segoe UI',system-ui,sans-serif"
        fontSize="19" fontWeight={800} fill="currentColor"
      >{letter}</text>
    </svg>
  )
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
