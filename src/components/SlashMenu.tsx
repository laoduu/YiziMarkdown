/**
 * SlashMenu.tsx — 斜杠菜单组件
 *
 * Notion 风格：全图标网格布局，视觉统一、操作直觉
 * 继承主题 CSS 变量，支持深浅模式
 * 支持触发字符 / 、 和 Ins 键
 * 支持搜索过滤（隐式，输入即过滤）
 * Tab / 上下键在菜单项间循环切换焦点
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Bold, Italic, Strikethrough, Code,
  Quote, ListOrdered, List, CheckSquare,
  Heading1, Heading2, Heading3, Code2,
  Table, Link, Image, Minus,
} from 'lucide-react'
import { useI18n } from '../i18n'

/* ------------------------------------------------------------------ */
/*  菜单项定义                                                          */
/* ------------------------------------------------------------------ */

interface SlashMenuItem {
  id: string
  labelKey: string
  icon: React.ReactNode
  shortcut?: string
  keywordsKey?: string
}

/** 所有菜单项，统一为图标卡片（label 用 i18n key，渲染时解析） */
const ALL_MENU_ITEMS: SlashMenuItem[] = [
  // -- 行内格式 --
  { id: 'bold',          labelKey: 'slashmenu.bold',          icon: <Bold size={18} />,          shortcut: 'Ctrl+B' },
  { id: 'italic',        labelKey: 'slashmenu.italic',        icon: <Italic size={18} />,        shortcut: 'Ctrl+I' },
  { id: 'strikethrough', labelKey: 'slashmenu.strikethrough', icon: <Strikethrough size={18} />, shortcut: 'Ctrl+D' },
  { id: 'inlineCode',    labelKey: 'slashmenu.inlineCode',    icon: <Code size={18} />,         shortcut: 'Ctrl+E' },
  // -- 块级元素 --
  { id: 'blockquote',    labelKey: 'slashmenu.quote',         icon: <Quote size={18} />,          keywordsKey: 'slashmenu.quoteKeywords' },
  { id: 'orderedList',   labelKey: 'slashmenu.orderedList',   icon: <ListOrdered size={18} />,     keywordsKey: 'slashmenu.orderedListKeywords' },
  { id: 'unorderedList', labelKey: 'slashmenu.unorderedList', icon: <List size={18} />,           keywordsKey: 'slashmenu.unorderedListKeywords' },
  { id: 'taskList',      labelKey: 'slashmenu.taskList',      icon: <CheckSquare size={18} />,    keywordsKey: 'slashmenu.taskListKeywords' },
  // -- 标题 --
  { id: 'heading1',      labelKey: 'slashmenu.heading1',      icon: <Heading1 size={18} />,       shortcut: 'Ctrl+1' },
  { id: 'heading2',      labelKey: 'slashmenu.heading2',      icon: <Heading2 size={18} />,       shortcut: 'Ctrl+2' },
  { id: 'heading3',      labelKey: 'slashmenu.heading3',      icon: <Heading3 size={18} />,       shortcut: 'Ctrl+3' },
  // -- 插入 --
  { id: 'codeBlock',     labelKey: 'slashmenu.codeBlock',     icon: <Code2 size={18} />,         shortcut: 'Ctrl+`' },
  { id: 'table',         labelKey: 'slashmenu.table',         icon: <Table size={18} />,          shortcut: 'Ctrl+T' },
  { id: 'link',          labelKey: 'slashmenu.link',          icon: <Link size={18} />,           shortcut: 'Ctrl+K' },
  { id: 'image',         labelKey: 'slashmenu.image',         icon: <Image size={18} />,          keywordsKey: 'slashmenu.imageKeywords' },
  { id: 'horizontalRule',labelKey: 'slashmenu.horizontalRule', icon: <Minus size={18} />,          shortcut: 'Ctrl+L' },
]

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface SlashMenuProps {
  visible: boolean
  coords: { left: number; bottom: number }
  query: string
  onSelect: (id: string) => void
  onClose: () => void
}

/* ------------------------------------------------------------------ */
/*  组件                                                                */
/* ------------------------------------------------------------------ */

export default function SlashMenu({ visible, coords, query, onSelect, onClose }: SlashMenuProps) {
  const { t } = useI18n()
  const menuRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(-1)

  // 过滤菜单项
  const filteredItems = query
    ? ALL_MENU_ITEMS.filter(item => {
        const q = query.toLowerCase()
        const label = t(item.labelKey)
        const keywords = item.keywordsKey ? t(item.keywordsKey) : ''
        return (
          label.toLowerCase().includes(q) ||
          item.id.toLowerCase().includes(q) ||
          keywords.toLowerCase().includes(q) ||
          (item.shortcut || '').toLowerCase().includes(q)
        )
      })
    : ALL_MENU_ITEMS

  // 查询变化时重置选中
  useEffect(() => { setActiveIndex(-1) }, [query])

  // 可见性变化时重置
  useEffect(() => {
    if (visible) setActiveIndex(-1)
  }, [visible])

  // 键盘导航（capture 阶段，拦截所有按键）
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!visible) return

    const total = filteredItems.length
    if (total === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        e.stopPropagation()
        setActiveIndex(prev => (prev + 1) % total)
        break
      case 'ArrowUp':
        e.preventDefault()
        e.stopPropagation()
        setActiveIndex(prev => (prev <= 0 ? total - 1 : prev - 1))
        break
      case 'Tab':
        e.preventDefault()
        e.stopPropagation()
        setActiveIndex(prev => (prev + 1) % total)
        break
      case 'Enter':
        e.preventDefault()
        e.stopPropagation()
        if (activeIndex >= 0 && activeIndex < total) {
          onSelect(filteredItems[activeIndex].id)
        }
        break
      case 'Escape':
        e.preventDefault()
        e.stopPropagation()
        onClose()
        break
      default:
        break
    }
  }, [visible, filteredItems, activeIndex, onSelect, onClose])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [handleKeyDown])

  // 点击外部关闭（capture 阶段 mousedown）
  useEffect(() => {
    if (!visible) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick, true)
    return () => document.removeEventListener('mousedown', handleClick, true)
  }, [visible, onClose])

  // 滚动选中项到可见区域
  useEffect(() => {
    if (activeIndex < 0 || !menuRef.current) return
    const items = menuRef.current.querySelectorAll('[data-slash-item]')
    const target = items[activeIndex] as HTMLElement
    target?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  if (!visible) return null

  return (
    <div
      ref={menuRef}
      className="slash-menu"
      style={{
        position: 'absolute',
        left: coords.left,
        top: coords.bottom + 4,
        zIndex: 100,
      }}
    >
      {/* 图标网格 */}
      {filteredItems.length > 0 ? (
        <div className="slash-menu-grid">
          {filteredItems.map((item, idx) => {
            const isActive = idx === activeIndex
            const label = t(item.labelKey)
            return (
              <button
                key={item.id}
                data-slash-item={idx}
                className={`slash-menu-grid-item ${isActive ? 'slash-menu-active' : ''}`}
                onClick={() => onSelect(item.id)}
                onMouseEnter={() => setActiveIndex(idx)}
                title={item.shortcut ? `${label} (${item.shortcut})` : label}
              >
                <span className="slash-menu-grid-icon">{item.icon}</span>
                <span className="slash-menu-grid-label">{label}</span>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="slash-menu-empty">{t('slashmenu.noMatch')}</div>
      )}
    </div>
  )
}
