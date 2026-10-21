/**
 * 任务列表渲染用例（预览侧）。
 *
 * 回归：`markdown-it-task-lists` 在 `labelAfter: true` 模式下，会把 `token.content`
 * （**原始 Markdown 文本**，含反引号与 `**`）塞进一个额外的 `<label for=…>`，而已渲染好的行内
 * 内容仍留在原处 —— 于是「带 `行内代码` 与 **加粗** 的任务」在预览里**重复出现两遍**
 * （第二遍是没渲染的源码），并且两个行内块在 flex 布局里各成一个 flex 项，宽度不足时被逐个
 * 挤压成「行内硬换行」。改用 `labelAfter: false`（label 包住勾选框 + 内容）后：
 *   · 内容只出现一次，反引号/星号不泄漏到预览；
 *   · 容器内只有一个子项，换行按普通文本在容器边缘折行。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderMarkdown } from '../src/lib/markdownRenderer.ts'

const SRC = '- [x] 带 `行内代码` 与 **加粗** 的任务\n'

test('任务项的行内内容只渲染一次（不追加原始 Markdown 文本）', () => {
  const html = renderMarkdown(SRC)
  // 行内代码只出现一次，且没有第二份「反引号原文」
  assert.equal((html.match(/行内代码/g) || []).length, 1, html)
  assert.ok(!html.includes('`行内代码`'), `预览泄漏了原始 Markdown 反引号：${html}`)
  assert.ok(!html.includes('**加粗**'), `预览泄漏了原始 Markdown 星号：${html}`)
  // 加粗正常生效
  assert.match(html, /<strong>加粗<\/strong>/)
  assert.match(html, /<code>行内代码<\/code>/)
})

test('勾选框与任务文本同在一个 label 内（避免行内元素各成 flex 项）', () => {
  const html = renderMarkdown(SRC)
  assert.match(html, /<li class="task-list-item[^"]*"[^>]*><label><input[^>]*type="checkbox"[^>]*>[\s\S]*<\/label><\/li>/, html)
  // 回归：不得再出现「渲染内容 + 追加的 label」两段式结构
  assert.ok(!/<\/strong>[^<]*<label/.test(html), `仍存在追加式的第二个 label：${html}`)
})

test('纯文本任务项仍然渲染为可点击的 label', () => {
  const html = renderMarkdown('- [ ] 未完成的任务\n')
  assert.match(html, /<li class="task-list-item[^"]*"[^>]*><label><input[^>]*type="checkbox"[^>]*>\s*未完成的任务<\/label><\/li>/, html)
  assert.equal((html.match(/未完成的任务/g) || []).length, 1, html)
})

test('非任务列表项不产生 label 包裹', () => {
  const html = renderMarkdown('- 普通项目\n')
  assert.ok(!html.includes('<label'), html)
})
