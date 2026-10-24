/**
 * `[toc]` / `[[toc]]` 目录。
 *
 * 两个消费方必须一致：
 *   · 预览 / PDF / HTML / 演示模式走 markdown-it 插件，输出 `<nav class="markdown-toc">`；
 *   · DOCX 走 Rust，只能吃 Markdown，故先转成按层级缩进的项目符号列表。
 * 标题 id 必须与渲染器同源，否则目录链接会跳空。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderMarkdown } from '../src/lib/markdownRenderer.ts'
import { buildTocMarkdown } from '../src/lib/docxPrepare.ts'
import { replaceTocPlaceholders, renderDeckTocHtml } from '../src/lib/toc.ts'

const SRC = '# 主标题\n\n[toc]\n\n## 一、**加粗** 与 `代码`\n\n### 小节\n'

test('[toc] 渲染成正文目录，且链接指向真实标题 id', () => {
  const html = renderMarkdown(SRC)
  assert.match(html, /<nav class="markdown-toc">/, html)
  assert.match(html, /<a href="#主标题">主标题<\/a>/, html)
  // 标题 id 由渲染器生成：加粗/代码标记被剥掉
  assert.match(html, /<a href="#一-加粗-与-代码">一、加粗 与 代码<\/a>/, html)
  assert.match(html, /id="一-加粗-与-代码"/, html)
  assert.ok(!html.includes('[toc]'), `占位符未被替换：${html}`)
})

test('[[toc]] 等价于 [toc]', () => {
  const html = renderMarkdown('# A\n\n[[toc]]\n')
  assert.match(html, /<nav class="markdown-toc">/, html)
  assert.ok(!html.includes('[[toc]]'), html)
})

test('目录按标题层级缩进', () => {
  const html = renderMarkdown(SRC)
  assert.match(html, /markdown-toc-level-1/)
  assert.match(html, /markdown-toc-level-2/)
  assert.match(html, /markdown-toc-level-3/)
})

test('代码块里的 [toc] 原样保留', () => {
  const html = renderMarkdown('# A\n\n```\n[toc]\n```\n')
  assert.ok(!html.includes('markdown-toc'), html)
  assert.match(html, /\[toc\]/, html)
})

test('DOCX 把目录转成按层级缩进的项目符号列表', () => {
  const md = buildTocMarkdown(SRC)
  assert.equal(md, '- 主标题\n  - 一、加粗 与 代码\n    - 小节')
})

test('DOCX 目录以最浅标题为基准缩进（没有 H1 也不多缩一层）', () => {
  assert.equal(buildTocMarkdown('## 甲\n\n### 乙\n'), '- 甲\n  - 乙')
})

test('替换占位符时保留行首缩进，且不碰围栏内内容', () => {
  const src = '  [toc]\n\n```\n[toc]\n```\n'
  const out = replaceTocPlaceholders(src, '- A\n  - B')
  assert.equal(out, '  - A\n    - B\n\n```\n[toc]\n```\n')
})

test('演示模式整册目录：链接带 data-slide，由 Slideshow 翻页', () => {
  const html = renderDeckTocHtml([
    { text: '第一章', slide: 2, level: 1 },
    { text: 'A & B', slide: 3, level: 2 },
  ])
  assert.match(html, /<nav class="markdown-toc ys-deck-toc">/)
  assert.match(html, /<a href="#" data-slide="2">第一章<\/a>/)
  // 文本转义，且不会生成正文锚点链接
  assert.match(html, /<a href="#" data-slide="3">A &amp; B<\/a>/)
  assert.ok(!html.includes('href="#第'), html)
  assert.match(html, /markdown-toc-level-1/)
  assert.match(html, /markdown-toc-level-2/)
})

test('演示模式的 [toc] 页替换为整册目录（页面本身没有标题也能渲染）', () => {
  const toc = renderDeckTocHtml([{ text: '章节', slide: 1 }])
  const out = replaceTocPlaceholders('# 目录\n\n[toc]\n', toc)
  assert.match(out, /ys-deck-toc/)
  assert.ok(!out.includes('[toc]'), out)
})

test('整册目录为空时不渲染（调用方保留原占位符，避免出现空块）', () => {
  assert.equal(renderDeckTocHtml([]), '')
})
