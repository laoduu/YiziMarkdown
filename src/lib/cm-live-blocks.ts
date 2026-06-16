/**
 * cm-live-blocks.ts — Editable block-level widgets for YiziMarkdown live mode
 *
 * Images: Rendered as <img>, cursor enters line → reveal source.
 * Tables: Rendered as real HTML <table>, click any cell to edit inline
 *         via contentEditable. Changes sync back to markdown on blur/Enter.
 *         Cursor stays outside table range so the widget remains visible.
 */

import { syntaxTree } from '@codemirror/language'
import { useSettingsStore } from '../stores/settingsStore'
import { StateField } from '@codemirror/state'
import type { EditorState } from '@codemirror/state'
import type { Range } from '@codemirror/state'
import {
  Decoration,
  DecorationSet,
  EditorView,
  WidgetType,
} from '@codemirror/view'

/* ------------------------------------------------------------------ */
/*  Data types                                                        */
/* ------------------------------------------------------------------ */

interface CellData {
  text: string   // trimmed display text
  from: number   // document position (raw, includes padding)
  to: number
}

interface TableData {
  cells: CellData[]
  colCount: number
}

/* ------------------------------------------------------------------ */
/*  Mermaid Widget (live mode SVG rendering)                          */
/* ------------------------------------------------------------------ */

class MermaidWidget extends WidgetType {
  private _code: string
  constructor(code: string) {
    super()
    this._code = code
  }
  eq(other: MermaidWidget): boolean { return other._code === this._code }
  private _timer: ReturnType<typeof setTimeout> | null = null
  toDOM(): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'cm-live-block cm-live-block--mermaid'
    wrap.textContent = this._code
    // 防抖渲染 mermaid（300ms内不重复触发）
    if (this._timer) clearTimeout(this._timer)
    this._timer = setTimeout(() => this.renderMermaid(wrap), 300)
    return wrap
  }
  private async renderMermaid(el: HTMLElement): Promise<void> {
    try {
      const mod = await import('mermaid')
      const mermaid = mod.default || mod
      const configs = useSettingsStore.getState().pluginConfigs.mermaid || {}
      const theme = ((configs.theme as string) || 'default') as any
      mermaid.initialize({ startOnLoad: false, theme, securityLevel: 'loose' })
      const id = 'cm-mmd-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
      const { svg } = await mermaid.render(id, this._code)
      el.innerHTML = svg
    } catch (e) {
      el.textContent = this._code
      el.className += ' cm-live-block--mermaid-error'
    }
  }
  ignoreEvent(): boolean { return true }
}


/* ------------------------------------------------------------------ */
/*  KaTeX Block Widget (live mode $$...$$ rendering)                 */
/* ------------------------------------------------------------------ */

class KatexBlockWidget extends WidgetType {
  private _tex: string
  constructor(tex: string) {
    super()
    this._tex = tex
  }
  eq(other: KatexBlockWidget): boolean { return other._tex === this._tex }
  toDOM(): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'cm-live-block cm-live-block--katex'
    this.renderKatex(wrap)
    return wrap
  }
  private async renderKatex(el: HTMLElement): Promise<void> {
    try {
      const katex = await import('katex')
      const kt = katex.default || katex
      el.innerHTML = kt.renderToString(this._tex, { displayMode: true, throwOnError: false })
    } catch (e) {
      el.textContent = this._tex
      el.className += ' cm-live-block--katex-error'
    }
  }
  ignoreEvent(): boolean { return true }
}

/* ------------------------------------------------------------------ */
/*  KaTeX Inline Line Widget (live mode — renders $...$ within a line) */
/* ------------------------------------------------------------------ */

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

class KatexInlineLineWidget extends WidgetType {
  private _lineText: string
  constructor(lineText: string) {
    super()
    this._lineText = lineText
  }
  eq(other: KatexInlineLineWidget): boolean { return other._lineText === this._lineText }
  toDOM(): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'cm-live-block cm-live-block--katex-inline-line'
    this.renderLine(wrap)
    return wrap
  }
  private async renderLine(el: HTMLElement): Promise<void> {
    try {
      const katex = await import('katex')
      const kt = katex.default || katex
      const inlineRe = /(?<!\$)\$(?!\$)((?:[^$\\]|\\.)+?)(?<!\$)\$(?!\$)/g
      let result = ''
      let lastIdx = 0
      let m: RegExpExecArray | null
      inlineRe.lastIndex = 0
      while ((m = inlineRe.exec(this._lineText)) !== null) {
        // 非公式部分：转义 HTML
        const before = this._lineText.slice(lastIdx, m.index)
        result += escapeHtml(before)
        // 公式部分：KaTeX 渲染
        try {
          result += kt.renderToString(m[1], { displayMode: false, throwOnError: false })
        } catch {
          result += '<span style="color:var(--editor-accent)">' + escapeHtml(m[1]) + '</span>'
        }
        lastIdx = m.index + m[0].length
      }
      // 剩余文本
      result += escapeHtml(this._lineText.slice(lastIdx))
      el.innerHTML = result
    } catch (e) {
      el.textContent = this._lineText
    }
  }
  ignoreEvent(): boolean { return true }
}

/* ------------------------------------------------------------------ */
/*  Image Widget                                                       */
/* ------------------------------------------------------------------ */

const IMAGE_RE = /^\s*!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)\s*$/

class ImageWidget extends WidgetType {
  constructor(private readonly src: string, private readonly alt: string) { super() }
  eq(other: ImageWidget): boolean { return other.src === this.src && other.alt === this.alt }
  toDOM(): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'cm-live-block cm-live-block--image'
    const img = document.createElement('img')
    img.src = this.src
    img.alt = this.alt
    img.loading = 'lazy'
    img.draggable = false
    img.onerror = () => {
      wrap.classList.add('cm-live-block--broken')
      wrap.textContent = '[image: ' + (this.alt || this.src) + ']'
    }
    wrap.appendChild(img)
    return wrap
  }
  ignoreEvent(): boolean { return false }
}

/* ------------------------------------------------------------------ */
/*  Editable Table Widget (Shadow DOM isolated)                        */
/* ------------------------------------------------------------------ */

class EditableTableWidget extends WidgetType {
  private _view: EditorView | null = null

  constructor(private readonly data: TableData) { super() }

  eq(other: EditableTableWidget): boolean {
    if (this.data.cells.length !== other.data.cells.length) return false
    if (this.data.colCount !== other.data.colCount) return false
    for (let i = 0; i < this.data.cells.length; i++) {
      if (this.data.cells[i].text !== other.data.cells[i].text) return false
    }
    return true
  }

  toDOM(view: EditorView): HTMLElement {
    this._view = view

    const host = document.createElement('div')
    host.className = 'cm-live-block cm-live-block--table'

    // Shadow DOM: CM6 的 input/beforeinput 监听器在 light DOM，
    // 看不到 shadow root 内部的事件，避免 CM6 抢占输入
    const shadow = host.attachShadow({ mode: 'open' })

    const style = document.createElement('style')
    style.textContent = `
      table { border-collapse: collapse; width: 100%; margin: 0; }
      th, td {
        padding: 0.6em 1em;
        border: 1px solid var(--editor-border, #ddd);
        text-align: left;
        cursor: text;
        min-width: 2em;
        outline: none;
      }
      th { background: var(--editor-surface, #f5f5f5); font-weight: 600; }
      td:focus, th:focus {
        outline: 2px solid var(--editor-accent, #4a9eff);
        outline-offset: -2px;
      }
    `

    const table = document.createElement('table')
    const { cells, colCount } = this.data
    let idx = 0
    let rowIdx = 0

    while (idx < cells.length) {
      const isHeader = rowIdx === 0
      const tr = document.createElement('tr')

      for (let c = 0; c < colCount && idx < cells.length; c++, idx++) {
        const cell = cells[idx]
        const td: HTMLElement = isHeader
          ? document.createElement('th')
          : document.createElement('td')
        td.textContent = cell.text
        td.contentEditable = 'true'

        // 不 preventDefault，让浏览器自然处理光标定位
        td.addEventListener('mousedown', (e: MouseEvent) => {
          e.stopPropagation()
        })

        // 拦截所有输入事件，防止穿透到 CM6
        td.addEventListener('beforeinput', (e) => { e.stopPropagation() })
        td.addEventListener('input', (e) => { e.stopPropagation() })

        td.addEventListener('keydown', (e: KeyboardEvent) => {
          e.stopPropagation()
          if (e.key === 'Escape') {
            e.preventDefault()
            td.textContent = cell.text
            td.blur()
            return
          }
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            td.blur()
            return
          }
          if (e.key === 'Tab') {
            e.preventDefault()
            td.blur()
            return
          }
        })

        // blur 时提交修改
        td.addEventListener('blur', () => {
          const newText = (td.textContent ?? '').trim()
          if (newText !== cell.text) {
            const raw = this.view.state.doc.sliceString(cell.from, cell.to)
            const head = raw.match(/^(\s*)/)?.[1] ?? ''
            const tail = raw.match(/(\s*)$/)?.[1] ?? ''
            this.view.dispatch({
              changes: { from: cell.from, to: cell.to, insert: head + newText + tail },
            })
          }
        })

        tr.appendChild(td)
      }

      table.appendChild(tr)
      rowIdx++
    }

    shadow.appendChild(style)
    shadow.appendChild(table)
    return host
  }

  private get view(): EditorView {
    if (!this._view) throw new Error('Widget not mounted')
    return this._view
  }

  ignoreEvent(): boolean { return true }
}
/* ------------------------------------------------------------------ */
/*  Extract table data from syntax tree                                 */
/* ------------------------------------------------------------------ */

function extractTableData(state: EditorState, tableNode: any): TableData | null {
  const cells: CellData[] = []
  let colCount = 0

  const cur = tableNode.cursor()
  if (!cur.firstChild()) return null

  do {
    if (cur.name === 'TableHeader') {
      const h = cur.node.cursor()
      if (h.firstChild()) {
        do {
          if (h.name === 'TableCell') {
            cells.push({
              text: state.doc.sliceString(h.from, h.to).trim(),
              from: h.from,
              to: h.to,
            })
            colCount++
          }
        } while (h.nextSibling())
      }
    } else if (cur.name === 'TableRow') {
      const r = cur.node.cursor()
      if (r.firstChild()) {
        do {
          if (r.name === 'TableCell') {
            cells.push({
              text: state.doc.sliceString(r.from, r.to).trim(),
              from: r.from,
              to: r.to,
            })
          }
        } while (r.nextSibling())
      }
    }
  } while (cur.nextSibling())

  return cells.length > 0 && colCount > 0 ? { cells, colCount } : null
}

/* ------------------------------------------------------------------ */
/*  Build decorations                                                  */
/* ------------------------------------------------------------------ */

function buildBlockDecorations(state: EditorState): DecorationSet {
  const sel = state.selection.main
  const curLineStart = state.doc.lineAt(sel.from).number
  const curLineEnd = state.doc.lineAt(sel.to).number
  const doc = state.doc
  const tree = syntaxTree(state)
  const ranges: Range<Decoration>[] = []

  // --- Mermaid blocks ---
  const enabledPlugins = useSettingsStore.getState().enabledPlugins
  const mermaidEnabled = enabledPlugins.includes('mermaid')
  if (mermaidEnabled) {
    for (let i = 1; i <= doc.lines; i++) {
      if (i >= curLineStart && i <= curLineEnd) continue
      const line = doc.line(i)
      if (/^\s*```\s*mermaid\s*/.test(line.text)) {
        // 找到代码块的结束位置
        let endLine = i
        for (let j = i + 1; j <= doc.lines; j++) {
          if (/^\s*```\s*$/.test(doc.line(j).text)) {
            endLine = j
            break
          }
          endLine = j
        }
        if (endLine > i) {
          const code = doc.sliceString(line.from, doc.line(endLine).to).replace(/^\s*```\s*mermaid\s*\n?/, '').replace(/\n?\s*```\s*$/, '')
          ranges.push(Decoration.replace({
            widget: new MermaidWidget(code),
            block: true,
          }).range(line.from, doc.line(endLine).to))
        }
      }
    }
  }


  // --- KaTeX block math ($$...$$) ---
  const katexEnabled = enabledPlugins.includes('katex')
  if (katexEnabled) {
    for (let i = 1; i <= doc.lines; i++) {
      if (i >= curLineStart && i <= curLineEnd) continue
      const line = doc.line(i)
      // 跳过代码块内的 $$（代码块由 mermaid/普通 fence 处理）
      // 单行块级公式: $$formula$$（允许行首有列表标记 -/1. 等）
      const singleMatch = line.text.match(/^(?:\s*(?:[-*+]|\d+\.\s))?\s*\$\$(.+?)\$\$\s*$/)
      if (singleMatch) {
        ranges.push(Decoration.replace({
          widget: new KatexBlockWidget(singleMatch[1]),
          block: true,
        }).range(line.from, line.to))
        continue
      }
      // 多行块级公式: $$\nformula\n$$（允许行首有列表标记）
      if (/^(?:\s*(?:[-*+]|\d+\.\s))?\s*\$\$\s*$/.test(line.text)) {
        let endLine = i
        for (let j = i + 1; j <= doc.lines; j++) {
          if (/^(?:\s*(?:[-*+]|\d+\.\s))?\s*\$\$\s*$/.test(doc.line(j).text)) {
            endLine = j
            break
          }
          endLine = j
        }
        if (endLine > i) {
          const tex = doc.sliceString(line.from, doc.line(endLine).to)
            .replace(/^\s*\$\$\s*\n?/, '')
            .replace(/\n?\s*\$\$\s*$/, '')
          ranges.push(Decoration.replace({
            widget: new KatexBlockWidget(tex),
            block: true,
          }).range(line.from, doc.line(endLine).to))
        }
      }
    }
  }


  // --- KaTeX inline math ($...$) ---
  // 行级渲染：将含 $...$ 的整行替换为渲染后的 HTML
  // （CM6 的 inline Decoration.replace widget 在 StateField 混合 decoration 场景中不可靠）
  if (katexEnabled) {
    const inlineRe = /(?<!\$)\$(?!\$)((?:[^$\\]|\\.)+?)(?<!\$)\$(?!\$)/g
    for (let i = 1; i <= doc.lines; i++) {
      if (i >= curLineStart && i <= curLineEnd) continue
      const line = doc.line(i)
      const text = line.text
      // 跳过代码块行
      if (/^\s*```/.test(text)) continue
      // 跳过含有 $$ 块级标记的行（由块级公式检测处理）
      if (/\$\$/.test(text)) continue
      // 检查是否有行内公式
      inlineRe.lastIndex = 0
      if (!inlineRe.test(text)) continue
      // 用行级渲染
      ranges.push(Decoration.replace({
        widget: new KatexInlineLineWidget(text),
        block: true,
      }).range(line.from, line.to))
    }
  }

  // --- Images ---
  for (let i = 1; i <= doc.lines; i++) {
    if (i >= curLineStart && i <= curLineEnd) continue
    const line = doc.line(i)
    const m = IMAGE_RE.exec(line.text)
    if (m) {
      ranges.push(Decoration.replace({
        widget: new ImageWidget(m[2], m[1]),
        block: true,
      }).range(line.from, line.to))
    }
  }

  // --- Tables ---
  tree.iterate({
    enter(node) {
      if (node.name !== 'Table') return
      const startLine = doc.lineAt(node.from).number
      const endLine = doc.lineAt(Math.min(node.to, doc.length)).number
      if (curLineStart >= startLine && curLineStart <= endLine) return

      const data = extractTableData(state, node.node)
      if (data) {
        ranges.push(Decoration.replace({
          widget: new EditableTableWidget(data),
          block: true,
        }).range(node.from, node.to))
      }
    },
  })

  ranges.sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide)
  return Decoration.set(ranges)
}

/* ------------------------------------------------------------------ */
/*  StateField                                                         */
/* ------------------------------------------------------------------ */

const blockDecorField = StateField.define<DecorationSet>({
  create(state) { return buildBlockDecorations(state) },
  update(deco, tr) {
    if (tr.docChanged || tr.selection) return buildBlockDecorations(tr.state)
    return deco.map(tr.changes)
  },
  provide: (f) => EditorView.decorations.from(f),
})

/* ------------------------------------------------------------------ */
/*  Theme                                                              */
/* ------------------------------------------------------------------ */

const liveBlocksTheme = EditorView.theme({
  '.cm-live-block': {
    margin: '0.6em 0',
    padding: '0',
    cursor: 'text',
  },
  '.cm-live-block--image img': {
    maxWidth: '100%',
    height: 'auto',
    borderRadius: '6px',
    display: 'block',
  },
  '.cm-live-block--broken': {
    color: 'var(--editor-text)',
    opacity: '0.5',
    fontStyle: 'italic',
    fontSize: '0.9em',
  },
  // Table — matches preview mode styles
  '.cm-live-block--table table': {
    borderCollapse: 'collapse',
    width: '100%',
    margin: '0',
  },
  '.cm-live-block--table th, .cm-live-block--table td': {
    padding: '0.6em 1em',
    border: '1px solid var(--editor-border)',
    textAlign: 'left',
  },
  '.cm-live-block--table th': {
    background: 'var(--editor-surface)',
    fontWeight: '600',
  },
  // Mermaid
  '.cm-live-block--mermaid': {
    textAlign: 'center',
    padding: '0.5em',
    overflow: 'auto',
  },
  '.cm-live-block--mermaid svg': {
    maxWidth: '100%',
    height: 'auto',
  },
  '.cm-live-block--katex': {
    padding: '0.8em 1em',
    textAlign: 'center',
    overflow: 'visible',
  },
  '.cm-live-block--katex-error': {
    color: 'var(--editor-accent)',
    fontStyle: 'italic',
    fontSize: '0.85em',
  },
  '.cm-live-block--katex-inline-line': {
    padding: '0.2em 0',
    lineHeight: '1.6',
    overflow: 'visible',
    '& .katex': {
      fontSize: '1em',
    },
  },
  '.cm-live-inline-katex': {
    overflow: 'visible',
    verticalAlign: 'middle',
  },
  '.cm-live-block--mermaid-error': {
    color: 'var(--editor-accent)',
    fontStyle: 'italic',
    fontSize: '0.85em',
  },
  // Active cell highlight while editing
  '.cm-live-cell-editing': {
    outline: '2px solid var(--editor-accent)',
    outlineOffset: '-2px',
  },
})

/* ------------------------------------------------------------------ */
/*  Export                                                              */
/* ------------------------------------------------------------------ */

export function liveBlocksBundle() {
  return [blockDecorField, liveBlocksTheme]
}
