import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import { generateHeadingId } from './headingId'

// 初始化 markdown-it 实例
const md = new MarkdownIt({
  html: false,        // 禁用原始 HTML（安全）
  xhtmlOut: false,
  breaks: true,       // 单个换行转 <br>
  langPrefix: 'language-',
  linkify: true,      // 自动识别链接
  typographer: false,
})

// 插件：任务列表（可勾选 checkbox）
md.use(taskLists, { 
  enabled: true,
  label: true,
  labelAfter: true,
})

// Core ruler：给块级元素注入 data-source-line 属性（1-indexed）
// 用于编辑器和预览之间的精确行级同步
const BLOCK_OPEN_TYPES = new Set([
  'paragraph_open', 'heading_open', 'blockquote_open',
  'list_item_open', 'bullet_list_open', 'ordered_list_open',
  'table_open', 'fence', 'code_block', 'hr', 'html_block',
])

md.core.ruler.push('source_line_map', (state) => {
  for (const tok of state.tokens) {
    if (!BLOCK_OPEN_TYPES.has(tok.type)) continue
    if (!tok.map || tok.map.length < 1) continue
    const line = tok.map[0] + 1 // markdown-it 行号从 0 开始，转为 1-indexed
    tok.attrJoin('data-source-line', String(line))
  }
})

// 自定义渲染规则：标题加唯一 ID（用于大纲跳转和同名标题去重）
const headingCount: Record<string, number> = {}

const defaultHeadingOpen = md.renderer.rules.heading_open || function(tokens, idx, options, _env, self) {
  return self.renderToken(tokens, idx, options)
}

md.renderer.rules.heading_open = function(tokens, idx, options, env, self) {
  const token = tokens[idx]
  const inlineToken = tokens[idx + 1]
  
  let text = ''
  if (inlineToken && inlineToken.children) {
    text = inlineToken.children
      .filter(t => t.type === 'text' || t.type === 'code_inline')
      .map(t => t.content)
      .join('')
  }
  
  const id = generateHeadingId(text, headingCount)
  token.attrSet('id', id)
  return defaultHeadingOpen(tokens, idx, options, env, self)
}

/**
 * 渲染 Markdown 为 HTML
 * 每次调用前重置标题计数器，确保同名标题去重正确
 */
export function renderMarkdown(content: string): string {
  // 重置标题计数
  Object.keys(headingCount).forEach(k => delete headingCount[k])
  return md.render(content)
}

export default md
