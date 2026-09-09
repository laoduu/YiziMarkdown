import { ViewPlugin, EditorView, Decoration, DecorationSet, ViewUpdate } from '@codemirror/view'
import { syntaxTree, toggleFold, foldedRanges } from '@codemirror/language'
import { RangeSetBuilder } from '@codemirror/state'

function isHeadingLine(view: EditorView, lineNo: number): boolean {
  const tree = syntaxTree(view.state)
  let found = false
  tree.iterate({
    enter(node) {
      if (
        node.name === 'ATXHeading1' ||
        node.name === 'ATXHeading2' ||
        node.name === 'ATXHeading3' ||
        node.name === 'ATXHeading4' ||
        node.name === 'ATXHeading5' ||
        node.name === 'ATXHeading6'
      ) {
        if (view.state.doc.lineAt(node.from).number === lineNo) {
          found = true
          return false
        }
      }
    },
  })
  return found
}

const svgRight = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 3L5 7L8 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
const svgDown = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 2L7 5L3 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`

const INDICATOR_SIZE = 22
const INDICATOR_GAP = 2

class HeadingFoldView {
  decorations: DecorationSet
  private indicators: Map<number, HTMLDivElement> = new Map()
  private editorView: EditorView
  private mouseLine = -1

  constructor(view: EditorView) {
    this.editorView = view
    this.decorations = this.buildDecorations(view)
    this.bindEvents()
  }

  destroy() {
    this.indicators.forEach((el) => el.remove())
    this.indicators.clear()
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.selectionSet) {
      this.decorations = this.buildDecorations(update.view)
      this.refreshIndicators()
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
      if (isHeadingLine(this.editorView, lineNo)) {
        this.setMouseLine(lineNo)
      } else {
        this.setMouseLine(-1)
      }
    })

    this.editorView.dom.addEventListener('mouseleave', () => {
      this.setMouseLine(-1)
    })
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
    for (const { from, to } of view.visibleRanges) {
      const startLine = doc.lineAt(from).number
      const endLine = doc.lineAt(to).number
      for (let i = startLine; i <= endLine; i++) {
        if (isHeadingLine(view, i)) visible.add(i)
      }
    }

    for (const [lineNo, el] of this.indicators) {
      if (!visible.has(lineNo)) {
        el.remove()
        this.indicators.delete(lineNo)
      }
    }

    for (const lineNo of visible) {
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

      this.positionIndicator(el, lineNo, isFold)
      el.innerHTML = isFold ? svgDown : svgRight
      el.style.visibility = 'visible'
    }
  }

  private createIndicator(lineNo: number): HTMLDivElement {
    const el = document.createElement('div')
    el.className = 'cm-heading-fold-indicator'
    el.style.cssText = `
      position: absolute;
      width: ${INDICATOR_SIZE}px; height: ${INDICATOR_SIZE}px;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer;
      color: var(--editor-border);
      border-radius: 4px;
      transition: color 0.15s, background-color 0.15s;
      pointer-events: auto;
      z-index: 10;
      visibility: hidden;
    `
    el.addEventListener('mouseenter', () => {
      el.style.color = 'var(--editor-accent)'
      el.style.backgroundColor = 'var(--editor-hover)'
    })
    el.addEventListener('mouseleave', () => {
      el.style.color = 'var(--editor-border)'
      el.style.backgroundColor = 'transparent'
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

  private positionIndicator(el: HTMLDivElement, lineNo: number, _isFold: boolean) {
    const view = this.editorView
    const line = view.state.doc.line(lineNo)
    const coords = view.coordsAtPos(line.from, -1)
    if (!coords) return

    const editorRect = view.dom.getBoundingClientRect()
    const top = coords.top - editorRect.top + (coords.bottom - coords.top - INDICATOR_SIZE) / 2
    const left = coords.left - editorRect.left - INDICATOR_SIZE - INDICATOR_GAP

    el.style.top = `${top}px`
    el.style.left = `${left}px`
  }

  private buildDecorations(_view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>()
    return builder.finish()
  }
}

export const headingFoldExtension = ViewPlugin.fromClass(HeadingFoldView, {
  decorations: (v) => v.decorations,
})
