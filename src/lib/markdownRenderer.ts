import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import footnote from 'markdown-it-footnote'
import hljs from 'highlight.js'
import { generateHeadingId } from './headingId.ts'
import { splitFrontMatter } from './frontMatter.ts'
import { normalizeMarkdownMarkers } from './markdownMarkerNbsp.ts'
import { tocPlugin } from './toc.ts'
import { alertPlugin } from './alert.ts'
import { extendCoreMarkdownIt } from '../renderers/index.ts'

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

// ---- Core ruler：解析完就给每个标题注入唯一 ID ----
// 以前 id 在渲染阶段（renderer.rules.heading_open）才生成，而 `[toc]` 插件跑在 core 的
// inline 之后 —— 那时拿不到 id，只能自己再跑一遍 generateHeadingId，靠「同一个函数 +
// 相同遍历顺序」维持一致。现在改成在 core 里写进 heading_open 的 attrs，目录直接读，
// 只有一个来源，也就不会出现目录与锚点静默分叉。
function assignHeadingIds(md: MarkdownIt): void {
  md.core.ruler.after('inline', 'heading_ids', (state) => {
    Object.keys(headingCountRef).forEach(k => delete headingCountRef[k])
    for (let i = 0; i < state.tokens.length; i++) {
      const token = state.tokens[i]
      if (token.type !== 'heading_open') continue
      const inlineToken = state.tokens[i + 1]
      const text = inlineToken?.children
        ? inlineToken.children
            .filter(t => t.type === 'text' || t.type === 'code_inline')
            .map(t => t.content)
            .join('')
        : String(inlineToken?.content ?? '')
      const id = generateHeadingId(text, headingCountRef)
      if (id) token.attrSet('id', id)
    }
  })
}

// ---- 行内扩展：^上标^ / ~下标~ / ==高亮== ----
// markdown-it 原生只有 ~~删除线~~；这里补三条行内规则，输出与 DOCX 侧保持同一套语义：
// - `^x^` → <sup>，`~x~` → <sub>（`~~x~~` 仍交给 markdown-it 的 strikethrough）
// - `==x==` → <mark>
// 内容按纯文本处理（不递归解析强调），与导出的 `w:vertAlign` / `w:highlight` 一致。
/**
 * 上下标内容里禁止出现的字符：空白、中英文标点、括号、Markdown / 代码标记。
 *
 * 单波浪线在中文里常被当区间号用（`64K~512K、0~20`），只按「数字+单位」过滤不够：
 * 配对是就近闭合的，`512K、0` 这类跨区间内容会被整段吞成下标。`^` 若允许 `[` `]`，
 * 一个孤立的 `^` 会一路配到很远的 `^`，把 `[^1]` 脚注引用卷进上标。
 */
const MARKER_FORBIDDEN =
  /[\s、，。；：！？…·—－“”‘’（）【】《》〈〉「」『』\[\](){}<>"'`$*_^=~\\/|,;:!?]/

/** 与 Rust 侧 `valid_inline_marker_content` 同口径。 */
function validMarkerContent(content: string, marker: string): boolean {
  if (!content.trim() || content !== content.trim()) return false
  // 高亮允许中文、空格与标点，只限制长度，避免跨行乱配
  if (marker === '==') return content.length <= 64
  if (MARKER_FORBIDDEN.test(content)) return false
  // 上标没有「区间号」歧义，中文也允许；只限制长度，避免吞掉整段
  if (marker === '^') return [...content].length <= 32
  if ([...content].length > 8) return false
  // `512K` 这类「数字+单位」是区间，不是下标
  return !/^\d+[A-Za-z]+$/.test(content)
}

function addInlineMarkerRule(
  md: MarkdownIt,
  marker: string,
  name: string,
  tag: string,
  beforeRule: string,
): void {
  md.inline.ruler.before(beforeRule, name, (state: any, silent: boolean) => {
    const start = state.pos as number
    const len = marker.length
    if (state.src.slice(start, start + len) !== marker) return false
    // `~~x~~` 是删除线，不是两个下标；交给 strikethrough 规则
    if (marker === '~' && state.src.charCodeAt(start + 1) === 0x7e) return false
    // 被反斜杠转义的标记不解析
    if (start > 0 && state.src.charCodeAt(start - 1) === 0x5c) return false
    // `1~5`、`0~20` 这类数字区间不当下标
    if (marker === '~' && start > 0 && /[0-9]/.test(state.src[start - 1])) return false

    let pos = start + len
    while (pos < state.posMax) {
      const ch = state.src.charCodeAt(pos)
      if (ch === 0x0a) return false
      if (ch === 0x5c) {
        pos += 2
        continue
      }
      if (state.src.startsWith(marker, pos)) break
      pos++
    }
    if (pos >= state.posMax || pos === start + len) return false
    const content = state.src.slice(start + len, pos)
    if (!validMarkerContent(content, marker)) return false

    if (!silent) {
      state.push(`${name}_open`, tag, 1)
      if (marker === '==') {
        // 高亮内容按行内 Markdown 解析：`==**加粗**==` 在预览里也应是「高亮 + 加粗」。
        // 导出侧只把 `==` 换成 `<mark>`，内容仍交给 pulldown-cmark 解析，两边必须同口径。
        const children: any[] = []
        state.md.inline.parse(content, state.md, state.env, children)
        state.tokens.push(...children)
      } else {
        // 上下标保持纯文本：规则里已禁止 `*` `_` 等标记字符，与导出的 w:vertAlign 一致
        const text = state.push('text', '', 0)
        text.content = content
      }
      state.push(`${name}_close`, tag, -1)
    }
    state.pos = pos + len
    return true
  })
}

/** 安装 `^上标^` / `~下标~` / `==高亮==` 三条行内规则。 */
function inlineExtensions(md: MarkdownIt): void {
  addInlineMarkerRule(md, '^', 'yizi_sup', 'sup', 'emphasis')
  addInlineMarkerRule(md, '~', 'yizi_sub', 'sub', 'strikethrough')
  addInlineMarkerRule(md, '==', 'yizi_mark', 'mark', 'emphasis')
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

  // 行内扩展要在内置规则表上注册（strikethrough 已存在，sub 规则依赖它让开 `~~`）
  inlineExtensions(md)
  md.use(taskLists, { enabled: true, label: true, labelAfter: false })
  // 脚注（学术引用）：[^n] 上标 → 点击跳文末定义，定义带 ↩ 返回链（markdown-it-footnote 原生行为）
  md.use(footnote)
  injectSourceLineMap(md)
  injectFenceSourceLine(md)
  // [toc] / [[toc]]：必须在 inline 规则之后、渲染之前替换成目录 HTML
  tocPlugin(md)
  // 标题 id 要在 tocPlugin 的规则之前执行：`Ruler.after('inline')` 插在 inline 之后的第一位，
  // 所以这里在 tocPlugin 之后注册，实际执行顺序反而是 heading_ids → toc_placeholder
  assignHeadingIds(md)
  // > [!NOTE] 这类提示块：摘掉标记行并给 blockquote 挂类型 class
  alertPlugin(md)

  // 核心渲染器（数学公式 / Mermaid）默认安装；Mermaid 的 SVG 模块仍是懒加载
  extendCoreMarkdownIt(md)

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
  // 兜底：把「##/ - / > 后面的 NBSP」规范化（不改正文中间的空格）
  return getMarkdownIt(pluginExtenders).render(splitFrontMatter(normalizeMarkdownMarkers(content)).body)
}

export default getMarkdownIt
