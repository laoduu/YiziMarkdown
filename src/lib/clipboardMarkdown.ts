/**
 * 剪贴板 → 规范 Markdown（网页 / Word / Google Docs / Notion 等富文本来源）。
 *
 * 背景：此前粘贴逻辑是「冒泡阶段监听 + 手写正则替换」，有两个硬伤：
 *   1. CodeMirror 的 paste 观察器绑在 contentDOM 上，先执行并把 text/plain 原样插入；
 *      我们的 handler 之后才跑，preventDefault 已经晚了 ⇒ 文档里先出现整段纯文本，
 *      再追加转换结果，两段之间没有换行（`# 标题` 被顶到行内）。
 *   2. 正则转换器不是块级感知的：div/span 无边界、列表项粘连、表格缺分隔行、
 *      Word 的 mso-list / MsoHeading / CF_HTML 头完全没处理。
 *
 * 现在统一交给 Turndown（HTML→Markdown 事实标准）+ Joplin 维护的 GFM 插件，
 * 并在这里补齐 Word 剪贴板专用规则、CF_HTML 拆包、块级边界与空白规范化。
 * 全程在内存中完成，不写文件、不挂载 DOM（Turndown 只解析字符串）。
 */

import TurndownService from 'turndown'
import { gfm } from '@joplin/turndown-plugin-gfm'

/** 超过这个体积的 data:image 不写进 Markdown（会撑爆文档与编译期内存） */
const MAX_DATA_IMAGE_BYTES = 2 * 1024 * 1024

/** 富文本里出现这些块级/语义标签时才值得从 HTML 还原（只有 span/br 的装饰性 HTML 走原生粘贴） */
const HTML_STRUCTURE_RE =
  /<(h[1-6]|p|div|ul|ol|li|table|thead|tbody|tr|td|th|blockquote|pre|hr|dl|dt|dd|section|article|figure|figcaption|img|sup|sub|a|b|strong|i|em|code|del|s|mark|u|kbd)\b/i

/**
 * 判断 text/plain 是否已经是「Markdown 源文本」（Obsidian / VS Code / 源码视图等）。
 *
 * 只在出现**强信号**时成立：行首 ATX 标题、引用、代码围栏、Markdown 链接/图片。
 * 刻意不把 `1. xxx` / `- xxx` 单独算作强信号 —— Word 复制出来的纯文本里编号列表
 * 很常见，误判会导致整段富文本放弃结构、退化成纯文本。
 */
export function looksLikeMarkdownSource(text: string): boolean {
  if (!text) return false
  return (
    /^(?:[ \t]{0,3})#{1,6}[ \t]+\S/m.test(text) ||
    /^(?:[ \t]{0,3})>[ \t]?/m.test(text) ||
    /^(?:[ \t]{0,3})(?:```|~~~)/m.test(text) ||
    /!\[[^\]]*\]\([^)]+\)/.test(text) ||
    /\]\((?:https?:|mailto:|tel:|#|\/|\.\/|\.\.\/)[^)]*\)/.test(text)
  )
}

/**
 * 拆开 Windows CF_HTML（Word / Excel / 部分浏览器写剪贴板时带 StartHTML 头），
 * 只保留真正的片段；同时清掉条件注释与脚本样式。
 */
export function extractHtmlFragment(raw: string): string {
  if (!raw) return ''
  let html = raw

  const startTag = '<!--StartFragment-->'
  const endTag = '<!--EndFragment-->'
  const start = html.indexOf(startTag)
  const end = html.indexOf(endTag)
  if (start >= 0 && end > start) {
    html = html.slice(start + startTag.length, end)
  } else if (/^(?:Version|StartHTML):/i.test(html.trim())) {
    // 没有 Fragment 标记但带有 CF_HTML 头：从第一个标签开始截取
    const firstTag = html.search(/</)
    if (firstTag > 0) html = html.slice(firstTag)
  }

  html = html
    // Word 的「downlevel-hidden」条件块（现代浏览器本来就不会显示）整块丢弃
    .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '')
    // 「downlevel-revealed」条件块：保留内部内容，只去掉 `<![if ...]>` / `<![endif]>` 包裹
    .replace(/<!\s*\[if[^\]]*\]>/gi, '')
    .replace(/<!\s*\[endif\]>/gi, '')
    // 其余注释（含 StartFragment 残留、Office 注释）
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')

  return html.trim()
}

/** Word 段落上的 `MsoHeadingN` / `mso-outline-level:N` → 标题级别（1-6，0 表示不是标题） */
function wordHeadingLevel(node: HTMLElement): number {
  const cls = node.getAttribute('class') || ''
  const style = node.getAttribute('style') || ''
  const m = /MsoHeading(\d)/i.exec(cls) || /mso-outline-level\s*:\s*(\d)/i.exec(style)
  if (!m) return 0
  const level = Number.parseInt(m[1], 10)
  return Number.isFinite(level) ? Math.max(1, Math.min(6, level)) : 0
}

/**
 * WPS / 部分 Word 导出没有 `MsoHeadingN`，而是「大字号 + 加粗」的普通段落。
 * 按字号阈值推断标题级别；只认短段落，避免把加粗的正文整段变成标题。
 */
function styleHeadingLevel(node: HTMLElement): number {
  if (node.nodeName !== 'P' && node.nodeName !== 'DIV') return 0
  if (node.textContent.trim().length > 90) return 0
  if (node.closest('table')) return 0
  const style = node.getAttribute('style') || ''
  const size = /font-size\s*:\s*([\d.]+)\s*(pt|px)/i.exec(style)
  const bold = /font-weight\s*:\s*(?:bold|[6-9]00)/i.test(style)
  if (!size || !bold) return 0
  const pt = Number.parseFloat(size[1]) * (size[2].toLowerCase() === 'px' ? 0.75 : 1)
  if (!Number.isFinite(pt)) return 0
  if (pt >= 15.5) return 1
  if (pt >= 13.5) return 2
  if (pt >= 11.5) return 3
  return 0
}

/** 从 margin-left 推断 Word/WPS 列表层级（默认一级缩进约 21pt，逐级递增） */
function marginLevel(node: HTMLElement): number {
  const style = node.getAttribute('style') || ''
  const m = /margin-left\s*:\s*([\d.]+)\s*(pt|px|cm|in)?/i.exec(style)
  if (!m) return 1
  const value = Number.parseFloat(m[1])
  const unit = (m[2] || 'pt').toLowerCase()
  if (!Number.isFinite(value) || value <= 0) return 1
  const pt = unit === 'px' ? value * 0.75 : unit === 'cm' ? value * 28.35 : unit === 'in' ? value * 72 : value
  return Math.max(1, Math.min(9, Math.round(pt / 21)))
}

/** 图片：只保留能长期访问的地址；file:/blob:/cid: 一律降级为 alt 文本 */
function imageMarkdown(node: HTMLElement): string {
  const alt = (node.getAttribute('alt') || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .trim()
  const src = (node.getAttribute('src') || '').trim()
  const title = (node.getAttribute('title') || '').replace(/"/g, '\\"').trim()
  if (!src) return alt
  if (/^data:/i.test(src)) {
    return src.length > MAX_DATA_IMAGE_BYTES ? alt : `![${alt}](${src})`
  }
  // Word / WPS 剪贴板的图片是临时目录里的 file:// 路径：先写成占位 token，
  // 粘贴时由 Editor 通过 Tauri 读成 data URL（读不到再退回 alt 文本）。
  if (/^file:/i.test(src)) {
    return `![${alt}](<${LOCAL_IMAGE_PREFIX}${encodeURIComponent(src)}>)`
  }
  if (!/^https?:/i.test(src)) return alt
  const safeSrc = /[\s)]/.test(src) ? `<${src.replace(/>/g, '%3E')}>` : src
  return `![${alt}](${safeSrc}${title ? ` "${title}"` : ''})`
}

/** 占位 token：`![alt](<yizi-local-image:<encodeURIComponent(file://…)>>)` */
export const LOCAL_IMAGE_PREFIX = 'yizi-local-image:'

const LOCAL_IMAGE_RE = /!\[([^\]]*)\]\((?:<)?yizi-local-image:([^)>]+)(?:>)?\)/g

/** 把 file:// 图片占位符换成真实 data URL；读失败的退回 alt 文本。 */
export async function materializeLocalImages(
  markdown: string,
  readImage: (path: string) => Promise<string | null>,
): Promise<string> {
  if (!markdown.includes(LOCAL_IMAGE_PREFIX)) return markdown
  const paths = new Set<string>()
  LOCAL_IMAGE_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = LOCAL_IMAGE_RE.exec(markdown))) {
    try {
      paths.add(decodeURIComponent(m[2]))
    } catch {
      /* 非法编码，忽略 */
    }
  }
  if (!paths.size) return markdown

  const data = new Map<string, string | null>()
  await Promise.all(
    [...paths].slice(0, 50).map(async (src) => {
      const path = localFilePath(src)
      if (!path) {
        data.set(src, null)
        return
      }
      try {
        data.set(src, await readImage(path))
      } catch {
        data.set(src, null)
      }
    }),
  )

  LOCAL_IMAGE_RE.lastIndex = 0
  return markdown.replace(LOCAL_IMAGE_RE, (_full, alt: string, enc: string) => {
    let src = ''
    try {
      src = decodeURIComponent(enc)
    } catch {
      return alt
    }
    const resolved = data.get(src)
    return resolved ? `![${alt}](${resolved})` : alt
  })
}

/** file:///C:/x → C:/x；file:///Users/x → /Users/x（macOS 保留绝对路径） */
function localFilePath(src: string): string | null {
  let raw = src
  try {
    raw = decodeURIComponent(src)
  } catch {
    /* 保持原样 */
  }
  const win = /^file:\/\/\/?([A-Za-z]:[\\/].*)$/.exec(raw)
  if (win) return win[1].replace(/\//g, '\\')
  if (/^file:\/\//i.test(raw)) {
    const rest = raw.replace(/^file:\/\/localhost/i, '').replace(/^file:\/\//i, '')
    return rest.startsWith('/') ? rest : `/${rest}`
  }
  return raw || null
}

/**
 * 规范化转换结果：
 *  - CRLF → LF、NBSP → 普通空格；
 *  - 代码围栏内原样保留（只统一换行）；
 *  - 围栏外：行尾空格只在「硬换行（恰好两个空格）」时保留，连续空行压到最多一个；
 *  - 标题行前保证一个空行，避免 `#` 被顶进上一行行内。
 */
export function normalizeMarkdown(md: string): string {
  const lines = md.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').split('\n')
  const out: string[] = []
  let inFence = false

  for (const rawLine of lines) {
    const fence = /^[ \t]{0,3}(?:```|~~~)/.test(rawLine)
    if (fence) {
      inFence = !inFence
      out.push(rawLine.replace(/[ \t]+$/g, ''))
      continue
    }
    if (inFence) {
      out.push(rawLine)
      continue
    }
    if (!rawLine.trim()) {
      // 连续空行只留一个
      if (out.length && out[out.length - 1] !== '') out.push('')
      continue
    }
    // 恰好两个尾随空格 = Markdown 硬换行，保留；其余尾随空白去掉。
    // 注意：**不能去掉行首缩进**，否则嵌套列表会被拍平。
    const hardBreak = /  $/.test(rawLine)
    let line = rawLine.replace(/[ \t]+$/, '')
    if (hardBreak) line = `${line}  `
    out.push(line)
  }

  // 标题前补空行（围栏内不处理）。只处理标题：表格/列表/引用由 Turndown 自己负责块间距，
  // 逐行补空行会把表格每一行都拆开。
  const spaced: string[] = []
  let fence = false
  for (const line of out) {
    if (/^[ \t]{0,3}(?:```|~~~)/.test(line)) fence = !fence
    if (!fence && /^[ \t]{0,3}#{1,6}[ \t]/.test(line) && spaced.length && spaced[spaced.length - 1] !== '') {
      spaced.push('')
    }
    spaced.push(line)
  }

  while (spaced.length && spaced[0] === '') spaced.shift()
  while (spaced.length && spaced[spaced.length - 1] === '') spaced.pop()
  const fixed = fixEmptyTableHeader(spaced)
  // 最后一行的两个空格不构成硬换行（后面没有可换的行），按普通尾随空白清掉
  if (!fence && fixed.length) fixed[fixed.length - 1] = fixed[fixed.length - 1].replace(/[ \t]+$/g, '')
  return fixed.join('\n')
}

/** 表格单元格内容（不处理转义竖线：GFM 转换器输出的是普通单元格） */
function tableCells(line: string): string[] {
  const body = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return body.split('|').map((c) => c.trim())
}

function isTableRow(line: string): boolean {
  return /^\s*\|.*\|\s*$/.test(line)
}

function isTableSeparator(line: string): boolean {
  if (!isTableRow(line)) return false
  const cells = tableCells(line)
  return cells.length > 0 && cells.every((c) => /^:?-{1,}:?$/.test(c))
}

/**
 * Word 表格没有 `<thead>` 时，Joplin 的 GFM 插件会补一行**空表头**：
 *   |     |     |
 *   | --- | --- |
 *   | 表头1 | 表头2 |
 * Markdown 必须有表头，空表头会多出一行空白。这里把空表头删掉，
 * 用原来的第一行数据当表头，分隔行位置不变（对齐标记沿用原分隔行）。
 */
function fixEmptyTableHeader(lines: string[]): string[] {
  const out: string[] = []
  let inFence = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^[ \t]{0,3}(?:```|~~~)/.test(line)) {
      inFence = !inFence
      out.push(line)
      continue
    }
    if (
      !inFence &&
      isTableRow(line) &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1]) &&
      tableCells(line).every((c) => c === '')
    ) {
      const rows: string[] = []
      let j = i + 2
      while (j < lines.length && isTableRow(lines[j]) && !isTableSeparator(lines[j])) {
        rows.push(lines[j])
        j++
      }
      if (rows.length) {
        out.push(rows[0], lines[i + 1], ...rows.slice(1))
      }
      i = j - 1
      continue
    }
    out.push(line)
  }
  return out
}

let service: TurndownService | null = null

function getTurndown(): TurndownService {
  if (service) return service
  const td = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    fence: '```',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined',
    br: '  \n',
  })
  // 表格（含无表头 / colspan / 单元格内换行）、删除线、任务列表
  td.use(gfm)
  td.remove(['script', 'style', 'head', 'title', 'meta', 'link', 'noscript'])

  // Word「另存为网页」/剪贴板里的标题
  td.addRule('wordHeading', {
    filter: (node) => node.nodeName === 'P' && wordHeadingLevel(node) > 0,
    replacement: (content, node) => {
      const level = wordHeadingLevel(node)
      const text = content.trim()
      return text ? `\n\n${'#'.repeat(level)} ${text}\n\n` : ''
    },
  })

  // Word / WPS 剪贴板的列表：通常不是真正的 <ul>/<li>，而是段首带符号、靠 margin 缩进的 <p>。
  // 两种形态都收：`mso-list:lN levelN`，以及（WPS 常见）负 text-indent + margin-left + 段首 `•`/`1.`。
  td.addRule('wordListItem', {
    filter: (node) => {
      if (node.nodeName !== 'P' && node.nodeName !== 'DIV') return false
      const style = node.getAttribute('style') || ''
      const cls = node.getAttribute('class') || ''
      const text = (node.textContent || '').replace(/\u00a0/g, ' ').trim()
      const hasMso = /mso-list\s*:\s*l\d+\s+level\d+/i.test(style)
      const indented =
        /(?:margin-left|text-indent)\s*:\s*-?[\d.]+/i.test(style) || /MsoListParagraph|ListParagraph/i.test(cls)
      return hasMso || (indented && /^[•·▪◦–—]|\d{1,3}[.)]|[a-zA-Z][.)]/.test(text))
    },
    replacement: (content, node) => {
      const style = node.getAttribute('style') || ''
      const msoLevel = /level(\d+)/i.exec(style)
      const level = msoLevel ? Math.max(1, Number.parseInt(msoLevel[1], 10)) : marginLevel(node)
      const text = content.replace(/\u00a0/g, ' ').trim()
      if (!text) return ''
      // Word 把项目符号/编号写在段首（可能在 <![if !supportLists]> 里）：
      //   •  / ·  / ▪ / ◦ / – → 无序；1. / 1) → 有序；a. / a) → 保留字母编号（Markdown 无对应语法，但不改内容）
      //   第 3 级 Word 常用字母 `o` 当项目符号，仅在 level≥3 时把它当符号（避免误伤正文里的 “o ”）。
      const bulletClass = level >= 3 ? '[•·▪◦–—oO]' : '[•·▪◦–—]'
      const markerMatch = new RegExp(`^(${bulletClass}|\\d{1,3}[.)]|[a-zA-Z][.)])\\s+`).exec(text)
      let marker = '-'
      let rest = text
      if (markerMatch) {
        const raw = markerMatch[1]
        rest = text.slice(markerMatch[0].length).trim()
        if (/\d|[a-zA-Z]/.test(raw)) marker = `${raw.replace(/[)]/, '.')}`
      }
      return `\n${'  '.repeat(level - 1)}${marker} ${rest}`
    },
  })

  // WPS / 部分 Word 导出没有 MsoHeading 标记，而是「大字号 + 加粗」的普通段落
  td.addRule('styleHeading', {
    filter: (node) => node.nodeName === 'P' && wordHeadingLevel(node) === 0 && styleHeadingLevel(node) > 0,
    replacement: (content, node) => {
      const level = styleHeadingLevel(node)
      const text = content.trim()
      return text ? `\n\n${'#'.repeat(level)} ${text}\n\n` : ''
    },
  })

  td.addRule('safeImage', {
    filter: 'img',
    replacement: (_content, node) => imageMarkdown(node),
  })

  // 上标 / 下标：Turndown 默认会把 <sup>、<sub> 的标签丢掉，只剩内容
  //（Word 脚注引用甚至只剩 `[2]` 字面量）。这里统一识别所有常见形态并保留语义：
  //   · <sup>/<sub>、vertical-align:super|sub、mso-text-raise
  //   · Word 脚注/尾注：mso-special-character、mso-footnote-id、MsoFootnoteReference、
  //     href="#_ftn1" / name="_ftnref1"
  // 不直接写 `[^1]`：Word 复制通常不带脚注正文，生成没有定义的引用会渲染成字面量。
  const citationNumber = (text: string): string => {
    const t = text.trim()
    // Turndown 会把 [] 转义成 \[ \]，这里两种写法都认
    const m = /^\\?\[(\d{1,4})\\?\]$/.exec(t)
    return m ? m[1] : t
  }

  const scriptKind = (node: HTMLElement): 'sup' | 'sub' | null => {
    const name = node.nodeName
    if (name === 'SUP') return 'sup'
    if (name === 'SUB') return 'sub'
    const style = node.getAttribute('style') || ''
    const cls = node.getAttribute('class') || ''
    const href = node.getAttribute('href') || ''
    const attrName = node.getAttribute('name') || ''
    if (/mso-special-character\s*:\s*(?:footnote|endnote)/i.test(style)) return 'sup'
    if (/Mso(?:Footnote|Endnote)Reference/i.test(cls)) return 'sup'
    if (/mso-(?:footnote|endnote)-id/i.test(style)) return 'sup'
    if (/#_(?:ftn|edn)/i.test(href) || /^_(?:ftn|edn)ref/i.test(attrName)) return 'sup'
    const va = /vertical-align\s*:\s*(super|sub)/i.exec(style)
    if (va) return va[1].toLowerCase() === 'sub' ? 'sub' : 'sup'
    // Word 的另一种写法：mso-text-raise 正值 = 上标，负值 = 下标
    const raise = /mso-text-raise\s*:\s*(-?[\d.]+)\s*(pt|px)?/i.exec(style)
    if (raise) {
      const v = Number.parseFloat(raise[1]) * (raise[2]?.toLowerCase() === 'px' ? 0.75 : 1)
      if (Number.isFinite(v) && v > 0) return 'sup'
      if (Number.isFinite(v) && v < 0) return 'sub'
    }
    return null
  }

  td.addRule('scriptRun', {
    filter: (node) => scriptKind(node) !== null,
    replacement: (content, node) => {
      const kind = scriptKind(node)
      const inner = content.trim()
      if (!kind || !inner) return ''
      // 内层节点可能已经转成 <sup>/<sub>，不要套两层
      if (/<su[bp]\b/i.test(inner)) return inner
      if (kind === 'sub') return `<sub>${inner}</sub>`
      const href = node.getAttribute('href') || ''
      const attrName = node.getAttribute('name') || ''
      const m = /(?:ftn|edn)(\d+)/i.exec(href) || /(?:ftn|edn)ref(\d+)/i.exec(attrName)
      return `<sup>${m ? m[1] : citationNumber(inner)}</sup>`
    },
  })

  // 列表标记统一成 `- ` / `1. `（Turndown 默认是 `-   ` / `1.  `，输出里会显得很松）。
  // 续行缩进跟随实际前缀长度，嵌套层级仍然正确。
  td.addRule('compactListItem', {
    filter: 'li',
    replacement: (content, node, options) => {
      const parent = node.parentNode as HTMLElement | null
      let prefix = `${options.bulletListMarker} `
      if (parent?.nodeName === 'OL') {
        const startAttr = parent.getAttribute('start')
        const index = Array.prototype.indexOf.call(parent.children, node)
        prefix = `${startAttr ? Number(startAttr) + index : index + 1}. `
      }
      const isParagraph = /\n$/.test(content)
      const body = content.replace(/^\n+|\n+$/g, '') + (isParagraph ? '\n' : '')
      const indented = body.replace(/\n/gm, `\n${' '.repeat(prefix.length)}`)
      return prefix + indented + (node.nextSibling ? '\n' : '')
    },
  })

  service = td
  return service
}

/** HTML 片段 → Markdown（纯内存，无副作用） */
export function convertHtmlToMarkdown(html: string): string {
  const fragment = extractHtmlFragment(html)
  if (!fragment) return ''
  try {
    return normalizeMarkdown(getTurndown().turndown(fragment))
  } catch {
    return ''
  }
}

export interface ClipboardPasteDecision {
  /** true = 调用方应阻止默认粘贴，改为插入 text */
  intercept: boolean
  /** intercept=false 时为空（交给原生粘贴） */
  text: string
}

/**
 * 剪贴板内容决策：
 *   1. 纯文本本身就是 Markdown 源（Obsidian / VS Code / 源码视图）→ 不拦截，原生粘贴；
 *   2. 没有 text/html 或 HTML 只有装饰性标签（span/br）→ 不拦截，原生粘贴；
 *   3. 其余带结构的富文本 → 拦截，Turndown 在内存中转成 Markdown。
 */
export function decideClipboardPaste(htmlRaw: string, plain: string): ClipboardPasteDecision {
  const plainText = plain || ''
  const html = extractHtmlFragment(htmlRaw || '')

  if (plainText && looksLikeMarkdownSource(plainText)) {
    return { intercept: false, text: '' }
  }
  if (!html || !HTML_STRUCTURE_RE.test(html)) {
    return { intercept: false, text: '' }
  }

  const md = convertHtmlToMarkdown(html)
  if (!md.trim()) {
    return { intercept: false, text: '' }
  }
  return { intercept: true, text: md }
}

const BLOCK_START_RE =
  /^(?:#{1,6}[ \t]|>[ \t]?|[-*+][ \t]|\d{1,3}[.)][ \t]|\|(?:[^|\n]*\|)+|```|~~~|---[ \t]*$)/

/**
 * 粘贴落点整理：
 *  - 富文本转换结果以块级结构开头、且插入点所在行**前面已有正文**时，先补一个空行；
 *  - 插入点后面同一行还有正文时，末尾补空行；
 *  - 纯行内内容（普通句子）不做任何改动。
 *
 * 这样 `# 标题` 不会因为粘在已有文字行尾而变成行内文本。
 */
export function planPasteInsert(doc: string, from: number, to: number, converted: string): string {
  let text = converted.replace(/\r\n?/g, '\n')
  text = text.replace(/\n+$/g, '')
  if (!text) return ''

  if (!BLOCK_START_RE.test(text)) return text

  const lineStart = from === 0 ? 0 : doc.lastIndexOf('\n', from - 1) + 1
  const nl = doc.indexOf('\n', to)
  const lineEnd = nl < 0 ? doc.length : nl
  const before = doc.slice(lineStart, from)
  const after = doc.slice(to, lineEnd)

  let out = text
  if (before.trim()) {
    out = `\n\n${out}`
  } else if (lineStart > 0) {
    // 光标在行首：检查上一行是否已有正文，避免块级内容紧贴上一段（表格/列表尤其需要空行）
    const prevStart = lineStart >= 2 ? doc.lastIndexOf('\n', lineStart - 2) + 1 : 0
    const prevText = doc.slice(prevStart, lineStart - 1)
    if (prevText.trim()) out = `\n${out}`
  }
  if (after.trim()) out = `${out}\n\n`
  return out
}
