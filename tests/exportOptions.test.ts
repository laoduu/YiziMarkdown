/**
 * 导出弹窗「记住上次选择」的取值规则。
 *
 * 背景：DOCX / PPTX / EPUB 导出弹窗的勾选项需要跨次持久化；
 * 插件导出的字段类型很杂，只有偏好型的 checkbox / select 该记，
 * 文本类（书名、作者）跟随当前文档，不能跨文档记忆。
 * 同时要防止插件升级后选项改名 / 删除，把旧值塞回受控下拉导致空白。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  exportOptionsStoreKey,
  isRememberedExportField,
  rememberedExportValue,
} from '../src/lib/exportOptions.ts'
import type { PluginConfigField } from '../src/plugins/types.ts'

function field(overrides: Partial<PluginConfigField>): PluginConfigField {
  return { key: 'k', label: 'K', type: 'checkbox', defaultValue: true, ...overrides }
}

test('存档键按 插件:格式 分组', () => {
  assert.equal(exportOptionsStoreKey('epub', 'epub'), 'epub:epub')
  assert.equal(exportOptionsStoreKey('plantuml', 'svg'), 'plantuml:svg')
})

test('只记住 checkbox 与 select', () => {
  assert.equal(isRememberedExportField(field({ type: 'checkbox' })), true)
  assert.equal(isRememberedExportField(field({ type: 'select' })), true)
  assert.equal(isRememberedExportField(field({ type: 'text' })), false)
  assert.equal(isRememberedExportField(field({ type: 'number' })), false)
})

test('checkbox 只接受布尔值', () => {
  const f = field({ type: 'checkbox' })
  assert.equal(rememberedExportValue(f, true), true)
  assert.equal(rememberedExportValue(f, false), false)
  assert.equal(rememberedExportValue(f, 'true'), undefined)
  assert.equal(rememberedExportValue(f, 1), undefined)
  assert.equal(rememberedExportValue(f, null), undefined)
})

test('select 只接受仍然存在的选项', () => {
  const f = field({
    type: 'select',
    defaultValue: 'auto',
    options: [
      { value: 'auto', label: 'Auto' },
      { value: 'h1', label: 'H1' },
    ],
  })
  assert.equal(rememberedExportValue(f, 'h1'), 'h1')
  // 旧版本删掉的选项 / 手改存档写入的非法值：回落默认
  assert.equal(rememberedExportValue(f, 'removed-option'), undefined)
  assert.equal(rememberedExportValue(f, 42), undefined)
})

test('文本与数字字段即使存档里有值也不采用', () => {
  assert.equal(rememberedExportValue(field({ type: 'text' }), '上一次的书名'), undefined)
  assert.equal(rememberedExportValue(field({ type: 'number' }), 12), undefined)
})
