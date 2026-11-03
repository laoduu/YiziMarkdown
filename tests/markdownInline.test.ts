/**
 * 行内扩展：^上标^ / ~下标~ / ==高亮== 的预览渲染。
 * 与 DOCX 侧（w:vertAlign / w:highlight）使用同一套语义。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderMarkdown } from '../src/lib/markdownRenderer.ts'

test('预览：^上标^（含中文）', () => {
  assert.match(renderMarkdown('E=mc^2^\n'), /<sup>2<\/sup>/)
  assert.match(renderMarkdown('^上标^\n'), /<sup>上标<\/sup>/)
})

test('预览：~下标~（含中文）', () => {
  assert.match(renderMarkdown('~下标~\n'), /<sub>下标<\/sub>/)
})

test('预览：~下标~ 且不吞掉 ~~删除线~~', () => {
  assert.match(renderMarkdown('H~2~O\n'), /<sub>2<\/sub>/)
  assert.match(renderMarkdown('~~删~~\n'), /<s>删<\/s>/)
})

test('预览：==高亮== → <mark>，代码里的 == 保持原样', () => {
  assert.match(renderMarkdown('==重点==\n'), /<mark>重点<\/mark>/)
  assert.match(renderMarkdown('`a==b==`\n'), /a==b==/)
  // 围栏代码会被 highlight.js 拆成 span，不能再按整串匹配；关键是没被当成高亮
  assert.ok(!renderMarkdown('```\nx==y==\n```\n').includes('<mark>'))
})

test('预览：区间号 64K~512K / 0~20 不会被误当下标', () => {
  const html = renderMarkdown('引用上限（64K~512K/不限）和轮数（0~20轮）\n')
  assert.ok(!html.includes('<sub>'), html)
  assert.ok(!renderMarkdown('1~5\n').includes('<sub>'))
})