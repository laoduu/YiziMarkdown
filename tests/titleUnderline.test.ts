import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const css = fs.readFileSync(new URL('../src/styles/slideshow.css', import.meta.url), 'utf8')

test('标题装饰线：居中标题时线居中', () => {
  assert.match(
    css,
    /\.ys-slide\.ys-align-center h2::after\s*\{[^}]*left:\s*50%;[^}]*transform:\s*translateX\(-50%\);/s,
  )
})

test('标题装饰线：居右标题时线贴右并反向渐变', () => {
  assert.match(
    css,
    /\.ys-slide\.ys-align-right h2::after\s*\{[^}]*left:\s*auto;[^}]*right:\s*0;[^}]*linear-gradient\(270deg, var\(--editor-accent, #4f46e5\), transparent\);/s,
  )
})
