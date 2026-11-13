/**
 * 任务列表回车续写的「补 checkbox」步骤（纯 CodeMirror state 逻辑，便于单测）。
 *
 * CodeMirror 的 `insertNewlineContinueMarkup` 在 6.5.x 已经会为任务项补 `[ ] `，
 * 但不同版本 / 不同文档状态下可能只续写 `- `。编辑器侧先让 CM 生成续行事务，
 * 再在这里补一次空的 checkbox（已带 checkbox 则原样返回，避免 `- [ ] [ ] `）。
 */
import { ChangeSet, EditorSelection, EditorState, Transaction } from '@codemirror/state'

/** 新行已经带上任务标记（`- [ ]` / `1. [ ]` 等） */
const HAS_TASK_MARKER = /^\s*(?:[-*+]|\d+[.)])\s+\[[ xX]\]\s/
/** 普通列表标记前缀（缩进 + bullet / 有序编号 + 空格） */
const LIST_MARKER = /^(\s*(?:[-*+]|\d+[.)])\s+)/

export function completeTaskContinuation(state: EditorState, tr: Transaction): Transaction {
  const next = tr.state
  const newLine = next.doc.lineAt(next.selection.main.head)

  // CM 已经补好 checkbox：直接采用原事务（不能重复插）
  if (HAS_TASK_MARKER.test(newLine.text)) return tr

  const marker = LIST_MARKER.exec(newLine.text)
  if (!marker) return tr

  const insertAt = newLine.from + marker[1].length
  const insertChange = ChangeSet.of({ from: insertAt, insert: '[ ] ' }, next.doc.length)
  return state.update({
    changes: tr.changes.compose(insertChange),
    selection: EditorSelection.cursor(insertAt + 4),
    scrollIntoView: true,
    userEvent: 'input',
  })
}
