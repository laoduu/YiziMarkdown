/**
 * 标题 ID 生成：大纲和渲染器共用同一份逻辑
 * 确保大纲点击的 id 与预览 HTML 中的锚点 id 完全一致
 */

// 匹配 Markdown 行内格式标记，提取纯文本内容
const FORMAT_MARKS = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|~~(.+?)~~|\[([^\]]+)\]\([^)]+\)/g

/** 剥掉 Markdown 行内格式标记，得到纯文本 */
function stripFormatting(text: string): string {
  return text
    .replace(FORMAT_MARKS, '$1$2$3$4$5')
    .replace(/<[^>]*>/g, '')
    .trim()
}

/** 将标题文本转为 URL 安全的 slug（去首尾连字符） */
export function slugify(text: string): string {
  return stripFormatting(text)
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** 根据标题文本生成唯一 ID，同名标题自动追加编号 */
export function generateHeadingId(text: string, counter: Record<string, number>): string {
  const base = slugify(text)
  counter[base] = (counter[base] || 0) + 1
  return counter[base] === 1 ? base : `${base}-${counter[base]}`
}

/** 大纲节点 */
export interface OutlineItem {
  level: number
  text: string
  id: string
  line: number
}

/** 从 Markdown 源码解析大纲结构（标题列表） */
export function computeOutlineItems(content: string): OutlineItem[] {
  const items: OutlineItem[] = []
  const counter: Record<string, number> = {}
  const lines = content.split('\n')
  let fenceChar: '`' | '~' | null = null
  let fenceLen = 0
  let inComment = false
  let inFrontMatter = false

  for (let index = 0; index < lines.length; index++) {
    // 先剥掉 CRLF 行尾的 \r（JS 正则的 . 不匹配 \r，否则 CRLF 文档的标题全部匹配失败）
    const line = lines[index].replace(/\r$/, '')

    // 元信息块（只认文档第一行的 `---`）
    if (index === 0 && /^---\s*$/.test(line)) {
      inFrontMatter = true
      continue
    }
    if (inFrontMatter) {
      if (/^(---|\.\.\.)\s*$/.test(line)) inFrontMatter = false
      continue
    }

    // HTML 注释块
    if (inComment) {
      if (line.includes('-->')) inComment = false
      continue
    }

    // 围栏代码块：块内的 `# 注释` 是代码，不是标题（否则代码会跑进大纲）。
    // 闭合围栏必须同字符、且长度不短于开启围栏（```` 里的 ``` 不闭合）。
    if (fenceChar) {
      const close = /^\s{0,3}(`{3,}|~{3,})\s*$/.exec(line)
      if (close && close[1][0] === fenceChar && close[1].length >= fenceLen) {
        fenceChar = null
        fenceLen = 0
      }
      continue
    }
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
    if (fenceMatch) {
      fenceChar = fenceMatch[1][0] as '`' | '~'
      fenceLen = fenceMatch[1].length
      continue
    }

    if (/^\s*<!--/.test(line)) {
      if (!line.includes('-->')) inComment = true
      continue
    }

    // 缩进代码块（4 格或 tab）：markdown-it 不会把它当标题
    if (/^(?: {4}|\t)/.test(line)) continue

    const match = line.match(/^(#{1,6})\s+(.+)$/)
    if (match) {
      const id = generateHeadingId(match[2], counter)
      items.push({
        level: match[1].length,
        text: match[2].trim(),
        id,
        line: index + 1,
      })
    }
  }
  return items
}

/** 在大纲列表中，从后往前找 line <= targetLine 的最近标题（源代码定位用） */
export function findOutlineByLine(items: OutlineItem[], targetLine: number): OutlineItem | null {
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].line <= targetLine) return items[i]
  }
  return null
}
