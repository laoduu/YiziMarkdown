import { useState, useEffect, useCallback, useRef } from 'react'
import Toolbar from './components/Toolbar'
import Sidebar from './components/Sidebar'
import Editor, { EditorRef } from './components/Editor'
import StatusBar from './components/StatusBar'
import SettingsModal from './components/SettingsModal'
import TabBar from './components/TabBar'
import HomePage from './components/HomePage'
import Slideshow from './components/Slideshow'
import PptxExportDialog from './components/PptxExportDialog'
import AIChatPanel from './components/AIChatPanel'
import { PanelLeftClose, PanelLeft, Loader2 } from 'lucide-react'
import { invokeTauri, invokeTauriOrThrow } from './lib/tauri'
import { openRemote, save as saveToCloud, notifyRemoteDirChanged } from './lib/webdav'
import { parentPath, joinPath, baseName, canonicalRemotePath } from './lib/remotePath'
import { saveActiveTab, markConflictResolved, dirOf } from './lib/saveRouter'
import Dialog from './components/Dialog'
import { useSettingsStore } from './stores/settingsStore'
import { useUpdateStore } from './stores/updateStore'
import { loadKeybindings, resolveAction, getKeybindingsMap, formatKey, SHORTCUT_ACTIONS } from './lib/keybindings'
import { useEditorStore, editorStorage } from './stores/editorStore'
import {
  onEditorStorageWarning, getLastEditorStorageWarning, resetEditorStorageWarning,
  WEBVIEW2_QUOTA_CHARS,
  type EditorStorageWarning, type EditorStorageUsage, type CleanupResult,
} from './lib/editorStorage'
import { loadPlugin, unloadPlugin } from './plugins/registry'
import { useI18n, translate, getCurrentLang } from './i18n'
import { refreshThemeCursorVars } from './lib/themeCursor'
import { applyThemeStyles } from './lib/themeLoader'
import { deriveDocumentTitle } from './lib/docTitle'
import { deriveExportBaseName } from './lib/exportName'
import CloudSaveDialog from './components/CloudSaveDialog'
import { ContextMenuHost } from './components/ContextMenu'
import UpdateNotice from './components/UpdateNotice'
import { windowOps } from './lib/windowOps'
import { buildDocxPalette } from './lib/docxPalette'
import { collectCodeHighlights } from './lib/docxCodeHighlight'
import { prepareMarkdownForDocx } from './lib/docxPrepare'
import { renderMermaidSvgForExport } from './plugins/built-in/mermaid'
import { buildExportHtml as buildExportDocumentHtml } from './lib/exportHtml'
// 导出 PDF 用的内联样式（globals.css 已包含 Tailwind prose / 编辑器排版；KaTeX 样式保证公式还原）
import globalsCss from './styles/globals.css?inline'
import exportTocCss from './styles/export-toc.css?inline'
import katexCss from 'katex/dist/katex.min.css?inline'

// 打开文件对话框 - Tauri 环境用 Rust 命令，浏览器降级用 HTML input
const openFileDialog = async (): Promise<{ name: string; content: string; filePath?: string } | null> => {
  const tauri = (window as any).__TAURI_INTERNALS__
  if (tauri && typeof tauri.invoke === 'function') {
    try {
      const result = await tauri.invoke('pick_and_read_file')
      if (result && result.content) {
        const filePath = result.path
        const name = filePath.split('\\').pop() || filePath
        return { name, content: result.content, filePath }
      }
    } catch (e) {
      console.warn('Tauri file dialog failed, falling back:', e)
    }
  }

  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.md,.markdown,.txt'
    input.style.display = 'none'
    
    input.onchange = (e) => {
      const target = e.target as HTMLInputElement
      if (target.files && target.files.length > 0) {
        const file = target.files[0]
        const reader = new FileReader()
        reader.onload = (event) => {
          const content = event.target?.result as string
          resolve({ name: file.name, content: content || '' })
        }
        reader.onerror = () => resolve(null)
        reader.readAsText(file)
      } else {
        resolve(null)
      }
      document.body.removeChild(input)
    }
    
    input.oncancel = () => {
      resolve(null)
      document.body.removeChild(input)
    }
    
    document.body.appendChild(input)
    input.click()
  })
}

/** 从磁盘恢复正文的超时上限：网络盘 / 已拔出的移动盘可能长时间不返回，不能让它一直卡住界面 */
const RESTORE_TIMEOUT_MS = 10000
const withTimeout = <T,>(p: Promise<T | null>, ms: number): Promise<T | null> =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms)
    p.then(
      (v) => { clearTimeout(timer); resolve(v) },
      () => { clearTimeout(timer); resolve(null) }
    )
  })

/** 启动后多久去问一次更新：错开启动流程（恢复标签页、加载主题、插件），别抢 WebView 的启动时间 */
const STARTUP_UPDATE_DELAY_MS = 3000

function App() {
  const { t } = useI18n()
  const { currentTheme, isDark, fontFamily, previewFontFamily, fontSize, lineHeight, previewFontSize, previewLineHeight, contentMaxWidth, enabledPlugins, pluginConfigs, setField, aiPanelOpen, updateSettings, userThemeEnabled, userThemeName, customCssBase, slideColStyle, slideColAlign } = useSettingsStore()
  const {
    activeTabId, currentTab,
    openFile, openRemoteFile, openNewFile, closeTab, switchTab,
    updateContent, markTabSaved, updateTabName, updateTabFilePath,
  } = useEditorStore()
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [cursorPosition, setCursorPosition] = useState({ line: 1, column: 1 })
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [settingsDefaultTab, setSettingsDefaultTab] = useState<string | undefined>(undefined)
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({ message: '', visible: false })
  /** 本地缓存持久化降级 / 写入失败的说明（常驻状态栏，不随时间消失） */
  const [storageWarning, setStorageWarning] = useState<string | null>(null)
  const [showShortcutsPanel, setShowShortcutsPanel] = useState(false)
  const [isSlideshow, setIsSlideshow] = useState(false)
  /** PPTX 导出弹窗：工具栏与演示 HUD 共用。
   *  theme/dark 由**入口**决定 —— HUD 里可能临时切过主题，导出必须与眼前看到的一致。 */
  const [pptxDialog, setPptxDialog] = useState<{
    theme: string
    dark: boolean
    /** HUD 入口才有：0-based 当前页，用于「只导当前页」 */
    currentSlide?: number
  } | null>(null)
  /** 从工具栏「先看演示效果 / 告警跳页」启动演示时的首屏页码（0-based） */
  const [slideshowStart, setSlideshowStart] = useState<number | undefined>(undefined)
  /** 演示已打开时外部请求翻页：token 递增，保证同一页连续点两次也各跳一次 */
  const [slideJump, setSlideJump] = useState<{ index: number; token: number } | undefined>(undefined)
  const slideJumpTokenRef = useRef(0)
  const [currentFolder, setCurrentFolder] = useState<string | null>(null)
  /** 远程冲突待用户决策 */
  const [conflict, setConflict] = useState<{ tabId: string; name: string; remotePath: string } | null>(null)
  /** 另存到云端的路径输入 */
  const [cloudSave, setCloudSave] = useState<{ tabId: string; path: string } | null>(null)
  const [cloudSaveBusy, setCloudSaveBusy] = useState(false)
  const [cloudSaveError, setCloudSaveError] = useState<string | null>(null)
  const editorRef = useRef<EditorRef>(null)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startupDone = useRef(false)
  const prevPluginsRef = useRef<string[]>([])
  const pluginsReadyRef = useRef(false)

  // ===== 在线更新 =====
  // 状态栏那一行提示的数据源；`updateBusy` 同时用于停掉自动保存（见自动保存的 effect，
  // 它必须在这里声明：自动保存的依赖数组里要用到）
  // 只在 `available` 时给版本号 ⇒ 用户「跳过此版本」后状态栏不再提示（那正是跳过的意思），
  // 开始下载/安装后也收回提示，交给「版本与更新」里的卡片
  const updateAvailableVersion = useUpdateStore((s) =>
    s.status === 'available' ? (s.update?.version ?? null) : null
  )
  const updateStatus = useUpdateStore((s) => s.status)
  const updateBusy = updateStatus === 'downloading' || updateStatus === 'installed'

  // 动态加载主题 CSS（含「自定义主题」= 基底主题 + user.css）。
  // 注入逻辑统一在 lib/themeLoader.ts —— 保存自定义 CSS 的路径复用同一函数；
  // 历史上两条路径各写一份，保存那条漏了提权 ⇒ 改了 CSS 保存后毫无反应、必须重启。
  useEffect(() => {
    applyThemeStyles(currentTheme, customCssBase)
  }, [currentTheme, customCssBase])

  // 应用字体/排版设置到 CSS 变量
  useEffect(() => {
    // 字体分三个独立角色，别互相越权（详见 globals.css 的说明）：
    //   --font-editor  ←「编辑器字体」：只作用于源码模式的可编辑内容
    //   --font-preview ←「预览字体」：只作用于预览 / 实时 / 演示模式的内容
    //   --font-ui      软件界面字体，**不由这里写入** —— 内容字体设置不该改到界面文案
    // 另外**不要**写 --font-mono：它的语义是"等宽编程字体"（globals.css 注释与各主题
    // 都按此声明），写进比例字体（默认 MiSans）会让代码块与等宽输入框全部错位。
    if (fontFamily) document.documentElement.style.setProperty('--font-editor', fontFamily)
    if (previewFontFamily) document.documentElement.style.setProperty('--font-preview', previewFontFamily)
    if (fontSize) document.documentElement.style.setProperty('--font-size-base', `${fontSize}px`)
    if (lineHeight) document.documentElement.style.setProperty('--line-height', String(lineHeight))
    if (previewFontSize) document.documentElement.style.setProperty('--preview-font-size', `${previewFontSize}px`)
    if (previewLineHeight) document.documentElement.style.setProperty('--preview-line-height', String(previewLineHeight))
    // 正文列最大宽度：源码(.cm-content) / 实时 / 预览(.editor-content) 共用这一个变量。
    // 只写"上限"，窗口更窄时各面板仍按 flex 自适应收窄，所以这里不需要关心窗口尺寸。
    if (contentMaxWidth) document.documentElement.style.setProperty('--content-max-width', `${contentMaxWidth}px`)
  }, [fontFamily, previewFontFamily, fontSize, lineHeight, previewFontSize, previewLineHeight, contentMaxWidth])

  // 自动保存（仅已保存过的文件）
  const activeTab = useEditorStore(s => s.tabs.find(t => t.id === s.activeTabId) ?? null)
  /**
   * 正文还没从磁盘恢复回来的活动标签页（只有「本地缓存配额降级」后才会出现）。
   * 此刻内存里的内容是占位空串，所以恢复完成前**不能挂编辑器、也不能保存**。
   */
  const activePending = useEditorStore(s => s.pendingContentLoads.find(p => p.id === s.activeTabId) ?? null)
  useEffect(() => {
    if (!activeTab || !activeTab.filePath || activeTab.isSaved) return
    // 正文待恢复时禁止自动保存：内容还是占位空串，写下去就是把文件清空
    if (activePending) return
    // 下载 / 安装更新期间不自动保存：安装器要替换磁盘上的程序文件，别和它抢时间。
    // 正文是**每次按键**就落 localStorage 的（见 lib/editorStorage.ts），停掉自动保存不会丢内容；
    // 手动 Ctrl+S 照常（那是明确意图，不该被拦住）。依赖里带上它 ⇒ 状态一变就清掉待执行的定时器，
    // 也就是「安装前清掉 autoSaveTimerRef」这条要求。
    if (updateBusy) return
    
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    
    const { autoSave, autoSaveInterval } = useSettingsStore.getState()
    if (!autoSave) return
    
    autoSaveTimerRef.current = setTimeout(async () => {
      const tab = useEditorStore.getState().currentTab()
      if (!tab?.filePath) return
      // 注意：不能用组件作用域的 t()（每次渲染都会重建，加进依赖会让防抖永不触发），
      // 这里用模块级 translate + 当前语言，闭包稳定。
      const tr = (key: string, params?: Record<string, string | number>) =>
        translate(getCurrentLang(), key, params)
      const result = await saveActiveTab(tab, { auto: true })
      if (result.ok) {
        if (result.imagesFailed > 0) showToast(tr('cloud.imagesFailed', { count: result.imagesFailed }))
      } else if (result.conflict) {
        // 自动保存遇冲突不弹窗打断输入，提示用户手动保存以决策
        showToast(tr('cloud.conflictAutoHint'))
      } else if (result.error && result.error !== 'in-flight' && result.error !== 'no-path') {
        showToast(tr('cloud.saveFailed', { msg: result.error }))
      }
    }, autoSaveInterval)
    
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    }
  }, [activeTab?.content, activeTab?.filePath, activeTab?.isSaved, activePending?.id, updateBusy])

  const shortcutsReadyRef = useRef(false)

  // 启动时加载快捷键配置
  useEffect(() => {
    loadKeybindings().then(() => shortcutsReadyRef.current = true)
  }, [])

  // 屏蔽 webview 原生右键菜单（v0.3.4 右键菜单体系）：
  // capture 阶段统一 preventDefault，各功能区再用自定义菜单（ContextMenuHost）接管；
  // 编辑器内容与所有输入框豁免 —— 原生菜单里的复制/粘贴在 WebView2 里无法用 JS 可靠复刻。
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, [contenteditable="true"], [contenteditable=""]')) return
      e.preventDefault()
    }
    document.addEventListener('contextmenu', onContextMenu, true)
    return () => document.removeEventListener('contextmenu', onContextMenu, true)
  }, [])

  // 全局快捷键（通过 keybindings 模块统一管理）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!shortcutsReadyRef.current) return
      const actionId = resolveAction(e)
      if (!actionId) return

      // 编辑器级 action（undo/redo/search）交给 CodeMirror keymap 处理
      if (['undo', 'redo'].includes(actionId)) return

      e.preventDefault()

      switch (actionId) {
        case 'search': handleSearchToggle(); break
        case 'newFile': handleNewFile(); break
        case 'openFile': handleOpenFile(); break
        case 'save': handleSaveFile(); break
        case 'saveAs': handleSaveAs(); break
        case 'closeTab':
          if (activeTabId) {
            const tab = useEditorStore.getState().currentTab()
            if (tab && !tab.isSaved) {
              window.dispatchEvent(new CustomEvent('tab-close-request', { detail: activeTabId }))
            } else {
              closeTab(activeTabId)
            }
          }
          break
        case 'toggleSidebar': setSidebarVisible(v => !v); break
        case 'toggleTheme': setField('isDark', !useSettingsStore.getState().isDark); break
        case 'showShortcuts': setShowShortcutsPanel(v => !v); break
        case 'slashMenu': {
          const ev = new CustomEvent('slash-menu-keyboard-trigger')
          window.dispatchEvent(ev)
          break
        }
        case 'toggleFullscreen': { void windowOps.toggleFullscreen(); break }
        case 'toggleDevtools': {
          const tauri = (window as any).__TAURI_INTERNALS__
          if (tauri && tauri.invoke) {
            tauri.invoke('plugin:window|toggle_devtools', { label: 'main' }).catch(() => {})
          }
          break
        }
        case 'presentSlides': startSlideshow(); break
        // 格式化 action：通过 insertMarkdown 注入
        case 'bold': editorRef.current?.insertMarkdown('**', 'wrap'); break
        case 'italic': editorRef.current?.insertMarkdown('*', 'wrap'); break
        case 'strikethrough': editorRef.current?.insertMarkdown('~~', 'wrap'); break
        case 'inlineCode': editorRef.current?.insertMarkdown('`', 'wrap'); break
        case 'heading1': editorRef.current?.insertMarkdown('# ', 'prefix'); break
        case 'heading2': editorRef.current?.insertMarkdown('## ', 'prefix'); break
        case 'heading3': editorRef.current?.insertMarkdown('### ', 'prefix'); break
        case 'unorderedList': editorRef.current?.insertMarkdown('- ', 'prefix'); break
        case 'orderedList': editorRef.current?.insertMarkdown('1. ', 'ordered'); break
        case 'blockquote': editorRef.current?.insertMarkdown('> ', 'prefix'); break
        case 'link': editorRef.current?.insertMarkdown('[', 'link'); break
        case 'image': editorRef.current?.insertMarkdown('![', 'link'); break
        case 'codeBlock': editorRef.current?.insertCodeBlock(); break
        case 'table': editorRef.current?.insertMarkdown('| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n|  |  |  |\n'); break
        case 'horizontalRule': editorRef.current?.insertHorizontalRule(); break
        // 视图循环切换：源代码 → 并排 → 实时 → 预览 → 源代码
        case 'viewCycle': {
          const order = ['edit', 'split', 'live', 'preview'] as const
          const tab = useEditorStore.getState().currentTab()
          const cur = tab?.viewMode || 'edit'
          const idx = order.indexOf(cur)
          useEditorStore.getState().updateViewMode(order[(idx + 1) % order.length])
          break
        }
        // 导出
        case 'exportHtml': handleExport('html'); break
        case 'exportMd': handleExport('md'); break
        case 'exportTxt': handleExport('txt'); break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, []) // eslint-disable-line

  // ===== 启动时加载已启用插件 =====
  useEffect(() => {
    const { enabledPlugins } = useSettingsStore.getState()
    prevPluginsRef.current = [...enabledPlugins]

    // 启动时等待所有插件加载完成
    Promise.all(enabledPlugins.map(id => loadPlugin(id))).then(() => {
      pluginsReadyRef.current = true
      useEditorStore.setState({ _pluginsReady: true })
    })

    // 监听enabledPlugins变化，动态加载/卸载
    const unsub = useSettingsStore.subscribe((state) => {
      const cur = state.enabledPlugins
      const prev = prevPluginsRef.current
      const newIds = cur.filter(id => !prev.includes(id))
      if (newIds.length > 0) {
        Promise.all(newIds.map(id => loadPlugin(id))).then(() => {
          useEditorStore.setState({ _pluginsReady: false })
          requestAnimationFrame(() => useEditorStore.setState({ _pluginsReady: true }))
        })
      }
      for (const id of prev) {
        if (!cur.includes(id)) unloadPlugin(id).catch(() => {})
      }
      prevPluginsRef.current = [...cur]
    })

    return () => unsub()
  }, [])

  // ===== 启动逻辑 =====
  useEffect(() => {
    if (startupDone.current) return
    startupDone.current = true

    const loadStartup = async () => {
      // 等待插件加载完成，确保渲染时插件已就绪
      // 最多等3秒，避免阻塞启动
      const waitPlugins = () => new Promise<void>(resolve => {
        if (pluginsReadyRef.current) { resolve(); return }
        const unsub = useEditorStore.subscribe((s: any) => {
          if (s._pluginsReady) { unsub(); resolve() }
        })
        setTimeout(() => { unsub(); resolve() }, 3000)
      })
      await waitPlugins()

      const cliFile = await invokeTauri<string | null>('get_cli_open_file')

      if (cliFile) {
        // 场景3：双击 .md 文件打开 → 直接打开文件Tab，预览模式
        const result = await invokeTauri<{ content: string; path: string }>('read_file', { path: cliFile })
        if (result && result.content) {
          const tabId = openFile(cliFile, result.content)
          // 切换为预览模式
          useEditorStore.getState().setViewMode(tabId, 'preview')
          const lastSep = Math.max(cliFile.lastIndexOf('\\'), cliFile.lastIndexOf('/'))
          if (lastSep > 0) setCurrentFolder(cliFile.substring(0, lastSep))
        }
        return
      }

      // 检查是否有persist恢复的数据
      const store = useEditorStore.getState()

      // 初次打开：没有任何persist数据
      if (store.tabs.length === 0 && !store.activeTabId && store.recentFiles.length === 0) {
        // 场景1：初次打开 → 加载 welcome.md，预览模式
        const w = await invokeTauri<string>('read_welcome')
        if (w) {
          const tabId = openNewFile(w)
          updateTabName(tabId, 'welcome.md')
          useEditorStore.getState().setViewMode(tabId, 'preview')
        }
        return
      }

      // 场景2：非初次打开 → persist恢复的tabs/activeTabId已经在store里了
      // 如果有活跃tab就保持，否则显示首页
      if (!store.activeTabId || !store.tabs.find(t => t.id === store.activeTabId)) {
        switchTab(null) // 显示首页
      }
    }
    loadStartup()
  }, []) // eslint-disable-line

  // ===== 单实例：注册全局函数供 Rust eval 调用 =====
  useEffect(() => {
    ;(window as any).__singleInstanceOpenFile = async (filePath: string) => {
      if (!filePath) return

      // 路径归一化：统一反斜杠为正斜杠，再做比较
      const normalized = filePath.replace(/\\/g, '/').toLowerCase()

      // 先检查是否已在标签中打开
      const store = useEditorStore.getState()
      const existing = store.tabs.find(
        (t: any) => t.filePath && t.filePath.replace(/\\/g, '/').toLowerCase() === normalized
      )

      if (existing) {
        // 已打开：直接切换到该标签并高亮提醒
        useEditorStore.setState({ activeTabId: existing.id })
        useEditorStore.getState().addRecentFile(filePath)
        return
      }

      // 未打开：读取文件后新建标签
      try {
        const result = await invokeTauri<{ content: string; path: string }>('read_file', { path: filePath })
        if (result && result.content) {
          const tabId = openFile(filePath, result.content)
          useEditorStore.getState().setViewMode(tabId, 'preview')
        }
      } catch (err) {
        console.error('Failed to open file from second instance:', err)
      }

    }

    return () => {
      delete (window as any).__singleInstanceOpenFile
    }
  }, []) // eslint-disable-line

  // 切换activeTab时更新currentFolder
  // 云端文档的 filePath 是本地缓存镜像，不能让它把本地文件树带进缓存目录
  useEffect(() => {
    const tab = currentTab()
    if (tab?.filePath && !tab.remote) {
      const lastSep = Math.max(tab.filePath.lastIndexOf('\\'), tab.filePath.lastIndexOf('/'))
      if (lastSep > 0) setCurrentFolder(tab.filePath.substring(0, lastSep))
    }
  }, [activeTabId])

  // 切换主题class
  useEffect(() => {
    // 动态移除所有 theme-* class，添加当前主题 class
    document.documentElement.classList.forEach((cls) => {
      if (cls.startsWith('theme-')) document.documentElement.classList.remove(cls)
    })
    document.documentElement.classList.add(`theme-${currentTheme}`)
    
    if (isDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [currentTheme, isDark])

  // 主题色光标：主题 CSS 为异步注入，注入完成（或主题/明暗变化）后重算 arrow/standard/bold 三档；
  // 顺带把窗口 1px 系统边框（Windows 11 DWMWA_BORDER_COLOR）同步为主题背景色
  useEffect(() => {
    let raf = 0
    const refresh = () => {
      raf = 0
      refreshThemeCursorVars()
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--editor-bg').trim()
      if (bg) invokeTauri('set_window_border_color', { color: bg })
    }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(refresh) }
    schedule()
    const observer = new MutationObserver(schedule)
    observer.observe(document.head, { childList: true, subtree: true, characterData: true })
    return () => { cancelAnimationFrame(raf); observer.disconnect() }
  }, [currentTheme, isDark, userThemeEnabled, userThemeName])

  // 同步 <html lang>（i18n）
  const uiLang = useSettingsStore((s) => s.language)
  useEffect(() => {
    document.documentElement.lang = uiLang || 'zh'
  }, [uiLang])

  const handleNewFile = useCallback(async () => {
    const { defaultTemplate } = useSettingsStore.getState()
    if (defaultTemplate) {
      // 有默认模板：读取模板内容作为新文档结构
      const content = await invokeTauri<string>('read_template', { name: defaultTemplate })
      openNewFile(content || '')
    } else {
      openNewFile('')
    }
  }, [openNewFile])

  // 从指定模板新建文档
  const handleNewFromTemplate = useCallback(async (templateName: string) => {
    const content = await invokeTauri<string>('read_template', { name: templateName })
    openNewFile(content || '')
  }, [openNewFile])

  const handleOpenFile = useCallback(async () => {
    const result = await openFileDialog()
    if (result) {
      const fullPath = result.filePath || result.name
      openFile(fullPath, result.content)
    }
  }, [openFile])

  const showToast = useCallback((message: string) => {
    setToast({ message, visible: true })
    setTimeout(() => setToast({ message: '', visible: false }), 2000)
  }, [])

  // ===== 本地缓存降级 / 写入失败：必须让用户看见 =====
  // 配额满时 localStorage 会静默拒写（zustand 默认实现不捕获），用户继续打字、重启后才发现
  // 内容没了 —— 这正是本次要修的问题之一。降级只报一次（见 lib/editorStorage.ts），
  // 但状态栏上的提示常驻，不随时间消失。
  useEffect(() => {
    const show = (w: EditorStorageWarning) => {
      const msg = translate(
        getCurrentLang(),
        w.level === 'lost' ? 'app.storageLostUnsaved' : 'app.storageDegraded'
      )
      setStorageWarning(msg)
      showToast(msg)
    }
    // 订阅之前可能就已经降级了：启动期的第一次写入（旧数据迁移）就可能失败，
    // 那时界面还没挂载，事件没人接。补报一次。
    const already = getLastEditorStorageWarning()
    if (already) show(already)
    return onEditorStorageWarning(show)
  }, [showToast])

  // ===== 清理本地缓存：给「配额满」一个出口 =====
  // 只报警不给出路等于只做了一半：普通用户没有开发者工具，撞上配额满只能干看着。
  // reason 在打开时捕获（清理成功后状态栏提示会被撤掉，弹窗里仍要能说明来由）。
  const [storageCleanup, setStorageCleanup] = useState<{
    usage: EditorStorageUsage | null
    reason: string
    /** 本次弹窗里上一次清理的结果；null = 还没清理过 */
    result: CleanupResult | null
    /** 「清空全部缓存」的二次确认已按下 */
    confirmingAll: boolean
  } | null>(null)

  const openStorageCleanup = useCallback(() => {
    setStorageCleanup({
      usage: editorStorage.usage(),
      reason: storageWarning ?? '',
      result: null,
      confirmingAll: false,
    })
  }, [storageWarning])

  const runStorageCleanup = useCallback((mode: 'safe' | 'all') => {
    const result = mode === 'safe' ? editorStorage.dropRecoverableContent() : editorStorage.clearAll()
    if (!result) return
    // 真的腾出空间 ⇒ 撤掉状态栏那条常驻警示，并复位「每级只报一次」：
    // 不复位的话，用户清理完再撞上配额满，反而永远收不到提示了。
    // 一个键都没删掉时（占用来自本应用之外的数据）保留警示 —— 问题还在，提示不该消失。
    if (mode === 'all' || result.removed > 0) {
      resetEditorStorageWarning()
      setStorageWarning(null)
    }
    setStorageCleanup((s) => (s ? { ...s, usage: editorStorage.usage(), result, confirmingAll: false } : s))
  }, [])

  // ===== 在线更新：启动后静默检查一次 =====
  // 只在**真有新版本且没被跳过**时留下痕迹（状态栏版本号右侧那一行）；
  // 「已是最新」与失败都不出声 —— 到「关于 → 在线更新」里才看得到原因（见 stores/updateStore.ts）。
  useEffect(() => {
    const timer = setTimeout(() => { void useUpdateStore.getState().checkOnStartup() }, STARTUP_UPDATE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [])

  // ===== 正文未缓存的标签页：从磁盘恢复 =====
  // 只有「配额降级放弃了可省缓存」后才会出现这种情况。恢复到就绪之前编辑器不挂载，
  // 也禁止保存：此刻内存里是占位空串，一旦写盘就会把用户的文件截断。
  useEffect(() => {
    if (!activePending) return
    let cancelled = false
    const read = activePending.filePath
      ? withTimeout(invokeTauri<{ content: string }>('read_file', { path: activePending.filePath }), RESTORE_TIMEOUT_MS)
      : Promise.resolve(null)

    read.then((result) => {
      // 恢复期间用户可能已经自己动了（在别处关掉该标签页 / 直接开始输入）
      if (cancelled) return
      const store = useEditorStore.getState()
      const tr = (key: string, params?: Record<string, string | number>) =>
        translate(getCurrentLang(), key, params)
      if (result && typeof result.content === 'string') {
        store.setTabContent(activePending.id, result.content)
        if (!activePending.recoverable) {
          // 磁盘上只有最后一次保存的版本：据实标记为已保存（内容与磁盘一致），
          // 并把「未保存的修改没能恢复」明确告诉用户，不让界面看起来什么都没发生
          store.markTabSaved(activePending.id)
          showToast(tr('app.restoreFellBack', { name: activePending.name }))
        }
      } else {
        store.forceCloseTab(activePending.id)
        showToast(tr('app.restoreUnreadable', { name: activePending.name }))
      }
    })
    return () => { cancelled = true }
  }, [activePending?.id, showToast]) // eslint-disable-line react-hooks/exhaustive-deps

  // 保存：有路径直接保存，无路径触发另存为
  const handleSaveFile = useCallback(async () => {
    const tab = currentTab()
    if (!tab) return

    // 正文待从磁盘恢复时禁止保存：此刻内容是占位空串，写盘会把用户的文件清空
    if (useEditorStore.getState().pendingContentLoads.some(p => p.id === tab.id)) {
      showToast(translate(getCurrentLang(), 'app.restoring'))
      return
    }

    if (!tab.filePath) {
      // 无文件名 → 触发另存为
      await handleSaveAs()
      return
    }

    const result = await saveActiveTab(tab)
    if (result.ok) {
      showToast(tab.remote ? t('cloud.savedToCloud', { name: tab.name }) : t('app.saved'))
      if (result.imagesFailed > 0) {
        showToast(t('cloud.imagesFailed', { count: result.imagesFailed }))
      }
    } else if (result.conflict && tab.remote) {
      // 交由用户决策，绝不静默覆盖服务器上的版本
      setConflict({ tabId: tab.id, name: tab.name, remotePath: tab.remote.path })
    } else if (result.error) {
      showToast(t('cloud.saveFailed', { msg: result.error }))
    }
  }, [currentTab, showToast, t])

  const handleSaveAs = useCallback(async () => {
    const tab = currentTab()
    if (!tab) return

    const tauri = (window as any).__TAURI_INTERNALS__
    if (!tauri || typeof tauri.invoke !== 'function') return
    try {
      // 默认名从文档推导：元信息 title → 第一个标题行 → untitled.md
      const defaultName = (deriveDocumentTitle(tab.content) || 'untitled') + '.md'
      const filePath = await tauri.invoke('save_file_dialog', { fileName: defaultName }) as string | null
      if (!filePath) return  // 用户取消
      // 用 OrThrow：写盘失败必须让用户看到，不能静默当作已保存
      await invokeTauriOrThrow<void>('save_file', { path: filePath, content: tab.content })
      const name = filePath.split('\\').pop() || filePath
      updateTabName(tab.id, name)
      updateTabFilePath(tab.id, filePath)
      // 另存为本地文件 = 存一份本地副本：解除远程关联，
      // 否则后续 Ctrl+S 会继续去改云端那份，与用户意图不符
      if (tab.remote) {
        markConflictResolved(tab.remote.path)
        useEditorStore.getState().setTabRemote(tab.id, undefined)
      }
      markTabSaved(tab.id)
      showToast(t('app.savedAs', { name }))
    } catch (e) {
      console.error('[save-as] failed:', e)
      showToast(t('cloud.saveFailed', { msg: e instanceof Error ? e.message : String(e) }))
    }
  }, [currentTab, updateTabName, updateTabFilePath, markTabSaved, showToast, t])

  // 从首页打开最近文件
  const handleOpenRecent = useCallback(async (filePath: string) => {
    const result = await invokeTauri<{ content: string; path: string }>('read_file', { path: filePath })
    if (result && result.content) {
      openFile(filePath, result.content)
    }
  }, [openFile])

  /**
   * 打开云端文档：正文与相对引用的图片都镜像到本地缓存，再按普通 tab 打开。
   * @param opts.reload 冲突弹窗的「放弃本地修改并重新加载」—— 无条件用服务器内容覆盖
   */
  const handleOpenRemote = useCallback(async (remotePath: string, opts?: { reload?: boolean }) => {
    const { webdavBaseUrl } = useSettingsStore.getState()
    if (!webdavBaseUrl) return
    const name = remotePath.split('/').pop() || remotePath
    showToast(t('cloud.opening', { name }))
    try {
      const result = await openRemote(webdavBaseUrl, remotePath)
      openRemoteFile(
        result.cachePath,
        result.content,
        { path: remotePath, etag: result.etag },
        { forceReload: opts?.reload }
      )
      if (result.imagesFailed > 0) {
        showToast(t('cloud.imagesFailed', { count: result.imagesFailed }))
      }
    } catch (e) {
      console.error('[webdav] open failed:', e)
      showToast(t('cloud.openFailed', { name }))
    }
  }, [openRemoteFile, showToast, t])

  /** 冲突处理：用本地版本覆盖服务器 */
  const handleConflictOverwrite = useCallback(async () => {
    if (!conflict) return
    const tab = useEditorStore.getState().tabs.find(t => t.id === conflict.tabId)
    setConflict(null)
    if (!tab) return
    markConflictResolved(conflict.remotePath)
    // 清掉 ETag 再存：不带 If-Match 即无条件覆盖
    useEditorStore.getState().setTabRemote(tab.id, { path: conflict.remotePath, etag: null })
    const result = await saveActiveTab({ ...tab, remote: { path: conflict.remotePath, etag: null } })
    if (result.ok) {
      showToast(t('cloud.savedToCloud', { name: tab.name }))
    } else if (result.error) {
      showToast(t('cloud.saveFailed', { msg: result.error }))
    }
  }, [conflict, showToast, t])

  /** 冲突处理：放弃本地修改，重新从服务器加载 */
  const handleConflictReload = useCallback(async () => {
    if (!conflict) return
    const remotePath = conflict.remotePath
    setConflict(null)
    markConflictResolved(remotePath)
    // reload: 用户已明确选择放弃本地修改，强制用服务器内容覆盖
    await handleOpenRemote(remotePath, { reload: true })
  }, [conflict, handleOpenRemote])

  /** 保存到云端：把当前文档（含相对引用的图片）上传到云端 */
  const handleSaveToCloud = useCallback(() => {
    const tab = currentTab()
    if (!tab) return
    const { webdavBaseUrl, webdavLastPath, webdavSaveLastDir } = useSettingsStore.getState()
    if (!webdavBaseUrl) {
      setSettingsDefaultTab('cloud')
      setIsSettingsOpen(true)
      return
    }
    // 已经是云端文档 → 默认路径就填它当前的远程路径（再按一次回车 = 保存回原处）
    // 否则起始目录优先级：上次云端保存的目录 → 云端浏览器停留目录 → 根
    // 注意必须用 joinPath：webdavLastPath 来自目录条目、带结尾斜杠（/Notes/），
    // 朴素拼接会得到 /Notes//doc.md，导致 tab 记的远程路径与云端列表不一致
    const existing = tab.remote?.path ? canonicalRemotePath(tab.remote.path) : null
    const name = tab.filePath
      ? (tab.filePath.split(/[\\/]/).pop() || 'untitled.md')
      : ((deriveDocumentTitle(tab.content) || 'untitled') + '.md')
    const startDir = webdavSaveLastDir || webdavLastPath || '/'
    setCloudSaveError(null)
    setCloudSave({
      tabId: tab.id,
      path: existing ?? joinPath(startDir, name),
    })
  }, [currentTab])

  /** overridePath：CloudSaveDialog 确认时回传的组合路径（绕开 state 异步更新的时差） */
  const runCloudSave = useCallback(async (overridePath?: string) => {
    if (!cloudSave) return
    const store = useEditorStore.getState()
    const tab = store.tabs.find(t => t.id === cloudSave.tabId)
    if (!tab) { setCloudSave(null); return }
    const baseUrl = useSettingsStore.getState().webdavBaseUrl
    // 规范化用户手输的路径：折叠重复斜杠、消解 ./..，
    // 否则 tab 上记的远程身份会与云端列表返回的路径不一致，再次打开就会多开一个 tab
    const remotePath = canonicalRemotePath(overridePath ?? cloudSave.path)
    if (!remotePath || remotePath === '/') {
      setCloudSaveError(t('cloud.invalidPath'))
      return
    }

    // 目标就是本 tab 已在的远程文件 → 这是「保存」而不是「另存」：
    // 用已有 ETag 走更新（If-Match，带冲突检测），而不是新建（If-None-Match）。
    // 否则支持 If-None-Match 的服务器会把"保存到原处"误报成"文件已存在"。
    const sameTarget = tab.remote
      ? (canonicalRemotePath(tab.remote.path) ?? tab.remote.path) === remotePath
      : false

    setCloudSaveBusy(true)
    setCloudSaveError(null)
    try {
      const result = await saveToCloud(
        baseUrl,
        remotePath,
        tab.content,
        sameTarget ? (tab.remote?.etag ?? null) : null,
        !sameTarget,
        tab.filePath ? dirOf(tab.filePath) : null
      )
      if (result.conflict) {
        if (sameTarget) {
          // 远程被改过：走统一的冲突决策弹窗，而不是当成路径错误
          setCloudSave(null)
          setConflict({ tabId: tab.id, name: tab.name, remotePath })
        } else {
          setCloudSaveError(t('cloud.alreadyExists', { name: remotePath }))
        }
        setCloudSaveBusy(false)
        return
      }

      // 下载镜像以取得 cachePath 与最新 ETag（相对引用的图片也一并镜像到本地缓存）
      const opened = await openRemote(baseUrl, remotePath)

      // **就地**把当前 tab 转成云端文档 —— 不新建、更不关闭：
      // 「保存」不等于「关闭」，用户的 tab 必须留着（也顺带保住滚动位置与撤销历史）
      store.updateTabName(tab.id, baseName(remotePath))
      store.updateTabFilePath(tab.id, opened.cachePath)
      store.setTabRemote(tab.id, { path: remotePath, etag: opened.etag })
      store.markTabSaved(tab.id)

      // 记住本次落点目录：下次「保存到云端」从这里开始，不用从头再点一遍
      useSettingsStore.getState().setField('webdavSaveLastDir', parentPath(remotePath))

      // 通知云端浏览器：该目录多了一个文件，若正在浏览就自动刷新
      notifyRemoteDirChanged(parentPath(remotePath))
      showToast(
        sameTarget
          ? t('cloud.savedToCloud', { name: baseName(remotePath) })
          : t('cloud.uploaded', { name: baseName(remotePath) })
      )
      if (result.imagesFailed) {
        showToast(t('cloud.imagesFailed', { count: result.imagesFailed }))
      }
      setCloudSave(null)
    } catch (e) {
      setCloudSaveError(e instanceof Error ? e.message : String(e))
    }
    setCloudSaveBusy(false)
  }, [cloudSave, showToast, t])

  const handleFileSelect = useCallback(async (path: string) => {
    const result = await invokeTauri<{ content: string; path: string }>('read_file', { path })
    if (result && result.content) {
      openFile(path, result.content)
    }
  }, [openFile])

  const handleInsertMarkdown = useCallback((markdown: string, mode?: 'wrap' | 'prefix' | 'ordered' | 'link' | 'tag' | 'block') => {
    // 代码块特殊处理：光标定位到两个 ``` 之间
    if (markdown === '\n```\n\n```\n') {
      editorRef.current?.insertCodeBlock()
    } else if (markdown === '\n---\n') {
      // 分割线特殊处理：按行插入，不能直接塞 '\n---\n'（会多空段 / 把上一行变成标题）
      editorRef.current?.insertHorizontalRule()
    } else {
      editorRef.current?.insertMarkdown(markdown, mode)
    }
  }, [])

  const handleSearchToggle = useCallback(() => {
    setIsSearchOpen(prev => !prev)
  }, [])

  const handleSettings = useCallback(() => {
    setIsSettingsOpen(prev => !prev)
  }, [])

  // 进入演示模式（幻灯片全屏覆盖层）
  const startSlideshow = useCallback(() => {
    const tab = useEditorStore.getState().currentTab()
    if (!tab) return
    // 从工具栏「演示」进入：永远从第一页开始（清掉上次跳页残留）
    setSlideshowStart(undefined)
    setSlideJump(undefined)
    setIsSlideshow(true)
  }, [])

  /** 从指定页启动演示（PPTX 弹窗的「先看演示效果」/ 告警页码跳转） */
  const presentFromSlide = useCallback((index: number) => {
    setSlideshowStart(Math.max(0, index))
    setSlideJump(undefined)
    setIsSlideshow(true)
  }, [])

  /** 演示已打开时翻到指定页（导出告警里点页码） */
  const jumpToSlide = useCallback((index: number) => {
    slideJumpTokenRef.current += 1
    setSlideJump({ index, token: slideJumpTokenRef.current })
  }, [])

  /** 演示 HUD 的「导出 PPTX」：使用演示内**实际生效**的主题/明暗，而不是应用设置 */
  const openPptxFromSlideshow = useCallback((slideIndex: number, theme: string, dark: boolean) => {
    setPptxDialog({ theme, dark, currentSlide: slideIndex })
  }, [])

  // 将 AI 回复插入到编辑器光标处
  const handleAIInsert = useCallback((text: string) => {
    editorRef.current?.insertMarkdown(text)
  }, [])

  // 将 AI 回复作为新文档打开
  const handleAINewDoc = useCallback((text: string) => {
    openNewFile(text)
  }, [openNewFile])

  // 组装独立文档 HTML：内联全部样式（主题/用户/KaTeX/基础排版），与预览还原度一致。
  // 拼装与打印规则都在 lib/exportHtml.ts，这里只负责把「预览现场」读出来：
  //   · 正文 innerHTML（图片在预览里已转 data URL）
  //   · 正文元素的**内联样式**（预览字体 / 字号 / 行高 / 正文列宽 —— innerHTML 带不走）
  //   · `<html>` 的内联样式（设置面板写入的 CSS 变量，漏搬就会退回主题默认字体字号）
  const buildExportHtml = useCallback((opts?: { print?: boolean }): string => {
    const themeCss = document.getElementById('yizimarkdown-theme-css')?.textContent || ''
    const userCss = document.getElementById('yizimarkdown-user-css')?.textContent || ''
    const contentEl = document.querySelector<HTMLElement>('.editor-content')

    // 大纲：直接从**渲染后的标题元素**取 —— 与正文同源，锚点 id 必然一致，
    // 不必再跑一遍 Markdown（也就不会出现"大纲与正文对不上"）。
    // PDF/打印**不带**侧栏：侧边栏是屏幕导航元素，不该出现在纸面上。
    const outlineItems = contentEl
      ? Array.from(contentEl.querySelectorAll<HTMLElement>('h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]'))
        .map((el) => ({ level: Number(el.tagName.charAt(1)), id: el.id, text: (el.textContent || '').trim() }))
        .filter((it) => it.id && it.text)
      : []

    return buildExportDocumentHtml({
      css: { base: globalsCss, math: katexCss, theme: themeCss, user: userCss, outline: exportTocCss },
      bodyHtml: contentEl?.innerHTML || '',
      bodyClass: contentEl?.className || `editor-content prose prose-lg max-w-none theme-${currentTheme}`,
      bodyStyle: contentEl?.getAttribute('style') || '',
      rootStyle: document.documentElement.getAttribute('style') || '',
      theme: currentTheme,
      isDark,
      outline: opts?.print ? undefined : { title: t('sidebar.outline'), items: outlineItems },
      print: !!opts?.print,
    })
  }, [currentTheme, isDark, t])

  const handleExport = useCallback(async (format: 'html' | 'md' | 'txt' | 'docx' | 'pdf' | 'pptx') => {
    const tab = currentTab()
    if (!tab) return

    // PPTX 不是「立即写盘」：先开弹窗（范围/备注/页脚/超页策略），由弹窗自己选路径再生成。
    // 这里只把「入口主题/明暗」传进去（工具栏入口 = 应用当前设置）。
    if (format === 'pptx') {
      setPptxDialog({ theme: currentTheme, dark: isDark })
      return
    }

    // 有路径沿用文件名；无路径从文档推导（元信息 title → 第一个标题行），推不出用 document
    // 口径见 lib/exportName.ts —— PPTX 弹窗与这里共用同一个函数
    const baseName = deriveExportBaseName({ content: tab.content, filePath: tab.filePath })
    let ext = 'txt'

    switch (format) {
      case 'html': ext = 'html'; break
      case 'md': ext = 'md'; break
      case 'txt': ext = 'txt'; break
      case 'docx': ext = 'docx'; break
      case 'pdf': ext = 'pdf'; break
    }

    // 弹出保存文件对话框
    const savedPath = await invokeTauri<string | null>('save_file_dialog', {
      fileName: baseName + '.' + ext,
      extensions: [ext],
    })

    if (!savedPath) return  // 用户取消

    try {
      if (format === 'docx') {
        // 相对图片以 md 所在目录为基准解析
        const lastSep = tab.filePath ? Math.max(tab.filePath.lastIndexOf('\\'), tab.filePath.lastIndexOf('/')) : -1
        const baseDir = tab.filePath && lastSep >= 0 ? tab.filePath.substring(0, lastSep) : null
        const cs = getComputedStyle(document.documentElement)
        /**
         * 把主题变量解析成具体颜色。
         * 变量值可能是 `var(...)` 链（如 `--font-editor: var(--font-sans)`），
         * 交给浏览器解析后取 computed 值；值非法时浏览器会丢弃，此时用兜底色。
         */
        const probe = document.createElement('span')
        probe.style.display = 'none'
        document.body.appendChild(probe)
        const colorVar = (name: string, fallback: string) => {
          const raw = cs.getPropertyValue(name).trim()
          if (!raw) return fallback
          probe.style.color = ''
          probe.style.color = raw
          if (!probe.style.color) return fallback
          return getComputedStyle(probe).color || fallback
        }
        const accentRaw = colorVar('--editor-cursor', isDark ? '#8ab4f8' : '#0066cc')
        const textRaw = colorVar('--editor-text', '#333333')
        const mono = (cs.getPropertyValue('--font-mono') || '').trim() || 'Consolas'
        // 表格样式对齐预览：表头底色 --editor-surface、网格线 --editor-border
        const surfaceRaw = colorVar('--editor-surface', '#f5f5f5')
        const borderRaw = colorVar('--editor-border', '#dddddd')
        probe.remove()
        // docx 页面恒为白底：暗色主题的亮色正文/近黑底色不可照搬（见 lib/docxPalette.ts），
        // 顺带把 rgb()/#rgb 归一成 #rrggbb（Rust 侧只解析十六进制）
        const palette = buildDocxPalette({
          isDark,
          accent: accentRaw,
          text: textRaw,
          surface: surfaceRaw,
          border: borderRaw,
        })
        // DOCX 只能读 Markdown：先把预览里已经「不是 Markdown」的内容落回可解析形式
        //   · [toc] → 层级项目符号列表
        //   · ```mermaid → SVG data URL（Rust 转 PNG/SVG 嵌入）
        const docxMd = await prepareMarkdownForDocx(
          tab.content,
          enabledPlugins.includes('mermaid')
            ? (code) => renderMermaidSvgForExport(code, (pluginConfigs.mermaid?.theme as string) || 'default')
            : undefined,
        )
        // 用 invokeTauriOrThrow：导出失败必须抛错显示，不能吞错假装成功
        await invokeTauriOrThrow('export_docx', {
          path: savedPath,
          md: docxMd,
          baseDir,
          theme: {
            accent: palette.accent,
            text: palette.text,
            font: previewFontFamily,
            monoFont: mono,
            surface: palette.surface,
            border: palette.border,
            // 预览字号/行高：docx 必须与用户设定的预览排版一致
            // （此前固定 11pt / 1.5 倍行距，与预览的 20px / 2.0 完全不符）
            fontSizePx: previewFontSize,
            lineHeight: previewLineHeight,
            // 代码块语法高亮：直接读预览 DOM（分词与颜色都与预览一致，见该函数注释）。
            // 暗色主题的 token 是给深色页面配的亮色，导出到白底文档要压暗（同 palette 的处理）
            codeHighlights: collectCodeHighlights(document.querySelector('.editor-content'), {
              isDark,
              baseColor: palette.text,
            }),
          },
        })
      } else if (format === 'pdf') {
        await invokeTauriOrThrow('export_pdf', { path: savedPath, html: buildExportHtml({ print: true }) })
      } else {
        let output = ''
        if (format === 'html') {
          // 完整独立 HTML：内联主题/用户/KaTeX 样式，与预览显示一致
          output = buildExportHtml()
        } else if (format === 'md') {
          output = tab.content
        } else {
          output = tab.content
            .replace(/^#{1,6}\s/gm, '')
            .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
            .replace(/\*\*(.+?)\*\*/g, '$1')
            .replace(/\*(.+?)\*/g, '$1')
            .replace(/~~(.+?)~~/g, '$1')
            .replace(/`([^`]+)`/g, '$1')
            .replace(/```[\s\S]*?```/g, '')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
            .replace(/^[-*+]\s/gm, '')
            .replace(/^\d+\.\s/gm, '')
            .replace(/^>\s/gm, '')
            .replace(/\|/g, '')
            .replace(/---/g, '')
        }
        await invokeTauri('save_file', { path: savedPath, content: output })
      }
      showToast(t('app.exported', { name: savedPath.split('\\').pop() || 'file' }))
    } catch (e) {
      console.error('[export] failed:', e)
      showToast(t('app.exportFailed'))
    }
  }, [currentTab, showToast, buildExportHtml, previewFontFamily, isDark, previewFontSize, previewLineHeight, enabledPlugins, pluginConfigs, currentTheme])

  const handleFolderChange = useCallback((folderPath: string) => {
    setCurrentFolder(folderPath)
  }, [])

  const handleNavigateToLine = useCallback((target: { id: string; line: number }) => {
    editorRef.current?.navigateToLine(target)
  }, [])

  // 计算当前活跃tab的信息用于StatusBar
  const tab = currentTab()
  const content = tab?.content || ''
  const filePath = tab?.filePath || null
  const isSaved = tab?.isSaved ?? true
  const viewMode = tab?.viewMode || 'edit'

  // 导出时解析相对图片的基准目录（与 DOCX 导出同一规则：Markdown 文件所在目录）
  const docBaseDir = (() => {
    if (!tab?.filePath) return null
    const sep = Math.max(tab.filePath.lastIndexOf('\\'), tab.filePath.lastIndexOf('/'))
    return sep > 0 ? tab.filePath.substring(0, sep) : null
  })()

  const wordCount = content.length
  const readingTime = Math.max(1, Math.ceil(wordCount / 300))

  // Esc 关闭快捷键大全面板
  useEffect(() => {
    if (!showShortcutsPanel) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowShortcutsPanel(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showShortcutsPanel])

  return (
    <div className="app-container theme-transition">
      <Toolbar 
        onNew={handleNewFile}
        onNewFromTemplate={handleNewFromTemplate}
        onOpen={handleOpenFile}
        onSave={handleSaveFile}
        onToggleSidebar={() => setSidebarVisible(!sidebarVisible)}
        onToggleDark={() => setField('isDark', !isDark)}
        onInsertMarkdown={handleInsertMarkdown}
        onInsertFootnote={() => editorRef.current?.insertFootnote()}
        onSaveAs={handleSaveAs}
        onSaveToCloud={handleSaveToCloud}
        onExport={(format) => { handleExport(format) }}
        onSearch={handleSearchToggle}
        onSettings={handleSettings}
        onPresent={startSlideshow}
        onAIChat={() => updateSettings({ aiPanelOpen: !aiPanelOpen })}
        isDark={isDark}
        onUndo={() => editorRef.current?.undo()}
        onRedo={() => editorRef.current?.redo()}
      />
      
      <TabBar onNew={handleNewFile} onPresent={startSlideshow} />
      
      <div className="app-body">
        <Sidebar 
          visible={sidebarVisible} 
          currentFile={filePath}
          currentFolder={currentFolder}
          content={content}
          onFileSelect={handleFileSelect}
          onFolderChange={handleFolderChange}
          onNavigateToLine={handleNavigateToLine}
          isRemote={!!tab?.remote}
          onOpenRemote={handleOpenRemote}
          onRequestSettings={() => { setSettingsDefaultTab('cloud'); setIsSettingsOpen(true) }}
          activeHeadingId={useEditorStore(s => s.activeHeadingId)}
        />
        
        {/* 内容区（含侧边栏切换按钮） */}
        <div 
          className="relative flex-1 min-w-0 flex flex-col"
          onMouseDown={(e) => {
            // 阻止事件冒泡到外层，防止焦点跑到非编辑元素上
            // 但不阻止默认行为，保留浏览器原生的焦点分配机制
            // （语音输入法依赖 mousedown → focus 事件链来定位输入目标）
            const target = e.target as HTMLElement
            if (!target.closest('input') && !target.closest('textarea') && !target.closest('button')) {
              e.stopPropagation()
            }
          }}
        >
          <button
            onClick={() => setSidebarVisible(!sidebarVisible)}
            className="absolute top-1 left-1 z-10 w-6 h-6 flex items-center justify-center rounded
              text-[var(--editor-text)] opacity-40 hover:opacity-100 hover:bg-[var(--editor-hover)]
              transition-opacity duration-150"
            title={sidebarVisible ? t('app.collapseSidebar') : t('app.expandSidebar')}
          >
            {sidebarVisible ? <PanelLeftClose size={14} /> : <PanelLeft size={14} />}
          </button>

          {/* 首页 or 编辑器 */}
          {activeTabId === null ? (
            <HomePage onOpenFile={handleOpenRecent} />
          ) : activePending ? (
            // 正文正从磁盘恢复：先不挂编辑器 —— 否则空内容会先进 CodeMirror，
            // 等恢复回来的正文再同步过去就与视图对不上了（编辑器有焦点时它还会跳过同步）
            <div
              className="flex-1 flex items-center justify-center gap-2 text-sm"
              style={{ background: 'var(--editor-bg)', color: 'var(--editor-text)', opacity: 0.6 }}
            >
              <Loader2 size={14} className="animate-spin" />
              <span>{t('app.restoring')}</span>
            </div>
          ) : (
            <Editor 
              ref={editorRef}
              content={content} 
              onChange={updateContent}
              isSearchOpen={isSearchOpen}
              onSearchToggle={handleSearchToggle}
              viewMode={viewMode}
              onCursorChange={(pos) => setCursorPosition({ line: pos.line, column: pos.column })}
              onToast={showToast}
            />
          )}
        </div>

        {/* AI 侧边聊天面板（v0.2.0）：与左侧文件/大纲对称的右侧面板 */}
        <AIChatPanel
          open={aiPanelOpen}
          onClose={() => updateSettings({ aiPanelOpen: false })}
          docContent={tab?.content || ''}
          docName={tab?.name || ''}
          onInsert={handleAIInsert}
          onNewDoc={handleAINewDoc}
        />
      </div>
      
      <StatusBar 
        wordCount={wordCount}
        readingTime={readingTime}
        cursorLine={cursorPosition.line}
        cursorColumn={cursorPosition.column}
        filePath={filePath}
        isSaved={isSaved}
        isPreviewMode={viewMode === 'preview'}
        onTogglePreview={(preview: boolean) => useEditorStore.getState().updateViewMode(preview ? 'preview' : 'edit')}
        onToggleSidebar={() => setSidebarVisible(!sidebarVisible)}
        onOpenAbout={() => { setSettingsDefaultTab('about'); setIsSettingsOpen(true) }}
        storageWarning={storageWarning}
        onStorageWarningClick={openStorageCleanup}
        updateVersion={updateAvailableVersion}
      />
      
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)}
        defaultTab={settingsDefaultTab as any}
      />

      {/* 远程冲突：绝不静默覆盖，交由用户决策 */}
      <Dialog
        open={conflict !== null}
        onClose={() => setConflict(null)}
        title={t('cloud.conflictTitle')}
        width={380}
      >
        <p className="text-[13px] text-[var(--editor-text)] mb-2">
          {t('cloud.conflictBody', { name: conflict?.name ?? '' })}
        </p>
        <p className="text-[11px] text-[var(--sidebar-text)] mb-3">{t('cloud.conflictHint')}</p>
        <div className="flex flex-col gap-2">
          <button onClick={handleConflictOverwrite} className="settings-btn-primary">
            {t('cloud.conflictOverwrite')}
          </button>
          <button onClick={handleConflictReload} className="settings-btn-secondary">
            {t('cloud.conflictReload')}
          </button>
        </div>
      </Dialog>

      {/* 清理本地缓存：状态栏那个 ⚠ 点开。「清理已保存文件的缓存」是安全动作；
          「清空全部缓存」会丢掉未保存内容的本地副本，所以要点两下 */}
      <Dialog
        open={storageCleanup !== null}
        onClose={() => setStorageCleanup(null)}
        title={t('app.storageCleanupTitle')}
        width={400}
      >
        {storageCleanup?.reason && (
          <p className="text-[12px] mb-2" style={{ color: 'var(--danger)' }}>{storageCleanup.reason}</p>
        )}
        <p className="text-[13px] text-[var(--editor-text)] mb-3">
          {t('app.storageUsage', {
            chars: (storageCleanup?.usage?.chars ?? 0).toLocaleString(),
            limit: WEBVIEW2_QUOTA_CHARS.toLocaleString(),
          })}
        </p>
        <div className="flex flex-col gap-1.5">
          <button onClick={() => runStorageCleanup('safe')} className="settings-btn-primary">
            {t('app.storageCleanupSafe')}
          </button>
          <p className="text-[11px] text-[var(--sidebar-text)]">{t('app.storageCleanupSafeHint')}</p>

          {!storageCleanup?.confirmingAll ? (
            <button
              onClick={() => setStorageCleanup(s => (s ? { ...s, confirmingAll: true } : s))}
              className="settings-btn-secondary mt-2"
            >
              {t('app.storageCleanupAll')}
            </button>
          ) : (
            <div className="mt-2 flex flex-col gap-1.5">
              <p className="text-[11px]" style={{ color: 'var(--danger)' }}>{t('app.storageCleanupAllHint')}</p>
              <div className="flex gap-2">
                <button onClick={() => runStorageCleanup('all')} className="settings-btn-primary">
                  {t('common.confirm')}
                </button>
                <button
                  onClick={() => setStorageCleanup(s => (s ? { ...s, confirmingAll: false } : s))}
                  className="settings-btn-secondary"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          )}

          {storageCleanup?.result && (
            <p className="mt-2 text-[11px] text-[var(--sidebar-text)]">
              {storageCleanup.result.removed === 0
                ? t('app.storageCleanupNothing')
                : t('app.storageCleanupDone', { chars: storageCleanup.result.freedChars.toLocaleString() })}
            </p>
          )}
        </div>
      </Dialog>

      {/* 另存到云端：目录浏览器式选点（面包屑导航 + 文件夹列表 + 文件名输入） */}
      <CloudSaveDialog
        open={cloudSave !== null}
        initialPath={cloudSave?.path ?? '/'}
        busy={cloudSaveBusy}
        error={cloudSaveError}
        onClose={() => setCloudSave(null)}
        onConfirm={(fullPath) => { void runCloudSave(fullPath) }}
      />
      

      
      {/* 快捷键大全面板 */}
      {showShortcutsPanel && (
        <>
          <div className="fixed inset-0 z-[9000]" onClick={() => setShowShortcutsPanel(false)} />
          <div 
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[9001]
              w-[720px] max-h-[80vh] overflow-y-auto rounded-2xl shadow-2xl border border-[var(--editor-border)]
              bg-[var(--editor-bg)] text-[var(--editor-text)] px-8 py-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <div>
                <h2 className="text-lg font-bold tracking-tight" style={{ color: 'var(--editor-text)' }}>{t('app.shortcutsTitle')}</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--sidebar-text)' }}>{t('app.shortcutsHint')}</p>
              </div>
              <button 
                onClick={() => setShowShortcutsPanel(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
                style={{ color: 'var(--sidebar-text)', background: 'transparent' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--editor-hover)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                title={t('app.closeF1')}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M3 3l8 8M11 3l-8 8"/>
                </svg>
              </button>
            </div>
            <ShortcutsPanel />
          </div>
        </>
      )}
      {/* 手动更新提示（macOS / 便携版）：右下角卡片，Windows 安装版不会出现 */}
      <UpdateNotice />

      {toast.visible && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 px-4 py-2 bg-[var(--editor-text)] text-[var(--editor-bg)] text-sm rounded-lg shadow-lg z-[9999] pointer-events-none transition-opacity duration-300">
          {toast.message}
        </div>
      )}

      {/* 演示模式：应用内全屏覆盖层 */}
      {isSlideshow && (
        <Slideshow
          content={tab?.content || ''}
          title={tab?.name || ''}
          enabledPlugins={enabledPlugins}
          pluginConfigs={pluginConfigs}
          currentTheme={currentTheme}
          isDark={isDark}
          initialSlide={slideshowStart}
          jumpRequest={slideJump}
          interactionSuspended={pptxDialog !== null}
          onExportPptx={openPptxFromSlideshow}
          onExit={() => {
            setIsSlideshow(false)
            setSlideshowStart(undefined)
            setSlideJump(undefined)
            setPptxDialog(null)
          }}
        />
      )}

      {/* 导出 PPTX：工具栏 / 演示 HUD 共用同一个弹窗（弹窗内部先选路径再生成） */}
      {pptxDialog && tab && (
        <PptxExportDialog
          open
          onClose={() => setPptxDialog(null)}
          source={{
            content: tab.content,
            // 标题走与 DOCX 导出同一套推导（元信息 title → 第一个标题行），
            // 不再用 tab.name —— 未保存文档的 tab.name 是「未命名新文件」，
            // 会被当成演示标题，也会成为 PPTX 文档属性里的标题
            title: deriveDocumentTitle(tab.content) || '',
            filePath: tab.filePath,
            theme: pptxDialog.theme,
            dark: pptxDialog.dark,
            customCssBase,
            colStyle: slideColStyle,
            colAlign: slideColAlign,
            enabledPlugins,
            pluginConfigs,
            docBaseDir,
            currentSlide: pptxDialog.currentSlide,
          }}
          onPreview={() => {
            setPptxDialog(null)
            presentFromSlide(0)
          }}
          onJumpToSlide={(index) => {
            setPptxDialog(null)
            if (isSlideshow) jumpToSlide(index)
            else presentFromSlide(index)
          }}
        />
      )}

      {/* 全应用共享右键菜单宿主（各功能区 openContextMenu 弹出） */}
      <ContextMenuHost />
    </div>
  )
}


// 快捷键大全面板内容组件（读取实时配置，非写死）
function ShortcutsPanel() {
  const { t } = useI18n()
  const map = getKeybindingsMap()
  const categories = [...new Set(SHORTCUT_ACTIONS.map(a => a.categoryKey))]
  return (
    <div className="mt-4 space-y-5">
      {categories.map(cat => (
        <div key={cat}>
          <h3 className="text-[11px] font-semibold uppercase tracking-widest mb-2.5" style={{ color: 'var(--editor-accent)' }}>{t(cat)}</h3>
          <div className="grid grid-cols-3 gap-2">
            {SHORTCUT_ACTIONS.filter(a => a.categoryKey === cat && a.defaultKey).map(action => {
              const key = formatKey(map[action.id] || action.defaultKey)
              return (
                <div
                  key={action.id}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-default select-none"
                  style={{
                    borderColor: 'var(--editor-border)',
                    background: 'var(--editor-surface)',
                    transition: 'background 0.15s'
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--editor-hover)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--editor-surface)' }}
                >
                  <kbd
                    className="text-[11px] font-mono font-medium px-2 py-0.5 rounded shrink-0"
                    style={{
                      color: 'var(--editor-text)',
                      background: 'var(--editor-bg)',
                      border: '1px solid var(--editor-border)'
                    }}
                  >{key}</kbd>
                  <span className="text-[13px] truncate" style={{ color: 'var(--editor-text)' }}>{t(action.labelKey)}</span>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

export default App
