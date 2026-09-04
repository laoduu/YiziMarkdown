import { useState, useEffect, useRef } from 'react'
import { X, Home, Code, Columns2, Eye, Check, Sparkles, Presentation, ChevronsRight } from 'lucide-react'
import { useEditorStore, SaveStatus } from '../stores/editorStore'
import { useI18n } from '../i18n'

interface TabBarProps {
  onNew: () => void
  onPresent: () => void
}


function StatusDot({ status }: { status: SaveStatus }) {
  if (status === 'saved' || status === undefined) return null

  if (status === 'just-saved') {
    return (
      <span className="tab-save-indicator">
        <Check size={10} strokeWidth={3} />
      </span>
    )
  }

  // unsaved — 呼吸圆点
  return <span className="tab-unsaved-pulse" />
}

export default function TabBar({ onNew, onPresent }: TabBarProps) {
  const { t } = useI18n()
  const { tabs, activeTabId, switchTab, closeTab, currentTab, markAsSaved, clearJustSaved } = useEditorStore()
  const current = currentTab()
  const [pendingCloseId, setPendingCloseId] = useState<string | null>(null)
  const [overflowing, setOverflowing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const justSavedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tabListRef = useRef<HTMLDivElement>(null)
  const overflowWrapRef = useRef<HTMLDivElement>(null)

  // 检测 tab 是否溢出容器
  useEffect(() => {
    const el = tabListRef.current
    if (!el) return
    const check = () => setOverflowing(el.scrollWidth > el.clientWidth + 1)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [tabs.length, activeTabId])

  // 活动 tab 变化时滚动到可见区域
  useEffect(() => {
    if (activeTabId === null) return
    const el = tabListRef.current
    if (!el) return
    const target = el.querySelector<HTMLElement>(`[data-tab-id="${activeTabId}"]`)
    if (!target) return
    const t = target.getBoundingClientRect()
    const c = el.getBoundingClientRect()
    if (t.left < c.left) {
      el.scrollLeft -= c.left - t.left
    } else if (t.right > c.right) {
      el.scrollLeft += t.right - c.right
    }
  }, [activeTabId, tabs.length])

  // 点击溢出菜单外部时关闭
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (overflowWrapRef.current && !overflowWrapRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  // 监听 Ctrl+W 等外部关闭请求
  useEffect(() => {
    const handler = (e: Event) => {
      const tabId = (e as CustomEvent).detail as string
      const tab = tabs.find(t => t.id === tabId)
      if (tab && !tab.isSaved) {
        setPendingCloseId(tabId)
      } else {
        closeTab(tabId)
      }
    }
    window.addEventListener('tab-close-request', handler)
    return () => window.removeEventListener('tab-close-request', handler)
  }, [tabs, closeTab])

  // just-saved 状态 1.5s 后恢复为 saved
  useEffect(() => {
    const unsavedTab = tabs.find(t => t.saveStatus === 'just-saved')
    if (!unsavedTab) return
    if (justSavedTimer.current) clearTimeout(justSavedTimer.current)
    justSavedTimer.current = setTimeout(() => {
      clearJustSaved(unsavedTab.id)
    }, 1500)
    return () => { if (justSavedTimer.current) clearTimeout(justSavedTimer.current) }
  }, [tabs, clearJustSaved])

  const handleClose = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const tab = tabs.find(t => t.id === tabId)
    if (tab && !tab.isSaved) {
      setPendingCloseId(tabId)
    } else {
      closeTab(tabId)
    }
  }

  // 鼠标中键点击关闭 tab
  const handleAuxClick = (tabId: string, e: React.MouseEvent) => {
    if (e.button !== 1) return
    e.preventDefault()
    e.stopPropagation()
    const tab = tabs.find(t => t.id === tabId)
    if (tab && !tab.isSaved) {
      setPendingCloseId(tabId)
    } else {
      closeTab(tabId)
    }
  }

  const handleConfirmClose = (action: 'save' | 'discard' | 'cancel') => {
    const tabId = pendingCloseId
    setPendingCloseId(null)
    if (!tabId) return

    if (action === 'save') {
      markAsSaved()
      closeTab(tabId)
    } else if (action === 'discard') {
      closeTab(tabId)
    }
  }

  return (
    <div className="tab-bar">
      <div ref={tabListRef} className="flex items-center min-w-0 flex-1 overflow-x-auto tab-list">
        <button
          onClick={() => switchTab(null)}
          className={`tab-item ${activeTabId === null ? 'tab-item-active' : ''}`}
          title={t('tabbar.recentFiles')}
        >
          <Home size={13} />
          <span>{t('tabbar.home')}</span>
        </button>

        {tabs.map((tab) => (
          <button
            key={tab.id}
            data-tab-id={tab.id}
            onClick={() => switchTab(tab.id)}
            onAuxClick={(e) => handleAuxClick(tab.id, e)}
            onDoubleClick={(e) => handleClose(tab.id, e)}
            className={`tab-item ${activeTabId === tab.id ? 'tab-item-active' : ''}`}
            title={tab.filePath || t('tabbar.untitled')}
          >
            <span className="tab-title truncate max-w-[120px] min-w-0">{tab.name}</span>
            <StatusDot status={tab.saveStatus} />
            <span
              className="tab-close"
              onClick={(e) => handleClose(tab.id, e)}
            >
              <X size={12} />
            </span>
          </button>
        ))}

        <button className="tab-item tab-new-btn" onClick={onNew} title={t('tabbar.newFile')}>
          +
        </button>
      </div>

      {overflowing && (
        <div ref={overflowWrapRef} className="tab-overflow-wrap">
          <button
            className={`tab-overflow-btn ${menuOpen ? 'tab-overflow-btn-active' : ''}`}
            onClick={() => setMenuOpen(o => !o)}
            title={t('tabbar.allOpenDocs')}
          >
            <ChevronsRight size={14} />
          </button>
          {menuOpen && (
            <div className="tab-overflow-menu">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  className={`tab-overflow-item ${activeTabId === tab.id ? 'tab-overflow-item-active' : ''}`}
                  onClick={() => {
                    switchTab(tab.id)
                    setMenuOpen(false)
                  }}
                  onAuxClick={(e) => handleAuxClick(tab.id, e)}
                  title={tab.filePath || t('tabbar.untitled')}
                >
                  <span className="truncate flex-1 min-w-0 text-left">{tab.name}</span>
                  <StatusDot status={tab.saveStatus} />
                  <span className="tab-overflow-close" onClick={(e) => handleClose(tab.id, e)}>
                    <X size={12} />
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTabId && (
        <div className="flex items-center shrink-0 tab-view-modes">
          <button
            onClick={() => useEditorStore.getState().updateViewMode('edit')}
            className={`tab-view-btn ${current?.viewMode === 'edit' ? 'tab-view-active' : ''}`}
            title={t('tabbar.sourceTitle')}
          >
            <Code size={14} /><span>{t('tabbar.sourceMode')}</span>
          </button>
          <button
            onClick={() => useEditorStore.getState().updateViewMode('split')}
            className={`tab-view-btn ${current?.viewMode === 'split' ? 'tab-view-active' : ''}`}
            title={t('tabbar.splitTitle')}
          >
            <Columns2 size={14} /><span>{t('tabbar.splitMode')}</span>
          </button>
          <button
            onClick={() => useEditorStore.getState().updateViewMode('live')}
            className={`tab-view-btn ${current?.viewMode === 'live' ? 'tab-view-active' : ''}`}
            title={t('tabbar.liveTitle')}
          >
            <Sparkles size={14} /><span>{t('tabbar.liveMode')}</span>
          </button>
          <button
            onClick={() => useEditorStore.getState().updateViewMode('preview')}
            className={`tab-view-btn ${current?.viewMode === 'preview' ? 'tab-view-active' : ''}`}
            title={t('tabbar.previewTitle')}
          >
            <Eye size={14} /><span>{t('tabbar.previewMode')}</span>
          </button>
          <button
            onClick={onPresent}
            className="tab-view-btn"
            title={t('tabbar.presentTitle')}
          >
            <Presentation size={14} /><span>{t('tabbar.present')}</span>
          </button>
        </div>
      )}

      {/* 关闭确认弹窗 */}
      {pendingCloseId && (
        <div className="tab-close-overlay" onClick={() => setPendingCloseId(null)}>
          <div className="tab-close-dialog" onClick={(e) => e.stopPropagation()}>
            <p className="tab-close-dialog-title">{t('tabbar.unsavedTitle')}</p>
            <p className="tab-close-dialog-msg">
              {t('tabbar.unsavedMsg', { name: tabs.find(t => t.id === pendingCloseId)?.name || t('tabbar.file') })}
            </p>
            <div className="tab-close-dialog-actions">
              <button className="tab-close-btn-save" onClick={() => handleConfirmClose('save')}>
                {t('tabbar.save')}
              </button>
              <button className="tab-close-btn-discard" onClick={() => handleConfirmClose('discard')}>
                {t('tabbar.discard')}
              </button>
              <button className="tab-close-btn-cancel" onClick={() => handleConfirmClose('cancel')}>
                {t('tabbar.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
