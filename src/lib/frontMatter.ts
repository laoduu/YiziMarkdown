/**
 * YAML front matter（文档顶部的元信息块）的**唯一事实源**。
 *
 * 为什么要有这个模块：此前项目里有两份**互不一致**的实现 ——
 *   · `slides.ts` 的 stripFrontMatter / parseFrontMatter（演示模式用）
 *   · `markdownRenderer.ts` 里一个内联正则（预览模式用）
 * 两者规则不同（一个允许前导空行、一个不允许；一个把结尾换行也算进块内、一个要求必须有换行），
 * 是长期隐患 —— 同一份文档在演示模式与预览模式下对"元信息到哪结束"的判断可能不一致。
 *
 * 这里统一，并额外给出**字符偏移**：CodeMirror 侧要靠它决定"哪些区间不参与 Markdown 渲染"、
 * 以及属性面板写回时该改哪个字符区间。
 *
 * 刻意不引入 YAML 解析依赖：元信息只需要 `key: value` 单行键值，够用；
 * 为一个可选特性背一个解析器不划算，也与仓库"纯函数、零依赖"的既有取向一致。
 */

/** 属性类型（供属性面板选择；与 Obsidian 的 types.json 语义一致，按属性名全局存） */
export type FrontMatterPropType =
  | 'auto' | 'text' | 'number' | 'checkbox' | 'date' | 'datetime' | 'list'

/** 一条属性（含写回所需的字符偏移） */
export interface FrontMatterProp {
  key: string
  /** 已去掉首尾引号的值 */
  value: string
  /** 键在原文中的区间 */
  keyFrom: number
  keyTo: number
  /** 值在原文中的区间（已 trim） */
  valueFrom: number
  valueTo: number
  /** 整行区间（删除该属性时用；不含行尾换行） */
  lineFrom: number
  lineTo: number
  /** 该键后面跟着缩进续行（YAML 块状列表/嵌套）⇒ 属性面板应只读，避免写坏结构 */
  hasBlockValue: boolean
}

export interface FrontMatterSplit {
  /** 解析出的键值（键统一小写、值去掉首尾引号）；无元信息时为空对象 */
  meta: Record<string, string>
  /** 去掉元信息块之后的正文 */
  body: string
  /** 元信息块在原文中的区间 [from, to)；无元信息时为 null */
  range: { from: number; to: number } | null
  /** 逐条属性（含偏移）；无元信息时为空数组 */
  props: FrontMatterProp[]
}

/* ------------------------------------------------------------------ */
/* 判定规则（严格档）                                                    */
/* ------------------------------------------------------------------ */
/*
 * 是元信息 ⟺ 三条同时成立：
 *   1. **第 1 行第 1 列就是 `---`**（不允许前导空行/空格；Jekyll / Hugo / Obsidian 一致）
 *   2. 存在闭合行：`---` 或 `...`（允许尾随空白）
 *   3. 块内每一行都属于 { 空行 / `#` 注释 / `key: value` / 缩进续行 }，且**至少有一行 `key: value`**
 *
 * 为什么第 3 条不是"每行都必须 `key: value`"：合法 YAML 允许列表与嵌套
 *     tags:
 *       - 工作
 * 第 2、3 行不是键值对，逐行硬判会**误杀合法元信息**。
 * 为什么"至少一行键值对"必需：`# 第一章` 在 YAML 里就是注释，光靠"注释行合法"挡不住散文。
 *
 * 已知的固有歧义（与 Obsidian 相同，不做特殊处理）：
 *     ---
 *     Note: this is prose
 *     ---
 * 这本身就是合法 YAML 映射，只能当作元信息。
 */

const OPEN_OR_CLOSE = /^---[ \t]*$/
const CLOSE_DOTS = /^\.\.\.[ \t]*$/
/**
 * `key: value` 的判定。
 *
 * 刻意**不要求 key 是 ASCII 标识符**：那样会误杀 `publish.date:`（Hugo/Jekyll 常见的点号键）、
 * `标题:`（中文键）、`my key:`（YAML 的 plain scalar key 可以含空格）—— 都是合法 YAML。
 * 实测过：过严会让整块元信息被拒，连带 author/date/title 一起消失。
 *
 * 保留的约束是**冒号后必须有空白或行尾**：这一条能挡掉 `https://example.com` 这类
 * "看着像键值对其实是 URL"的行（`https:` 后面是 `/`）。
 * 散文误判由"块内至少有一行键值对"兜住 —— 见下方 splitFrontMatter 的第 3 步。
 */
const KEY_LINE = /^[^\s#][^:]*:(?:\s|$)/
const KV = /^([^\s#][^:]*):\s*(.*)$/

/** 该行是否是 YAML 映射的合法成分 */
function isMappingLine(line: string): boolean {
  const t = line.trim()
  if (t === '') return true            // 空行
  if (t.startsWith('#')) return true   // 注释
  if (KEY_LINE.test(line)) return true // key: value（key 必须 ASCII 标识符）
  if (/^\s/.test(line)) return true    // 缩进续行：列表项 / 嵌套
  return false
}

/** 按行扫描，同时给出每行的文本与字符区间（不丢 \r\n 的偏移信息）。
 *  先剥掉开头的 BOM —— Windows 编辑器常加，否则第 1 行就不是 `---` 而整块失效。 */
function scanLines(src: string) {
  const text = src.charCodeAt(0) === 0xfeff ? src.slice(1) : src
  const out: { text: string; from: number; to: number; next: number }[] = []
  for (const m of text.matchAll(/([^\r\n]*)(\r?\n|$)/g)) {
    if (m[0] === '') break
    const from = m.index!
    out.push({ text: m[1], from, to: from + m[1].length, next: from + m[0].length })
  }
  return out
}

const EMPTY = (src: string): FrontMatterSplit => ({ meta: {}, body: src, range: null, props: [] })

export function splitFrontMatter(src: string): FrontMatterSplit {
  const lines = scanLines(src)

  // 1) 严格：第 1 行必须就是 ---
  if (lines.length < 2 || !OPEN_OR_CLOSE.test(lines[0].text)) return EMPTY(src)

  // 2) 找闭合行，并逐行校验内容
  let closeIdx = -1
  let sawKv = false
  for (let i = 1; i < lines.length; i++) {
    const text = lines[i].text
    if (OPEN_OR_CLOSE.test(text) || CLOSE_DOTS.test(text)) {
      closeIdx = i
      break
    }
    if (!isMappingLine(text)) return EMPTY(src) // 出现"非 YAML 成分"的行 ⇒ 整块不是元信息
    if (KEY_LINE.test(text)) sawKv = true
  }
  // 3) 必须有闭合行，且至少一条键值对
  if (closeIdx < 0 || !sawKv) return EMPTY(src)

  const range = { from: lines[0].from, to: lines[closeIdx].next }

  // 逐条解析属性（含偏移）
  const meta: Record<string, string> = {}
  const props: FrontMatterProp[] = []
  for (let i = 1; i < closeIdx; i++) {
    const line = lines[i]
    const m = KV.exec(line.text)
    if (!m) continue
    const rawValue = m[2]
    const lead = rawValue.length - rawValue.trimStart().length
    const trimmed = rawValue.trim()
    const valueFrom = line.from + m[0].length - rawValue.length + lead
    const value = trimmed.replace(/^["']|["']$/g, '')
    // 该行之后紧跟缩进续行 ⇒ 块状值，面板只读
    const hasBlockValue = i + 1 < closeIdx && /^\s/.test(lines[i + 1].text)

    meta[m[1].toLowerCase()] = value
    props.push({
      key: m[1],
      value,
      keyFrom: line.from,
      keyTo: line.from + m[1].length,
      valueFrom,
      valueTo: valueFrom + trimmed.length,
      lineFrom: line.from,
      lineTo: line.to,
      hasBlockValue,
    })
  }

  return { meta, body: src.slice(range.to), range, props }
}

/** 便捷：只要属性列表 */
export function parseProperties(src: string): FrontMatterProp[] {
  return splitFrontMatter(src).props
}
