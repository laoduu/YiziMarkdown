/** 主题默认项与展示顺序（`src/lib/themeOrder.ts`）：默认主题排列表首位。 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_THEME, orderThemes } from '../src/lib/themeOrder.ts'

test('orderThemes: 默认主题挪到首位，其余保持原序', () => {
  const files = ['academic.css', `${DEFAULT_THEME}.css`, 'lychee.css', 'violet.css']
  assert.deepEqual(orderThemes(files), [`${DEFAULT_THEME}.css`, 'academic.css', 'lychee.css', 'violet.css'])
})

test('orderThemes: 默认主题已在首位时不改动', () => {
  const files = [`${DEFAULT_THEME}.css`, 'academic.css']
  assert.deepEqual(orderThemes(files), files)
})

test('orderThemes: 默认主题不在列表里（或列表为空）时原样返回', () => {
  assert.deepEqual(orderThemes(['academic.css', 'violet.css']), ['academic.css', 'violet.css'])
  assert.deepEqual(orderThemes([]), [])
})

test('DEFAULT_THEME 的 .css 文件在主题目录里存在', async () => {
  const { existsSync } = await import('node:fs')
  const { join, dirname } = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src-tauri', 'themes')
  // 这条能兜住"改了 DEFAULT_THEME 名字却漏了主题文件"这类手误
  assert.ok(existsSync(join(root, `${DEFAULT_THEME}.css`)), `缺少主题文件 src-tauri/themes/${DEFAULT_THEME}.css`)
})
