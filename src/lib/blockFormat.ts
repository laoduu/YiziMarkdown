/**
 * blockFormat.ts — 块级格式（标题 / 列表 / 引用）的 toggle
 *
 * 与行内标记（inlineWrap.ts）相同的产品规则：
 * · 选中行全部已是该格式 → 取消
 * · 否则统一应用（不同级别直接替换，不出现 `## # `）
 *
 * 参考同类编辑器：Google Docs / Word 的项目符号与编号按钮就是 toggle；
 * Obsidian 提供 Toggle bullet/numbered list、Toggle blockquote 命令。
 * 标题在富文本里是“样式”，但在 Markdown 编辑器里用“同级再点取消、换级替换”更顺手。
 *
 * 额外修正旧实现的两个问题：
 * · 光标在行中间时不再把标记插到光标处，而是作用于整行（插在行首缩进之后）
 * · 缩进保留：`  - item` 不会变成 `-   item`
 */

export type BlockFormatKind = 'heading' | 'unordered' | 'ordered' | 'task' | 'quote'

export interface BlockFormatSpec {
  kind: BlockFormatKind
  /** 仅 heading 使用：1–6 */
  level?: number
}

/** 一次块级 toggle 对文档的改动（可直接作为 CodeMirror 事务参数） */
export interface BlockFormatEdit {
  from: number
  to: number
  insert: string
  selFrom: number
  selTo: number
}

/** 把工具栏的「插入参数 + mode」翻译成块级格式；返回 null 表示不是块级格式 */
export function blockSpecOf(
  markdown: string,
  mode?: 'wrap' | 'prefix' | 'ordered' | 'link' | 'tag' | 'block',
): BlockFormatSpec | null {
  if (mode === 'ordered') return { kind: 'ordered' }
  if (mode !== 'prefix') return null
  const m = markdown.trim()
  if (/^#{1,6}$/.test(m)) return { kind: 'heading', level: m.length }
  if (m === '- [ ]' || m === '- [x]' || m === '- [X]') return { kind: 'task' }
  if (m === '-') return { kind: 'unordered' }
  if (m === '>') return { kind: 'quote' }
  return null
}

interface ParsedLine {
  indent: string
  quote: string
  heading: string
  list: string
  content: string
}

function parseLine(line: string): ParsedLine {
  const indent = /^\s*/.exec(line)?.[0] ?? ''
  let rest = line.slice(indent.length)

  let quote = ''
  const qm = /^(?:>\s?)+/.exec(rest)
  if (qm && qm[0].length > 0) {
    quote = qm[0]
    rest = rest.slice(quote.length)
  }

  let heading = ''
  // CommonMark：1–6 个 # 后面必须跟空格或行尾（`#` 单独一行也是标题）
  const hm = /^(#{1,6})(?:\s+|$)/.exec(rest)
  if (hm) {
    heading = hm[0]
    rest = rest.slice(heading.length)
  }

  let list = ''
  const task = /^[-*+]\s+\[[ xX]\]\s+/.exec(rest)
  const ordered = /^\d{1,9}[.)]\s+/.exec(rest)
  const bullet = /^[-*+]\s+/.exec(rest)
  const lm = task ?? ordered ?? bullet
  if (lm) {
    list = lm[0]
    rest = rest.slice(list.length)
  }

  return { indent, quote, heading, list, content: rest }
}

function headingLevel(p: ParsedLine): number {
  return p.heading ? p.heading.trim().length : 0
}

function listKind(p: ParsedLine): 'task' | 'ul' | 'ol' | null {
  if (!p.list) return null
  if (/\[[ xX]\]/.test(p.list)) return 'task'
  if (/^\d/.test(p.list)) return 'ol'
  return 'ul'
}

/** 一行文本的块级格式：标题级别 / 列表类型 / 是否引用（格式条状态用） */
export interface LineFormatInfo {
  headingLevel: number
  list: 'task' | 'ul' | 'ol' | null
  quote: boolean
}

export function lineFormatInfo(line: string): LineFormatInfo {
  const p = parseLine(line)
  return { headingLevel: headingLevel(p), list: listKind(p), quote: p.quote !== '' }
}

function hasFormat(p: ParsedLine, spec: BlockFormatSpec): boolean {
  switch (spec.kind) {
    case 'heading': return headingLevel(p) === (spec.level ?? 0)
    case 'unordered': return listKind(p) === 'ul'
    case 'ordered': return listKind(p) === 'ol'
    case 'task': return listKind(p) === 'task'
    case 'quote': return p.quote !== ''
  }
  return false
}

function markerOf(spec: BlockFormatSpec, orderedIndex: number): string {
  switch (spec.kind) {
    case 'heading': return '#'.repeat(spec.level ?? 1) + ' '
    case 'unordered': return '- '
    case 'task': return '- [ ] '
    case 'ordered': return `${orderedIndex}. `
    case 'quote': return ''
  }
  return ''
}

function lineStartOf(doc: string, pos: number): number {
  const i = doc.lastIndexOf('\n', Math.max(0, pos - 1))
  return i < 0 ? 0 : i + 1
}

function lineEndOf(doc: string, pos: number): number {
  const i = doc.indexOf('\n', pos)
  return i < 0 ? doc.length : i
}

/**
 * 规划一次块级 toggle。
 *
 * 选区覆盖的每一行都会被处理；空行不加标记（但会保留在原位）。
 * 取消时只去掉对应标记；应用时先清掉互斥的标题/列表标记，再写入目标标记。
 */
export function planBlockToggle(
  doc: string,
  from: number,
  to: number,
  spec: BlockFormatSpec,
): BlockFormatEdit {
  const startPos = Math.max(0, Math.min(from, doc.length))
  const endPos = Math.max(startPos, Math.min(to, doc.length))
  const start = lineStartOf(doc, startPos)
  // 选区恰好停在行首时，不把下一行也带上
  const lastPos = endPos > startPos && doc.charAt(endPos - 1) === '\n' ? endPos - 1 : endPos
  const end = lineEndOf(doc, lastPos)
  const lines = doc.slice(start, end).split('\n')

  const parsed = lines.map(parseLine)
  const isBlank = (i: number): boolean => lines[i].trim() === ''
  const targets = lines.map((_, i) => i).filter((i) => !isBlank(i))
  const allHave = targets.length > 0 && targets.every((i) => hasFormat(parsed[i], spec))
  const removing = allHave
  const keepQuote = spec.kind !== 'quote'

  let orderedIndex = 0
  const newLines = lines.map((line, i) => {
    if (isBlank(i)) return line
    const p = parsed[i]
    const quote = keepQuote ? p.quote : (removing ? '' : '> ')
    let heading = p.heading
    let list = p.list
    if (spec.kind !== 'quote') {
      // 块级格式互斥：标题 ↔ 列表转换时清掉旧标记
      heading = ''
      list = ''
    }
    if (!removing) {
      if (spec.kind === 'heading') heading = markerOf(spec, 0)
      else if (spec.kind === 'unordered' || spec.kind === 'task') list = markerOf(spec, 0)
      else if (spec.kind === 'ordered') {
        orderedIndex += 1
        list = markerOf(spec, orderedIndex)
      }
    }
    return p.indent + quote + heading + list + p.content
  })

  const newBlock = newLines.join('\n')

  // 选区映射：前缀长度变化只影响标记之后的字符
  const prefixLen = (p: ParsedLine): number =>
    p.indent.length + p.quote.length + p.heading.length + p.list.length

  const mapInLine = (i: number, relOld: number): number => {
    const oldPrefix = prefixLen(parsed[i])
    const newPrefix = newLines[i].length - parsed[i].content.length
    if (relOld < oldPrefix) return Math.min(newPrefix, newLines[i].length)
    return Math.max(0, Math.min(relOld + (newLines[i].length - lines[i].length), newLines[i].length))
  }

  const oldStarts: number[] = []
  const newStarts: number[] = []
  let oldCursor = start
  let newCursor = start
  for (let i = 0; i < lines.length; i++) {
    oldStarts.push(oldCursor)
    newStarts.push(newCursor)
    oldCursor += lines[i].length + 1
    newCursor += newLines[i].length + 1
  }

  let lastLine = 0
  if (from !== to) {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (to >= oldStarts[i]) { lastLine = i; break }
    }
  }

  const selFrom = newStarts[0] + mapInLine(0, from - oldStarts[0])
  const selTo = from === to
    ? selFrom
    : newStarts[lastLine] + mapInLine(lastLine, to - oldStarts[lastLine])

  return { from: start, to: end, insert: newBlock, selFrom, selTo }
}
