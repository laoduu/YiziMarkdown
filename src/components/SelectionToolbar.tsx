/**
 * SelectionToolbar.tsx — 划词助手浮动工具栏
 *
 * 在源码编辑器中选中文本后，显示在选区上方的浮动操作栏。
 * 使用 Portal 渲染到 document.body，避免父容器 overflow/定位干扰。
 *
 * 按钮顺序 / 显示名来自设置（`selectionActions`），技能清单实时加载。
 */
import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../i18n'
import { writeClipboardText } from '../lib/clipboard'
import { useSettingsStore } from '../stores/settingsStore'
import { loadSkills, type Skill } from '../lib/ai-skills'
import { SKILLS_CHANGED_EVENT } from '../lib/skillsAdmin'
import {
  buildSelectionToolbarItems,
  type SelectionToolbarItem,
  type SelectionSystemAction,
} from '../lib/selectionActions'
import {
  enabledSelectionFormats,
  type SelectionFormatAction,
} from '../lib/selectionFormats'
import SelectionToolbarView, { type SelectionBarMode } from './SelectionToolbarView'

interface SelectionToolbarProps {
  visible: boolean
  x: number
  y: number
  text: string
  /** 选区来源：预览面板不能执行「粘贴替换」与格式命令 */
  source?: 'editor' | 'preview'
  /** 粘贴：用剪贴板内容替换当前选区（由 Editor 实现） */
  onPasteSelected?: () => void
  /** 格式：把格式动作交给编辑器执行（与主格式工具栏同一套命令） */
  onFormat?: (action: SelectionFormatAction) => void
}

export default function SelectionToolbar({
  visible,
  x,
  y,
  text,
  source = 'editor',
  onPasteSelected,
  onFormat,
}: SelectionToolbarProps) {
  const { t } = useI18n()
  const toolbarRef = useRef<HTMLDivElement>(null)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [posStyle, setPosStyle] = useState<React.CSSProperties>({})
  const [skills, setSkills] = useState<Skill[]>([])
  const selectionActions = useSettingsStore((s) => s.selectionActions)
  const selectionFormatsRaw = useSettingsStore((s) => s.selectionFormats)
  const selectionBarMode = useSettingsStore((s) => s.selectionBarMode)
  const selectionModeHintSeen = useSettingsStore((s) => s.selectionModeHintSeen)
  const updateSettings = useSettingsStore((s) => s.updateSettings)

  // 预览面板里的选区无法套用格式，强制回落到工具栏
  const mode: SelectionBarMode = source === 'preview' ? 'actions' : selectionBarMode
  const formats = useMemo(() => enabledSelectionFormats(selectionFormatsRaw), [selectionFormatsRaw])

  /* ---------- 模式切换的宽度收放动画（对齐顶部格式栏的 260ms 缓动） ---------- */
  const prevModeRef = useRef<SelectionBarMode | null>(null)
  const prevWidthRef = useRef<number | null>(null)

  useLayoutEffect(() => {
    const el = toolbarRef.current
    if (!el) {
      prevModeRef.current = mode
      return
    }
    const prevMode = prevModeRef.current
    prevModeRef.current = mode
    if (prevMode === null || prevMode === mode) {
      prevWidthRef.current = el.offsetWidth
      return
    }
    const from = prevWidthRef.current ?? el.offsetWidth
    el.classList.add('is-resizing')
    el.style.transition = 'none'
    el.style.width = 'auto'
    const target = el.offsetWidth
    el.style.width = `${from}px`
    // 强制一次回流，让起始宽度生效后再过渡到目标宽度
    void el.offsetWidth
    el.style.transition = 'width 260ms cubic-bezier(0.4, 0, 0.2, 1)'
    el.style.width = `${target}px`
    const timer = setTimeout(() => {
      el.style.transition = ''
      el.style.width = ''
      el.classList.remove('is-resizing')
      prevWidthRef.current = el.offsetWidth
    }, 280)
    return () => {
      clearTimeout(timer)
      el.style.transition = ''
      el.style.width = ''
      el.classList.remove('is-resizing')
    }
  }, [mode])

  /* ---------- 首次划词提示（品牌图标可切换两栏） ---------- */
  const [hintPos, setHintPos] = useState<React.CSSProperties | null>(null)
  const hintShownRef = useRef(false)
  const hintSeenAtMountRef = useRef(selectionModeHintSeen)

  useEffect(() => {
    if (!visible || source !== 'editor' || mode !== 'actions') {
      setHintPos(null)
      return
    }
    if (hintSeenAtMountRef.current || hintShownRef.current) return
    let cancelled = false
    const raf = requestAnimationFrame(() => {
      if (cancelled) return
      const el = toolbarRef.current
      if (!el) return
      hintShownRef.current = true
      const rect = el.getBoundingClientRect()
      const top = rect.top > 44 ? rect.top - 32 : rect.bottom + 6
      setHintPos({ top, left: Math.max(8, Math.min(rect.left, window.innerWidth - 300)) })
      updateSettings({ selectionModeHintSeen: true })
    })
    const timer = setTimeout(() => setHintPos(null), 6000)
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      clearTimeout(timer)
    }
  }, [visible, source, mode, updateSettings])

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
    // 切换动画期间 style.width 是目标宽度；offsetWidth 还停在起始值，clamp 必须用目标值
    const styledWidth = Number.parseFloat(toolbar.style.width)
    const toolbarWidth = Number.isFinite(styledWidth) && styledWidth > 0 ? styledWidth : toolbar.offsetWidth
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
  }, [computePosition, items, mode, formats])

  const toggleMode = () => {
    setHintPos(null)
    updateSettings({ selectionBarMode: mode === 'format' ? 'actions' : 'format' })
  }

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
        void writeClipboardText(text).then((ok) => {
          if (!ok) return
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

  const hidden = !visible || (mode === 'actions' && items.length === 0)
  if (hidden) return null

  return createPortal(
    <>
      <SelectionToolbarView
        mode={mode}
        items={items}
        formats={formats}
        onAction={handleAction}
        onFormat={onFormat ? (action) => { setHintPos(null); onFormat(action) } : undefined}
        onToggleMode={source === 'editor' ? toggleMode : undefined}
        copiedId={copiedId}
        containerRef={toolbarRef}
        style={posStyle}
        onMouseDown={(e) => e.preventDefault()}
      />
      {hintPos && (
        <div className="selection-mode-hint" style={hintPos}>
          {t('selection.modeHint')}
        </div>
      )}
    </>,
    document.body,
  )
}
