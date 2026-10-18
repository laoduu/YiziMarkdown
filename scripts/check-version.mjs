/**
 * 校验三处版本号是否一致：package.json / src-tauri/tauri.conf.json / src-tauri/Cargo.toml。
 *
 * 为什么需要这个检查：
 *   三处版本号各有用途，且**没有任何一处在编译期被校验**：
 *     - package.json      → npm 生态与前端可见的版本
 *     - tauri.conf.json   → 打包产物名、安装包版本，**也是在线更新比较版本的依据**
 *     - Cargo.toml        → get_app_version 返回给界面的版本（env!("CARGO_PKG_VERSION")）
 *   不一致时最典型的后果：界面显示 0.3.4，而 updater 拿 0.3.5 去比 —— 用户看到「有新版本」，
 *   更新完版本号却没变；或者反过来，永远提示同一个版本。
 *   这类问题只在打包之后才暴露，排查成本很高，所以在 npm run build 里前置拦掉。
 *
 * 用法：node scripts/check-version.mjs
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Cargo.toml 只认 [package] 段里的 version —— 依赖行里也有大量 version = */
function cargoPackageVersion(src) {
  let inPackage = false
  for (const rawLine of src.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.startsWith('[')) {
      inPackage = line === '[package]'
      continue
    }
    if (!inPackage) continue
    const m = /^version\s*=\s*"([^"]*)"/.exec(line)
    if (m) return m[1]
  }
  return null
}

const sources = [
  {
    label: 'package.json',
    file: 'package.json',
    read: () => JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version,
  },
  {
    label: 'tauri.conf.json',
    file: 'src-tauri/tauri.conf.json',
    read: () => JSON.parse(readFileSync(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8')).version,
  },
  {
    label: 'Cargo.toml',
    file: 'src-tauri/Cargo.toml',
    read: () => cargoPackageVersion(readFileSync(join(root, 'src-tauri', 'Cargo.toml'), 'utf8')),
  },
]

const found = sources.map((s) => {
  let value = null
  try {
    value = s.read()
  } catch (e) {
    console.error(`✗ 读不出 ${s.label} 的版本号（${s.file}）：${e.message}`)
    process.exit(1)
  }
  if (!value) {
    console.error(`✗ ${s.label}（${s.file}）里找不到版本号`)
    process.exit(1)
  }
  return { ...s, value }
})

const unique = [...new Set(found.map((f) => f.value))]
if (unique.length > 1) {
  const width = Math.max(...found.map((f) => f.label.length))
  console.error('\n✗ 三处版本号不一致：\n')
  for (const f of found) {
    console.error(`    ${f.label.padEnd(width)}  ${f.value}   (${f.file})`)
  }
  console.error(
    '\n  发版前这三处必须同步。其中：\n' +
      '    tauri.conf.json 是**在线更新比较版本**的依据（编译进 exe）\n' +
      '    Cargo.toml     是界面「关于」里显示版本的来源（get_app_version）\n' +
      '  两者不一致会导致「提示有新版，更新完版本号却没变」这类问题。\n',
  )
  process.exit(1)
}

console.log(`✓ 版本号一致（${unique[0]}）：package.json / tauri.conf.json / Cargo.toml`)
