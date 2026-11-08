/**
 * readerAnimation.test.ts — 阅读模式翻页动画清单的单元测试。
 *
 * 守住三件事：
 *   1. 默认动画是「书卷翻页」（改动前的唯一行为，不能因为加菜单被换掉）；
 *   2. 菜单里的每个动画都有 i18n 键，且 id 不重复（否则选了会回退成空白）；
 *   3. JS 动画时长与 reader.css 的 keyframes 时长同步（改了一处忘了另一处会闪一下）。
 *
 * 运行方式：npm test（node --test，Node 原生 TS 类型剥离，无额外依赖）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  DEFAULT_READER_ANIM, READER_ANIMS, READER_ANIM_I18N, READER_MOTION_MS, isReaderAnim,
} from '../src/lib/readerAnimation.ts'

test('默认动画是水平滑动，且排在菜单第一项', () => {
  assert.equal(DEFAULT_READER_ANIM, 'slide')
  assert.equal(READER_ANIMS[0], 'slide')
  assert.ok(READER_ANIMS.includes(DEFAULT_READER_ANIM))
})

test('每个动画都有 i18n 键，id 与键都不重复', () => {
  assert.equal(READER_ANIMS.length, new Set(READER_ANIMS).size)
  const keys = READER_ANIMS.map((id) => READER_ANIM_I18N[id])
  assert.equal(keys.length, new Set(keys).size)
  for (const key of keys) assert.match(key, /^[a-z]+\.[A-Za-z]\w+$/)
})

test('isReaderAnim 只认已知 id', () => {
  for (const id of READER_ANIMS) assert.equal(isReaderAnim(id), true)
  for (const bad of ['', 'cube', 'none', null, undefined, 1]) assert.equal(isReaderAnim(bad), false)
})

test('JS 动画时长与 reader.css 保持一致', () => {
  const css = readFileSync(new URL('../src/styles/reader.css', import.meta.url), 'utf8')
  const seconds = `${READER_MOTION_MS / 1000}s`
  const section = css.slice(css.indexOf('非 3D 翻页动画'))
  assert.ok(section.length > 0, '找不到非 3D 翻页动画的样式段')
  const durations = [...section.matchAll(/animation:\s*[^;]*?([\d.]+s)/g)].map((m) => m[1])
  assert.ok(durations.length >= 3, '三种非 3D 动画都应有 animation 声明')
  for (const d of durations) assert.equal(d, seconds)
})
