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
import { resolveLocalImageSrc } from './localImages.ts'
import { useEditorStore } from '../stores/editorStore.ts'
import { invokeTauri } from './tauri.ts'
import {
  analyzeFootnotes,
  decodeHtmlEntity,
  inSpans,
  inlineCodeSpans,
  isStandaloneImageLine,
  parseHtmlTag,
  parseImageMarkdown,
  parseReferenceDefinition,
  parseReferenceImage,
  sanitizeInlineStyle,
  VOID_HTML_TAGS,
  type ReferenceDefinition,
} from './liveSyntax.ts'

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
  constructor(readonly checked: boolean, readonly pos: number) { super() }
  toDOM() {
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.checked = this.checked
    cb.className = 'cm-md-task-checkbox'
    // 记录行首位置：Editor 里用事件委托回写源码（与预览同一套 toggleTaskAtLine）
    cb.dataset.taskPos = String(this.pos)
    cb.style.cssText = 'appearance:auto;width:1em;height:1em;margin:0 0.5em 0 0;cursor:pointer;accent-color:var(--editor-accent);vertical-align:middle;pointer-events:auto'
    return cb
  }
  eq(other: TaskCheckboxWidget) { return other.checked === this.checked && other.pos === this.pos }
  ignoreEvent() { return true }
}

function taskCheckboxWidget(checked: boolean, pos: number) {
  return Decoration.widget({
    widget: new TaskCheckboxWidget(checked, pos),
    side: -1,
    block: false,
  })
}

const fencedLine = lineClass('cm-md-fenced-line')
const headingLine = (level: number) => lineClass(`cm-md-heading-line cm-md-heading-line-${level}`)

// 脚注装饰：编号与预览全面对齐 —— markdown-it-footnote 按「引用首次出现顺序」重编号
// （字面标签 [^abc] 也渲染为 [1]），live 用同款全文编号映射 + widget 渲染，两模式同号同观感。
class FnRefWidget extends WidgetType {
  constructor(readonly num: number) { super() }
  toDOM() {
    const sup = document.createElement('sup')
    sup.className = 'cm-md-footnote-ref'
    sup.textContent = `[${this.num}]`
    return sup
  }
  eq(other: FnRefWidget) { return other.num === this.num }
  ignoreEvent() { return true }
}

class FnDefMarkWidget extends WidgetType {
  constructor(readonly num: number) { super() }
  toDOM() {
    const el = document.createElement('span')
    el.className = 'cm-md-footnote-def-mark'
    el.textContent = `${this.num}.`
    return el
  }
  eq(other: FnDefMarkWidget) { return other.num === this.num }
  ignoreEvent() { return true }
}

const fnDefLine = lineClass('cm-md-footnote-def')
const fnSepLine = lineClass('cm-md-footnote-sep')
// 脚注续行在 lezer 里是缩进代码块（整行被标成 monospace + 底色）。
// 这个类只负责把「代码块外观」还原成正文，语义上它不是代码。
const fnBodyLine = lineClass('cm-md-fn-body')

// ---- 行内 HTML 配对标签（<sup>1</sup> 等）：与预览 html:true 行为对齐 ----
// 白名单 = 预览里有视觉语义的常用行内标签；白名单外标签保持原文（不猜渲染）。
const HTML_INLINE_TAGS = new Set([
  'sup', 'sub', 'u', 'mark', 'kbd', 'small', 'del', 'ins', 'b', 'strong',
  'i', 'em', 's', 'strike', 'cite', 'q', 'abbr', 'dfn', 'var', 'samp',
  'code', 'tt', 'big', 'label', 'span', 'font', 'br', 'img', 'a',
])

/** 语义标签 → CSS 类（span/font 走行内 style，不额外上类） */
const HTML_TAG_CLASS: Record<string, string> = {
  sup: 'cm-md-html-sup',
  sub: 'cm-md-html-sub',
  u: 'cm-md-html-u',
  ins: 'cm-md-html-ins',
  s: 'cm-md-html-s',
  del: 'cm-md-html-del',
  strike: 'cm-md-html-strike',
  b: 'cm-md-html-b',
  strong: 'cm-md-html-strong',
  i: 'cm-md-html-i',
  em: 'cm-md-html-em',
  small: 'cm-md-html-small',
  mark: 'cm-md-html-mark',
  kbd: 'cm-md-html-kbd',
  cite: 'cm-md-html-cite',
  q: 'cm-md-html-q',
  abbr: 'cm-md-html-abbr',
  dfn: 'cm-md-html-abbr',
  var: 'cm-md-html-var',
  samp: 'cm-md-html-mono',
  tt: 'cm-md-html-mono',
  big: 'cm-md-html-big',
  code: 'cm-md-code',
  a: 'cm-md-link',
  span: 'cm-md-html-span',
  font: 'cm-md-html-span',
}

const HTML_TAG_TOKEN_RE = /<\/?[a-zA-Z][a-zA-Z0-9:-]*(?:"[^"]*"|'[^']*'|[^>"'])*>/g

/** mark decoration 按 (class, style) 缓存：同一行里重复标签不重复建对象 */
const htmlMarkCache = new Map<string, Decoration>()
function htmlMark(cls: string, style: string): Decoration {
  const key = `${cls}\u0000${style}`
  const cached = htmlMarkCache.get(key)
  if (cached) return cached
  const deco = Decoration.mark({
    class: cls || undefined,
    attributes: style ? { style } : undefined,
    inclusive: false,
  })
  htmlMarkCache.set(key, deco)
  return deco
}

const hideDeco = Decoration.mark({ class: 'cm-md-hiding-span' })

/** 实体解码后的可见文字（如 &copy; → ©） */
class EntityWidget extends WidgetType {
  constructor(readonly text: string) { super() }
  toDOM() {
    const s = document.createElement('span')
    s.className = 'cm-md-entity'
    s.textContent = this.text
    return s
  }
  eq(other: EntityWidget) { return other.text === this.text }
  ignoreEvent() { return true }
}

/** HTML/演示指令注释：光标不在该行时折叠成一枚淡淡的 chip */
class CommentChipWidget extends WidgetType {
  constructor(readonly raw: string) { super() }
  toDOM() {
    const el = document.createElement('span')
    el.className = 'cm-md-comment-chip'
    const oneLine = this.raw.replace(/\s+/g, ' ').trim()
    el.textContent = oneLine.length > 32 ? `${oneLine.slice(0, 30)}…` : oneLine
    el.title = this.raw
    return el
  }
  eq(other: CommentChipWidget) { return other.raw === this.raw }
  ignoreEvent() { return true }
}

/** 行内 <br>：直接插入一个 br 元素（预览里就是一个换行） */
class BrWidget extends WidgetType {
  toDOM(): HTMLElement { return document.createElement('br') }
  eq() { return true }
  ignoreEvent() { return true }
}

/** 行内图片：文字中间 `![alt](src)` 渲染为小图，光标进入该行后恢复源码 */
class InlineImageWidget extends WidgetType {
  constructor(
    private readonly src: string,
    private readonly alt: string,
    private readonly title: string,
  ) { super() }

  eq(other: InlineImageWidget) {
    return other.src === this.src && other.alt === this.alt && other.title === this.title
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement('span')
    wrap.className = 'cm-md-inline-image'
    const img = document.createElement('img')
    img.alt = this.alt
    if (this.title) img.title = this.title
    img.loading = 'lazy'
    img.draggable = false
    const fail = () => {
      wrap.classList.add('cm-md-inline-image--broken')
      wrap.textContent = this.alt || this.src
    }
    img.onerror = fail
    wrap.appendChild(img)

    if (/^(https?:|data:|blob:)/i.test(this.src)) {
      img.src = this.src
    } else {
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
  ignoreEvent() { return false }
}

const HEADING_LEVELS: Record<string, number> = {
  ATXHeading1: 1, ATXHeading2: 2, ATXHeading3: 3,
  ATXHeading4: 4, ATXHeading5: 5, ATXHeading6: 6,
  SetextHeading1: 1, SetextHeading2: 2,
}

/** 节点是否有某个祖先（表格单元格里的行内标记交给表格 widget 渲染） */
function hasAncestor(node: { parent: any }, name: string): boolean {
  let cur = node.parent
  while (cur) {
    if (cur.name === name) return true
    cur = cur.parent
  }
  return false
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
  // 嵌套列表的外层 BulletList / OrderedList 会把子列表的行也扫一遍，
  // 子列表节点自己又扫一遍 ⇒ 同一行被插两个 checkbox。这里按行去重。
  const seenTaskLines = new Set<number>()

  const doc = view.state.doc
  const allLines = doc.toString().split('\n')

  /**
   * 光标是否落在某个围栏代码块内（用块节点范围判断，而不是只看当前行）。
   * 用于让头尾 ``` 与语言标签在进入块时一起显形：块内任意一行都可直接编辑。
   */
  const caretInsideFenceBlock = (start: any): boolean => {
    let cur: any = start
    while (cur) {
      if (cur.name === 'FencedCode' || cur.name === 'CodeBlock') {
        const s = doc.lineAt(cur.from).number
        const e = doc.lineAt(Math.min(cur.to, doc.length)).number
        return fromLine <= e && toLine >= s
      }
      cur = cur.parent
    }
    return false
  }

  // 脚注全文分析：引用编号 + 定义块（含缩进续行）。lezer-markdown 的 GFM 扩展集
  // 不含 footnote，所以只能行扫描；顺带把「续行」从缩进代码块里排除。
  const footnoteAnalysis = analyzeFootnotes(allLines)
  // 引用式链接/图片的定义表（label → 目标）。用于把 `![alt][ref]` 也渲染成图片，
  // 与预览的 markdown-it 行为对齐；定义缺失时保留源码（预览此时也当普通文本）。
  const refDefs = new Map<string, ReferenceDefinition>()
  for (const lineText of allLines) {
    const def = parseReferenceDefinition(lineText)
    if (def && def.dest) refDefs.set(def.label.toLowerCase(), def)
  }
  // 代码块行（围栏 + 缩进）：行内实体/HTML/脚注扫描必须跳过，否则会把代码内容也渲染掉。
  // 脚注续行在 lezer 里是 CodeBlock，但语义上不是代码，排除掉。
  const codeLines = new Set<number>()
  tree.iterate({
    enter(node) {
      if (node.name !== 'FencedCode' && node.name !== 'CodeBlock') return
      const sL = doc.lineAt(node.from).number
      const eL = doc.lineAt(Math.min(node.to, doc.length)).number
      for (let ln = sL; ln <= eL; ln++) {
        if (!footnoteAnalysis.continuationLines.has(ln - 1)) codeLines.add(ln)
      }
    },
  })

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

        // 表格里的行内内容由表格 widget 统一渲染（整表被 replace），不要在这里重复装饰。
        if (name === 'Image' || name === 'Comment' || name === 'Entity' || name === 'Escape') {
          if (hasAncestor(node.node, 'Table')) return false
        }

        // 转义：\* → 显示 *（只隐藏反斜杠；光标进入该行时 CSS 让它重新出现，保持可编辑）
        if (name === 'Escape') {
          if (nTo - nFrom >= 2) ranges.push(hideDeco.range(nFrom, nFrom + 1))
          return
        }

        // HTML 实体：&copy; → ©（光标所在行保持源码）
        if (name === 'Entity') {
          if (caretTouches) return
          const raw = view.state.doc.sliceString(nFrom, nTo)
          const decoded = decodeHtmlEntity(raw)
          if (decoded !== raw) {
            ranges.push(Decoration.replace({ widget: new EntityWidget(decoded) }).range(nFrom, nTo))
          }
          return
        }

        // 行内注释：<!-- … -->（演示指令也走这里）。折叠成 chip，光标进入该行显示源码。
        if (name === 'Comment') {
          if (caretTouches) return
          const raw = view.state.doc.sliceString(nFrom, nTo)
          ranges.push(Decoration.replace({ widget: new CommentChipWidget(raw) }).range(nFrom, nTo))
          return
        }

        // 行内图片：![alt](src) / ![alt][ref] 出现在文字中间
        // （独占一行的交给块级 ImageWidget）
        if (name === 'Image') {
          if (caretTouches) return
          const raw = view.state.doc.sliceString(nFrom, nTo)
          if (isStandaloneImageLine(view.state.doc.lineAt(nFrom).text)) return
          const parsed = parseImageMarkdown(raw) ?? parseReferenceImage(raw, refDefs)
          // 引用式但定义缺失：保留完整源码（预览此时也显示原始文本）
          if (!parsed) return
          ranges.push(Decoration.replace({
            widget: new InlineImageWidget(parsed.src, parsed.alt, parsed.title),
          }).range(nFrom, nTo))
          return
        }

        // 引用式链接的 label 部分：`[foo][bar]` / `[baz][]` 里 `[bar]` / `[]` 只是定位用的，
        // 预览里完全不显示。LinkReference（定义行）的 LinkLabel 不能隐藏 —— 那是行首的 `[label]`；
        // Image 的 label 也不隐藏（未解析成功的引用式图片会整段保留源码）。
        if (name === 'LinkLabel') {
          const parent = node.node.parent
          if (parent && parent.name === 'Link' && nTo > nFrom) ranges.push(hideDeco.range(nFrom, nTo))
          return
        }

        if (HIDDEN_MARK_NODES.has(name)) {
          // 围栏块处于编辑态时，``` 围栏与语言标签必须可见（与代码行一样可编辑）
          if ((name === 'CodeMark' || name === 'CodeInfo') && caretInsideFenceBlock(node.node)) return
          // 图片自身的 `![` / `]` 不隐藏：解析成功的图片整节点已被 widget 替换；
          // 解析失败（引用式定义缺失）时要让用户看到完整源码。
          if (hasAncestor(node.node, 'Image')) return
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
            // 保留行首缩进（嵌套任务靠它定位），只把 `- [ ] ` 换成 checkbox。
            const taskMatch = lineText.match(/^(\s*)([-*+]\s)(\[[ xX]\])(\s|$)/)
            if (taskMatch) {
              const markerStart = lo.from + taskMatch[1].length
              const isChecked = /\[[xX]\]/.test(taskMatch[3])
              if (!seenTaskLines.has(lo.from)) {
                seenTaskLines.add(lo.from)
                if (!caretTouches) {
                  // 隐藏标记，插入真实 checkbox widget
                  const hideLen = taskMatch[2].length + taskMatch[3].length + (taskMatch[4] ? 1 : 0)
                  ranges.push(hideDeco.range(markerStart, markerStart + hideLen))
                  ranges.push(taskCheckboxWidget(isChecked, lo.from).range(markerStart))
                }
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
            const lineText = lo.text
            // 有序任务列表：`1. [ ]` / `2. [x]`（与无序任务同一套 checkbox 与回写）
            // 序号保留 —— 预览里 `<ol>` 的编号同样在 checkbox 前面，不能连编号一起隐藏。
            const taskMatch = lineText.match(/^(\s*\d+[.)]\s+)(\[[ xX]\])(\s|$)/)
            if (taskMatch) {
              const isChecked = /\[[xX]\]/.test(taskMatch[2])
              const markerStart = lo.from + taskMatch[1].length
              if (!seenTaskLines.has(lo.from)) {
                seenTaskLines.add(lo.from)
                if (!caretTouches) {
                  // 隐藏 `[ ]` 及紧随的一个空格，让 checkbox 稳稳占住这个位置
                  const hideLen = taskMatch[2].length + (taskMatch[3] ? 1 : 0)
                  ranges.push(hideDeco.range(markerStart, markerStart + hideLen))
                  ranges.push(taskCheckboxWidget(isChecked, lo.from).range(markerStart))
                }
              }
              ranges.push(isChecked ? taskItemLineChecked.range(lo.from) : taskItemLine.range(lo.from))
              continue
            }
            if (/^\s*\d+[.)]\s/.test(lineText)) {
              ranges.push(orderedItemLine.range(lo.from))
            }
          }
          return
        }

        if (name === 'FencedCode' || name === 'CodeBlock') {
          const sL = view.state.doc.lineAt(nFrom).number
          const eL = view.state.doc.lineAt(Math.min(nTo, view.state.doc.length)).number
          for (let ln = sL; ln <= eL; ln++) {
            if (footnoteAnalysis.continuationLines.has(ln - 1)) continue
            const lo = view.state.doc.line(ln)
            if (!seenFencedLines.has(lo.from)) { seenFencedLines.add(lo.from); ranges.push(fencedLine.range(lo.from)) }
          }
          return
        }
      },
    })
  }
  // 脚注：引用编号与定义块（含多行/多段续行）来自 liveSyntax.analyzeFootnotes。
  // 与 caret-reveal 模型一致：光标所在行显示原始语法（保持可编辑）。
  const firstDefLineIdx = footnoteAnalysis.firstDefinitionLine
  for (const range of view.visibleRanges) {
    let pos = range.from
    while (pos <= range.to) {
      const line = view.state.doc.lineAt(pos)
      pos = line.to + 1
      const lineIdx = line.number - 1
      const caretTouches = line.number >= fromLine && line.number <= toLine
      const text = line.text
      const def = footnoteAnalysis.byMarkerLine.get(lineIdx)
      // 定义行的行类/分隔线**恒定**（不随 caret 进出）：字号行距稳定 ⇒ 无高度跳变，
      // 光标进出定义区时下方内容不再位移（否则点按瞬间的坐标映射会失准）
      if (def) {
        ranges.push(fnDefLine.range(line.from))
        if (lineIdx === firstDefLineIdx) ranges.push(fnSepLine.range(line.from))
        if (!caretTouches) {
          // 「[^n]: 」记号替换为与预览一致的序号「n.」；caret 行显示原始语法（可编辑）
          const num = footnoteAnalysis.order.get(def.label) ?? 0
          ranges.push(Decoration.replace({ widget: new FnDefMarkWidget(num) })
            .range(line.from + def.markerStart, line.from + def.markerEnd))
        }
      }
      // 缩进续行（多行 / 多段定义）：套用脚注定义样式，并隐藏 4 格缩进 ——
      // 预览里续行与首行同一左边界，实时如果保留缩进会再叠一层 padding。
      if (footnoteAnalysis.continuationLines.has(lineIdx)) {
        ranges.push(fnDefLine.range(line.from))
        ranges.push(fnBodyLine.range(line.from))
        const indent = /^[ \t]{1,4}/.exec(text)
        if (indent && !caretTouches) ranges.push(hideDeco.range(line.from, line.from + indent[0].length))
      }
      if (caretTouches) continue
      // 代码块内容不参与行内扫描（否则 ``` 里的 &amp;/$x$/<sup> 都会被渲染）
      if (codeLines.has(line.number)) continue
      const codeSpans = inlineCodeSpans(text)
      let m: RegExpExecArray | null

      // 脚注引用 [^n] → 上标 [1]，编号按全文首次出现顺序（与 markdown-it-footnote 同款）
      const refRe = /\[\^([^\]\s]+)\]/g
      refRe.lastIndex = def ? def.markerEnd : 0
      while ((m = refRe.exec(text))) {
        if (inSpans(codeSpans, m.index)) continue
        const num = footnoteAnalysis.order.get(m[1]) ?? 0
        const s = line.from + m.index
        ranges.push(Decoration.replace({ widget: new FnRefWidget(num) }).range(s, s + m[0].length))
      }

      // 行内 HTML：按白名单解析标签，隐藏记号、给内容套语义类（style 只保留文字视觉属性）
      const opens: Array<{ start: number; end: number; name: string; cls: string; style: string }> = []
      HTML_TAG_TOKEN_RE.lastIndex = 0
      let hm: RegExpExecArray | null
      while ((hm = HTML_TAG_TOKEN_RE.exec(text))) {
        if (inSpans(codeSpans, hm.index)) continue
        const parsed = parseHtmlTag(hm[0])
        if (!parsed) continue
        const tag = parsed.name
        if (!HTML_INLINE_TAGS.has(tag)) continue
        const startAbs = line.from + hm.index
        const endAbs = startAbs + hm[0].length

        if (parsed.closing) {
          let idx = -1
          for (let k = opens.length - 1; k >= 0; k--) {
            if (opens[k].name === tag) { idx = k; break }
          }
          if (idx < 0) { ranges.push(hideDeco.range(startAbs, endAbs)); continue }
          const open = opens[idx]
          opens.splice(idx, 1)
          ranges.push(hideDeco.range(open.start, open.end))
          ranges.push(hideDeco.range(startAbs, endAbs))
          if (startAbs > open.end) {
            ranges.push(htmlMark(open.cls, open.style).range(open.end, startAbs))
          }
          continue
        }

        if (parsed.selfClosing || VOID_HTML_TAGS.has(tag)) {
          if (tag === 'br') {
            ranges.push(Decoration.replace({ widget: new BrWidget() }).range(startAbs, endAbs))
          } else if (tag === 'img') {
            const src = (parsed.attrs.src || '').trim()
            if (src) {
              ranges.push(Decoration.replace({
                widget: new InlineImageWidget(src, parsed.attrs.alt || '', parsed.attrs.title || ''),
              }).range(startAbs, endAbs))
            } else {
              ranges.push(hideDeco.range(startAbs, endAbs))
            }
          } else {
            ranges.push(hideDeco.range(startAbs, endAbs))
          }
          continue
        }

        const style = sanitizeInlineStyle(parsed.attrs.style || '')
        const fontColor = parsed.attrs.color || ''
        const safeColor = fontColor && !/url\s*\(|expression|javascript:/i.test(fontColor) ? fontColor : ''
        const mergedStyle = [style, safeColor ? `color: ${safeColor}` : ''].filter(Boolean).join('; ')
        opens.push({
          start: startAbs,
          end: endAbs,
          name: tag,
          cls: HTML_TAG_CLASS[tag] || '',
          style: mergedStyle,
        })
      }
      // 本行内没等到闭合标签的开记号：预览里同样不可见，这里直接隐藏
      for (const open of opens) ranges.push(hideDeco.range(open.start, open.end))
    }
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
  // 脚注：上标引用 [n] 与定义条目 —— 样式与预览全面对齐（链接色、小字号、无下划线）
  '.cm-md-footnote-ref': { verticalAlign: 'super', fontSize: '0.8em', fontWeight: '600', color: 'var(--code-link)', textDecoration: 'none', margin: '0 1px', cursor: 'pointer' },
  '.cm-md-footnote-def': { fontSize: '0.85em', lineHeight: '1.55', opacity: '0.9', paddingLeft: '1.8em', position: 'relative' },
  '.cm-md-footnote-def-mark': { position: 'absolute', left: '0.4em', color: 'var(--code-link)', fontWeight: '600' },
  // 首个定义行上方的分隔线（对齐预览 footnotes-sep）。
  // 用 padding-top 而非 margin-top：margin 在行盒之外、不属于任何行，
  // 点进间隙时 CM 的 posAtCoords 只能就近吸附 ⇒ 光标定位漂移；padding 属于行盒，点击必命中本行。
  '.cm-md-footnote-sep': { borderTop: '1px solid var(--code-comment)', paddingTop: '0.8em' },
  // 脚注续行：lezer 把它当缩进代码块，token 样式是 monospace + 底色。
  // 这里把「代码外观」还原成正文（续行的可视内容由块级 widget 负责渲染）。
  '.cm-md-fn-body, .cm-md-fn-body span': {
    fontFamily: 'inherit',
    backgroundColor: 'transparent',
    padding: '0',
    borderRadius: '0',
    color: 'var(--editor-text)',
  },
  // 行内 HTML 配对标签的语义渲染（标签记号已隐藏）
  '.cm-md-html-sup': { verticalAlign: 'super', fontSize: '0.8em' },
  '.cm-md-html-sub': { verticalAlign: 'sub', fontSize: '0.8em' },
  '.cm-md-html-u, .cm-md-html-ins': { textDecoration: 'underline' },
  '.cm-md-html-s, .cm-md-html-del, .cm-md-html-strike': { textDecoration: 'line-through' },
  '.cm-md-html-b, .cm-md-html-strong': { fontWeight: '700' },
  '.cm-md-html-i, .cm-md-html-em': { fontStyle: 'italic' },
  '.cm-md-html-small': { fontSize: '0.85em' },
  '.cm-md-html-mark': { backgroundColor: 'color-mix(in srgb, #ffd54d 35%, transparent)' },
  '.cm-md-html-kbd': { fontFamily: 'var(--font-mono)', backgroundColor: 'var(--code-inline-bg)', padding: '0.1em 0.35em', borderRadius: '4px', fontSize: '0.85em' },
  '.cm-md-html-cite': { fontStyle: 'italic' },
  '.cm-md-html-abbr': { textDecoration: 'underline dotted', textUnderlineOffset: '3px', cursor: 'help' },
  '.cm-md-html-var': { fontStyle: 'italic', fontFamily: 'var(--font-mono)' },
  '.cm-md-html-mono': { fontFamily: 'var(--font-mono)', fontSize: '0.9em' },
  '.cm-md-html-big': { fontSize: '1.15em' },
  '.cm-md-html-span': {},
  '.cm-md-html-q::before': { content: '"\\201C"' },
  '.cm-md-html-q::after': { content: '"\\201D"' },
  // 行内注释 / 演示指令折叠成的 chip
  '.cm-md-comment-chip': {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.78em',
    color: 'var(--code-comment)',
    backgroundColor: 'var(--code-inline-bg)',
    padding: '0.05em 0.4em',
    borderRadius: '4px',
    opacity: '0.85',
    whiteSpace: 'nowrap',
    cursor: 'text',
  },
  // 行内图片：限制高度，避免撑破行高与 CodeMirror 的高度测量
  '.cm-md-inline-image': { display: 'inline-block', verticalAlign: 'middle', maxWidth: '100%' },
  '.cm-md-inline-image img': {
    maxWidth: '100%',
    maxHeight: '4em',
    height: 'auto',
    borderRadius: '4px',
    verticalAlign: 'middle',
  },
  '.cm-md-inline-image--broken': {
    color: 'var(--editor-accent)',
    fontSize: '0.85em',
    fontStyle: 'italic',
  },
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
