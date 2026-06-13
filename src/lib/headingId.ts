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
  content.split('\n').forEach((line, index) => {
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
  })
  return items
}

/** 在大纲列表中，从后往前找 line <= targetLine 的最近标题（源代码定位用） */
export function findOutlineByLine(items: OutlineItem[], targetLine: number): OutlineItem | null {
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].line <= targetLine) return items[i]
  }
  return null
}
