import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import { generateHeadingId } from './headingId'

// ---- Core ruler：给块级元素注入 data-source-line 属性 ----
const BLOCK_OPEN_TYPES = new Set([
  'paragraph_open', 'heading_open', 'blockquote_open',
  'list_item_open', 'bullet_list_open', 'ordered_list_open',
  'table_open', 'fence', 'code_block', 'hr', 'html_block',
])

function injectSourceLineMap(md: MarkdownIt): void {
  md.core.ruler.push('source_line_map', (state) => {
    for (const tok of state.tokens) {
      if (!BLOCK_OPEN_TYPES.has(tok.type)) continue
      if (!tok.map || tok.map.length < 1) continue
      const line = tok.map[0] + 1
      tok.attrJoin('data-source-line', String(line))
    }
  })
}

// ---- 自定义渲染规则：标题加唯一 ID ----
function injectHeadingIds(md: MarkdownIt): void {
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

    const id = generateHeadingId(text, headingCountRef)
    token.attrSet('id', id)
    return defaultHeadingOpen(tokens, idx, options, env, self)
  }
}

// ---- 标题计数器引用，供外部重置 ----
let headingCountRef: Record<string, number> = {}

/**
 * 创建 markdown-it 实例
 * @param enabledPlugins 已启用的插件扩展函数列表
 */
export function createMarkdownIt(
  pluginExtenders?: Array<(md: MarkdownIt) => void>
): MarkdownIt {
  const md = new MarkdownIt({
    html: false,
    xhtmlOut: false,
    breaks: true,
    langPrefix: 'language-',
    linkify: true,
    typographer: false,
  })

  md.use(taskLists, { enabled: true, label: true, labelAfter: true })
  injectSourceLineMap(md)
  injectHeadingIds(md)

  // 注入插件扩展
  if (pluginExtenders) {
    for (const ext of pluginExtenders) {
      ext(md)
    }
  }

  return md
}

// 默认实例（无插件）
let defaultMd: MarkdownIt | null = null
let lastPluginKey: string | null = null

/**
 * 获取 markdown-it 实例
 * @param pluginExtenders 插件扩展列表，变化时自动重建
 */
export function getMarkdownIt(
  pluginExtenders?: Array<(md: MarkdownIt) => void>
): MarkdownIt {
  const key = pluginExtenders ? pluginExtenders.map(() => '1').join('') : ''
  if (defaultMd && lastPluginKey === key) return defaultMd

  defaultMd = createMarkdownIt(pluginExtenders)
  lastPluginKey = key
  return defaultMd
}

/**
 * 渲染 Markdown 为 HTML
 * @param content Markdown 文本
 * @param pluginExtenders 插件扩展列表
 */
export function renderMarkdown(
  content: string,
  pluginExtenders?: Array<(md: MarkdownIt) => void>
): string {
  // 重置标题计数
  Object.keys(headingCountRef).forEach(k => delete headingCountRef[k])
  return getMarkdownIt(pluginExtenders).render(content)
}

export default getMarkdownIt
