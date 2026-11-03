/**
 * GitHub 风格提示块的自定义标题：
 * `> [!TIP] 小技巧` → 类型决定图标/配色，`]` 后的文字作为标题；
 * 不写标题时仍使用英文类型名（Note / Tip / ...）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderMarkdown } from '../src/lib/markdownRenderer.ts'

test('提示块：不写标题时使用英文类型名', () => {
  const html = renderMarkdown('> [!NOTE]\n> 补充说明。\n')
  assert.match(html, /class="[^"]*md-alert-note/)
  assert.match(html, /<p class="md-alert-title">Note<\/p>/)
  assert.match(html, /补充说明。/)
  assert.ok(!html.includes('[!NOTE]'), html)
})

test('提示块：类型后的内容成为自定义标题', () => {
  const html = renderMarkdown('> [!TIP] 小技巧\n> 正文内容。\n')
  assert.match(html, /class="[^"]*md-alert-tip/)
  assert.match(html, /<p class="md-alert-title">小技巧<\/p>/)
  assert.match(html, /正文内容。/)
  assert.ok(!html.includes('[!TIP]'), html)
})

test('提示块：只有自定义标题、没有正文时不留空段落', () => {
  const html = renderMarkdown('> [!WARNING] 小心操作\n')
  assert.match(html, /class="[^"]*md-alert-warning/)
  assert.match(html, /<p class="md-alert-title">小心操作<\/p>/)
  // 引用块里只应有标题这一个段落
  assert.equal((html.match(/<p /g) || []).length, 1, html)
})

test('提示块：类型大小写不敏感，标题按纯文本转义', () => {
  const html = renderMarkdown('> [!tip] a < b & c\n')
  assert.match(html, /class="[^"]*md-alert-tip/)
  assert.match(html, /<p class="md-alert-title">a &lt; b &amp; c<\/p>/)
})

test('提示块：未支持的类型仍按普通引用渲染', () => {
  const html = renderMarkdown('> [!QUESTION] 这不会被当成提示块\n')
  assert.ok(!html.includes('md-alert'), html)
  assert.match(html, /\[!QUESTION\]/, html)
})
