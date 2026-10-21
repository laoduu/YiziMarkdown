/**
 * DOCX 导出配色（lib/docxPalette.ts）的用例。
 *
 * 盯住三件事：
 *   · 暗色主题**不能**把亮色正文/近黑底色原样写进白底文档（v0.3.5 修复的导出不可读问题）
 *   · 输出必须是 `#rrggbb` —— Rust 侧只解析十六进制，`rgb()`/`var()` 会退成默认色
 *   · 半透明色要按白底合成，而不是当纯色写进 docx
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DOCX_LIGHT_FALLBACK,
  buildDocxPalette,
  darkenForWhite,
  parseCssColor,
  relativeLuminance,
  toHex,
} from '../src/lib/docxPalette.ts'

test('parseCssColor: 支持 #rgb / #rrggbb / rgb() / rgba()', () => {
  assert.deepEqual(parseCssColor('#abc'), { r: 170, g: 187, b: 204 })
  assert.deepEqual(parseCssColor('#0066CC'), { r: 0, g: 102, b: 204 })
  assert.deepEqual(parseCssColor('rgb(10, 20, 30)'), { r: 10, g: 20, b: 30 })
  assert.deepEqual(parseCssColor('rgba(255, 0, 0, 1)'), { r: 255, g: 0, b: 0 })
  // 无单位写法（主题里偶尔出现）
  assert.deepEqual(parseCssColor('rgb(1 2 3)'), { r: 1, g: 2, b: 3 })
})

test('parseCssColor: 半透明按白底合成，非法值返回 null', () => {
  // 50% 黑色叠加在白纸上 = 中灰（导出像素层面没有透明度）
  const half = parseCssColor('rgba(0,0,0,0.5)')
  assert.deepEqual(half, { r: 128, g: 128, b: 128 })
  assert.equal(parseCssColor(''), null)
  assert.equal(parseCssColor('var(--editor-text)'), null)
  assert.equal(parseCssColor('#12345'), null)
  assert.equal(parseCssColor('not-a-color'), null)
})

test('toHex / relativeLuminance 基本性质', () => {
  assert.equal(toHex({ r: 0, g: 102, b: 204 }), '#0066cc')
  // 越界分量会被夹到 0-255（免得 Rust 侧收到 3 位/非法 hex）
  assert.equal(toHex({ r: 255.4, g: -3, b: 300 }), '#ff00ff')
  assert.ok(relativeLuminance({ r: 0, g: 0, b: 0 }) < relativeLuminance({ r: 255, g: 255, b: 255 }))
  assert.ok(relativeLuminance({ r: 0, g: 255, b: 65 }) > 0.5, '荧光绿应是很亮的颜色')
})

test('darkenForWhite: 暗色不动、亮色压到白底可读且保持色相', () => {
  // 浅色主题的强调色本来就够暗 → 原样返回
  assert.equal(darkenForWhite('#0066cc'), '#0066cc')
  // matrix 的荧光绿：压暗后亮度达标
  const green = darkenForWhite('#00ff41')
  const lum = relativeLuminance(parseCssColor(green)!)
  assert.ok(lum <= 0.3 + 1e-6, `亮度过高: ${green} (${lum})`)
  assert.ok(lum > 0.05, `压得过暗、丢失主题色: ${green}`)
  // 色相仍是绿（G 通道远大于 R/B）
  const rgb = parseCssColor(green)!
  assert.ok(rgb.g > rgb.r && rgb.g > rgb.b, `绿色色相被破坏: ${green}`)
  // 纯白也能收敛（不会死循环）
  assert.ok(relativeLuminance(parseCssColor(darkenForWhite('#ffffff'))!) <= 0.3 + 1e-6)
  // 非法输入退回默认强调色
  assert.equal(darkenForWhite('var(--editor-accent)'), DOCX_LIGHT_FALLBACK.accent)
})

test('buildDocxPalette: 浅色主题原样归一化', () => {
  const p = buildDocxPalette({
    isDark: false,
    accent: '#0066cc',
    text: '#333333',
    surface: 'rgb(248, 248, 248)',
    border: '#e5e5e5',
  })
  assert.equal(p.text, '#333333')
  assert.equal(p.surface, '#f8f8f8')
  assert.equal(p.border, '#e5e5e5')
  // 本来就够暗的强调色原样保留（浅色主题不该被改动）
  assert.equal(p.accent, '#0066cc')
  // 但过亮的强调色（哪怕是浅色主题里配的）仍会被压暗到白底可读
  const pale = buildDocxPalette({
    isDark: false,
    accent: '#8ab4f8',
    text: '#333333',
    surface: '#f8f8f8',
    border: '#e5e5e5',
  })
  assert.ok(relativeLuminance(parseCssColor(pale.accent)!) <= 0.3 + 1e-6, `过亮强调色未压暗: ${pale.accent}`)
  assert.ok(parseCssColor(pale.accent)!.b > parseCssColor(pale.accent)!.r, '蓝色色相被破坏')
})

test('buildDocxPalette: 暗色主题换成白底等效色，强调色保色相', () => {
  const p = buildDocxPalette({
    isDark: true,
    // matrix 主题：荧光字 + 近黑底
    accent: '#00ff41',
    text: '#00ff41',
    surface: '#0a0a0a',
    border: '#111111',
  })
  // 正文/底色/边框不得沿用深色页面的取值
  assert.equal(p.text, DOCX_LIGHT_FALLBACK.text)
  assert.equal(p.surface, DOCX_LIGHT_FALLBACK.surface)
  assert.equal(p.border, DOCX_LIGHT_FALLBACK.border)
  // 强调色保留色相但压暗
  assert.notEqual(p.accent, '#00ff41')
  assert.ok(relativeLuminance(parseCssColor(p.accent)!) <= 0.3 + 1e-6)
  assert.ok(parseCssColor(p.accent)!.g > parseCssColor(p.accent)!.r)
})

test('buildDocxPalette: 非法/缺失输入一律给出可用十六进制（Rust 侧只认 hex）', () => {
  const p = buildDocxPalette({
    isDark: false,
    accent: 'var(--editor-cursor)',
    text: '',
    surface: 'currentColor',
    border: 'transparent',
  })
  for (const [k, v] of Object.entries(p)) {
    assert.match(v, /^#[0-9a-f]{6}$/, `${k} 不是 #rrggbb: ${v}`)
  }
  assert.equal(p.accent, DOCX_LIGHT_FALLBACK.accent)
  assert.equal(p.text, DOCX_LIGHT_FALLBACK.text)
  assert.equal(p.surface, DOCX_LIGHT_FALLBACK.surface)
  assert.equal(p.border, DOCX_LIGHT_FALLBACK.border)
})
