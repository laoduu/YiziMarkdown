/**
 * 任务列表状态回写。
 *
 * 预览里的勾选框必须**按源码行**回写，不能再用 `li.textContent` 去原文里全等匹配：
 * 行内公式（`$…$` KaTeX 渲染后文本已变）、行内 HTML/标签、重复文案、嵌套列表
 * 都会让文本匹配失败。渲染时 `<li>` 已带 `data-source-line`，这里只负责改那一行。
 */

/** 是否是任务列表项行（支持缩进 / `*` / `+`；有序列表的 `1. [ ]` 也兼容） */
export function isTaskLine(line: string): boolean {
  return /^\s*(?:[-*+]|\d+[.)])\s+\[[ xX]\](?:\s|$)/.test(line)
}

/** 修改单行任务状态；不是任务行返回 null */
export function toggleTaskLine(line: string, checked: boolean): string | null {
  const re = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\])/
  if (!re.test(line)) return null
  return line.replace(re, (_m, head) => `${head}${checked ? 'x' : ' '}]`)
}

/** 按 1-based 行号修改任务状态；行号越界或该行不是任务行返回 null */
export function toggleTaskAtLine(content: string, lineNumber: number, checked: boolean): string | null {
  const lines = content.split('\n')
  if (!Number.isInteger(lineNumber) || lineNumber < 1 || lineNumber > lines.length) return null
  const next = toggleTaskLine(lines[lineNumber - 1], checked)
  if (next == null) return null
  lines[lineNumber - 1] = next
  return lines.join('\n')
}
