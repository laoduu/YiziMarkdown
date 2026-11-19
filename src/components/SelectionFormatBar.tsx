/**
 * SelectionFormatBar — 划词格式条的图标行。
 *
 * 与主格式工具栏同源：点击直接调用编辑器命令（toggle / 标题换级 / 列表互转），
 * 有二级项的格式（行内代码、标题、公式）hover 展开。
 *
 * ⚠️ 二级菜单必须 portal 到 body：浮动条本身 `overflow-x: auto`，
 * 直接嵌在里面的菜单会被裁掉。
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Bold, CheckSquare, Code, Heading, Highlighter, Italic, Link as LinkIcon,
  List, ListOrdered, Quote, Sigma, Strikethrough, Subscript, Superscript,
  type LucideIcon,
} from 'lucide-react'
import { useI18n } from '../i18n'
import {
  SELECTION_FORMAT_DEFS,
  type SelectionFormatAction,
  type SelectionFormatConfig,
  type SelectionFormatDef,
  type SelectionFormatId,
  type SelectionFormatMenuItem,
} from '../lib/selectionFormats'

export const SELECTION_FORMAT_ICONS: Record<SelectionFormatId, LucideIcon> = {
  bold: Bold,
  italic: Italic,
  strikethrough: Strikethrough,
  highlight: Highlighter,
  inlineCode: Code,
  superscript: Superscript,
  subscript: Subscript,
  heading: Heading,
  unorderedList: List,
  orderedList: ListOrdered,
  taskList: CheckSquare,
  quote: Quote,
  math: Sigma,
  link: LinkIcon,
}

const MENU_WIDTH = 176
const MENU_ITEM_HEIGHT = 30

interface FormatMenuState {
  menu: SelectionFormatMenuItem[]
  top: number
  left: number
}

interface FormatButtonProps {
  id: SelectionFormatId
  def: SelectionFormatDef
  interactive: boolean
  onAction?: (action: SelectionFormatAction) => void
}

function FormatButton({ id, def, interactive, onAction }: FormatButtonProps) {
  const { t } = useI18n()
  const btnRef = useRef<HTMLButtonElement>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [menu, setMenu] = useState<FormatMenuState | null>(null)
  const Icon = SELECTION_FORMAT_ICONS[id]
  const label = t(def.labelKey)

  const clearHide = () => {
    if (!hideTimer.current) return
    clearTimeout(hideTimer.current)
    hideTimer.current = null
  }
  const scheduleHide = () => {
    clearHide()
    hideTimer.current = setTimeout(() => setMenu(null), 120)
  }
  useEffect(() => () => clearHide(), [])

  const openMenu = () => {
    if (!def.menu || !interactive || !btnRef.current) return
    clearHide()
    const rect = btnRef.current.getBoundingClientRect()
    const height = def.menu.length * MENU_ITEM_HEIGHT + 8
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8))
    // 优先显示在按钮下方；贴近底部时翻到上方
    const top = rect.bottom + 6 + height > window.innerHeight - 8
      ? Math.max(8, rect.top - height - 6)
      : rect.bottom + 6
    setMenu({ menu: def.menu, top, left })
  }

  const run = (action: SelectionFormatAction) => {
    setMenu(null)
    onAction?.(action)
  }

  if (!interactive) {
    return (
      <span className="selection-format-btn" title={label}>
        <Icon size={14} />
      </span>
    )
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="selection-format-btn"
        title={label}
        aria-label={label}
        aria-haspopup={def.menu ? 'menu' : undefined}
        onMouseEnter={def.menu ? openMenu : undefined}
        onMouseLeave={def.menu ? scheduleHide : undefined}
        onFocus={def.menu ? openMenu : undefined}
        onBlur={def.menu ? scheduleHide : undefined}
        onClick={() => {
          if (def.action) run(def.action)
        }}
      >
        <Icon size={14} />
      </button>
      {menu && createPortal(
        <div
          className="selection-format-menu"
          role="menu"
          style={{ top: menu.top, left: menu.left, width: MENU_WIDTH }}
          onMouseDown={(e) => e.preventDefault()}
          onMouseEnter={clearHide}
          onMouseLeave={scheduleHide}
        >
          {menu.menu.map((item) => (
            <button
              key={item.labelKey}
              type="button"
              role="menuitem"
              className="selection-format-menu-item"
              onClick={() => run(item.action)}
            >
              {t(item.labelKey)}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}

interface SelectionFormatBarProps {
  formats: SelectionFormatConfig[]
  interactive?: boolean
  onAction?: (action: SelectionFormatAction) => void
}

export default function SelectionFormatBar({ formats, interactive = true, onAction }: SelectionFormatBarProps) {
  return (
    <div className="selection-format-bar">
      {formats.map((f) => (
        <FormatButton
          key={f.id}
          id={f.id}
          def={SELECTION_FORMAT_DEFS[f.id]}
          interactive={interactive}
          onAction={onAction}
        />
      ))}
    </div>
  )
}
