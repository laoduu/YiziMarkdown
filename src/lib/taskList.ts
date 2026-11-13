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

/** 回车时任务列表续行的判定：
 *  - continue：光标在**非空**任务项里，回车应续写 `- [ ] `（Editor 侧负责保留缩进 / 有序编号）
 *  - exit：空任务项（如 `- [ ] `），回车应退出列表，交给 CodeMirror 默认逻辑删标记
 *  - none：不是任务项，或光标在任务标记之前，走普通回车
 */
export type TaskEnterAction = 'continue' | 'exit' | 'none'

export function taskEnterAction(lineText: string, posFromLineStart: number): TaskEnterAction {
  const match = /^(\s*(?:[-*+]|\d+[.)])\s+\[[ xX]\])(\s*)(.*)$/.exec(lineText)
  if (!match) return 'none'
  // `- [ ]foo`（`]` 后没有空格）不是 GFM 任务项，按普通列表处理
  if (!match[2] && match[3]) return 'none'
  const markerEnd = match[1].length + match[2].length
  if (posFromLineStart < markerEnd) return 'none'
  return match[3].trim() ? 'continue' : 'exit'
}
