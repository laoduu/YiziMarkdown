/**
 * 块级格式 toggle（src/lib/blockFormat.ts）。
 *
 * 规则：选中行全部已是该格式 → 取消；否则统一应用（换级直接替换）。
 * 这里重点覆盖旧实现的两个坑：光标在行中间、缩进被破坏。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blockSpecOf, planBlockToggle } from '../src/lib/blockFormat.ts'

function apply(doc: string, edit: { from: number; to: number; insert: string }): string {
  return doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to)
}

test('无标记的行加标题：作用于整行（不是光标处）', () => {
  const doc = 'hello world'
  const edit = planBlockToggle(doc, 5, 5, { kind: 'heading', level: 1 })
  assert.equal(apply(doc, edit), '# hello world')
  assert.equal(edit.selFrom, 7)
})

test('同级再点一次：取消标题', () => {
  const doc = '# hello'
  const edit = planBlockToggle(doc, 6, 6, { kind: 'heading', level: 1 })
  assert.equal(apply(doc, edit), 'hello')
})

test('换级直接替换，不产生 `# ##`', () => {
  const doc = '# hello'
  const edit = planBlockToggle(doc, 0, 0, { kind: 'heading', level: 2 })
  assert.equal(apply(doc, edit), '## hello')
})

test('多行选区混合状态：统一应用；再点统一取消', () => {
  const doc = '# a\nb'
  const first = planBlockToggle(doc, 0, 5, { kind: 'heading', level: 1 })
  assert.equal(apply(doc, first), '# a\n# b')
  const second = planBlockToggle('# a\n# b', first.selFrom, first.selTo, { kind: 'heading', level: 1 })
  assert.equal(apply('# a\n# b', second), 'a\nb')
})

test('缩进保留：标记插在缩进之后', () => {
  const doc = '  item'
  const edit = planBlockToggle(doc, 4, 4, { kind: 'unordered' })
  assert.equal(apply(doc, edit), '  - item')
})

test('无序列表 toggle：再点取消，且不碰其他行', () => {
  const doc = '- a\n- b'
  const edit = planBlockToggle(doc, 0, 7, { kind: 'unordered' })
  assert.equal(apply(doc, edit), 'a\nb')
})

test('任务列表与无序列表互转', () => {
  const ul = planBlockToggle('- a', 0, 3, { kind: 'task' })
  assert.equal(apply('- a', ul), '- [ ] a')
  const back = planBlockToggle('- [ ] a', 0, 0, { kind: 'unordered' })
  assert.equal(apply('- [ ] a', back), '- a')
})

test('有序列表按行编号，空行跳过；再点去掉编号', () => {
  const doc = 'a\n\nb'
  const edit = planBlockToggle(doc, 0, 4, { kind: 'ordered' })
  assert.equal(apply(doc, edit), '1. a\n\n2. b')
  const off = planBlockToggle('1. a\n\n2. b', 0, 10, { kind: 'ordered' })
  assert.equal(apply('1. a\n\n2. b', off), 'a\n\nb')
})

test('标题与列表互相转换（块级格式互斥）', () => {
  const toHeading = planBlockToggle('- item', 0, 6, { kind: 'heading', level: 1 })
  assert.equal(apply('- item', toHeading), '# item')
  const toList = planBlockToggle('# item', 0, 6, { kind: 'unordered' })
  assert.equal(apply('# item', toList), '- item')
})

test('引用可叠加在列表/标题上，且取消时只去掉引用', () => {
  const doc = '- item'
  const on = planBlockToggle(doc, 0, 6, { kind: 'quote' })
  assert.equal(apply(doc, on), '> - item')
  const off = planBlockToggle('> - item', 0, 0, { kind: 'quote' })
  assert.equal(apply('> - item', off), '- item')
})

test('多行部分已引用：统一加，不会出现 `> >`', () => {
  const doc = '> a\nb'
  const edit = planBlockToggle(doc, 0, 5, { kind: 'quote' })
  assert.equal(apply(doc, edit), '> a\n> b')
})

test('选区停在行首时，不把下一行算进来', () => {
  const doc = 'a\nb'
  const edit = planBlockToggle(doc, 0, 2, { kind: 'unordered' })
  assert.equal(apply(doc, edit), '- a\nb')
})

test('空行不产生标记，但保留位置', () => {
  const doc = 'a\n\nb'
  const edit = planBlockToggle(doc, 0, 4, { kind: 'unordered' })
  assert.equal(apply(doc, edit), '- a\n\n- b')
})

test('加一次再去掉一次，回到原文档', () => {
  const doc = 'one\ntwo'
  const on = planBlockToggle(doc, 0, 7, { kind: 'unordered' })
  const once = apply(doc, on)
  const off = planBlockToggle(once, on.selFrom, on.selTo, { kind: 'unordered' })
  assert.equal(apply(once, off), doc)
})

test('空标题 `#` 也能识别并取消', () => {
  const edit = planBlockToggle('#', 1, 1, { kind: 'heading', level: 1 })
  assert.equal(apply('#', edit), '')
})

test('blockSpecOf：工具栏参数到块级格式', () => {
  assert.deepEqual(blockSpecOf('# ', 'prefix'), { kind: 'heading', level: 1 })
  assert.deepEqual(blockSpecOf('### ', 'prefix'), { kind: 'heading', level: 3 })
  assert.deepEqual(blockSpecOf('- ', 'prefix'), { kind: 'unordered' })
  assert.deepEqual(blockSpecOf('- [ ] ', 'prefix'), { kind: 'task' })
  assert.deepEqual(blockSpecOf('> ', 'prefix'), { kind: 'quote' })
  assert.deepEqual(blockSpecOf('1. ', 'ordered'), { kind: 'ordered' })
  assert.equal(blockSpecOf('**', 'wrap'), null)
})
