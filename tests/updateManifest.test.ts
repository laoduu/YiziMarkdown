// 在线更新清单（latest.json）构造逻辑的单测。
// 运行：node --experimental-transform-types --test tests/updateManifest.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildManifest } from '../src/lib/updateManifest.ts'

const sig = 'dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZQo='

const winArtifacts = [
  {
    platform: 'windows-x86_64-nsis',
    url: 'https://x.tos-cn-beijing.volces.com/updates/YiziMarkdown_0.3.5_x64-setup.exe',
    signature: sig,
  },
  {
    platform: 'windows-x86_64',
    url: 'https://x.tos-cn-beijing.volces.com/updates/YiziMarkdown_0.3.5_x64-setup.exe',
    signature: sig,
  },
]

// ---------- 正常构造 ----------

test('buildManifest: 字段齐全、顺序固定', () => {
  const m = buildManifest({
    version: '0.3.5',
    notes: '## 新增\n- 在线更新',
    artifacts: winArtifacts,
    pubDate: '2026-10-20T10:00:00Z',
  })
  assert.deepEqual(Object.keys(m), ['version', 'notes', 'pub_date', 'platforms'])
  assert.equal(m.version, '0.3.5')
  assert.equal(m.notes, '## 新增\n- 在线更新')
  assert.equal(m.pub_date, '2026-10-20T10:00:00Z')
  assert.deepEqual(m.platforms['windows-x86_64-nsis'], {
    signature: sig,
    url: 'https://x.tos-cn-beijing.volces.com/updates/YiziMarkdown_0.3.5_x64-setup.exe',
  })
})

test('buildManifest: 版本号去掉前导 v（否则界面会拼出 vv0.3.5）', () => {
  assert.equal(buildManifest({ version: 'v0.3.5', notes: '', artifacts: winArtifacts }).version, '0.3.5')
  assert.equal(buildManifest({ version: ' v0.3.5 ', notes: '', artifacts: winArtifacts }).version, '0.3.5')
})

test('buildManifest: 同一安装包可以挂在多个平台键下（NSIS 与兜底键）', () => {
  const m = buildManifest({ version: '0.3.5', notes: '', artifacts: winArtifacts })
  assert.deepEqual(Object.keys(m.platforms).sort(), ['windows-x86_64', 'windows-x86_64-nsis'])
  assert.equal(m.platforms['windows-x86_64'].url, m.platforms['windows-x86_64-nsis'].url)
})

test('buildManifest: 可以同时给出 Windows 与 macOS', () => {
  const m = buildManifest({
    version: '0.3.5',
    notes: '',
    artifacts: [
      ...winArtifacts,
      { platform: 'darwin-aarch64', url: 'https://x/u/YiziMarkdown_0.3.5_universal.app.tar.gz', signature: sig },
      { platform: 'darwin-x86_64', url: 'https://x/u/YiziMarkdown_0.3.5_universal.app.tar.gz', signature: sig },
    ],
  })
  assert.equal(Object.keys(m.platforms).length, 4)
})

// ---------- pub_date ----------

test('buildManifest: 未给 pubDate 时用当前时间，且是 RFC3339', () => {
  const { pub_date } = buildManifest({ version: '0.3.5', notes: '', artifacts: winArtifacts })
  assert.match(pub_date, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/)
  assert.ok(!Number.isNaN(Date.parse(pub_date)))
})

test('buildManifest: pubDate 可以传 Date（便于复现同一份清单）', () => {
  const d = new Date('2026-10-20T10:00:00Z')
  assert.equal(buildManifest({ version: '0.3.5', notes: '', artifacts: winArtifacts, pubDate: d }).pub_date, d.toISOString())
})

// ---------- 校验：宁可构建期报错，也不要发出一份客户端读不懂的清单 ----------

test('buildManifest: 版本号为空时抛错', () => {
  assert.throws(() => buildManifest({ version: '', notes: '', artifacts: winArtifacts }), /version 不能为空/)
  assert.throws(() => buildManifest({ version: 'v', notes: '', artifacts: winArtifacts }), /version 不能为空/)
})

test('buildManifest: 没有任何产物时抛错', () => {
  assert.throws(() => buildManifest({ version: '0.3.5', notes: '', artifacts: [] }), /至少要有一个平台产物/)
})

test('buildManifest: 平台键重复时抛错（否则会静默丢一个产物）', () => {
  assert.throws(
    () => buildManifest({ version: '0.3.5', notes: '', artifacts: [winArtifacts[0], winArtifacts[0]] }),
    /平台键重复/,
  )
})

test('buildManifest: 签名为空（.sig 缺失或为空）时抛错', () => {
  const bad = [{ platform: 'windows-x86_64', url: 'https://x/a.exe', signature: '   ' }]
  assert.throws(() => buildManifest({ version: '0.3.5', notes: '', artifacts: bad }), /签名为空/)
})

test('buildManifest: 缺少下载地址时抛错', () => {
  const bad = [{ platform: 'windows-x86_64', url: '', signature: sig }]
  assert.throws(() => buildManifest({ version: '0.3.5', notes: '', artifacts: bad }), /缺少下载地址/)
})

test('buildManifest: 签名两侧空白会被裁掉（.sig 文件常带尾随换行）', () => {
  const noisy = [{ platform: 'windows-x86_64', url: 'https://x/a.exe', signature: `\n${sig}\n` }]
  assert.equal(buildManifest({ version: '0.3.5', notes: '', artifacts: noisy }).platforms['windows-x86_64'].signature, sig)
})
