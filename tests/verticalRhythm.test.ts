import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const css = fs.readFileSync(new URL('../src/styles/slideshow.css', import.meta.url), 'utf8')

function rule(selector: string): string {
  const start = css.indexOf(selector)
  assert.ok(start >= 0, `未找到选择器：${selector}`)
  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)
  return css.slice(open + 1, close)
}

test('垂直节奏：正文字号基准与间距令牌存在', () => {
  const slide = rule('.ys-slide {\n  position: absolute;')
  assert.match(slide, /--ys-u:\s*clamp\(/)
  assert.match(slide, /--ys-gap-sm:\s*calc\(0\.55 \* var\(--ys-u\)\)/)
  assert.match(slide, /--ys-gap-md:\s*calc\(0\.7 \* var\(--ys-u\)\)/)
})

test('垂直节奏：代码块 / 表格 / 分隔线使用同一间距令牌', () => {
  for (const selector of ['.ys-slide pre {', '.ys-slide table {', '.ys-slide hr {']) {
    assert.match(rule(selector), /margin:\s*var\(--ys-gap-md\) 0/, selector)
  }
})

test('垂直节奏：正文块不再按自身 em 解析垂直 margin', () => {
  const body = rule('.ys-slide p,\n.ys-slide ul,\n.ys-slide ol,\n.ys-slide blockquote {')
  assert.match(body, /margin:\s*var\(--ys-gap-md\) 0/)
})

test('垂直节奏：标题上下间距按正文基准，不随标题字号放大', () => {
  for (const level of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
    assert.match(rule(`.ys-slide ${level} {`), /margin:.*var\(--ys-u\)/, level)
  }
})
