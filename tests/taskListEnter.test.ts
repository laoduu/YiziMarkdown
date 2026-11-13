/**
 * 任务列表回车续写（补 `[ ] `）的回归测试。
 *
 * 覆盖三种来源：
 *   1. CodeMirror 6.5.x 已经会续写 `- [ ] ` —— 不能重复补成 `- [ ] [ ] `；
 *   2. 只续写普通列表标记 `- ` 的版本 / 文档状态 —— 必须补成 `- [ ] `；
 *   3. 有序任务、嵌套任务的缩进与编号保持不变。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EditorState } from '@codemirror/state'
import { markdown, insertNewlineContinueMarkup } from '@codemirror/lang-markdown'
import { completeTaskContinuation } from '../src/lib/taskListEnter.ts'

function syntheticContinuation(doc: string, insert: string) {
  const state = EditorState.create({ doc, selection: { anchor: doc.length } })
  const tr = state.update({
    changes: { from: doc.length, insert },
    selection: { anchor: doc.length + insert.length },
    userEvent: 'input',
  })
  return { state, tr }
}

test('CodeMirror 已续写 checkbox 时不重复插入', () => {
  let tr
  const state = EditorState.create({
    doc: '- [ ] foo',
    selection: { anchor: 9 },
    extensions: [markdown()],
  })
  assert.equal(insertNewlineContinueMarkup({ state, dispatch: (t) => { tr = t } }), true)
  const final = completeTaskContinuation(state, tr).state
  assert.equal(final.doc.toString(), '- [ ] foo\n- [ ] ')
})

test('只续写 `- ` 时补成 `- [ ] `', () => {
  const { state, tr } = syntheticContinuation('- [ ] foo', '\n- ')
  const final = completeTaskContinuation(state, tr).state
  assert.equal(final.doc.toString(), '- [ ] foo\n- [ ] ')
})

test('有序任务保留编号并补 checkbox', () => {
  const { state, tr } = syntheticContinuation('1. [ ] a', '\n2. ')
  const final = completeTaskContinuation(state, tr).state
  assert.equal(final.doc.toString(), '1. [ ] a\n2. [ ] ')
})

test('嵌套任务保留原缩进', () => {
  const { state, tr } = syntheticContinuation('  - [ ] a', '\n  - ')
  const final = completeTaskContinuation(state, tr).state
  assert.equal(final.doc.toString(), '  - [ ] a\n  - [ ] ')
})

test('光标落在 checkbox 之后（紧邻后续文本之前）', () => {
  const { state, tr } = syntheticContinuation('- [ ] foo', '\n- ')
  const final = completeTaskContinuation(state, tr).state
  const head = final.selection.main.head
  const line = final.doc.lineAt(head)
  assert.equal(line.text, '- [ ] ')
  assert.equal(head - line.from, 6)
})
