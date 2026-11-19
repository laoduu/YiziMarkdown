/**
 * 文档内 AI 纯逻辑的单测（零依赖，Node 内置测试运行器）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_SELECTION_CHARS,
  buildInlineMessages,
  diffLines,
  isRangeStillValid,
  pickInlineIntents,
  truncateSelection,
} from '../src/lib/inlineAI.ts'

test('提示词：系统约束 + 用户消息，原文与指令都不丢', () => {
  const messages = buildInlineMessages('请润色', '第一段\n第二段')
  assert.equal(messages.length, 2)
  assert.equal(messages[0].role, 'system')
  assert.ok(messages[0].content.includes('只输出改写后的 Markdown 正文'))
  assert.equal(messages[1].role, 'user')
  assert.ok(messages[1].content.includes('请润色'))
  assert.ok(messages[1].content.includes('第一段\n第二段'))
})

test('超长选区按上限截断', () => {
  const short = truncateSelection('短文本')
  assert.equal(short.truncated, false)
  assert.equal(short.text, '短文本')

  const long = 'a'.repeat(MAX_SELECTION_CHARS + 10)
  const cut = truncateSelection(long)
  assert.equal(cut.truncated, true)
  assert.equal(cut.text.length, MAX_SELECTION_CHARS)
})

test('应用前校验：原文变化即视为失效', () => {
  assert.equal(isRangeStillValid('原文', '原文'), true)
  assert.equal(isRangeStillValid('原文', '原文改过'), false)
})

test('快捷意图：普通中文段落', () => {
  assert.deepEqual(pickInlineIntents('这是一段普通的说明文字。'), ['polish', 'expand', 'shorten', 'proofread'])
})

test('快捷意图：英文段落首选翻译', () => {
  assert.equal(pickInlineIntents('This is an English paragraph.')[0], 'translate')
})

test('快捷意图：代码块与表格', () => {
  assert.equal(pickInlineIntents('```ts\nconst a = 1\n```')[0], 'explainCode')
  assert.equal(pickInlineIntents('function hello() {\n  return 1\n}')[0], 'explainCode')
  assert.equal(pickInlineIntents('| a | b |\n| --- | --- |\n| 1 | 2 |')[0], 'tidyTable')
})

test('diff：内容未变时全部 same', () => {
  const lines = diffLines('a\nb\nc', 'a\nb\nc')
  assert.deepEqual(lines.map((l) => l.type), ['same', 'same', 'same'])
})

test('diff：替换行给出一删一增', () => {
  const lines = diffLines('a\nb\nc', 'a\nB\nc')
  assert.deepEqual(lines.map((l) => l.type), ['same', 'del', 'add', 'same'])
  assert.equal(lines.find((l) => l.type === 'del')?.text, 'b')
  assert.equal(lines.find((l) => l.type === 'add')?.text, 'B')
})

test('diff：纯插入行', () => {
  const lines = diffLines('a\nc', 'a\nb\nc')
  assert.deepEqual(lines.map((l) => l.type), ['same', 'add', 'same'])
})

test('diff：超出行数上限时退化为整段替换', () => {
  const before = Array.from({ length: 5 }, (_, i) => `a${i}`).join('\n')
  const after = Array.from({ length: 5 }, (_, i) => `b${i}`).join('\n')
  const lines = diffLines(before, after, 3)
  assert.deepEqual(lines.map((l) => l.type), ['del', 'del', 'del', 'del', 'del', 'add', 'add', 'add', 'add', 'add'])
})
