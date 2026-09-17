/**
 * 把「云端存储（WebDAV）」章节插入各 README。
 *
 * 用法：node scripts/apply-readme-section.mjs <sections.json>
 *
 * JSON 结构：
 *   { "<相对路径>": { "anchor": "<插入到这一行之前>", "section": "<新章节 markdown>",
 *                     "settingsFrom": "<要替换的旧片段>", "settingsTo": "<新片段>" }, … }
 *
 * 为什么用脚本：16 个文件（根 README + 15 个本地化版本）要插在同一位置、
 * 且各自语言不同；脚本保证插入点一致，避免手工漏改某个语言。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const jsonPath = process.argv[2]
if (!jsonPath) {
  console.error('用法：node scripts/apply-readme-section.mjs <sections.json>')
  process.exit(1)
}
const data = JSON.parse(readFileSync(jsonPath, 'utf8'))

// 先全量校验锚点与替换片段，避免改到一半失败留下半成品
const problems = []
for (const [rel, spec] of Object.entries(data)) {
  const text = readFileSync(join(root, rel), 'utf8')
  if (text.includes(spec.section.split('\n')[0].trim())) continue // 已插入，跳过校验
  if (!text.includes(`\n${spec.anchor}`)) problems.push(`${rel}: 找不到锚点「${spec.anchor}」`)
  if (spec.settingsFrom && !text.includes(spec.settingsFrom)) {
    problems.push(`${rel}: 找不到设置面板片段「${spec.settingsFrom}」`)
  }
}
if (problems.length) {
  console.error('✗ 校验失败，未做任何修改：\n' + problems.map((p) => '  ' + p).join('\n'))
  process.exit(1)
}

const report = []
for (const [rel, spec] of Object.entries(data)) {
  const file = join(root, rel)
  // 统一按 LF 读写：本仓库 HEAD 里这些文档存的是 LF（工作区可能因 core.autocrlf
  // 呈现为 CRLF）。若按 CRLF 写回，git 会把整个文件视作已改动，diff 变成几百行。
  let text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
  const eol = '\n'

  if (text.includes(spec.section.split('\n')[0].trim())) {
    report.push(`${rel.padEnd(24)} 跳过（章节已存在）`)
    continue
  }

  const anchorIdx = text.indexOf(`${eol}${spec.anchor}`)
  if (anchorIdx < 0) throw new Error(`${rel}: 找不到锚点「${spec.anchor}」`)

  // 锚点前的 eol 已被 slice 吃掉（那正是原「空行」），所以结尾要补两个 eol：
  // 一个结束本节最后一行，一个作为与下一标题之间的空行
  const section = spec.section.split('\n').join(eol)
  text = text.slice(0, anchorIdx + 1) + section + eol + eol + text.slice(anchorIdx + 1)

  let settingsChanged = false
  if (spec.settingsFrom && spec.settingsTo) {
    if (!text.includes(spec.settingsFrom)) throw new Error(`${rel}: 找不到设置面板片段「${spec.settingsFrom}」`)
    text = text.replace(spec.settingsFrom, spec.settingsTo)
    settingsChanged = true
  }

  writeFileSync(file, text)
  report.push(`${rel.padEnd(24)} 已插入章节${settingsChanged ? ' + 更新设置面板行' : ''}`)
}
console.log(report.join('\n'))
