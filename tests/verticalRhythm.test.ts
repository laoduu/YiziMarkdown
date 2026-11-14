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
  assert.match(slide, /--ys-u:\s*calc\(23\.04px \* var\(--ys-font-scale, 1\)\)/)
  assert.match(slide, /--ys-gap-sm:\s*calc\(0\.55 \* var\(--ys-u\)\)/)
  assert.match(slide, /--ys-gap-md:\s*calc\(0\.7 \* var\(--ys-u\)\)/)
})

test('垂直节奏：代码块 / 表格 / 分隔线使用同一边距令牌', () => {
  for (const selector of ['.ys-slide pre {', '.ys-slide table {', '.ys-slide hr {']) {
    assert.match(rule(selector), /margin:\s*0 0 var\(--ys-gap-md\)/, selector)
  }
})

test('垂直节奏：正文块只写 bottom margin，避免 flex 相加 / block 折叠差异', () => {
  const body = rule('.ys-slide p,\n.ys-slide ul,\n.ys-slide ol,\n.ys-slide blockquote {')
  assert.match(body, /margin:\s*0 0 var\(--ys-gap-md\)/)
  assert.doesNotMatch(body, /margin:\s*var\(--ys-gap-md\) 0/)
})

test('垂直节奏：标题下边距补偿正文顶部 margin（0.7u）', () => {
  const expected = {
    h1: '2.1', h2: '1.7', h3: '1.3', h4: '1.2', h5: '1.05', h6: '1.0',
  }
  for (const [level, factor] of Object.entries(expected)) {
    const margin = rule(`.ys-slide ${level} {`).match(/margin:\s*[^;]+;/)?.[0] || ''
    assert.ok(margin.includes(`calc(${factor} * var(--ys-u))`), `${level}: ${margin}`)
  }
})
