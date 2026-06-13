import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type SaveStatus = 'saved' | 'unsaved' | 'just-saved'

export interface FileTab {
  id: string
  name: string
  filePath: string | null
  content: string
  isSaved: boolean
  saveStatus: SaveStatus
  viewMode: 'edit' | 'split' | 'preview'
}

interface EditorState {
  tabs: FileTab[]
  activeTabId: string | null
  recentFiles: string[]

  currentTab: () => FileTab | null
  currentContent: () => string
  currentFilePath: () => string | null

  openFile: (filePath: string, content: string) => string
  openNewFile: (content?: string) => string
  closeTab: (tabId: string) => void
  forceCloseTab: (tabId: string) => void
  switchTab: (tabId: string | null) => void
  updateContent: (content: string) => void
  updateViewMode: (viewMode: 'edit' | 'split' | 'preview') => void
  markAsSaved: () => void
  clearJustSaved: (tabId: string) => void
  updateTabName: (tabId: string, name: string) => void
  updateTabFilePath: (tabId: string, filePath: string) => void
  addRecentFile: (filePath: string) => void
  removeRecentFile: (filePath: string) => void
  setActiveHeadingId: (id: string | null) => void
  setViewMode: (tabId: string, viewMode: 'edit' | 'split' | 'preview') => void
  cursorPosition: { line: number; column: number }
  setCursorPosition: (position: { line: number; column: number }) => void
  activeHeadingId: string | null
}

export const useEditorStore = create<EditorState>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabId: null,
      recentFiles: [],
      cursorPosition: { line: 1, column: 1 },
      activeHeadingId: null,

      currentTab: () => {
        const { tabs, activeTabId } = get()
        return tabs.find(t => t.id === activeTabId) || null
      },

      currentContent: () => {
        const tab = get().currentTab()
        return tab ? tab.content : ''
      },

      currentFilePath: () => {
        const tab = get().currentTab()
        return tab ? tab.filePath : null
      },

      openFile: (filePath, content) => {
        const { tabs } = get()
        const existing = tabs.find(t => t.filePath === filePath)
        if (existing) {
          set({ activeTabId: existing.id })
          get().addRecentFile(filePath)
          return existing.id
        }
        const id = 'file-' + Date.now()
        const name = filePath.split('\\').pop()?.split('/').pop() || filePath
        const newTab: FileTab = { id, name, filePath, content, isSaved: true, saveStatus: 'saved', viewMode: 'preview' }
        set({ tabs: [...tabs, newTab], activeTabId: id })
        get().addRecentFile(filePath)
        return id
      },

      openNewFile: (content = '') => {
        const id = 'new-' + Date.now()
        const newTab: FileTab = { id, name: '未命名新文件', filePath: null, content, isSaved: content === '', saveStatus: 'saved', viewMode: 'edit' }
        set({ tabs: [...get().tabs, newTab], activeTabId: id })
        return id
      },

      closeTab: (tabId) => {
        // 由 TabBar/App 调用前检查 isSaved，这里不做确认直接关闭
        const { tabs, activeTabId } = get()
        const idx = tabs.findIndex(t => t.id === tabId)
        if (idx === -1) return
        const newTabs = tabs.filter(t => t.id !== tabId)
        let newActiveId = activeTabId
        if (activeTabId === tabId) {
          if (newTabs.length === 0) {
            newActiveId = null
          } else if (idx < newTabs.length) {
            newActiveId = newTabs[idx].id
          } else {
            newActiveId = newTabs[newTabs.length - 1].id
          }
        }
        set({ tabs: newTabs, activeTabId: newActiveId })
      },

      forceCloseTab: (tabId: string) => {
        const { tabs: t, activeTabId: a } = get()
        const idx = t.findIndex(x => x.id === tabId)
        if (idx === -1) return
        const newTabs = t.filter(x => x.id !== tabId)
        let newActiveId = a
        if (a === tabId) {
          if (newTabs.length === 0) newActiveId = null
          else if (idx < newTabs.length) newActiveId = newTabs[idx].id
          else newActiveId = newTabs[newTabs.length - 1].id
        }
        set({ tabs: newTabs, activeTabId: newActiveId })
      },

      switchTab: (tabId) => {
        set({ activeTabId: tabId })
      },

      updateContent: (content) => {
        const { tabs, activeTabId } = get()
        set({
          tabs: tabs.map(t => t.id === activeTabId ? { ...t, content, isSaved: false, saveStatus: 'unsaved' } : t),
        })
      },

      updateViewMode: (viewMode) => {
        const { tabs, activeTabId } = get()
        set({
          tabs: tabs.map(t => t.id === activeTabId ? { ...t, viewMode } : t),
        })
      },

      setViewMode: (tabId, viewMode) => {
        const { tabs } = get()
        set({
          tabs: tabs.map(t => t.id === tabId ? { ...t, viewMode } : t),
        })
      },

      markAsSaved: () => {
        const { tabs, activeTabId } = get()
        set({
          tabs: tabs.map(t => t.id === activeTabId ? { ...t, isSaved: true, saveStatus: 'just-saved' } : t),
        })
      },

      clearJustSaved: (tabId) => {
        const { tabs } = get()
        set({
          tabs: tabs.map(t => t.id === tabId && t.saveStatus === 'just-saved' ? { ...t, saveStatus: 'saved' } : t),
        })
      },

      updateTabName: (tabId, name) => {
        const { tabs } = get()
        set({
          tabs: tabs.map(t => t.id === tabId ? { ...t, name } : t),
        })
      },

      updateTabFilePath: (tabId, filePath) => {
        const { tabs } = get()
        set({
          tabs: tabs.map(t => t.id === tabId ? { ...t, filePath } : t),
        })
      },

      addRecentFile: (filePath) => {
        const { recentFiles } = get()
        const filtered = recentFiles.filter(f => f !== filePath)
        set({ recentFiles: [filePath, ...filtered].slice(0, 20) })
      },

      removeRecentFile: (filePath) => {
        set({ recentFiles: get().recentFiles.filter(f => f !== filePath) })
      },

      setActiveHeadingId: (id) => set({ activeHeadingId: id }),
      setCursorPosition: (position) => set({ cursorPosition: position }),
    }),
    {
      name: 'yizimarkdown-editor',
      partialize: (state) => ({
        tabs: state.tabs.map(t => ({
          id: t.id, name: t.name, filePath: t.filePath,
          content: t.content, isSaved: t.isSaved,
          viewMode: t.viewMode,
        })),
        activeTabId: state.activeTabId,
        recentFiles: state.recentFiles,
      }),
    }
  )
)
