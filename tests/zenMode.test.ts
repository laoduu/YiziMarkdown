import test from 'node:test'
import assert from 'node:assert/strict'
import {
  zenAllowedForViewMode,
  zenEdgeRegionAt,
  pointInRect,
  shouldExitZenOnEscape,
  ZEN_TIMING,
  zenEnterTotalMs,
  zenExitTotalMs,
} from '../src/lib/zenMode.ts'

test('禅模式只服务编辑态：源码与实时可用，分栏/预览不可用', () => {
  assert.equal(zenAllowedForViewMode('edit'), true)
  assert.equal(zenAllowedForViewMode('live'), true)
  assert.equal(zenAllowedForViewMode('split'), false)
  assert.equal(zenAllowedForViewMode('preview'), false)
  // 视图缺失（新标签页默认 edit）按可用处理由调用方决定，这里只保证非法值不放行
  assert.equal(zenAllowedForViewMode(undefined), false)
  assert.equal(zenAllowedForViewMode('unknown'), false)
})

test('边缘命中：四边都在热区内才唤醒，且角落按上下优先', () => {
  const W = 1200
  const H = 800
  assert.equal(zenEdgeRegionAt(600, 3, W, H), 'top')
  assert.equal(zenEdgeRegionAt(600, H - 3, W, H), 'bottom')
  assert.equal(zenEdgeRegionAt(3, 400, W, H), 'left')
  assert.equal(zenEdgeRegionAt(W - 3, 400, W, H), 'right')
  assert.equal(zenEdgeRegionAt(600, 400, W, H), null)
  // 左上角：先判 top（避免贴顶边时误判成侧栏）
  assert.equal(zenEdgeRegionAt(2, 2, W, H), 'top')
  // 右下角：先判 bottom
  assert.equal(zenEdgeRegionAt(W - 2, H - 2, W, H), 'bottom')
  // 越界输入不应抛出
  assert.equal(zenEdgeRegionAt(Number.NaN, 10, W, H), null)
})

test('已在唤回区内穿梭时保持（带容差）', () => {
  const rect = { top: 0, left: 0, right: 260, bottom: 800 }
  assert.equal(pointInRect(130, 400, rect), true)
  assert.equal(pointInRect(264, 400, rect), true)   // 4px 容差
  assert.equal(pointInRect(300, 400, rect), false)
  assert.equal(pointInRect(130, -2, rect), true)    // 顶边出发时的小抖动
})

test('Esc 优先级：输入法组合与浮层都会拦住退出', () => {
  assert.equal(shouldExitZenOnEscape({ imeComposing: false, overlayOpen: false }), true)
  assert.equal(shouldExitZenOnEscape({ imeComposing: true, overlayOpen: false }), false)
  assert.equal(shouldExitZenOnEscape({ imeComposing: false, overlayOpen: true }), false)
  assert.equal(shouldExitZenOnEscape({ imeComposing: true, overlayOpen: true }), false)
})

test('动画时序：消失顺序为 面板 → 工具栏 → Tab 栏 → 状态栏，回归反向', () => {
  assert.ok(ZEN_TIMING.fold > 0)
  // 进入禅（消失）
  assert.equal(ZEN_TIMING.enterPanelDelay, 0)
  assert.ok(ZEN_TIMING.enterToolbarDelay > ZEN_TIMING.enterPanelDelay)
  assert.ok(ZEN_TIMING.enterTabbarDelay > ZEN_TIMING.enterToolbarDelay)
  assert.ok(ZEN_TIMING.enterStatusDelay > ZEN_TIMING.enterTabbarDelay)
  // 退出禅（回归）—— 与消失反向
  assert.equal(ZEN_TIMING.exitStatusDelay, 0)
  assert.ok(ZEN_TIMING.exitTabbarDelay > ZEN_TIMING.exitStatusDelay)
  assert.ok(ZEN_TIMING.exitToolbarDelay > ZEN_TIMING.exitTabbarDelay)
  assert.ok(ZEN_TIMING.exitPanelDelay > ZEN_TIMING.exitToolbarDelay)
  // 唤回比收回快；光晕与滚动条收回都有明确时长
  assert.ok(ZEN_TIMING.awakeIn < ZEN_TIMING.awakeOut)
  assert.ok(ZEN_TIMING.halo >= ZEN_TIMING.fold * 2)
  assert.ok(ZEN_TIMING.scrollLinger < ZEN_TIMING.idleCursor)
  assert.ok(ZEN_TIMING.edge > 0 && ZEN_TIMING.edge < 20)
})

test('进出场总时长：滚动条等"最后才动"的元素按它对齐', () => {
  assert.equal(zenEnterTotalMs, ZEN_TIMING.enterStatusDelay + ZEN_TIMING.fold)
  assert.equal(zenExitTotalMs, ZEN_TIMING.exitPanelDelay + ZEN_TIMING.fold)
  assert.ok(zenEnterTotalMs > ZEN_TIMING.enterToolbarDelay)
  assert.ok(zenExitTotalMs > ZEN_TIMING.exitToolbarDelay)
})
