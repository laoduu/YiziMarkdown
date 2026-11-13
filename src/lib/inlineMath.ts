/**
 * 从已经进入文本节点的内容中识别成对的行内公式。
 *
 * 正常路径下 markdown-it-katex 会先产成 `.katex` DOM，pptxScene 直接读取注释里的
 * TeX。但部分增量渲染 / 缓存场景里，公式可能仍以原始 `$...$` 文本存在；导出层
 * 再识别一次，避免 PPTX 只能输出源码。
 */
export type InlineMathSegment =
  | { kind: 'text'; text: string }
  | { kind: 'math'; tex: string }

function isEscaped(text: string, index: number): boolean {
  let slashes = 0
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) slashes++
  return slashes % 2 === 1
}

function canOpenDelimiter(text: string, index: number): boolean {
  const next = text[index + 1]
  return next !== undefined && next !== ' ' && next !== '\t'
}

function canCloseDelimiter(text: string, index: number): boolean {
  const prev = text[index - 1]
  const next = text[index + 1]
  return prev !== undefined &&
    prev !== ' ' &&
    prev !== '\t' &&
    !(next !== undefined && next >= '0' && next <= '9')
}

export function splitInlineMath(text: string): InlineMathSegment[] {
  const out: InlineMathSegment[] = []
  let cursor = 0
  let i = 0

  const pushText = (end: number) => {
    if (end > cursor) out.push({ kind: 'text', text: text.slice(cursor, end) })
  }

  while (i < text.length) {
    if (text[i] !== '$' || isEscaped(text, i)) {
      i++
      continue
    }
    // `$$...$$` 交给块级公式路径，不能在这里拆成空行内公式。
    if (text[i + 1] === '$') {
      i += 2
      continue
    }
    // 与 markdown-it-katex 的开闭边界一致：`$5`、`$10` 这类金额不能
    // 因为后面恰好又出现一个 `$` 就被拼成公式。
    if (!canOpenDelimiter(text, i)) {
      i++
      continue
    }

    let end = i + 1
    let close = -1
    while (end < text.length) {
      if (text[end] === '\n') break
      if (text[end] === '$' && !isEscaped(text, end)) {
        if (canCloseDelimiter(text, end)) {
          close = end
        }
        // 第一个未转义 `$` 不能闭合时，当前 `$` 就不能作为起始符；
        // 不能越过它继续找后面的 `$`，否则 `$5 和 $x$` 会被错误吞并。
        break
      }
      end++
    }
    if (close < 0) {
      i++
      continue
    }

    const tex = text.slice(i + 1, close).trim()
    if (!tex) {
      i = close + 1
      continue
    }

    pushText(i)
    out.push({ kind: 'math', tex })
    cursor = close + 1
    i = cursor
  }

  pushText(text.length)
  return out
}
