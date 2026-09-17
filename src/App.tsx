import { useState, useEffect, useCallback, useRef } from 'react'
import Toolbar from './components/Toolbar'
import Sidebar from './components/Sidebar'
import Editor, { EditorRef } from './components/Editor'
import StatusBar from './components/StatusBar'
import SettingsModal from './components/SettingsModal'
import TabBar from './components/TabBar'
import HomePage from './components/HomePage'
import Slideshow from './components/Slideshow'
import AIChatPanel from './components/AIChatPanel'
import { PanelLeftClose, PanelLeft } from 'lucide-react'
import { invokeTauri, invokeTauriOrThrow } from './lib/tauri'
import { openRemote, save as saveToCloud, notifyRemoteDirChanged } from './lib/webdav'
import { parentPath, joinPath, baseName, canonicalRemotePath } from './lib/remotePath'
import { saveActiveTab, markConflictResolved, dirOf } from './lib/saveRouter'
import Dialog from './components/Dialog'
import { useSettingsStore } from './stores/settingsStore'
import { loadKeybindings, resolveAction, getKeybindingsMap, formatKey, SHORTCUT_ACTIONS } from './lib/keybindings'
import { useEditorStore } from './stores/editorStore'
import { loadPlugin, unloadPlugin } from './plugins/registry'
import { useI18n, translate, getCurrentLang } from './i18n'
import { refreshThemeCursorVars } from './lib/themeCursor'
// 导出 PDF 用的内联样式（globals.css 已包含 Tailwind prose / 编辑器排版；KaTeX 样式保证公式还原）
import globalsCss from './styles/globals.css?inline'
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

function App() {
  const { t } = useI18n()
  const { currentTheme, isDark, fontFamily, previewFontFamily, fontSize, lineHeight, previewFontSize, previewLineHeight, enabledPlugins, pluginConfigs, setField, aiPanelOpen, updateSettings, userThemeEnabled, userThemeName } = useSettingsStore()
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
  const [showShortcutsPanel, setShowShortcutsPanel] = useState(false)
  const [isSlideshow, setIsSlideshow] = useState(false)
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

  // 动态加载主题 CSS + user.css（串行，确保顺序和特异性正确）
  useEffect(() => {
    const loadStyles = async () => {
      try {
        const tauri = (window as any).__TAURI_INTERNALS__
        if (!tauri || typeof tauri.invoke !== 'function') return

        // 第一步：加载并注入主题 CSS
        const themeCss = await tauri.invoke('read_theme_css', { name: `${currentTheme}.css` }) as string
        if (themeCss) {
          // 自动将 CSS 中的主题选择器替换为当前 theme-{currentTheme}
          const selectorMatch = themeCss.match(/(:root)?\.theme-([a-zA-Z0-9_-]+)/)
          let processedTheme = themeCss
          if (selectorMatch) {
            const detectedName = selectorMatch[2]
            if (detectedName !== currentTheme) {
              processedTheme = themeCss
                .replace(new RegExp(`:root\.theme-${detectedName}`, 'g'), `:root.theme-${currentTheme}`)
                .replace(new RegExp(`\.theme-${detectedName}(?![a-zA-Z-])`, 'g'), `.theme-${currentTheme}`)
                .replace(new RegExp(`\.theme-${detectedName}\.dark`, 'g'), `.theme-${currentTheme}.dark`)
            }
          }
          let themeEl = document.getElementById('yizimarkdown-theme-css')
          if (!themeEl) { themeEl = document.createElement('style'); themeEl.id = 'yizimarkdown-theme-css'; document.head.appendChild(themeEl) }
          themeEl.textContent = processedTheme
        }

        // 第二步：加载并注入 user.css（排在主题 CSS 之后）
        const userCss = await tauri.invoke('read_user_css') as string
        if (userCss) {
          // 自动提升 :root { } 的特异性为 :root.theme-xxx { }，使变量覆盖能生效
          let processedUser = userCss
            .replace(/:root\s*\{/g, `:root.theme-${currentTheme} {`)
          let userEl = document.getElementById('yizimarkdown-user-css')
          if (!userEl) { userEl = document.createElement('style'); userEl.id = 'yizimarkdown-user-css'; }
          userEl.textContent = processedUser
          document.head.appendChild(userEl)
        }
      } catch {}
    }
    loadStyles()
  }, [currentTheme])

  // 应用字体/排版设置到 CSS 变量
  useEffect(() => {
    if (fontFamily) document.documentElement.style.setProperty('--font-mono', fontFamily)
    if (previewFontFamily) document.documentElement.style.setProperty('--font-sans', previewFontFamily)
    if (fontSize) document.documentElement.style.setProperty('--font-size-base', `${fontSize}px`)
    if (lineHeight) document.documentElement.style.setProperty('--line-height', String(lineHeight))
    if (previewFontSize) document.documentElement.style.setProperty('--preview-font-size', `${previewFontSize}px`)
    if (previewLineHeight) document.documentElement.style.setProperty('--preview-line-height', String(previewLineHeight))
  }, [fontFamily, previewFontFamily, fontSize, lineHeight, previewFontSize, previewLineHeight])

  // 自动保存（仅已保存过的文件）
  const activeTab = useEditorStore(s => s.tabs.find(t => t.id === s.activeTabId) ?? null)
  useEffect(() => {
    if (!activeTab || !activeTab.filePath || activeTab.isSaved) return
    
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
  }, [activeTab?.content, activeTab?.filePath, activeTab?.isSaved])

  const shortcutsReadyRef = useRef(false)

  // 启动时加载快捷键配置
  useEffect(() => {
    loadKeybindings().then(() => shortcutsReadyRef.current = true)
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
        case 'orderedList': editorRef.current?.insertMarkdown('1. ', 'prefix'); break
        case 'blockquote': editorRef.current?.insertMarkdown('> ', 'prefix'); break
        case 'link': editorRef.current?.insertMarkdown('[', 'link'); break
        case 'image': editorRef.current?.insertMarkdown('![', 'link'); break
        case 'codeBlock': editorRef.current?.insertMarkdown('```\n\n```\n'); break
        case 'table': editorRef.current?.insertMarkdown('| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n|  |  |  |\n'); break
        case 'horizontalRule': editorRef.current?.insertMarkdown('\n---\n', 'prefix'); break
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

  // 保存：有路径直接保存，无路径触发另存为
  const handleSaveFile = useCallback(async () => {
    const tab = currentTab()
    if (!tab) return

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
      const filePath = await tauri.invoke('save_file_dialog') as string | null
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
    const { webdavBaseUrl, webdavLastPath } = useSettingsStore.getState()
    if (!webdavBaseUrl) {
      setSettingsDefaultTab('cloud')
      setIsSettingsOpen(true)
      return
    }
    // 已经是云端文档 → 默认路径就填它当前的远程路径（再按一次回车 = 保存回原处）
    // 否则用当前浏览的云端目录 + 文件名
    // 注意必须用 joinPath：webdavLastPath 来自目录条目、带结尾斜杠（/Notes/），
    // 朴素拼接会得到 /Notes//doc.md，导致 tab 记的远程路径与云端列表不一致
    const existing = tab.remote?.path ? canonicalRemotePath(tab.remote.path) : null
    const name = tab.filePath ? (tab.filePath.split(/[\\/]/).pop() || 'untitled.md') : 'untitled.md'
    setCloudSaveError(null)
    setCloudSave({
      tabId: tab.id,
      path: existing ?? joinPath(webdavLastPath || '/', name),
    })
  }, [currentTab])

  const runCloudSave = useCallback(async () => {
    if (!cloudSave) return
    const store = useEditorStore.getState()
    const tab = store.tabs.find(t => t.id === cloudSave.tabId)
    if (!tab) { setCloudSave(null); return }
    const baseUrl = useSettingsStore.getState().webdavBaseUrl
    // 规范化用户手输的路径：折叠重复斜杠、消解 ./..，
    // 否则 tab 上记的远程身份会与云端列表返回的路径不一致，再次打开就会多开一个 tab
    const remotePath = canonicalRemotePath(cloudSave.path)
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

  const handleInsertMarkdown = useCallback((markdown: string, mode?: 'wrap' | 'prefix' | 'link') => {
    // 代码块特殊处理：光标定位到两个 ``` 之间
    if (markdown === '\n```\n\n```\n') {
      editorRef.current?.insertCodeBlock()
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
    setIsSlideshow(true)
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
  // print=true 时附加打印样式（PDF 用）：解除 globals.css 的 html,body{height:100%;overflow:hidden}
  // （否则 WebView2 打印时文档高度被锁死在视口、只出一页），并去掉预览的留白/限宽。
  const buildExportHtml = useCallback((opts?: { print?: boolean }): string => {
    const themeCss = document.getElementById('yizimarkdown-theme-css')?.textContent || ''
    const userCss = document.getElementById('yizimarkdown-user-css')?.textContent || ''
    const previewHtml = document.querySelector('.editor-content')?.innerHTML || ''
    const themeClass = `theme-${currentTheme}${isDark ? ' dark' : ''}`
    // globals.css 的 html,body{height:100%;overflow:hidden} 是应用 UI 用的；
    // 独立导出文件必须解除，否则文档锁死在视口高度、无法滚动
    const extraCss = opts?.print
      ? '@page{margin:18mm}html,body{height:auto!important;overflow:visible!important}body{background:#fff}.editor-content{padding:0!important;max-width:none!important;margin:0!important}'
      : 'html,body{height:auto!important;overflow:visible!important}'
    return `<!DOCTYPE html><html class="${themeClass}"><head><meta charset="utf-8"><style>${globalsCss}</style><style>${katexCss}</style><style>${themeCss}</style><style>${userCss}</style>${extraCss ? `<style>${extraCss}</style>` : ''}</head><body class="${themeClass}"><div class="editor-content prose prose-lg max-w-none theme-${currentTheme}">${previewHtml}</div></body></html>`
  }, [currentTheme, isDark])

  const handleExport = useCallback(async (format: 'html' | 'md' | 'txt' | 'docx' | 'pdf') => {
    const tab = currentTab()
    if (!tab) return

    let baseName = 'document'
    let ext = 'txt'
    if (tab.filePath) {
      baseName = tab.filePath.split('\\').pop()?.replace(/\.[^/.]+$/, '') || 'document'
    }

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
        const accent = (cs.getPropertyValue('--editor-cursor') || '').trim() || (isDark ? '#8ab4f8' : '#0066cc')
        const text = (cs.getPropertyValue('--editor-text') || '').trim() || '#333333'
        const mono = (cs.getPropertyValue('--font-mono') || '').trim() || 'Consolas'
        // 表格样式对齐预览：表头底色 --editor-surface、网格线 --editor-border
        const surface = (cs.getPropertyValue('--editor-surface') || '').trim() || '#f5f5f5'
        const border = (cs.getPropertyValue('--editor-border') || '').trim() || '#dddddd'
        // 用 invokeTauriOrThrow：导出失败必须抛错显示，不能吞错假装成功
        await invokeTauriOrThrow('export_docx', {
          path: savedPath,
          md: tab.content,
          baseDir,
          theme: { accent, text, font: previewFontFamily, monoFont: mono, surface, border },
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
  }, [currentTab, showToast, buildExportHtml, previewFontFamily, isDark])

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
          ) : (
            <Editor 
              ref={editorRef}
              content={content} 
              onChange={updateContent}
              isSearchOpen={isSearchOpen}
              onSearchToggle={handleSearchToggle}
              viewMode={viewMode}
              onCursorChange={(pos) => setCursorPosition({ line: pos.line, column: pos.column })}
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

      {/* 另存到云端：输入远程路径 */}
      <Dialog
        open={cloudSave !== null}
        onClose={() => setCloudSave(null)}
        title={t('cloud.saveToCloudTitle')}
        width={380}
      >
        <label className="text-[12px] text-[var(--editor-text)] block mb-1">{t('cloud.pathLabel')}</label>
        <input
          autoFocus
          value={cloudSave?.path ?? ''}
          onChange={(e) => setCloudSave((s) => (s ? { ...s, path: e.target.value } : s))}
          onKeyDown={(e) => { if (e.key === 'Enter') runCloudSave() }}
          placeholder="/Notes/文档.md"
          className="settings-input w-full mb-2"
          style={{ fontFamily: 'var(--font-mono)' }}
        />
        <p className="text-[11px] text-[var(--sidebar-text)] mb-2">{t('cloud.saveToCloudHint')}</p>
        {cloudSaveError && <p className="text-[11px] text-red-500 mb-2 break-words">{cloudSaveError}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={() => setCloudSave(null)} className="settings-btn-secondary">{t('cloud.cancel')}</button>
          <button
            onClick={runCloudSave}
            disabled={cloudSaveBusy || !cloudSave?.path.trim()}
            className="settings-btn-primary"
            style={cloudSaveBusy || !cloudSave?.path.trim() ? { opacity: 0.5 } : undefined}
          >
            {cloudSaveBusy ? t('cloud.saving') : t('cloud.upload')}
          </button>
        </div>
      </Dialog>
      

      
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
          onExit={() => setIsSlideshow(false)}
        />
      )}
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
