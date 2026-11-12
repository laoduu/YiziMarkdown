/**
 * 左侧边栏宽度收窄规则。
 *
 * 背景：侧栏从固定 260px 改为可拖拽（见 `components/Sidebar.tsx`），上限与 AI 面板一致：
 * 不超过 600px，且不超过窗口宽度的 40%。拖动与读取存档都走同一个 clamp，
 * 避免出现"存档值来自更宽的窗口，换到窄窗口后手柄跑到屏幕外"。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  clampSidebarWidth, SIDEBAR_WIDTH_DEFAULT, SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX,
} from '../src/stores/settingsStore.ts'

test('宽窗口：普通值原样保留', () => {
  assert.equal(clampSidebarWidth(320, 1920), 320)
})

test('低于下限收敛到最小宽度', () => {
  assert.equal(clampSidebarWidth(80, 1920), SIDEBAR_WIDTH_MIN)
  assert.equal(clampSidebarWidth(0, 1920), SIDEBAR_WIDTH_MIN)
})

test('高于上限收敛到 600px', () => {
  assert.equal(clampSidebarWidth(900, 1920), SIDEBAR_WIDTH_MAX)
})

test('窗口宽度的 40% 低于 600px 时，按窗口收紧', () => {
  assert.equal(clampSidebarWidth(500, 1000), 400)
})

test('窗口极窄时最小宽度优先（与 AI 面板同一行为）', () => {
  assert.equal(clampSidebarWidth(300, 300), SIDEBAR_WIDTH_MIN)
})

test('非法数值回落默认宽度', () => {
  assert.equal(clampSidebarWidth(Number.NaN, 1920), SIDEBAR_WIDTH_DEFAULT)
  assert.equal(clampSidebarWidth(Number.POSITIVE_INFINITY, 1920), SIDEBAR_WIDTH_DEFAULT)
})
