/**
 * 划词工具栏的纯展示视图。
 *
 * 真实浮动工具栏与设置页预览共用，保证按钮顺序、图标、文字完全一致。
 */
import { Check, ClipboardPaste, Copy, MessageSquarePlus } from 'lucide-react'
import { useI18n } from '../i18n'
import type { SelectionToolbarItem, SelectionSystemAction } from '../lib/selectionActions'
import SkillIcon from './SkillIcon'

const APP_ICON_URL = new URL('../assets/app-icon.png', import.meta.url).href

const SYSTEM_ICONS: Record<SelectionSystemAction, typeof Copy> = {
  copy: Copy,
  paste: ClipboardPaste,
  chat: MessageSquarePlus,
}

interface SelectionToolbarViewProps {
  items: SelectionToolbarItem[]
  /** false = 设置页预览（不响应点击） */
  interactive?: boolean
  onAction?: (item: SelectionToolbarItem) => void
  /** 复制成功后短暂替换图标 / 文案 */
  copiedId?: string | null
  className?: string
  containerRef?: React.Ref<HTMLDivElement>
  style?: React.CSSProperties
  onMouseDown?: React.MouseEventHandler<HTMLDivElement>
}

export default function SelectionToolbarView({
  items,
  interactive = true,
  onAction,
  copiedId = null,
  className = '',
  containerRef,
  style,
  onMouseDown,
}: SelectionToolbarViewProps) {
  const { t } = useI18n()

  return (
    <div
      ref={containerRef}
      style={style}
      onMouseDown={onMouseDown}
      className={`selection-toolbar ${interactive ? '' : 'selection-toolbar-preview'} ${className}`}
      role={interactive ? undefined : 'img'}
      aria-label={interactive ? undefined : t('settings.selectionPreview')}
    >
      <img src={APP_ICON_URL} alt="" className="selection-toolbar-icon" />
      <div className="selection-toolbar-divider" />
      {items.map((item) => {
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
      })}
    </div>
  )
}
