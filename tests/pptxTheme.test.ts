/**
 * pptxTheme 颜色解析回归测试。
 *
 * 关键回归：Chrome 对普通颜色（hex / 命名色 / hsl）的 computed value 一律输出
 * **逗号分隔**的 `rgb(r, g, b)`；早先的实现按空白切通道，导致最常见的写法解析失败，
 * flattenColor 静默退化成 `000000` —— 导出的 PPTX 变成「黑底黑字」整页空白。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { flattenColor, parseColor, hexOf } from '../src/lib/pptxTheme.ts'

test('pptxTheme: 逗号分隔的 rgb() / rgba() 是 Chrome computed value 的常态', () => {
  assert.deepEqual(parseColor('rgb(245, 248, 255)'), { r: 245, g: 248, b: 255, a: 1 })
  assert.deepEqual(parseColor('rgba(26, 58, 122, 0.5)'), { r: 26, g: 58, b: 122, a: 0.5 })
  // 无空格变体
  assert.deepEqual(parseColor('rgb(1,2,3)'), { r: 1, g: 2, b: 3, a: 1 })
})

test('pptxTheme: 空格 / 斜杠语法（现代 rgb 写法）', () => {
  assert.deepEqual(parseColor('rgb(1 2 3)'), { r: 1, g: 2, b: 3, a: 1 })
  assert.deepEqual(parseColor('rgb(1 2 3 / 50%)'), { r: 1, g: 2, b: 3, a: 0.5 })
  assert.deepEqual(parseColor('rgb(1 2 3 / 0.25)'), { r: 1, g: 2, b: 3, a: 0.25 })
})

test('pptxTheme: 百分比通道', () => {
  assert.deepEqual(parseColor('rgb(100%, 50%, 0%)'), { r: 255, g: 128, b: 0, a: 1 })
})

test('pptxTheme: hex / transparent / color(srgb) / 非法值', () => {
  assert.deepEqual(parseColor('#f5f8ff'), { r: 245, g: 248, b: 255, a: 1 })
  assert.deepEqual(parseColor('#abc'), { r: 170, g: 187, b: 204, a: 1 })
  assert.deepEqual(parseColor('transparent'), { r: 0, g: 0, b: 0, a: 0 })
  assert.deepEqual(parseColor('color(srgb 0.96 0.97 1)'), { r: 245, g: 247, b: 255, a: 1 })
  assert.equal(parseColor('not-a-color'), null)
  assert.equal(parseColor(''), null)
})

test('pptxTheme: flattenColor 把半透明前景合成到背景上', () => {
  // 50% 黑压在白底 = 中性灰
  assert.equal(flattenColor('rgba(0, 0, 0, 0.5)', '#FFFFFF'), '808080')
  // 不透明前景不受背景影响
  assert.equal(flattenColor('rgb(245, 248, 255)', '#000000'), 'F5F8FF')
  // 主题浅色背景 + 深色正文（真实 computed value 形态）
  assert.equal(flattenColor('rgb(26, 26, 46)', 'rgb(245, 248, 255)'), '1A1A2E')
})

test('pptxTheme: 无 # 的 6/8 位 hex（flattenColor 自己的产物）也能解析', () => {
  // 回归：flattenColor(color, bg) 的 bg 常常是本模块刚刚产出的 '0D1117'。
  // 若这里解析不出来，bg 会退回白色，暗色主题的半透明叠色就全错了。
  assert.deepEqual(parseColor('0d1117'), { r: 13, g: 17, b: 23, a: 1 })
  assert.deepEqual(parseColor('F5F8FF'), { r: 245, g: 248, b: 255, a: 1 })
  assert.equal(parseColor('ff000080')?.a, 128 / 255)
})

test('pptxTheme: 半透明叠色合成到暗色底（表格行条纹）', () => {
  // color-mix(in srgb, accent 6%, transparent) 在 Chrome 下的 computed value
  const stripe = 'color(srgb 0.352941 0.486275 0.890196 / 0.06)'
  const overDark = flattenColor(stripe, '0D1117')
  const overWhite = flattenColor(stripe, 'FFFFFF')
  assert.notEqual(overDark, overWhite)
  // 6% 蓝压在 #0d1117 上只应略微提亮，绝不该变成浅色
  const rgb = parseColor(overDark)
  assert.ok(rgb && rgb.r < 40 && rgb.g < 40 && rgb.b < 60, overDark)
})

test('pptxTheme: hexOf 输出 6 位大写', () => {
  assert.equal(hexOf({ r: 0, g: 127, b: 255, a: 1 }), '007FFF')
})

