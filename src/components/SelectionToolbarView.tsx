/**
 * 划词工具栏 / 格式条的纯展示视图。
 *
 * 真实浮动栏与设置页预览共用：左侧星芒打开文档内 AI，
 * 右侧按 mode 渲染「功能按钮」或「格式图标」，最右端是两栏切换。
 */
import { ArrowLeftRight, Check, ClipboardPaste, Copy, MessageSquarePlus } from 'lucide-react'
import { useI18n } from '../i18n'
import type { SelectionToolbarItem, SelectionSystemAction } from '../lib/selectionActions'
import type { SelectionFormatAction, SelectionFormatConfig } from '../lib/selectionFormats'
import SelectionFormatBar from './SelectionFormatBar'
import SelectionAIIcon from './SelectionAIIcon'
import SkillIcon from './SkillIcon'

const SYSTEM_ICONS: Record<SelectionSystemAction, typeof Copy> = {
  copy: Copy,
  paste: ClipboardPaste,
  chat: MessageSquarePlus,
}

export type SelectionBarMode = 'actions' | 'format'

interface SelectionToolbarViewProps {
  mode?: SelectionBarMode
  items: SelectionToolbarItem[]
  /** mode = format 时显示的格式（已按用户顺序与显示开关过滤） */
  formats?: SelectionFormatConfig[]
  /** false = 设置页预览（不响应点击） */
  interactive?: boolean
  onAction?: (item: SelectionToolbarItem) => void
  onFormat?: (action: SelectionFormatAction) => void
  /** 左侧星芒：对选中内容打开文档内 AI */
  onAskAI?: () => void
  /** 右侧切换按钮：工具条 ↔ 格式条 */
  onToggleMode?: () => void
  /** 复制成功后短暂替换图标 / 文案 */
  copiedId?: string | null
  className?: string
  containerRef?: React.Ref<HTMLDivElement>
  style?: React.CSSProperties
  onMouseDown?: React.MouseEventHandler<HTMLDivElement>
}

export default function SelectionToolbarView({
  mode = 'actions',
  items,
  formats = [],
  interactive = true,
  onAction,
  onFormat,
  onAskAI,
  onToggleMode,
  copiedId = null,
  className = '',
  containerRef,
  style,
  onMouseDown,
}: SelectionToolbarViewProps) {
  const { t } = useI18n()
  const toggleLabel = mode === 'format' ? t('selection.switchToActions') : t('selection.switchToFormats')
  const askLabel = t('selection.askAI')

  return (
    <div
      ref={containerRef}
      style={style}
      onMouseDown={onMouseDown}
      className={`selection-toolbar ${interactive ? '' : 'selection-toolbar-preview'} ${mode === 'format' ? 'selection-toolbar-mode-format' : ''} ${className}`}
      role={interactive ? undefined : 'img'}
      aria-label={interactive ? undefined : t('settings.selectionPreview')}
    >
      <div className="selection-toolbar-brand">
        {interactive && onAskAI ? (
          <button
            type="button"
            className="selection-toolbar-icon-btn"
            onClick={onAskAI}
            title={askLabel}
            aria-label={askLabel}
          >
            <SelectionAIIcon size={16} className="selection-toolbar-icon" />
          </button>
        ) : (
          <SelectionAIIcon size={16} className="selection-toolbar-icon" />
        )}
        <div className="selection-toolbar-divider" />
      </div>
      <div className="selection-toolbar-scroll">
        {mode === 'format' ? (
          <SelectionFormatBar formats={formats} interactive={interactive} onAction={onFormat} />
        ) : (
          items.map((item) => {
            const copied = copiedId === item.id
            const SystemIcon = item.systemAction ? SYSTEM_ICONS[item.systemAction] : null
            const icon = copied
              ? <Check size={13} className="text-emerald-500" />
              : SystemIcon
                ? <SystemIcon size={13} />
                : <SkillIcon name={item.iconName} size={13} />
            const label = copied ? t('selection.copied') : item.label
            if (!interactive) {
              return (
                <span key={item.id} className="selection-toolbar-btn">
                  {icon}
                  <span>{label}</span>
                </span>
              )
            }
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onAction?.(item)}
                className="selection-toolbar-btn"
                title={label}
              >
                {icon}
                <span>{label}</span>
              </button>
            )
          })
        )}
      </div>
      {interactive && onToggleMode && (
        <button
          type="button"
          className="selection-toolbar-mode-btn"
          onClick={onToggleMode}
          title={toggleLabel}
          aria-label={toggleLabel}
        >
          <ArrowLeftRight size={12} />
        </button>
      )}
    </div>
  )
}
