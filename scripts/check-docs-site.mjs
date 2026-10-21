/**
 * 官网文档频道校验：
 *   1. 生成页存在，且 <meta name="docs-hash"> 与源 Markdown 当前内容一致（防漂移）
 *   2. 四个文档页都挂了 <div id="docs-tabs"></div>，标签栏里的页面都存在
 *   3. 生成页内部的锚点（href="#..."）都能找到对应 id
 *
 * 用法：node scripts/check-docs-site.mjs [--quiet]
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { DOC_PAGES, DOC_TABS } from './docs-site.config.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SITE = path.join(ROOT, 'website')
const quiet = process.argv.includes('--quiet')
const failures = []

const normalize = (s) => s.replace(/\r\n/g, '\n')
const sha256 = (s) => crypto.createHash('sha256').update(normalize(s), 'utf8').digest('hex')
const read = (p) => fs.readFileSync(p, 'utf8')

function checkPage(cfg) {
  const outPath = path.join(SITE, cfg.out)
  if (!fs.existsSync(outPath)) {
    failures.push(`${cfg.out} 不存在，请运行 node scripts/build-docs-pages.mjs`)
    return
  }
  const page = read(outPath)

  const srcPath = path.join(ROOT, cfg.src)
  if (!fs.existsSync(srcPath)) {
    failures.push(`源文件 ${cfg.src} 不存在`)
    return
  }
  const hash = sha256(read(srcPath))
  const recorded = (page.match(/<meta name="docs-hash" content="([a-f0-9]+)">/) || [])[1]
  const recordedSrc = (page.match(/<meta name="docs-src" content="([^"]+)">/) || [])[1]
  if (!recorded) failures.push(`${cfg.out} 缺少 <meta name="docs-hash">，页面可能不是脚本生成的`)
  else if (recorded !== hash) {
    failures.push(`${cfg.out} 已过期：源 ${cfg.src} 变了但页面没重新生成`)
  }
  if (recordedSrc && recordedSrc !== cfg.src) {
    failures.push(`${cfg.out} 的 docs-src 是 ${recordedSrc}，配置里是 ${cfg.src}`)
  }

  // 同页锚点
  const ids = new Set()
  for (const m of page.matchAll(/\sid="([^"]+)"/g)) ids.add(m[1])
  const missing = new Set()
  for (const m of page.matchAll(/href="#([^"]+)"/g)) {
    let target = m[1]
    try {
      target = decodeURIComponent(target)
    } catch {
      /* 保留原样 */
    }
    if (!ids.has(target)) missing.add(target)
  }
  if (missing.size) {
    failures.push(`${cfg.out} 有 ${missing.size} 个锚点找不到目标：${[...missing].slice(0, 5).join(', ')}`)
  }

  // 标签栏
  if (!page.includes('<div id="docs-tabs"></div>')) {
    failures.push(`${cfg.out} 缺少 <div id="docs-tabs"></div>`)
  }
  if (!page.includes('assets/js/help.js')) {
    failures.push(`${cfg.out} 缺少 help.js（左侧大纲不会生成）`)
  }
}

for (const cfg of DOC_PAGES) checkPage(cfg)

for (const tab of DOC_TABS) {
  if (!fs.existsSync(path.join(SITE, tab.page))) failures.push(`标签栏指向的 ${tab.page} 不存在`)
}

const helpPath = path.join(SITE, 'help.html')
if (fs.existsSync(helpPath)) {
  const help = read(helpPath)
  if (!help.includes('<div id="docs-tabs"></div>')) {
    failures.push('help.html 缺少 <div id="docs-tabs"></div>')
  }
  if (!help.includes('has-docs-tabs')) {
    failures.push('help.html 的 <body> 缺少 has-docs-tabs 类（页头会被标签栏遮住）')
  }
}

if (failures.length) {
  console.error('文档频道检查失败：')
  for (const f of failures) console.error(`  ✗ ${f}`)
  process.exit(1)
}

if (!quiet) {
  console.log(`✓ 文档频道就绪：${DOC_PAGES.length} 个生成页哈希一致、锚点完整、标签栏齐全（${DOC_TABS.map((t) => t.label).join(' / ')}）`)
}
