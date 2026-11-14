import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const css = fs.readFileSync(new URL('../src/styles/slideshow.css', import.meta.url), 'utf8')
const slideshow = fs.readFileSync(new URL('../src/components/Slideshow.tsx', import.meta.url), 'utf8')

test('演示模式：1280×720 固定画布 + 整体缩放', () => {
  assert.match(css, /\.ys-stage\s*\{[^}]*position:\s*fixed;[^}]*overflow:\s*hidden;/s)
  assert.match(css, /\.ys-stage\s*\{[^}]*background:\s*var\(--editor-bg, #ffffff\);/s)
  assert.match(css, /\.ys-canvas\s*\{[^}]*width:\s*1280px;[^}]*height:\s*720px;/s)
  assert.match(css, /\.ys-canvas\s*\{[^}]*overflow:\s*hidden;/s)

  assert.match(slideshow, /className="ys-stage" ref=\{stageRef\}/)
  assert.match(slideshow, /className="ys-canvas"/)
  assert.match(slideshow, /Math\.min\(w \/ 1280, h \/ 720\)/)
})

test('演示模式：字号基准为画布的 1.8%（23.04px），标题由同一基准派生', () => {
  assert.match(css, /--ys-u:\s*calc\(23\.04px \* var\(--ys-font-scale, 1\)\)/)
  assert.match(css, /font-size:\s*var\(--ys-u\)/)
  assert.match(css, /--ys-page-title-size:\s*calc\(2 \* var\(--ys-u\)\)/)
  assert.match(css, /--ys-title-h1-size:\s*calc\(2\.4 \* var\(--ys-u\)\)/)
  assert.match(css, /--ys-title-cover-size:\s*calc\(3\.84 \* var\(--ys-u\)\)/)
})

test('演示模式：幻灯片内容不再依赖真实视口单位（HUD / 备注除外）', () => {
  const slide = css.slice(css.indexOf('.ys-slide {'), css.indexOf('.ys-slide.ys-active'))
    .replace(/\/\*[\s\S]*?\*\//g, '')
  assert.doesNotMatch(slide, /\dvw/)
  assert.doesNotMatch(slide, /\dvh/)
  assert.match(slide, /padding:\s*calc\(360px \* \(1 - var\(--ys-fill-h, 0\.84\)\)\) calc\(640px \* \(1 - var\(--ys-fill-w, 0\.82\)\)\)/)
})
