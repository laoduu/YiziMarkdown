import test from 'node:test'
import assert from 'node:assert/strict'

import { ensureKatex, isKatexReady } from '../src/renderers/katex.ts'
import { getMarkdownIt } from '../src/lib/markdownRenderer.ts'

// 回归：KaTeX 是异步加载的，首次渲染可能早于插件就绪。旧实现只按插件扩展缓存
// markdown-it 实例，导致随后即使 KaTeX 已加载，`$...$` 仍会一直渲染成源码。
test('KaTeX 就绪后重建 markdown-it 实例，公式不再降级为源码', async () => {
  assert.equal(isKatexReady(), false, '测试进程内 KaTeX 应处于未加载状态')

  const before = getMarkdownIt()
  assert.equal(getMarkdownIt(), before, '未就绪时重复获取应命中缓存')

  const beforeHtml = before.render('公式 $x^2$ 和价格 $5')
  assert.ok(!beforeHtml.includes('class="katex"'), '插件未加载时不应渲染公式')
  assert.ok(beforeHtml.includes('$x^2$'), '插件未加载时应保留源码')

  const ok = await ensureKatex()
  assert.equal(ok, true)
  assert.equal(isKatexReady(), true)

  const after = getMarkdownIt()
  assert.notEqual(after, before, 'KaTeX 就绪后应重建实例')

  const afterHtml = after.render('公式 $x^2$ 和价格 $5')
  assert.ok(afterHtml.includes('class="katex"'), '就绪后应渲染原生公式 DOM')
  assert.ok(afterHtml.includes('$5'), '货币不应被误判为公式')
})
