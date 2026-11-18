/**
 * 正文行内标记 toggle（src/lib/inlineWrap.ts）。
 *
 * 覆盖用户反馈的核心场景：选中文字点加粗 → 再点一次必须取消，
 * 而不是变成 `****文字****`；以及「选中标记内部的文字」也能取消外侧标记。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inlinePairOf, planInlineToggle } from '../src/lib/inlineWrap.ts'

/** 把一次 edit 应用到文档，方便验证连点两次能回到原样 */
function apply(doc: string, edit: { from: number; to: number; insert: string }): string {
  return doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to)
}

test('选中文字加粗：只包裹选区，并选中内部文字', () => {
  const doc = 'hello world'
  const edit = planInlineToggle(doc, 6, 11, '**', '**')
  assert.equal(edit.from, 6)
  assert.equal(edit.to, 11)
  assert.equal(edit.insert, '**world**')
  assert.equal(edit.selFrom, 8)
  assert.equal(edit.selTo, 13)
})

test('再点一次加粗：取消外侧标记（选中标记内部文字）', () => {
  const doc = 'a **bold** b'
  const edit = planInlineToggle(doc, 4, 8, '**', '**')
  assert.equal(edit.from, 2)
  assert.equal(edit.to, 10)
  assert.equal(edit.insert, 'bold')
  assert.equal(edit.selFrom, 2)
  assert.equal(edit.selTo, 6)
})

test('选中整段带标记的文本再点加粗：去掉内侧标记', () => {
  const doc = 'a **bold** b'
  const edit = planInlineToggle(doc, 2, 10, '**', '**')
  assert.equal(edit.from, 2)
  assert.equal(edit.to, 10)
  assert.equal(edit.insert, 'bold')
})

test('连点两次加粗回到原文档', () => {
  const doc = 'hello world'
  const first = planInlineToggle(doc, 6, 11, '**', '**')
  const once = apply(doc, first)
  assert.equal(once, 'hello **world**')
  const second = planInlineToggle(once, first.selFrom, first.selTo, '**', '**')
  assert.equal(apply(once, second), doc)
})

test('对加粗文字点斜体：叠加为 ***text***，不误拆', () => {
  const doc = '**b**'
  const edit = planInlineToggle(doc, 2, 3, '*', '*')
  assert.equal(apply(doc, edit), '***b***')
})

test('斜体连点两次也能还原', () => {
  const doc = 'a b c'
  const first = planInlineToggle(doc, 2, 3, '*', '*')
  const once = apply(doc, first)
  assert.equal(once, 'a *b* c')
  const second = planInlineToggle(once, first.selFrom, first.selTo, '*', '*')
  assert.equal(apply(once, second), doc)
})

test('光标停在 **** 中间再点加粗：删除空标记对', () => {
  const doc = 'a **** b'
  const edit = planInlineToggle(doc, 4, 4, '**', '**')
  assert.equal(apply(doc, edit), 'a  b')
})

test('无选区、无标记：插入一对标记并把光标放在中间', () => {
  const doc = 'a b'
  const edit = planInlineToggle(doc, 2, 2, '**', '**')
  assert.equal(apply(doc, edit), 'a ****b')
  assert.equal(edit.selFrom, 4)
  assert.equal(edit.selTo, edit.selFrom)
})

test('高亮 == 与行内代码 ` 使用同一套规则', () => {
  const hl = planInlineToggle('x y', 2, 3, '==', '==')
  assert.equal(apply('x y', hl), 'x ==y==')
  const code = planInlineToggle('x y', 2, 3, '`', '`')
  assert.equal(apply('x y', code), 'x `y`')
  const codeOff = planInlineToggle('x `y`', 3, 4, '`', '`')
  assert.equal(apply('x `y`', codeOff), 'x y')
})

test('标签对（上下标）同样可取消', () => {
  const wrap = planInlineToggle('H2O', 1, 2, '<sub>', '</sub>')
  assert.equal(apply('H2O', wrap), 'H<sub>2</sub>O')
})

test('inlinePairOf：只翻译包裹型格式', () => {
  assert.deepEqual(inlinePairOf('**', 'wrap'), { open: '**', close: '**' })
  assert.deepEqual(inlinePairOf('<sup></sup>', 'tag'), { open: '<sup>', close: '</sup>' })
  assert.equal(inlinePairOf('# ', 'prefix'), null)
  assert.equal(inlinePairOf('1. ', 'ordered'), null)
})
