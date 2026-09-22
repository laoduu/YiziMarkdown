/**
 * 主题 CSS 一致性检查。
 *
 * 为什么需要它：**CSS 变量写错名字不会报错，只会静默失效** —— 主题作者以为设了颜色，
 * 实际什么都没发生（本项目已经踩过：17 个主题都定义了 --editor-h1/2/3，但全仓只有
 * slideshow.css 消费它，于是「标题色」这个旋钮长期是死的）。
 * 这个脚本把这类问题从"靠肉眼发现"变成"构建时失败"。
 *
 * 六项检查：
 *   1) 变量白名单 —— var(--x) 里的 x 必须真的存在（拼写错误）  【默认失败】
 *   2) 亮/暗一致性 —— 同一变量应同时定义在亮色与暗色块          【告警】
 *   3) 死声明     —— 主题定义了但全仓无人消费的变量              【告警】
 *   4) 命名一致   —— 文件名必须与 :root.theme-<name> 选择器一致 【默认失败】
 *   5) 反模式     —— !important / [class*= / 直接写 z-index      【告警】
 *   6) 双目录漂移 —— src/assets/themes/ 与 src-tauri/themes/ 不一致【告警】
 *
 * 用法：node scripts/check-themes.mjs [--strict] [--quiet]
 *   --strict 把告警也视为失败（用于发布前自查；默认只让真 bug 失败）
 *   --quiet  只输出失败与统计
 *
 * 退出码：真 bug（1、4）恒为失败；告警默认只提示，加 --strict 才失败。
 *   这与 check-i18n.mjs 的语义一致：历史遗留问题不该阻塞构建，但也不该被忽略。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const globalsPath = join(root, 'src', 'styles', 'globals.css')
const liveThemeDir = join(root, 'src-tauri', 'themes')
const legacyThemeDir = join(root, 'src', 'assets', 'themes')

const strict = process.argv.includes('--strict')
const quiet = process.argv.includes('--quiet')

/** 由 JS 在运行时注入、因此不在 globals.css 里声明的变量（附注入点） */
const JS_INJECTED = new Map([
  ['--cursor-arrow', 'themeCursor.ts'],
  ['--cursor-standard', 'themeCursor.ts'],
  ['--cursor-bold', 'themeCursor.ts'],
  ['--preview-font-size', 'App.tsx'],
  ['--preview-line-height', 'App.tsx'],
  ['--font-mono', 'App.tsx（编辑器字体设置）'],
])

/** 与明暗模式无关的变量：只定义一次就是正确的，不该按"亮/暗各一次"去要求。
 *  装饰/流光的尺寸、节奏、混合模式也属于这一类（它们不是颜色）。
 *  字体族同理：字体不分明暗，只写一次是对的。
 *  --sel-toolbar-* 是**用户明确确认的有意设计**：划词工具栏是浮动小面板，
 *  暗色模式下若跟着变暗会显著影响可见性，所以刻意沿用亮色值 ⇒ 不参与本检查。 */
const MODE_INDEPENDENT = new Set([
  '--font-size-base', '--line-height', '--paragraph-spacing',
  '--border-radius', '--radius-xs', '--radius-sm', '--radius-md',
  '--radius-lg', '--radius-xl', '--radius-full',
  '--sel-toolbar-bg', '--sel-toolbar-text', '--sel-toolbar-border',
  '--sel-toolbar-hover', '--sel-toolbar-accent',
])
const isModeIndependent = (v) =>
  MODE_INDEPENDENT.has(v) || /^--font-/.test(v) || /-(deco|sheen)-/.test(v)

const read = (p) => readFileSync(p, 'utf8')
const declaredVars = (text) => [...text.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1])
const usedVars = (text) => [...text.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1])

/** 递归收集 src/ 下的源码，用于判断某变量是否真的被消费 */
function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (['node_modules', 'target', 'dist', '.git', 'assets'].includes(name)) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, acc)
    else if (/\.(ts|tsx|css)$/.test(name)) acc.push(full)
  }
  return acc
}

// ---- 基准集合 ----
const globalsText = read(globalsPath)
const globalsVars = new Set(declaredVars(globalsText))
const appSource = walk(join(root, 'src')).map(read).join('\n')
// tailwind.config.ts 也算消费点：prose 的 --tw-prose-* 就是指向主题令牌的，
// 漏掉它会把整批预览排版令牌误判成"无人消费"
const tailwindConfig = join(root, 'tailwind.config.ts')
let tailwindSource = ''
try {
  tailwindSource = read(tailwindConfig)
} catch {
  tailwindSource = ''
}
const themeFiles = readdirSync(liveThemeDir).filter((n) => n.endsWith('.css')).sort()
// 主题文件自身的结构性规则也会消费变量（如 .editor-content p { margin: … var(--paragraph-spacing) }），
// 所以"被消费"必须把主题文件算进去，否则会把主题内部自用的旋钮误报成死声明
const themeSource = themeFiles.map((f) => read(join(liveThemeDir, f))).join('\n')
const consumed = new Set(usedVars(`${globalsText}\n${appSource}\n${tailwindSource}\n${themeSource}`))

const failures = []
const warnings = []
const report = []
/** 死声明按变量聚合：同一个变量在 16 个主题里都是死的，不该刷 16 行 */
const deadByVar = new Map()
/** 单侧定义同样按变量聚合 */
const oneSidedByVar = new Map()

for (const file of themeFiles) {
  const text = read(join(liveThemeDir, file))
  const lines = text.split(/\r?\n/)
  const name = basename(file, '.css')
  const declared = declaredVars(text)
  const own = new Set(declared)
  const used = usedVars(text)

  // 1) 白名单：用到的变量必须来自 globals.css / 主题自身 / JS 注入清单
  const unknown = [...new Set(used)].filter(
    (v) => !globalsVars.has(v) && !own.has(v) && !JS_INJECTED.has(v)
  )
  if (unknown.length) {
    failures.push(`${file}  用到未声明的变量（拼写错误？）：${unknown.join(', ')}`)
  }

  // 2) 亮/暗一致性：每个变量在亮色块与暗色块各声明一次 ⇒ 总出现次数为偶。
  //    出现奇数次说明只定义了一种模式，另一种会回落到基础值。
  //    字体/圆角这类与明暗无关的变量不参与本检查（只写一次是对的）。
  const counts = new Map()
  for (const v of declared) counts.set(v, (counts.get(v) ?? 0) + 1)
  const oneSided = [...counts]
    .filter(([v, n]) => n % 2 === 1 && !isModeIndependent(v))
    .map(([v]) => v)
  if (oneSided.length) {
    for (const v of oneSided) {
      if (!oneSidedByVar.has(v)) oneSidedByVar.set(v, [])
      oneSidedByVar.get(v).push(name)
    }
  }

  // 3) 死声明：定义了但全应用没人消费 ⇒ 这个旋钮是假的（按变量聚合，见循环后输出）
  for (const v of own) {
    if (consumed.has(v) || JS_INJECTED.has(v)) continue
    if (!deadByVar.has(v)) deadByVar.set(v, [])
    deadByVar.get(v).push(name)
  }

  // 4) 命名一致性：文件名 ↔ :root.theme-<name>
  if (!text.includes(`:root.theme-${name}`)) {
    failures.push(`${file}  缺少 \`:root.theme-${name}\` 选择器（文件名与主题名必须一致）`)
  }

  // 5) 反模式：这些是"变量体系表达力不足"的症状，应当改用令牌。
  //    必须先剥掉注释 —— 否则连"文档里提到 !important"都会被算成反模式（真实踩过）。
  //    用等长空白替换注释、保留换行，这样行号仍然准确。
  const stripped = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  const codeLines = stripped.split(/\r?\n/)
  const anti = []
  codeLines.forEach((line, i) => {
    if (line.includes('!important')) anti.push(`!important@${i + 1}`)
    if (/\[class\*?=/.test(line)) anti.push(`[class*=]@${i + 1}`)
    if (/(^|[;\s])z-index\s*:/.test(line)) anti.push(`z-index@${i + 1}`)
  })
  if (anti.length) {
    warnings.push(`${file}  反模式 ${anti.length} 处：${anti.slice(0, 8).join(' ')}${anti.length > 8 ? ' …' : ''}`)
  }

  report.push({
    file,
    vars: own.size,
    missing: [...globalsVars].filter((v) => !own.has(v)).length,
  })
}

// 2) 单侧定义汇总：只写了亮色（或只写了暗色）的变量，另一种模式会回落到基础值
for (const [v, files] of [...oneSidedByVar].sort((a, b) => b[1].length - a[1].length)) {
  warnings.push(
    `${v}  只在单侧（亮或暗）定义，另一种模式回落基础值` +
      `\n         涉及 ${files.length} 个主题：${files.slice(0, 5).join(', ')}${files.length > 5 ? ' …' : ''}`
  )
}

// 3) 死声明汇总：一个变量被 N 个主题定义却无人消费 = 这个旋钮是假的
for (const [v, files] of [...deadByVar].sort((a, b) => b[1].length - a[1].length)) {
  warnings.push(
    `${v}  被 ${files.length}/${themeFiles.length} 个主题定义，但全仓无人消费 ⇒ 旋钮无效` +
      `\n         涉及：${files.slice(0, 6).join(', ')}${files.length > 6 ? ` … 等 ${files.length} 个` : ''}`
  )
}

// 6) 双目录漂移：src/assets/themes/ 曾是历史遗留副本，**已于 2026-09-22 删除**
//    （运行时只读 src-tauri/themes/，那份副本零引用，且 changelog 记着它害过一次 bug：
//    "修改了 src/assets/themes/ 但运行时从 src-tauri/ 读取，导致 CSS 变量未生效"）。
//    这段检查保留为哨兵：若该目录再次出现，说明又有人建了一份副本，立刻告警。
let legacy
try {
  const legacyFiles = readdirSync(legacyThemeDir).filter((n) => n.endsWith('.css')).sort()
  const missing = themeFiles.filter((f) => !legacyFiles.includes(f))
  const extra = legacyFiles.filter((f) => !themeFiles.includes(f))
  const differing = legacyFiles.filter(
    (f) => themeFiles.includes(f) && read(join(legacyThemeDir, f)) !== read(join(liveThemeDir, f))
  )
  legacy = { legacyFiles, missing, extra, differing }
  if (missing.length || extra.length || differing.length) {
    warnings.push(
      `src/assets/themes/ 又出现了，且与运行时主题目录不一致：` +
        `${missing.length} 个仅在运行时存在${missing.length ? `（${missing.slice(0, 4).join(', ')}${missing.length > 4 ? ' …' : ''}）` : ''}` +
        `、${extra.length} 个仅在副本里、${differing.length} 个内容不同。` +
        `\n         该目录已于 2026-09-22 删除（全仓零引用、历史 bug 源）；若确实要恢复副本，请同时接入同步校验`
    )
  } else if (legacyFiles.length) {
    warnings.push(
      `src/assets/themes/ 又出现了（${legacyFiles.length} 个文件）。该目录已删除且零引用，` +
        `运行时只读 src-tauri/themes/ —— 放回副本只会让人改错目录`
    )
  }
} catch {
  legacy = null
}

// ---- 输出 ----
if (!quiet) {
  console.log(`基准 globals.css 声明 ${globalsVars.size} 个变量；运行时主题 ${themeFiles.length} 个\n`)
  console.log('  主题                     自定义变量   未覆盖的基准变量')
  for (const r of report) {
    console.log(`  ${r.file.padEnd(24)} ${String(r.vars).padStart(6)}     ${String(r.missing).padStart(6)}`)
  }
}

if (failures.length) {
  console.error(`\n✗ 失败（${failures.length}）—— 会导致变量静默失效：\n`)
  for (const f of failures) console.error(`  ${f}`)
}
if (warnings.length) {
  console.log(`\n${strict ? '✗' : '⚠'} 告警（${warnings.length}）${strict ? '（--strict 下视为失败）' : ''}：\n`)
  for (const w of warnings) console.log(`  ${w}`)
}
if (!failures.length && !warnings.length) {
  console.log('\n✓ 全部检查通过')
}

console.log(`\n合计：${failures.length} 项失败、${warnings.length} 项告警`)

if (failures.length) process.exit(1)
process.exit(strict && warnings.length ? 1 : 0)
