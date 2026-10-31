/**
 * pptxOverflow.test.ts — 场景节点的超页包围盒回归。
 *
 * 导出自动压缩依赖 `measureSceneOverflow`，它必须同时覆盖顶部/底部/左右四边；
 * 以前的 scrollHeight 实现漏掉居中版式的顶部溢出，这里用纯节点坐标锁定行为。
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { measureSceneOverflow } from '../src/lib/pptxScene.ts'
import type { SceneNode } from '../src/lib/pptxTypes.ts'

const W = 13.333
const H = 7.5

function text(x: number, y: number, w: number, h: number): SceneNode {
  return {
    t: 'text', x, y, w, h,
    align: 'left', valign: 'top', lineSpacingPt: 10,
    paragraphs: [], baseColor: '000000', baseSizePt: 10,
    latin: 'Arial', ea: 'Arial',
  }
}

test('PPTX 超页：全部节点在页内时四边都是 0', () => {
  assert.deepEqual(measureSceneOverflow([text(1, 1, 4, 1)], W, H), {
    top: 0, right: 0, bottom: 0, left: 0,
  })
})

test('PPTX 超页：顶部负坐标按真实溢出量计入（居中版式的典型场景）', () => {
  const o = measureSceneOverflow([text(1, -0.25, 4, 1)], W, H)
  assert.equal(o.top, 24)
  assert.equal(o.bottom, 0)
})

test('PPTX 超页：底部与右侧同时溢出时分别报告', () => {
  const o = measureSceneOverflow([text(12.9, 7.0, 0.6, 0.6)], W, H)
  assert.equal(o.right, Math.round((13.5 - W) * 96))
  assert.equal(o.bottom, Math.round((7.6 - H) * 96))
})

test('PPTX 超页：左侧负坐标计入 left', () => {
  const o = measureSceneOverflow([text(-0.1, 1, 4, 1)], W, H)
  assert.equal(o.left, 10)
})

test('PPTX 超页：空场景不报溢出', () => {
  assert.deepEqual(measureSceneOverflow([], W, H), { top: 0, right: 0, bottom: 0, left: 0 })
})

test('PPTX 超页：装饰元素（金句引号/章节序号）不参与超页判定', () => {
  const decorative = text(14, 7.6, 1, 1)
  decorative.decorative = true
  assert.deepEqual(measureSceneOverflow([decorative], W, H), {
    top: 0, right: 0, bottom: 0, left: 0,
  })
})
