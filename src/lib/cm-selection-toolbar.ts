/**
 * cm-selection-toolbar.ts — 划词助手 CodeMirror 6 扩展
 *
 * 监听选区变化，等选区「落定」后通知前端显示浮动工具栏。
 *
 * 时机策略（为什么不在划词过程中显示）：
 * - 拖拽/按键过程中选区每帧都在变，按行量化的坐标会让浮栏上下跳（反向拖选尤其明显）；
 * - 用户松手（或停手）之前根本没法点浮栏，提前显示只有抖动没有收益。
 * 所以：pointerdown / 选区变化时先收起，pointerup 立即定位；键盘等非指针选区变化
 * 用 150ms 静默防抖，停手后定位一次。
 *
 * 定位策略：上报选区包围盒的「水平中心 + 顶边」，由浮栏居中放置。
 * 单行选区取首尾字符的真实左右边缘；跨行选区取正文列宽（中间行本来就占满整列）。
 *
 * 历史坑：这里曾用「anchor 变化才定位，拖拽中上报 x/y = -1」表示「不重定位」。
 * -1 会覆盖掉上一次的真实坐标，而前端遇到负坐标会跳过重算；一旦真实坐标那次更新
 * 被紧随其后的拖拽更新合并进同一次渲染，工具栏就会永久停在旧位置。现在不再发送
 * 任何哨兵值。
 */

import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view'

export interface SelectionToolbarInfo {
  /** 选区包围盒的水平中心（视口坐标）；浮栏以它为基准居中 */
  x: number
  /** 选区包围盒的顶边（视口坐标）；浮栏贴在这一行上方 */
  y: number
  text: string
  /** 选区在文档中的起止位置（文档内 AI 替换正文时用） */
  from: number
  to: number
  /** 选区来源：源码/实时编辑器，或预览面板 */
  source: 'editor' | 'preview'
}

/** 键盘选词停手后多久算「落定」 */
const KEYBOARD_SETTLE_MS = 150

export function selectionToolbarExtension(
  onShow: (info: SelectionToolbarInfo) => void,
  onHide: () => void,
  /** 刚点过格式条 ⇒ 这一次选区/文档变化来自浮栏自己，不要收起 */
  isToolbarAction?: () => boolean,
) {
  return ViewPlugin.fromClass(
    class {
      private view: EditorView
      private pendingRaf = 0
      private settleTimer = 0
      /** 指针按着 = 正在拖选，期间不显示 */
      private pointerSelecting = false
      private shown = false
      private selection: { from: number; to: number; text: string } | null = null

      constructor(view: EditorView) {
        this.view = view
        view.dom.addEventListener('pointerdown', this.onPointerDown)
        window.addEventListener('pointerup', this.onPointerUp, true)
        window.addEventListener('pointercancel', this.onPointerUp, true)
        window.addEventListener('pointermove', this.onPointerMove, true)
      }

      update(update: ViewUpdate) {
        if (!update.selectionSet && !update.docChanged) return
        const { from, to } = update.view.state.selection.main
        const text = from < to ? update.view.state.sliceDoc(from, to) : ''

        if (from === to || text.trim().length < 2) {
          this.selection = null
          this.cancelPending()
          this.hide()
          return
        }

        this.view = update.view
        this.selection = { from, to, text }

        if (this.pointerSelecting) {
          // 拖选进行中：只记录最新选区，等松手再定位
          this.cancelPending()
          this.hide()
          return
        }

        // 浮栏自己的动作（点加粗/列表等）：原地刷新，不收起也不等防抖
        if (isToolbarAction?.()) {
          this.cancelPending()
          this.scheduleShow(0)
          return
        }

        // 键盘 / 程序化选区变化：先收起，停手后再出现
        this.cancelPending()
        this.hide()
        this.scheduleShow(KEYBOARD_SETTLE_MS)
      }

      private onPointerDown = () => {
        this.pointerSelecting = true
        this.cancelPending()
        this.hide()
      }

      private onPointerMove = (e: PointerEvent) => {
        // 指针在窗口外松开时收不到 pointerup：用「移动时按键已松开」兜底
        if (this.pointerSelecting && e.buttons === 0) this.endPointerSelection()
      }

      private onPointerUp = () => {
        if (this.pointerSelecting) this.endPointerSelection()
      }

      private endPointerSelection() {
        this.pointerSelecting = false
        this.cancelPending()
        // 等下一帧再测量：让松手后的布局（选中高亮、实时模式装饰）稳定下来
        this.scheduleShow(0)
      }

      private cancelPending() {
        if (this.pendingRaf) {
          cancelAnimationFrame(this.pendingRaf)
          this.pendingRaf = 0
        }
        if (this.settleTimer) {
          clearTimeout(this.settleTimer)
          this.settleTimer = 0
        }
      }

      private hide() {
        if (!this.shown) return
        this.shown = false
        onHide()
      }

      private scheduleShow(delay: number) {
        if (delay > 0) {
          this.settleTimer = window.setTimeout(() => {
            this.settleTimer = 0
            this.show()
          }, delay)
          return
        }
        this.pendingRaf = requestAnimationFrame(() => {
          this.pendingRaf = 0
          this.show()
        })
      }

      private show() {
        const sel = this.selection
        const view = this.view
        if (!sel || !view) return
        // 等待期间选区可能已经变了：以最新状态为准，别显示过期内容
        const main = view.state.selection.main
        if (main.empty || main.from !== sel.from || main.to !== sel.to) return

        const anchor = selectionAnchor(view, sel.from, sel.to)
        if (!anchor) {
          this.hide()
          return
        }
        this.shown = true
        onShow({
          x: anchor.x,
          y: anchor.y,
          text: sel.text,
          from: sel.from,
          to: sel.to,
          source: 'editor',
        })
      }

      destroy() {
        this.cancelPending()
        this.view.dom.removeEventListener('pointerdown', this.onPointerDown)
        window.removeEventListener('pointerup', this.onPointerUp, true)
        window.removeEventListener('pointercancel', this.onPointerUp, true)
        window.removeEventListener('pointermove', this.onPointerMove, true)
      }
    },
  )
}

/**
 * 选区包围盒的锚点：水平中心 + 顶边（视口坐标）。
 * 单行取首尾字符的真实边缘；跨行取正文列宽（中间行占满整列）。
 */
export function selectionAnchor(view: EditorView, from: number, to: number): { x: number; y: number } | null {
  const start = view.coordsAtPos(from, -1)
  if (!start) return null
  const end = view.coordsAtPos(to, 1)

  // 注意：判「同一行」必须看**视觉行**，不能用 doc.lineAt —— 软换行的段落是一个
  // 文档行、却渲染成多行；只看文档行会把多行选区当成单行，包围盒宽度就只剩
  // 首行起点到末行终点，浮栏会明显偏左。
  const sameLine = !!end && Math.abs(end.top - start.top) < 1
  let left: number
  let right: number

  if (sameLine && end) {
    left = start.left
    right = end.right
  } else {
    const content = view.contentDOM.getBoundingClientRect()
    const style = getComputedStyle(view.contentDOM)
    const padLeft = Number.parseFloat(style.paddingLeft) || 0
    const padRight = Number.parseFloat(style.paddingRight) || 0
    left = content.left + padLeft
    right = Math.max(left, content.right - padRight)
  }

  return { x: (left + right) / 2, y: start.top }
}
