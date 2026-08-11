/**
 * slides.ts — 演示模式（幻灯片）的分页、配置与指令解析。
 *
 * 约定（与普通预览互不干扰）：
 *   - 文档顶部 front matter（首个 `--- ... ---` 块）可承载幻灯片配置（见 SlidesConfig）。
 *   - `---`（单独成行）→ 横向幻灯片分页（演示模式下为分页符，非 <hr>）。
 *   - `--`（单独成行）→ 同一横向页内的纵向子页。
 *   - 代码围栏（```）内的分隔符是内容，不切分。
 *   - 幻灯片顶部 HTML 注释指令 `<!-- key: value -->`（可扩展，见 extractSlide）。
 */

/** 文档级幻灯片配置（来自 front matter 的 slides: 子树） */
export interface SlidesConfig {
  /** 本演示的默认主题（可选，缺省用应用当前主题） */
  theme?: string
  /** 横向分页分隔符（默认 `---`） */
  splitHorizontal?: string
  /** 纵向子页分隔符（默认 `--`） */
  splitVertical?: string
  /** 无 layout 指令时的默认布局 */
  defaultLayout?: string
  /** 自定义指令名 → 追加到该幻灯片的 CSS 类（可含空格分隔的多个类） */
  directives?: Record<string, string>
  /** 首块元素类型 → 追加到该幻灯片的 CSS 类（markdown 结构 → 幻灯片元素的映射） */
  elementMap?: Record<string, string>
}

type YamlNode = string | YamlMap
interface YamlMap { [k: string]: YamlNode }

/** 极简 YAML 子集解析：仅支持缩进嵌套的 key: value / key:（子块） */
function parseYamlSubset(text: string): YamlMap {
  const lines = text.split(/\r?\n/)
    .map(l => l.replace(/\s*#.*$/, '')) // 去注释
    .filter(l => l.trim() !== '')
  const root: YamlMap = {}
  const stack: Array<{ indent: number; obj: YamlMap }> = [{ indent: -1, obj: root }]
  for (const line of lines) {
    const indent = line.search(/\S/)
    const content = line.trim()
    const colon = content.indexOf(':')
    if (colon === -1) continue
    const key = content.slice(0, colon).trim()
    const value = content.slice(colon + 1).trim()
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop()
    const parent = stack[stack.length - 1].obj
    if (value === '') {
      const child: YamlMap = {}
      parent[key] = child
      stack.push({ indent, obj: child })
    } else {
      parent[key] = value
    }
  }
  return root
}

/**
 * 解析文档 front matter 中的幻灯片配置，并返回剥离 front matter 后的正文。
 * 无 front matter 时返回空配置与原文。
 */
export function parseSlidesConfig(src: string): { config: SlidesConfig; rest: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src)
  if (!m) return { config: {}, rest: src }
  const parsed = parseYamlSubset(m[1])
  const slides = (parsed['slides'] && typeof parsed['slides'] === 'object' ? parsed['slides'] : {}) as YamlMap
  const config: SlidesConfig = {}
  if (typeof slides['theme'] === 'string') config.theme = slides['theme']
  if (typeof slides['defaultLayout'] === 'string') config.defaultLayout = slides['defaultLayout']
  if (typeof slides['splitHorizontal'] === 'string') config.splitHorizontal = slides['splitHorizontal']
  if (typeof slides['splitVertical'] === 'string') config.splitVertical = slides['splitVertical']
  if (slides['directives'] && typeof slides['directives'] === 'object') {
    config.directives = {}
    for (const [k, v] of Object.entries(slides['directives'])) if (typeof v === 'string') config.directives[k] = v
  }
  if (slides['elementMap'] && typeof slides['elementMap'] === 'object') {
    config.elementMap = {}
    for (const [k, v] of Object.entries(slides['elementMap'])) if (typeof v === 'string') config.elementMap[k] = v
  }
  return { config, rest: src.slice(m[0].length) }
}

/** 去掉文档顶部的 front matter（首个 `--- ... ---` 块） */
export function stripFrontMatter(src: string): string {
  return src.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
}

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 按行拆分幻灯片，返回 string[][]：外层 = 横向页，内层 = 该页的纵向子页。
 * fence 感知：``` 内的分隔行视为内容。分隔符可配置。
 */
export function splitSlides(src: string, hor = '---', ver = '--'): string[][] {
  if (!src) return [['']]
  const lines = src.split(/\r?\n/)
  const decks: string[][] = []
  let stack: string[][] = [[]] // 当前横向页的纵向子页列表
  let buf: string[] = []
  let inFence = false
  const reHor = new RegExp(`^${esc(hor)}\\s*$`)
  const reVer = new RegExp(`^${esc(ver)}\\s*$`)

  // 仅提交非空内容，避免 `--` 产生幻影空页
  const pushBuf = () => {
    const s = buf.join('\n')
    if (s.trim() !== '') stack[stack.length - 1].push(s)
    buf = []
  }
  const pushHorizontal = () => {
    pushBuf()
    decks.push(stack[0])
    stack = [[]]
  }

  for (const line of lines) {
    if (/^```/.test(line)) inFence = !inFence
    if (!inFence && reHor.test(line)) {
      pushHorizontal()
    } else if (!inFence && reVer.test(line)) {
      pushBuf() // 结束当前纵向子页，后续行开始新的纵向子页
    } else {
      buf.push(line)
    }
  }
  pushBuf()
  decks.push(stack[0])

  // 去掉开头的空横向页（防 front matter 残留的防御性处理）
  if (decks.length > 1 && decks[0].every((s) => s.trim() === '')) {
    decks.shift()
  }
  return decks
}

function isImageValue(value: string): boolean {
  return /^(https?:\/\/|\.{0,2}\/|file:|data:image\/)/.test(value)
    || /\.(jpe?g|png|gif|webp|avif|svg)\b/i.test(value)
}

export interface SlideDirectives {
  body: string
  /** 纯色 / 渐变 / 图片 URL */
  bg?: string
  bgIsImage?: boolean
  bgSize?: string
  bgPosition?: string
  bgOpacity?: string
  /** 命名布局（hero/divider/content/image 等） */
  layout?: string
  /** 内容对齐（center/left/right/top/middle/bottom） */
  align?: string
  /** 追加到该幻灯片的 CSS 类 */
  extraClasses: string[]
  notes: string
}

export interface NotesResult {
  body: string
  notes: string
}

/**
 * 提取并剥离演讲者备注注释（`<!-- notes ... -->`），返回剥离后的正文与备注文本。
 * 支持单行 `<!-- notes: 内容 -->` 与多行 `<!-- notes\n内容\n-->`。
 */
export function extractNotes(raw: string): NotesResult {
  const parts: string[] = []
  const re = /<!--\s*notes([\s\S]*?)-->/gi
  const body = raw.replace(re, (_, content: string) => {
    const text = content.replace(/^[ \t]*/gm, '').trim()
    parts.push(text.replace(/^:\s*/, ''))
    return ''
  })
  return { body, notes: parts.join('\n').trim() }
}

/**
 * 解析并剥离幻灯片顶部的 HTML 注释指令（可扩展）。
 * 内置指令：bg / bg-size / bg-position / bg-opacity / layout / align / class。
 * customDirectives 允许把自定义指令名映射为追加的 CSS 类。
 * notes 可在任意位置，单独由 extractNotes 处理。
 */
export function extractSlide(raw: string, customDirectives: Record<string, string> = {}): SlideDirectives {
  const { body: bodyNoNotes, notes } = extractNotes(raw)
  const lines = bodyNoNotes.split(/\r?\n/)
  const kept: string[] = []
  const d: SlideDirectives = { body: bodyNoNotes, extraClasses: [], notes }
  let inHeader = true
  for (const line of lines) {
    if (inHeader) {
      const m = /^\s*<!--\s*([\w-]+)\s*(?::\s*(.*?))?\s*-->\s*$/.exec(line)
      if (m) {
        const key = m[1].toLowerCase()
        const value = (m[2] || '').trim()
        switch (key) {
          case 'bg': if (value) { d.bg = value; d.bgIsImage = isImageValue(value) } break
          case 'bg-size': if (value) d.bgSize = value; break
          case 'bg-position': if (value) d.bgPosition = value; break
          case 'bg-opacity': if (value) d.bgOpacity = value; break
          case 'layout': if (value) d.layout = value; break
          case 'align': if (value) d.align = value; break
          case 'class': d.extraClasses.push(...value.split(/\s+/).filter(Boolean)); break
          default:
            if (customDirectives[key]) {
              d.extraClasses.push(...customDirectives[key].split(/\s+/).filter(Boolean))
            }
        }
        continue
      }
      if (line.trim() === '') { kept.push(line); continue }
      inHeader = false
    }
    kept.push(line)
  }
  d.body = kept.join('\n')
  return d
}

/**
 * 识别幻灯片正文的首块元素类型，用于 elementMap 映射。
 * 返回：h1~h6 / img / code / quote / table / list / text
 */
export function detectElementType(body: string): string {
  const line = body.split(/\r?\n/).map(l => l.trim()).find(l => l !== '') || ''
  if (/^#{1,6}\s/.test(line)) {
    const n = /^(#{1,6})/.exec(line)![1].length
    return 'h' + n
  }
  if (/^!\[/.test(line)) return 'img'
  if (/^```/.test(line)) return 'code'
  if (/^>\s/.test(line)) return 'quote'
  if (/^\|/.test(line)) return 'table'
  if (/^[-*+]\s/.test(line) || /^\d+[.)]\s/.test(line)) return 'list'
  return 'text'
}
