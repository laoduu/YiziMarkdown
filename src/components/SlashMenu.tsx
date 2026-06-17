/**
 * SlashMenu.tsx — 斜杠菜单组件
 *
 * Typora 风格：顶部图标快捷区 + 底部分类文本列表
 * 继承主题 CSS 变量，支持深浅模式
 * 支持触发字符 / 、 和 Ins 键
 * 支持搜索过滤（隐式，输入即过滤）
 * Tab 键在菜单项间循环切换焦点
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Bold, Italic, Strikethrough, Code,
  Quote, ListOrdered, List, CheckSquare,
} from 'lucide-react'
import { SHORTCUT_ACTIONS } from '../lib/keybindings'

/* ------------------------------------------------------------------ */
/*  菜单项定义                                                          */
/* ------------------------------------------------------------------ */

interface QuickIcon {
  id: string
  label: string
  icon: React.ReactNode
}

interface MenuItem {
  id: string
  label: string
  shortcut?: string
  keywords?: string
}

/** 顶部图标快捷区：高频行内格式 */
const QUICK_ICONS: QuickIcon[] = [
  { id: 'bold',          label: '粗体',     icon: <Bold size={15} /> },
  { id: 'italic',        label: '斜体',     icon: <Italic size={15} /> },
  { id: 'strikethrough', label: '删除线',   icon: <Strikethrough size={15} /> },
  { id: 'inlineCode',    label: '行内代码',  icon: <Code size={15} /> },
  { id: 'blockquote',    label: '引用',     icon: <Quote size={15} /> },
  { id: 'orderedList',   label: '有序列表', icon: <ListOrdered size={15} /> },
  { id: 'unorderedList', label: '无序列表', icon: <List size={15} /> },
  { id: 'taskList',      label: '任务列表', icon: <CheckSquare size={15} /> },
]

/** 底部分类文本列表（标题仅保留1-3级，4-6级用户手动输入#即可） */
const MENU_ITEMS: MenuItem[] = [
  { id: 'heading1', label: '一级标题',   shortcut: 'Ctrl+1' },
  { id: 'heading2', label: '二级标题',   shortcut: 'Ctrl+2' },
  { id: 'heading3', label: '三级标题',   shortcut: 'Ctrl+3' },
  { id: 'codeBlock',     label: '代码块',   shortcut: 'Ctrl+`' },
  { id: 'table',         label: '表格',     shortcut: 'Ctrl+T' },
  { id: 'link',          label: '链接',     shortcut: 'Ctrl+K' },
  { id: 'image',         label: '图片' },
  { id: 'horizontalRule',label: '分割线',   shortcut: 'Ctrl+L' },
]

/** 所有菜单项合集（用于搜索过滤） */
const ALL_ITEMS: MenuItem[] = [
  ...QUICK_ICONS.map(q => ({
    id: q.id, label: q.label,
    shortcut: SHORTCUT_ACTIONS.find(a => a.id === q.id)?.defaultKey || '',
    keywords: '',
  })),
  ...MENU_ITEMS,
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
    ? ALL_ITEMS.filter(item => {
        const q = query.toLowerCase()
        return (
          item.label.toLowerCase().includes(q) ||
          item.id.toLowerCase().includes(q) ||
          (item.keywords || '').toLowerCase().includes(q) ||
          (item.shortcut || '').toLowerCase().includes(q)
        )
      })
    : ALL_ITEMS

  // 过滤后的图标项和文本项
  const filteredQuickIcons = filteredItems.filter(i => QUICK_ICONS.some(q => q.id === i.id))
  const filteredTextItems = filteredItems.filter(i => !QUICK_ICONS.some(q => q.id === i.id))

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
        // Tab 键在菜单项间循环
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
        // 其他可打印字符：不做任何处理，让事件穿透到编辑器
        // StateField 检测到 docChanged 会自动关闭菜单
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
      {/* ===== 图标快捷区 ===== */}
      {filteredQuickIcons.length > 0 && (
        <div className="slash-menu-quick-icons">
          {QUICK_ICONS.map(qi => {
            const idx = filteredItems.findIndex(i => i.id === qi.id)
            const isActive = idx === activeIndex
            return (
              <button
                key={qi.id}
                data-slash-item={idx}
                className={`slash-menu-icon-btn ${isActive ? 'slash-menu-active' : ''}`}
                onClick={() => onSelect(qi.id)}
                onMouseEnter={() => setActiveIndex(idx)}
                title={qi.label}
              >
                {qi.icon}
              </button>
            )
          })}
        </div>
      )}

      {/* ===== 文本列表 ===== */}
      {filteredTextItems.length > 0 && (
        <>
          <div className="slash-menu-divider" />
          {filteredTextItems.map((item) => {
            const globalIdx = filteredItems.findIndex(fi => fi.id === item.id)
            const isActive = globalIdx === activeIndex
            return (
              <button
                key={item.id}
                data-slash-item={globalIdx}
                className={`slash-menu-item ${isActive ? 'slash-menu-active' : ''}`}
                onClick={() => onSelect(item.id)}
                onMouseEnter={() => setActiveIndex(globalIdx)}
              >
                <span className="slash-menu-item-label">{item.label}</span>
                {item.shortcut && (
                  <span className="slash-menu-item-shortcut">{item.shortcut}</span>
                )}
              </button>
            )
          })}
        </>
      )}

      {/* 空状态 */}
      {filteredItems.length === 0 && (
        <div className="slash-menu-empty">无匹配项</div>
      )}
    </div>
  )
}
