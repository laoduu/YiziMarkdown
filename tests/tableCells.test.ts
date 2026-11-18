/**
 * 实时模式表格单元格纯逻辑（src/lib/tableCells.ts）的回归测试。
 *
 * 键盘跳格和行内标记 toggle 都从 widget 里拆出来，就是为了能在这里覆盖边界：
 * 末行末格按 Tab 要增行、Shift+Tab 到首格要停住、方向键不能越界、
 * `*` 不能把 `**bold**` 误判成斜体。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { arrowTarget, enterTarget, tabTarget, toggleWrap } from '../src/lib/tableCells.ts'

test('Tab 在行内向右移一格', () => {
  assert.deepEqual(tabTarget(1, 0, 3, 3, 1), { r: 1, c: 1 })
})

test('Tab 在行末跳到下一行第一格', () => {
  assert.deepEqual(tabTarget(1, 2, 3, 3, 1), { r: 2, c: 0 })
})

test('Tab 在最后一格要求新增一行（落在行首）', () => {
  assert.deepEqual(tabTarget(2, 2, 3, 3, 1), { r: 3, c: 0, addRow: true })
})

test('Shift+Tab 在行首跳到上一行末格', () => {
  assert.deepEqual(tabTarget(1, 0, 3, 3, -1), { r: 0, c: 2 })
})

test('Shift+Tab 在第一格停住（返回 null）', () => {
  assert.equal(tabTarget(0, 0, 3, 3, -1), null)
})

test('Enter 同列下一行；最后一行要求新增一行', () => {
  assert.deepEqual(enterTarget(1, 1, 3), { r: 2, c: 1 })
  assert.deepEqual(enterTarget(2, 1, 3), { r: 3, c: 1, addRow: true })
})

test('方向键越界返回 null', () => {
  assert.equal(arrowTarget(0, 0, 3, 3, 'ArrowUp'), null)
  assert.equal(arrowTarget(0, 0, 3, 3, 'ArrowLeft'), null)
  assert.equal(arrowTarget(2, 2, 3, 3, 'ArrowDown'), null)
  assert.equal(arrowTarget(2, 2, 3, 3, 'ArrowRight'), null)
  assert.deepEqual(arrowTarget(1, 1, 3, 3, 'ArrowRight'), { r: 1, c: 2 })
  assert.deepEqual(arrowTarget(1, 1, 3, 3, 'ArrowUp'), { r: 0, c: 1 })
})

test('无选区时对整格加粗 / 去加粗', () => {
  const wrapped = toggleWrap('abc', 0, 0, '**', '**')
  assert.equal(wrapped.text, '**abc**')
  assert.equal(wrapped.selFrom, 2)
  assert.equal(wrapped.selTo, 5)

  const unwrapped = toggleWrap('**abc**', 0, 0, '**', '**')
  assert.equal(unwrapped.text, 'abc')
  assert.equal(unwrapped.selFrom, 0)
  assert.equal(unwrapped.selTo, 3)
})

test('有选区时只包裹选中片段，并保留两侧文本', () => {
  const res = toggleWrap('hello world', 6, 11, '**', '**')
  assert.equal(res.text, 'hello **world**')
  assert.equal(res.selFrom, 8)
  assert.equal(res.selTo, 13)
})

test('选中已加粗片段再次加粗 → 去掉标记', () => {
  const res = toggleWrap('a **b** c', 2, 7, '**', '**')
  assert.equal(res.text, 'a b c')
  assert.equal(res.selFrom, 2)
  assert.equal(res.selTo, 3)
})

test('选中标记内部文字再次加粗 → 去掉外侧标记（不叠加成 ****）', () => {
  const res = toggleWrap('**a1**', 2, 4, '**', '**')
  assert.equal(res.text, 'a1')
  assert.equal(res.selFrom, 0)
  assert.equal(res.selTo, 2)
})

test('单字符标记的外侧拆除：*a1* 里的 a1 再点斜体', () => {
  const res = toggleWrap('*a1*', 1, 3, '*', '*')
  assert.equal(res.text, 'a1')
})

test('对加粗内部文字点斜体 → 叠加为 ***a1***，不误拆', () => {
  const res = toggleWrap('**a1**', 2, 4, '*', '*')
  assert.equal(res.text, '***a1***')
})

test('斜体标记不能误拆加粗：`*` 对 `**bold**` 应继续包裹', () => {
  const res = toggleWrap('**bold**', 0, 0, '*', '*')
  assert.equal(res.text, '***bold***')
})

test('单字符标记不把 "a * b *" 当包裹', () => {
  const res = toggleWrap('a * b *', 0, 0, '*', '*')
  assert.equal(res.text, '*a * b **')
})

test('空文本不产生标记', () => {
  const res = toggleWrap('', 0, 0, '**', '**')
  assert.equal(res.text, '')
})

test('标签对（上下标）走同一套包裹/去包裹', () => {
  const wrapped = toggleWrap('x', 0, 0, '<sup>', '</sup>')
  assert.equal(wrapped.text, '<sup>x</sup>')
  const unwrapped = toggleWrap('<sup>x</sup>', 0, 0, '<sup>', '</sup>')
  assert.equal(unwrapped.text, 'x')
})
