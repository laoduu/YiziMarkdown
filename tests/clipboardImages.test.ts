/**
 * 剪贴板原始图片收集（lib/clipboardImages.ts）。
 *
 * 守两类来源：截图（items 里的 image/*）与资源管理器复制的图片文件（files）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collectClipboardImages, imageAltFromFile } from '../src/lib/clipboardImages.ts'

function fakeDataTransfer(files: File[]): DataTransfer {
  return {
    items: files.map((file) => ({
      kind: 'file',
      type: file.type,
      getAsFile: () => file,
    })),
    files,
  } as unknown as DataTransfer
}

test('收集 items 里的图片并过滤非图片项', () => {
  const png = new File(['x'], 'shot.png', { type: 'image/png' })
  const txt = new File(['x'], 'note.txt', { type: 'text/plain' })
  const dt = fakeDataTransfer([png, txt])
  assert.deepEqual(collectClipboardImages(dt).map((f) => f.name), ['shot.png'])
})

test('items 为空时回退 files，并对同一文件去重', () => {
  const png = new File(['x'], 'shot.png', { type: 'image/png' })
  const dt = { items: [], files: [png, png] } as unknown as DataTransfer
  assert.equal(collectClipboardImages(dt).length, 1)
})

test('空 MIME 的图片文件按扩展名兜底', () => {
  const png = new File(['x'], 'shot.PNG', { type: '' })
  const dt = fakeDataTransfer([png])
  assert.deepEqual(collectClipboardImages(dt).map((f) => f.name), ['shot.PNG'])
})

test('alt 文本取文件名去扩展名，空名回退 image', () => {
  assert.equal(imageAltFromFile(new File(['x'], 'image-2026.png', { type: 'image/png' })), 'image-2026')
  assert.equal(imageAltFromFile(new File(['x'], '', { type: 'image/png' })), 'image')
})
