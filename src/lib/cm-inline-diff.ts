/**
 * cm-inline-diff.ts — 文档内 AI 的「正文内 diff」预览。
 *
 * 用块级 replace 装饰把选区临时替换成一张 diff 卡（红删 / 绿增），
 * 只做展示：文档内容不动，关闭对比或关闭浮层后立即还原。
 *
 * 由 InlineAIPanel 通过 `setInlineDiff` effect 驱动，Editor 在关闭 / 应用 / 切标签时清空。
 */
import { StateEffect, StateField } from '@codemirror/state'
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view'
import type { DiffLine } from './inlineAI'

class InlineDiffWidget extends WidgetType {
  constructor(readonly lines: DiffLine[]) {
    super()
  }

  eq(other: InlineDiffWidget): boolean {
    return other.lines.length === this.lines.length
      && other.lines.every((line, i) => line.type === this.lines[i].type && line.text === this.lines[i].text)
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'cm-inline-diff'
    for (const line of this.lines) {
      const row = document.createElement('div')
      row.className = `cm-inline-diff-line cm-inline-diff-${line.type}`
      const sign = line.type === 'add' ? '+ ' : line.type === 'del' ? '− ' : '  '
      row.textContent = sign + (line.text || ' ')
      wrap.appendChild(row)
    }
    return wrap
  }

  /** 预览是只读的，点击不要落进编辑器 */
  ignoreEvent(): boolean {
    return true
  }
}

export interface InlineDiffRange {
  from: number
  to: number
  lines: DiffLine[]
}

export const setInlineDiff = StateEffect.define<InlineDiffRange | null>()

export const inlineDiffField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    for (const effect of tr.effects) {
      if (!effect.is(setInlineDiff)) continue
      if (!effect.value) return Decoration.none
      const { from, to, lines } = effect.value
      if (from >= to) return Decoration.none
      return Decoration.set([
        Decoration.replace({ block: true, widget: new InlineDiffWidget(lines) }).range(from, to),
      ])
    }
    return deco.map(tr.changes)
  },
  provide: (field) => EditorView.decorations.from(field),
})
