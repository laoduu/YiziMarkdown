/**
 * cm-live-blocks.ts — Editable block-level widgets for YiziMarkdown live mode
 *
 * Images: Rendered as <img>, cursor enters line → reveal source.
 * Tables: Rendered as real HTML <table>, click any cell to edit inline
 *         via contentEditable. Changes sync back to markdown on blur/Enter.
 *         Cursor stays outside table range so the widget remains visible.
 */

import { syntaxTree } from '@codemirror/language'
// 带 .ts 扩展名：本模块要能被 `node --test` 直接加载（tests/liveBlocks.test.ts），
// 而 Node 的 ESM 解析器不做扩展名补全（见 lib/remotePath.ts 的同类说明）。
import { useSettingsStore } from '../stores/settingsStore.ts'
import { useEditorStore } from '../stores/editorStore.ts'
import { resolveLocalImageSrc } from './localImages.ts'
import { invokeTauri } from './tauri.ts'
import { getMarkdownIt } from './markdownRenderer.ts'
import {
  addTableColumn,
  addTableRow,
  analyzeFootnotes,
  collectHeadings,
  deleteTableColumns,
  deleteTableRows,
  insertTableColumn,
  insertTableRow,
  moveTableColumn,
  moveTableRow,
  parseImageMarkdown,
  parseReferenceDefinition,
  parseTableAlignments,
  parseTableRow,
  setTableColumnAlign,
  sortTableRows,
  splitInlineMath,
  TOC_LINE_RE,
  type TableAlign,
  type TocHeading,
} from './liveSyntax.ts'
import hljs from 'highlight.js'
import { StateField } from '@codemirror/state'
import type { EditorState } from '@codemirror/state'
import type { Range } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  WidgetType,
} from '@codemirror/view'
// DecorationSet 是**类型导出**：写在值导入里 Vite/esbuild 能丢弃，
// 但 Node 的类型剥离器（tests/liveBlocks.test.ts 要加载本模块）不能。
import type { DecorationSet } from '@codemirror/view'

/* ------------------------------------------------------------------ */
/*  Data types                                                        */
/* ------------------------------------------------------------------ */

interface CellData {
  text: string   // trimmed display text
  from: number   // document position (raw, includes padding)
  to: number
}

interface TableData {
  cells: Array<CellData | null>
  colCount: number
  aligns: TableAlign[]
  /** 表格在文档中的范围（用于整块替换：加行 / 加列） */
  from: number
  to: number
  /** 表格源码（不含前后空行） */
  source: string
}

/* ------------------------------------------------------------------ */
/*  Mermaid Widget (live mode SVG rendering)                          */
/* ------------------------------------------------------------------ */

/**
 * 点击块级 widget 时把光标放回源码起点。
 *
 * 这些块用 `Decoration.replace` 把整段源码换成了 widget；默认点击不会落到文档里，
 * 于是注释块 / 引用定义 / 公式块在实时模式下“点不进去”，只能靠键盘挪光标。
 * 注意：按钮、链接、表格单元格要保持自己的交互，不抢事件。
 */
function revealSourceOnClick(el: HTMLElement, view: EditorView, pos: number): void {
  el.addEventListener('mousedown', (e) => {
    const target = e.target as Element | null
    if (target && target.closest('a, button, input, textarea, select, label')) return
    e.preventDefault()
    e.stopPropagation()
    const anchor = Math.max(0, Math.min(pos, view.state.doc.length))
    view.dispatch({ selection: { anchor }, scrollIntoView: true })
    view.focus()
  })
}

class MermaidWidget extends WidgetType {
  private _code: string
  constructor(code: string, private readonly pos: number) {
    super()
    this._code = code
  }
  eq(other: MermaidWidget): boolean { return other._code === this._code && other.pos === this.pos }
  private _timer: ReturnType<typeof setTimeout> | null = null
  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'cm-live-block cm-live-block--mermaid'
    wrap.textContent = this._code
    revealSourceOnClick(wrap, view, this.pos)
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
  constructor(tex: string, private readonly pos: number) {
    super()
    this._tex = tex
  }
  eq(other: KatexBlockWidget): boolean { return other._tex === this._tex && other.pos === this.pos }
  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'cm-live-block cm-live-block--katex'
    revealSourceOnClick(wrap, view, this.pos)
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

/**
 * 块级公式处于「源码编辑态」时追加在闭合 `$$` 下方的预览。
 * 它不是替换装饰，光标可以留在公式块内任意一行继续修改。
 */
class KatexPreviewWidget extends WidgetType {
  constructor(private readonly tex: string) { super() }
  eq(other: KatexPreviewWidget): boolean { return other.tex === this.tex }
  toDOM(): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'cm-live-block cm-live-block--katex-preview'
    this.renderKatex(wrap)
    return wrap
  }
  private async renderKatex(el: HTMLElement): Promise<void> {
    try {
      const katex = await import('katex')
      const kt = katex.default || katex
      el.innerHTML = kt.renderToString(this.tex, { displayMode: true, throwOnError: false })
    } catch {
      el.textContent = this.tex
      el.className += ' cm-live-block--katex-error'
    }
  }
  ignoreEvent(): boolean { return true }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

let katexModulePromise: Promise<any> | null = null
function loadKatex(): Promise<any> {
  if (!katexModulePromise) {
    katexModulePromise = import('katex').then((mod: any) => mod.default || mod)
  }
  return katexModulePromise
}

let katexCssPromise: Promise<string> | null = null
/** Shadow DOM 里不会继承全局 KaTeX 样式，需要把 CSS 文本单独塞进 shadow root */
function loadKatexCss(): Promise<string> {
  if (!katexCssPromise) {
    katexCssPromise = import('katex/dist/katex.min.css?inline')
      .then((mod: any) => mod.default || '')
      .catch(() => '')
  }
  return katexCssPromise
}

/**
 * 行内富文本：Markdown 行内语法交给 markdown-it（加粗 / 代码 / 链接 / 删除线…），
 * `$…$` 单独走 KaTeX。这样「一行里有公式 + 其它行内语法」时不会像旧实现那样
 * 整行只剩公式、其它标记全部裸露。
 */
async function renderInlineRich(text: string, withMath: boolean): Promise<string> {
  const segments = withMath ? splitInlineMath(text) : null
  const md = getMarkdownIt()
  if (!segments) return md.renderInline(text)

  const katex = await loadKatex()
  let html = ''
  for (const seg of segments) {
    if (seg.type === 'text') {
      html += md.renderInline(seg.value)
      continue
    }
    try {
      html += katex.renderToString(seg.value, { displayMode: false, throwOnError: false })
    } catch {
      html += `<span class="cm-live-katex-error">${escapeHtml(seg.value)}</span>`
    }
  }
  return html
}

class KatexInlineLineWidget extends WidgetType {
  private _lineText: string
  constructor(lineText: string, private readonly pos: number) {
    super()
    this._lineText = lineText
  }
  eq(other: KatexInlineLineWidget): boolean { return other._lineText === this._lineText && other.pos === this.pos }
  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'cm-live-block cm-live-block--katex-inline-line'
    revealSourceOnClick(wrap, view, this.pos)
    this.renderLine(wrap)
    return wrap
  }
  private async renderLine(el: HTMLElement): Promise<void> {
    try {
      el.innerHTML = await renderInlineRich(this._lineText, true)
    } catch (e) {
      el.textContent = this._lineText
    }
  }
  ignoreEvent(): boolean { return true }
}

/* ------------------------------------------------------------------ */
/*  Image Widget                                                       */
/* ------------------------------------------------------------------ */

class ImageWidget extends WidgetType {
  constructor(
    private readonly src: string,
    private readonly alt: string,
    private readonly title = '',
  ) { super() }
  eq(other: ImageWidget): boolean { return other.src === this.src && other.alt === this.alt && other.title === this.title }
  toDOM(): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'cm-live-block cm-live-block--image'
    const img = document.createElement('img')
    img.alt = this.alt
    if (this.title) img.title = this.title
    img.loading = 'lazy'
    img.draggable = false
    const fail = () => {
      wrap.classList.add('cm-live-block--broken')
      wrap.textContent = '[image: ' + (this.alt || this.src) + ']'
    }
    img.onerror = fail
    wrap.appendChild(img)
    if (/^(https?:|data:|blob:)/i.test(this.src)) {
      img.src = this.src
    } else {
      // 本地路径：先解析为 dataURL、**解析成功后才第一次赋 src**。
      // ⚠️ 绝不能先把原始本地路径赋给 src：WebView 会把它当相对 URL 请求 → 立即 404 触发
      // onerror → 占位逻辑 textContent=… 把 img 从 DOM 里销毁 → 之后异步拿到 dataURL 再赋也无效
      //（真实竞态：mock 瞬间返回时能抢赢，真实 Tauri IPC 几十毫秒必输）。
      const store = useEditorStore.getState()
      const tab = store.tabs.find((t) => t.id === store.activeTabId)
      let baseDir: string | null = null
      if (tab?.filePath) {
        const sep = Math.max(tab.filePath.lastIndexOf('\\'), tab.filePath.lastIndexOf('/'))
        baseDir = sep > 0 ? tab.filePath.substring(0, sep) : null
      }
      resolveLocalImageSrc(this.src, baseDir)
        .then((resolved) => resolved ? invokeTauri<string>('read_image_base64', { path: resolved }) : null)
        .then((dataUrl) => { if (dataUrl) img.src = dataUrl; else fail() })
        .catch(fail)
    }
    return wrap
  }
  ignoreEvent(): boolean { return false }
}

/* ------------------------------------------------------------------ */
/*  Raw HTML Block Widget                                              */
/* ------------------------------------------------------------------ */

class HtmlBlockWidget extends WidgetType {
  constructor(private readonly html: string, private readonly pos: number) { super() }
  eq(other: HtmlBlockWidget): boolean { return other.html === this.html && other.pos === this.pos }
  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'cm-live-block cm-live-block--html'
    wrap.innerHTML = this.html
    revealSourceOnClick(wrap, view, this.pos)
    return wrap
  }
  ignoreEvent(): boolean { return true }
}

/* ------------------------------------------------------------------ */
/*  Fenced / indented code block (highlight + copy)                    */
/* ------------------------------------------------------------------ */

const COPY_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>'
const WRAP_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h12M3 18h6"/></svg>'
const CHECK_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>'

function highlightCode(code: string, lang: string): string {
  if (lang && hljs.getLanguage(lang)) {
    try {
      return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
    } catch {
      // 落到转义输出
    }
  }
  return escapeHtml(code)
}

class CodeBlockWidget extends WidgetType {
  constructor(
    private readonly code: string,
    private readonly lang: string,
    private readonly pos: number,
    /** 点击后光标落点：围栏代码块用第一条代码行，避免头尾 ``` 被一起显形 */
    private readonly contentPos: number,
  ) { super() }

  eq(other: CodeBlockWidget): boolean {
    return other.code === this.code && other.lang === this.lang &&
      other.pos === this.pos && other.contentPos === this.contentPos
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'cm-live-block cm-live-block--code'

    const pre = document.createElement('pre')
    pre.className = 'hljs'
    if (this.lang) pre.dataset.lang = this.lang
    const codeEl = document.createElement('code')
    codeEl.innerHTML = highlightCode(this.code, this.lang)
    pre.appendChild(codeEl)
    wrap.appendChild(pre)
    revealSourceOnClick(wrap, view, this.contentPos)

    const actions = document.createElement('div')
    actions.className = 'code-block-actions'
    // 换行开关：与预览模式右上角的按钮保持一致（默认横向滚动，点一下变自动换行）
    const wrapBtn = document.createElement('button')
    wrapBtn.className = 'code-block-wrap-btn'
    wrapBtn.title = '切换换行'
    wrapBtn.innerHTML = WRAP_ICON
    wrapBtn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const isWrapped = pre.style.whiteSpace === 'pre-wrap'
      pre.style.whiteSpace = isWrapped ? 'pre' : 'pre-wrap'
      wrapBtn.classList.toggle('active', !isWrapped)
    })
    const copyBtn = document.createElement('button')
    copyBtn.className = 'code-block-copy-btn'
    copyBtn.title = '复制代码'
    copyBtn.innerHTML = COPY_ICON
    copyBtn.addEventListener('click', async (e) => {
      e.preventDefault()
      e.stopPropagation()
      try {
        await navigator.clipboard.writeText(this.code)
        copyBtn.innerHTML = CHECK_ICON
        setTimeout(() => { copyBtn.innerHTML = COPY_ICON }, 1500)
      } catch {
        copyBtn.title = '复制失败'
      }
    })
    actions.appendChild(wrapBtn)
    actions.appendChild(copyBtn)
    wrap.appendChild(actions)

    if (this.lang) {
      const label = document.createElement('span')
      label.className = 'code-block-lang'
      label.textContent = this.lang
      wrap.appendChild(label)
    }
    return wrap
  }

  ignoreEvent(): boolean { return true }
}

/* ------------------------------------------------------------------ */
/*  HTML comment / presentation directive block                        */
/* ------------------------------------------------------------------ */

class CommentBlockWidget extends WidgetType {
  constructor(private readonly raw: string, private readonly pos: number) { super() }
  eq(other: CommentBlockWidget): boolean { return other.raw === this.raw && other.pos === this.pos }
  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'cm-live-block cm-live-block--comment'
    const chip = document.createElement('span')
    chip.className = 'cm-live-comment-chip'
    const trimmed = this.raw.trim()
    if (/[\r\n]/.test(trimmed)) {
      // 多行注释保留原始换行：实时模式应和点进去后的源码态看到同样的多行结构，
      // 而不是被压平成 `<!-- line one line two -->` 一行。
      chip.classList.add('cm-live-comment-chip--multi')
      chip.textContent = trimmed
    } else {
      chip.textContent = trimmed.length > 60 ? `${trimmed.slice(0, 58)}…` : trimmed
      chip.title = this.raw
    }
    wrap.appendChild(chip)
    revealSourceOnClick(wrap, view, this.pos)
    return wrap
  }
  ignoreEvent(): boolean { return true }
}

/* ------------------------------------------------------------------ */
/*  Reference link definition `[label]: url`                           */
/* ------------------------------------------------------------------ */

class LinkDefinitionWidget extends WidgetType {
  constructor(
    private readonly label: string,
    private readonly dest: string,
    private readonly title: string,
    private readonly pos: number,
  ) { super() }
  eq(other: LinkDefinitionWidget): boolean {
    return other.label === this.label && other.dest === this.dest &&
      other.title === this.title && other.pos === this.pos
  }
  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'cm-live-block cm-live-block--link-def'
    const label = document.createElement('span')
    label.className = 'cm-live-link-def-label'
    label.textContent = `[${this.label}]`
    const arrow = document.createElement('span')
    arrow.className = 'cm-live-link-def-arrow'
    arrow.textContent = '→'
    const dest = document.createElement('span')
    dest.className = 'cm-live-link-def-dest'
    dest.textContent = this.dest || '(empty)'
    wrap.append(label, arrow, dest)
    if (this.title) {
      const title = document.createElement('span')
      title.className = 'cm-live-link-def-title'
      title.textContent = `“${this.title}”`
      wrap.appendChild(title)
    }
    revealSourceOnClick(wrap, view, this.pos)
    return wrap
  }
  ignoreEvent(): boolean { return true }
}

/* ------------------------------------------------------------------ */
/*  Footnote continuation line (multi-line / multi-paragraph)          */
/* ------------------------------------------------------------------ */

/**
 * 脚注续行在 lezer 里被解析成缩进代码块，但预览里它是普通段落。
 * 光标不在该行时用 widget 渲染行内 Markdown（加粗 / 代码 / 公式…），
 * 光标进入后恢复源码 —— 与其它块级 widget 一致。
 */
class FnBodyWidget extends WidgetType {
  constructor(
    private readonly text: string,
    private readonly withMath: boolean,
    private readonly pos: number,
  ) { super() }
  eq(other: FnBodyWidget): boolean {
    return other.text === this.text && other.withMath === this.withMath && other.pos === this.pos
  }
  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'cm-live-block cm-live-block--fn-body'
    revealSourceOnClick(wrap, view, this.pos)
    renderInlineRich(this.text, this.withMath)
      .then((html) => { wrap.innerHTML = html })
      .catch(() => { wrap.textContent = this.text })
    return wrap
  }
  ignoreEvent(): boolean { return true }
}

/* ------------------------------------------------------------------ */
/*  [toc] widget                                                       */
/* ------------------------------------------------------------------ */

class TocWidget extends WidgetType {
  constructor(private readonly headings: TocHeading[], private readonly pos: number) { super() }
  eq(other: TocWidget): boolean {
    if (other.pos !== this.pos) return false
    if (other.headings.length !== this.headings.length) return false
    for (let i = 0; i < this.headings.length; i++) {
      const a = this.headings[i]
      const b = other.headings[i]
      if (a.level !== b.level || a.text !== b.text || a.line !== b.line) return false
    }
    return true
  }
  toDOM(view: EditorView): HTMLElement {
    const nav = document.createElement('div')
    nav.className = 'cm-live-block cm-live-block--toc markdown-toc'
    // 点目录条目 = 滚动；点目录空白处 = 回到源码（让 [toc] 可编辑）
    revealSourceOnClick(nav, view, this.pos)
    if (this.headings.length === 0) {
      nav.textContent = '（当前文档没有标题）'
      return nav
    }
    const ul = document.createElement('ul')
    for (const h of this.headings) {
      const li = document.createElement('li')
      li.className = `markdown-toc-level-${h.level}`
      const a = document.createElement('a')
      a.href = '#'
      a.textContent = h.text
      a.dataset.line = String(h.line)
      a.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        const total = view.state.doc.lines
        const lineNo = Math.max(1, Math.min(total, h.line))
        const pos = view.state.doc.line(lineNo).from
        // 只滚动，不改选区：光标移动会让该行进入 caret-reveal（源码态），目录反而闪一下
        view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 16 }) })
      })
      li.appendChild(a)
      ul.appendChild(li)
    }
    nav.appendChild(ul)
    return nav
  }
  ignoreEvent(): boolean { return true }
}


const TABLE_HANDLE_ICON = '<svg width="10" height="14" viewBox="0 0 10 14" aria-hidden="true" fill="currentColor"><circle cx="3" cy="2.5" r="1.2"/><circle cx="7" cy="2.5" r="1.2"/><circle cx="3" cy="7" r="1.2"/><circle cx="7" cy="7" r="1.2"/><circle cx="3" cy="11.5" r="1.2"/><circle cx="7" cy="11.5" r="1.2"/></svg>'

/** 最近一次经由表格菜单复制/剪切的内容：剪贴板 API 不可用时的后备 */
let lastTableClipboard = ''

/** 右键菜单图标：Lucide 风格的线性图标（Obsidian 的表格菜单同样使用 Lucide） */
const menuIcon = (body: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`

const TABLE_MENU_ICONS = {
  cut: menuIcon('<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12"/>'),
  copy: menuIcon('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
  paste: menuIcon('<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>'),
  format: menuIcon('<path d="M4 7V4h16v3M9 20h6M12 4v16"/>'),
  alignLeft: menuIcon('<path d="M3 6h18M3 12h12M3 18h15"/>'),
  alignCenter: menuIcon('<path d="M3 6h18M6 12h12M4 18h16"/>'),
  alignRight: menuIcon('<path d="M3 6h18M9 12h12M6 18h15"/>'),
  eraser: menuIcon('<path d="m7 21-4.3-4.3a2 2 0 0 1 0-2.8l9.6-9.6a2 2 0 0 1 2.8 0l4.3 4.3a2 2 0 0 1 0 2.8L14 21"/><path d="M22 21H7"/>'),
  trash: menuIcon('<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6"/>'),
  rowAbove: menuIcon('<path d="M5 3h14M4 9l8-6 8 6M12 21V9"/>'),
  rowBelow: menuIcon('<path d="M5 21h14M4 15l8 6 8-6M12 3v12"/>'),
  colLeft: menuIcon('<path d="M3 5v14M9 4l6 8-6 8M21 12H9"/>'),
  colRight: menuIcon('<path d="M21 5v14M15 4l-8 8 8 8M3 12h12"/>'),
  up: menuIcon('<path d="M12 19V5M5 12l7-7 7 7"/>'),
  down: menuIcon('<path d="M12 5v14M19 12l-7 7-7-7"/>'),
  left: menuIcon('<path d="M19 12H5M12 19l-7-7 7-7"/>'),
  right: menuIcon('<path d="M5 12h14M12 5l7 7-7 7"/>'),
  sortAsc: menuIcon('<path d="m3 8 4-4 4 4M7 4v16M21 12h-6M21 16h-4M21 20h-2"/>'),
  sortDesc: menuIcon('<path d="m3 16 4 4 4-4M7 20V4M21 12h-6M21 16h-4M21 20h-2"/>'),
} as const

/**
 * 实时模式表格：单元格内联编辑 + Obsidian 风格的表格交互。
 *
 * · 列顶 / 行左的六点 handle：点击选中整列 / 整行
 * · 最右列 / 最下行边缘的窄条：点击追加列 / 行
 * · 行 hover 底色、按住拖动跨单元格矩形扩选、Ctrl+C 复制为 TSV
 */
class EditableTableWidget extends WidgetType {
  private _view: EditorView | null = null
  private _cleanup: Array<() => void> = []
  private _ro: ResizeObserver | null = null
  private _raf = 0

  constructor(private readonly data: TableData) { super() }

  eq(other: EditableTableWidget): boolean {
    // 位置也要比：文档前面的内容增删后，闭包里缓存的 cell.from/to 会失效
    if (this.data.from !== other.data.from || this.data.to !== other.data.to) return false
    if (this.data.cells.length !== other.data.cells.length) return false
    if (this.data.colCount !== other.data.colCount) return false
    for (let i = 0; i < this.data.cells.length; i++) {
      if ((this.data.cells[i]?.text ?? '') !== (other.data.cells[i]?.text ?? '')) return false
    }
    for (let i = 0; i < this.data.aligns.length; i++) {
      if (this.data.aligns[i] !== other.data.aligns[i]) return false
    }
    return true
  }

  destroy(): void {
    this.cleanup()
    this._view = null
  }

  private cleanup(): void {
    for (const fn of this._cleanup) {
      try { fn() } catch { /* ignore */ }
    }
    this._cleanup = []
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0 }
    this._ro?.disconnect()
    this._ro = null
  }

  toDOM(view: EditorView): HTMLElement {
    this._view = view
    this.cleanup()

    const host = document.createElement('div')
    host.className = 'cm-live-block cm-live-block--table'

    // Shadow DOM: CM6 的 input/beforeinput 监听器在 light DOM，
    // 看不到 shadow root 内部的事件，避免 CM6 抢占输入
    const shadow = host.attachShadow({ mode: 'open' })

    const katexEnabled = useSettingsStore.getState().enabledPlugins.includes('katex')

    const style = document.createElement('style')
    style.textContent = `
      .table-wrap {
        position: relative;
        padding: 20px 20px 20px 24px;
      }
      table { border-collapse: collapse; width: 100%; margin: 0; table-layout: auto; }
      th, td {
        padding: 0.6em 1em;
        border: 1px solid var(--editor-border, #ddd);
        text-align: left;
        cursor: text;
        min-width: 2em;
        outline: none;
      }
      th { background: var(--editor-surface, #f5f5f5); font-weight: 600; }
      /* hover 底色不能盖住选中底色：table tr:hover > td 的特异性 (0,1,3)
         高于 td.cell-selected (0,1,1)，会让鼠标所在行看起来没被选中 —— 表现就是
         纵向拖选时「要先越过整行进入下一行才变色」。这里用 :not() 把选中单元格排除，
         并给选中规则同级的特异性。 */
      table tr:hover > th:not(.cell-selected),
      table tr:hover > td:not(.cell-selected) {
        background: color-mix(in srgb, var(--editor-text, #000) 4%, transparent);
      }
      table tr > td.cell-selected,
      table tr > th.cell-selected {
        background: color-mix(in srgb, var(--editor-accent, #4a9eff) 18%, transparent);
      }
      /* 拖选期间只显示选中底色，hover 不再额外染色 */
      .table-wrap.is-selecting table tr:hover > td:not(.cell-selected),
      .table-wrap.is-selecting table tr:hover > th:not(.cell-selected) {
        background: transparent;
      }
      td.cell-placeholder { cursor: default; }
      td:focus, th:focus {
        box-shadow: inset 0 0 0 2px var(--editor-accent, #4a9eff);
      }
      .table-wrap.is-selecting { user-select: none; }
      .table-wrap.is-selecting td, .table-wrap.is-selecting th { cursor: cell; }
      td code, th code {
        font-family: var(--font-mono, monospace);
        background: var(--code-inline-bg, rgba(0,0,0,.06));
        padding: 0.15em 0.35em;
        border-radius: 4px;
      }
      td a, th a { color: var(--code-link, #4a9eff); text-decoration: underline; }
      td img, th img { max-width: 100%; height: auto; vertical-align: middle; }
      td .katex, th .katex { font-size: 1em; }
      td strong, th strong { font-weight: 700; }
      td em, th em { font-style: italic; }
      td s, th s, td del, th del { text-decoration: line-through; }
      .row-handle, .col-handle {
        position: absolute;
        width: 16px;
        height: 16px;
        padding: 0;
        margin: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid transparent;
        background: transparent;
        color: var(--editor-text, #333);
        border-radius: 4px;
        opacity: 0;
        cursor: pointer;
        z-index: 3;
      }
      .row-handle:hover, .col-handle:hover,
      .row-handle.is-visible, .col-handle.is-visible {
        opacity: 1;
        background: var(--editor-surface, #f5f5f5);
        border-color: var(--editor-border, #ddd);
      }
      .col-handle svg { transform: rotate(90deg); }
      .add-col, .add-row {
        position: absolute;
        padding: 0;
        margin: 0;
        border: 0;
        background: transparent;
        z-index: 4;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .add-col { width: 12px; border-radius: 4px; }
      .add-row { height: 12px; border-radius: 4px; }
      .add-col:hover, .add-row:hover {
        background: color-mix(in srgb, var(--editor-accent, #4a9eff) 34%, transparent);
      }
      .add-plus {
        width: 18px;
        height: 18px;
        flex: 0 0 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        font: 600 15px/1 var(--font-mono, monospace);
        color: var(--editor-bg, #fff);
        background: var(--editor-accent, #4a9eff);
        border-radius: 50%;
        opacity: 0;
        transform: scale(0.6);
        box-shadow: 0 1px 5px rgba(0, 0, 0, 0.25);
        pointer-events: none;
      }
      .add-col:hover .add-plus, .add-row:hover .add-plus {
        opacity: 1;
        transform: scale(1);
      }
      /* 右键菜单（对齐 Obsidian 表格菜单的分组与图标） */
      .table-menu {
        position: absolute;
        min-width: 196px;
        padding: 4px;
        background: var(--editor-surface, #fff);
        border: 1px solid var(--editor-border, #ddd);
        border-radius: 6px;
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
        font-size: 13px;
        color: var(--editor-text, #333);
        z-index: 30;
        user-select: none;
      }
      .menu-item {
        position: relative;
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 5px 10px;
        border: 0;
        background: transparent;
        color: inherit;
        font: inherit;
        text-align: left;
        border-radius: 4px;
        cursor: pointer;
        white-space: nowrap;
      }
      .menu-item:hover {
        background: color-mix(in srgb, var(--editor-accent, #4a9eff) 14%, transparent);
      }
      .menu-item svg { width: 15px; height: 15px; opacity: 0.75; flex: 0 0 15px; }
      .menu-item .menu-label { flex: 1; }
      .menu-item .menu-arrow { opacity: 0.6; font-size: 11px; }
      .menu-sep { height: 1px; margin: 4px 6px; background: var(--editor-border, #ddd); opacity: 0.7; }
      .menu-item.has-sub > .submenu {
        position: absolute;
        left: calc(100% - 2px);
        top: -5px;
        min-width: 150px;
        padding: 4px;
        background: var(--editor-surface, #fff);
        border: 1px solid var(--editor-border, #ddd);
        border-radius: 6px;
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
        display: none;
        z-index: 31;
      }
      .menu-item.has-sub:hover > .submenu { display: block; }
    `

    const wrapper = document.createElement('div')
    wrapper.className = 'table-wrap'
    const table = document.createElement('table')

    const { cells, colCount, aligns } = this.data
    const rowCount = Math.max(1, Math.ceil(cells.length / Math.max(1, colCount)))
    const rows: HTMLTableRowElement[] = []
    const cellMatrix: Array<Array<{ td: HTMLElement; cell: CellData | null }>> = []
    let idx = 0

    const schedule = () => {
      if (this._raf) return
      this._raf = requestAnimationFrame(() => {
        this._raf = 0
        positionOverlays()
      })
    }

    const renderCell = (td: HTMLElement, text: string, withMath: boolean): void => {
      renderInlineRich(text, withMath)
        .then((html) => {
          if (shadow.activeElement !== td) {
            td.innerHTML = html
            schedule()
          }
        })
        .catch(() => { td.textContent = text })
    }

    // 拖选时按需读取单元格矩形：表格会随编辑器滚动，缓存 rect 会立刻过期
    const cellAtPoint = (x: number, y: number): { r: number; c: number } | null => {
      for (let r = 0; r < cellMatrix.length; r++) {
        const row = cellMatrix[r]
        for (let c = 0; c < row.length; c++) {
          const rect = row[c]?.td.getBoundingClientRect()
          if (!rect) continue
          if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return { r, c }
        }
      }
      return null
    }

    // 单元格扩选状态（矩形，包含首尾）
    let selection: { r1: number; c1: number; r2: number; c2: number } | null = null
    const clearCellSelection = (): void => {
      if (!selection) return
      selection = null
      for (const row of cellMatrix) {
        for (const item of row) item.td.classList.remove('cell-selected')
      }
    }
    const setCellSelection = (ar: number, ac: number, br: number, bc: number): void => {
      clearCellSelection()
      const r1 = Math.max(0, Math.min(ar, br))
      const r2 = Math.min(rowCount - 1, Math.max(ar, br))
      const c1 = Math.max(0, Math.min(ac, bc))
      const c2 = Math.min(colCount - 1, Math.max(ac, bc))
      selection = { r1, c1, r2, c2 }
      for (let r = r1; r <= r2; r++) {
        const row = cellMatrix[r]
        if (!row) continue
        for (let c = c1; c <= c2; c++) row[c]?.td.classList.add('cell-selected')
      }
    }

    const placeCaret = (td: HTMLElement, x: number, y: number): void => {
      td.focus()
      const node = td.firstChild
      if (!node || node.nodeType !== Node.TEXT_NODE) return
      const textNode = node as Text
      const range = document.createRange()
      let best = textNode.length
      let bestScore = Infinity
      for (let i = 0; i <= textNode.length; i++) {
        range.setStart(textNode, i)
        range.setEnd(textNode, i)
        const rect = range.getClientRects()[0] ?? range.getBoundingClientRect()
        if (!rect || (!rect.width && !rect.height)) continue
        const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0
        const dx = Math.abs(x - rect.left)
        const score = dy * 10 + dx
        if (score < bestScore) { bestScore = score; best = i }
      }
      const sel = window.getSelection()
      if (!sel) return
      range.setStart(textNode, best)
      range.setEnd(textNode, best)
      sel.removeAllRanges()
      sel.addRange(range)
    }

    for (let r = 0; r < rowCount; r++) {
      const tr = document.createElement('tr')
      rows.push(tr)
      const rowItems: Array<{ td: HTMLElement; cell: CellData | null }> = []

      for (let c = 0; c < colCount; c++) {
        const cell = idx < cells.length ? cells[idx] : null
        idx++
        const td: HTMLElement = r === 0 ? document.createElement('th') : document.createElement('td')
        td.style.textAlign = aligns[c] || 'left'
        rowItems.push({ td, cell })

        if (!cell) {
          td.className = 'cell-placeholder'
          tr.appendChild(td)
          continue
        }

        td.textContent = cell.text
        td.contentEditable = 'true'

        // 不 preventDefault，让浏览器自然处理光标定位
        td.addEventListener('mousedown', (e: MouseEvent) => {
          e.stopPropagation()
          if (e.button !== 0) return
          // 已经处于编辑态的单元格也要能拖选：只在确定是「拖动」后才退出编辑，
          // 单击仍保留原来的插入光标 / 文本选择（Obsidian 的行为）。
          const wasActive = shadow.activeElement === td
          if (!wasActive) e.preventDefault()
          clearCellSelection()

          const startX = e.clientX
          const startY = e.clientY
          let moved = false

          const onMove = (ev: MouseEvent) => {
            const hit = cellAtPoint(ev.clientX, ev.clientY)
            if (!hit) return
            if (!moved && (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 5 ||
              hit.r !== r || hit.c !== c)) {
              moved = true
              wrapper.classList.add('is-selecting')
              if (wasActive) {
                // 拖动扩选优先于单元格内文本选择
                window.getSelection()?.removeAllRanges()
                td.blur()
              }
            }
            if (moved) {
              ev.preventDefault()
              setCellSelection(r, c, hit.r, hit.c)
            }
          }
          const onUp = (ev: MouseEvent) => {
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
            wrapper.classList.remove('is-selecting')
            if (!moved && !wasActive) {
              // 单击 = 进入编辑；手动放置光标，避免伸出表格选中其它行
              placeCaret(td, ev.clientX, ev.clientY)
            }
          }
          window.addEventListener('mousemove', onMove)
          window.addEventListener('mouseup', onUp)
        })

        // 进入单元格时切成源码文本：否则 contentEditable 编辑的是渲染后的 HTML，
        // 回写时 `**加粗**`、反引号这些标记会被一并丢掉。
        td.addEventListener('focus', () => {
          if (td.textContent !== cell.text) {
            td.textContent = cell.text
            const selectionApi = window.getSelection()
            const range = document.createRange()
            range.selectNodeContents(td)
            range.collapse(false)
            selectionApi?.removeAllRanges()
            selectionApi?.addRange(range)
          }
        })

        // 拦截所有输入事件，防止穿透到 CM6
        td.addEventListener('beforeinput', (e) => { e.stopPropagation() })
        td.addEventListener('input', (e) => { e.stopPropagation(); schedule() })
        // 渲染后的链接只是展示用：不要让点击跳出应用的 "无头浏览器" 导航
        td.addEventListener('click', (e) => {
          if ((e.target as Element | null)?.closest?.('a')) e.preventDefault()
        })

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
            withStableViewport(() => {
              const raw = this.view.state.doc.sliceString(cell.from, cell.to)
              const head = raw.match(/^(\s*)/)?.[1] ?? ''
              const tail = raw.match(/(\s*)$/)?.[1] ?? ''
              this.view.dispatch({
                changes: { from: cell.from, to: cell.to, insert: head + newText + tail },
              })
            })
          } else {
            renderCell(td, cell.text, katexEnabled)
          }
        })

        tr.appendChild(td)
      }

      table.appendChild(tr)
      cellMatrix.push(rowItems)
    }

    wrapper.appendChild(table)

    // --- 行 / 列 handle ---
    const rowHandles: HTMLButtonElement[] = []
    const colHandles: HTMLButtonElement[] = []

    for (let r = 0; r < rowCount; r++) {
      const handle = document.createElement('button')
      handle.type = 'button'
      handle.className = 'row-handle'
      handle.title = '选择整行'
      handle.innerHTML = TABLE_HANDLE_ICON
      handle.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation() })
      handle.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        setCellSelection(r, 0, r, colCount - 1)
      })
      wrapper.appendChild(handle)
      rowHandles.push(handle)
    }

    for (let c = 0; c < colCount; c++) {
      const handle = document.createElement('button')
      handle.type = 'button'
      handle.className = 'col-handle'
      handle.title = '选择整列'
      handle.innerHTML = TABLE_HANDLE_ICON
      handle.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation() })
      handle.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        setCellSelection(0, c, rowCount - 1, c)
      })
      wrapper.appendChild(handle)
      colHandles.push(handle)
    }

    // --- 边缘「+」窄条 ---
    const addCol = document.createElement('button')
    addCol.type = 'button'
    addCol.className = 'add-col'
    addCol.title = '添加列'
    const addColPlus = document.createElement('span')
    addColPlus.className = 'add-plus'
    addColPlus.textContent = '+'
    addCol.appendChild(addColPlus)
    addCol.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation() })
    addCol.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      commitAndInsert(addTableColumn)
    })

    const addRow = document.createElement('button')
    addRow.type = 'button'
    addRow.className = 'add-row'
    addRow.title = '添加行'
    const addRowPlus = document.createElement('span')
    addRowPlus.className = 'add-plus'
    addRowPlus.textContent = '+'
    addRow.appendChild(addRowPlus)
    addRow.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation() })
    addRow.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      commitAndInsert(addTableRow)
    })

    wrapper.appendChild(addCol)
    wrapper.appendChild(addRow)

    // 行 / 列 handle 的显隐：用 mousemove + 缓存的单元格矩形判断，比 tr 的
    // mouseenter 在 Shadow DOM / 虚拟滚动下更可靠。
    const hideHandles = (): void => {
      for (const h of rowHandles) h.classList.remove('is-visible')
      for (const h of colHandles) h.classList.remove('is-visible')
    }
    wrapper.addEventListener('mousemove', (e) => {
      const hit = cellAtPoint(e.clientX, e.clientY)
      for (let r = 0; r < rowHandles.length; r++) {
        rowHandles[r].classList.toggle('is-visible', !!hit && hit.r === r)
      }
      for (let c = 0; c < colHandles.length; c++) {
        colHandles[c].classList.toggle('is-visible', !!hit && hit.r === 0 && hit.c === c)
      }
    })
    wrapper.addEventListener('mouseleave', hideHandles)

    /**
     * 点「+」时如果还有单元格在编辑，先 blur 提交，再按最新文档长度取表格源码，
     * 否则第二次 dispatch 会基于旧位置把内容改错。
     */
    const commitAndInsert = (transform: (source: string) => string): void => {
      withStableViewport(() => {
        const active = shadow.activeElement as HTMLElement | null
        const before = view.state.doc.length
        if (active && table.contains(active) && active.isContentEditable) active.blur()
        const delta = view.state.doc.length - before
        const source = view.state.doc.sliceString(this.data.from, this.data.to + delta)
        const next = transform(source)
        view.dispatch({
          changes: { from: this.data.from, to: this.data.to + delta, insert: next },
        })
      })
    }

    /* ---------------- 右键菜单 ---------------- */

    let activeMenu: HTMLElement | null = null
    const closeTableMenu = (): void => {
      activeMenu?.remove()
      activeMenu = null
    }

    /** 先提交正在编辑的单元格，再返回最新的表格源码与各行绝对起点 */
    const readCurrentTable = () => {
      const active = shadow.activeElement as HTMLElement | null
      const before = view.state.doc.length
      if (active && table.contains(active) && active.isContentEditable) active.blur()
      const end = this.data.to + (view.state.doc.length - before)
      const text = view.state.doc.sliceString(this.data.from, end)
      const lines: Array<{ text: string; from: number }> = []
      let offset = this.data.from
      for (const lineText of text.replace(/\r\n?/g, '\n').split('\n')) {
        lines.push({ text: lineText, from: offset })
        offset += lineText.length + 1
      }
      return { from: this.data.from, to: end, text, lines }
    }

    /**
     * 表格改写前后锁住滚动位置。
     *
     * 整张表是 `Decoration.replace` 的 widget，任何一次改动都会把整块 DOM 重建；
     * 如果此时焦点正落在被移除的单元格 / 菜单按钮上，WebView（Tauri 的 WebView2
     * 尤其明显）会把 `.cm-scroller` 甩回顶部，长文档下用户就得重新找位置。
     * CM 的重新测量发生在 rAF 里，所以连续校正两帧。
     */
    const withStableViewport = (action: () => void): void => {
      const scroller = view.scrollDOM
      const top = scroller.scrollTop
      const winTop = window.scrollY
      action()
      const restore = (): void => {
        if (Math.abs(scroller.scrollTop - top) > 2) scroller.scrollTop = top
        if (Math.abs(window.scrollY - winTop) > 2) window.scrollTo(window.scrollX, winTop)
      }
      requestAnimationFrame(() => {
        restore()
        requestAnimationFrame(restore)
      })
    }

    const cellSpanAt = (
      cur: ReturnType<typeof readCurrentTable>,
      r: number,
      c: number,
    ) => {
      // 表头是第 0 行；正文行 r 对应源码第 r+1 行（第 1 行是分隔行）
      const line = cur.lines[r === 0 ? 0 : r + 1]
      if (!line) return null
      return parseTableRow(line.text, line.from)[c] ?? null
    }

    const selectionToTsv = (): string => {
      if (!selection) return ''
      const cur = readCurrentTable()
      const out: string[] = []
      for (let r = selection.r1; r <= selection.r2; r++) {
        const parts: string[] = []
        for (let c = selection.c1; c <= selection.c2; c++) {
          parts.push(cellSpanAt(cur, r, c)?.text ?? '')
        }
        out.push(parts.join('\t'))
      }
      return out.join('\n')
    }

    const writeClipboard = async (text: string): Promise<void> => {
      // 记一份进程内副本：没有剪贴板权限（Tauri / 未授权）时，「粘贴」仍可用
      lastTableClipboard = text
      try {
        await navigator.clipboard.writeText(text)
        return
      } catch { /* 退回到 execCommand */ }
      try {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        ta.style.pointerEvents = 'none'
        wrapper.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        ta.remove()
      } catch { /* ignore */ }
    }

    const readClipboard = async (): Promise<string> => {
      // readText() 在没有权限时会一直挂起（不是 reject），必须加超时，
      // 否则右键菜单会卡在「等待剪贴板」。超时后退回进程内副本。
      try {
        const text = await Promise.race([
          navigator.clipboard.readText(),
          new Promise<string>((resolve) => setTimeout(() => resolve(''), 200)),
        ])
        if (text) return text
      } catch { /* 无权限 / 非安全上下文 */ }
      return lastTableClipboard
    }

    const dispatchCellEdits = (edits: Array<{ from: number; to: number; insert: string }>): void => {
      if (edits.length === 0) return
      closeTableMenu()
      clearCellSelection()
      view.dispatch({ changes: [...edits].sort((a, b) => a.from - b.from) })
    }

    /** 只清内容、保留单元格与表格结构（缩进空格也保留） */
    const clearSelectedCells = (): void => {
      if (!selection) return
      const sel = selection
      withStableViewport(() => {
        const cur = readCurrentTable()
        const edits: Array<{ from: number; to: number; insert: string }> = []
        for (let r = sel.r1; r <= sel.r2; r++) {
          for (let c = sel.c1; c <= sel.c2; c++) {
            const span = cellSpanAt(cur, r, c)
            if (!span) continue
            const raw = view.state.doc.sliceString(span.from, span.to)
            const head = raw.match(/^\s*/)?.[0] ?? ''
            const tail = raw.match(/\s*$/)?.[0] ?? ''
            edits.push({ from: span.from, to: span.to, insert: head + tail })
          }
        }
        dispatchCellEdits(edits)
      })
    }

    const pasteIntoSelection = (text: string): void => {
      if (!selection) return
      const sel = selection
      withStableViewport(() => {
        const cur = readCurrentTable()
        const matrix = text
          .replace(/\r\n?/g, '\n')
          .replace(/\n+$/, '')
          .split('\n')
          .map((line) => line.split('\t'))
        const edits: Array<{ from: number; to: number; insert: string }> = []
        for (let i = 0; i < matrix.length; i++) {
          const r = sel.r1 + i
          if (r > rowCount - 1) break
          for (let j = 0; j < matrix[i].length; j++) {
            const c = sel.c1 + j
            if (c > colCount - 1) break
            const span = cellSpanAt(cur, r, c)
            if (!span) continue
            const raw = view.state.doc.sliceString(span.from, span.to)
            const head = raw.match(/^\s*/)?.[0] ?? ''
            const tail = raw.match(/\s*$/)?.[0] ?? ''
            edits.push({ from: span.from, to: span.to, insert: head + matrix[i][j] + tail })
          }
        }
        dispatchCellEdits(edits)
      })
    }

    /** 整表源码级改写（插入/删除/移动/对齐/排序） */
    const applyTableSource = (transform: (source: string) => string): void => {
      withStableViewport(() => {
        const cur = readCurrentTable()
        const next = transform(cur.text)
        closeTableMenu()
        if (next === cur.text) return
        clearCellSelection()
        view.dispatch({ changes: { from: cur.from, to: cur.to, insert: next } })
      })
    }

    const applyAlign = (align: TableAlign): void => {
      if (!selection) return
      const cols: number[] = []
      for (let c = selection.c1; c <= selection.c2; c++) cols.push(c)
      applyTableSource((source) => cols.reduce((acc, c) => setTableColumnAlign(acc, c, align), source))
    }

    const deleteSelection = (): void => {
      if (!selection) return
      const { r1, c1, r2, c2 } = selection
      const wholeRows = c1 === 0 && c2 === colCount - 1
      const wholeCols = r1 === 0 && r2 === rowCount - 1
      if (wholeRows) {
        const indices: number[] = []
        // 表头行不能删；只选表头时退化为清空
        for (let r = Math.max(1, r1); r <= r2; r++) indices.push(r + 1)
        if (indices.length > 0) {
          applyTableSource((source) => deleteTableRows(source, indices))
          return
        }
        clearSelectedCells()
        return
      }
      if (wholeCols) {
        const indices: number[] = []
        for (let c = c1; c <= c2; c++) indices.push(c)
        if (indices.length < colCount) {
          applyTableSource((source) => deleteTableColumns(source, indices))
          return
        }
        // 全部列都选中时至少留一列，否则表格语法失效
        clearSelectedCells()
        return
      }
      clearSelectedCells()
    }

    const separator = (): HTMLElement => {
      const sep = document.createElement('div')
      sep.className = 'menu-sep'
      return sep
    }

    const buildMenuItem = (icon: string, label: string, onClick: () => void): HTMLButtonElement => {
      const item = document.createElement('button')
      item.type = 'button'
      item.className = 'menu-item'
      item.setAttribute('role', 'menuitem')
      item.innerHTML = icon
      const text = document.createElement('span')
      text.className = 'menu-label'
      text.textContent = label
      item.appendChild(text)
      item.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        onClick()
      })
      return item
    }

    const buildSubmenuItem = (
      icon: string,
      label: string,
      entries: Array<[string, string, () => void]>,
    ): HTMLElement => {
      const item = document.createElement('div')
      item.className = 'menu-item has-sub'
      item.innerHTML = icon
      const text = document.createElement('span')
      text.className = 'menu-label'
      text.textContent = label
      item.appendChild(text)
      const arrow = document.createElement('span')
      arrow.className = 'menu-arrow'
      arrow.textContent = '▸'
      item.appendChild(arrow)
      const submenu = document.createElement('div')
      submenu.className = 'submenu'
      for (const [subIcon, subLabel, action] of entries) {
        submenu.appendChild(buildMenuItem(subIcon, subLabel, action))
      }
      item.appendChild(submenu)
      return item
    }

    const openTableMenu = (clientX: number, clientY: number): void => {
      closeTableMenu()
      if (!selection) return
      const { r1, c1, r2, c2 } = selection
      const singleRow = r1 === r2
      const singleCol = c1 === c2
      const wholeRows = c1 === 0 && c2 === colCount - 1
      const wholeCols = r1 === 0 && r2 === rowCount - 1

      const menu = document.createElement('div')
      menu.className = 'table-menu'
      menu.setAttribute('role', 'menu')

      menu.appendChild(buildMenuItem(TABLE_MENU_ICONS.cut, '剪切', () => {
        void writeClipboard(selectionToTsv()).then(() => clearSelectedCells())
      }))
      menu.appendChild(buildMenuItem(TABLE_MENU_ICONS.copy, '复制', () => {
        void writeClipboard(selectionToTsv())
        closeTableMenu()
      }))
      menu.appendChild(buildMenuItem(TABLE_MENU_ICONS.paste, '粘贴', () => {
        void readClipboard().then((text) => {
          if (text) pasteIntoSelection(text)
          else closeTableMenu()
        })
      }))
      menu.appendChild(separator())
      menu.appendChild(buildSubmenuItem(TABLE_MENU_ICONS.format, '文本格式', [
        [TABLE_MENU_ICONS.alignLeft, '左对齐', () => applyAlign('left')],
        [TABLE_MENU_ICONS.alignCenter, '居中对齐', () => applyAlign('center')],
        [TABLE_MENU_ICONS.alignRight, '右对齐', () => applyAlign('right')],
      ]))

      const insertItems: HTMLElement[] = []
      if (singleRow) {
        // 表头（r1=0）没有「上方」行，插到分隔行之后作为第一条正文行
        insertItems.push(buildMenuItem(TABLE_MENU_ICONS.rowAbove, '在上方插入行', () =>
          applyTableSource((source) => insertTableRow(source, r1 === 0 ? 2 : r1 + 1))))
        insertItems.push(buildMenuItem(TABLE_MENU_ICONS.rowBelow, '在下方插入行', () =>
          applyTableSource((source) => insertTableRow(source, r2 + 2))))
      }
      if (singleCol) {
        insertItems.push(buildMenuItem(TABLE_MENU_ICONS.colLeft, '在左侧插入列', () =>
          applyTableSource((source) => insertTableColumn(source, c1))))
        insertItems.push(buildMenuItem(TABLE_MENU_ICONS.colRight, '在右侧插入列', () =>
          applyTableSource((source) => insertTableColumn(source, c2 + 1))))
      }
      if (insertItems.length > 0) {
        menu.appendChild(separator())
        for (const item of insertItems) menu.appendChild(item)
      }

      const moveItems: HTMLElement[] = []
      if (singleRow && r1 > 0) {
        moveItems.push(buildMenuItem(TABLE_MENU_ICONS.up, '上移该行', () =>
          applyTableSource((source) => moveTableRow(source, r1 + 1, -1))))
        moveItems.push(buildMenuItem(TABLE_MENU_ICONS.down, '下移该行', () =>
          applyTableSource((source) => moveTableRow(source, r1 + 1, 1))))
      }
      if (singleCol) {
        moveItems.push(buildMenuItem(TABLE_MENU_ICONS.left, '左移该列', () =>
          applyTableSource((source) => moveTableColumn(source, c1, -1))))
        moveItems.push(buildMenuItem(TABLE_MENU_ICONS.right, '右移该列', () =>
          applyTableSource((source) => moveTableColumn(source, c1, 1))))
      }
      if (moveItems.length > 0) {
        menu.appendChild(separator())
        for (const item of moveItems) menu.appendChild(item)
      }

      if (singleCol) {
        menu.appendChild(separator())
        menu.appendChild(buildMenuItem(TABLE_MENU_ICONS.sortAsc, '按此列升序排序', () =>
          applyTableSource((source) => sortTableRows(source, c1, 'asc'))))
        menu.appendChild(buildMenuItem(TABLE_MENU_ICONS.sortDesc, '按此列降序排序', () =>
          applyTableSource((source) => sortTableRows(source, c1, 'desc'))))
      }

      menu.appendChild(separator())
      menu.appendChild(buildMenuItem(TABLE_MENU_ICONS.eraser, '清空选中的单元格', () => clearSelectedCells()))
      menu.appendChild(buildMenuItem(
        TABLE_MENU_ICONS.trash,
        wholeRows ? '删除选中的行' : wholeCols ? '删除选中的列' : '删除选中的单元格',
        () => deleteSelection(),
      ))

      wrapper.appendChild(menu)
      const wrapRect = wrapper.getBoundingClientRect()
      const menuRect = menu.getBoundingClientRect()
      let left = clientX - wrapRect.left
      let top = clientY - wrapRect.top
      if (clientX + menuRect.width > window.innerWidth - 8) {
        left = clientX - wrapRect.left - menuRect.width
      }
      if (clientY + menuRect.height > window.innerHeight - 8) {
        top = clientY - wrapRect.top - menuRect.height
      }
      menu.style.left = `${Math.max(4, Math.round(left))}px`
      menu.style.top = `${Math.max(4, Math.round(top))}px`
      activeMenu = menu
    }

    wrapper.addEventListener('contextmenu', (e) => {
      const target = e.target as Element | null
      const handle = target?.closest?.('.row-handle, .col-handle') as HTMLElement | null
      if (handle) {
        const r = rowHandles.indexOf(handle as HTMLButtonElement)
        if (r >= 0) setCellSelection(r, 0, r, colCount - 1)
        const c = colHandles.indexOf(handle as HTMLButtonElement)
        if (c >= 0) setCellSelection(0, c, rowCount - 1, c)
      } else {
        const hit = cellAtPoint(e.clientX, e.clientY)
        if (!hit) return
        const inside = selection &&
          hit.r >= selection.r1 && hit.r <= selection.r2 &&
          hit.c >= selection.c1 && hit.c <= selection.c2
        if (!inside) setCellSelection(hit.r, hit.c, hit.r, hit.c)
      }
      e.preventDefault()
      e.stopPropagation()
      openTableMenu(e.clientX, e.clientY)
    })

    const onMenuKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && activeMenu) {
        e.preventDefault()
        closeTableMenu()
      }
    }
    window.addEventListener('keydown', onMenuKeyDown, true)
    this._cleanup.push(() => window.removeEventListener('keydown', onMenuKeyDown, true))
    this._cleanup.push(closeTableMenu)

    // --- 定位 handle / 窄条（表格异步渲染会改变列宽，用 ResizeObserver 跟随） ---
    let positionOverlays = (): void => { /* 在下方赋值 */ }

    positionOverlays = (): void => {
      const wrapRect = wrapper.getBoundingClientRect()
      const tableRect = table.getBoundingClientRect()

      for (let r = 0; r < rowCount; r++) {
        const rect = rows[r].getBoundingClientRect()
        const handle = rowHandles[r]
        if (!handle) continue
        handle.style.left = `${tableRect.left - wrapRect.left - 16}px`
        handle.style.top = `${rect.top - wrapRect.top + rect.height / 2 - 8}px`
      }

      const headerCells = rows[0]?.children
      for (let c = 0; c < colCount; c++) {
        const cellEl = headerCells?.[c] as HTMLElement | undefined
        const handle = colHandles[c]
        if (!cellEl || !handle) continue
        const rect = cellEl.getBoundingClientRect()
        handle.style.left = `${rect.left - wrapRect.left + rect.width / 2 - 8}px`
        handle.style.top = `${tableRect.top - wrapRect.top - 16}px`
      }

      addCol.style.left = `${tableRect.right - wrapRect.left + 2}px`
      addCol.style.top = `${tableRect.top - wrapRect.top}px`
      addCol.style.height = `${tableRect.height}px`

      addRow.style.left = `${tableRect.left - wrapRect.left}px`
      addRow.style.top = `${tableRect.bottom - wrapRect.top + 2}px`
      addRow.style.width = `${tableRect.width}px`
    }

    // 点击表格外部时清掉扩选 / 关闭菜单，避免离开表格后仍留着蓝色单元格
    const onOutsideMouseDown = (e: MouseEvent) => {
      const path = typeof e.composedPath === 'function' ? e.composedPath() : []
      const insideHost = path.includes(host)
      if (!activeMenu || !path.includes(activeMenu)) closeTableMenu()
      if (!insideHost && selection) clearCellSelection()
    }
    window.addEventListener('mousedown', onOutsideMouseDown, true)
    this._cleanup.push(() => window.removeEventListener('mousedown', onOutsideMouseDown, true))

    // 拖动扩选时复制成 TSV（与 Obsidian / Excel 一致）
    host.addEventListener('copy', (e) => {
      if (!selection) return
      const active = shadow.activeElement as HTMLElement | null
      if (active && table.contains(active) && active.isContentEditable) return
      e.clipboardData?.setData('text/plain', selectionToTsv())
      e.preventDefault()
    })

    shadow.appendChild(style)
    shadow.appendChild(wrapper)

    // 单元格内容按行内 Markdown 渲染（加粗 / 行内代码 / 链接 / 公式）
    for (const row of cellMatrix) {
      for (const { td, cell } of row) {
        if (cell) renderCell(td, cell.text, katexEnabled)
      }
    }

    // KaTeX 的 CSS 不穿透 Shadow DOM，启用插件时单独注入一份
    if (katexEnabled && this.data.cells.some((c) => c?.text.includes('$'))) {
      loadKatexCss().then((css) => {
        if (!css) return
        const katexStyle = document.createElement('style')
        katexStyle.setAttribute('data-katex', '')
        katexStyle.textContent = css
        shadow.appendChild(katexStyle)
        schedule()
      })
    }

    this._ro = new ResizeObserver(schedule)
    this._ro.observe(table)
    this._cleanup.push(() => this._ro?.disconnect())
    schedule()

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
  const startLine = state.doc.lineAt(tableNode.from).number
  const endLine = state.doc.lineAt(Math.min(tableNode.to, state.doc.length)).number
  if (endLine < startLine + 1) return null

  const headerLine = state.doc.line(startLine)
  const headerCells = parseTableRow(headerLine.text, headerLine.from)
  const colCount = headerCells.length
  if (colCount === 0) return null

  // 第 2 行是分隔行；从第 3 行起是正文。空单元格保留为 null（见 parseTableRow 的说明）。
  const cells: Array<CellData | null> = headerCells.map((c) => ({ ...c }))
  for (let ln = startLine + 2; ln <= endLine; ln++) {
    const line = state.doc.line(ln)
    if (!line.text.trim()) {
      for (let c = 0; c < colCount; c++) cells.push(null)
      continue
    }
    const row = parseTableRow(line.text, line.from)
    for (let c = 0; c < colCount; c++) {
      const cell = row[c]
      cells.push(cell ? { ...cell } : null)
    }
  }

  return {
    cells,
    colCount,
    aligns: tableAligns(state, tableNode),
    from: tableNode.from,
    to: tableNode.to,
    source: state.doc.sliceString(tableNode.from, tableNode.to),
  }
}

/** 表格分隔行（第二行）的对齐方式；列数按表头补齐 */
function tableAligns(state: EditorState, tableNode: any): TableAlign[] {
  const startLine = state.doc.lineAt(tableNode.from).number
  const delimLine = startLine + 1
  if (delimLine > state.doc.lines) return []
  const colCount = parseTableRow(state.doc.line(startLine).text).length
  return parseTableAlignments(state.doc.line(delimLine).text, Math.max(1, colCount))
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

  const enabledPlugins = useSettingsStore.getState().enabledPlugins
  const mermaidEnabled = enabledPlugins.includes('mermaid')
  const katexEnabled = enabledPlugins.includes('katex')

  // 脚注全文分析：续行在 lezer 里是 CodeBlock，但不能当代码块渲染（也不该跳过行内扫描）
  const allLines = doc.toString().split('\n')
  const fn = analyzeFootnotes(allLines)

  // 收集 HTMLBlock 覆盖的行号，供下方 mermaid/公式/图片行扫描跳过，
  // 避免块内文本（如表格单元格里的 ```mermaid）被误判并导致装饰重叠。
  const htmlBlockLines = new Set<number>()
  tree.iterate({
    enter(node) {
      if (node.name !== 'HTMLBlock') return
      const sL = doc.lineAt(node.from).number
      const eL = doc.lineAt(Math.min(node.to, doc.length)).number
      for (let ln = sL; ln <= eL; ln++) htmlBlockLines.add(ln)
    },
  })

  // 表格覆盖行：表格整体由 widget 渲染，行级公式/图片不应再叠加
  const tableLines = new Set<number>()
  tree.iterate({
    enter(node) {
      if (node.name !== 'Table') return
      const sL = doc.lineAt(node.from).number
      const eL = doc.lineAt(Math.min(node.to, doc.length)).number
      for (let ln = sL; ln <= eL; ln++) tableLines.add(ln)
    },
  })

  // --- 代码块（围栏 + 缩进）：收集一次，供 mermaid / 高亮 widget / 其它扫描共用 ---
  interface LiveCodeBlock {
    start: number
    end: number
    lang: string
    code: string
    fenced: boolean
  }
  const codeBlocks: LiveCodeBlock[] = []
  const codeLines = new Set<number>()
  const isCaretInside = (start: number, end: number) => curLineStart <= end && curLineEnd >= start

  tree.iterate({
    enter(node) {
      if (node.name !== 'FencedCode' && node.name !== 'CodeBlock') return
      const start = doc.lineAt(node.from).number
      const end = doc.lineAt(Math.min(node.to, doc.length)).number
      // 脚注续行被 lezer 当成缩进代码块 —— 语义上是正文，跳过
      let allContinuation = true
      for (let ln = start; ln <= end; ln++) {
        if (!fn.continuationLines.has(ln - 1)) { allContinuation = false; break }
      }
      if (allContinuation) return
      for (let ln = start; ln <= end; ln++) {
        if (!fn.continuationLines.has(ln - 1)) codeLines.add(ln)
      }
      if (htmlBlockLines.has(start)) return

      const fenced = node.name === 'FencedCode'
      let lang = ''
      let code = ''
      if (fenced) {
        const open = /^\s{0,3}(`{3,}|~{3,})\s*([^\s`~]*)/.exec(doc.line(start).text)
        lang = (open?.[2] || '').trim()
        let contentEnd = end
        if (end > start && /^\s{0,3}(`{3,}|~{3,})\s*$/.test(doc.line(end).text)) contentEnd = end - 1
        const parts: string[] = []
        for (let ln = start + 1; ln <= contentEnd; ln++) {
          if (fn.continuationLines.has(ln - 1)) continue
          parts.push(doc.line(ln).text)
        }
        code = parts.join('\n')
      } else {
        const parts: string[] = []
        for (let ln = start; ln <= end; ln++) {
          if (fn.continuationLines.has(ln - 1)) continue
          parts.push(doc.line(ln).text.replace(/^(?: {1,4}|\t)/, ''))
        }
        code = parts.join('\n')
      }
      codeBlocks.push({ start, end, lang: lang.split(/[\s{]/)[0], code, fenced })
    },
  })

  // --- Mermaid blocks ---
  if (mermaidEnabled) {
    for (const block of codeBlocks) {
      if (!block.fenced || block.lang.toLowerCase() !== 'mermaid') continue
      if (isCaretInside(block.start, block.end)) continue
      ranges.push(Decoration.replace({
        widget: new MermaidWidget(block.code, doc.line(block.start).from),
        block: true,
      }).range(doc.line(block.start).from, doc.line(block.end).to))
    }
  }

  // --- 普通代码块：高亮 + 语言标签 + 复制按钮（光标进入块内恢复源码） ---
  for (const block of codeBlocks) {
    if (mermaidEnabled && block.fenced && block.lang.toLowerCase() === 'mermaid') continue
    if (isCaretInside(block.start, block.end)) continue
    const contentLine = block.fenced && block.start < block.end ? block.start + 1 : block.start
    ranges.push(Decoration.replace({
      widget: new CodeBlockWidget(
        block.code,
        block.lang,
        doc.line(block.start).from,
        doc.line(contentLine).from,
      ),
      block: true,
    }).range(doc.line(block.start).from, doc.line(block.end).to))
  }

  // --- HTML 注释 / 演示指令块（<!-- layout: center -->） ---
  tree.iterate({
    enter(node) {
      if (node.name !== 'CommentBlock') return
      const start = doc.lineAt(node.from).number
      const end = doc.lineAt(Math.min(node.to, doc.length)).number
      if (isCaretInside(start, end)) return
      const raw = doc.sliceString(node.from, node.to)
      if (!raw.trim()) return
      ranges.push(Decoration.replace({
        widget: new CommentBlockWidget(raw, doc.line(start).from),
        block: true,
      }).range(doc.line(start).from, doc.line(end).to))
    },
  })

  // --- 脚注续行（多行 / 多段定义）：按行内 Markdown 渲染，光标进入该行恢复源码 ---
  for (const lineIdx of fn.continuationLines) {
    const lineNo = lineIdx + 1
    if (lineNo < 1 || lineNo > doc.lines) continue
    if (codeLines.has(lineNo)) continue
    if (lineNo >= curLineStart && lineNo <= curLineEnd) continue
    const line = doc.line(lineNo)
    const text = line.text.replace(/^[ \t]{1,4}/, '')
    if (!text.trim()) continue
    ranges.push(Decoration.replace({
      widget: new FnBodyWidget(text, katexEnabled, line.from),
      block: true,
    }).range(line.from, line.to))
  }

  // --- KaTeX block math ($$...$$) ---
  // 编辑态（光标落在公式块内任意一行）不替换源码，只在闭合 `$$` 下方追加预览；
  // 这样光标可以从第一行自由移到第二行、第三行继续改，不会一挪就弹回渲染态。
  if (katexEnabled) {
    const consumed = new Set<number>()
    for (let i = 1; i <= doc.lines; i++) {
      if (consumed.has(i)) continue
      if (htmlBlockLines.has(i)) continue
      if (codeLines.has(i)) continue
      if (tableLines.has(i)) continue
      if (fn.continuationLines.has(i - 1)) continue
      const line = doc.line(i)
      // 单行块级公式: $$formula$$（允许行首有列表标记 -/1. 等）
      const singleMatch = line.text.match(/^(?:\s*(?:[-*+]|\d+\.\s))?\s*\$\$(.+?)\$\$\s*$/)
      if (singleMatch) {
        if (isCaretInside(i, i)) {
          ranges.push(Decoration.widget({
            widget: new KatexPreviewWidget(singleMatch[1].trim()),
            block: true,
            side: 1,
          }).range(line.to))
        } else {
          ranges.push(Decoration.replace({
            widget: new KatexBlockWidget(singleMatch[1], line.from),
            block: true,
          }).range(line.from, line.to))
        }
        continue
      }
      // 多行块级公式: $$\nformula\n$$
      if (!/^(?:\s*(?:[-*+]|\d+\.\s))?\s*\$\$\s*$/.test(line.text)) continue
      // 闭合行 = 「整行是 $$」或「行尾是 $$」（`\sqrt{\pi}$$` 这种写法也要认）。
      // 找不到闭合就**不生成替换** —— 早先这里有个 `endLine = j` 兜底，会让 endLine
      // 一路推到文档最后一行，把公式之后的全部内容都盖掉（就是"公式后面没渲染出来"）。
      let endLine = -1
      for (let j = i + 1; j <= doc.lines; j++) {
        if (codeLines.has(j)) break
        if (/\$\$\s*$/.test(doc.line(j).text)) { endLine = j; break }
      }
      if (endLine <= i) continue
      for (let j = i; j <= endLine; j++) consumed.add(j)
      const endDocLine = doc.line(endLine)
      const tex = doc.sliceString(line.from, endDocLine.to)
        // 去掉开头 `$$`（含列表标记）与结尾 `$$`，中间换行原样保留给 KaTeX
        .replace(/^\s*(?:[-*+]|\d+\.\s)?\s*\$\$\s*\n?/, '')
        .replace(/\n?\s*\$\$\s*$/, '')
        .trim()
      if (isCaretInside(i, endLine)) {
        ranges.push(Decoration.widget({
          widget: new KatexPreviewWidget(tex),
          block: true,
          side: 1,
        }).range(endDocLine.to))
      } else {
        ranges.push(Decoration.replace({
          widget: new KatexBlockWidget(tex, line.from),
          block: true,
        }).range(line.from, endDocLine.to))
      }
    }
  }

  // --- KaTeX inline math ($...$) ---
  // 行级渲染：整行换成 HTML，但非公式片段交给 markdown-it inline 渲染 ——
  // 同一行的 **加粗**、`代码`、链接、删除线都保留（旧实现只转义成纯文本）。
  if (katexEnabled) {
    for (let i = 1; i <= doc.lines; i++) {
      if (i >= curLineStart && i <= curLineEnd) continue
      if (htmlBlockLines.has(i)) continue
      if (codeLines.has(i)) continue
      if (tableLines.has(i)) continue
      if (fn.continuationLines.has(i - 1)) continue
      const line = doc.line(i)
      const text = line.text
      // 跳过含有 $$ 块级标记的行（由块级公式检测处理）
      if (/\$\$/.test(text)) continue
      // 独占一行的图片由 ImageWidget 处理
      if (parseImageMarkdown(text)) continue
      if (!splitInlineMath(text)) continue
      ranges.push(Decoration.replace({
        widget: new KatexInlineLineWidget(text, line.from),
        block: true,
      }).range(line.from, line.to))
    }
  }

  // --- Images ---
  for (let i = 1; i <= doc.lines; i++) {
    if (i >= curLineStart && i <= curLineEnd) continue
    if (htmlBlockLines.has(i)) continue
    if (codeLines.has(i)) continue
    if (tableLines.has(i)) continue
    if (fn.continuationLines.has(i - 1)) continue
    const line = doc.line(i)
    const img = parseImageMarkdown(line.text)
    if (img) {
      ranges.push(Decoration.replace({
        widget: new ImageWidget(img.src, img.alt, img.title),
        block: true,
      }).range(line.from, line.to))
    }
  }

  // --- 引用式链接定义行：`[label]: url` 折叠成 chip（光标进入恢复源码） ---
  for (let i = 1; i <= doc.lines; i++) {
    if (i >= curLineStart && i <= curLineEnd) continue
    if (htmlBlockLines.has(i)) continue
    if (codeLines.has(i)) continue
    if (tableLines.has(i)) continue
    if (fn.definitionLines.has(i - 1)) continue
    if (fn.continuationLines.has(i - 1)) continue
    const line = doc.line(i)
    const def = parseReferenceDefinition(line.text)
    if (!def || !def.dest) continue
    ranges.push(Decoration.replace({
      widget: new LinkDefinitionWidget(def.label, def.dest, def.title, line.from),
      block: true,
    }).range(line.from, line.to))
  }

  // --- [toc] / [[toc]] ---
  // 标题列表只在真的存在占位行时才算（collectHeadings 是全文扫描）
  const tocLines: number[] = []
  for (let i = 1; i <= doc.lines; i++) {
    if (i >= curLineStart && i <= curLineEnd) continue
    if (codeLines.has(i)) continue
    if (htmlBlockLines.has(i)) continue
    if (fn.continuationLines.has(i - 1)) continue
    if (TOC_LINE_RE.test(doc.line(i).text)) tocLines.push(i)
  }
  if (tocLines.length > 0) {
    const headings = collectHeadings(allLines)
    for (const i of tocLines) {
      const line = doc.line(i)
      ranges.push(Decoration.replace({
        widget: new TocWidget(headings, line.from),
        block: true,
      }).range(line.from, line.to))
    }
  }

  // --- Raw HTML blocks (block-level HTML such as <table>) ---
  tree.iterate({
    enter(node) {
      if (node.name !== 'HTMLBlock') return
      const startLine = doc.lineAt(node.from).number
      const endLine = doc.lineAt(Math.min(node.to, doc.length)).number
      if (curLineStart >= startLine && curLineStart <= endLine) return
      const html = doc.sliceString(node.from, node.to)
      if (!html.trim()) return
      ranges.push(Decoration.replace({
        widget: new HtmlBlockWidget(html, node.from),
        block: true,
      }).range(node.from, node.to))
    },
  })

  // --- Standalone inline HTML lines (single element on its own line, e.g. <span>…) ---
  for (let i = 1; i <= doc.lines; i++) {
    if (i >= curLineStart && i <= curLineEnd) continue
    if (htmlBlockLines.has(i)) continue
    if (codeLines.has(i)) continue
    if (tableLines.has(i)) continue
    if (fn.continuationLines.has(i - 1)) continue
    const line = doc.line(i)
    const t = line.text.trim()
    if (!t) continue
    // 整行是一个完整的成对元素：<tag …>…</tag>
    const m = t.match(/^<([a-zA-Z][a-zA-Z0-9-]*)(?:\s[^>]*)?>[\s\S]*<\/\1>\s*$/)
    if (!m) continue
    ranges.push(Decoration.replace({
      widget: new HtmlBlockWidget(t, line.from),
      block: true,
    }).range(line.from, line.to))
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
  provide: (f) => [
    EditorView.decorations.from(f),
    // 把 block replace 范围注册为「原子区间」：点击 widget 中间时
    // skipAtomsForSelection 会把光标推到范围边界（from），而不是走
    // posAtCoords 对非 Text block 的 PosAssoc(block.to, -1) 分支 ——
    // 那条路径在被替换行 DOM 不存在时会把光标重映射到上一行（点击错位的次因）。
    EditorView.atomicRanges.of((view) => view.state.field(f, false) ?? Decoration.none),
  ],
})

/* ------------------------------------------------------------------ */
/*  Theme                                                              */
/* ------------------------------------------------------------------ */

const liveBlocksTheme = EditorView.theme({
  // ⚠️ 间距必须用 **padding**，不能用 margin：CM6 的高度测量只取
  // getBoundingClientRect().height（不含 margin，见 @codemirror/view
  // measureVisibleLineHeights），margin 会让 heightMap 与视觉逐 widget 累积偏移
  // ⇒ 实时模式点击内容时焦点错位一行（点击第一行、激活第二行）。
  // padding 在 rect 内 ⇒ 间距进入高度图，posAtCoords 命中准确。
  '.cm-live-block': {
    margin: '0',
    padding: '0.6em 0',
    cursor: 'text',
  },
  // 元信息属性面板（widget 本体在 cm-properties.ts，内部样式走 Shadow DOM）。
  // 宿主做成"属性面板"观感，与源码模式里元信息块的样式保持一致。
  // 同上：margin 改 padding（背景/borderLeft 随之覆盖整个占位区，观感不变）。
  '.cm-live-block--properties': {
    margin: '0',
    padding: 'calc(0.2em + 6px) 0 calc(0.8em + 6px) 10px',
    cursor: 'default',
    borderLeft: '2px solid var(--editor-accent)',
    background: 'color-mix(in srgb, var(--editor-text) 4%, transparent)',
    borderRadius: '0 var(--radius-md) var(--radius-md) 0',
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
  // Raw HTML blocks (table 等) — matches preview mode styles
  '.cm-live-block--html': {
    overflow: 'auto',
  },
  '.cm-live-block--html table': {
    borderCollapse: 'collapse',
    width: '100%',
    margin: '0',
  },
  '.cm-live-block--html th, .cm-live-block--html td': {
    padding: '0.6em 1em',
    border: '1px solid var(--editor-border)',
    textAlign: 'left',
    verticalAlign: 'top',
  },
  '.cm-live-block--html th': {
    background: 'var(--editor-surface)',
    fontWeight: '600',
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
  // 公式编辑态下方的小预览：与正式渲染区分开（更淡、更紧凑）
  '.cm-live-block--katex-preview': {
    padding: '0.35em 1em 0.6em',
    textAlign: 'center',
    overflow: 'visible',
    opacity: '0.8',
    borderTop: '1px dashed var(--editor-border)',
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
  '.cm-live-katex-error': {
    color: 'var(--editor-accent)',
    fontStyle: 'italic',
  },
  // 代码块：高亮 + 复制按钮（复用预览那套 .hljs / .code-block-* 全局样式）
  '.cm-live-block--code': {
    position: 'relative',
    padding: '0',
    overflow: 'hidden',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--code-block-bg)',
  },
  '.cm-live-block--code:hover .code-block-actions': {
    opacity: '1',
    pointerEvents: 'auto',
  },
  '.cm-live-block--code:hover .code-block-lang': {
    opacity: '1',
  },
  '.cm-live-block--code pre': {
    margin: '0',
    padding: '0.9em 1em',
    backgroundColor: 'transparent',
    overflowX: 'auto',
  },
  '.cm-live-block--code code': {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.9em',
  },
  // 注释 / 演示指令
  '.cm-live-block--comment': {
    padding: '0.15em 0',
    opacity: '0.9',
  },
  '.cm-live-comment-chip': {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.8em',
    color: 'var(--code-comment)',
    backgroundColor: 'var(--code-inline-bg)',
    padding: '0.1em 0.5em',
    borderRadius: '4px',
    whiteSpace: 'nowrap',
  },
  // 多行注释：保留原始换行，块状显示
  '.cm-live-comment-chip--multi': {
    display: 'block',
    whiteSpace: 'pre-wrap',
    lineHeight: '1.5',
    padding: '0.45em 0.7em',
    overflowX: 'auto',
    tabSize: '4',
  },
  // 脚注续行：与 .cm-md-footnote-def 保持同一套字号 / 左边距
  '.cm-live-block--fn-body': {
    paddingLeft: '1.8em',
    fontSize: '0.85em',
    lineHeight: '1.55',
    opacity: '0.9',
  },
  // 引用式链接定义
  '.cm-live-block--link-def': {
    display: 'flex',
    alignItems: 'baseline',
    gap: '0.5em',
    padding: '0.1em 0',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.82em',
    color: 'var(--code-comment)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
  },
  '.cm-live-link-def-label': {
    color: 'var(--code-link)',
    flexShrink: '0',
  },
  '.cm-live-link-def-arrow': {
    opacity: '0.6',
    flexShrink: '0',
  },
  '.cm-live-link-def-dest': {
    color: 'var(--code-string)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  '.cm-live-link-def-title': {
    opacity: '0.8',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  // [toc] widget：实时模式里也复刻预览目录的观感
  '.cm-live-block--toc': {
    margin: '0',
    padding: '0.7em 1em',
    borderLeft: '3px solid var(--editor-accent)',
    borderRadius: '6px',
    background: 'var(--editor-surface)',
    lineHeight: '1.6',
  },
  '.cm-live-block--toc ul': {
    margin: '0',
    paddingLeft: '0',
    listStyle: 'none',
  },
  '.cm-live-block--toc li': {
    margin: '0.22em 0',
  },
  '.cm-live-block--toc a': {
    color: 'var(--editor-text)',
    textDecoration: 'none',
    cursor: 'pointer',
  },
  '.cm-live-block--toc a:hover': {
    color: 'var(--editor-accent)',
    textDecoration: 'underline',
  },
  '.cm-live-block--toc .markdown-toc-level-2': { paddingLeft: '1em' },
  '.cm-live-block--toc .markdown-toc-level-3': { paddingLeft: '2em' },
  '.cm-live-block--toc .markdown-toc-level-4': { paddingLeft: '3em' },
  '.cm-live-block--toc .markdown-toc-level-5': { paddingLeft: '4em' },
  '.cm-live-block--toc .markdown-toc-level-6': { paddingLeft: '5em' },
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
