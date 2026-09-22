/**
 * cm-live-render.ts — WYSIWYG "live edit" CM6 extension for YiziMarkdown
 *
 * Ported from SoloMD's cm-live-render.ts v2.3.
 * Caret reveal model: when the cursor is on the same line as a marker,
 * the raw markdown is shown so it stays editable.
 *
 * Inline decorations handled here.
 * Block-level (tables, images) handled in cm-live-blocks.ts
 */

import { syntaxTree, HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import type { Range } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view'
import { tags as t } from '@lezer/highlight'
import { liveBlocksBundle } from './cm-live-blocks'
import { frontMatterField } from './cm-frontmatter'
import { propertiesPanel } from './cm-properties'

const HIDDEN_MARK_NODES = new Set<string>([
  'HeaderMark', 'EmphasisMark', 'StrikethroughMark',
  'CodeMark', 'LinkMark', 'QuoteMark', 'LinkTitle', 'CodeInfo',
])

const headingClass = (level: number) =>
  Decoration.mark({ class: `cm-md-h cm-md-h${level}`, inclusive: false })
const strongMark = Decoration.mark({ class: 'cm-md-strong' })
const emMark = Decoration.mark({ class: 'cm-md-em' })
const strikeMark = Decoration.mark({ class: 'cm-md-strike' })
const codeMark = Decoration.mark({ class: 'cm-md-code' })
const linkMark = Decoration.mark({ class: 'cm-md-link' })

const lineClass = (cls: string) => Decoration.line({ class: cls })
const quoteLine = lineClass('cm-md-quote-line')
const bulletItemLine = lineClass('cm-md-bullet-item')
const orderedItemLine = lineClass('cm-md-ordered-item')
const taskItemLine = lineClass('cm-md-task-item')
const taskItemLineChecked = lineClass('cm-md-task-item-checked')
const hrLine = lineClass('cm-md-hr-line')

/** 创建任务列表 checkbox widget，和预览模式使用同样的 appearance:auto 样式 */
class TaskCheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) { super() }
  toDOM() {
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.checked = this.checked
    cb.className = 'cm-md-task-checkbox'
    cb.style.cssText = 'appearance:auto;width:1em;height:1em;margin:0 0.5em 0 0;cursor:pointer;accent-color:var(--editor-accent);vertical-align:middle;pointer-events:none'
    return cb
  }
  eq(other: TaskCheckboxWidget) { return other.checked === this.checked }
  ignoreEvent() { return true }
}

function taskCheckboxWidget(checked: boolean) {
  return Decoration.widget({
    widget: new TaskCheckboxWidget(checked),
    side: -1,
    block: false,
  })
}

const fencedLine = lineClass('cm-md-fenced-line')
const headingLine = (level: number) => lineClass(`cm-md-heading-line cm-md-heading-line-${level}`)

const hideDeco = Decoration.mark({ class: 'cm-md-hiding-span' })

const HEADING_LEVELS: Record<string, number> = {
  ATXHeading1: 1, ATXHeading2: 2, ATXHeading3: 3,
  ATXHeading4: 4, ATXHeading5: 5, ATXHeading6: 6,
  SetextHeading1: 1, SetextHeading2: 2,
}

function buildDecorations(view: EditorView): DecorationSet {
  const sel = view.state.selection.main
  const fromLine = view.state.doc.lineAt(sel.from).number
  const toLine = view.state.doc.lineAt(sel.to).number
  const tree = syntaxTree(view.state)
  const ranges: Range<Decoration>[] = []
  const seenQuoteLines = new Set<number>()
  const seenFencedLines = new Set<number>()
  const seenHeadingLines = new Set<number>()
  const seenHrLines = new Set<number>()

  // 标记光标所在行，用于CSS过渡动画
  const caretLineClass = Decoration.line({ class: 'cm-md-caret-line' })
  // 获取动画模式
  const container = view.dom.closest('[data-animation]')
  const animMode = container?.getAttribute('data-animation') || 'blur'
  const animLineClass = Decoration.line({ class: `cm-md-anim-${animMode}` })
  for (let cl = fromLine; cl <= toLine; cl++) {
    const clObj = view.state.doc.line(cl)
    ranges.push(caretLineClass.range(clObj.from))
    ranges.push(animLineClass.range(clObj.from))
  }

  // 元信息块区间：块内一律不生成 Markdown 装饰（见下方 enter 里的说明）
  const fm = view.state.field(frontMatterField, false)

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from, to,
      enter: (node) => {
        // 元信息块内不参与 Markdown 渲染。解析器（lezer）不认识 front matter，
        // 会把第 1 行 --- 当分隔线、把 title 那行当成 setext H2 ⇒ 这里整块跳过，
        // 只留 cm-frontmatter.ts 给的"元信息块"外观。返回 false 连子节点一起跳过。
        if (fm && node.from >= fm.from && node.to <= fm.to) return false
        const name = node.name
        const nFrom = node.from
        const nTo = node.to
        const lineAtNode = view.state.doc.lineAt(nFrom).number
        const lineEndAtNode = view.state.doc.lineAt(Math.min(nTo, view.state.doc.length)).number
        const caretTouches = lineEndAtNode >= fromLine && lineAtNode <= toLine

        if (HIDDEN_MARK_NODES.has(name)) {
          if (nTo > nFrom) {
            let hideTo = nTo
            if (name === 'HeaderMark') {
              const line = view.state.doc.lineAt(nFrom)
              if (line.from === nFrom && nTo - nFrom <= 6) {
                const after = view.state.doc.sliceString(nTo, Math.min(nTo + 1, view.state.doc.length))
                if (after === ' ') hideTo = nTo + 1
              }
            }
            // 始终添加隐藏标记
            ranges.push(hideDeco.range(nFrom, hideTo))
          }
          return
        }

        if (name === 'URL') {
          const parent = node.node.parent
          if (parent && parent.name === 'Link' && nTo > nFrom) {
            ranges.push(hideDeco.range(nFrom, nTo))
          }
          return
        }

        if (HEADING_LEVELS[name]) {
          const level = HEADING_LEVELS[name]
          const lineObj = view.state.doc.lineAt(nFrom)
          if (!seenHeadingLines.has(lineObj.from)) {
            seenHeadingLines.add(lineObj.from)
            ranges.push(headingLine(level).range(lineObj.from))
          }
          if (nFrom < nTo) ranges.push(headingClass(level).range(nFrom, Math.min(nTo, view.state.doc.length)))
          return
        }

        if (name === 'StrongEmphasis' && nFrom < nTo) { ranges.push(strongMark.range(nFrom, nTo)); return }
        if (name === 'Emphasis' && nFrom < nTo) { ranges.push(emMark.range(nFrom, nTo)); return }
        if (name === 'Strikethrough' && nFrom < nTo) { ranges.push(strikeMark.range(nFrom, nTo)); return }
        if (name === 'InlineCode' && nFrom < nTo) { ranges.push(codeMark.range(nFrom, nTo)); return }
        if (name === 'Link' && nFrom < nTo) { ranges.push(linkMark.range(nFrom, nTo)); return }

        if (name === 'Blockquote') {
          const sL = view.state.doc.lineAt(nFrom).number
          const eL = view.state.doc.lineAt(Math.min(nTo, view.state.doc.length)).number
          for (let ln = sL; ln <= eL; ln++) {
            const lo = view.state.doc.line(ln)
            if (!seenQuoteLines.has(lo.from)) { seenQuoteLines.add(lo.from); ranges.push(quoteLine.range(lo.from)) }
          }
          return
        }

        if (name === 'HorizontalRule') {
          const lo = view.state.doc.lineAt(nFrom)
          if (!seenHrLines.has(lo.from)) {
            seenHrLines.add(lo.from)
            ranges.push(hideDeco.range(lo.from, lo.to))
            ranges.push(hrLine.range(lo.from))
          }
          return
        }

        if (name === 'BulletList') {
          const sL = view.state.doc.lineAt(nFrom).number
          const eL = view.state.doc.lineAt(Math.min(nTo, view.state.doc.length)).number
          for (let ln = sL; ln <= eL; ln++) {
            const lo = view.state.doc.line(ln)
            const lineText = lo.text
            // 匹配任务列表行：- [ ] / - [x] / * [ ] / + [x]
            const taskMatch = lineText.match(/^(\s*)([-*+])\s\[[ xX]\]\s/)
            if (taskMatch) {
              const markerStart = lo.from
              const markerEnd = lo.from + taskMatch[0].length // "- [ ] " or "- [x] "
              const isChecked = /\[[xX]\]/.test(lineText)
              if (!caretTouches) {
                // 隐藏标记，插入真实 checkbox widget
                ranges.push(hideDeco.range(markerStart, markerEnd))
                ranges.push(taskCheckboxWidget(isChecked).range(markerStart))
              }
              ranges.push(isChecked ? taskItemLineChecked.range(lo.from) : taskItemLine.range(lo.from))
            } else {
              // 匹配普通无序列表行：- / * / + 后跟空格
              const bulletMatch = lineText.match(/^(\s*)([-*+])\s/)
              if (bulletMatch) {
                const markerStart = lo.from + bulletMatch[1].length
                const markerEnd = markerStart + bulletMatch[2].length + 1 // marker + space
                if (!caretTouches) {
                  ranges.push(hideDeco.range(markerStart, markerEnd))
                }
                ranges.push(bulletItemLine.range(lo.from))
              }
            }
          }
          return
        }

        if (name === 'OrderedList') {
          const sL = view.state.doc.lineAt(nFrom).number
          const eL = view.state.doc.lineAt(Math.min(nTo, view.state.doc.length)).number
          for (let ln = sL; ln <= eL; ln++) {
            const lo = view.state.doc.line(ln)
            if (/^\s*\d+[.)]\s/.test(lo.text)) {
              ranges.push(orderedItemLine.range(lo.from))
            }
          }
          return
        }

        if (name === 'FencedCode' || name === 'CodeBlock') {
          const sL = view.state.doc.lineAt(nFrom).number
          const eL = view.state.doc.lineAt(Math.min(nTo, view.state.doc.length)).number
          for (let ln = sL; ln <= eL; ln++) {
            const lo = view.state.doc.line(ln)
            if (!seenFencedLines.has(lo.from)) { seenFencedLines.add(lo.from); ranges.push(fencedLine.range(lo.from)) }
          }
          return
        }
      },
    })
  }
  // 按 from 排序，同 from 时 line decoration (side < 0) 排在 mark decoration (side >= 0) 之前
  ranges.sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide)
  return Decoration.set(ranges)
}

const liveRenderPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) { this.decorations = buildDecorations(view) }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || u.selectionSet) {
        this.decorations = buildDecorations(u.view)
      }
    }
  },
  { decorations: (v) => v.decorations }
)

export const liveEditHighlightStyle = HighlightStyle.define([
  { tag: t.heading1, fontWeight: '700', color: 'var(--code-heading)' },
  { tag: t.heading2, fontWeight: '700', color: 'var(--code-heading)' },
  { tag: t.heading3, fontWeight: '700', color: 'var(--code-heading)' },
  { tag: t.heading4, fontWeight: '700', color: 'var(--code-heading)' },
  { tag: t.heading5, fontWeight: '700', color: 'var(--code-heading)' },
  { tag: t.heading6, fontWeight: '700', color: 'var(--code-heading)' },
  { tag: t.strong, fontWeight: '700', color: 'var(--code-strong)' },
  { tag: t.emphasis, fontStyle: 'italic', color: 'var(--code-emphasis)' },
  { tag: t.strikethrough, textDecoration: 'line-through', color: 'var(--code-emphasis)' },
  { tag: t.link, color: 'var(--code-link)' },
  { tag: t.url, color: 'var(--code-link)' },
  { tag: t.monospace, fontFamily: 'var(--font-mono)', color: 'var(--code-inline-fg)', backgroundColor: 'var(--code-inline-bg)', padding: '0.2em 0.4em', borderRadius: '5px' },
  { tag: t.quote, color: 'var(--code-quote-fg)', fontStyle: 'italic' },
  // t.list: removed color to prevent CSS cascade conflict with .cm-md-code inside lists
  { tag: t.contentSeparator, color: 'var(--code-comment)' },
  { tag: t.processingInstruction, color: 'var(--code-punct)' },
  { tag: t.keyword, color: 'var(--code-keyword)' },
  { tag: t.string, color: 'var(--code-string)' },
  { tag: t.number, color: 'var(--code-number)' },
  { tag: t.comment, color: 'var(--code-comment)', fontStyle: 'italic' },
  { tag: t.function(t.variableName), color: 'var(--code-function)' },
  { tag: t.variableName, color: 'var(--code-variable)' },
  { tag: t.typeName, color: 'var(--code-type)' },
  { tag: t.className, color: 'var(--code-type)' },
  { tag: t.propertyName, color: 'var(--code-variable)' },
  { tag: t.operator, color: 'var(--code-operator)' },
  { tag: t.punctuation, color: 'var(--code-punct)' },
  { tag: t.bracket, color: 'var(--code-punct)' },
  { tag: t.bool, color: 'var(--code-constant)' },
  { tag: t.null, color: 'var(--code-constant)' },
  { tag: t.tagName, color: 'var(--code-tag)' },
  { tag: t.attributeName, color: 'var(--code-attr)' },
  { tag: t.attributeValue, color: 'var(--code-string)' },
])

export const liveEditTheme = EditorView.theme({
  '.cm-line': { fontVariantLigatures: 'none' },
  '.cm-md-heading-line-1': { fontSize: '1.85em', fontWeight: '700', paddingTop: '0.4em', paddingBottom: '0.15em' },
  '.cm-md-heading-line-2': { fontSize: '1.5em', fontWeight: '700', paddingTop: '0.3em', paddingBottom: '0.1em' },
  '.cm-md-heading-line-3': { fontSize: '1.22em', fontWeight: '700' },
  '.cm-md-heading-line-4': { fontSize: '1.1em', fontWeight: '700' },
  '.cm-md-heading-line-5': { fontWeight: '700' },
  '.cm-md-heading-line-6': { fontWeight: '700', opacity: '0.6' },
  // 标题字体与预览对齐：走 --font-heading（主题设了就用主题的，没设回退到内容字体）。
  // 实时模式的定位是"可编辑的预览"，标题字体不能只继承正文字体。
  '.cm-md-h1': { color: 'var(--code-heading)', fontFamily: 'var(--font-heading)' },
  '.cm-md-h2': { color: 'var(--code-heading)', fontFamily: 'var(--font-heading)' },
  '.cm-md-h3': { color: 'var(--code-heading)', fontFamily: 'var(--font-heading)' },
  '.cm-md-h4': { color: 'var(--code-heading)', fontFamily: 'var(--font-heading)' },
  '.cm-md-h5': { color: 'var(--code-heading)', fontFamily: 'var(--font-heading)' },
  '.cm-md-h6': { color: 'var(--code-heading)', fontFamily: 'var(--font-heading)' },
  '.cm-md-strong': { fontWeight: '700', color: 'var(--code-strong)' },
  '.cm-md-em': { fontStyle: 'italic', color: 'var(--code-emphasis)' },
  '.cm-md-strike': { textDecoration: 'line-through', color: 'var(--code-emphasis)' },
  '.cm-md-code': {
    fontFamily: 'var(--font-mono)', color: 'var(--code-inline-fg)',
    backgroundColor: 'var(--code-inline-bg)',
    padding: '0.2em 0.4em', borderRadius: '5px',
  },
  '.cm-md-link': { color: 'var(--code-link)', textDecoration: 'underline', textUnderlineOffset: '2px' },
  '.cm-md-quote-line': {
    borderLeft: '3px solid var(--code-quote-bar)', paddingLeft: '12px',
    color: 'var(--code-quote-fg)', fontStyle: 'italic', backgroundColor: 'var(--code-quote-bg)',
  },
  '.cm-md-hr-line': {
    borderTop: '1px solid var(--code-comment)', minHeight: '1px',
    backgroundColor: 'transparent',
  },
  '.cm-md-fenced-line': {
    backgroundColor: 'var(--code-block-bg)',
    fontFamily: 'var(--font-mono)',
  },
  // 无序列表：隐藏标记，显示圆点
  '.cm-md-bullet-item': { paddingLeft: '1.5em', position: 'relative' },
  '.cm-md-bullet-item::before': { content: '"\u2022"', position: 'absolute', left: '0.4em', color: 'var(--editor-text)' },
  // 有序列表：保留数字标记，只加缩进
  '.cm-md-ordered-item': { paddingLeft: '0.2em' },
  // 任务列表：隐藏标记，由 widget 插入真实 checkbox
  '.cm-md-task-item': { paddingLeft: '0' },
  '.cm-md-task-item-checked': { paddingLeft: '0' },
  // 标记过渡动画：默认隐藏（caret不在行上时）
  '.cm-md-hiding-span': {
    opacity: '0',
    maxWidth: '0',
    overflow: 'hidden',
    display: 'inline-block',
    verticalAlign: 'bottom',
    whiteSpace: 'nowrap',
    transition: 'opacity 0.18s ease, max-width 0.18s ease',
  },
  // caret在行上时：显示标记
  '.cm-md-caret-line .cm-md-hiding-span': {
    opacity: '1',
    maxWidth: '5em',
  },
  // ====== 动画方案：聚焦（blur）— 默认 ======
  '.cm-md-anim-blur': {
    animation: 'live-txt-blur 0.45s ease forwards',
  },
  '@keyframes live-txt-blur': {
    '0%': { filter: 'blur(2px)' },
    '100%': { filter: 'blur(0)' },
  },

  // ====== 动画方案：闪光（flash） ======
  '.cm-md-anim-flash': {
    animation: 'live-txt-flash 0.5s ease forwards',
  },
  '@keyframes live-txt-flash': {
    '0%': { filter: 'brightness(1)' },
    '30%': { filter: 'brightness(1.5)' },
    '100%': { filter: 'brightness(1)' },
  },

  // ====== 动画方案：辉光（glow） ======
  '.cm-md-anim-glow': {
    animation: 'live-txt-glow 0.55s ease forwards',
  },
  '@keyframes live-txt-glow': {
    '0%': { filter: 'blur(2px) brightness(0.9)' },
    '30%': { filter: 'blur(0.5px) brightness(1.5)' },
    '100%': { filter: 'blur(0) brightness(1)' },
  },

  // ====== 动画方案：涟漪（ripple） ======
  '.cm-md-anim-ripple': {
    animation: 'live-txt-ripple 0.7s ease forwards',
  },
  '@keyframes live-txt-ripple': {
    '0%': { filter: 'blur(2.5px) brightness(0.85)' },
    '20%': { filter: 'blur(1px) brightness(1.6)' },
    '50%': { filter: 'blur(0) brightness(1.25)' },
    '100%': { filter: 'blur(0) brightness(1)' },
  },
  // 标题行过渡：字体大小和内边距平滑变化
  '.cm-md-heading-line': {
    transition: 'font-size 0.18s ease, padding-top 0.18s ease, padding-bottom 0.18s ease',
  },
  '.cm-selectionLayer': { zIndex: '2 !important' },
  '.cm-selectionBackground': { backgroundColor: 'var(--code-selection-bg) !important' },
})

export function liveEditExtension() {
  return [
    syntaxHighlighting(liveEditHighlightStyle),
    liveRenderPlugin,
    liveEditTheme,
    liveBlocksBundle(),
    // 元信息属性面板：只在实时模式挂载（源码模式保持原样显示 YAML）
    propertiesPanel,
  ]
}
