import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withCodeLineNumbers } from '../src/lib/codeBlockLines.ts'

test('withCodeLineNumbers: 每个逻辑行一个行号与内容容器', () => {
  const html = withCodeLineNumbers('const a = 1;\nconst b = 2;')
  assert.match(html, /class="code-line-number" aria-hidden="true">1</)
  assert.match(html, /class="code-line-number" aria-hidden="true">2</)
  assert.match(html, /class="code-line-content">const a = 1;</)
  assert.match(html, /class="code-line-content">const b = 2;</)
})

test('withCodeLineNumbers: 跨行的 highlight span 会闭合并在下一行重开', () => {
  const html = withCodeLineNumbers('<span class="hljs-string">"a\nb"</span>')
  const lines = html.split('</span></span>').filter(Boolean)
  assert.equal(lines.length >= 2, true)
  // 第一行在换行处关闭了高亮 span，第二行重新打开
  assert.match(html, /<span class="hljs-string">"a<\/span>/)
  assert.match(html, /<span class="hljs-string">b"<\/span>/)
})

test('withCodeLineNumbers: 末尾换行不制造额外空行，空行保留占位', () => {
  const html = withCodeLineNumbers('a\n\nb\n')
  assert.equal((html.match(/class="code-line"/g) || []).length, 3)
  assert.match(html, /class="code-line-content">\u200b</)
})

test('withCodeLineNumbers: 空代码块也保留第一行', () => {
  const html = withCodeLineNumbers('')
  assert.match(html, /class="code-line-number" aria-hidden="true">1</)
})
