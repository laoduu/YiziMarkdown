import test from 'node:test'
import assert from 'node:assert/strict'

import { wrapCodeRuns } from '../src/lib/pptxScene.ts'
import type { SceneRun, SceneRunStyle } from '../src/lib/pptxTypes.ts'

function style(color = '000000'): SceneRunStyle {
  return { color, sizePt: 12, latin: 'Consolas', ea: 'Consolas' }
}

function run(text: string, color = '000000'): SceneRun {
  return { text, style: style(color) }
}

const monospace = () => 10
const cjk = (ch: string) => ((ch.codePointAt(0) ?? 0) >= 0x2e80 ? 20 : 10)

test('代码折行：按字符宽度切分，不依赖空格', () => {
  const lines = wrapCodeRuns([run('abcdefghij')], 50, monospace)
  assert.deepEqual(lines.map((l) => l.map((r) => r.text).join('')), ['abcde', 'fghij'])
})

test('代码折行：保留 run 样式，并在同一样式内合并', () => {
  const lines = wrapCodeRuns([run('ab', '111111'), run('cdef', '222222')], 30, monospace)
  assert.equal(lines.length, 2)
  assert.deepEqual(lines[0].map((r) => [r.text, r.style.color]), [['ab', '111111'], ['c', '222222']])
  assert.deepEqual(lines[1].map((r) => [r.text, r.style.color]), [['def', '222222']])
})

test('代码折行：CJK / 宽字符按真实宽度计算', () => {
  const lines = wrapCodeRuns([run('中a中')], 30, cjk)
  assert.deepEqual(lines.map((l) => l.map((r) => r.text).join('')), ['中a', '中'])
})

test('代码折行：宽度足够时保持单行', () => {
  const source = [run('const a = 1')]
  const lines = wrapCodeRuns(source, 500, monospace)
  assert.deepEqual(lines, [source])
})
