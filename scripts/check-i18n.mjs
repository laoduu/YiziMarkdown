/**
 * i18n 一致性检查。
 *
 * 1) 以 en.ts 为基准，列出各语言缺失 / 多余的键（缺失会回退到英文，属"未翻译"）
 * 2) 列出定义了但代码里从未引用的键（死键，应从所有语言删除）
 *
 * 用法：node scripts/check-i18n.mjs [--unused]
 *
 * 注意：动态拼出来的键（如 t(`settings.${p.i18nKey}`)）无法静态识别，
 * 会出现在"未使用"里，需人工判断。故 --unused 仅作提示，不作为失败条件。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const i18nDir = join(root, 'src', 'i18n')

/**
 * 解析 i18n 字典：命名空间缩进 2 空格、键缩进 4 空格（本项目的固定风格）。
 * 只取形如 `key: 'value'` 的单行字符串值。
 *
 * 注意：值可能用单引号也可能用双引号（如 en.ts 的 `discard: "Don't Save"`），
 * 两种都要认 —— 只认单引号会把这类键误判成"缺失"。
 */
function parseDict(file) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/)
  const out = new Map()
  let ns = null
  for (const line of lines) {
    const nsMatch = /^ {2}(\w+):\s*\{/.exec(line)
    if (nsMatch) { ns = nsMatch[1]; continue }
    if (/^ {2}\}/.test(line)) { ns = null; continue }
    if (!ns) continue
    const kv = /^ {4}(\w+):\s*['"]/.exec(line)
    if (kv) out.set(`${ns}.${kv[1]}`, line.trim())
  }
  return out
}

const files = readdirSync(i18nDir).filter((n) => n.endsWith('.ts') && n !== 'index.ts')
const dicts = new Map(files.map((f) => [f.replace('.ts', ''), parseDict(join(i18nDir, f))]))
const reference = dicts.get('en')
if (!reference) throw new Error('找不到 src/i18n/en.ts')

/** 取某键的完整英文原文（供翻译用） */
function enValue(key) {
  const [ns, k] = key.split('.')
  const text = readFileSync(join(i18nDir, 'en.ts'), 'utf8')
  const nsIdx = text.indexOf(`\n  ${ns}: {`)
  if (nsIdx < 0) return ''
  const body = text.slice(nsIdx + 1)
  const end = body.indexOf('\n  },')
  const seg = end > 0 ? body.slice(0, end) : body
  const m = new RegExp(`^ {4}${k}: ['"](.*)['"],$`, 'm').exec(seg)
  return m ? m[1].replace(/\\'/g, "'") : ''
}

// ---- 0) --dump <lang>：输出该语言缺失键的英文原文，供翻译 ----
const dumpIdx = process.argv.indexOf('--dump')
if (dumpIdx >= 0) {
  const lang = process.argv[dumpIdx + 1]
  const d = dicts.get(lang)
  if (!d) throw new Error(`未知语言：${lang}（可选：${[...dicts.keys()].join(', ')}）`)
  const missing = [...reference.keys()].filter((k) => !d.has(k))
  console.log(`# ${lang} 缺失 ${missing.length} 个键`)
  for (const k of missing) console.log(`${k}\t${enValue(k)}`)
  process.exit(0)
}

const showUnused = process.argv.includes('--unused')

/** 取出值里的插值占位符集合，如 `{name}` */
function placeholders(rawLine) {
  const value = rawLine.slice(rawLine.indexOf(':') + 1)
  return [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')
}

// ---- 1) 各语言与英文的差异 + 占位符一致性 ----
const langs = [...dicts.keys()].filter((l) => l !== 'en').sort()
let totalMissing = 0
const report = []
const placeholderProblems = []
for (const lang of langs) {
  const d = dicts.get(lang)
  const missing = [...reference.keys()].filter((k) => !d.has(k))
  const extra = [...d.keys()].filter((k) => !reference.has(k))
  // 占位符必须与英文逐字一致：漏掉 {name} 会让界面出现字面量或丢信息
  for (const k of [...d.keys()]) {
    if (!reference.has(k)) continue
    const want = placeholders(reference.get(k))
    const got = placeholders(d.get(k))
    if (want !== got) {
      placeholderProblems.push(`${lang} ${k}\n    英文: {${want}}\n    译文: {${got}}`)
    }
  }
  totalMissing += missing.length
  report.push({ lang, missing, extra })
}

console.log(`基准 en.ts 共 ${reference.size} 个键，另有 ${langs.length} 种语言\n`)
for (const { lang, missing, extra } of report) {
  const status = missing.length === 0 && extra.length === 0 ? '✓ 一致' : `缺 ${missing.length}`
  console.log(`  ${lang.padEnd(7)} ${status}${extra.length ? `  多 ${extra.length}` : ''}`)
  if (missing.length && missing.length <= 12) {
    console.log(`          ${missing.join(', ')}`)
  } else if (missing.length) {
    console.log(`          前 12 个：${missing.slice(0, 12).join(', ')} …`)
  }
  if (extra.length) console.log(`          多余：${extra.join(', ')}`)
}

// ---- 2) 死键检测 ----
if (showUnused) {
  const walk = (dir, acc = []) => {
    for (const n of readdirSync(dir)) {
      if (['node_modules', 'target', 'dist', '.git', 'i18n'].includes(n)) continue
      const full = join(dir, n)
      if (statSync(full).isDirectory()) walk(full, acc)
      else if (/\.(ts|tsx)$/.test(n)) acc.push(full)
    }
    return acc
  }
  const code = walk(join(root, 'src')).map((f) => readFileSync(f, 'utf8')).join('\n')
  const unused = [...reference.keys()].filter((k) => !code.includes(`'${k}'`))
  console.log(`\n=== 定义了但代码中未引用的键（${unused.length} 个，需人工确认是否动态拼接）===`)
  for (const k of unused) console.log(`  ${k}`)
}

// ---- 3) 占位符一致性（硬性错误，必须为 0）----
if (placeholderProblems.length) {
  console.error(`\n✗ 占位符不一致（${placeholderProblems.length} 处，会导致插值失效）：\n`)
  console.error(placeholderProblems.join('\n'))
} else {
  console.log(`\n✓ 占位符一致性通过（所有语言与英文的 {name}/{count}/{msg} 完全一致）`)
}

console.log(`\n合计缺失 ${totalMissing} 个键${totalMissing ? '（缺失的键会回退显示英文，不是崩溃）' : ''}`)

// 退出码语义：
//   - 占位符不一致 = 真 bug（插值失效），必须失败
//   - 缺键 = 未翻译，默认只告警；加 --strict 才视为失败
//     （历史遗留的缺键不应阻塞构建，但也别让它们被忽略）
if (placeholderProblems.length) process.exit(1)
process.exit(process.argv.includes('--strict') && totalMissing > 0 ? 1 : 0)
