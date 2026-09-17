/**
 * 远程路径工具的单元测试。
 *
 * 用 Node 内置测试运行器（无需任何依赖）：
 *   npm test        （即 node --test tests/remotePath.test.ts）
 *
 * 放在 `tests/` 而不是 `src/`：vite 会监视 src 并对其中的文件变更触发页面重载，
 * 测试文件放在 src 里会无谓地打断开发中的热更新。
 *
 * 这些函数刻意放在零依赖的 remotePath.ts 里，就是为了能被 Node 直接加载 ——
 * `lib/webdav.ts` 有无扩展名的 `./tauri` 导入，Node 的 ESM 解析器加载不了。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeBaseUrl,
  joinPath,
  parentPath,
  baseName,
  normalizeRemotePath,
  canonicalRemotePath,
  formatSize,
} from '../src/lib/remotePath.ts'

test('normalizeBaseUrl 补结尾斜杠且幂等', () => {
  assert.equal(normalizeBaseUrl('https://dav.example.com/dav'), 'https://dav.example.com/dav/')
  assert.equal(normalizeBaseUrl('https://dav.example.com/dav/'), 'https://dav.example.com/dav/')
  assert.equal(normalizeBaseUrl('  https://host/dav  '), 'https://host/dav/')
  assert.equal(normalizeBaseUrl(''), '')
  assert.equal(normalizeBaseUrl('   '), '')
})

test('parentPath 覆盖根目录与多级路径', () => {
  assert.equal(parentPath('/Notes/doc.md'), '/Notes')
  assert.equal(parentPath('/a/b/doc.md'), '/a/b')
  assert.equal(parentPath('/doc.md'), '/')
  assert.equal(parentPath('/'), '/')
  // 目录条目带结尾斜杠（来自服务器 href），其父目录仍是上一层
  assert.equal(parentPath('/Notes/'), '/')
  assert.equal(parentPath('/a/b/'), '/a')
})

test('joinPath 不产生双斜杠', () => {
  assert.equal(joinPath('/', 'a.md'), '/a.md')
  assert.equal(joinPath('/Notes', 'a.md'), '/Notes/a.md')
  assert.equal(joinPath('/Notes/', 'a.md'), '/Notes/a.md')
  assert.equal(joinPath('/Notes/', 'images'), '/Notes/images')
})

test('baseName 取最后一段', () => {
  assert.equal(baseName('/Notes/a.md'), 'a.md')
  assert.equal(baseName('/Notes/'), 'Notes')
  assert.equal(baseName('/a.md'), 'a.md')
})

test('normalizeRemotePath 抹平结尾斜杠', () => {
  assert.equal(normalizeRemotePath('/Notes/'), '/Notes')
  assert.equal(normalizeRemotePath('/Notes'), '/Notes')
  assert.equal(normalizeRemotePath('/'), '/')
  assert.equal(normalizeRemotePath(''), '/')
  assert.equal(normalizeRemotePath('/a/b///'), '/a/b')
})

/**
 * 这条是本次自动刷新功能的关键不变量：
 * 目录条目的 path 带结尾斜杠，而 parentPath(文件) 不带，两者必须被判为同一目录。
 * 若哪天有人把 normalizeRemotePath 去掉，这个测试会立刻失败。
 */
test('目录条目的 path 与 parentPath 结果必须匹配同一目录', () => {
  const cases: Array<[string, string]> = [
    // [服务器返回的目录条目 path, 在该目录下保存文件后算出的目录]
    ['/Notes/', parentPath('/Notes/doc.md')],
    ['/', parentPath('/doc.md')],
    ['/a/b/', parentPath('/a/b/doc.md')],
  ]
  for (const [entryPath, computedDir] of cases) {
    assert.equal(
      normalizeRemotePath(entryPath),
      normalizeRemotePath(computedDir),
      `归一化后应相等：${entryPath} vs ${computedDir}`
    )
  }
})

test('非根目录下，未归一化的两种写法确实不相等', () => {
  // 这是"必须归一化"的证据：直接比较会永远不匹配，自动刷新会静默失效
  assert.notEqual('/Notes/', parentPath('/Notes/doc.md'))
  assert.notEqual('/a/b/', parentPath('/a/b/doc.md'))
  // 根目录是唯一两种写法恰好一致的例外
  assert.equal('/', parentPath('/doc.md'))
})

test('不同目录归一化后不得相等', () => {
  assert.notEqual(normalizeRemotePath('/Notes/'), normalizeRemotePath('/Other/'))
  assert.notEqual(normalizeRemotePath('/a/b/'), normalizeRemotePath('/a/'))
  // 注意 /Notes 与 /NotesX 是不同目录，前缀匹配不算相等
  assert.notEqual(normalizeRemotePath('/Notes/'), normalizeRemotePath('/NotesX/'))
})

test('formatSize 输出可读大小', () => {
  assert.equal(formatSize(0), '0 B')
  assert.equal(formatSize(512), '512 B')
  assert.equal(formatSize(2048), '2.0 KB')
  assert.equal(formatSize(5 * 1024 * 1024), '5.0 MB')
  // 异常输入不抛错、不输出 NaN
  assert.equal(formatSize(Number.NaN), '—')
  assert.equal(formatSize(-1), '—')
})

test('canonicalRemotePath 收敛各种写法', () => {
  assert.equal(canonicalRemotePath('/Notes/a.md'), '/Notes/a.md')
  assert.equal(canonicalRemotePath('Notes/a.md'), '/Notes/a.md')
  assert.equal(canonicalRemotePath('/Notes//a.md'), '/Notes/a.md')
  assert.equal(canonicalRemotePath('//Notes///a.md'), '/Notes/a.md')
  assert.equal(canonicalRemotePath('/Notes/./a.md'), '/Notes/a.md')
  assert.equal(canonicalRemotePath('/Notes/sub/../a.md'), '/Notes/a.md')
  assert.equal(canonicalRemotePath('/Notes/a.md/'), '/Notes/a.md')
  assert.equal(canonicalRemotePath('  /Notes/a.md  '), '/Notes/a.md')
  assert.equal(canonicalRemotePath('/'), '/')
  assert.equal(canonicalRemotePath(''), '/')
  // 越出根目录必须拒绝
  assert.equal(canonicalRemotePath('/..'), null)
  assert.equal(canonicalRemotePath('../a.md'), null)
  assert.equal(canonicalRemotePath('/Notes/../../a.md'), null)
})

/**
 * 回归测试：这个 bug 真实发生过 —— 新建文档保存到云端后再从云端打开，
 * 会多开一个 tab。根因是 webdavLastPath（目录条目，带结尾斜杠）与文件名
 * 用朴素字符串拼接，得到 /Notes//doc.md，与云端列表返回的 /Notes/doc.md 不一致，
 * 导致按远程路径去重失败。
 */
test('回归：目录路径 + 文件名拼接后必须与云端列表路径一致', () => {
  const webdavLastPath = '/Notes/' // 目录条目来自服务器 href，带结尾斜杠
  const fileName = 'doc.md'

  // 错误写法（曾经导致重复 tab）：朴素拼接
  const naive = `${webdavLastPath}/${fileName}`
  assert.equal(naive, '/Notes//doc.md')

  // 正确写法：joinPath，再规范化
  const composed = canonicalRemotePath(joinPath(webdavLastPath, fileName))
  // 云端浏览器打开该文件时传的路径（来自服务器 href 解析，已是规范形式）
  const fromCloudBrowser = '/Notes/doc.md'

  assert.equal(composed, fromCloudBrowser, '保存时记录的路径必须与云端列表一致')
  // 规范化比较也应相等（tab 去重用的就是这个比较）
  assert.equal(canonicalRemotePath(naive), canonicalRemotePath(fromCloudBrowser))
})

test('回归：不同文件/目录规范化后仍必须可区分', () => {
  // 规范化不能把不同目标折叠成一个，否则去重会错误地复用 tab
  assert.notEqual(canonicalRemotePath('/Notes/a.md'), canonicalRemotePath('/Notes/b.md'))
  assert.notEqual(canonicalRemotePath('/Notes/a.md'), canonicalRemotePath('/Other/a.md'))
  // 但同一目标的不同写法必须折叠
  assert.equal(canonicalRemotePath('/Notes/a.md'), canonicalRemotePath('//Notes//a.md'))
})
