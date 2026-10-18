/**
 * 生成在线更新清单 latest.json（tauri-plugin-updater 的静态端点格式）。
 *
 * 为什么需要它：updater 只认这一种格式，且写错的表现是**客户端静默查不到更新**——
 * 平台键拼错、签名漏了、版本号带了个多余的 v，都不会有任何报错，只是「没有更新」。
 * 所以把组装逻辑放进 src/lib/updateManifest.ts 并单测，本脚本只做读文件 + 写文件。
 *
 * 用法（注意：要读 .ts 纯函数，必须带 --experimental-transform-types，与 npm test 同款）：
 *   node --experimental-transform-types scripts/make-manifest.mjs \
 *     --version 0.3.5 \
 *     --notes docs/changelog/CHANGELOG-V0.3.5.md \
 *     --base-url https://yizimarkdown.tos-cn-beijing.volces.com/updates \
 *     --artifact windows-x86_64-nsis=src-tauri/target/release/bundle/nsis/YiziMarkdown_0.3.5_x64-setup.exe \
 *     --artifact windows-x86_64=src-tauri/target/release/bundle/nsis/YiziMarkdown_0.3.5_x64-setup.exe \
 *     --out .release_tmp/latest.json
 *
 * 签名不是路径而是内容：脚本自动读 `<产物路径>.sig`（由 tauri.conf.json 的
 * bundle.createUpdaterArtifacts = true 生成）。
 *
 * 上传顺序（很重要）：先传产物，**最后**传 latest.json，并给它设 Cache-Control: no-cache。
 * 否则客户端会拿着旧清单一直「没有更新」。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname, basename, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildManifest } from '../src/lib/updateManifest.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const USAGE = `
生成在线更新清单 latest.json

  --version <ver>             必填，新版本号（允许带 v，会归一化掉）
  --notes <file>              必填，更新说明文件（Markdown），如 docs/changelog/CHANGELOG-V0.3.5.md
  --base-url <url>            必填，产物所在目录的 URL 前缀（结尾斜杠可有可无）
  --artifact <平台键>=<路径>  必填，可重复。签名自动读 <路径>.sig
  --out <file>                输出路径，默认 .release_tmp/latest.json
  --pub-date <rfc3339>        可选，固定发布日期（复现同一份清单时用）
  --dry-run                   只打印，不写文件

例：
  node --experimental-transform-types scripts/make-manifest.mjs \\
    --version 0.3.5 --notes docs/changelog/CHANGELOG-V0.3.5.md \\
    --base-url https://example.tos-cn-beijing.volces.com/updates \\
    --artifact windows-x86_64-nsis=<nsis 安装包路径> \\
    --artifact windows-x86_64=<同上>
`

function fail(message) {
  console.error(`\n✗ ${message}\n`)
  console.error(USAGE)
  process.exit(1)
}

const args = process.argv.slice(2)
const opts = { artifacts: [], out: '.release_tmp/latest.json', dryRun: false }

for (let i = 0; i < args.length; i++) {
  const flag = args[i]
  const nextValue = () => {
    const value = args[++i]
    if (value === undefined) fail(`参数 ${flag} 缺少取值`)
    return value
  }
  switch (flag) {
    case '--version': opts.version = nextValue(); break
    case '--notes': opts.notesFile = nextValue(); break
    case '--base-url': opts.baseUrl = nextValue(); break
    case '--artifact': opts.artifacts.push(nextValue()); break
    case '--out': opts.out = nextValue(); break
    case '--pub-date': opts.pubDate = nextValue(); break
    case '--dry-run': opts.dryRun = true; break
    case '--help': case '-h': console.log(USAGE); process.exit(0); break
    default: fail(`未知参数：${flag}`)
  }
}

for (const required of ['version', 'notesFile', 'baseUrl']) {
  if (!opts[required]) fail(`缺少 --${required === 'notesFile' ? 'notes' : required === 'baseUrl' ? 'base-url' : required}`)
}
if (!opts.artifacts.length) fail('至少需要一个 --artifact <平台键>=<路径>')

// ---- 更新说明：归一化换行，避免把 CRLF 带进 notes ----
const notesPath = resolve(root, opts.notesFile)
if (!existsSync(notesPath)) fail(`找不到更新说明文件：${opts.notesFile}`)
const notes = readFileSync(notesPath, 'utf8').replace(/\r\n/g, '\n').trimEnd()

// ---- 对照 tauri.conf.json 的版本号：不一致多半是忘了同步或拼错了路径 ----
try {
  const confVersion = JSON.parse(readFileSync(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8')).version
  if (confVersion !== String(opts.version).replace(/^v/i, '')) {
    console.warn(
      `⚠ --version ${opts.version} 与 tauri.conf.json 的 ${confVersion} 不一致。\n` +
        '  若这次不是给「已构建好的那个版本」发清单，请先同步版本号（npm run check:version）。',
    )
  }
} catch {
  console.warn('⚠ 读不出 src-tauri/tauri.conf.json 的版本号，跳过一致性提示')
}

// ---- 产物与签名 ----
const baseUrl = opts.baseUrl.replace(/\/+$/, '')
const artifacts = opts.artifacts.map((spec) => {
  const eq = spec.indexOf('=')
  if (eq <= 0) fail(`--artifact 格式应为 <平台键>=<路径>，收到：${spec}`)
  const platform = spec.slice(0, eq).trim()
  const filePath = resolve(root, spec.slice(eq + 1).trim())

  if (!existsSync(filePath)) fail(`找不到产物文件：${relative(root, filePath)}`)
  const sigPath = `${filePath}.sig`
  if (!existsSync(sigPath)) {
    fail(
      `找不到签名文件：${relative(root, sigPath)}\n` +
        '  签名由 tauri.conf.json 的 bundle.createUpdaterArtifacts = true 生成；\n' +
        '  若确实没有，说明这次构建没打开该选项，或拿错了产物目录。',
    )
  }

  return {
    platform,
    url: `${baseUrl}/${basename(filePath)}`,
    signature: readFileSync(sigPath, 'utf8'),
  }
})

// ---- 组装 + 写出 ----
let manifest
try {
  manifest = buildManifest({
    version: opts.version,
    notes,
    artifacts,
    pubDate: opts.pubDate,
  })
} catch (e) {
  fail(e.message)
}

const json = `${JSON.stringify(manifest, null, 2)}\n`

if (opts.dryRun) {
  console.log(json)
  process.exit(0)
}

const outPath = resolve(root, opts.out)
mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, json, 'utf8')

console.log(`✓ 已生成 ${relative(root, outPath)}`)
console.log(`  版本：${manifest.version}`)
console.log(`  说明：${relative(root, notesPath)}（${manifest.notes.split('\n').length} 行）`)
for (const [platform, entry] of Object.entries(manifest.platforms)) {
  console.log(`  平台：${platform}  →  ${entry.url}`)
}
console.log(
  '\n上传顺序：先传全部产物，**最后**传 latest.json，并给它设 Cache-Control: no-cache。\n' +
    '否则客户端会拿着旧清单一直「没有更新」。',
)
