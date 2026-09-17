/**
 * 校验前端 invoke 的参数键名与 Rust 命令签名一致。
 *
 * 为什么需要这个检查：
 *   Tauri 要求 JS 传 camelCase 键、Rust 用 snake_case 参数（`remote_path` ← `remotePath`）。
 *   键名写错时 **TypeScript 拦不住**（invoke 的参数是字符串 + 无类型对象），
 *   Rust 单测与集成测试也拦不住（它们直接调 Rust 函数，不经过 IPC 边界），
 *   只会在运行时抛「missing required key xxx」。这个脚本补上这一环。
 *
 * 用法：node scripts/check-tauri-args.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Tauri 自动注入的参数，前端不需要传 */
const INJECTED = /AppHandle|WebviewWindow|\bWindow\b|State<|tauri::/

function walk(dir, filter) {
  const out = []
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'target' || name === 'dist' || name.startsWith('.')) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full, filter))
    else if (filter(name)) out.push(full)
  }
  return out
}

const snakeToCamel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase())

/** 从 Rust 源码里收集 `#[tauri::command]` 函数的参数名 */
function collectRustCommands() {
  const commands = new Map()
  const files = walk(join(root, 'src-tauri', 'src'), (n) => n.endsWith('.rs'))
  for (const file of files) {
    const src = readFileSync(file, 'utf8')
    // #[tauri::command] 之后（中间可能有属性/空行）跟一个 pub [async] fn
    const re = /#\[tauri::command\]\s*(?:#\[[^\]]*\]\s*)*pub\s+(?:async\s+)?fn\s+(\w+)\s*\(([\s\S]*?)\)\s*->/g
    for (const m of src.matchAll(re)) {
      const [, name, rawParams] = m
      const params = rawParams
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => {
          const [ident, ...typeParts] = p.split(':')
          return { ident: ident.trim(), type: typeParts.join(':').trim() }
        })
        .filter((p) => p.ident && !INJECTED.test(p.type))
        .map((p) => snakeToCamel(p.ident))
      commands.set(name, { params, file: relative(root, file) })
    }
  }
  return commands
}

/** 从前端源码里收集 invoke('<cmd>', { ...keys }) 的键名 */
function collectInvokeCalls() {
  const calls = []
  const files = walk(join(root, 'src'), (n) => /\.(ts|tsx)$/.test(n))
  for (const file of files) {
    const src = readFileSync(file, 'utf8')
    // 匹配 invoke / invokeTauri / invokeTauriOrThrow / invokeTauriOrThrow<T>(...) 的字面量命令名
    const re = /\binvoke(?:Tauri|TauriOrThrow)?(?:<[^>]*>)?\s*\(\s*'([\w|:]+)'\s*(,\s*\{)?/g
    for (const m of src.matchAll(re)) {
      const [, cmd, hasObject] = m
      if (!hasObject) {
        calls.push({ cmd, keys: [], file: relative(root, file) })
        continue
      }
      // 从对象起始处做花括号配平，取出对象字面量
      const open = m.index + m[0].length - 1
      let depth = 0
      let end = -1
      for (let j = open; j < src.length; j++) {
        if (src[j] === '{') depth++
        else if (src[j] === '}') {
          depth--
          if (depth === 0) { end = j; break }
        }
      }
      const body = end > 0 ? src.slice(open + 1, end) : ''

      // 按顶层逗号切分（忽略嵌套对象/函数调用里的逗号）；
      // 每段既可能是 `key: value`，也可能是 `key` 简写形式
      const parts = []
      let d = 0
      let cur = ''
      for (const ch of body) {
        if ('{(['.includes(ch)) d++
        else if ('})]'.includes(ch)) d--
        if (ch === ',' && d === 0) { parts.push(cur); cur = ''; continue }
        cur += ch
      }
      parts.push(cur)

      const keys = parts
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => {
          if (p.startsWith('...')) return null            // 展开语法无法静态判断
          const explicit = /^([A-Za-z_$][\w$]*)\s*:/.exec(p)
          if (explicit) return explicit[1]
          const shorthand = /^([A-Za-z_$][\w$]*)$/.exec(p)
          return shorthand ? shorthand[1] : null
        })
        .filter(Boolean)
      calls.push({ cmd, keys, file: relative(root, file) })
    }
  }
  return calls
}

const rust = collectRustCommands()
const problems = []
let checked = 0

for (const { cmd, keys, file } of collectInvokeCalls()) {
  if (cmd.includes('|')) continue          // plugin:xxx|yyy 不是自定义命令
  const def = rust.get(cmd)
  if (!def) continue                      // 未在 Rust 侧注册的命令名不在此脚本职责内
  checked++
  const expected = [...def.params].sort()
  const actual = [...new Set(keys)].sort()
  const missing = expected.filter((k) => !actual.includes(k))
  const extra = actual.filter((k) => !expected.includes(k))
  if (missing.length || extra.length) {
    problems.push(
      `  ${cmd}  (${file})\n` +
        `    Rust 期望: { ${expected.join(', ')} }   [${def.file}]\n` +
        `    前端传入: { ${actual.join(', ')} }` +
        (missing.length ? `\n    缺少: ${missing.join(', ')}` : '') +
        (extra.length ? `\n    多余: ${extra.join(', ')}` : '')
    )
  }
}

if (problems.length) {
  console.error(`\n✗ invoke 参数名不匹配（${problems.length} 处）：\n`)
  console.error(problems.join('\n\n'))
  console.error('\n提示：Tauri 要求 camelCase 键对应 Rust 的 snake_case 参数。\n')
  process.exit(1)
}

console.log(`✓ invoke 参数名校验通过（检查了 ${checked} 个命令调用）`)
