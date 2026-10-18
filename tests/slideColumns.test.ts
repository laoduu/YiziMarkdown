// 演示模式「分栏对齐 / 分栏样式」的纯函数单测（node --test 直跑，见 package.json）。
// 运行：node --experimental-transform-types --test tests/slideColumns.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SLIDE_COL_ALIGNS, SLIDE_COL_STYLES,
  DEFAULT_SLIDE_COL_ALIGN, DEFAULT_SLIDE_COL_STYLE,
  isSlideColAlign, isSlideColStyle,
  resolveColAlign, colAlignClass, colStyleClass,
} from '../src/lib/slideColumns.ts'

// ---------- 枚举与默认值 ----------

test('枚举：三种对齐 / 三种样式，默认值分别是 left / card', () => {
  assert.deepEqual(SLIDE_COL_ALIGNS, ['left', 'center', 'right'])
  assert.deepEqual(SLIDE_COL_STYLES, ['none', 'line', 'card'])
  // 对齐默认 left = 零变化（无对应 CSS 规则）；
  // 样式默认 card = **有意的**默认观感升级（卡片是这组旋钮的价值所在，藏起来等于没做）
  assert.equal(DEFAULT_SLIDE_COL_ALIGN, 'left')
  assert.equal(DEFAULT_SLIDE_COL_STYLE, 'card')
})

test('isSlideColAlign / isSlideColStyle 只认枚举值', () => {
  assert.ok(isSlideColAlign('left') && isSlideColAlign('center') && isSlideColAlign('right'))
  assert.ok(!isSlideColAlign('justify') && !isSlideColAlign('') && !isSlideColAlign(null) && !isSlideColAlign(1))
  assert.ok(isSlideColStyle('none') && isSlideColStyle('line') && isSlideColStyle('card'))
  assert.ok(!isSlideColStyle('cards') && !isSlideColStyle('') && !isSlideColStyle(undefined) && !isSlideColStyle(0))
})

// ---------- resolveColAlign：页级覆盖 HUD ----------

test('resolveColAlign: 未写页级指令时用 HUD 值', () => {
  assert.equal(resolveColAlign('center'), 'center')
  assert.equal(resolveColAlign('right', undefined), 'right')
})

test('resolveColAlign: 合法页级值覆盖 HUD（作者意图优先）', () => {
  assert.equal(resolveColAlign('center', 'left'), 'left')
  assert.equal(resolveColAlign('left', 'center'), 'center')
  assert.equal(resolveColAlign('left', 'right'), 'right')
})

test('resolveColAlign: 非法页级值回落 HUD（与 extractDirectives 的忽略语义一致）', () => {
  assert.equal(resolveColAlign('right', 'justify'), 'right')
  assert.equal(resolveColAlign('center', ''), 'center')
  assert.equal(resolveColAlign('center', ' CENTER '), 'center')  // 注意：本函数不做 trim/大小写归一
  assert.equal(resolveColAlign('center', null as unknown as string), 'center')
})

test('resolveColAlign: HUD 本身被手改成垃圾值时收敛到默认 left', () => {
  assert.equal(resolveColAlign('nope' as never, undefined), 'left')
  assert.equal(resolveColAlign('nope' as never, 'bogus'), 'left')
})

// ---------- class 命名（CSS 侧的选择器按这两套名字写，改名会同时打断两端） ----------

test('colAlignClass：一律产出 class（左对齐虽无 CSS 规则，但保持选择器对称、可 grep）', () => {
  assert.equal(colAlignClass('left'), 'ys-col-align-left')
  assert.equal(colAlignClass('center'), 'ys-col-align-center')
  assert.equal(colAlignClass('right'), 'ys-col-align-right')
})

test('colStyleClass：只有显式的 none 才不产出 class；默认值（card）产出卡片 class', () => {
  assert.equal(colStyleClass(DEFAULT_SLIDE_COL_STYLE), 'ys-col-style-card')
  assert.equal(colStyleClass('card'), 'ys-col-style-card')
  assert.equal(colStyleClass('line'), 'ys-col-style-line')
  // 'none' = 用户主动要回无参照的旧观感 ⇒ 不挂任何 class，回落到基础样式
  assert.equal(colStyleClass('none'), '')
})
