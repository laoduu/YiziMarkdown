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
  const { tabs, activeTabId, switchTab, closeTab, currentTab, markAsSaved, clearJustSaved, moveTab } = useEditorStore()
  const current = currentTab()
  const [pendingCloseId, setPendingCloseId] = useState<string | null>(null)
  const [overflowing, setOverflowing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const justSavedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tabListRef = useRef<HTMLDivElement>(null)
  const overflowWrapRef = useRef<HTMLDivElement>(null)

  // ===== 拖动排序 =====
  /** 位移超过这个阈值才算拖动，否则视为普通点击（不影响单击切换 / 双击关闭） */
  const DRAG_THRESHOLD = 4
  /** 正在拖的 tab + 跟手浮层的初始宽度与位置。
   *  浮层后续的移动直接改 DOM style（见 onMove），否则每个 pointermove 都要重渲染整条 tab 栏 */
  const [drag, setDrag] = useState<{ id: string; width: number; x: number; y: number } | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; after: boolean } | null>(null)
  const ghostRef = useRef<HTMLDivElement>(null)
  /** dropTarget 的镜像：window 上的监听器闭包读不到最新 state，只能走 ref */
  const dropTargetRef = useRef<{ id: string; after: boolean } | null>(null)
  /** 拖动结束浏览器会补一个 click，必须吞掉，否则会顺带切换 tab */
  const suppressClickRef = useRef(false)

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

  /** 按住 tab 拖动 → 松手插到目标 tab 的前 / 后（不依赖 HTML5 DnD：
   *  Tauri 在 Windows 上默认 dragDropEnabled=true，会拦掉 HTML5 拖放） */
  const handleTabPointerDown = (tabId: string, e: React.PointerEvent) => {
    if (e.button !== 0) return
    // 关闭按钮自己有点击行为，不参与拖动
    if ((e.target as HTMLElement).closest('.tab-close')) return
    suppressClickRef.current = false
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    // 光标在 tab 内的落点：浮层按这个偏移"抓"住，才跟手而不是跳到光标中心
    const offsetX = e.clientX - rect.left
    const offsetY = e.clientY - rect.top
    const startX = e.clientX
    const startY = e.clientY
    let dragging = false

    const onMove = (ev: PointerEvent) => {
      if (!dragging) {
        if (Math.abs(ev.clientX - startX) < DRAG_THRESHOLD && Math.abs(ev.clientY - startY) < DRAG_THRESHOLD) return
        dragging = true
        // 浮层的首次定位走 state（此刻 DOM 里还没有浮层），之后改走下面的直接改 style
        setDrag({ id: tabId, width: rect.width, x: ev.clientX - offsetX, y: ev.clientY - offsetY })
      } else {
        const ghost = ghostRef.current
        if (ghost) ghost.style.transform = `translate3d(${ev.clientX - offsetX}px, ${ev.clientY - offsetY}px, 0)`
      }
      // 拖到列表左右边缘时自动滚动，否则标签多到溢出时拖不到看不见的位置
      const list = tabListRef.current
      if (list) {
        const lr = list.getBoundingClientRect()
        if (ev.clientX < lr.left + 24) list.scrollLeft -= 8
        else if (ev.clientX > lr.right - 24) list.scrollLeft += 8
      }
      // 命中测试：拖拽期间被拖的 tab 仍在文档里，所以直接问光标下是谁
      // （浮层是 pointer-events:none，不会挡住命中）
      const hit = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)
        ?.closest<HTMLElement>('[data-tab-id]')
      const hitId = hit?.dataset.tabId
      let next: { id: string; after: boolean } | null = null
      if (hit && hitId && hitId !== tabId) {
        const hr = hit.getBoundingClientRect()
        next = { id: hitId, after: ev.clientX > hr.left + hr.width / 2 }
      }
      const prev = dropTargetRef.current
      if (prev?.id === next?.id && prev?.after === next?.after) return
      dropTargetRef.current = next
      setDropTarget(next)
    }

    const finish = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      if (dragging) {
        suppressClickRef.current = true
        const target = dropTargetRef.current
        if (target) {
          moveTab(tabId, target.id, target.after)
          // 拖完自动激活被拖的 tab
          switchTab(tabId)
        }
      }
      dropTargetRef.current = null
      setDrag(null)
      setDropTarget(null)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
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

  const dragTab = drag ? tabs.find(t => t.id === drag.id) : null

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
            onPointerDown={(e) => handleTabPointerDown(tab.id, e)}
            onClick={() => {
              if (suppressClickRef.current) { suppressClickRef.current = false; return }
              switchTab(tab.id)
            }}
            onAuxClick={(e) => handleAuxClick(tab.id, e)}
            onDoubleClick={(e) => handleClose(tab.id, e)}
            className={`tab-item ${activeTabId === tab.id ? 'tab-item-active' : ''}${
              drag?.id === tab.id ? ' tab-item-dragging' : ''}${
              dropTarget?.id === tab.id ? (dropTarget.after ? ' tab-drop-after' : ' tab-drop-before') : ''}`}
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
      {/* 拖动跟手浮层：pointer-events:none，所以不会挡住下面的命中测试 */}
      {drag && dragTab && (
        <div
          ref={ghostRef}
          className="tab-drag-ghost"
          style={{ width: drag.width, transform: `translate3d(${drag.x}px, ${drag.y}px, 0)` }}
        >
          <span className="truncate">{dragTab.name}</span>
        </div>
      )}
    </div>
  )
}
