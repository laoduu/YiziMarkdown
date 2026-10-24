/**
 * Preview renderer: inline / reference / table images with `data:image/svg+xml`.
 *
 * markdown-it's default `validateLink` only allows data:image/{gif,png,jpeg,webp}.
 * An SVG data URI was rejected and the whole `![alt](data:...)` fell back to
 * literal text (which then refused to wrap and blew up the table width).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderMarkdown } from '../src/lib/markdownRenderer.ts'

const SVG = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSIyNCI+PHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjI0IiBmaWxsPSIjMzM2NmNjIi8+PC9zdmc+'

test('inline SVG data URI renders as <img>, keeps surrounding text in one paragraph', () => {
  const html = renderMarkdown(`before ![pic](${SVG}) after`)
  assert.match(html, /<p[^>]*>before <img [^>]*src="data:image\/svg\+xml;base64,/)
  assert.match(html, /after<\/p>/)
  assert.ok(!html.includes('!['), html)
})

test('reference-style image resolves when the definition is an SVG data URI', () => {
  const html = renderMarkdown(`![ref][pic]\n\n[pic]: ${SVG} "title"`)
  assert.match(html, /<img [^>]*src="data:image\/svg\+xml;base64,/)
  assert.match(html, /alt="ref"/)
  assert.ok(!html.includes('![ref]'), html)
})

test('collapsed reference image works', () => {
  const html = renderMarkdown(`![pic][]\n\n[pic]: ${SVG}`)
  assert.match(html, /<img [^>]*src="data:image\/svg\+xml;base64,/)
})

test('SVG data URI inside a table cell renders without widening the table', () => {
  const html = renderMarkdown(`| a | b |\n| --- | --- |\n| ![cell](${SVG}) | text |`)
  assert.match(html, /<td><img [^>]*src="data:image\/svg\+xml;base64,/)
  assert.ok(!html.includes('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSIyNCI+PHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjI0IiBmaWxsPSIjMzM2NmNjIi8+PC9zdmc+alt'), html)
})

test('unsafe data: URIs are still rejected (no XSS regression)', () => {
  const html = renderMarkdown('![x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)')
  assert.ok(!html.includes('<img'), html)
})

test('javascript: links are still rejected', () => {
  const html = renderMarkdown('[x](javascript:alert(1))')
  assert.ok(!html.includes('href="javascript:'), html)
})
