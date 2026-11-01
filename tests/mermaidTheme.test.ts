/**
 * mermaidTheme.test.ts — 主题 palette → Mermaid base themeVariables 的纯映射回归。
 *
 * 这里只测纯函数，不加载 Mermaid/DOM；保证「跟随应用主题」不会退回官方预设，
 * 且暗色/亮色都能给出可用的核心变量。
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { buildMermaidThemeVariables } from '../src/renderers/mermaidTheme.ts'
import { flattenColor, mixColor, type ThemePalette } from '../src/lib/themePalette.ts'

function palette(overrides: Partial<ThemePalette> = {}): ThemePalette {
  return {
    bg: '#ffffff',
    text: '#222222',
    accent: '#2563eb',
    surface: '#f4f6fb',
    border: '#d5dde8',
    secondaryText: '#5f6b7a',
    fontFamily: 'Segoe UI, sans-serif',
    fontMono: 'Consolas, monospace',
    isDark: false,
    ...overrides,
  }
}

test('Mermaid 主题：使用 base themeVariables，而不是官方 forest/neutral 预设', () => {
  const vars = buildMermaidThemeVariables(palette())
  assert.equal(vars.background, '#ffffff')
  assert.equal(vars.primaryTextColor, '#222222')
  assert.equal(vars.fontFamily, 'Segoe UI, sans-serif')
  assert.equal(vars.darkMode, false)
})

test('Mermaid 主题：暗色 palette 的 darkMode 与背景/文字同步', () => {
  const vars = buildMermaidThemeVariables(palette({
    bg: '#0a0f1e', text: '#cfd9ec', surface: '#121a30', border: '#2a3853', isDark: true,
  }))
  assert.equal(vars.darkMode, true)
  assert.equal(vars.background, '#0a0f1e')
  assert.equal(vars.primaryTextColor, '#cfd9ec')
})

test('主题色运算：混合与半透明合成稳定输出 hex', () => {
  assert.equal(mixColor('#000000', '#ffffff', 0), '#000000')
  assert.equal(mixColor('#000000', '#ffffff', 1), '#ffffff')
  assert.equal(flattenColor('rgba(0, 0, 0, 0.5)', '#ffffff'), '#808080')
})
