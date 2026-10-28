/**
 * 安装语言交接的归一化（lib/localeCode.ts）。
 *
 * 守两件事：
 *   1. 命令行/安装器给的写法（大小写、下划线、地区后缀）都能落到应用语言 id
 *   2. 白名单之外的一律 null —— 非法值写进设置会让语言下拉框选不中
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeLocaleId } from '../src/lib/localeCode.ts'

// 与 src/i18n/index.ts 的 LANGUAGES 一致的 15 种
const SUPPORTED = ['en', 'zh', 'zh-tw', 'ja', 'ko', 'de', 'fr', 'es', 'pt', 'it', 'pl', 'nl', 'tr', 'sv', 'uk']

test('应用自己的语言 id 原样通过', () => {
  for (const id of SUPPORTED) assert.equal(normalizeLocaleId(id, SUPPORTED), id)
})

test('大小写与下划线不影响结果', () => {
  assert.equal(normalizeLocaleId('JA', SUPPORTED), 'ja')
  assert.equal(normalizeLocaleId('zh_TW', SUPPORTED), 'zh-tw')
  assert.equal(normalizeLocaleId('De', SUPPORTED), 'de')
})

test('地区后缀折叠到应用语言（zh-CN / zh-Hant / pt-BR）', () => {
  assert.equal(normalizeLocaleId('zh-CN', SUPPORTED), 'zh')
  assert.equal(normalizeLocaleId('zh-Hans', SUPPORTED), 'zh')
  assert.equal(normalizeLocaleId('zh-HK', SUPPORTED), 'zh-tw')
  assert.equal(normalizeLocaleId('zh-Hant', SUPPORTED), 'zh-tw')
  assert.equal(normalizeLocaleId('pt-BR', SUPPORTED), 'pt')
  assert.equal(normalizeLocaleId('pt-PT', SUPPORTED), 'pt')
})

test('空白与空值不产生设置', () => {
  assert.equal(normalizeLocaleId('  ja  ', SUPPORTED), 'ja')
  assert.equal(normalizeLocaleId('', SUPPORTED), null)
  assert.equal(normalizeLocaleId('   ', SUPPORTED), null)
  assert.equal(normalizeLocaleId(null, SUPPORTED), null)
  assert.equal(normalizeLocaleId(undefined, SUPPORTED), null)
})

test('白名单之外的代码一律忽略（不猜语言）', () => {
  assert.equal(normalizeLocaleId('ru', SUPPORTED), null)
  assert.equal(normalizeLocaleId('zh-cn-x', SUPPORTED), null)
  assert.equal(normalizeLocaleId('nonsense', SUPPORTED), null)
})
