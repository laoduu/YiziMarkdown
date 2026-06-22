import { useState, useEffect, useRef } from 'react'
import { X, Home, Code, Columns2, Eye, Check, Sparkles } from 'lucide-react'
import { useEditorStore, SaveStatus } from '../stores/editorStore'

interface TabBarProps {
  onNew: () => void
}


function StatusDot({ status }: { status: SaveStatus }) {
  if (status === 'saved') return null

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

export default function TabBar({ onNew }: TabBarProps) {
  const { tabs, activeTabId, switchTab, closeTab, currentTab, markAsSaved, clearJustSaved } = useEditorStore()
  const current = currentTab()
  const [pendingCloseId, setPendingCloseId] = useState<string | null>(null)
  const justSavedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
      <div className="flex items-center min-w-0 flex-1 overflow-x-auto tab-list">
        <button
          onClick={() => switchTab(null)}
          className={`tab-item ${activeTabId === null ? 'tab-item-active' : ''}`}
          title="最近文件"
        >
          <Home size={13} />
          <span>首页</span>
        </button>

        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => switchTab(tab.id)}
            onDoubleClick={(e) => handleClose(tab.id, e)}
            className={`tab-item ${activeTabId === tab.id ? 'tab-item-active' : ''}`}
            title={tab.filePath || '未命名新文件'}
          >
            <span className="truncate max-w-[120px]">{tab.name}</span>
            <StatusDot status={tab.saveStatus} />
            <span
              className="tab-close"
              onClick={(e) => handleClose(tab.id, e)}
            >
              <X size={12} />
            </span>
          </button>
        ))}

        <button className="tab-item tab-new-btn" onClick={onNew} title="新建文件 (Ctrl+N)">
          +
        </button>
      </div>

      {activeTabId && (
        <div className="flex items-center shrink-0 tab-view-modes">
          <button
            onClick={() => useEditorStore.getState().updateViewMode('edit')}
            className={`tab-view-btn ${current?.viewMode === 'edit' ? 'tab-view-active' : ''}`}
            title="源代码模式"
          >
            <Code size={14} /><span>源代码</span>
          </button>
          <button
            onClick={() => useEditorStore.getState().updateViewMode('split')}
            className={`tab-view-btn ${current?.viewMode === 'split' ? 'tab-view-active' : ''}`}
            title="并排模式"
          >
            <Columns2 size={14} /><span>并排</span>
          </button>
          <button
            onClick={() => useEditorStore.getState().updateViewMode('live')}
            className={`tab-view-btn ${current?.viewMode === 'live' ? 'tab-view-active' : ''}`}
            title="实时模式"
          >
            <Sparkles size={14} /><span>实时</span>
          </button>
          <button
            onClick={() => useEditorStore.getState().updateViewMode('preview')}
            className={`tab-view-btn ${current?.viewMode === 'preview' ? 'tab-view-active' : ''}`}
            title="预览模式"
          >
            <Eye size={14} /><span>预览</span>
          </button>
        </div>
      )}

      {/* 关闭确认弹窗 */}
      {pendingCloseId && (
        <div className="tab-close-overlay" onClick={() => setPendingCloseId(null)}>
          <div className="tab-close-dialog" onClick={(e) => e.stopPropagation()}>
            <p className="tab-close-dialog-title">未保存的更改</p>
            <p className="tab-close-dialog-msg">
              {tabs.find(t => t.id === pendingCloseId)?.name || '文件'} 有未保存的修改，关闭前是否保存？
            </p>
            <div className="tab-close-dialog-actions">
              <button className="tab-close-btn-save" onClick={() => handleConfirmClose('save')}>
                保存
              </button>
              <button className="tab-close-btn-discard" onClick={() => handleConfirmClose('discard')}>
                不保存
              </button>
              <button className="tab-close-btn-cancel" onClick={() => handleConfirmClose('cancel')}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
