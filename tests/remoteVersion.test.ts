/**
 * 云端版本比较的单元测试（零依赖，Node 内置测试运行器）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compareContent, formatByteCount, formatSavedAt, parseServerTime } from '../src/lib/remoteVersion.ts'

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

test('保存时间随比较结果返回，缺省为 null', async () => {
  const plain = await compareContent('a\n', 'b\n')
  assert.equal(plain.localSavedAt, null)
  assert.equal(plain.remoteSavedAt, null)

  const localMs = Date.UTC(2026, 10, 19, 6, 30)
  const remoteMs = Date.UTC(2026, 10, 19, 7, 5)
  const cmp = await compareContent('a\n', 'b\n', { localSavedAt: localMs, remoteSavedAt: remoteMs })
  assert.equal(cmp.localSavedAt, localMs)
  assert.equal(cmp.remoteSavedAt, remoteMs)
  assert.equal(cmp.identical, false, '时间不同不影响内容判定')
})

test('非法保存时间归一化为 null', async () => {
  const cmp = await compareContent('a', 'b', { localSavedAt: 0, remoteSavedAt: Number.NaN })
  assert.equal(cmp.localSavedAt, null)
  assert.equal(cmp.remoteSavedAt, null)
})

test('parseServerTime 识别 RFC 1123 与 ISO 8601', () => {
  assert.equal(parseServerTime('Wed, 01 Jan 2025 00:00:00 GMT'), Date.UTC(2025, 0, 1))
  assert.equal(parseServerTime('2025-01-01T08:00:00+08:00'), Date.UTC(2025, 0, 1))
  assert.equal(parseServerTime('  Wed, 01 Jan 2025 00:00:00 GMT  '), Date.UTC(2025, 0, 1))
})

test('parseServerTime 对缺失 / 无法解析的值返回 null', () => {
  assert.equal(parseServerTime(null), null)
  assert.equal(parseServerTime(undefined), null)
  assert.equal(parseServerTime(''), null)
  assert.equal(parseServerTime('not a date'), null)
})

test('formatSavedAt 按本地时区补零输出，未知时间返回空串', () => {
  const local = new Date(2026, 0, 2, 3, 4).getTime()
  assert.equal(formatSavedAt(local), '2026-01-02 03:04')
  assert.equal(formatSavedAt(null), '')
  assert.equal(formatSavedAt(Number.NaN), '')
})
