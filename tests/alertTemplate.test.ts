/**
 * 工具栏插入提示块的模板：
 * 首行是「类型标记 + 默认标题」，第二行留空正文，光标插入后落在末尾 `> ` 之后。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildAlertMarkdown } from '../src/lib/alertTemplate.ts'

test('提示块模板：类型标记 + 自定义标题 + 空正文行', () => {
  assert.equal(buildAlertMarkdown('TIP', '小技巧'), '\n> [!TIP] 小技巧\n> ')
})

test('提示块模板：5 种类型都使用大写标记', () => {
  for (const type of ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION'] as const) {
    const md = buildAlertMarkdown(type, '标题')
    assert.match(md, new RegExp(`\\n> \\[!${type}\\] 标题\\n> $`))
  }
})
