/**
 * SelectionToolbar.tsx — 划词助手浮动工具栏
 *
 * 在源码编辑器中选中文本后，显示在选区上方的浮动操作栏。
 * 使用 Portal 渲染到 document.body，避免父容器 overflow/定位干扰。
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  Presentation,
  FileText,
  Pencil,
  Languages,
  Copy,
  MessageSquarePlus,
  Check,
} from 'lucide-react'
import { useSettingsStore } from '../stores/settingsStore'

const APP_ICON_URL = new URL('../assets/app-icon.png', import.meta.url).href

interface SelectionToolbarProps {
  visible: boolean
  x: number
  y: number
  text: string
}

interface ToolbarAction {
  id: string
  label: string
  icon: typeof Presentation
  skillId?: string
  type: 'skill' | 'copy' | 'chat'
}

const ACTIONS: ToolbarAction[] = [
  { id: 'slides', label: '演示稿', icon: Presentation, skillId: 'slides-outline', type: 'skill' },
  { id: 'summary', label: '摘要', icon: FileText, skillId: 'doc-summary', type: 'skill' },
  { id: 'rewrite', label: '改写', icon: Pencil, skillId: 'polish-writing', type: 'skill' },
  { id: 'translate', label: '翻译', icon: Languages, skillId: 'translate-fulltext', type: 'skill' },
  { id: 'copy', label: '复制', icon: Copy, type: 'copy' },
  { id: 'chat', label: '添加到AI对话', icon: MessageSquarePlus, type: 'chat' },
]

export default function SelectionToolbar({ visible, x, y, text }: SelectionToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)
  const [posStyle, setPosStyle] = useState<React.CSSProperties>({})
  const store = useSettingsStore()

  const computePosition = useCallback(() => {
    if (!visible || !toolbarRef.current) return
    if (x < 0 || y < 0) return
    const toolbar = toolbarRef.current
    const toolbarWidth = toolbar.offsetWidth
    const toolbarHeight = toolbar.offsetHeight
    const viewportWidth = window.innerWidth

    // 左对齐：x 已是选区左边缘坐标
    let left = x
    left = Math.max(8, Math.min(left, viewportWidth - toolbarWidth - 8))

    let top = y - toolbarHeight - 8
    if (top < 4) top = y + 8

    setPosStyle({ left, top })
  }, [visible, x, y])

  useEffect(() => {
    computePosition()
  }, [computePosition])

  const handleAction = (action: ToolbarAction) => {
    switch (action.type) {
      case 'skill':
        store.updateSettings({
          aiPanelOpen: true,
          aiPendingAction: { type: 'skill', skillId: action.skillId!, fromSelection: true, selectedText: text },
        })
        break
      case 'copy':
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
        break
      case 'chat':
        store.updateSettings({
          aiPanelOpen: true,
          aiPendingAction: { type: 'chat', text },
        })
        break
    }
  }

  if (!visible) return null

  return createPortal(
    <div
      ref={toolbarRef}
      style={posStyle}
      className="selection-toolbar"
      onMouseDown={(e) => e.preventDefault()}
    >
      <img src={APP_ICON_URL} alt="" className="selection-toolbar-icon" />
      <div className="selection-toolbar-divider" />
      {ACTIONS.map((action) => {
        const Icon = action.type === 'copy' && copied ? Check : action.icon
        return (
          <button
            key={action.id}
            onClick={() => handleAction(action)}
            className="selection-toolbar-btn"
            title={action.label}
          >
            <Icon size={13} />
            <span>{action.type === 'copy' && copied ? '已复制' : action.label}</span>
          </button>
        )
      })}
    </div>,
    document.body,
  )
}
