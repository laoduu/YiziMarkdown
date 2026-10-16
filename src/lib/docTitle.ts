import { splitFrontMatter } from './frontMatter.ts'

/**
 * 保存对话框默认文件名的推导（不含扩展名），优先级：
 *   1. 元信息 front matter 的 title —— 显式命名意图，最高优先
 *   2. 正文中第一个 ATX 标题行（# ~ ######）—— 去掉 # 标志
 *   3. 都没有 → null，调用方回落默认名（untitled.md / document）
 *
 * 刻意不用「第一个非空行」兜底：非标题首行可能是代码围栏、表格、URL、
 * 列表项，拿来做文件名噪声太大；保持可预测性。
 *
 * 结果已做 Windows 文件名清洗：非法字符换空格、压平连续空白、
 * 去首尾空白与点（Windows 禁止）、截断 60 字符、避开系统保留名。
 */

const ILLEGAL = /[\\/:*?"<>|]/g
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
// ATX 标题：# 后必须有空白（CommonMark，`#标题` 不是标题）；允许尾随闭合 #
const HEADING = /^ {0,3}#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/
const MAX_LEN = 60

/** 清洗为合法文件名片段；清完为空或是系统保留名 → null */
function sanitize(raw: string): string | null {
  const cleaned = raw.replace(ILLEGAL, ' ').replace(/\s+/g, ' ').trim().replace(/^[. ]+|[. ]+$/g, '')
  // 按码点截断，中文 / emoji 不被劈成半个
  const name = Array.from(cleaned).slice(0, MAX_LEN).join('').replace(/[. ]+$/g, '').trim()
  if (!name || RESERVED.test(name)) return null
  return name
}

export function deriveDocumentTitle(content: string): string | null {
  // 1) 元信息 title（splitFrontMatter 已小写化键、剥掉值的首尾引号）
  const { meta, body } = splitFrontMatter(content)
  const fromMeta = meta.title ? sanitize(meta.title) : null
  if (fromMeta) return fromMeta

  // 2) 正文第一个标题行
  for (const line of body.split('\n')) {
    const m = line.match(HEADING)
    if (m) return sanitize(m[1])
  }
  return null
}
