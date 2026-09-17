/**
 * 把一批翻译合并进 i18n 字典文件。
 *
 * 用法：node scripts/apply-i18n.mjs <translations.json>
 *
 * JSON 结构（顶层为语言代码，值为 key→译文）：
 *   { "de": { "toolbar.saveToCloud": "In der Cloud speichern", "cloud.empty": "…" }, … }
 *
 * 为什么用脚本而不是手改：
 *   同一批 62 个键要插进 12 个文件、且要分落到 4 个不同的命名空间块里，
 *   手工插入极易漏键或错缩进。脚本保证缩进/引号/逗号一致，且已有键不会被覆盖。
 *   写完由 `scripts/check-i18n.mjs` 与 `tsc` 双重校验。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const jsonPath = process.argv[2]
if (!jsonPath) {
  console.error('用法：node scripts/apply-i18n.mjs <translations.json>')
  process.exit(1)
}

const data = JSON.parse(readFileSync(jsonPath, 'utf8'))

/** 转义为单引号 TS 字符串字面量 */
function quote(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, ' ')}'`
}

/** 定位命名空间块的结束位置（`\n  },`），返回插入点索引 */
function findBlockEnd(text, ns, eol) {
  const start = text.indexOf(`${eol}  ${ns}: {`)
  if (start < 0) return -1
  const close = text.indexOf(`${eol}  },`, start)
  return close < 0 ? -1 : close
}

const report = []
for (const [lang, entries] of Object.entries(data)) {
  const file = join(root, 'src', 'i18n', `${lang}.ts`)
  let text = readFileSync(file, 'utf8')
  const eol = text.includes('\r\n') ? '\r\n' : '\n'

  // 按命名空间分组：settings.cloudBaseUrl → settings；cloud.empty → cloud
  const byNs = new Map()
  for (const [key, value] of Object.entries(entries)) {
    const ns = key.slice(0, key.indexOf('.'))
    if (!byNs.has(ns)) byNs.set(ns, [])
    byNs.get(ns).push([key.slice(key.indexOf('.') + 1), value])
  }

  let added = 0
  const skipped = []

  // 先处理已有命名空间，避免插入后索引位移影响后续定位
  for (const ns of [...byNs.keys()].sort()) {
    const pairs = byNs.get(ns)
    const end = findBlockEnd(text, ns, eol)
    if (end < 0) continue // cloud 等缺失命名空间，稍后统一新建
    // 重复检查必须**限定在本命名空间块内**：不同命名空间可以有同名键
    // （如 tabbar.cancel 与 cloud.cancel），用整文件搜索会误判成"已存在"而漏插
    const start = text.indexOf(`${eol}  ${ns}: {`)
    const block = text.slice(start, end)
    const fresh = pairs.filter(([k]) => !new RegExp(`^ {4}${k}: `, 'm').test(block))
    for (const [k] of pairs) {
      if (!fresh.some(([f]) => f === k)) skipped.push(`${ns}.${k}`)
    }
    if (!fresh.length) continue
    const lines = fresh.map(([k, v]) => `    ${k}: ${quote(v)},`).join(eol)
    text = text.slice(0, end) + eol + lines + text.slice(end)
    added += fresh.length
  }

  // 缺失的命名空间（cloud）：作为最后一个命名空间，插到文件末尾的 `}` 之前
  for (const ns of [...byNs.keys()].sort()) {
    if (findBlockEnd(text, ns, eol) >= 0) continue
    const lines = byNs.get(ns).map(([k, v]) => `    ${k}: ${quote(v)},`).join(eol)
    const block = `${eol}  ${ns}: {${eol}${lines}${eol}  },`
    const lastBrace = text.lastIndexOf(`${eol}}`)
    if (lastBrace < 0) throw new Error(`${lang}: 找不到文件末尾的 }`)
    text = text.slice(0, lastBrace) + block + text.slice(lastBrace)
    added += byNs.get(ns).length
  }

  writeFileSync(file, text)
  report.push(`${lang.padEnd(6)} 新增 ${String(added).padStart(3)} 个键${skipped.length ? `  跳过已存在 ${skipped.length}` : ''}`)
}

console.log(report.join('\n'))
