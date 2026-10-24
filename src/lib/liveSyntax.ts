/**
 * 实时模式语法辅助（纯函数）。
 *
 * 实时模式不是完整 HTML 渲染器：它靠 CodeMirror 装饰逐节点实现，所以「解析结果」
 * 与「能渲染到哪一步」之间需要一层可测试的纯逻辑。这里集中三块：
 *   · HTML 实体解码（行内 `&copy;` 要与预览一样显示成 ©）；
 *   · 表格分隔行 → 列对齐（预览支持 `:--` / `--:` / `:--:`，实时此前一律左对齐）；
 *   · 脚注分析（引用编号顺序 + 多行/多段定义的续行区间）。
 *
 * 不依赖 DOM，便于 node --test 直接加载。
 */

export type TableAlign = 'left' | 'center' | 'right'

/** 行首缩进宽度：tab 按 4 列计（与 Markdown 的缩进语义一致） */
function indentWidth(line: string): number {
  let width = 0
  for (const ch of line) {
    if (ch === ' ') width += 1
    else if (ch === '\t') width += 4
    else break
  }
  return width
}

/** 行内代码区间（同行成对反引号）。HTML/脚注扫描都要跳过代码内容 */
export function inlineCodeSpans(text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = []
  const re = /`[^`]*`/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) spans.push([m.index, m.index + m[0].length])
  return spans
}

export function inSpans(spans: Array<[number, number]>, index: number): boolean {
  return spans.some(([a, b]) => index >= a && index < b)
}

/** 是否为围栏行（``` / ~~~），用于跳过代码块内的伪语法 */
function isFenceLine(line: string): boolean {
  return /^\s{0,3}(?:`{3,}|~{3,})/.test(line)
}

// ---------------------------------------------------------------------------
// HTML 实体
// ---------------------------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  copy: '©',
  reg: '®',
  trade: '™',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  laquo: '«',
  raquo: '»',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  middot: '·',
  bull: '•',
  deg: '°',
  plusmn: '±',
  times: '×',
  divide: '÷',
  larr: '←',
  rarr: '→',
  uarr: '↑',
  darr: '↓',
  harr: '↔',
  dagger: '†',
  Dagger: '‡',
  sect: '§',
  para: '¶',
  euro: '€',
  pound: '£',
  yen: '¥',
  cent: '¢',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
}

let decodeProbe: HTMLTextAreaElement | null = null

/**
 * 解码 HTML 实体。浏览器里直接用 textarea 的 HTML 解析器（覆盖全部命名实体）；
 * Node 测试环境退回数字实体 + 常用命名实体表。
 */
export function decodeHtmlEntity(entity: string): string {
  if (typeof document !== 'undefined') {
    try {
      if (!decodeProbe) decodeProbe = document.createElement('textarea')
      decodeProbe.innerHTML = entity
      return decodeProbe.value
    } catch {
      // 落到下面的纯函数实现
    }
  }
  const numeric = /^&#(x?)([0-9a-f]+);$/i.exec(entity)
  if (numeric) {
    const code = Number.parseInt(numeric[2], numeric[1] ? 16 : 10)
    if (Number.isFinite(code) && code > 0 && code <= 0x10ffff) {
      try {
        return String.fromCodePoint(code)
      } catch {
        return entity
      }
    }
    return entity
  }
  const named = /^&([a-z][a-z0-9]+);$/i.exec(entity)
  if (named) return NAMED_ENTITIES[named[1]] ?? NAMED_ENTITIES[named[1].toLowerCase()] ?? entity
  return entity
}

// ---------------------------------------------------------------------------
// 行内 HTML
// ---------------------------------------------------------------------------

export interface ParsedHtmlTag {
  closing: boolean
  selfClosing: boolean
  name: string
  attrs: Record<string, string>
}

/** 解析单个 HTML 起止标签（只认 `<tag attr="…">` / `</tag>`，不认注释与自动链接） */
export function parseHtmlTag(raw: string): ParsedHtmlTag | null {
  const m = /^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9:-]*)([\s\S]*?)(\/?)\s*>$/.exec(raw.trim())
  if (!m) return null
  const closing = m[1] === '/'
  const name = m[2].toLowerCase()
  const selfClosing = m[4] === '/'
  const attrs: Record<string, string> = {}
  if (!closing) {
    const attrRe = /([^\s"'=<>`/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
    let am: RegExpExecArray | null
    while ((am = attrRe.exec(m[3]))) {
      const key = am[1].toLowerCase()
      attrs[key] = am[2] ?? am[3] ?? am[4] ?? ''
    }
  }
  return { closing, selfClosing, name, attrs }
}

/** 行内 HTML 里允许跟随渲染的 CSS 属性（其余属性忽略，避免改写编辑器布局） */
const ALLOWED_STYLE_PROPS = new Set([
  'color', 'background-color', 'font-weight', 'font-style', 'font-size',
  'font-family', 'text-decoration', 'text-decoration-line', 'text-decoration-color',
  'vertical-align', 'letter-spacing', 'opacity', 'text-align',
])

/** 过滤行内 style：只保留文本视觉相关属性，禁用 url()/expression 等 */
export function sanitizeInlineStyle(style: string): string {
  const out: string[] = []
  for (const part of style.split(';')) {
    const idx = part.indexOf(':')
    if (idx < 0) continue
    const prop = part.slice(0, idx).trim().toLowerCase()
    const value = part.slice(idx + 1).trim()
    if (!prop || !value || !ALLOWED_STYLE_PROPS.has(prop)) continue
    if (/url\s*\(|expression|javascript:/i.test(value)) continue
    out.push(`${prop}: ${value}`)
  }
  return out.join('; ')
}

/** 空元素 / 自闭合标签：没有闭合标签可配对 */
export const VOID_HTML_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
])

// ---------------------------------------------------------------------------
// 表格对齐
// ---------------------------------------------------------------------------

/** 按未转义的 `|` 拆表格行；去掉首尾竖线产生的空单元格 */
function splitTableRow(line: string): string[] {
  const cells: string[] = []
  let cur = ''
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '\\' && line[i + 1] === '|') {
      // 保留 `\|` 原样：拆分结果会被重新拼回源码（加列 / 删列 / 对齐），
      // 在这里把转义消掉会让一个单元格在回写后裂成两列。
      cur += '\\|'
      i++
      continue
    }
    if (ch === '|') {
      cells.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  cells.push(cur)
  if (line.trimStart().startsWith('|')) cells.shift()
  if (line.trimEnd().endsWith('|')) cells.pop()
  return cells
}

/**
 * 从分隔行（`| :-- | --: |`）解析每列对齐。
 * 列数不足时补 left，多出的丢弃，保证与表头列数一致。
 */
export function parseTableAlignments(delimiterLine: string, colCount: number): TableAlign[] {
  const cells = splitTableRow(delimiterLine)
  const aligns: TableAlign[] = cells.map((cell) => {
    const t = cell.trim()
    const left = t.startsWith(':')
    const right = t.endsWith(':')
    if (left && right) return 'center'
    if (right) return 'right'
    return 'left'
  })
  while (aligns.length < colCount) aligns.push('left')
  return aligns.slice(0, colCount)
}

/** 一个表格单元格的纯文本与文档区间（供实时模式 edit-in-place 使用） */
export interface TableCellSpan {
  text: string
  from: number
  to: number
}

/**
 * 按单元格切分表格行，并给出每个单元格在文档中的绝对区间。
 *
 * 不能直接用 lezer 的 TableCell 节点：新增的空列 / 空行会被解析器跳过，
 * 导致实时表格把下一行的内容补进上一行（列错位）。这里按未转义的 `|` 自己切，
 * 空单元格也保留。
 */
export function parseTableRow(line: string, lineFrom = 0): TableCellSpan[] {
  const pipes: number[] = []
  for (let i = 0; i < line.length; i++) {
    if (line[i] !== '|') continue
    if (i > 0 && line[i - 1] === '\\') continue
    pipes.push(i)
  }
  if (pipes.length === 0) {
    return line.trim()
      ? [{ text: line.trim(), from: lineFrom, to: lineFrom + line.length }]
      : []
  }
  const segments: Array<[number, number]> = []
  let start = 0
  for (const p of pipes) {
    segments.push([start, p])
    start = p + 1
  }
  segments.push([start, line.length])
  // 行首/行尾竖线只是边界，不是单元格内容
  if (line.slice(0, pipes[0]).trim() === '') segments.shift()
  if (segments.length > 0 && line.slice(pipes[pipes.length - 1] + 1).trim() === '') segments.pop()
  return segments.map(([s, e]) => {
    const raw = line.slice(s, e)
    return { text: raw.trim(), from: lineFrom + s, to: lineFrom + e }
  })
}

/** 在表格行末尾追加一个单元格，尽量保留原有的首尾竖线与缩进写法 */
function appendTableCell(line: string, cellText: string): string {
  return mapTableRowCells(line, (cells) => [...cells, cellText])
}

/**
 * 按行改写单元格，同时保留该行原有的缩进与首尾竖线写法。
 * 所有结构性操作（加/删/移列、对齐）都经过这里，避免每行风格被改乱。
 */
function mapTableRowCells(line: string, fn: (cells: string[]) => string[]): string {
  const body = line.trimEnd()
  const indent = line.match(/^\s*/)?.[0] ?? ''
  const content = body.slice(indent.length)
  if (!content) return line
  const leading = content.startsWith('|')
  const trailing = content.endsWith('|')
  const cells = fn(splitTableRow(content))
  return indent + (leading ? '|' : '') + cells.join('|') + (leading || trailing ? '|' : '')
}

/** 表格行数（空行不计）；调用方传进来的 source 应当只包含表格自身的行 */
function tableSourceLines(source: string): string[] {
  return source.replace(/\r\n?/g, '\n').split('\n')
}

/**
 * 在最右侧新增一列（Obsidian live 模式的「+」行为）。
 * 分隔行补 `---`，其它行补空单元格；首尾竖线写法跟随原表。
 */
export function addTableColumn(source: string): string {
  return tableSourceLines(source)
    .map((line, idx) => {
      if (!line.trim()) return line
      // 第 2 行是 | --- | --- |；新列默认左对齐
      return appendTableCell(line, idx === 1 ? ' --- ' : '  ')
    })
    .join('\n')
}

/**
 * 在表格末尾新增一行空单元格。
 * 列数取表头（首行）的单元格数；保留表头的缩进与首尾竖线风格。
 */
export function addTableRow(source: string): string {
  const lines = tableSourceLines(source)
  const header = lines.find((line) => line.trim()) ?? ''
  if (!header) return source
  const indent = header.match(/^\s*/)?.[0] ?? ''
  const content = header.trimEnd().slice(indent.length)
  const leading = content.startsWith('|')
  const trailing = content.endsWith('|')
  const colCount = Math.max(1, splitTableRow(content).length)
  const cells = Array.from({ length: colCount }, () => '  ')
  const row = indent + (leading ? '|' : '') + cells.join('|') + (leading || trailing ? '|' : '')
  return [...lines, row].join('\n')
}

/** 按表头补一个空行（列数 / 缩进 / 首尾竖线跟随表头） */
function blankTableRow(header: string): string {
  const indent = header.match(/^\s*/)?.[0] ?? ''
  const content = header.trimEnd().slice(indent.length)
  const leading = content.startsWith('|')
  const trailing = content.endsWith('|')
  const colCount = Math.max(1, splitTableRow(content).length)
  const cells = Array.from({ length: colCount }, () => '  ')
  return indent + (leading ? '|' : '') + cells.join('|') + (leading || trailing ? '|' : '')
}

/**
 * 在第 `atLine` 行（0 = 表头，1 = 分隔行，2+ = 正文行）前插入一个空行。
 * 右键菜单的「在上方 / 下方插入行」统一走这里。
 */
export function insertTableRow(source: string, atLine: number): string {
  const lines = tableSourceLines(source)
  if (lines.length === 0 || !lines[0]?.trim()) return source
  const blank = blankTableRow(lines[0])
  const idx = Math.max(0, Math.min(lines.length, atLine))
  lines.splice(idx, 0, blank)
  return lines.join('\n')
}

/**
 * 删除若干正文行（0-based 行号，表头与分隔行不参与）。
 * 全部正文行删光时保留表头 + 分隔行，表格仍合法。
 */
export function deleteTableRows(source: string, indices: number[]): string {
  const lines = tableSourceLines(source)
  const drop = new Set(indices.filter((i) => i >= 2 && i < lines.length))
  if (drop.size === 0) return source
  const kept = lines.filter((_, i) => !drop.has(i))
  return kept.join('\n')
}

/** 上移 / 下移一个正文行（与相邻正文行交换）；表头与分隔行不动 */
export function moveTableRow(source: string, lineIndex: number, dir: -1 | 1): string {
  const lines = tableSourceLines(source)
  const target = lineIndex + dir
  if (lineIndex < 2 || target < 2 || target >= lines.length) return source
  const next = [...lines]
  ;[next[lineIndex], next[target]] = [next[target], next[lineIndex]]
  return next.join('\n')
}

/**
 * 在第 `at` 个单元格位置插入一列（`at` 可等于列数表示追加）。
 * 分隔行补 `---`，其它行补空单元格。
 */
export function insertTableColumn(source: string, at: number): string {
  return tableSourceLines(source)
    .map((line, idx) => {
      if (!line.trim()) return line
      return mapTableRowCells(line, (cells) => {
        const pos = Math.max(0, Math.min(cells.length, at))
        const next = [...cells]
        next.splice(pos, 0, idx === 1 ? ' --- ' : '  ')
        return next
      })
    })
    .join('\n')
}

/** 删除若干列（0-based）；至少保留一列，避免生成非法表格 */
export function deleteTableColumns(source: string, indices: number[]): string {
  const drop = new Set(indices)
  if (drop.size === 0) return source
  return tableSourceLines(source)
    .map((line) => {
      if (!line.trim()) return line
      return mapTableRowCells(line, (cells) => {
        const kept = cells.filter((_, i) => !drop.has(i))
        return kept.length > 0 ? kept : ['  ']
      })
    })
    .join('\n')
}

/** 左移 / 右移一列（与相邻列交换） */
export function moveTableColumn(source: string, colIndex: number, dir: -1 | 1): string {
  return tableSourceLines(source)
    .map((line) => {
      if (!line.trim()) return line
      return mapTableRowCells(line, (cells) => {
        const target = colIndex + dir
        if (colIndex < 0 || target < 0 || colIndex >= cells.length || target >= cells.length) return cells
        const next = [...cells]
        ;[next[colIndex], next[target]] = [next[target], next[colIndex]]
        return next
      })
    })
    .join('\n')
}

/** 改写分隔行里某一列的对齐标记（`:---` / `:---:` / `---:`） */
export function setTableColumnAlign(source: string, colIndex: number, align: TableAlign): string {
  const lines = tableSourceLines(source)
  if (lines.length < 2) return source
  const marker = align === 'center' ? ':---:' : align === 'right' ? '---:' : ':---'
  lines[1] = mapTableRowCells(lines[1], (cells) => {
    if (colIndex < 0 || colIndex >= cells.length) return cells
    const next = [...cells]
    const raw = next[colIndex]
    const head = raw.match(/^\s*/)?.[0] ?? ''
    const tail = raw.match(/\s*$/)?.[0] ?? ''
    next[colIndex] = head + marker + tail
    return next
  })
  return lines.join('\n')
}

/**
 * 按某列排序正文行（表头 / 分隔行不动）。数字列按数值比较，其它按本地化字符串。
 */
export function sortTableRows(source: string, colIndex: number, direction: 'asc' | 'desc'): string {
  const lines = tableSourceLines(source)
  if (lines.length < 4) return source
  const head = lines.slice(0, 2)
  const body = lines.slice(2).filter((line) => line.trim())
  const keyOf = (line: string) => splitTableRow(line)[colIndex]?.trim() ?? ''
  const compare = (a: string, b: string) => {
    const ka = keyOf(a)
    const kb = keyOf(b)
    const na = Number(ka)
    const nb = Number(kb)
    if (ka !== '' && kb !== '' && Number.isFinite(na) && Number.isFinite(nb)) return na - nb
    return ka.localeCompare(kb, 'zh')
  }
  body.sort(compare)
  if (direction === 'desc') body.reverse()
  return [...head, ...body].join('\n')
}

// ---------------------------------------------------------------------------
// 脚注
// ---------------------------------------------------------------------------

export interface FootnoteDefinition {
  label: string
  /** 定义标记所在行（0-based，用于与 doc.line(n) 换算） */
  markerLine: number
  /** `[^label]:` 的列区间（不含行首缩进前的空白？含缩进；见实现） */
  markerStart: number
  markerEnd: number
  /** 定义块覆盖的所有行（0-based）：标记行 + 续行 */
  lines: number[]
  /** 仅续行（多段/多行内容） */
  continuationLines: number[]
}

export interface FootnoteAnalysis {
  /** 引用编号：按首次出现顺序，从 1 开始（与 markdown-it-footnote 一致） */
  order: Map<string, number>
  definitions: FootnoteDefinition[]
  /** markerLine → definition */
  byMarkerLine: Map<number, FootnoteDefinition>
  /** 定义块所有行（含标记行） */
  definitionLines: Set<number>
  continuationLines: Set<number>
  firstDefinitionLine: number
}

/**
 * 分析脚注引用与定义。
 *
 * 与预览的差异点在于「定义块」：markdown-it-footnote 支持缩进续行（多行 / 多段），
 * 实时模式此前只认定义首行，续行会被 lezer 当成缩进代码块。这里把续行区间算出来，
 * 供实时装饰与块级代码块扫描共同使用。
 */
export function analyzeFootnotes(lines: string[]): FootnoteAnalysis {
  const definitions: FootnoteDefinition[] = []
  const byMarkerLine = new Map<number, FootnoteDefinition>()
  const definitionLines = new Set<number>()
  const continuationLines = new Set<number>()
  const order = new Map<string, number>()
  let firstDefinitionLine = -1

  // ---- 1. 定义块与续行 ----
  let inFence = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (isFenceLine(line)) { inFence = !inFence; continue }
    if (inFence) continue

    const m = /^(\s*)\[\^([^\]\s]+)\]:[ \t]?/.exec(line)
    if (!m) continue

    const indent = indentWidth(m[1])
    const def: FootnoteDefinition = {
      label: m[2],
      markerLine: i,
      markerStart: m[1].length,
      markerEnd: m[0].length,
      lines: [i],
      continuationLines: [],
    }

    let j = i + 1
    let pendingBlank: number[] = []
    while (j < lines.length) {
      const next = lines[j]
      if (!next.trim()) {
        pendingBlank.push(j)
        j++
        continue
      }
      if (isFenceLine(next)) break
      if (/^\s*\[\^[^\]\s]+\]:/.test(next)) break
      const nextIndent = indentWidth(next)
      if (nextIndent >= indent + 4) {
        for (const b of pendingBlank) {
          def.lines.push(b)
          def.continuationLines.push(b)
        }
        pendingBlank = []
        def.lines.push(j)
        def.continuationLines.push(j)
        j++
        continue
      }
      break
    }

    definitions.push(def)
    byMarkerLine.set(i, def)
    for (const ln of def.lines) {
      definitionLines.add(ln)
      if (ln !== i) continuationLines.add(ln)
    }
    if (firstDefinitionLine < 0) firstDefinitionLine = i
  }

  // ---- 2. 引用编号（按首次出现顺序） ----
  inFence = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (isFenceLine(line)) { inFence = !inFence; continue }
    if (inFence) continue

    const def = byMarkerLine.get(i)
    const codeSpans = inlineCodeSpans(line)
    const re = /\[\^([^\]\s]+)\]/g
    let m: RegExpExecArray | null
    while ((m = re.exec(line))) {
      if (def && m.index === def.markerStart) continue
      if (inSpans(codeSpans, m.index)) continue
      if (!order.has(m[1])) order.set(m[1], order.size + 1)
    }
  }

  return {
    order,
    definitions,
    byMarkerLine,
    definitionLines,
    continuationLines,
    firstDefinitionLine,
  }
}

// ---------------------------------------------------------------------------
// 其他实时扫描用的小工具
// ---------------------------------------------------------------------------

/** `[toc]` / `[[toc]]` 独立成行（实时模式要换成目录 widget） */
export const TOC_LINE_RE = /^\s*\[\[?toc\]\]?\s*$/i

// ---------------------------------------------------------------------------
// 图片
// ---------------------------------------------------------------------------

export interface ParsedImage {
  alt: string
  src: string
  title: string
}

/**
 * 解析 `![alt](src "title")`。
 *
 * 比旧的正则宽松三点：src 允许带括号（`a_(b).png`）、允许 `<…>` 包裹、
 * title 允许单引号 / 双引号 / 圆括号（CommonMark 三种写法）。
 */
export function parseImageMarkdown(raw: string): ParsedImage | null {
  const m = /^!\[([^\]]*)\]\(\s*(?:<([^>]*)>|(\S+?))(?:\s+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?\s*\)$/.exec(raw.trim())
  if (!m) return null
  return {
    alt: m[1] ?? '',
    src: (m[2] ?? m[3] ?? '').trim(),
    title: m[4] ?? m[5] ?? m[6] ?? '',
  }
}

/** 独占一行的 Markdown 图片（块级 ImageWidget 接管；行内图片不再重复装饰） */
export function isStandaloneImageLine(line: string): boolean {
  return parseImageMarkdown(line) !== null
}

/**
 * 引用式图片 `![alt][ref]` / `![alt][]` → 解析成可直接渲染的图片。
 * 定义不存在时返回 null（保留源码，与预览「当普通文本」一致）。
 */
export function parseReferenceImage(
  raw: string,
  refDefs: Map<string, ReferenceDefinition>,
): ParsedImage | null {
  const m = /^!\[([^\]]*)\]\[([^\]]*)\]$/.exec(raw.trim())
  if (!m) return null
  const label = (m[2].trim() || m[1]).toLowerCase()
  const def = refDefs.get(label)
  if (!def) return null
  return { alt: m[1], src: def.dest, title: def.title }
}

// ---------------------------------------------------------------------------
// 引用式链接定义
// ---------------------------------------------------------------------------

export interface ReferenceDefinition {
  label: string
  dest: string
  title: string
}

/** 引用式链接 / 图片定义行：`[label]: https://… "title"`（脚注 `[^x]:` 不算） */
export function parseReferenceDefinition(line: string): ReferenceDefinition | null {
  const m = /^\s{0,3}\[([^\]^][^\]]*)\]:\s*(?:<([^>]*)>|(\S+))?(?:\s+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?\s*$/.exec(line)
  if (!m) return null
  const label = m[1].trim()
  const dest = (m[2] ?? m[3] ?? '').trim()
  if (!label || !dest) return null
  return {
    label,
    dest,
    title: m[4] ?? m[5] ?? m[6] ?? '',
  }
}

// ---------------------------------------------------------------------------
// 标题 / 目录
// ---------------------------------------------------------------------------

export interface TocHeading {
  level: number
  text: string
  /** 1-based 行号（与 EditorView.state.doc.line(n) 一致） */
  line: number
}

/** 剥掉标题里的行内标记，得到目录里显示的文字 */
export function stripInlineMarkers(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/<[^>]*>/g, '')
    .trim()
}

function stripCr(line: string): string {
  return line.endsWith('\r') ? line.slice(0, -1) : line
}

/**
 * 收集标题（预览目录同款：跳过围栏代码 / 注释块 / 元信息块）。
 * 只做行扫描，不依赖 lezer —— Lezer 的 SetextHeading 需要看下一行，
 * 行扫描反而更直接。
 */
export function collectHeadings(lines: string[]): TocHeading[] {
  const out: TocHeading[] = []
  let fenceChar: '`' | '~' | null = null
  let fenceLen = 0
  let inComment = false
  let inFrontMatter = false

  for (let i = 0; i < lines.length; i++) {
    const line = stripCr(lines[i])

    // 元信息块：只有文档第一行是 `---` 时才算
    if (i === 0 && /^---\s*$/.test(line)) { inFrontMatter = true; continue }
    if (inFrontMatter) {
      if (/^---\s*$/.test(line) || /^\.\.\.\s*$/.test(line)) inFrontMatter = false
      continue
    }

    if (inComment) {
      if (line.includes('-->')) inComment = false
      continue
    }
    if (fenceChar) {
      const close = /^\s{0,3}(`{3,}|~{3,})\s*$/.exec(line)
      if (close && close[1][0] === fenceChar && close[1].length >= fenceLen) {
        fenceChar = null
        fenceLen = 0
      }
      continue
    }
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
    if (fenceMatch) {
      fenceChar = fenceMatch[1][0] as '`' | '~'
      fenceLen = fenceMatch[1].length
      continue
    }
    if (/^\s*<!--/.test(line)) {
      if (!line.includes('-->')) inComment = true
      continue
    }

    const atx = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
    if (atx) {
      const text = stripInlineMarkers(atx[2])
      if (text) out.push({ level: atx[1].length, text, line: i + 1 })
      continue
    }

    // Setext 标题：当前行非空，下一行是 === / ---
    if (line.trim() && i + 1 < lines.length) {
      const next = stripCr(lines[i + 1])
      if (/^\s{0,3}=+\s*$/.test(next)) {
        const text = stripInlineMarkers(line)
        if (text) out.push({ level: 1, text, line: i + 1 })
        i++
        continue
      }
      if (/^\s{0,3}-{2,}\s*$/.test(next) && !/^\s*([-*+]|\d+[.)])\s/.test(line)) {
        const text = stripInlineMarkers(line)
        if (text) out.push({ level: 2, text, line: i + 1 })
        i++
      }
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// 行内公式（实时行级 widget 用）
// ---------------------------------------------------------------------------

export interface InlineMathSegment {
  type: 'text' | 'math'
  value: string
}

/**
 * 把一行拆成「文本 / 行内公式」片段。
 *
 * 跳过行内代码区间（`` `$x$` `` 不是公式），并保留 `\$` 转义。
 * 没有公式时返回 null（调用方直接不生成 widget）。
 */
export function splitInlineMath(line: string): InlineMathSegment[] | null {
  if (!line.includes('$')) return null

  const segments: InlineMathSegment[] = []
  let text = ''
  let found = false
  let i = 0
  const pushText = () => { if (text) { segments.push({ type: 'text', value: text }); text = '' } }

  while (i < line.length) {
    const ch = line[i]

    // 行内代码：反引号串配对后整段当文本
    if (ch === '`') {
      let run = 1
      while (line[i + run] === '`') run++
      const close = line.indexOf('`'.repeat(run), i + run)
      if (close >= 0) {
        text += line.slice(i, close + run)
        i = close + run
        continue
      }
      text += line.slice(i, i + run)
      i += run
      continue
    }

    // 转义的 $：原样留给 markdown-it inline 处理（它会渲染成 $）
    if (ch === '\\' && line[i + 1] === '$') {
      text += '\\$'
      i += 2
      continue
    }

    // $$ 不是行内公式
    if (ch === '$' && line[i + 1] === '$') {
      text += '$$'
      i += 2
      continue
    }

    if (ch === '$') {
      let j = i + 1
      let close = -1
      while (j < line.length) {
        if (line[j] === '\\') { j += 2; continue }
        if (line[j] === '$') { close = j; break }
        j++
      }
      if (close > i + 1) {
        const tex = line.slice(i + 1, close)
        if (!tex.includes('`')) {
          pushText()
          segments.push({ type: 'math', value: tex })
          found = true
          i = close + 1
          continue
        }
      }
    }

    text += ch
    i++
  }
  pushText()
  return found ? segments : null
}
