/**
 * cm-selection-toolbar.ts — 划词助手 CodeMirror 6 扩展
 *
 * 监听选区变化，当用户选中文本时通知前端显示浮动工具栏。
 * 选区清空时通知前端隐藏工具栏。
 *
 * 定位策略：使用选区起点 (from) 的坐标，锚点 (anchor) 变化时才更新位置。
 * 拖拽过程中 anchor 不变，工具栏位置固定不动。
 */

import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view'

export interface SelectionToolbarInfo {
  x: number
  y: number
  text: string
}

export function selectionToolbarExtension(
  onShow: (info: SelectionToolbarInfo) => void,
  onHide: () => void,
) {
  let pendingRaf = 0
  return ViewPlugin.fromClass(
    class {
      private latestView: EditorView | null = null
      private latestText = ''
      private lastAnchor = -1

      update(update: ViewUpdate) {
        if (update.selectionSet || update.docChanged) {
          this.checkSelection(update.view)
        }
      }

      private checkSelection(view: EditorView) {
        const { from, to, anchor } = view.state.selection.main

        // 选区清空 → 隐藏
        if (from === to) {
          if (pendingRaf) cancelAnimationFrame(pendingRaf)
          this.lastAnchor = -1
          onHide()
          return
        }

        const text = view.state.sliceDoc(from, to)
        if (text.trim().length < 2) {
          if (pendingRaf) cancelAnimationFrame(pendingRaf)
          this.lastAnchor = -1
          onHide()
          return
        }

        const anchorChanged = anchor !== this.lastAnchor
        this.lastAnchor = anchor
        this.latestText = text

        // 锚点变化 = 新选区开始，需要更新位置
        // 锚点不变 = 拖拽中，只更新文字，不移动工具栏
        if (anchorChanged) {
          this.latestView = view
          if (pendingRaf) cancelAnimationFrame(pendingRaf)
          pendingRaf = requestAnimationFrame(() => {
            pendingRaf = 0
            const v = this.latestView
            if (!v) return
            const coords = v.coordsAtPos(from)
            if (!coords) {
              onHide()
              return
            }
            onShow({ x: coords.left, y: coords.top, text: this.latestText })
          })
        } else {
          // 拖拽中：只更新文字内容，不重新定位
          onShow({ x: -1, y: -1, text: this.latestText })
        }
      }

      destroy() {
        if (pendingRaf) cancelAnimationFrame(pendingRaf)
      }
    },
  )
}
