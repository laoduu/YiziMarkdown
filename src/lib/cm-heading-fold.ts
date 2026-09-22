import { ViewPlugin, EditorView, Decoration, DecorationSet, ViewUpdate } from '@codemirror/view'
import { syntaxTree, toggleFold, foldedRanges } from '@codemirror/language'
import { RangeSetBuilder } from '@codemirror/state'
import { frontMatterOf } from './cm-frontmatter'

/**
 * 该行是否落在 front matter 块内 —— 元信息**不是标题**，不该出现 H 折叠徽标。
 *
 * 根因：`@lezer/markdown`（CM 的 Markdown 解析器）不认识 YAML front matter，
 * 会把
 *     ---
 *     title: x
 *     ---
 * 的第 2~3 行当成 **setext 二级标题**，于是 `headingLevelAtLine` 会返回 2。
 * 与实时模式那边同一根因（见 cm-frontmatter.ts 的说明）—— 这里是源码模式的入口。
 */
function inFrontMatter(view: EditorView, lineNo: number): boolean {
  const r = frontMatterOf(view.state).range
  if (!r) return false
  const line = view.state.doc.line(lineNo)
  return line.from < r.to && line.to > r.from
}

/** 返回指定行号的标题层级（1-6），非标题行返回 0（支持 ATX 与 Setext 标题） */
function headingLevelAtLine(view: EditorView, lineNo: number): number {
  const tree = syntaxTree(view.state)
  let level = 0
  tree.iterate({
    enter(node) {
      if (level) return false
      const name = node.name
      const m =
        name === 'ATXHeading1' || name === 'SetextHeading1' ? 1
        : name === 'ATXHeading2' || name === 'SetextHeading2' ? 2
        : name === 'ATXHeading3' ? 3
        : name === 'ATXHeading4' ? 4
        : name === 'ATXHeading5' ? 5
        : name === 'ATXHeading6' ? 6
        : 0
      if (m && view.state.doc.lineAt(node.from).number === lineNo) {
        level = m
        return false
      }
    },
  })
  return level
}

const INDICATOR_MIN_WIDTH = 22
const INDICATOR_HEIGHT = 20
const INDICATOR_GAP = 2

/** 折叠状态下的高亮样式（Obsidian 风格：层级标签常显并强调） */
function applyFoldedStyle(el: HTMLDivElement) {
  el.style.color = 'var(--editor-accent)'
  el.style.borderColor = 'var(--editor-accent)'
  el.style.backgroundColor = 'color-mix(in srgb, var(--editor-accent) 10%, transparent)'
}

/** 未折叠的默认样式（hover 时出现的细微标记） */
function applyDefaultStyle(el: HTMLDivElement) {
  el.style.color = 'var(--sidebar-text)'
  el.style.borderColor = 'var(--editor-border)'
  el.style.backgroundColor = 'transparent'
}

/** 鼠标悬停在标记上时的强调样式 */
function applyHoverStyle(el: HTMLDivElement) {
  el.style.color = 'var(--editor-accent)'
  el.style.borderColor = 'var(--editor-accent)'
  el.style.backgroundColor = 'var(--editor-hover)'
}

class HeadingFoldView {
  decorations: DecorationSet
  private indicators: Map<number, HTMLDivElement> = new Map()
  private editorView: EditorView
  private mouseLine = -1
  private scrollRaf = 0
  private positionRaf = 0

  constructor(view: EditorView) {
    this.editorView = view
    this.decorations = this.buildDecorations(view)
    this.bindEvents()
  }

  destroy() {
    this.indicators.forEach((el) => el.remove())
    this.indicators.clear()
    this.editorView.scrollDOM.removeEventListener('scroll', this.onScroll)
    if (this.scrollRaf) cancelAnimationFrame(this.scrollRaf)
    if (this.positionRaf) cancelAnimationFrame(this.positionRaf)
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.selectionSet) {
      this.decorations = this.buildDecorations(update.view)
      this.refreshIndicators()
    } else if (update.geometryChanged) {
      // 窗口缩放 / 字体变化等几何变化：延迟到布局稳定后重定位
      this.schedulePositioning()
    }
  }

  private bindEvents() {
    this.editorView.dom.addEventListener('mousemove', (e: MouseEvent) => {
      const pos = this.editorView.posAtCoords({ x: e.clientX, y: e.clientY }, false)
      if (pos == null) {
        this.setMouseLine(-1)
        return
      }
      const lineNo = this.editorView.state.doc.lineAt(pos).number
      // 元信息块内的"标题"是假的（setext 误判），不显示折叠徽标
      if (inFrontMatter(this.editorView, lineNo)) {
        this.setMouseLine(-1)
      } else if (headingLevelAtLine(this.editorView, lineNo) > 0) {
        this.setMouseLine(lineNo)
      } else {
        this.setMouseLine(-1)
      }
    })

    this.editorView.dom.addEventListener('mouseleave', () => {
      this.setMouseLine(-1)
    })

    // 滚动时重定位：指示器是绝对定位浮层，坐标必须跟随内容
    this.editorView.scrollDOM.addEventListener('scroll', this.onScroll, { passive: true })
  }

  /** 滚动（rAF 节流）后重定位所有可见指示器，保持与标题锁定 */
  private onScroll = () => {
    if (this.scrollRaf) return
    this.scrollRaf = requestAnimationFrame(() => {
      this.scrollRaf = 0
      this.repositionVisible()
    })
  }

  /** 延迟到下一帧再定位：coordsAtPos 不能在 update 事务中同步调用（否则插件崩溃被禁用） */
  private schedulePositioning() {
    if (this.positionRaf) return
    this.positionRaf = requestAnimationFrame(() => {
      this.positionRaf = 0
      this.repositionVisible()
    })
  }

  private repositionVisible() {
    for (const [lineNo, el] of this.indicators) {
      if (el.style.visibility === 'hidden') continue
      const positioned = this.positionIndicator(el, lineNo)
      if (!positioned) el.style.visibility = 'hidden'
    }
  }

  private setMouseLine(lineNo: number) {
    if (this.mouseLine === lineNo) return
    this.mouseLine = lineNo
    this.refreshIndicators()
  }

  private refreshIndicators() {
    const view = this.editorView
    const doc = view.state.doc
    const folded = new Set<number>()

    const ranges = foldedRanges(view.state)
    ranges.between(0, doc.length, (from: number) => {
      const lineNo = doc.lineAt(from).number
      folded.add(lineNo)
    })

    const visible = new Set<number>()
    const fm = frontMatterOf(view.state).range
    for (const { from, to } of view.visibleRanges) {
      const startLine = doc.lineAt(from).number
      const endLine = doc.lineAt(to).number
      for (let i = startLine; i <= endLine; i++) {
        if (fm && doc.line(i).from < fm.to && doc.line(i).to > fm.from) continue // 元信息不算标题
        if (headingLevelAtLine(view, i) > 0) visible.add(i)
      }
    }

    for (const [lineNo, el] of this.indicators) {
      if (!visible.has(lineNo)) {
        el.remove()
        this.indicators.delete(lineNo)
      }
    }

    for (const lineNo of visible) {
      const level = headingLevelAtLine(view, lineNo)
      if (level === 0) continue
      const isFold = folded.has(lineNo)
      const isHover = lineNo === this.mouseLine
      const shouldShow = isFold || isHover

      if (!shouldShow) {
        const el = this.indicators.get(lineNo)
        if (el) {
          el.style.visibility = 'hidden'
        }
        continue
      }

      let el = this.indicators.get(lineNo)
      if (!el) {
        el = this.createIndicator(lineNo)
        this.indicators.set(lineNo, el)
        view.dom.appendChild(el)
      }

      // 层级标签（Obsidian 风格）：H1-H6；定位延迟到下一帧（coordsAtPos 不能在 update 中调用）
      el.textContent = `H${level}`
      el.dataset.folded = isFold ? '1' : '0'
      if (isFold) {
        applyFoldedStyle(el)
      } else {
        applyDefaultStyle(el)
      }
      el.style.visibility = 'visible'
    }
    this.schedulePositioning()
  }

  private createIndicator(lineNo: number): HTMLDivElement {
    const el = document.createElement('div')
    el.className = 'cm-heading-fold-indicator'
    el.style.cssText = `
      position: absolute;
      min-width: ${INDICATOR_MIN_WIDTH}px; height: ${INDICATOR_HEIGHT}px;
      padding: 0 5px;
      display: flex; align-items: center; justify-content: center;
      font-size: 10px; font-weight: 600; line-height: 1;
      border: 1px solid var(--editor-border);
      border-radius: 4px;
      cursor: pointer;
      user-select: none;
      pointer-events: auto;
      z-index: 10;
      visibility: hidden;
      box-sizing: border-box;
    `
    el.addEventListener('mouseenter', () => {
      // 折叠状态常显高亮，悬停不覆盖
      if (el.dataset.folded === '1') return
      applyHoverStyle(el)
    })
    el.addEventListener('mouseleave', () => {
      if (el.dataset.folded === '1') {
        applyFoldedStyle(el)
      } else {
        applyDefaultStyle(el)
      }
    })
    el.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const line = this.editorView.state.doc.line(lineNo)
      this.editorView.dispatch({ selection: { anchor: line.from } })
      toggleFold(this.editorView)
    })
    return el
  }

  /** 返回是否定位成功；标题滚出视口（coordsAtPos 为 null）时返回 false */
  private positionIndicator(el: HTMLDivElement, lineNo: number): boolean {
    const view = this.editorView
    const line = view.state.doc.line(lineNo)
    const coords = view.coordsAtPos(line.from, -1)
    if (!coords) return false

    const editorRect = view.dom.getBoundingClientRect()
    const top = coords.top - editorRect.top + (coords.bottom - coords.top - INDICATOR_HEIGHT) / 2
    const left = coords.left - editorRect.left - el.offsetWidth - INDICATOR_GAP

    el.style.top = `${top}px`
    el.style.left = `${left}px`
    return true
  }

  private buildDecorations(_view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>()
    return builder.finish()
  }
}

export const headingFoldExtension = ViewPlugin.fromClass(HeadingFoldView, {
  decorations: (v) => v.decorations,
})
