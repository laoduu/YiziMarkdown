/**
 * 有序列表编号（源码侧）。
 *
 * 回归：工具栏「有序列表」此前对每一行都插入 `1. `，预览能顺序渲染，但源码模式里
 * 就是一列 `1.` —— 用户看不到真实编号，继续编辑也很别扭。
 * 规则：按非空行递增、保留缩进、跳过空行、已带编号的行重排（连点两次不叠加）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { numberOrderedLines } from '../src/lib/listFormat.ts'

test('多行选区从 1 开始连续编号', () => {
  assert.equal(numberOrderedLines('甲\n乙\n丙'), '1. 甲\n2. 乙\n3. 丙')
})

test('空行不占编号，也不打断后续编号', () => {
  assert.equal(numberOrderedLines('甲\n\n乙'), '1. 甲\n\n2. 乙')
  assert.equal(numberOrderedLines('甲\n   \n乙'), '1. 甲\n   \n2. 乙')
})

test('保留原有缩进', () => {
  assert.equal(numberOrderedLines('  甲\n  乙'), '  1. 甲\n  2. 乙')
})

test('已有编号会被重新排，连点两次不会叠加', () => {
  const once = numberOrderedLines('甲\n乙')
  assert.equal(numberOrderedLines(once), once)
  assert.equal(numberOrderedLines('1. 甲\n1. 乙\n7) 丙'), '1. 甲\n2. 乙\n3. 丙')
})

test('单项与含行内语法的内容', () => {
  assert.equal(numberOrderedLines('含 `代码` 与 **加粗**'), '1. 含 `代码` 与 **加粗**')
})
