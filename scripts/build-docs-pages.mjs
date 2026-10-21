/**
 * 从 docs/*.md 生成官网三个文档频道页（演示语法 / 主题规范 / 技能规范）。
 *
 * 生成的 HTML 复用 help.html 的骨架与样式（左侧大纲 + 右侧正文 + 搜索），
 * 并写死源码路径与内容哈希，供 scripts/check-docs-site.mjs 判断是否过期。
 *
 * 用法：node scripts/build-docs-pages.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import MarkdownIt from 'markdown-it'
import { DOC_PAGES, DOC_TABS } from './docs-site.config.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SITE = path.join(ROOT, 'website')
const SITE_URL = 'https://md.yizigpt.com'

const normalize = (s) => s.replace(/\r\n/g, '\n')
const sha256 = (s) => crypto.createHash('sha256').update(normalize(s), 'utf8').digest('hex')

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function stripTags(html) {
  return String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

/** GitHub 风格锚点：保留中日韩字符与字母数字，去掉标点，空格转连字符。 */
function slugify(text, used) {
  let base = String(text)
    .replace(/<[^>]*>/g, '')
    .replace(/[`*_~]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s\-_]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  if (!base) base = 'section'
  let id = base
  let n = 1
  while (used.has(id)) id = `${base}-${n++}`
  used.add(id)
  return id
}

function createRenderer() {
  const used = new Set()
  const md = new MarkdownIt({ html: false, linkify: false, typographer: false })

  md.renderer.rules.heading_open = (tokens, idx) => {
    const tag = tokens[idx].tag
    if (tag === 'h1') return '<h1>'
    const inline = tokens[idx + 1]
    const text = inline ? inline.content : ''
    const id = slugify(text, used)
    return `<${tag} id="${esc(id)}">`
  }
  // 源文档里的 --- 是章节分隔线；网页已有小节边框与侧栏，不再重复画线
  md.renderer.rules.hr = () => ''
  md.renderer.rules.table_open = () => '<div class="help-table-wrap"><table class="docs-table">\n'
  md.renderer.rules.table_close = () => '</table></div>\n'

  return md
}

/** 把渲染好的正文拆成 help-section / help-sub 两层，供 help.js 生成左侧大纲。 */
function structure(html, cfg) {
  // 前置换行：JS 的 split 会忽略位置 0 的零宽匹配，否则「首个小节」会并进 intro
  const parts = ('\n' + html).split(/(?=<h2 id=")/)
  const intro = (parts.shift() || '').trim()

  const sections = []
  for (const part of parts) {
    const head = part.match(/^<h2 id="([^"]+)">([\s\S]*?)<\/h2>/)
    if (!head) continue
    const [, id, titleHtml] = head
    const titleText = stripTags(titleHtml)
    if ((cfg.skipSections || []).some((s) => titleText === s || titleText.startsWith(s))) continue

    const rest = part.slice(head[0].length)
    const chunks = rest.split(/(?=<h3 id=")/)
    const lead = (chunks.shift() || '').trim()
    const subs = []
    for (const chunk of chunks) {
      const subHead = chunk.match(/^<h3 id="([^"]+)">([\s\S]*?)<\/h3>/)
      if (!subHead) continue
      const [, sid, subTitle] = subHead
      const subRest = chunk.slice(subHead[0].length).trim()
      subs.push({
        id: sid,
        title: subTitle,
        body: subRest,
        kw: `${stripTags(subTitle)} ${stripTags(subRest)}`.slice(0, 260)
      })
    }
    sections.push({ id, title: titleHtml, lead, subs })
  }
  return { intro, sections }
}

function renderBody(html, cfg) {
  const { intro, sections } = structure(html, cfg)
  const icons = cfg.icons || []
  const out = []
  if (intro) out.push(`<div class="docs-intro">\n${intro}\n</div>`)

  sections.forEach((sec, i) => {
    const icon = icons[i] || 'file-text'
    const kw = `${stripTags(sec.title)} ${stripTags(sec.lead)}`.slice(0, 260)
    const subs = sec.subs
      .map(
        (sub) =>
          `<div class="help-sub" id="${esc(sub.id)}" data-kw="${esc(sub.kw)}">\n` +
          `<h3>${sub.title}</h3>\n${sub.body}\n</div>`
      )
      .join('\n')
    out.push(
      `<section class="help-section" id="${esc(sec.id)}" data-icon="${esc(icon)}" data-kw="${esc(kw)}">\n` +
        `<h2><a class="anchor" href="#${esc(sec.id)}">#</a>${sec.title}</h2>\n` +
        `${sec.lead}\n${subs}\n</section>`
    )
  })
  return out.join('\n\n')
}

function pageTemplate(cfg, body, hash) {
  const url = `${SITE_URL}/${cfg.out}`
  const tabs = DOC_TABS.map((t) => {
    const active = t.page === cfg.out
    return (
      `<a href="${t.page}"${active ? ' class="active" aria-current="page"' : ''}>` +
      `${esc(t.label)}</a>`
    )
  }).join('\n                ')

  const metaChips = (cfg.meta || [])
    .map((m) => `<span>${esc(m)}</span>`)
    .join('')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${esc(cfg.title)} - YiziMarkdown 文档</title>
    <meta name="description" content="${esc(cfg.description)}">
    <meta name="keywords" content="${esc(cfg.keywords)}">
    <meta name="author" content="YiziPaper">
    <meta name="robots" content="index, follow">
    <meta name="docs-src" content="${esc(cfg.src)}">
    <meta name="docs-hash" content="${hash}">
    <link rel="canonical" href="${url}">

    <!-- Open Graph -->
    <meta property="og:type" content="article">
    <meta property="og:title" content="${esc(cfg.title)} - YiziMarkdown 文档">
    <meta property="og:description" content="${esc(cfg.description)}">
    <meta property="og:url" content="${url}">
    <meta property="og:site_name" content="YiziMarkdown">
    <meta property="og:locale" content="zh_CN">
    <meta property="og:image" content="${SITE_URL}/assets/index.webp">

    <link rel="icon" type="image/png" href="assets/icon.png">
    <link rel="shortcut icon" href="assets/favicon.ico">
    <link rel="stylesheet" href="assets/css/style.css">
    <link rel="stylesheet" href="assets/css/help.css?v=3">

    <script type="application/ld+json">
    {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "首页", "item": "${SITE_URL}/" },
            { "@type": "ListItem", "position": 2, "name": "文档", "item": "${SITE_URL}/help.html" },
            { "@type": "ListItem", "position": 3, "name": "${esc(cfg.title)}", "item": "${url}" }
        ]
    }
    </script>

    <!-- 百度统计 -->
    <script>
    var _hmt = _hmt || [];
    (function() {
      var hm = document.createElement("script");
      hm.src = "https://hm.baidu.com/hm.js?782f6fcd479a342d5d05f5bc47c61349";
      var s = document.getElementsByTagName("script")[0];
      s.parentNode.insertBefore(hm, s);
    })();
    </script>
</head>
<body class="has-docs-tabs">

<!-- 共用导航（由 site-chrome.js 渲染，与首页一致） -->
<div id="site-nav"></div>
<div id="docs-tabs"></div>
<noscript>
    <div style="padding: 120px 20px 0; text-align: center; font-size: 14px; color: #64748b;">
        导航需要 JavaScript。请直接访问 <a href="index.html" style="color: #002FA7;">YiziMarkdown 首页</a>，
        或查看 <a href="help.html" style="color: #002FA7;">帮助中心</a>。
    </div>
</noscript>

<!-- 页头 -->
<header class="help-header">
    <div class="help-header-inner">
        <nav class="docs-breadcrumb" aria-label="面包屑">
            <a href="index.html">首页</a><span>/</span><a href="help.html">文档</a><span>/</span><span>${esc(cfg.title)}</span>
        </nav>
        <h1 class="help-title">${esc(cfg.title)}</h1>
        <p class="docs-subtitle">${esc(cfg.subtitle)}</p>
        <div class="docs-meta">${metaChips}</div>
        <div class="help-search">
            <svg class="help-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
            <input type="text" class="help-search-input" id="helpSearch" placeholder="${esc(cfg.searchPlaceholder)}" autocomplete="off">
            <span class="help-search-hint">/</span>
            <div class="help-results" id="helpResults"></div>
        </div>
    </div>
</header>

<div class="help-layout">

    <!-- 左侧章节导航（由 help.js 生成） -->
    <aside class="help-sidebar" id="helpSidebar">
        <nav id="helpNav"></nav>
    </aside>

    <!-- 正文 -->
    <main class="help-content docs-content">
${body}

        <div class="docs-source">
            <p>本页由 <code>${esc(cfg.src)}</code> 生成，随对应版本更新。发现表述问题？欢迎到
            <a href="https://github.com/laoduu/YiziMarkdown/issues" target="_blank">GitHub Issues</a> 反馈。</p>
        </div>
    </main>

</div>

<button class="help-fab" id="helpFab">目录</button>

<div id="site-footer"></div>

<script src="assets/js/site-chrome.js"></script>
<script src="assets/js/icons.js"></script>
<script src="assets/js/help.js"></script>

</body>
</html>
`
}

function buildPage(cfg) {
  const srcPath = path.join(ROOT, cfg.src)
  const source = fs.readFileSync(srcPath, 'utf8')
  const hash = sha256(source)

  // 去掉文档 H1（页面标题用 cfg.title）与可选的头部元信息引用块
  let mdSource = normalize(source).replace(/^#\s+.*\n+/, '')
  if (cfg.dropLeadingQuote) mdSource = mdSource.replace(/^(?:>[^\n]*\n)+\s*\n?/, '')

  const md = createRenderer()
  let html = md.render(mdSource).trim()

  // markdown-it 的默认 heading_close 仍会输出，去掉首个 H1 后重新拼接
  html = html.replace(/^<h1>[\s\S]*?<\/h1>\s*/, '')

  const body = renderBody(html, cfg)
  const page = pageTemplate(cfg, body, hash)
  const outPath = path.join(SITE, cfg.out)
  fs.writeFileSync(outPath, page, 'utf8')

  const sections = (body.match(/class="help-section"/g) || []).length
  const subs = (body.match(/class="help-sub"/g) || []).length
  return { out: cfg.out, src: cfg.src, sections, subs, bytes: Buffer.byteLength(page) }
}

const results = DOC_PAGES.map(buildPage)
const pad = (s, n) => s + ' '.repeat(Math.max(0, n - s.length))
for (const r of results) {
  console.log(
    `✓ ${pad(r.out, 24)} ${pad(String(r.sections) + ' 章', 6)} ${pad(String(r.subs) + ' 节', 7)}` +
      ` ${String(Math.round(r.bytes / 1024)) + ' KB'}  ← ${r.src}`
  )
}
