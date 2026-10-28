/**
 * 手动更新通道的纯逻辑（lib/manualUpdate.ts）。
 *
 * 守两件事：
 *   1. 下载页必须指向「用户看到的那一版」的 tag，而不是 latest（清单可能滞后）
 *   2. 提示卡里的更新说明是去标记后的纯文本，不把 `###` / `**` 直接怼给用户
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { releasePageUrl, notesExcerpt, RELEASE_REPO } from '../src/lib/manualUpdate.ts'

test('下载页指向该版本的 tag', () => {
  assert.equal(releasePageUrl('0.5.0'), `${RELEASE_REPO}/releases/tag/v0.5.0`)
  // 清单允许带前导 v；拼 URL 时不能再拼出 vv
  assert.equal(releasePageUrl('v0.5.0'), `${RELEASE_REPO}/releases/tag/v0.5.0`)
  // 预发布版同样要精确到 tag（发布页上才有对应资产）
  assert.equal(releasePageUrl('0.5.0-beta.1'), `${RELEASE_REPO}/releases/tag/v0.5.0-beta.1`)
})

test('版本号异常时退回最新发布页，不拼出 404', () => {
  assert.equal(releasePageUrl(null), `${RELEASE_REPO}/releases/latest`)
  assert.equal(releasePageUrl(''), `${RELEASE_REPO}/releases/latest`)
  assert.equal(releasePageUrl('latest'), `${RELEASE_REPO}/releases/latest`)
  assert.equal(releasePageUrl('1.0.0/../../evil'), `${RELEASE_REPO}/releases/latest`)
})

test('更新说明去标记后是可读的一句', () => {
  const md = '## 新功能\n\n- **导出**更快\n- 修复 [链接](https://example.com) 问题\n'
  assert.equal(notesExcerpt(md), '新功能 导出更快 修复 链接 问题')
})

test('代码块与图片不进入提示卡', () => {
  const md = '### 修复\n```js\nconst a = 1\n```\n- 图标 ![logo](x.png) 已更新'
  assert.equal(notesExcerpt(md), '修复 图标 已更新')
})

test('空说明返回空串（提示卡据此不画那一段）', () => {
  assert.equal(notesExcerpt(''), '')
  assert.equal(notesExcerpt('   \n\n '), '')
})

test('超长说明按码点截断并带省略号', () => {
  const excerpt = notesExcerpt('- 一二三四五六七八九十', 6)
  assert.equal(excerpt, '一二三四五六…')
  // 中文与 emoji 不被劈成半个
  assert.equal(Array.from(notesExcerpt('😀😀😀😀😀', 3)).length, 4)
})
