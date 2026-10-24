import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import footnote from 'markdown-it-footnote'
import hljs from 'highlight.js'
import { generateHeadingId } from './headingId.ts'
import { splitFrontMatter } from './frontMatter.ts'
import { tocPlugin } from './toc.ts'

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

// ---- 自定义渲染规则：把 data-source-line 带进 fence 的 <pre> 输出 ----
// highlight() 返回的是完整 <pre> 字符串，markdown-it 对以 <pre 开头的结果原样输出，
// 令牌属性（含 core 注入的 data-source-line）不会合并进来，这里在默认规则外包一层补上。
// 必须在插件扩展之前安装：mermaid 等插件以本规则为 defaultFence 包装，非 mermaid fence 仍会经过这里。
function injectFenceSourceLine(md: MarkdownIt): void {
  const defaultFence = md.renderer.rules.fence
    || function (tokens, idx, options, _env, self) {
      return self.renderToken(tokens, idx, options)
    }
  md.renderer.rules.fence = function (tokens, idx, options, env, self) {
    const html = defaultFence(tokens, idx, options, env, self)
    const line = tokens[idx].attrGet('data-source-line')
    if (!line) return html
    return html.replace(/^<pre\b/, `<pre data-source-line="${line}"`)
  }
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
    html: true,
    xhtmlOut: false,
    breaks: true,
    langPrefix: 'language-',
    linkify: true,
    typographer: false,
    highlight: function (str: string, lang: string): string {
      // 如果指定了语言且 highlight.js 支持该语言
      if (lang && hljs.getLanguage(lang)) {
        try {
          const result = hljs.highlight(str, { language: lang, ignoreIllegals: true })
          return `<pre class="hljs" data-lang="${lang}"><code class="language-${lang}">${result.value}</code></pre>`
        } catch (__) {}
      }
      // 尝试自动检测语言
      try {
        const result = hljs.highlightAuto(str)
        return `<pre class="hljs" data-lang="auto"><code>${result.value}</code></pre>`
      } catch (__) {}
      // 降级：转义 HTML
      return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`
    }
  })

  // `labelAfter: false`（默认值）：`<label><input> 任务文本（含 `code`/**加粗**）</label>`。
  //
  // 不能用 `labelAfter: true` —— 那样插件会把 `token.content`（**原始 Markdown 文本**，含反引号与
  // `**`）塞进一个额外的 `<label>`，而已经渲染好的行内内容仍在原处，于是「带 `代码` 与 **加粗** 的项」
  // 会在预览里**重复出现两遍**（第二遍是未渲染的源码）。
  // `data:image/svg+xml` 放行：markdown-it 默认只允许 gif/png/jpeg/webp 的 data URI，
  // SVG 会被判为非法链接而退回源码文本（表现为 data URI 裸露在正文里、不换行撑破容器；
  // 引用式图片定义同样会解析失败）。只额外放行 SVG，不放开整个 `data:`。
  const defaultValidateLink = md.validateLink.bind(md)
  md.validateLink = (url: string) => {
    if (/^data:image\/svg\+xml(?:[;,]|$)/i.test(url.trim())) return true
    return defaultValidateLink(url)
  }

  md.use(taskLists, { enabled: true, label: true, labelAfter: false })
  // 脚注（学术引用）：[^n] 上标 → 点击跳文末定义，定义带 ↩ 返回链（markdown-it-footnote 原生行为）
  md.use(footnote)
  injectSourceLineMap(md)
  injectFenceSourceLine(md)
  injectHeadingIds(md)
  // [toc] / [[toc]]：必须在 inline 规则之后、渲染之前替换成目录 HTML
  tocPlugin(md)

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
  // 元信息块不参与预览渲染。解析统一在 lib/frontMatter.ts
  // （此前这里有一份与 slides.ts 规则不一致的内联正则）。
  return getMarkdownIt(pluginExtenders).render(splitFrontMatter(content).body)
}

export default getMarkdownIt
