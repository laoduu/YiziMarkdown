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

// ---- 2b) 代码用到、但 en.ts 没定义的键 ----
// 后果：界面上直接显示 `settings.foo` 这种原始键名（不崩溃，但等于没翻译）。
// 上面的 1) 只比对各语言之间的齐不齐，查不到这个方向，所以单独再查一遍。
//
// 分两类：
//   · 静态  t('ns.key') —— 正则直接取字面量
//   · 动态  t(`ns.${x}`) —— 模板字面量无法求值，按「前缀 + 取值来源」显式声明，
//         把它展开成完整键再比对。**新增动态键时必须在这里补一条，否则又是盲区。**
function walkSrc(dir, acc = []) {
  for (const n of readdirSync(dir)) {
    if (['node_modules', 'target', 'dist', '.git', 'i18n'].includes(n)) continue
    const full = join(dir, n)
    if (statSync(full).isDirectory()) walkSrc(full, acc)
    else if (/\.(ts|tsx)$/.test(n)) acc.push(full)
  }
  return acc
}

const srcFiles = walkSrc(join(root, 'src'))
const STATIC_T = /\bt\(\s*'([^']+)'/g
const STATIC_TPL = /\bt\(\s*`([^`$]*)\$/g

const staticUsed = new Set()
const dynamicPrefixes = new Set()
const noNamespace = []
for (const file of srcFiles) {
  const text = readFileSync(file, 'utf8')
  // 本文件里可能定义了**带命名空间前缀的局部包装器**，典型写法：
  //   const t = (k: string) => translate(lang, `properties.${k}`)
  // 此时 t('editSource') 的真实键是 properties.editSource —— 裸键（不带点）必须靠它补全。
  const wrapper = /(?:const|let|var)\s+t\s*=\s*\([^)]*\)\s*=>\s*translate\([^,]+,\s*`([^`$]*)\$\{/.exec(text)
  const prefix = wrapper ? wrapper[1] : ''

  for (const m of text.matchAll(STATIC_T)) {
    const key = m[1]
    if (key.includes('.')) { staticUsed.add(key); continue }
    if (prefix) { staticUsed.add(prefix + key); continue }
    // 本项目约定所有键都带命名空间（如 settings.xxx），裸键几乎一定是漏了前缀
    noNamespace.push(`${file.slice(root.length + 1)} → t('${key}')`)
  }
  for (const m of text.matchAll(/\btranslate\([^,]+,\s*['"]([^'"]+)['"]/g)) {
    if (m[1].includes('.')) staticUsed.add(m[1])
  }
  // 模板字面量取「${ 之前」的前缀，用于报告未声明来源的动态键
  for (const m of text.matchAll(STATIC_TPL)) dynamicPrefixes.add(m[1])
}

// 动态键的取值来源：展开成完整键
const dynamicKeys = new Set()
// a) i18nKey: 'xxx' → settings.xxx（AI 供应商 / 插件配置项，两处都用 settings. 命名空间）
for (const file of srcFiles) {
  for (const m of readFileSync(file, 'utf8').matchAll(/\bi18nKey:\s*'([^']+)'/g)) {
    dynamicKeys.add(`settings.${m[1]}`)
  }
}
// b) 属性面板的类型菜单：properties.type{Auto,Text,…}（来自 cm-properties.ts 的 TYPES 枚举）
try {
  const props = readFileSync(join(root, 'src', 'lib', 'cm-properties.ts'), 'utf8')
  const arr = /const TYPES: FrontMatterPropType\[\] = \[([^\]]+)\]/.exec(props)
  if (arr) {
    for (const v of arr[1].matchAll(/'([^']+)'/g)) {
      const ty = v[1]
      dynamicKeys.add(`properties.type${ty[0].toUpperCase()}${ty.slice(1)}`)
    }
  }
} catch { /* 文件结构变了时跳过，由下面的"未声明前缀"提示兜底 */ }

const usedButUndefined = [
  ...[...staticUsed].filter((k) => !reference.has(k)).map((k) => `静态 ${k}`),
  ...[...dynamicKeys].filter((k) => !reference.has(k)).map((k) => `动态 ${k}`),
]
// 动态前缀里没声明取值来源的 —— 报出来提醒补，否则是盲区
// 注：'type' 是 cm-properties.ts 里 t(`type${…}`) 的模板前缀，
//     外层 t() 包装器会补上 `properties.`，完整键 properties.typeXxx 已由上面 b) 展开并校验过。
const knownPrefixes = ['settings.', 'properties.type', 'type']
const unknownPrefixes = [...dynamicPrefixes].filter(
  (p) => !knownPrefixes.some((k) => p.startsWith(k))
)

console.log(`\n=== 用到但未定义 ===`)
if (usedButUndefined.length === 0) {
  console.log(`✓ 静态与动态键全部已定义（静态 ${staticUsed.size} / 动态 ${dynamicKeys.size}）`)
} else {
  console.log(`✗ ${usedButUndefined.length} 个（界面上会显示原始键名）`)
  for (const k of usedButUndefined) console.log(`    ${k}`)
}
if (unknownPrefixes.length) {
  console.log(`\n⚠ 动态键前缀未在检查器里声明取值来源（新增动态键请补一条）：`)
  for (const p of unknownPrefixes) console.log(`    \`${p}…\``)
}
if (usedButUndefined.length) process.exit(1)

// 退出码语义：
//   - 占位符不一致 = 真 bug（插值失效），必须失败
//   - 缺键 = 未翻译，默认只告警；加 --strict 才视为失败
//     （历史遗留的缺键不应阻塞构建，但也别让它们被忽略）
if (placeholderProblems.length) process.exit(1)
process.exit(process.argv.includes('--strict') && totalMissing > 0 ? 1 : 0)
