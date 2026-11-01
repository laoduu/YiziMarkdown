/**
 * pluginRegistry.test.ts — 内置插件注册/能力声明回归。
 *
 * 当前 v1 只支持编译进应用的插件；EPUB 通过 manifest.capabilities.exportFormats
 * 声明导出能力，工具栏据此动态显示，而不是在 App 里硬编码 epub。
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { getAllPlugins, getEnabledExporters, getPluginById, isPluginActive } from '../src/plugins/registry.ts'

test('插件注册：数学/Mermaid 不再出现在插件列表', () => {
  const ids = getAllPlugins().map((p) => p.id)
  assert.ok(!ids.includes('katex'))
  assert.ok(!ids.includes('mermaid'))
  assert.deepEqual(ids, ['epub'])
})

test('插件注册：EPUB manifest 声明导出能力与权限', () => {
  const epub = getPluginById('epub')
  assert.ok(epub)
  assert.equal(epub!.manifest.apiVersion, 1)
  assert.deepEqual(epub!.manifest.capabilities.exportFormats, ['epub'])
  assert.ok(epub!.manifest.permissions.includes('export'))
  assert.equal(isPluginActive('epub'), false)
})

test('插件导出：只有启用后才暴露导出格式', () => {
  assert.deepEqual(getEnabledExporters([]), [])
  const exporters = getEnabledExporters(['epub'])
  assert.equal(exporters.length, 1)
  assert.equal(exporters[0].format, 'epub')
  assert.equal(exporters[0].labelKey, 'toolbar.exportEpub')
})
