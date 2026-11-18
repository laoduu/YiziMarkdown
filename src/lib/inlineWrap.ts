/**
 * inlineWrap.ts — 行内 Markdown 标记的包裹/去包裹
 *
 * 同一套规则同时服务于两处：
 * · 实时模式表格单元格（`tableCells.ts` / `cm-live-blocks.ts`）
 * · 正文编辑器（`Editor.tsx` 的 insertMarkdown）
 *
 * 目标行为与 Obsidian / Notion 一致：对已加粗的文本再点加粗应取消，而不是叠加。
 */

export interface WrapResult {
  /** 替换后的整段文本（含标记） */
  text: string
  /** 应恢复的选区起点（相对返回的 text） */
  selFrom: number
  /** 应恢复的选区终点；等于 selFrom 时表示折叠光标 */
  selTo: number
}

/**
 * 把工具栏的「插入参数 + mode」翻译成一对包裹标记。
 * 返回 null 表示这种格式不是包裹型（标题、列表、链接等）。
 */
export function inlinePairOf(
  markdown: string,
  mode?: 'wrap' | 'prefix' | 'ordered' | 'link' | 'tag' | 'block',
): { open: string; close: string } | null {
  if (mode === 'wrap') return markdown ? { open: markdown, close: markdown } : null
  if (mode === 'tag') {
    const cut = markdown.indexOf('><')
    if (cut < 0) return null
    return { open: markdown.slice(0, cut + 1), close: markdown.slice(cut + 1) }
  }
  return null
}

/**
 * 对 `text[start, end)` 做一次行内标记的 toggle。
 *
 * · start === end（无选区）：作用于整段文本 —— 用于「整格/整行统一加粗」
 * · 已包裹（`**abc**`）→ 去掉标记；否则加上标记
 * · 返回的 selFrom/selTo 用于重建后恢复选区（包住内容本身，而不是标记）
 */
export function toggleWrap(
  text: string,
  start: number,
  end: number,
  open: string,
  close: string,
): WrapResult {
  if (!text || !open || !close) return { text, selFrom: 0, selTo: 0 }

  const s = Math.max(0, Math.min(start, text.length))
  const e = Math.max(s, Math.min(end, text.length))

  if (s === e) {
    const unwrapped = stripWrap(text, open, close)
    if (unwrapped !== null) return { text: unwrapped, selFrom: 0, selTo: unwrapped.length }
    return { text: open + text + close, selFrom: open.length, selTo: open.length + text.length }
  }

  const segment = text.slice(s, e)
  const unwrapped = stripWrap(segment, open, close)
  if (unwrapped !== null) {
    return {
      text: text.slice(0, s) + unwrapped + text.slice(e),
      selFrom: s,
      selTo: s + unwrapped.length,
    }
  }

  // 选区外侧紧贴一对标记：选中 `**a1**` 里的 a1 再次点加粗，应去掉外侧标记，
  // 而不是再包一层（否则会变成 `****a1****`）。
  const outerStart = s - open.length
  const outerEnd = e + close.length
  if (
    outerStart >= 0 &&
    outerEnd <= text.length &&
    text.slice(outerStart, s) === open &&
    text.slice(e, outerEnd) === close &&
    !sharesMarkerCharWithOutside(text, outerStart, outerEnd, open, close)
  ) {
    return {
      text: text.slice(0, outerStart) + segment + text.slice(outerEnd),
      selFrom: outerStart,
      selTo: outerStart + segment.length,
    }
  }

  return {
    text: text.slice(0, s) + open + segment + close + text.slice(e),
    selFrom: s + open.length,
    selTo: s + open.length + segment.length,
  }
}

/** 一次 toggle 对文档的最小改动（CodeMirror 事务参数） */
export interface InlineToggleEdit {
  from: number
  to: number
  insert: string
  selFrom: number
  selTo: number
}

/**
 * 在整篇文档上规划一次行内标记 toggle。
 *
 * 与 `toggleWrap` 规则一致，但直接以绝对位置返回「替换哪一段、插入什么」，
 * 这样正文编辑器只需 dispatch 一次事务，不必重写整篇文档。
 */
export function planInlineToggle(
  doc: string,
  from: number,
  to: number,
  open: string,
  close: string,
): InlineToggleEdit {
  const s = Math.max(0, Math.min(from, doc.length))
  const e = Math.max(s, Math.min(to, doc.length))
  const segment = doc.slice(s, e)

  // 1) 选区本身已带标记（`**abc**`）：去掉内侧标记
  const inner = stripWrap(segment, open, close)
  if (inner !== null) {
    return { from: s, to: e, insert: inner, selFrom: s, selTo: s + inner.length }
  }

  // 2) 选区外侧紧贴一对标记：只选内容再点一次，也应当取消
  const outerStart = s - open.length
  const outerEnd = e + close.length
  if (
    s > 0 &&
    outerStart >= 0 &&
    outerEnd <= doc.length &&
    doc.slice(outerStart, s) === open &&
    doc.slice(e, outerEnd) === close &&
    !sharesMarkerCharWithOutside(doc, outerStart, outerEnd, open, close)
  ) {
    return {
      from: outerStart,
      to: outerEnd,
      insert: segment,
      selFrom: outerStart,
      selTo: outerStart + segment.length,
    }
  }

  // 3) 普通包裹（空选区时插入一对标记，光标落在中间）
  return {
    from: s,
    to: e,
    insert: open + segment + close,
    selFrom: s + open.length,
    selTo: s + open.length + segment.length,
  }
}

/**
 * 外侧标记是否与更外层的同字符标记连成一片（如 `***a1***` 里选 a1 点 `*`）。
 * 连成一片时不拆，避免把「粗体+斜体」误拆成其中一个。
 */
function sharesMarkerCharWithOutside(
  text: string,
  start: number,
  end: number,
  open: string,
  close: string,
): boolean {
  if (open !== close) return false
  const ch = open.charAt(0)
  return (start > 0 && text.charAt(start - 1) === ch) ||
    (end < text.length && text.charAt(end) === ch)
}

/** 若整段已被 open/close 包裹，返回内部文本；否则 null */
export function stripWrap(segment: string, open: string, close: string): string | null {
  if (segment.length < open.length + close.length) return null
  if (!segment.startsWith(open) || !segment.endsWith(close)) return null
  const inner = segment.slice(open.length, segment.length - close.length)
  if (!inner) return null
  // `*` 对 `**bold**` 的误判：内层紧贴同字符说明不是同一层包裹
  if (open === close) {
    const ch = open.charAt(0)
    if (inner.startsWith(ch) || inner.endsWith(ch)) return null
    // 单字符标记（*、`）不能把 "a * b *" 这种当包裹
    if (open.length === 1 && (/^\s/.test(inner) || /\s$/.test(inner))) return null
  }
  return inner
}
