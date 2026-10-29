/**
 * 工具栏 / 斜杠菜单「插入分割线」的行级插入规则。
 *
 * 旧实现只往光标处塞一个 `'\n---\n'` 字符串，结果取决于光标落在哪里：
 *   · 落在文字行中间 → 把一行劈成两段，`---` 紧贴上一行 ⇒ CommonMark 把上一行
 *     解析成 setext 标题（分割线反而消失）；
 *   · 落在空行上 → 前后各多出一行空白，编辑区里就是两个空段。
 *
 * 这里改成「按行」插入，保证：
 *   1. `---` 永远独立成行；
 *   2. 上方紧邻正文时保留**一个**空行（否则会被解析成 setext 标题），
 *      上方本来就是空行 / 文档开头时不再额外加空行；
 *   3. 不在 `---` 下方凭空加空行；
 *   4. 插入后光标落在分割线的**下一行行首**（仍看得见渲染后的线，而不是源码）。
 *
 * 纯函数，便于 node --test 直接验证。
 */

export interface HorizontalRuleEdit {
  /** 文档替换区间（`to === from` 表示纯插入） */
  from: number
  to: number
  insert: string
  /** 插入后的光标位置（下一行行首） */
  caret: number
}

export function planHorizontalRule(doc: string, pos: number): HorizontalRuleEdit {
  const clamped = Math.max(0, Math.min(pos, doc.length))
  const lineStart = clamped === 0 ? 0 : doc.lastIndexOf('\n', clamped - 1) + 1
  const nl = doc.indexOf('\n', clamped)
  const lineEnd = nl < 0 ? doc.length : nl
  const text = doc.slice(lineStart, lineEnd)
  const atEof = nl < 0

  // 上一行是否为空：空行 / 文档开头时 `---` 可以直接占掉当前空行，不会变成 setext 下划线
  const prevNl = lineStart - 1
  let prevText = ''
  if (prevNl >= 0) {
    const prevStart = prevNl === 0 ? 0 : doc.lastIndexOf('\n', prevNl - 1) + 1
    prevText = doc.slice(prevStart, prevNl)
  }

  const isBlank = !text.trim()

  if (!isBlank) {
    // 当前行有正文：在当前行之后补一个空行 + 分割线 + 换行
    if (atEof) {
      const from = lineEnd
      const insert = '\n\n---\n'
      return { from, to: from, insert, caret: from + insert.length }
    }
    const from = lineEnd + 1 // 下一行行首
    const insert = '\n---\n'
    return { from, to: from, insert, caret: from + insert.length }
  }

  if (!prevText.trim()) {
    // 上方已是空行（或文档开头）：直接把这行空行换成分割线，不再加行
    const from = lineStart
    const insert = atEof ? '---\n' : '---'
    return { from, to: lineEnd, insert, caret: from + insert.length + (atEof ? 0 : 1) }
  }

  // 上方是正文：把这个空行保留为空行，分割线放到它下面
  // （连同行尾换行一起替换，顺手清掉只有空格的“空行”）
  const from = lineStart
  const insert = '\n---\n'
  return { from, to: atEof ? lineEnd : lineEnd + 1, insert, caret: from + insert.length }
}
