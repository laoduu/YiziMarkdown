/**
 * SelectionToolbar.tsx — 划词助手浮动工具栏
 *
 * 在源码编辑器中选中文本后，显示在选区上方的浮动操作栏。
 * 使用 Portal 渲染到 document.body，避免父容器 overflow/定位干扰。
 *
 * 按钮顺序 / 显示名来自设置（`selectionActions`），技能清单实时加载。
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../i18n'
import { useSettingsStore } from '../stores/settingsStore'
import { loadSkills, type Skill } from '../lib/ai-skills'
import { SKILLS_CHANGED_EVENT } from '../lib/skillsAdmin'
import {
  buildSelectionToolbarItems,
  type SelectionToolbarItem,
  type SelectionSystemAction,
} from '../lib/selectionActions'
import SelectionToolbarView from './SelectionToolbarView'

interface SelectionToolbarProps {
  visible: boolean
  x: number
  y: number
  text: string
  /** 选区来源：预览面板不能执行「粘贴替换」 */
  source?: 'editor' | 'preview'
  /** 粘贴：用剪贴板内容替换当前选区（由 Editor 实现） */
  onPasteSelected?: () => void
}

export default function SelectionToolbar({ visible, x, y, text, source = 'editor', onPasteSelected }: SelectionToolbarProps) {
  const { t } = useI18n()
  const toolbarRef = useRef<HTMLDivElement>(null)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [posStyle, setPosStyle] = useState<React.CSSProperties>({})
  const [skills, setSkills] = useState<Skill[]>([])
  const selectionActions = useSettingsStore((s) => s.selectionActions)
  const updateSettings = useSettingsStore((s) => s.updateSettings)

  useEffect(() => {
    const reload = () => { loadSkills().then(setSkills) }
    reload()
    window.addEventListener(SKILLS_CHANGED_EVENT, reload)
    return () => window.removeEventListener(SKILLS_CHANGED_EVENT, reload)
  }, [])

  useEffect(() => {
    if (!visible) setCopiedId(null)
  }, [visible])

  useEffect(() => {
    return () => { if (copyTimerRef.current) clearTimeout(copyTimerRef.current) }
  }, [])

  const items = useMemo(() => {
    const labels: Record<SelectionSystemAction, string> = {
      copy: t('selection.copy'),
      paste: t('selection.paste'),
      chat: t('selection.chat'),
    }
    return buildSelectionToolbarItems(selectionActions, skills, labels)
      .filter((item) => !item.missingSkill)
      .filter((item) => !(item.type === 'paste' && source !== 'editor'))
  }, [selectionActions, skills, t, source])

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
  }, [computePosition, items])

  const handleAction = (item: SelectionToolbarItem) => {
    switch (item.type) {
      case 'skill':
        updateSettings({
          aiPanelOpen: true,
          aiPendingAction: {
            type: 'skill',
            skillId: item.skillId!,
            fromSelection: true,
            selectedText: text,
          },
        })
        break
      case 'copy':
        navigator.clipboard.writeText(text).then(() => {
          setCopiedId(item.id)
          if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
          copyTimerRef.current = setTimeout(() => setCopiedId(null), 1500)
        })
        break
      case 'paste':
        onPasteSelected?.()
        break
      case 'chat':
        updateSettings({
          aiPanelOpen: true,
          aiPendingAction: { type: 'chat', text },
        })
        break
    }
  }

  if (!visible || items.length === 0) return null

  return createPortal(
    <SelectionToolbarView
      items={items}
      onAction={handleAction}
      copiedId={copiedId}
      containerRef={toolbarRef}
      style={posStyle}
      onMouseDown={(e) => e.preventDefault()}
    />,
    document.body,
  )
}
