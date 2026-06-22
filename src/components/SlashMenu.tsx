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

/* ------------------------------------------------------------------ */
/*  菜单项定义                                                          */
/* ------------------------------------------------------------------ */

interface SlashMenuItem {
  id: string
  label: string
  icon: React.ReactNode
  shortcut?: string
  keywords?: string
}

/** 所有菜单项，统一为图标卡片 */
const ALL_MENU_ITEMS: SlashMenuItem[] = [
  // -- 行内格式 --
  { id: 'bold',          label: '粗体',     icon: <Bold size={18} />,          shortcut: 'Ctrl+B' },
  { id: 'italic',        label: '斜体',     icon: <Italic size={18} />,        shortcut: 'Ctrl+I' },
  { id: 'strikethrough', label: '删除线',  icon: <Strikethrough size={18} />, shortcut: 'Ctrl+D' },
  { id: 'inlineCode',    label: '行内代码', icon: <Code size={18} />,         shortcut: 'Ctrl+E' },
  // -- 块级元素 --
  { id: 'blockquote',    label: '引用',     icon: <Quote size={18} />,          keywords: '引用块' },
  { id: 'orderedList',   label: '有序列表', icon: <ListOrdered size={18} />,     keywords: '数字列表' },
  { id: 'unorderedList', label: '无序列表', icon: <List size={18} />,           keywords: '符号列表' },
  { id: 'taskList',      label: '任务列表', icon: <CheckSquare size={18} />,    keywords: '待办事项 checkbox' },
  // -- 标题 --
  { id: 'heading1',      label: '一级标题', icon: <Heading1 size={18} />,       shortcut: 'Ctrl+1' },
  { id: 'heading2',      label: '二级标题', icon: <Heading2 size={18} />,       shortcut: 'Ctrl+2' },
  { id: 'heading3',      label: '三级标题', icon: <Heading3 size={18} />,       shortcut: 'Ctrl+3' },
  // -- 插入 --
  { id: 'codeBlock',     label: '代码块',   icon: <Code2 size={18} />,         shortcut: 'Ctrl+`' },
  { id: 'table',         label: '表格',     icon: <Table size={18} />,          shortcut: 'Ctrl+T' },
  { id: 'link',          label: '链接',     icon: <Link size={18} />,           shortcut: 'Ctrl+K' },
  { id: 'image',         label: '图片',     icon: <Image size={18} />,          keywords: '插图' },
  { id: 'horizontalRule',label: '分割线',   icon: <Minus size={18} />,          shortcut: 'Ctrl+L' },
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
  const menuRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(-1)

  // 过滤菜单项
  const filteredItems = query
    ? ALL_MENU_ITEMS.filter(item => {
        const q = query.toLowerCase()
        return (
          item.label.toLowerCase().includes(q) ||
          item.id.toLowerCase().includes(q) ||
          (item.keywords || '').toLowerCase().includes(q) ||
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
            return (
              <button
                key={item.id}
                data-slash-item={idx}
                className={`slash-menu-grid-item ${isActive ? 'slash-menu-active' : ''}`}
                onClick={() => onSelect(item.id)}
                onMouseEnter={() => setActiveIndex(idx)}
                title={item.shortcut ? `${item.label} (${item.shortcut})` : item.label}
              >
                <span className="slash-menu-grid-icon">{item.icon}</span>
                <span className="slash-menu-grid-label">{item.label}</span>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="slash-menu-empty">无匹配项</div>
      )}
    </div>
  )
}
