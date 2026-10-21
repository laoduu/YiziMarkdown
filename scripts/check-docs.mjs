/**
 * 打包文档一致检查：**会被打进安装包/便携版**的文档副本必须与仓库里的源逐字节一致。
 *
 * 背景：Tauri 的 `bundle.resources` 路径**相对 src-tauri/**，所以根目录的文档在 src-tauri/
 * 下都有一份副本，打包读的是副本。`docs/` 一直靠「手工挑几个文件复制」，于是漏发了
 * `docs/THEME-DESIGN-SPEC.md`（主题设计规范）—— 与 check-themes.mjs 守的
 * `src/assets/themes/` 副本是同一类坑：手动同步极易漏，漏了就把旧文档/缺文件打进包。
 *
 * 口径（与 scripts/make-portable.ps1 的同步段一一对应）：
 *   - 进包的文档 = `docs/` 整树（**排除 `docs/changelog/`**：发布说明只走 GitHub Releases / 官网）
 *                + 根 help.md / welcome.md / README.md（→ src-tauri/readme.md，注意小写）
 *   - 根 `changelog.md` 是**开发日志，不进包**（全仓零引用：应用只读 welcome.md / help.md /
 *     skill-guide.md，更新说明走 latest.json 的 notes）
 *
 * 不在本检查范围的副本：`keybindings.json` 应用运行时会写（开发态就可能变），不是纯镜像；
 * `skills/` 与本次改动无关。两者都不是「文档」，要守的话得各自定规则。
 *
 * 用法：node scripts/check-docs.mjs [--quiet]
 * `npm run build` 会调用它，而 `tauri build` 的 beforeBuildCommand 就是 `npm run build`
 * ⇒ 出安装包之前必然检查到。
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const quiet = process.argv.includes('--quiet')

/** `docs/` 里**不进包**的顶层目录：发布说明只走 GitHub Releases 与官网 */
const DOCS_EXCLUDE = ['changelog']

/** 根文件 → 包内副本（bundle.resources 的路径相对 src-tauri/） */
const FILE_PAIRS = [
  ['help.md', 'src-tauri/help.md'],
  ['welcome.md', 'src-tauri/welcome.md'],
  ['README.md', 'src-tauri/readme.md'], // 目标是小写 readme.md
]

/** 必须进包的 bundle.resources 键：镜像了却没进 resources，等于白同步 */
const REQUIRED_RESOURCES = ['docs', 'help.md', 'welcome.md', 'readme.md']

/** 开发日志：不得进包（它只有一份，在仓库根目录） */
const DEV_LOG = 'changelog.md'

const failures = []

const toRel = (base, full) => relative(base, full).split(sep).join('/')

/** 递归列出目录下所有文件（相对 base、正斜杠、稳定排序） */
const walk = (dir, base = dir, out = []) => {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, base, out)
    else out.push(toRel(base, full))
  }
  return out
}

const sameBytes = (a, b) => readFileSync(a).equals(readFileSync(b))
const show = (list, n = 6) => list.slice(0, n).join(', ') + (list.length > n ? ` … 等 ${list.length} 个` : '')

// ---- 1. docs/ 整树镜像（排除 DOCS_EXCLUDE） ----
const docsSrc = join(root, 'docs')
const docsDst = join(root, 'src-tauri', 'docs')
const isExcluded = (p) => DOCS_EXCLUDE.includes(p.split('/')[0])

let docsStat = null
if (!existsSync(docsSrc)) {
  failures.push('仓库缺少 docs/ 目录')
} else if (!existsSync(docsDst)) {
  failures.push('src-tauri/docs 不存在 —— docs/ 整树要随版分发（跑 pwsh scripts/make-portable.ps1 会同步）')
} else {
  const src = walk(docsSrc).filter((p) => !isExcluded(p))
  const shipped = walk(docsDst).filter((p) => !isExcluded(p))
  const leaked = walk(docsDst).filter(isExcluded)

  const missing = src.filter((p) => !shipped.includes(p)) // 仓库有、包里没有 ⇒ 漏发
  const extra = shipped.filter((p) => !src.includes(p)) // 包里是仓库已没有的陈旧文件
  const differing = src.filter((p) => shipped.includes(p) && !sameBytes(join(docsSrc, p), join(docsDst, p)))

  if (missing.length) {
    failures.push(`docs/ 有 ${missing.length} 个文件没进包（安装包/便携版的 docs/ 里找不到）：${show(missing)}`)
  }
  if (extra.length) {
    failures.push(`src-tauri/docs/ 有 ${extra.length} 个文件在仓库 docs/ 里已不存在（陈旧副本）：${show(extra)}`)
  }
  if (differing.length) {
    failures.push(`docs/ 与 src-tauri/docs/ 有 ${differing.length} 个文件内容不同（打包读的是包里那份）：${show(differing)}`)
  }
  if (leaked.length) {
    failures.push(`docs/${DOCS_EXCLUDE.join('/')}/ 不进包，但 src-tauri/docs/ 里有 ${leaked.length} 个文件：${show(leaked)}`)
  }
  docsStat = { count: src.length, missing, extra, differing, leaked }
}

// ---- 2. 根文档副本必须逐字节一致 ----
let filePairsChecked = 0
for (const [srcRel, dstRel] of FILE_PAIRS) {
  const srcPath = join(root, srcRel)
  const dstPath = join(root, dstRel)
  if (!existsSync(srcPath)) {
    failures.push(`仓库缺少 ${srcRel}`)
    continue
  }
  if (!existsSync(dstPath)) {
    failures.push(`${dstRel} 不存在 —— ${srcRel} 的打包副本（跑 pwsh scripts/make-portable.ps1 会同步）`)
    continue
  }
  if (!sameBytes(srcPath, dstPath)) {
    failures.push(`${srcRel} 与 ${dstRel} 内容不同（打包读的是后者）`)
  }
  filePairsChecked++
}

// ---- 3. 开发日志不得进包 + 该进包的资源不能缺席 ----
let resources = null
try {
  resources = JSON.parse(readFileSync(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8')).bundle.resources
} catch (e) {
  failures.push(`读不出 src-tauri/tauri.conf.json 的 bundle.resources：${e.message}`)
}
if (resources) {
  const keys = Object.keys(resources)
  if (keys.includes(DEV_LOG)) {
    failures.push(`bundle.resources 不该包含开发日志 "${DEV_LOG}"（全仓零引用，不进安装包）`)
  }
  for (const key of REQUIRED_RESOURCES) {
    if (!keys.includes(key)) {
      failures.push(`bundle.resources 缺少 "${key}" —— 镜像/同步了却没进资源，安装包里就没有它`)
    }
  }
}
if (existsSync(join(root, 'src-tauri', DEV_LOG))) {
  failures.push(`src-tauri/${DEV_LOG} 不该存在（开发日志不进包，留副本只会让人改错目录）`)
}

// ---- 输出 ----
if (!quiet) {
  console.log('文档打包一致性：仓库源 → 安装包/便携版副本\n')
  if (docsStat) {
    console.log(
      `  docs/ → src-tauri/docs/    ${docsStat.count} 个文件（排除 docs/${DOCS_EXCLUDE.join('、')}/）` +
        `  缺失 ${docsStat.missing.length} / 多余 ${docsStat.extra.length} / 内容不同 ${docsStat.differing.length}`
    )
  }
  console.log(`  根文档 → 包内副本          ${filePairsChecked}/${FILE_PAIRS.length} 份一致`)
  console.log(`  bundle.resources           开发日志 ${resources && DEV_LOG in resources ? '误入 ✗' : '未进包 ✓'}`)
}

if (failures.length) {
  console.error(`\n✗ 失败（${failures.length}）—— 安装包里的文档会与仓库不一致：\n`)
  for (const f of failures) console.error(`  ${f}`)
  console.error('\n  修法：根目录文档是唯一源，跑 pwsh scripts/make-portable.ps1 会同步副本（仓库里也要一起提交）')
  console.log(`\n合计：${failures.length} 项失败`)
  process.exit(1)
}

console.log(
  `\n✓ 全部检查通过：docs/ ${docsStat ? docsStat.count : 0} 个文件随版分发、` +
    `根文档副本 ${filePairsChecked} 份一致、开发日志未进包`
)
console.log('\n合计：0 项失败')
