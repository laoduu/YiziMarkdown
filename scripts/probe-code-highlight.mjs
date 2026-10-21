/**
 * 代码块语法高亮的**端到端探针**（手动运行，不在 CI 里）。
 *
 * 为什么需要它：DOCX 的代码高亮由前端从**预览 DOM**读出（`src/lib/docxCodeHighlight.ts`），
 * 颜色取自浏览器算出的 computed style。这条链路（预览 HTML 结构 → DOM 读取 → payload →
 * Rust 渲染）在 Node 单元测试里只能用**假 DOM** 覆盖，真实浏览器里的 DOM 结构与 CSS 级联
 * （后代选择器、`.hljs-emphasis` 的斜体、主题换肤）必须真跑一次才算数。
 *
 * 做法：往 Vite dev 服务器临时放一个探针页（用真实 `renderMarkdown()` 渲染
 * `docx-export-test.md`，复刻 `Editor.tsx` 往 `pre` 里注入的按钮/语言标签），用
 * Chrome/Edge 无头模式 `--dump-dom` 把它跑完，取回 payload 并断言：
 *   · 命中的代码块数 == 页面上 `pre.hljs` 的数量（缩进式代码块预览本就不高亮，应被跳过）
 *   · 每个片段的文本**拼接起来正好等于**该代码块的代码（多字/少字都会在 Word 里露馅）
 *   · 片段末尾不带换行（否则导出会多一行空行）
 *   · 注入的按钮/语言标签没有混进片段
 *   · 每个围栏的内容与页面读到的文本一致（**跨实现契约**：Rust 侧 pulldown-cmark 给的是同一份）
 *   · 颜色是真实的 `rgb(...)`（不是 `rgb(0, 0, 0)`）、且存在无类片段的兜底样式
 *   · 带 `--dark` 时：所有 token 颜色已归一成十六进制且亮度 ≤ 0.3（白底可读），无着色片段用传入的正文色
 *
 * 产出 `src-tauri/target/highlight-payload.json`，供
 * `cargo test write_export_test_docx_for_inspection -- --ignored --nocapture` 使用 ——
 * 这样 `target/export-test.docx` 里的代码块才会像从应用里导出那样带语法高亮。
 *
 * 用法：先在另一个终端 `npm run dev`（Vite 监听 1420），然后
 *   node scripts/probe-code-highlight.mjs [--port 1420] [--md docx-export-test.md]
 *   node scripts/probe-code-highlight.mjs --theme matrix --dark    # 顺带验暗色主题的白底适配
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const PORT = Number(arg('port', '1420'))
const MD_FILE = arg('md', 'docx-export-test.md')
// 主题：默认取 themeOrder.ts 里的默认主题；`--theme <名>` + `--dark` 可验证暗色主题的白底适配
const THEME_ARG = arg('theme', '')
const IS_DARK = process.argv.includes('--dark')

const BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
]
const BROWSER = BROWSERS.find((p) => existsSync(p))
if (!BROWSER) {
  console.error('找不到 Chrome/Edge，无法跑无头浏览器探针')
  process.exit(1)
}

// 默认主题名从 themeOrder.ts 取，避免脚本与代码各写一份
const DEFAULT_THEME = /DEFAULT_THEME\s*=\s*'([^']+)'/.exec(
  readFileSync(join(REPO, 'src/lib/themeOrder.ts'), 'utf8'),
)[1]
const THEME = THEME_ARG || DEFAULT_THEME
const themeCss = readFileSync(join(REPO, 'src-tauri/themes', `${THEME}.css`), 'utf8')
const sample = readFileSync(join(REPO, MD_FILE), 'utf8')
/** 与 `App.tsx` 传给收集器的参数一致：暗色主题要压暗，无着色片段用 docx 的正文色 */
const collectOptions = IS_DARK ? `{ isDark: true, baseColor: '#333333' }` : '{}'

/**
 * 从源文件里取出「围栏行只有缩进（不在引用里）」的围栏块：语言 + 内容。
 * 内容按 CommonMark 规则去掉最多「围栏行缩进」个前导空格 —— 这正是 markdown-it 交给预览、
 * pulldown-cmark 交给导出器的那份文本，用来核对两边拿到的是同一串代码。
 */
function expectedFenceContents(src) {
  const lines = src.replace(/\r\n/g, '\n').split('\n')
  const out = []
  let i = 0
  while (i < lines.length) {
    const m = /^( *)(`{3,}|~{3,})(.*)$/.exec(lines[i])
    if (!m) {
      i++
      continue
    }
    const indent = m[1].length
    const marker = m[2]
    const info = m[3].trim().split(/\s+/)[0] || ''
    const close = new RegExp(`^ {0,${indent}}${marker[0]}{${marker.length},}\\s*$`)
    const content = []
    i++
    while (i < lines.length && !close.test(lines[i])) {
      let line = lines[i]
      let removed = 0
      while (removed < indent && line[removed] === ' ') removed++
      content.push(line.slice(removed))
      i++
    }
    i++
    out.push({ info, code: content.join('\n') })
  }
  return out
}

const page = `<!DOCTYPE html>
<html class="theme-${THEME}${IS_DARK ? ' dark' : ''}">
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="/src/styles/hljs-theme.css?direct">
<link rel="stylesheet" href="/src/styles/globals.css?direct">
<style>${themeCss}</style>
</head>
<body>
<div id="host" class="editor-content prose prose-lg max-w-none theme-${THEME}"></div>
<pre id="out"></pre>
<script type="text/markdown" id="src">${sample.replace(/<\/script/gi, '<\\/script')}</script>
<script type="module">
import { renderMarkdown } from '/src/lib/markdownRenderer.ts'
import { collectCodeHighlights } from '/src/lib/docxCodeHighlight.ts'

const host = document.getElementById('host')
host.innerHTML = renderMarkdown(document.getElementById('src').textContent)

// 复刻 Editor.tsx 的代码块增强：往每个 pre 里注入悬浮按钮与语言标签，
// 验证收集器只读 <code>、不会把这些注入内容混进片段
for (const pre of host.querySelectorAll('pre.hljs')) {
  const actions = document.createElement('div')
  actions.className = 'code-block-actions'
  actions.innerHTML = '<button class="code-block-wrap-btn">换行</button>'
  const label = document.createElement('b')
  label.className = 'code-block-lang'
  label.textContent = pre.getAttribute('data-lang') || ''
  pre.append(actions, label)
}

const payload = collectCodeHighlights(host, ${collectOptions})
const report = {
  preCount: host.querySelectorAll('pre.hljs').length,
  theme: document.documentElement.className,
  keywordColor: getComputedStyle(host.querySelector('.hljs-keyword') || host).color,
  blocks: Object.entries(payload.blocks).map(([k, spans]) => {
    const i = k.indexOf('\\u001f')
    return { lang: k.slice(0, i), code: k.slice(i + 1), spans: spans.length, text: spans.map((s) => s[1]).join('') }
  }),
}
document.getElementById('out').textContent = JSON.stringify({ report, payload })
</script>
</body></html>`

const htmlPath = join(REPO, '__probe-code-highlight.html')
writeFileSync(htmlPath, page, 'utf8')
const profile = mkdtempSync(join(tmpdir(), 'yizi-code-probe-'))
let dump
try {
  dump = execFileSync(
    BROWSER,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--virtual-time-budget=15000',
      `--user-data-dir=${profile}`,
      '--dump-dom',
      `http://localhost:${PORT}/__probe-code-highlight.html`,
    ],
    { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 },
  )
} finally {
  rmSync(htmlPath, { force: true })
  rmSync(profile, { recursive: true, force: true })
}

const m = /<pre id="out">([\s\S]*?)<\/pre>/.exec(dump)
if (!m) {
  console.error('未在 dump-dom 输出里找到结果 —— dev 服务器（npm run dev）没起？页面报错了？')
  console.error(dump.slice(0, 1500))
  process.exit(1)
}
const decode = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
const { report, payload } = JSON.parse(decode(m[1]))

console.log(`主题 ${report.theme} | pre.hljs ${report.preCount} 个 | 命中 ${report.blocks.length} 个 | 关键字实测色 ${report.keywordColor}`)
for (const b of report.blocks) {
  console.log(`  [${b.lang || '(无语言)'}] ${b.spans} 片段 | ${JSON.stringify(b.code.slice(0, 56))}`)
}
console.log('样式表:')
for (const [k, v] of Object.entries(payload.styles)) {
  console.log(`  ${JSON.stringify(k)} → ${v.color} bold=${v.bold} italic=${v.italic}`)
}

const problems = []
if (report.preCount === 0) problems.push('页面上没有 pre.hljs（渲染或 CSS 加载失败）')
const blockCount = Object.keys(payload.blocks).length
if (blockCount !== report.preCount) {
  problems.push(`命中 ${blockCount} 个代码块，但页面上有 ${report.preCount} 个 pre.hljs`)
}
const allSpans = JSON.stringify(payload.blocks)
for (const bad of ['换行', 'code-block-actions', 'code-block-lang']) {
  if (allSpans.includes(bad)) problems.push(`注入的按钮/标签混进片段: ${bad}`)
}
for (const b of report.blocks) {
  if (b.text !== b.code) problems.push(`片段拼接与代码不一致: ${JSON.stringify(b.code)}`)
  if (b.text.endsWith('\n')) problems.push(`片段末尾残留换行: ${JSON.stringify(b.code.slice(-20))}`)
}
for (const f of expectedFenceContents(sample)) {
  if (!f.code.trim()) continue
  if (!report.blocks.some((b) => b.lang === f.info && b.code === f.code)) {
    problems.push(
      `围栏 [${f.info || '(无语言)'}] 的内容与页面读到的文本对不上:\n` +
        `      期望 ${JSON.stringify(f.code)}\n` +
        `      页面 ${JSON.stringify(report.blocks.filter((b) => b.lang === f.info).map((b) => b.code))}`,
    )
  }
}
/** WCAG 相对亮度（与 `src/lib/docxPalette.ts` 同式），用来断言暗色主题下压得够暗 */
function luminance(hex) {
  const f = (c) => {
    const s = parseInt(c, 16) / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(hex.slice(1, 3)) + 0.7152 * f(hex.slice(3, 5)) + 0.0722 * f(hex.slice(5, 7))
}

const kw = payload.styles['hljs-keyword']
if (!kw) problems.push('样式表里没有 hljs-keyword')
if (!Object.prototype.hasOwnProperty.call(payload.styles, '')) {
  problems.push('样式表里缺少无类片段（空类路径）的兜底样式')
}
if (IS_DARK) {
  // 暗色主题：token 必须压到白底可读（十六进制 + 亮度低），无着色片段用 docx 侧算好的正文色
  if (payload.styles['']?.color !== '#333333') {
    problems.push(`暗色主题的无着色片段应使用传入的正文色 #333333，实际 ${payload.styles['']?.color}`)
  }
  for (const [chain, v] of Object.entries(payload.styles)) {
    if (!/^#[0-9a-f]{6}$/.test(v.color)) {
      problems.push(`暗色主题的颜色未归一成十六进制: ${chain || '(空)'} → ${v.color}`)
      continue
    }
    if (chain !== '' && luminance(v.color) > 0.31) {
      problems.push(`暗色主题的颜色仍过亮（白底不可读）: ${chain} → ${v.color}（亮度 ${luminance(v.color).toFixed(3)}）`)
    }
  }
} else {
  if (kw && (!/^rgb\(/.test(kw.color) || kw.color === 'rgb(0, 0, 0)')) {
    problems.push(`关键字颜色可疑: ${kw.color}`)
  }
  for (const [chain, v] of Object.entries(payload.styles)) {
    if (!/^rgb/.test(v.color)) problems.push(`浅色主题应原样带 computed style 的 rgb() 颜色: ${chain || '(空)'} → ${v.color}`)
  }
}

if (problems.length) {
  console.error('\n❌ 探针失败:')
  for (const p of problems) console.error(' - ' + p)
  process.exit(1)
}

const outPath = join(REPO, 'src-tauri/target/highlight-payload.json')
writeFileSync(outPath, JSON.stringify(payload), 'utf8')
console.log(`\n✅ 探针通过，已写入 ${outPath}`)
console.log('   接着可跑：cargo test --manifest-path src-tauri/Cargo.toml write_export_test_docx_for_inspection -- --ignored --nocapture')
