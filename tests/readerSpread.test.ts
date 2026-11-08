/**
 * readerSpread.test.ts — 阅读模式双页跨页起点的单元测试。
 *
 * 回归的 bug：总页数为偶数时，旧实现允许跨页起点落在奇数索引（最后一页单独
 * 占左半、右半留白）；而 BookPage 的页码位置按索引奇偶决定，于是实际落在
 * 左半屏的奇数页把页码画到了中轴，往前翻后左右两页的页码都挤在中轴。
 *
 * 约定：跨页起点必须是偶数（左页），页码才能一直贴在两外侧。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { clampStartPage, spreadMaxStart } from '../src/lib/readerSpread.ts'

test('双页模式：最大起点始终是偶数（左页）', () => {
  for (let total = 1; total <= 20; total++) {
    assert.equal(spreadMaxStart(total, true) % 2, 0, `total=${total}`)
  }
})

test('总页数为偶数：最后一页属于上一跨页，不允许假跨页', () => {
  // 10 页（索引 0..9）：最后跨页是 [8,9]，起点必须是 8
  assert.equal(spreadMaxStart(10, true), 8)
  // 回归：旧实现 clamp(9) 返回 9，导致页码跑到中轴
  assert.equal(clampStartPage(9, 10, true), 8)
  assert.equal(clampStartPage(8, 10, true), 8)
})

test('总页数为奇数：最后一页可单独占左页（右侧留白）', () => {
  // 11 页（索引 0..10）：最后一页 10 是左页
  assert.equal(spreadMaxStart(11, true), 10)
  assert.equal(clampStartPage(10, 11, true), 10)
})

test('单页模式不按奇偶对齐，最后一页就是 total-1', () => {
  assert.equal(spreadMaxStart(10, false), 9)
  assert.equal(clampStartPage(9, 10, false), 9)
})

test('越界与非法值夹回合法起点', () => {
  assert.equal(clampStartPage(99, 10, true), 8)
  assert.equal(clampStartPage(-5, 10, true), 0)
  assert.equal(clampStartPage(Number.NaN, 10, true), 0)
  assert.equal(clampStartPage(5, 0, true), 0)
})

test('回归：从最后一页一路往前翻，每一步起点都是偶数', () => {
  for (const total of [8, 10, 11, 12]) {
    let start = spreadMaxStart(total, true)
    for (let i = 0; i < 8 && start > 0; i++) {
      start = clampStartPage(start - 2, total, true)
      assert.equal(start % 2, 0, `total=${total} step=${i} start=${start}`)
      // 除奇数总页的最后一页（左侧单页）外，起点后面都应有右页
      assert.ok(start + 1 < total, `total=${total} step=${i} start=${start}`)
    }
  }
})
