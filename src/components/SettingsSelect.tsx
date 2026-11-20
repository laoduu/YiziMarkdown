/**
 * SettingsSelect.tsx — 设置页 / 插件导出弹窗专用的自绘下拉。
 *
 * 为什么不用原生 `<select>`：展开后的列表由 WebView 自己画（WebKitGTK / WKWebView 走
 * 系统主题，深色主题里会突然冒出一块浅色列表），箭头字形也不跟主题；`color-scheme`
 * 只能救一部分平台。这里改成「按钮 + 主题化列表」：背景 / 边框 / 悬停 / 选中全部走
 * `--menu-*` 与 `--editor-*` 令牌，三平台一致。
 *
 * 交互：点击开合；↑↓ / Home / End 移动高亮，Enter 选中，Esc 关闭并回到按钮；
 * 点击外部、滚动页面、窗口缩放都关闭（与右键菜单同一套关闭策略）。
 * 列表 portal 到 body：设置内容区是滚动容器，就地渲染会被裁切。
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import { computeSelectPosition, type SelectMenuPosition } from '../lib/selectPosition'

export interface SettingsSelectOption {
  value: string
  label: string
}

interface SettingsSelectProps {
  value: string
  options: SettingsSelectOption[]
  onChange: (value: string) => void
  /** 触发按钮的无障碍名称（视觉上由左侧字段名承担，`Row` 里没有 <label>） */
  ariaLabel?: string
  /** 当前值不在 options 里时显示的占位文字 */
  placeholder?: string
  disabled?: boolean
  className?: string
}

export default function SettingsSelect({
  value,
  options,
  onChange,
  ariaLabel,
  placeholder,
  disabled = false,
  className,
}: SettingsSelectProps) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [pos, setPos] = useState<SelectMenuPosition | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  const selectedIndex = options.findIndex((o) => o.value === value)
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined

  const close = (focusTrigger = false) => {
    setOpen(false)
    setActive(-1)
    if (focusTrigger) triggerRef.current?.focus()
  }

  const openMenu = (start?: number) => {
    if (disabled) return
    setActive(start ?? Math.max(selectedIndex, 0))
    setOpen(true)
  }

  // 定位：绘制前实测并夹到视口内（useLayoutEffect ⇒ 首帧即最终位置，不闪）
  useLayoutEffect(() => {
    if (!open) { setPos(null); return }
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const height = listRef.current?.offsetHeight ?? 0
    setPos(computeSelectPosition(
      rect,
      height,
      { width: window.innerWidth, height: window.innerHeight },
    ))
  }, [open, options.length])

  // 关闭策略：点击外部 / Esc / 滚动 / 缩放
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (listRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      close()
    }
    const onScroll = (e: Event) => {
      // 列表自身滚动（键盘移动高亮）不算
      if (listRef.current?.contains(e.target as Node)) return
      close()
    }
    const onResize = () => close()
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  // 高亮项跟随键盘/鼠标移动，滚到可视区内（block: 'nearest' 不惊动外层容器）
  useEffect(() => {
    if (!open || active < 0) return
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  const pick = (index: number) => {
    const option = options[index]
    if (!option) return
    if (option.value !== value) onChange(option.value)
    close(true)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        openMenu(e.key === 'ArrowUp' ? Math.max(options.length - 1, 0) : undefined)
      }
      return
    }
    switch (e.key) {
      case 'Escape':
        e.preventDefault()
        close(true)
        break
      case 'ArrowDown':
        e.preventDefault()
        setActive((i) => Math.min(i + 1, options.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActive((i) => Math.max(i - 1, 0))
        break
      case 'Home':
        e.preventDefault()
        setActive(0)
        break
      case 'End':
        e.preventDefault()
        setActive(options.length - 1)
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        pick(active)
        break
      case 'Tab':
        close()
        break
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={handleKeyDown}
        className={`settings-select settings-select-trigger ${className ?? ''}`}
      >
        <span className="flex-1 min-w-0 truncate text-left">{selected?.label ?? placeholder ?? ''}</span>
        <ChevronDown
          size={14}
          aria-hidden="true"
          className={`shrink-0 opacity-70 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && createPortal(
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          style={pos
            ? { left: pos.left, top: pos.top, width: pos.width, maxHeight: pos.maxHeight }
            : { left: 0, top: 0, visibility: 'hidden' }}
          className="fixed z-[2147483647] py-1 overflow-y-auto rounded-lg
            border border-[var(--menu-border)] bg-[var(--menu-bg)] text-[var(--menu-fg)]
            shadow-[var(--menu-shadow)]"
          onMouseDown={(e) => e.preventDefault()}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value
            return (
              <div
                key={option.value}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(index)}
                className={`flex items-center gap-2 px-2.5 py-1.5 text-[0.75rem] cursor-pointer
                  ${index === active ? 'bg-[var(--menu-hover)]' : ''}
                  ${isSelected ? 'text-[var(--editor-accent)]' : ''}`}
              >
                <span className="flex-1 truncate">{option.label}</span>
                {isSelected && <Check size={12} className="shrink-0" />}
              </div>
            )
          })}
          {options.length === 0 && (
            <div className="px-2.5 py-1.5 text-[0.75rem] text-[var(--menu-fg-muted)]">—</div>
          )}
        </div>,
        document.body,
      )}
    </>
  )
}
