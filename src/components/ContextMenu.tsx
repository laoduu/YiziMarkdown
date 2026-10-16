/**
 * ContextMenu.tsx — 全应用共享的右键菜单（v0.3.4 右键菜单体系）。
 *
 * 背景应用右键 = webview 原生菜单；本模块提供自定义菜单的统一渲染与调度：
 *   1. 各功能区在自己的 onContextMenu 里调 `openContextMenu(x, y, items)`；
 *   2. App 挂载一个 `<ContextMenuHost/>` 负责渲染与关闭；
 *   3. 原生菜单由 App.tsx 的全局 capture 监听统一 preventDefault（编辑区豁免）。
 *
 * 关闭策略沿用 CloudBrowser 已验证的模式：点击任意处（mousedown + contains 判断）、
 * Esc、滚动。定位用 useLayoutEffect 挂载后实测尺寸钳制到窗口内（绘制前完成，无闪烁）。
 */
import { useLayoutEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import type { ReactNode } from 'react'

export interface ContextMenuItem {
  key: string
  icon?: ReactNode
  label: string
  danger?: boolean
  disabled?: boolean
  /** 在该项之前渲染一条分隔线 */
  separatorBefore?: boolean
  onClick: () => void
}

interface ContextMenuState {
  open: boolean
  x: number
  y: number
  items: ContextMenuItem[]
  openMenu: (x: number, y: number, items: ContextMenuItem[]) => void
  closeMenu: () => void
}

const useContextMenuStore = create<ContextMenuState>((set) => ({
  open: false,
  x: 0,
  y: 0,
  items: [],
  openMenu: (x, y, items) => set({ open: true, x, y, items }),
  closeMenu: () => set({ open: false, items: [] }),
}))

/** 功能区右键入口：onContextMenu 里调用即可（重复调用 = 换菜单内容） */
export function openContextMenu(x: number, y: number, items: ContextMenuItem[]) {
  useContextMenuStore.getState().openMenu(x, y, items)
}

function MenuBody({ items, onClose }: { items: ContextMenuItem[]; onClose: () => void }) {
  return (
    <>
      {items.map((item, i) => (
        <div key={item.key}>
          {item.separatorBefore && i > 0 && (
            <div className="my-1 mx-2 border-t border-[var(--editor-border)]" />
          )}
          <button
            disabled={item.disabled}
            onClick={() => { onClose(); item.onClick() }}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left
              ${item.disabled ? 'opacity-40 cursor-default' : 'hover:bg-[var(--editor-hover)]'}
              ${item.danger ? 'text-red-500' : 'text-[var(--editor-text)]'}`}
          >
            {item.icon}
            <span className="truncate">{item.label}</span>
          </button>
        </div>
      ))}
    </>
  )
}

/** App 挂载一次的宿主：负责渲染当前菜单 + 定位钳制 + 关闭监听 */
export function ContextMenuHost() {
  const open = useContextMenuStore((s) => s.open)
  const x = useContextMenuStore((s) => s.x)
  const y = useContextMenuStore((s) => s.y)
  const items = useContextMenuStore((s) => s.items)
  const closeMenu = useContextMenuStore((s) => s.closeMenu)
  const ref = useRef<HTMLDivElement>(null)
  /** 钳制后的最终位置；null = 还没实测，先用原始 x/y 渲染 */
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  // 每次打开/换菜单：重置位置并在绘制前实测钳制（useLayoutEffect 无闪烁）
  useLayoutEffect(() => {
    if (!open) return
    const r = ref.current?.getBoundingClientRect()
    const w = r?.width ?? 160
    const h = r?.height ?? 120
    setPos({
      x: Math.max(4, Math.min(x, window.innerWidth - w - 4)),
      y: Math.max(4, Math.min(y, window.innerHeight - h - 4)),
    })
  }, [open, x, y, items])

  // 关闭：点击任意处（菜单内不算）、Esc、滚动。
  // mousedown 必须 capture：内容区外层有 onMouseDown stopPropagation（防焦点泄漏的既有逻辑），
  // 冒泡阶段的 window 监听会收不到 —— capture 在一切冒泡拦截之前触发。
  useLayoutEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && ref.current.contains(e.target as Node)) return
      closeMenu()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeMenu() }
    const onScroll = () => closeMenu()
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, closeMenu])

  if (!open) return null

  const shown = pos ?? { x, y }
  return (
    <div
      ref={ref}
      className="fixed z-[9500] min-w-[140px] max-w-[240px] py-1 rounded-lg shadow-xl
        border border-[var(--editor-border)] bg-[var(--editor-bg)] text-[var(--editor-text)]"
      style={{ left: shown.x, top: shown.y }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <MenuBody items={items} onClose={closeMenu} />
    </div>
  )
}
