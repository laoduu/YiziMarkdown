/**
 * 主题 / 用户 CSS 的注入 id，以及**选择器归属改写**。
 *
 * ── 背景：为什么需要改写 ──
 * 应用只给 `<html>` 挂**当前生效主题**的那一个类（`App.tsx` 的
 * `classList.add('theme-' + currentTheme)`），所以：
 *   1. 主题文件里的选择器必须归属到「当前生效的主题名」，否则换主题后规则失配；
 *   2. 用户 CSS 里写死的 `:root.theme-brocade` 永远匹配不到（`<html>` 上没有那个类）。
 * 两个问题用同一套改写解决：把选择器里的主题类名统一**归一**到目标主题名。
 *
 * ── 用户 CSS 还要额外提权 ──
 * 用户 CSS 虽注入在最后，但「排在最后」只能赢**同特异性**的平局，而主题普遍用
 * 更高特异性的选择器（变量 `:root.theme-<name>` (0,2,0)、元素
 * `.editor-content.theme-<name> <el>` (0,2,1)）。所以对**不带主题类**的选择器
 * 追加 `:root.theme-<target>` 作用域前缀：
 *   :root{}              → :root.theme-<target>{}                    平手 + 后置 ⇒ 胜
 *   html{}               → :root.theme-<target>{}
 *   .editor-content h1{} → :root.theme-<target> .editor-content h1{} (0,3,1) > 主题 (0,2,1)
 * 刻意**不用 `!important`**：作用域前缀同样能赢，但用户自己后面的规则仍能覆盖前面的。
 *
 * ── 两种用户用法都支持 ──
 *   · 粘贴整份主题（`:root.theme-brocade` / `.editor-content.theme-brocade h1`）
 *     ⇒ 只归一主题名，不动结构
 *   · 只写当前主题的微调（裸 `:root{}` / `.editor-content h1{}`）
 *     ⇒ 追加作用域前缀
 */

/** 主题 CSS 注入元素 id */
export const THEME_CSS_STYLE_ID = 'yizimarkdown-theme-css'
/** 用户 CSS（= 自定义主题的覆盖层）注入元素 id */
export const USER_CSS_STYLE_ID = 'yizimarkdown-user-css'

/** 选择器里的主题类名（`theme-` 后允许字母 / 数字 / 下划线 / 连字符） */
const THEME_CLASS = /\.theme-[a-zA-Z0-9_-]+/g

/** 从 i 开始跳过字符串字面量，返回结束位置（含右引号） */
function skipString(src: string, i: number): number {
  const quote = src[i]
  i++
  while (i < src.length) {
    if (src[i] === '\\') { i += 2; continue }
    if (src[i] === quote) return i + 1
    i++
  }
  return i
}

/** 从 i 开始跳过注释与空白，返回第一个非平凡字符的位置 */
function skipTrivia(src: string, i: number): number {
  for (;;) {
    if (src[i] === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2)
      i = end === -1 ? src.length : end + 2
      continue
    }
    if (i < src.length && /\s/.test(src[i])) { i++; continue }
    return i
  }
}

/**
 * 从 from 起扫描，返回深度为 0 时首个命中 stop 字符的下标（-1 = 未找到）。
 * 深度只统计圆括号 / 方括号（`:is(a, b)` 里的逗号、`[attr="x,y"]` 里的逗号不算分隔符）。
 */
function findTopLevel(src: string, from: number, stop: (c: string) => boolean): number {
  let depth = 0
  let i = from
  while (i < src.length) {
    const c = src[i]
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e === -1 ? src.length : e + 2; continue }
    if (c === '"' || c === "'") { i = skipString(src, i); continue }
    if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') depth--
    else if (depth === 0 && stop(c)) return i
    i++
  }
  return -1
}

/** 返回与 src[open]（必须是 `{`）匹配的 `}` 下标（未闭合则返回 src.length） */
function matchBrace(src: string, open: number): number {
  let depth = 0
  let i = open
  while (i < src.length) {
    const c = src[i]
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e === -1 ? src.length : e + 2; continue }
    if (c === '"' || c === "'") { i = skipString(src, i); continue }
    if (c === '{') depth++
    else if (c === '}') { depth--; if (depth === 0) return i }
    i++
  }
  return src.length
}

/** 按顶层分隔符切分（尊重括号 / 方括号 / 字符串 / 注释） */
function splitTopLevel(src: string, sep: string): string[] {
  const parts: string[] = []
  let depth = 0
  let cur = ''
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); const end = e === -1 ? src.length : e + 2; cur += src.slice(i, end); i = end; continue }
    if (c === '"' || c === "'") { const e = skipString(src, i); cur += src.slice(i, e); i = e; continue }
    if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') depth--
    if (c === sep && depth === 0) { parts.push(cur); cur = ''; i++; continue }
    cur += c
    i++
  }
  parts.push(cur)
  return parts
}

/** 给一条选择器列表里的每条选择器做「归属 + 提权」（保留原始空白） */
function normalizeSelectorList(selector: string, scope: string, target: string): string {
  return splitTopLevel(selector, ',')
    .map((raw) => {
      const sel = raw.trim()
      if (!sel) return raw
      // 已带主题类（无论哪个主题）：只把类名归一到 target，**不再加前缀**
      // —— `:root.theme-x :root.theme-x …` 这类双作用域永不匹配，必须避免
      if (new RegExp(THEME_CLASS.source).test(sel)) return raw.replace(THEME_CLASS, `.theme-${target}`)
      // 根元素选择器：`:root` / `html` 换成 `:root.theme-target`（等价目标，特异性升到 (0,2,0)）
      if (/^:root\b/.test(sel)) return raw.replace(/^(\s*):root\b/, `$1${scope}`)
      if (/^html\b/.test(sel)) return raw.replace(/^(\s*)html\b/, `$1${scope}`)
      // 其余：加后代作用域前缀
      const lead = /^\s*/.exec(raw)?.[0] ?? ''
      const trail = /\s*$/.exec(raw)?.[0] ?? ''
      return `${lead}${scope} ${sel}${trail}`
    })
    .join(',')
}

/** 需要递归改写内部规则的 at-rule（其余 at-rule 的块内容原样保留） */
const RECURSE_AT_RULES = new Set(['media', 'supports', 'layer', 'container', 'scope', 'document'])

/** 递归改写一段 CSS 文本（块体）的选择器 */
function walkBlocks(src: string, scope: string, target: string): string {
  let out = ''
  let i = 0
  while (i < src.length) {
    const triviaStart = i
    i = skipTrivia(src, i)
    out += src.slice(triviaStart, i)
    if (i >= src.length) break

    if (src[i] === '@') {
      const name = (/^@([\w-]+)/.exec(src.slice(i))?.[1] ?? '').toLowerCase()
      const stop = findTopLevel(src, i, (c) => c === '{' || c === ';')
      if (stop === -1) { out += src.slice(i); break }
      if (src[stop] === ';') { out += src.slice(i, stop + 1); i = stop + 1; continue }
      const end = matchBrace(src, stop)
      out += src.slice(i, stop + 1)
      const body = src.slice(stop + 1, end)
      out += RECURSE_AT_RULES.has(name) ? walkBlocks(body, scope, target) : body
      out += '}'
      i = end + 1
      continue
    }

    // 样式规则
    const brace = findTopLevel(src, i, (c) => c === '{')
    if (brace === -1) { out += src.slice(i); break }
    const end = matchBrace(src, brace)
    out += normalizeSelectorList(src.slice(i, brace), scope, target) + '{' + src.slice(brace + 1, end) + '}'
    i = end + 1
  }
  return out
}

/**
 * 把主题文件的选择器**归属**到目标主题名。
 * 主题文件写的是自己的名字（`:root.theme-brocade`），但 `<html>` 上挂的是当前生效主题，
 * 所以必须归一；同名的重写是无害的空操作。
 */
export function retargetThemeCss(css: string, target: string): string {
  if (!css || !target) return css
  return css.replace(THEME_CLASS, `.theme-${target}`)
}

/**
 * 用户 CSS 规范化：主题类名归一到 `target`，并对不带主题类的选择器追加作用域前缀
 * （使其稳定压过主题）。纯函数，便于单测。
 */
export function normalizeUserCss(css: string, target: string): string {
  if (!css || !target) return css
  return walkBlocks(css, `:root.theme-${target}`, target)
}

/* ═══════════════════════════════════════════════════════════════
   保存前清洗：剥离「复制污染」
   用户常从聊天窗口 / AI 回复 / PDF 里复制主题 CSS，最常见的两类污染：
   ① 行首行号（"12 :root { … }"）—— 裸数字落在规则之间会让 CSS 解析
     在第一处断掉，其后所有规则静默失效（真实踩坑：整份主题粘进去毫无反应）；
   ② 零宽字符（ZWSP/ZWNJ/ZWJ/BOM/软连字符等）—— 肉眼不可见，却会让
     令牌名、颜色值悄悄失配。
   ═══════════════════════════════════════════════════════════════ */

/** 零宽 / 不可见字符（保留 \n \r \t 等常规空白） */
const INVISIBLE_RE = /[\u200B-\u200F\u2060\u2061\u2062\u2063\u2064\uFEFF\u00AD\u180E]/g

/**
 * 剥离一行开头的行号：行首空白后跟纯数字，再跟空白或 `.` `)` 分隔符。
 * 匹配 `12 :root {`、`3.  --a: 1`、`12) .toolbar {` 等形态。
 * 刻意**不**匹配 `12:`（冒号紧跟数字）—— 那是时间戳/比分的形态，而 CSS 里
 * `数字:` 只出现在 `@media (max-width: 600px)` 这类括号内（行首不会是裸数字），
 * 保守起见交给「多数行命中才整体剥离」的门槛兜底。
 * 行号与其后的分隔空白一并剥掉（`2   --a: 1` → `--a: 1`）；行号前的缩进保留。
 */
function stripLeadingLineNumber(line: string): string {
  const m = /^(\s*)(\d{1,4})(?:[.)]\s*|\s+)(.*)$/.exec(line)
  if (!m) return line
  return (m[1] ?? '') + (m[3] ?? '')
}

/**
 * 清洗用户粘贴的 CSS：
 * 1) 剥离零宽 / 不可见字符；
 * 2) 剥离行首行号（仅当**多数非空行**都带行号时才整体剥离 —— 单行误判的代价
 *    远小于把合法内容剥坏）。
 * 纯函数，便于单测。
 */
export function sanitizeUserCss(css: string): string {
  if (!css) return css
  // ① 零宽字符：无条件剥离（它们在 CSS 里永远非法）
  let out = css.replace(INVISIBLE_RE, '')
  // ② 行首行号：先统计（只统计「行号后有内容」的行），多数行命中才动手
  const lines = out.split(/\r?\n/)
  const nonEmpty = lines.filter((l) => l.trim())
  if (nonEmpty.length >= 3) {
    const numbered = nonEmpty.filter((l) => /^(\s*)(\d{1,4})(?:[.)]\s*|\s+)\S/.test(l)).length
    if (numbered / nonEmpty.length > 0.5) {
      out = lines.map(stripLeadingLineNumber).join('\n')
    }
  }
  return out
}
