/**
 * 场景图垂直回流单测（纯几何，不依赖 DOM）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  accumulateShifts,
  columnRowGrowth,
  flowBottom,
  growFlowNodes,
  shiftFlowNodes,
} from '../src/lib/pptxFlow.ts'

test('accumulateShifts：位移是前面所有增长的累计，最后一个子块不生效', () => {
  const { shifts, total } = accumulateShifts([0, 120, 0, 40])
  assert.deepEqual(shifts, [0, 0, 120, 120])
  assert.equal(total, 160)
})

test('accumulateShifts：负增长按 0 处理', () => {
  const { shifts, total } = accumulateShifts([-50, 30])
  assert.deepEqual(shifts, [0, 0])
  assert.equal(total, 30)
})

test('columnRowGrowth：卡片模式取最大栏增长（保住等高与留白）', () => {
  const g = columnRowGrowth([
    { growth: 120, bottomBefore: 500, bottomAfter: 620 },
    { growth: 40, bottomBefore: 520, bottomAfter: 560 },
  ], true)
  assert.equal(g, 120)
})

test('columnRowGrowth：非卡片模式按栏区内容底部的实际增量', () => {
  // 矮栏长高但仍是矮栏 ⇒ 不推动后面的内容
  assert.equal(columnRowGrowth([
    { growth: 0, bottomBefore: 500, bottomAfter: 500 },
    { growth: 120, bottomBefore: 480, bottomAfter: 600 },
  ], false), 100)
  // 长高的是最高栏 ⇒ 全额推动
  assert.equal(columnRowGrowth([
    { growth: 120, bottomBefore: 500, bottomAfter: 620 },
    { growth: 0, bottomBefore: 480, bottomAfter: 480 },
  ], false), 120)
})

test('columnRowGrowth：空栏区 / 无数据不崩', () => {
  assert.equal(columnRowGrowth([], true), 0)
  assert.equal(columnRowGrowth([{ growth: 30, bottomBefore: NaN, bottomAfter: NaN }], false), 30)
})

test('shiftFlowNodes：只动 y（line 动 y1/y2），不动 h', () => {
  const nodes = [
    { t: 'text', y: 1, h: 0.2 },
    { t: 'card', y: 2, h: 1 },
    { t: 'line', y1: 3, y2: 4 },
    { t: 'image', y: NaN, h: 1 },
  ]
  shiftFlowNodes(nodes, 1, 0.5)
  assert.equal(nodes[0].y, 1, '区间外不动')
  assert.equal(nodes[1].y, 2.5)
  assert.equal(nodes[1].h, 1, '增高由 growFlowNodes 负责')
  assert.equal(nodes[2].y1, 3.5)
  assert.equal(nodes[2].y2, 4.5)
  assert.ok(Number.isNaN(nodes[3].y), '非有限值不参与')
})

test('flowBottom：取最大底边，跳过装饰文本与无限值', () => {
  assert.equal(flowBottom([{ t: 'text', y: 1, h: 0.5 }, { t: 'code', y: 2, h: 1 }], 0), 3)
  assert.equal(flowBottom([{ t: 'text', y: 1, h: 0.5 }, { t: 'text', y: 5, h: 2, decorative: true }], 0), 1.5)
  assert.equal(flowBottom([{ t: 'line', y1: 2, y2: 4 }], 0), 4)
  assert.ok(Number.isNaN(flowBottom([], 0)))
})

test('shiftFlowNodes：dy <= 0 时不动', () => {
  const nodes = [{ t: 'text', y: 1 }]
  shiftFlowNodes(nodes, 0, 0)
  shiftFlowNodes(nodes, 0, -3)
  assert.equal(nodes[0].y, 1)
})

test('growFlowNodes：按索引增高，忽略非法索引', () => {
  const nodes = [{ t: 'card', y: 1, h: 2 }, { t: 'text', y: 1, h: 0.5 }]
  growFlowNodes(nodes, [0, 9], 1.5)
  assert.equal(nodes[0].h, 3.5)
  assert.equal(nodes[1].h, 0.5)
})

test('shiftFlowNodes：可以限定区间（装饰回填不碰正文节点）', () => {
  const nodes = [
    { t: 'rect', y: 1, h: 0.1 },   // 装饰
    { t: 'text', y: 2, h: 0.3 },   // 正文
  ]
  shiftFlowNodes(nodes, 0, 0.5, 1)
  assert.equal(nodes[0].y, 1.5)
  assert.equal(nodes[1].y, 2)
})

/**
 * 复现 issue #19 的几何：左栏代码预折行多出 1.2in，右栏很矮。
 * 卡片模式 ⇒ 两张卡一起长高，代码后面的文字跟着下移，落款（页面流）也下移。
 */
test('分栏回流：同排卡片等高增高、后续节点同步下移', () => {
  const nodes = [
    { t: 'card', y: 1.8, h: 2.8 },   // 0 左卡
    { t: 'card', y: 1.8, h: 2.8 },   // 1 右卡
    { t: 'code', y: 2.0, h: 3.0 },   // 2 左栏代码（已含预折行增高）
    { t: 'text', y: 5.2, h: 0.3 },   // 3 左栏代码之后的文字
    { t: 'text', y: 1.8, h: 0.3 },   // 4 右栏内容
    { t: 'text', y: 5.5, h: 0.4 },   // 5 栏区之后的落款
  ]
  const columns = [
    { growth: 1.2 * 96, bottomBefore: 4.6 * 96, bottomAfter: 5.5 * 96 },
    { growth: 0, bottomBefore: 2.1 * 96, bottomAfter: 2.1 * 96 },
  ]
  // ColumnFlow 的单位是 px，这里换回 inch 便于断言
  const row = columnRowGrowth(columns, true) / 96
  assert.equal(row, 1.2, '卡片模式取最大栏增长，而不是底边差')

  // 卡片：按最大增量一起长高（等高 + 保留上下留白）
  growFlowNodes(nodes, [0, 1], row)
  assert.equal(nodes[0].h, 2.8 + row)
  assert.equal(nodes[1].h, 2.8 + row)

  // 栏内后续节点 + 页面流（栏内只动本栏区间 3..4，页面流 5 只吃栏区增量）
  shiftFlowNodes(nodes, 3, 1.2, 4)
  shiftFlowNodes(nodes, 5, row)
  assert.equal(nodes[3].y, 6.4)
  assert.equal(nodes[5].y, 5.5 + row)
  assert.equal(nodes[2].y, 2.0, '代码块自身不下移')
})

test('非卡片分流：矮栏长高但仍是矮栏时不推动页面', () => {
  const columns = [
    { growth: 0, bottomBefore: 500, bottomAfter: 500 },
    { growth: 120, bottomBefore: 480, bottomAfter: 600 },
  ]
  assert.equal(columnRowGrowth(columns, false), 100)
})

