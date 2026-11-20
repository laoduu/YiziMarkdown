/**
 * 格式条状态推导（src/lib/selectionFormatState.ts）。
 *
 * 期望与「再点一次会取消」的 toggle 规则一致：能被取消的选区才判定为已应用。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectSelectionFormats, inlineFormatActive } from '../src/lib/selectionFormatState.ts'

/** 取 `|` 之间的部分作为选区，返回 [doc, from, to] */
function sel(raw: string): [string, number, number] {
  const from = raw.indexOf('|')
  const to = raw.lastIndexOf('|') - 1
  const doc = raw.slice(0, from) + raw.slice(from + 1, to + 1) + raw.slice(to + 2)
  return [doc, from, to]
}

function detect(raw: string) {
  const [doc, from, to] = sel(raw)
  return detectSelectionFormats(doc, from, to)
}

test('行内：选区带标记 / 标记紧贴外侧 / 落在标记内部 都算已应用', () => {
  assert.ok(detect('**|abc|**').includes('bold'))
  assert.ok(detect('|**abc**|').includes('bold'))
  assert.ok(detect('**a|bc|d**').includes('bold'))
})

test('行内：普通文本不点亮任何行内格式', () => {
  assert.deepEqual(detect('|普通文本|'), [])
})

test('行内：斜体不会因为加粗标记而误亮', () => {
  const ids = detect('**|abc|**')
  assert.ok(ids.includes('bold'))
  assert.ok(!ids.includes('italic'))
})

test('行内：删除线与下标互不误判', () => {
  const strike = detect('~~|abc|~~')
  assert.ok(strike.includes('strikethrough'))
  assert.ok(!strike.includes('subscript'))

  const sub = detect('~|abc|~')
  assert.ok(sub.includes('subscript'))
  assert.ok(!sub.includes('strikethrough'))
})

test('行内：行内代码与高亮', () => {
  assert.ok(detect('`|code|`').includes('inlineCode'))
  assert.ok(detect('==|mark|==').includes('highlight'))
})

test('行内：跨行选区不点亮行内格式', () => {
  const ids = detect('|**a\nb**|')
  assert.ok(!ids.includes('bold'))
})

test('块级：标题（H1–H3）整段生效才点亮', () => {
  assert.ok(detect('## |标题|').includes('heading'))
  assert.ok(detect('## |标题\n## 第二节|').includes('heading'))
  assert.ok(!detect('## |标题\n普通段落|').includes('heading'))
})

test('块级：无序 / 有序 / 任务列表', () => {
  assert.ok(detect('- |第一项|').includes('unorderedList'))
  assert.ok(detect('1. |第一项|').includes('orderedList'))
  assert.ok(detect('- [ ] |待办|').includes('taskList'))

  // 任务列表不能被当成普通无序列表
  const task = detect('- [x] |已完成|')
  assert.ok(task.includes('taskList'))
  assert.ok(!task.includes('unorderedList'))
})

test('块级：引用（含引用里的列表）', () => {
  assert.ok(detect('> |引用文字|').includes('quote'))
  const quotedList = detect('> - |条目|')
  assert.ok(quotedList.includes('quote'))
  assert.ok(quotedList.includes('unorderedList'))
})

test('行内公式与块级公式', () => {
  assert.ok(detect('$|x+y|$').includes('math'))
  assert.ok(detect('$$\n|a+b|\n$$').includes('math'))
})

test('链接：选中标签文字也算', () => {
  assert.ok(detect('[|文档|](https://example.com)').includes('link'))
  assert.ok(detect('|https://example.com|').includes('link') === false)
})

test('inlineFormatActive：空选区一律不算', () => {
  assert.equal(inlineFormatActive('**abc**', 2, 2, '**', '**'), false)
})
