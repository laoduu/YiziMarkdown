/**
 * 下拉列表定位单测（纯几何，不依赖 DOM）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SELECT_MENU_EDGE,
  SELECT_MENU_MAX_HEIGHT,
  SELECT_MENU_MIN_WIDTH,
  computeSelectPosition,
} from '../src/lib/selectPosition.ts'

const viewport = { width: 1000, height: 700 }
const anchor = { left: 100, top: 100, bottom: 132, width: 240 }

test('下方放得下：贴在按钮下沿 4px，高度按内容', () => {
  const pos = computeSelectPosition(anchor, 200, viewport)
  assert.equal(pos.top, anchor.bottom + 4)
  assert.equal(pos.left, 100)
  assert.equal(pos.width, 240)
  assert.equal(pos.maxHeight, SELECT_MENU_MAX_HEIGHT)
})

test('下方不够、上方更宽敞：向上翻', () => {
  const low = { left: 100, top: 640, bottom: 672, width: 240 }
  const pos = computeSelectPosition(low, 200, viewport)
  assert.equal(pos.top, low.top - 4 - 200)
})

test('右侧越界：左侧夹回视口内', () => {
  const right = { left: 900, top: 100, bottom: 132, width: 240 }
  const pos = computeSelectPosition(right, 120, viewport)
  assert.equal(pos.left, viewport.width - 240 - SELECT_MENU_EDGE)
})

test('窄按钮：列表至少 160px 宽', () => {
  const narrow = { left: 100, top: 100, bottom: 132, width: 60 }
  assert.equal(computeSelectPosition(narrow, 80, viewport).width, SELECT_MENU_MIN_WIDTH)
})

test('视口比最小宽度还窄：宽度被视口夹住，不溢出', () => {
  const tiny = { width: 80, height: 600 }
  const pos = computeSelectPosition(anchor, 80, tiny)
  assert.equal(pos.width, 80 - SELECT_MENU_EDGE * 2)
  assert.ok(pos.left >= SELECT_MENU_EDGE)
  assert.ok(pos.left + pos.width <= tiny.width)
})

test('内容超过上限：最大高度封顶为 280，向下展开', () => {
  const pos = computeSelectPosition(anchor, 999, viewport)
  assert.equal(pos.maxHeight, SELECT_MENU_MAX_HEIGHT)
  assert.equal(pos.top, anchor.bottom + 4)
})

test('视口极矮：仍保留保底高度，且列表不越界', () => {
  const short = { width: 400, height: 160 }
  const pos = computeSelectPosition(anchor, 200, short)
  assert.ok(pos.maxHeight >= 80)
  assert.ok(pos.top >= SELECT_MENU_EDGE)
  assert.ok(pos.top + Math.min(200, pos.maxHeight) <= short.height)
})
