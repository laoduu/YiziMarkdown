/**
 * 工具栏「分割线」插入规则（lib/horizontalRule.ts）。
 *
 * 守住用户报过的三个问题：
 *   1. 不再出现「前后各多一个空段」：`---` 前后最多一个结构上必需的空行；
 *   2. 不会把上一行正文变成 setext 标题（`---` 紧贴正文时）;
 *   3. 插入后光标落在分割线下一行，而不是停在 `---` 源码上。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planHorizontalRule } from '../src/lib/horizontalRule.ts'

function apply(doc: string, pos: number) {
  const edit = planHorizontalRule(doc, pos)
  const next = doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to)
  return { ...edit, doc: next, lineAtCaret: next.slice(0, edit.caret).split('\n').length }
}

test('正文行插入：只用结构必需的一个空行，光标到下一行', () => {
  const r = apply('上文\n下文', 2) // 光标在「上文」里
  assert.equal(r.doc, '上文\n\n---\n下文')
  assert.equal(r.lineAtCaret, 4)
  // 下方没有多余空行
  assert.ok(!r.doc.includes('---\n\n'))
})

test('文档末尾插入：补一个尾行给光标，不制造双空行', () => {
  const r = apply('上文', 2)
  assert.equal(r.doc, '上文\n\n---\n')
  assert.equal(r.caret, r.doc.length)
})

test('空行插入且上方是正文：保留空行，分割线在下、光标到再下一行', () => {
  const r = apply('上文\n\n下文', 3) // 光标在中间空行
  assert.equal(r.doc, '上文\n\n---\n下文')
  assert.equal(r.lineAtCaret, 4)
})

test('空行插入且上方也是空行/文档开头：空行本身换成线，不再加行', () => {
  const r = apply('\n下文', 0)
  assert.equal(r.doc, '---\n下文')
  assert.equal(r.lineAtCaret, 2)
})

test('空白（只有空格）的行按空行处理，空格不残留', () => {
  const r = apply('上文\n   \n下文', 4)
  assert.equal(r.doc, '上文\n\n---\n下文')
})

test('连续插入不会叠加空行', () => {
  const first = apply('上文\n\n下文', 3)
  const second = apply(first.doc, first.caret) // 光标在「下文」行首 → 正文行
  assert.equal(second.doc, '上文\n\n---\n下文\n\n---\n')
  assert.ok(!second.doc.includes('\n\n\n'))
})
