/**
 * slideTypography.test.ts — 演示排版旋钮（字体/字重/字号/页边距）的纯函数测试。
 *
 * 运行方式：npm test（node --test，Node 原生 TS 类型剥离，无额外依赖）。
 * 注意：被测模块必须零依赖，import 需带显式 .ts 后缀
 * （见 tests/remotePath.test.ts 头部说明）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  slideTypographyVars, clampNumber, isSlideFontId,
  SLIDE_FONT_STACKS, SLIDE_FONT_SCALE, SLIDE_FILL, DEFAULT_SLIDE_TYPOGRAPHY,
} from '../src/lib/slideTypography.ts'

// ---------- slideTypographyVars ----------

test('slideTypographyVars: 默认值不产出任何变量（保持加入旋钮前的 DOM）', () => {
  assert.deepEqual(slideTypographyVars(DEFAULT_SLIDE_TYPOGRAPHY), {})
  assert.deepEqual(slideTypographyVars({}), {})
})

test('slideTypographyVars: 字体 default 不写变量（交回主题/预览字体）', () => {
  assert.deepEqual(slideTypographyVars({ fontFamily: 'default' }), {})
})

test('slideTypographyVars: 非默认值逐项产出', () => {
  assert.deepEqual(
    slideTypographyVars({ fontFamily: 'mono', fontWeight: 600, fontScale: 1.25, fillWidth: 60, fillHeight: 70 }),
    {
      '--ys-font-family': SLIDE_FONT_STACKS.mono,
      '--ys-font-weight': '600',
      '--ys-font-scale': '1.25',
      '--ys-fill-w': '0.6',
      '--ys-fill-h': '0.7',
    }
  )
})

test('slideTypographyVars: 填充比例以小数下发（百分数 ÷ 100）', () => {
  assert.equal(slideTypographyVars({ fillWidth: 95 })['--ys-fill-w'], '0.95')
  assert.equal(slideTypographyVars({ fillWidth: 50 })['--ys-fill-w'], '0.5')
  assert.equal(slideTypographyVars({ fillHeight: 84 })['--ys-fill-h'], undefined) // 84 = 默认，不产出
})

test('slideTypographyVars: 越界收敛到区间端点', () => {
  assert.equal(slideTypographyVars({ fontScale: 99 })['--ys-font-scale'], String(SLIDE_FONT_SCALE.max))
  // 填充比例收敛到 50 / 95（百分数）→ 0.5 / 0.95（小数）
  assert.equal(slideTypographyVars({ fillWidth: 999 })['--ys-fill-w'], String(SLIDE_FILL.max / 100))
  assert.equal(slideTypographyVars({ fillWidth: 1 })['--ys-fill-w'], String(SLIDE_FILL.min / 100))
  assert.equal(slideTypographyVars({ fillHeight: -5 })['--ys-fill-h'], String(SLIDE_FILL.min / 100))
  assert.equal(slideTypographyVars({ fontWeight: 9999 })['--ys-font-weight'], '900')
})

test('slideTypographyVars: 脏值回落到默认（不产出变量）', () => {
  assert.deepEqual(slideTypographyVars({ fontWeight: NaN }), {})
  assert.deepEqual(slideTypographyVars({ fontFamily: 'comic' as never }), {})
  assert.deepEqual(slideTypographyVars({ fontScale: 'abc' as never }), {})
  assert.deepEqual(slideTypographyVars({ fillWidth: undefined }), {})
  assert.deepEqual(slideTypographyVars({ fillHeight: 'abc' as never }), {})
  assert.deepEqual(slideTypographyVars({ fillWidth: null as never }), {})
})

// ---------- clampNumber / isSlideFontId ----------

test('clampNumber: 缺失/非数值回落 fallback，否则夹在区间内', () => {
  assert.equal(clampNumber(undefined, 0, 10, 5), 5)
  // null 经 Number() 会变成 0（合法数值）—— 必须回落默认值而不是归零
  assert.equal(clampNumber(null, 0, 10, 5), 5)
  assert.equal(clampNumber('', 0, 10, 5), 5)
  assert.equal(clampNumber('  ', 0, 10, 5), 5)
  assert.equal(clampNumber(true, 0, 10, 5), 5)
  assert.equal(clampNumber({}, 0, 10, 5), 5)
  assert.equal(clampNumber('abc', 0, 10, 5), 5)
  assert.equal(clampNumber(NaN, 0, 10, 5), 5)
  assert.equal(clampNumber(Infinity, 0, 10, 5), 5)
  assert.equal(clampNumber(12, 0, 10, 5), 10)
  assert.equal(clampNumber(-1, 0, 10, 5), 0)
  assert.equal(clampNumber(7, 0, 10, 5), 7)
  // 数字字符串也算有效值（localStorage 里可能是字符串）
  assert.equal(clampNumber('7', 0, 10, 5), 7)
  assert.equal(clampNumber('12', 0, 10, 5), 10)
})

test('isSlideFontId: 只认枚举值', () => {
  assert.equal(isSlideFontId('serif'), true)
  assert.equal(isSlideFontId('default'), true)
  assert.equal(isSlideFontId('comic'), false)
  assert.equal(isSlideFontId(undefined), false)
  assert.equal(isSlideFontId(42), false)
})
