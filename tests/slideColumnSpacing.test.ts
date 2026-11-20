/**
 * 分栏页「栏区 ↔ 栏外文案」间距的样式闸门（issue #19）。
 *
 * 为什么值得一条单测：`.ys-slide p` 刻意只写下边距、`.ys-has-cols` 又把 flex gap
 * 归零，栏区后面的落款完全靠 `.ys-cols + .ys-col-aside` 这一条补间距。规则被删掉
 * 或 token 被换成写死数值，都会让「落款贴卡片底边」悄悄回归，而 PPTX 导出只是
 * 忠实复制浏览器布局 —— 导出侧的断言兜不住。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/styles/slideshow.css', import.meta.url), 'utf8')
/** 去掉换行与多余空白：选择器组常被格式化成多行，先拍平再匹配 */
const flat = css.replace(/\s*\n\s*/g, ' ').replace(/[ \t]+/g, ' ')

/** 取某个选择器对应的第一条规则体 */
function ruleBody(selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(flat)
  return m ? m[1] : null
}

test('紧跟在分栏区后的栏外文案有上边距', () => {
  const body = ruleBody('.ys-slide.ys-has-cols > .ys-cols + .ys-col-aside')
  assert.ok(body, '缺少 .ys-cols + .ys-col-aside 的间距规则')
  assert.match(body!, /margin-top:\s*var\(--ys-gap-md\)/, '上边距应复用正文块间距 token')
})

test('间距 token 与正文块的下边距同源', () => {
  const body = ruleBody('.ys-slide p, .ys-slide ul, .ys-slide ol, .ys-slide blockquote')
  assert.ok(body, '缺少正文块的下边距规则')
  assert.match(body!, /margin:\s*0 0 var\(--ys-gap-md\)/, '正文块仍应只用下边距')
})

test('分栏页仍然把 flex gap 归零（间距只由 margin 提供）', () => {
  assert.match(css, /\.ys-slide\.ys-has-cols\s*\{[^}]*gap:\s*0/, '分栏页的 gap: 0 是间距模型的前提')
})
