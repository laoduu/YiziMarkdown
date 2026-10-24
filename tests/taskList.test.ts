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
import { isTaskLine, toggleTaskAtLine, toggleTaskLine } from '../src/lib/taskList.ts'

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

// ---- 混合语法专项：预览点击必须按行回写，不能靠 textContent 全等匹配 ----

const MIXED = [
  '- [ ] 含 **加粗**',
  '* [x] 含 `行内代码` 与 $E=mc^2$',
  '  - [ ] 嵌套 /标签 <sup>2</sup>',
  '- [ ] 重复文案',
  '- [ ] 重复文案',
].join('\n') + '\n'

test('每个任务项都带正确的 data-source-line（混合语法/嵌套/重复文案）', () => {
  const html = renderMarkdown(MIXED)
  const lines = Array.from(html.matchAll(/<li class="task-list-item[^"]*"[^>]*data-source-line="(\d+)"/g)).map((m) => Number(m[1]))
  assert.deepEqual(lines, [1, 2, 3, 4, 5], html)
})

test('行内公式经过 KaTeX 渲染后文本已变，但按行号仍能精确回写', () => {
  const html = renderMarkdown(MIXED)
  // 公式所在行（第 2 行）确实带 data-source-line
  assert.match(html, /data-source-line="2"/)
  const next = toggleTaskAtLine(MIXED, 2, false)
  assert.ok(next)
  assert.match(next, /^\* \[ \] 含 `行内代码` 与 \$E=mc\^2\$/m, next)
  assert.match(next, /^- \[ \] 含 \*\*加粗\*\*$/m, next)
})

test('重复文案按行号互不串行（旧实现会永远改到第一行）', () => {
  const next = toggleTaskAtLine(MIXED, 5, true)
  assert.ok(next)
  const rows = next.trimEnd().split('\n')
  assert.equal(rows[3], '- [ ] 重复文案')
  assert.equal(rows[4], '- [x] 重复文案')
})

test('嵌套任务项只改自己那一行，父项状态不变', () => {
  const next = toggleTaskAtLine(MIXED, 3, true)
  assert.ok(next)
  const rows = next.trimEnd().split('\n')
  assert.equal(rows[1], '* [x] 含 `行内代码` 与 $E=mc^2$')
  assert.equal(rows[2], '  - [x] 嵌套 /标签 <sup>2</sup>')
})

test('任务行识别覆盖缩进 / * / + / 有序列表；非任务行返回 null', () => {
  assert.equal(isTaskLine('- [ ] a'), true)
  assert.equal(isTaskLine('  * [x] b'), true)
  assert.equal(isTaskLine('    + [ ] c'), true)
  assert.equal(isTaskLine('1. [ ] d'), true)
  assert.equal(isTaskLine('- 普通项目'), false)
  assert.equal(isTaskLine('- [ ] 带 `[ ]` 的行内代码'), true)

  assert.equal(toggleTaskLine('- [ ] a', true), '- [x] a')
  assert.equal(toggleTaskLine('  1) [x] b', false), '  1) [ ] b')
  assert.equal(toggleTaskLine('- 普通项目', true), null)
  assert.equal(toggleTaskAtLine('- [ ] a', 2, true), null)
})
