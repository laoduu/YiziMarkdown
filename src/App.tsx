import { useState, useEffect, useCallback, useRef } from 'react'
import Toolbar from './components/Toolbar'
import Sidebar from './components/Sidebar'
import Editor, { EditorRef } from './components/Editor'
import StatusBar from './components/StatusBar'
import SettingsModal from './components/SettingsModal'
import TabBar from './components/TabBar'
import HomePage from './components/HomePage'
import { useSettingsStore } from './stores/settingsStore'
import { useEditorStore } from './stores/editorStore'

// Tauri API 调用函数
const invokeTauri = async <T,>(cmd: string, args?: Record<string, unknown>): Promise<T | null> => {
  try {
    const tauriV2 = (window as any).__TAURI_INTERNALS__
    if (tauriV2 && typeof tauriV2.invoke === 'function') {
      return await tauriV2.invoke(cmd, args)
    }
    
    const tauriV1 = (window as any).__TAURI__
    if (tauriV1 && typeof tauriV1.invoke === 'function') {
      return await tauriV1.invoke(cmd, args)
    }
    
    if (typeof (window as any).invoke === 'function') {
      return await (window as any).invoke(cmd, args)
    }
    
    console.warn('Tauri API 不可用')
    return null
  } catch (error) {
    console.warn(`调用 Tauri 命令失败: ${cmd}`, error)
    return null
  }
}

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
  const [cursorPosition] = useState({ line: 1, column: 1 })
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({ message: '', visible: false })
  const [currentFolder, setCurrentFolder] = useState<string | null>(null)
  const editorRef = useRef<EditorRef>(null)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startupDone = useRef(false)

  // 动态加载主题 CSS
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const tauri = (window as any).__TAURI_INTERNALS__
        if (!tauri || typeof tauri.invoke !== 'function') return
        const css = await tauri.invoke('read_theme_css', { name: `${currentTheme}.css` }) as string
        if (css) {
          let el = document.getElementById('yizimarkdown-theme-css')
          if (!el) { el = document.createElement('style'); el.id = 'yizimarkdown-theme-css'; document.head.appendChild(el) }
          el.textContent = css
        }
      } catch {}
    }
    loadTheme()
  }, [currentTheme])

  // 加载用户自定义 CSS
  useEffect(() => {
    const loadUserCss = async () => {
      try {
        const tauri = (window as any).__TAURI_INTERNALS__
        if (!tauri || typeof tauri.invoke !== 'function') return
        const css = await tauri.invoke('read_user_css') as string
        if (css) {
          let el = document.getElementById('yizimarkdown-user-css')
          if (!el) { el = document.createElement('style'); el.id = 'yizimarkdown-user-css'; document.head.appendChild(el) }
          el.textContent = css
        }
      } catch {}
    }
    loadUserCss()
  }, [])

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

  // 打开开发者工具
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I')) {
        e.preventDefault()
        const tauri = (window as any).__TAURI_INTERNALS__
        if (tauri && tauri.invoke) {
          tauri.invoke('plugin:window|toggle_devtools', { label: 'main' }).catch(() => {})
        }
      }
      // Ctrl+N: 新建
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault()
        handleNewFile()
      }
      // Ctrl+S: 保存（有路径直接保存，无路径另存为）
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault()
        handleSaveFile()
      }
      // Ctrl+O: 打开
      if (e.ctrlKey && e.key === 'o') {
        e.preventDefault()
        handleOpenFile()
      }
      // Ctrl+W: 关闭当前Tab（未保存时由 TabBar 弹窗确认）
      if (e.ctrlKey && e.key === 'w') {
        e.preventDefault()
        if (activeTabId) {
          const tab = useEditorStore.getState().currentTab()
          if (tab && !tab.isSaved) {
            // 触发 TabBar 的关闭确认 — 通过 dispatch 自定义事件
            window.dispatchEvent(new CustomEvent('tab-close-request', { detail: activeTabId }))
          } else {
            closeTab(activeTabId)
          }
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, []) // eslint-disable-line

  // ===== 启动逻辑 =====
  useEffect(() => {
    if (startupDone.current) return
    startupDone.current = true

    const loadStartup = async () => {
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
    document.documentElement.classList.remove(
      'theme-academic', 'theme-vibrant', 'theme-minimal', 'theme-magazine', 'theme-tech', 'theme-nature'
    )
    document.documentElement.classList.add(`theme-${currentTheme}`)
    
    if (isDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [currentTheme, isDark])

  const handleNewFile = useCallback(() => {
    openNewFile('')
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

  const handleExport = useCallback((format: 'html' | 'md' | 'txt') => {
    const tab = currentTab()
    if (!tab) return

    let output = ''
    let filename = 'document'
    let mimeType = 'text/plain'
    
    if (tab.filePath) {
      filename = tab.filePath.split('\\').pop()?.replace(/\.[^/.]+$/, '') || 'document'
    }
    
    switch (format) {
      case 'html':
        const previewElement = document.querySelector('.editor-content')
        output = previewElement?.innerHTML || tab.content
        filename += '.html'
        mimeType = 'text/html'
        break
      case 'md':
        output = tab.content
        filename += '.md'
        mimeType = 'text/markdown'
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
        filename += '.txt'
        mimeType = 'text/plain'
        break
    }
    
    const blob = new Blob([output], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    showToast('已导出 ' + filename)
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
          />
        )}
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
      />
      
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
      />
      
      {toast.visible && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 px-4 py-2 bg-[var(--editor-text)] text-[var(--editor-bg)] text-sm rounded-lg shadow-lg z-[9999] pointer-events-none transition-opacity duration-300">
          {toast.message}
        </div>
      )}
    </div>
  )
}

export default App
