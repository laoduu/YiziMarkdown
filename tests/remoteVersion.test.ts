/**
 * 云端版本比较的单元测试（零依赖，Node 内置测试运行器）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compareContent, formatByteCount } from '../src/lib/remoteVersion.ts'

test('相同内容判为一致，哈希与字节数稳定', async () => {
  const text = '# 标题\n\n正文行\n'
  const a = await compareContent(text, text)
  const b = await compareContent(text, text)
  assert.equal(a.identical, true)
  assert.equal(a.firstDiffLine, null)
  assert.equal(a.localBytes, a.remoteBytes)
  assert.equal(a.localHash, a.remoteHash)
  assert.equal(a.localHash, b.localHash, '同一内容两次摘要必须一致')
  assert.equal(a.localLines, 4, '末尾换行会产生一个空行')
})

test('逐行不同时给出 1 基首个差异行号', async () => {
  const local = 'line1\nline2\nline3\n'
  const remote = 'line1\nline2 changed\nline3\n'
  const cmp = await compareContent(local, remote)
  assert.equal(cmp.identical, false)
  assert.equal(cmp.firstDiffLine, 2)
  assert.notEqual(cmp.localHash, cmp.remoteHash)
})

test('新增行发生在末尾时差异行号为新增行', async () => {
  const cmp = await compareContent('a\nb\n', 'a\nb\nc\n')
  assert.equal(cmp.identical, false)
  assert.equal(cmp.firstDiffLine, 3)
})

test('CRLF 与 LF 视为一致（服务器可能重写行尾）', async () => {
  const cmp = await compareContent('a\r\nb\r\n', 'a\nb\n')
  assert.equal(cmp.identical, true)
  assert.equal(cmp.firstDiffLine, null)
})

test('字节数按 UTF-8 计算，不是字符数', async () => {
  const cmp = await compareContent('中文', '中文')
  assert.equal(cmp.localBytes, 6)
})

test('formatByteCount 覆盖 B / KB / MB', () => {
  assert.equal(formatByteCount(12), '12 B')
  assert.equal(formatByteCount(2048), '2.0 KB')
  assert.equal(formatByteCount(3 * 1024 * 1024), '3.0 MB')
})
