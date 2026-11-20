/**
 * selectionFormatState.ts — 判断当前选区处于哪些格式（零依赖，可被 Node 单测直接加载）
 *
 * 格式条的「已应用」状态完全由文档内容推导：
 * · 用户点格式条改了正文 → 文档变了，重新推导自然就亮了；
 * · 光标落在别人写好的 `**加粗**` 里 → 同样推导出来。
 * 不额外维护一份「我点过什么」的状态，避免撤销、手动改标记、切标签后对不上。
 *
 * 与 toggle 判定保持一致（见 lib/inlineWrap.ts / lib/blockFormat.ts）：
 * 能被「再点一次取消」的选区，才算该格式已应用。
 */

import { lineFormatInfo } from './blockFormat.ts'
import { stripWrap } from './inlineWrap.ts'
import type { SelectionFormatId } from './selectionFormats.ts'

/** 行内格式的包裹标记；`math` 的行内形态是单个 `$` */
const INLINE_PAIRS: Partial<Record<SelectionFormatId, [string, string]>> = {
  bold: ['**', '**'],
  italic: ['*', '*'],
  strikethrough: ['~~', '~~'],
  highlight: ['==', '=='],
  inlineCode: ['`', '`'],
  superscript: ['^', '^'],
  subscript: ['~', '~'],
  math: ['$', '$'],
}

function lineBounds(doc: string, pos: number): { start: number; end: number } {
  const clamped = Math.max(0, Math.min(pos, doc.length))
  const start = doc.lastIndexOf('\n', Math.max(0, clamped - 1)) + 1
  const nl = doc.indexOf('\n', clamped)
  return { start, end: nl < 0 ? doc.length : nl }
}

/**
 * 选区是否被一对标记覆盖：
 * 1. 选区自身带标记（`**abc**`）
 * 2. 标记紧贴选区外侧（选中 `abc`，前后紧挨着 `**`）
 * 3. 选区落在某个成对标记内部（选中加粗文本的一半）
 */
export function inlineFormatActive(
  lineText: string,
  from: number,
  to: number,
  open: string,
  close: string,
): boolean {
  if (to <= from) return false
  if (stripWrap(lineText.slice(from, to), open, close) !== null) return true

  if (markerJustOutside(lineText, from, to, open, close)) return true

  if (open === close) {
    // 同字符标记：从头扫到选区起点，奇偶决定是否在标记内部
    let inside = false
    let i = 0
    for (;;) {
      const at = lineText.indexOf(open, i)
      if (at < 0 || at >= from) break
      inside = !inside
      i = at + open.length
    }
    if (!inside) return false
    return lineText.indexOf(close, to) >= 0
  }

  const openAt = lineText.lastIndexOf(open, from)
  if (openAt < 0) return false
  const closeAt = lineText.indexOf(close, openAt + open.length)
  return closeAt >= to
}

/** 选区外侧是否紧贴一对标记；单字符标记要排除 `**a**` 里误认 `*` 的情况 */
function markerJustOutside(
  lineText: string,
  from: number,
  to: number,
  open: string,
  close: string,
): boolean {
  if (from < open.length || to + close.length > lineText.length) return false
  if (lineText.slice(from - open.length, from) !== open) return false
  if (lineText.slice(to, to + close.length) !== close) return false
  if (open === close) {
    // `**a**` 选 a 时，外侧再往外仍是 `*` ⇒ 这一层其实是 `**`，不是 `*`
    const ch = open.charAt(0)
    const before = from - open.length - 1
    const after = to + close.length
    if (before >= 0 && lineText.charAt(before) === ch) return false
    if (after < lineText.length && lineText.charAt(after) === ch) return false
  }
  return true
}

/** 选区是否落在 `[...](...)` 里（含只选中标签文字的情况） */
function insideLink(lineText: string, from: number, to: number): boolean {
  const re = /\[([^\]]*)\]\(([^)]*)\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(lineText))) {
    if (m.index <= from && to <= m.index + m[0].length) return true
  }
  return false
}

/** 选区之前的 `$$` 独占行数量为奇数 ⇒ 在块级公式里 */
function insideMathBlock(doc: string, pos: number): boolean {
  const fences = doc.slice(0, pos).match(/^[ \t]*\$\$[ \t]*$/gm)
  return !!fences && fences.length % 2 === 1
}

/**
 * 推导选区当前应用的格式 id（顺序无意义，调用方按需展示）。
 * 行内格式只看第一行：跨行选区不会把「整段」标成加粗/斜体。
 */
export function detectSelectionFormats(doc: string, from: number, to: number): SelectionFormatId[] {
  const start = Math.max(0, Math.min(from, doc.length))
  const end = Math.max(start, Math.min(to, doc.length))
  if (end <= start) return []

  const found = new Set<SelectionFormatId>()
  const first = lineBounds(doc, start)

  // ---- 行内格式（单行选区） ----
  if (end <= first.end) {
    const lineText = doc.slice(first.start, first.end)
    const a = start - first.start
    const b = end - first.start
    for (const [id, pair] of Object.entries(INLINE_PAIRS) as Array<
      [SelectionFormatId, [string, string]]
    >) {
      if (inlineFormatActive(lineText, a, b, pair[0], pair[1])) found.add(id)
    }
    if (insideLink(lineText, a, b)) found.add('link')
  }

  if (insideMathBlock(doc, start)) found.add('math')

  // ---- 块级格式（选区覆盖的所有非空行都满足才算） ----
  const lastLine = lineBounds(doc, Math.max(start, end - 1))
  const infos = doc
    .slice(first.start, lastLine.end)
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map(lineFormatInfo)

  if (infos.length > 0) {
    if (infos.every((info) => info.headingLevel >= 1)) found.add('heading')
    if (infos.every((info) => info.list === 'ul')) found.add('unorderedList')
    if (infos.every((info) => info.list === 'ol')) found.add('orderedList')
    if (infos.every((info) => info.list === 'task')) found.add('taskList')
    if (infos.every((info) => info.quote)) found.add('quote')
  }

  return [...found]
}
