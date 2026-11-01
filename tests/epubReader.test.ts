import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveEpubPath } from '../src/lib/epubReader.ts'
import { isEpubPath } from '../src/lib/epubPath.ts'

test('resolveEpubPath: resolves chapter paths relative to the OPF', () => {
  assert.equal(resolveEpubPath('OEBPS/content.opf', 'Text/chapter-01.xhtml'), 'OEBPS/Text/chapter-01.xhtml')
})

test('resolveEpubPath: walks parent directories', () => {
  assert.equal(resolveEpubPath('OEBPS/Text/chapter.xhtml', '../Images/cover.jpg'), 'OEBPS/Images/cover.jpg')
})

test('resolveEpubPath: drops fragments and query strings', () => {
  assert.equal(resolveEpubPath('OEBPS/nav.xhtml', 'Text/chapter.xhtml?x=1#sec-1'), 'OEBPS/Text/chapter.xhtml')
})

test('resolveEpubPath: handles percent-encoded and absolute hrefs', () => {
  assert.equal(resolveEpubPath('OEBPS/nav.xhtml', 'Text/%E7%AC%AC1%E7%AB%A0.xhtml'), 'OEBPS/Text/第1章.xhtml')
  assert.equal(resolveEpubPath('OEBPS/nav.xhtml', '/OEBPS/Text/chapter.xhtml'), 'OEBPS/Text/chapter.xhtml')
})

test('resolveEpubPath: ignores empty hrefs', () => {
  assert.equal(resolveEpubPath('OEBPS/content.opf', '#frag'), '')
  assert.equal(resolveEpubPath('OEBPS/content.opf', ''), '')
})

test('isEpubPath: extension is case-insensitive', () => {
  assert.equal(isEpubPath('book.epub'), true)
  assert.equal(isEpubPath('BOOK.EPUB'), true)
  assert.equal(isEpubPath('C:\\Books\\novel.epub'), true)
  assert.equal(isEpubPath('book.md'), false)
  assert.equal(isEpubPath('epub'), false)
  assert.equal(isEpubPath(null), false)
})
