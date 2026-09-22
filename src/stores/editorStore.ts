import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { canonicalRemotePath } from '../lib/remotePath'

export type SaveStatus = 'saved' | 'unsaved' | 'just-saved'

export type ViewMode = 'edit' | 'live' | 'split' | 'preview'

/**
 * 远程身份。存在即表示该 tab 是云端文档：
 * `filePath` 指向本地缓存镜像，真正保存要额外 PUT 到 `path`。
 * 注意：**必须同步加入 `partialize`**，否则重启后远程身份丢失，
 * Ctrl+S 会只写本地缓存而让用户误以为已存到云端。
 */
export interface RemoteRef {
  /** 相对配置根目录的远程路径，如 `/Notes/foo.md` */
  path: string
  /** 打开时的 ETag，用于保存时的冲突检测（服务器不提供时为 null） */
  etag: string | null
}

export interface FileTab {
  id: string
  name: string
  filePath: string | null
  content: string
  isSaved: boolean
  saveStatus: SaveStatus
  viewMode: ViewMode
  remote?: RemoteRef
}

interface EditorState {
  tabs: FileTab[]
  activeTabId: string | null
  recentFiles: string[]

  currentTab: () => FileTab | null
  currentContent: () => string
  currentFilePath: () => string | null

  openFile: (filePath: string, content: string) => string
  openRemoteFile: (
    cachePath: string,
    content: string,
    remote: RemoteRef,
    opts?: { forceReload?: boolean }
  ) => string
  openNewFile: (content?: string) => string
  closeTab: (tabId: string) => void
  forceCloseTab: (tabId: string) => void
  switchTab: (tabId: string | null) => void
  /** 拖动排序：把 dragId 插到 targetId 之前（after=false）或之后（after=true） */
  moveTab: (dragId: string, targetId: string, after: boolean) => void
  updateContent: (content: string) => void
  updateViewMode: (viewMode: ViewMode) => void
  markAsSaved: () => void
  /** 按 tab id 标记已保存（保存流程可能不在该 tab 处于激活态时完成） */
  markTabSaved: (tabId: string) => void
  clearJustSaved: (tabId: string) => void
  updateTabName: (tabId: string, name: string) => void
  updateTabFilePath: (tabId: string, filePath: string) => void
  /** 更新远程身份（保存成功后刷新 ETag；另存为本地副本时传 undefined 解除远程关联） */
  setTabRemote: (tabId: string, remote: RemoteRef | undefined) => void
  addRecentFile: (filePath: string) => void
  removeRecentFile: (filePath: string) => void
  setActiveHeadingId: (id: string | null) => void
  setViewMode: (tabId: string, viewMode: ViewMode) => void
  cursorPosition: { line: number; column: number }
  setCursorPosition: (position: { line: number; column: number }) => void
  activeHeadingId: string | null
  /** 运行时状态：插件是否已加载就绪（不持久化） */
  _pluginsReady: boolean
}

export const useEditorStore = create<EditorState>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabId: null,
      recentFiles: [],
      cursorPosition: { line: 1, column: 1 },
      activeHeadingId: null,
      _pluginsReady: false,

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

      /**
       * 打开云端文档。`cachePath` 是本地镜像路径，`remote` 是远程身份。
       * 与 `openFile` 的区别：按远程路径去重（缓存路径会随服务器地址变化）、
       * 且**不写入 recentFiles**（缓存路径对本机"最近文件"毫无意义）。
       *
       * @param opts.forceReload 强制用服务器内容覆盖（冲突弹窗的「放弃本地修改并重新加载」）
       */
      openRemoteFile: (cachePath, content, remote, opts) => {
        const { tabs } = get()
        // 按规范化后的远程路径去重：路径可能来自用户输入、字符串拼接或服务器 href，
        // 写法不一定一致（`/Notes//a.md` vs `/Notes/a.md`）。不规范化会重复开 tab。
        const target = canonicalRemotePath(remote.path) ?? remote.path
        const existing = tabs.find(
          t => t.remote && (canonicalRemotePath(t.remote.path) ?? t.remote.path) === target
        )
        if (existing) {
          // 同一远程文件已打开：切过去。
          // 只有在本地没有未保存修改时才用服务器内容覆盖 —— 否则在云端列表里点一下
          // 已打开的文件就会静默丢掉用户的编辑。显式 forceReload 才无条件覆盖。
          const replace = opts?.forceReload === true || existing.isSaved
          set({
            activeTabId: existing.id,
            tabs: tabs.map(t => t.id === existing.id
              ? replace
                ? { ...t, filePath: cachePath, content, remote, isSaved: true, saveStatus: 'saved' }
                : { ...t, filePath: cachePath, remote }
              : t),
          })
          return existing.id
        }
        const id = 'remote-' + Date.now()
        const name = remote.path.split('/').pop() || remote.path
        const newTab: FileTab = {
          id, name, filePath: cachePath, content,
          isSaved: true, saveStatus: 'saved', viewMode: 'preview', remote,
        }
        set({ tabs: [...tabs, newTab], activeTabId: id })
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

      moveTab: (dragId, targetId, after) => {
        const { tabs } = get()
        const from = tabs.findIndex(t => t.id === dragId)
        if (from === -1 || dragId === targetId) return
        const next = [...tabs]
        const [moved] = next.splice(from, 1)
        // 目标下标必须在「已移除 dragId」的数组上重算：
        // 从左往右拖时原下标会偏一位，用旧下标插入就会落到目标前面
        const at = next.findIndex(t => t.id === targetId)
        if (at === -1) return
        next.splice(after ? at + 1 : at, 0, moved)
        set({ tabs: next })
      },

      updateContent: (content) => {
        const { tabs, activeTabId } = get()
        const tab = tabs.find(t => t.id === activeTabId)
        // 内容未变化时（如外部同步回写）不标记为未保存
        if (!tab || tab.content === content) return
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

      markTabSaved: (tabId) => {
        const { tabs } = get()
        set({
          tabs: tabs.map(t => t.id === tabId ? { ...t, isSaved: true, saveStatus: 'just-saved' } : t),
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

      setTabRemote: (tabId, remote) => {
        const { tabs } = get()
        set({
          tabs: tabs.map(t => t.id === tabId ? { ...t, remote } : t),
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
          saveStatus: t.saveStatus,
          viewMode: t.viewMode,
          // 远程身份必须持久化：漏掉会让重启后的云端文档退化成"本地文件"，
          // Ctrl+S 只写缓存、永不 PUT，而用户以为已存到云端（静默丢数据）
          remote: t.remote,
        })),
        activeTabId: state.activeTabId,
        recentFiles: state.recentFiles,
      }),
      // 兼容旧版本持久化数据：saveStatus 缺失时按 isSaved 推断；remote 缺失即普通本地文件
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<EditorState>
        const tabs = (p.tabs ?? []).map(t => ({
          ...t,
          saveStatus: t.saveStatus ?? (t.isSaved ? 'saved' : 'unsaved'),
          remote: t.remote ?? undefined,
        }))
        return { ...current, ...p, tabs }
      },
    }
  )
)
