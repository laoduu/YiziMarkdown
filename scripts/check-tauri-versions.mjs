#!/usr/bin/env node
/**
 * 发版前守卫：Tauri 的 npm 包与 Rust crate 必须同 major.minor。
 *
 * 为什么单列一条：`tauri build` 自己的报错在「查版本」这一步才出现，而 npm 侧历史上用的是
 * `^` 范围 —— 一次普通的 `npm install` 就能把 @tauri-apps/api 抬到比 Rust crate 高一个
 * 小版本，于是**整个发版流程第一步就断掉**。2026-10-18 实际发生：
 * npm api 2.12.4 / plugin-updater 2.14.0 vs Rust tauri 2.11.2 / plugin 2.12.0。
 * 而这类错误在 `npm run build`（纯前端）里完全看不出来，只有真正打包时才炸。
 *
 * 判定规则与 CLI 完全一致（**只比 major.minor**，patch 不参与）：
 *   tauri (crate)        ↔ @tauri-apps/api
 *   tauri-plugin-updater ↔ @tauri-apps/plugin-updater
 * 两侧「整组一起升」，所以 package.json 里这几个包写**精确版本**、不用 `^`。
 *
 * 读的是 Cargo.lock 与 package-lock.json（不是 node_modules），所以不依赖已安装目录；
 * 任一侧查不到（例如刚清空 lock）就跳过，不误报。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const readText = (p) => fs.readFileSync(path.join(root, p), 'utf8')

const majorMinor = (v) => v.split('.').slice(0, 2).join('.')

/** 从 Cargo.lock 里取某个 crate 的解析版本 */
const crateVersion = (lockText, name) => {
  const re = new RegExp(`\\[\\[package\\]\\]\\r?\\nname = "${name}"\\r?\\nversion = "([^"]+)"`)
  const m = re.exec(lockText)
  return m ? m[1] : null
}

const npmVersion = (lock, pkg) => lock.packages?.[`node_modules/${pkg}`]?.version ?? null

const PAIRS = [
  ['tauri', '@tauri-apps/api'],
  ['tauri-plugin-updater', '@tauri-apps/plugin-updater'],
]

const cargoLock = readText('src-tauri/Cargo.lock')
const npmLock = JSON.parse(readText('package-lock.json'))

const mismatches = []
const notes = []

for (const [crate, pkg] of PAIRS) {
  const c = crateVersion(cargoLock, crate)
  const n = npmVersion(npmLock, pkg)
  if (!c || !n) {
    notes.push(`跳过 ${crate} ↔ ${pkg}（lock 里没查到：crate=${c ?? '—'} npm=${n ?? '—'}）`)
    continue
  }
  if (majorMinor(c) === majorMinor(n)) {
    notes.push(`✓ ${crate} (v${c}) ↔ ${pkg} (v${n})`)
  } else {
    mismatches.push(`${crate} (v${c}) : ${pkg} (v${n})`)
  }
}

// CLI 版本只提示、不判失败：CLI 的检查规则里没有它自己这一项
const cli = npmVersion(npmLock, '@tauri-apps/cli')
const tauriCrate = crateVersion(cargoLock, 'tauri')
if (cli && tauriCrate && majorMinor(cli) !== majorMinor(tauriCrate)) {
  notes.push(`注意 @tauri-apps/cli (v${cli}) 与 tauri crate (v${tauriCrate}) 不同 major.minor —— 建议同组一起升`)
}

if (mismatches.length) {
  console.error('\n✗ Tauri 的 npm 包与 Rust crate 版本不同 major.minor，`tauri build` 会直接报错退出：')
  for (const line of mismatches) console.error(`  ${line}`)
  console.error(
    [
      '',
      '  修法二选一（改完记得同步 lock）：',
      '   A) 让 npm 侧对齐 Rust（推荐：Rust 侧是已实测过的行为）',
      '      把 package.json 里 @tauri-apps/api / @tauri-apps/plugin-updater 改成与上面 Rust 版本',
      '      同 major.minor 的**精确版本**（别用 ^），再 npm install',
      '   B) 让 Rust 侧对齐 npm',
      '      src-tauri/Cargo.toml 里把 tauri / tauri-plugin-updater 提到对应 major.minor，',
      '      再 cargo update -p tauri -p tauri-plugin-updater',
      '',
    ].join('\n'),
  )
  process.exit(1)
}

console.log('Tauri 版本对齐：')
for (const line of notes) console.log(`  ${line}`)
