import test from 'node:test'
import assert from 'node:assert/strict'
import {
  findMarkerNbspOffsets,
  normalizeMarkdownMarkers,
} from '../src/lib/markdownMarkerNbsp.ts'

const NBSP = '\u00a0'

test('标题 / 列表 / 引用 / 有序列表后的 NBSP 会被修掉', () => {
  assert.equal(normalizeMarkdownMarkers(`#${NBSP}一级`), '# 一级')
  assert.equal(normalizeMarkdownMarkers(`##${NBSP}二级标题`), '## 二级标题')
  assert.equal(normalizeMarkdownMarkers(`-${NBSP}项目`), '- 项目')
  assert.equal(normalizeMarkdownMarkers(`*${NBSP}项目`), '* 项目')
  assert.equal(normalizeMarkdownMarkers(`>${NBSP}引用`), '> 引用')
  assert.equal(normalizeMarkdownMarkers(`1.${NBSP}条目`), '1. 条目')
})

test('长度不变：替换后光标/选区偏移不带位移', () => {
  const src = `##${NBSP}${NBSP}标题`
  const out = normalizeMarkdownMarkers(src)
  assert.equal(out.length, src.length)
  assert.equal(out, '##  标题')
})

test('正文中间的 NBSP 不动（可能是排版意图）', () => {
  const src = `这里${NBSP}有个${NBSP}空格`
  assert.equal(normalizeMarkdownMarkers(src), src)
  assert.deepEqual(findMarkerNbspOffsets(src), [])
})

test('围栏代码块内部不处理', () => {
  const src = ['```', `##${NBSP}不是标题`, '```', `##${NBSP}是标题`].join('\n')
  assert.equal(normalizeMarkdownMarkers(src), ['```', `##${NBSP}不是标题`, '```', '## 是标题'].join('\n'))
})

test('缩进代码（4 空格）不处理：那本来就不是块标记', () => {
  const src = `    ##${NBSP}代码内容`
  assert.equal(normalizeMarkdownMarkers(src), src)
})

test('偏移精确：只指向 NBSP 本身', () => {
  const src = `a\n##${NBSP}x`
  const offs = findMarkerNbspOffsets(src)
  assert.equal(offs.length, 1)
  assert.equal(src[offs[0]], NBSP)
})

test('全角空格 U+3000 绝不转换（严格按语法，不替用户改字）', () => {
  const src = `##\u3000标题`
  assert.equal(normalizeMarkdownMarkers(src), src)
  assert.deepEqual(findMarkerNbspOffsets(src), [])
})

test('全角标点（＃ / －）也不做转换', () => {
  const src = `＃\u3000全角标题`
  assert.equal(normalizeMarkdownMarkers(src), src)
})
