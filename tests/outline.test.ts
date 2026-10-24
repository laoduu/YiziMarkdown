/**
 * Sidebar outline parser (`headingId.computeOutlineItems`).
 *
 * Regression: `#` comments inside fenced code blocks used to show up as chapters
 * in the outline (a global bug that affected every document with code samples).
 * The outline must match what markdown-it actually renders as headings.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeOutlineItems } from '../src/lib/headingId.ts'

const headings = (doc: string) => computeOutlineItems(doc).map((it) => it.text)

test('code fences: # comments are not outline entries', () => {
  const doc = [
    '# Real',
    '',
    '```bash',
    '# not a heading',
    '## also not',
    '```',
    '',
    '## Second',
    '',
    '~~~python',
    '# still code',
    '~~~',
  ].join('\n')
  assert.deepEqual(headings(doc), ['Real', 'Second'])
})

test('fence length / inner backticks do not close the fence early', () => {
  const doc = [
    '````md',
    '# code',
    '```',
    '# still code',
    '```',
    '````',
    '# After',
  ].join('\n')
  assert.deepEqual(headings(doc), ['After'])
})

test('front matter and HTML comment blocks are skipped', () => {
  const doc = [
    '---',
    'title: x',
    '# not a heading',
    '---',
    '',
    '<!--',
    '# also not a heading',
    '-->',
    '',
    '# Visible',
  ].join('\n')
  assert.deepEqual(headings(doc), ['Visible'])
})

test('indented code blocks are not headings', () => {
  const doc = ['# Top', '', '    # four spaces = code', '', '\t# tab = code', '', '## Bottom'].join('\n')
  assert.deepEqual(headings(doc), ['Top', 'Bottom'])
})

test('headings after a code block keep their source line and unique ids', () => {
  const doc = ['# A', '', '```', '# code', '```', '', '# A'].join('\n')
  const items = computeOutlineItems(doc)
  assert.equal(items.length, 2)
  assert.equal(items[1].line, 7)
  assert.notEqual(items[0].id, items[1].id)
})
