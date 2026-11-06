/**
 * 图片资产命令封装（lib/docAssets.ts）的轻量校验。
 *
 * 真正的落盘 / 迁移 / 去重逻辑在 Rust 侧（src-tauri/src/doc_assets.rs），
 * 由 `cargo test` 覆盖；这里只守前端能看到的错误归类。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isImageTooLargeError, PASTED_IMAGE_MAX_BYTES } from '../src/lib/docAssets.ts'

test('图片上限与 WebDAV 单图上限一致（8MB）', () => {
  assert.equal(PASTED_IMAGE_MAX_BYTES, 8 * 1024 * 1024)
})

test('识别 Rust 侧 IMAGE_TOO_LARGE 错误', () => {
  assert.equal(isImageTooLargeError(new Error('IMAGE_TOO_LARGE')), true)
  assert.equal(isImageTooLargeError('IMAGE_TOO_LARGE'), true)
  assert.equal(isImageTooLargeError(new Error('UNSUPPORTED_IMAGE')), false)
  assert.equal(isImageTooLargeError(null), false)
})
