import { useState, useEffect, useCallback, useRef } from 'react'
import Toolbar from './components/Toolbar'
import Sidebar from './components/Sidebar'
import Editor, { EditorRef } from './components/Editor'
import StatusBar from './components/StatusBar'
import SettingsModal from './components/SettingsModal'
import TabBar from './components/TabBar'
import HomePage from './components/HomePage'
import { PanelLeftClose, PanelLeft } from 'lucide-react'
import { invokeTauri } from './lib/tauri'
import { useSettingsStore } from './stores/settingsStore'
import { loadKeybindings, resolveAction, getKeybindingsMap, formatKey, SHORTCUT_ACTIONS } from './lib/keybindings'
import { useEditorStore } from './stores/editorStore'
import { loadPlugin, unloadPlugin } from './plugins/registry'

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
  const { currentTheme, isDark, fontFamily, previewFontFamily, fontSize, lineHeight, previewFontSize, previewLineHeight, setField } = useSettingsStore()
  const {
    activeTabId, currentTab,
    openFile, openNewFile, closeTab, switchTab,
    updateContent, markAsSaved, updateTabName, updateTabFilePath,
  } = useEditorStore()
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [cursorPosition, setCursorPosition] = useState({ line: 1, column: 1 })
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [settingsDefaultTab, setSettingsDefaultTab] = useState<string | undefined>(undefined)
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({ message: '', visible: false })
  const [showShortcutsPanel, setShowShortcutsPanel] = useState(false)
  const [currentFolder, setCurrentFolder] = useState<string | null>(null)
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
    
    autoSaveTimerRef.current = setTimeout(() => {
      const tab = useEditorStore.getState().currentTab()
      if (tab?.filePath) {
        invokeTauri('save_file', { path: tab.filePath, content: tab.content })
        useEditorStore.getState().markAsSaved()
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
  useEffect(() => {
    const tab = currentTab()
    if (tab?.filePath) {
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

  const handleNewFile = useCallback(() => {
    const { defaultTemplate } = useSettingsStore.getState()
    openNewFile(defaultTemplate || '')
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

    if (tab.filePath) {
      await invokeTauri('save_file', { path: tab.filePath, content: tab.content })
      markAsSaved()
      showToast('已保存')
    } else {
      // 无文件名 → 触发另存为
      await handleSaveAs()
    }
  }, [currentTab, markAsSaved, showToast])

  const handleSaveAs = useCallback(async () => {
    const tab = currentTab()
    if (!tab) return

    const tauri = (window as any).__TAURI_INTERNALS__
    if (tauri && typeof tauri.invoke === 'function') {
      try {
        const filePath = await tauri.invoke('save_file_dialog') as string | null
        if (filePath) {
          await invokeTauri('save_file', { path: filePath, content: tab.content })
          const name = filePath.split('\\').pop() || filePath
          updateTabName(tab.id, name)
          updateTabFilePath(tab.id, filePath)
          markAsSaved()
          showToast('已另存为 ' + name)
        }
      } catch {}
    }
  }, [currentTab, updateTabName, updateTabFilePath, markAsSaved, showToast])

  // 从首页打开最近文件
  const handleOpenRecent = useCallback(async (filePath: string) => {
    const result = await invokeTauri<{ content: string; path: string }>('read_file', { path: filePath })
    if (result && result.content) {
      openFile(filePath, result.content)
    }
  }, [openFile])

  const handleFileSelect = useCallback(async (path: string) => {
    const result = await invokeTauri<{ content: string; path: string }>('read_file', { path })
    if (result && result.content) {
      openFile(path, result.content)
    }
  }, [openFile])

  const handleInsertMarkdown = useCallback((markdown: string, mode?: 'wrap' | 'prefix' | 'link') => {
    editorRef.current?.insertMarkdown(markdown, mode)
  }, [])

  const handleSearchToggle = useCallback(() => {
    setIsSearchOpen(prev => !prev)
  }, [])

  const handleSettings = useCallback(() => {
    setIsSettingsOpen(prev => !prev)
  }, [])

  const handleExport = useCallback(async (format: 'html' | 'md' | 'txt') => {
    const tab = currentTab()
    if (!tab) return

    let output = ''
    let baseName = 'document'
    let ext = 'txt'

    if (tab.filePath) {
      baseName = tab.filePath.split('\\').pop()?.replace(/\.[^/.]+$/, '') || 'document'
    }
    
    switch (format) {
      case 'html':
        const previewElement = document.querySelector('.editor-content')
        output = previewElement?.innerHTML || tab.content
        ext = 'html'
        break
      case 'md':
        output = tab.content
        ext = 'md'
        break
      case 'txt':
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
        ext = 'txt'
        break
    }

    // 弹出保存文件对话框
    const savedPath = await invokeTauri<string | null>('save_file_dialog', {
      fileName: baseName + '.' + ext,
      extensions: [ext],
    })

    if (!savedPath) return  // 用户取消

    // 写入文件
    try {
      await invokeTauri('save_file', { path: savedPath, content: output })
      showToast('已导出 ' + savedPath.split('\\').pop())
    } catch {
      showToast('导出失败')
    }
  }, [currentTab, showToast])

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
        onOpen={handleOpenFile}
        onSave={handleSaveFile}
        onToggleSidebar={() => setSidebarVisible(!sidebarVisible)}
        onToggleDark={() => setField('isDark', !isDark)}
        onInsertMarkdown={handleInsertMarkdown}
        onSaveAs={handleSaveAs}
        onExport={(format) => { handleExport(format) }}
        onSearch={handleSearchToggle}
        onSettings={handleSettings}
        isDark={isDark}
        onUndo={() => editorRef.current?.undo()}
        onRedo={() => editorRef.current?.redo()}
      />
      
      <TabBar onNew={handleNewFile} />
      
      <div className="app-body">
        <Sidebar 
          visible={sidebarVisible} 
          currentFile={filePath}
          currentFolder={currentFolder}
          content={content}
          onFileSelect={handleFileSelect}
          onFolderChange={handleFolderChange}
          onNavigateToLine={handleNavigateToLine}
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
            title={sidebarVisible ? "收起侧边栏" : "展开侧边栏"}
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
                <h2 className="text-lg font-bold tracking-tight" style={{ color: 'var(--editor-text)' }}>快捷键速查</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--sidebar-text)' }}>按 F1 随时唤出，再次点击关闭</p>
              </div>
              <button 
                onClick={() => setShowShortcutsPanel(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
                style={{ color: 'var(--sidebar-text)', background: 'transparent' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--editor-hover)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                title="关闭 (F1)"
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
    </div>
  )
}


// 快捷键大全面板内容组件（读取实时配置，非写死）
function ShortcutsPanel() {
  const map = getKeybindingsMap()
  const categories = [...new Set(SHORTCUT_ACTIONS.map(a => a.category))]
  return (
    <div className="mt-4 space-y-5">
      {categories.map(cat => (
        <div key={cat}>
          <h3 className="text-[11px] font-semibold uppercase tracking-widest mb-2.5" style={{ color: 'var(--editor-accent)' }}>{cat}</h3>
          <div className="grid grid-cols-3 gap-2">
            {SHORTCUT_ACTIONS.filter(a => a.category === cat && a.defaultKey).map(action => {
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
                  <span className="text-[13px] truncate" style={{ color: 'var(--editor-text)' }}>{action.label}</span>
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
