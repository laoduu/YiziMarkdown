/** 主题卡片预览样式生成（`src/lib/themePreview.ts`）。 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildThemePreviewCss } from '../src/lib/themePreview.ts'

test('抽出亮/暗两块令牌，作用域改写到卡片属性', () => {
  const css = `
    /* 主题说明 */
    :root.theme-tech {
      --editor-bg: #0a0e27;
      --editor-text: #cbd5e1;
    }
    :root.theme-tech.dark {
      --editor-bg: #05070f;
    }
    .theme-tech h1 { color: red }
  `
  const out = buildThemePreviewCss([{ key: 'tech', css }])
  assert.match(out, /data-theme-preview="tech"/)
  assert.match(out, /:not\(\.is-dark\)\{--editor-bg: #0a0e27;/)
  assert.match(out, /\.is-dark\{--editor-bg: #05070f;/)
  // 元素规则不能带进卡片
  assert.ok(!out.includes('h1'))
  // 注释剥离
  assert.ok(!out.includes('主题说明'))
})

test('多个主题各自独立、互不串色', () => {
  const out = buildThemePreviewCss([
    { key: 'tech', css: ':root.theme-tech { --editor-bg: #000 }' },
    { key: 'mint', css: ':root.theme-mint { --editor-bg: #fff }' },
  ])
  assert.equal(out.split('\n').length, 2)
  assert.match(out, /data-theme-preview="tech"/)
  assert.match(out, /data-theme-preview="mint"/)
})

test('同一主题的多个亮色块会合并（部分主题分多段声明）', () => {
  const css = `
    :root.theme-x { --a: 1 }
    :root.theme-x { --b: 2 }
  `
  const out = buildThemePreviewCss([{ key: 'x', css }])
  assert.match(out, /--a: 1/)
  assert.match(out, /--b: 2/)
})

test('不含主题块的 CSS 不产出规则', () => {
  const out = buildThemePreviewCss([
    { key: 'x', css: '.theme-x h1 { color: red }' },
    { key: 'y', css: ':root { --a: 1 }' },
    { key: '', css: ':root.theme-z { --a: 1 }' },
  ])
  assert.equal(out, '')
})

test('花括号不能逃逸卡片作用域', () => {
  const out = buildThemePreviewCss([
    { key: 'x', css: ':root.theme-x { --a: 1 } body { display: none } }' },
  ])
  assert.ok(!out.includes('body'))
  // 逃逸的花括号被剥掉，规则仍是单个块
  assert.equal(out.split('{').length - 1, 1)
})

test('作用域键里的引号被转义', () => {
  const out = buildThemePreviewCss([{ key: 'a"b', css: ':root.theme-x { --a: 1 }' }])
  assert.match(out, /data-theme-preview="a\\"b"/)
})
