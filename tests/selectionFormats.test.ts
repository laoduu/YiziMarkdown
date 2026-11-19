/**
 * 划词格式条的配置与顺序（src/lib/selectionFormats.ts）。
 *
 * 覆盖存档清理、排序、显示开关；这些逻辑同时被设置页与浮动格式条使用，
 * 必须保证「未知 id / 重复 id / 缺项 / 全部隐藏」都有确定结果。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_SELECTION_FORMATS,
  enabledSelectionFormats,
  isSelectionFormatId,
  moveSelectionFormat,
  normalizeSelectionFormats,
  setSelectionFormatEnabled,
} from '../src/lib/selectionFormats.ts'

test('默认配置：14 个启用格式 + 链接默认隐藏', () => {
  assert.equal(DEFAULT_SELECTION_FORMATS.length, 14)
  assert.equal(DEFAULT_SELECTION_FORMATS.filter((f) => f.enabled).length, 13)
  assert.deepEqual(
    DEFAULT_SELECTION_FORMATS.find((f) => f.id === 'link'),
    { id: 'link', enabled: false },
  )
  assert.equal(DEFAULT_SELECTION_FORMATS[0].id, 'bold')
  assert.equal(DEFAULT_SELECTION_FORMATS.at(-1)?.id, 'link')
})

test('非数组存档 → 回到默认', () => {
  assert.deepEqual(normalizeSelectionFormats(undefined), DEFAULT_SELECTION_FORMATS)
  assert.deepEqual(normalizeSelectionFormats('x'), DEFAULT_SELECTION_FORMATS)
})

test('清理未知 id 与重复 id', () => {
  const out = normalizeSelectionFormats([
    { id: 'bold', enabled: true },
    { id: 'nope', enabled: true },
    { id: 'bold', enabled: false },
  ])
  assert.equal(out.filter((f) => f.id === 'bold').length, 1)
  assert.equal(out.filter((f) => f.id === 'nope').length, 0)
  assert.equal(out.find((f) => f.id === 'bold')?.enabled, true)
})

test('缺失项按默认顺序追加到末尾', () => {
  const out = normalizeSelectionFormats([{ id: 'quote', enabled: true }])
  assert.equal(out[0].id, 'quote')
  assert.deepEqual(
    out.slice(1).map((f) => f.id),
    DEFAULT_SELECTION_FORMATS.filter((f) => f.id !== 'quote').map((f) => f.id),
  )
})

test('兼容纯 id 字符串数组，enabled 取默认值', () => {
  const out = normalizeSelectionFormats(['math', 'link'])
  assert.equal(out[0].id, 'math')
  assert.equal(out[0].enabled, true)
  assert.equal(out[1].id, 'link')
  assert.equal(out[1].enabled, false)
})

test('全部隐藏时至少恢复一个，避免格式条为空', () => {
  const hidden = DEFAULT_SELECTION_FORMATS.map((f) => ({ ...f, enabled: false }))
  const out = normalizeSelectionFormats(hidden)
  assert.equal(out.some((f) => f.enabled), true)
  assert.equal(out[0].enabled, true)
})

test('上移 / 下移与边界', () => {
  const list = normalizeSelectionFormats(undefined)
  const moved = moveSelectionFormat(list, 'italic', -1)
  assert.equal(moved[0].id, 'italic')
  assert.equal(moved[1].id, 'bold')
  const down = moveSelectionFormat(moved, 'italic', 1)
  assert.equal(down[0].id, 'bold')
  assert.equal(down[1].id, 'italic')
  assert.equal(moveSelectionFormat(list, 'bold', -1), list)
  assert.equal(moveSelectionFormat(list, 'link', 1), list)
})

test('显示开关：可隐藏、可恢复，最后一项不可隐藏', () => {
  const list = normalizeSelectionFormats(undefined)
  const off = setSelectionFormatEnabled(list, 'bold', false)
  assert.equal(off.find((f) => f.id === 'bold')?.enabled, false)
  const on = setSelectionFormatEnabled(off, 'bold', true)
  assert.equal(on.find((f) => f.id === 'bold')?.enabled, true)

  const onlyOne = list.map((f) => ({ ...f, enabled: f.id === 'bold' }))
  assert.equal(setSelectionFormatEnabled(onlyOne, 'bold', false), onlyOne)
})

test('enabledSelectionFormats 只返回显示项且保持顺序', () => {
  const list = normalizeSelectionFormats(undefined)
  const enabled = enabledSelectionFormats(list)
  assert.equal(enabled.length, 13)
  assert.equal(enabled.some((f) => f.id === 'link'), false)
  assert.deepEqual(enabled.map((f) => f.id).slice(0, 3), ['bold', 'italic', 'strikethrough'])
})

test('isSelectionFormatId 只接受已知 id', () => {
  assert.equal(isSelectionFormatId('heading'), true)
  assert.equal(isSelectionFormatId('link'), true)
  assert.equal(isSelectionFormatId('heading4'), false)
  assert.equal(isSelectionFormatId(1), false)
})
