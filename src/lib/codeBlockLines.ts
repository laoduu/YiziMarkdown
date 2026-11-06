/**
 * 把 highlight.js 输出的 HTML 按「逻辑行」拆成带行号的 DOM 片段。
 *
 * 为什么不能直接按 `\n` 字符串切：语法高亮的 `<span>` 可能跨行（一个字符串/
 * 注释跨多行），直接切会留下未闭合标签。这里按标签栈在换行处闭合、下一行再
 * 重新打开，既保留 token 颜色，又让每行都是独立的一行 DOM。
 *
 * 行号只标在逻辑行首：开启自动换行时，一个逻辑行可能占多个视觉行，
 * 但后续视觉行不会再出现新的行号。
 */
/** 行号开关图标：列表 + 数字（Lucide ListOrdered） */
export const LINE_NUMBERS_ICON = `
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 6h11M10 12h11M10 18h11"/>
    <path d="M4 6h1v4M4 10h2M4 14h2l-1 3h2"/>
  </svg>
`

export function withCodeLineNumbers(html: string): string {
  const lines: string[] = []
  const open: Array<{ tag: string; raw: string }> = []
  let current = ''
  let i = 0

  while (i < html.length) {
    if (html[i] === '<') {
      const end = html.indexOf('>', i)
      if (end < 0) {
        current += html.slice(i)
        break
      }
      const raw = html.slice(i, end + 1)
      if (/^<\//.test(raw)) {
        open.pop()
      } else if (!/\/>\s*$/.test(raw)) {
        const tag = (raw.match(/^<\s*([a-zA-Z0-9-]+)/)?.[1] ?? '').toLowerCase()
        open.push({ tag, raw })
      }
      current += raw
      i = end + 1
      continue
    }

    const next = html.indexOf('<', i)
    const text = html.slice(i, next >= 0 ? next : html.length)
    const parts = text.split('\n')
    for (let p = 0; p < parts.length; p++) {
      current += parts[p]
      if (p < parts.length - 1) {
        lines.push(current + open.slice().reverse().map((o) => `</${o.tag}>`).join(''))
        current = open.map((o) => o.raw).join('')
      }
    }
    i = next >= 0 ? next : html.length
  }
  lines.push(current)

  // 末尾换行会制造一个空行；源码块本身通常不带尾随空行，去掉它。
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()

  return lines
    .map((line, idx) =>
      `<span class="code-line"><span class="code-line-number" aria-hidden="true">${idx + 1}</span>` +
      `<span class="code-line-content">${line || '\u200b'}</span></span>`,
    )
    .join('')
}
