/**
 * 实时模式块级装饰（`cm-live-blocks.ts`）的区间计算回归测试。
 *
 * 背景：用户报"公式之后的内容在实时模式下不渲染"。排查发现 `$$…$$` 的区间计算有两处缺陷：
 *   1) 找不到闭合行时 `endLine` 兜底成**文档最后一行** ⇒ 生成「从 $$ 到文档末尾」的替换，吞掉正文
 *   2) 闭合检测只认「整行恰好是 $$」，`…$$` 挂在行尾时永远匹配不上 ⇒ 必然走 1 的兜底
 * 两条都会把正文吞掉，所以这里对三种形态各写一条用例：
 *   合法闭合 / 闭合挂行尾 / **完全没有闭合**（最危险的一条）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { useSettingsStore } from '../src/stores/settingsStore.ts'
import { liveBlocksBundle } from '../src/lib/cm-live-blocks.ts'

// 块级公式渲染由 katex 插件开关控制，测试里必须显式打开
useSettingsStore.setState({ enabledPlugins: ['katex'] })

const [blockDecorField] = liveBlocksBundle()

const TAIL = '\n---\n\n## 显式对齐示例\n\n这一段必须仍然可见\n'

function docOf(body: string) {
  return `---\ntitle: x\n---\n${body}${TAIL}`
}

/** 返回块装饰覆盖到的最末位置；无装饰为 0 */
function lastCovered(doc: string) {
  const state = EditorState.create({ doc, extensions: [markdown(), blockDecorField] })
  const deco = state.field(blockDecorField)
  let last = 0
  deco.between(0, doc.length, (_from, to) => { if (to > last) last = to })
  return { last, total: doc.length, deco }
}

test('合法闭合（$$ 独占一行）：区间只覆盖公式块，不吞后续内容', () => {
  const doc = docOf('\n# 正文\n\n$$\n\\int x\\,dx\n$$\n')
  const { last, total } = lastCovered(doc)
  assert.ok(last > 0, '应当有块装饰（公式块）')
  assert.ok(last < total - 1, `装饰覆盖到了文档末尾（${last}/${total}）`)
  assert.ok(doc.slice(last).includes('这一段必须仍然可见'), '装饰之后必须还有内容')
})

test('闭合挂在公式行尾（…$$）：同样不能吞后续内容（旧代码会走兜底）', () => {
  const doc = docOf('\n$$\n\\int x\\,dx\n\\sqrt{\\pi}$$\n')
  const { last, total } = lastCovered(doc)
  assert.ok(last > 0, '应当有块装饰（公式块）')
  assert.ok(last < total - 1, `装饰覆盖到了文档末尾（${last}/${total}）`)
  assert.ok(doc.slice(last).includes('这一段必须仍然可见'), '装饰之后必须还有内容')
})

test('完全没有闭合 $$：不生成任何替换（不能吞掉整个文档 —— 最危险的一条）', () => {
  const doc = docOf('\n$$\n\\int x\\,dx\n\n正文还在这里\n')
  const { last, total } = lastCovered(doc)
  assert.ok(last < total - 1, `装饰覆盖到了文档末尾（${last}/${total}）—— 正文被吞掉了`)
  assert.ok(doc.slice(last).includes('正文还在这里'), '没有闭合就不该替换掉后续正文')
})
