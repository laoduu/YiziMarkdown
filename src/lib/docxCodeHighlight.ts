/**
 * DOCX 导出的代码块语法高亮数据收集（见 `docx_export.rs` 的 `CodeHighlights`）。
 *
 * **为什么由前端传，而不是在 Rust 侧再写一个高亮器**：
 * 预览的代码着色 = highlight.js 的 token 划分 + 主题的 `--code-*` 颜色（`styles/hljs-theme.css`）。
 * 另写一份实现必然与预览有出入（分词差异、主题色靠猜）。这里直接**读预览 DOM**
 * （`.editor-content pre.hljs > code`）—— 那就是用户看到的那份结果：分词、颜色、粗斜体全都取自
 * 浏览器算出的真实结果，换主题、改自定义 CSS、甚至被插件改写围栏渲染（如 mermaid 图，它不再是
 * `pre.hljs`）都天然一致。
 *
 * 预览面板是常驻挂载的（`Editor.tsx` 里「预览面板：永远挂载」，各视图模式均存在），所以导出时
 * 基本都能取到；取不到时导出照旧走单色等宽兜底，不会报错、不会丢代码。
 */
import { darkenForWhite } from './docxPalette.ts'

/** 一个着色片段的样式（从预览元素的 computed style 读出） */
export interface CodeStylePayload {
  /** CSS 颜色（`rgb(…)` / `#rrggbb`），Rust 侧统一归一成 6 位十六进制 */
  color: string
  /** 加粗（对应 `.hljs-strong { font-weight: 700 }`） */
  bold: boolean
  /** 斜体（对应 `.hljs-emphasis { font-style: italic }`） */
  italic: boolean
}

export interface CodeHighlightsPayload {
  /** 类路径（如 `hljs-meta hljs-keyword`，空格分隔的祖先链）→ 样式 */
  styles: Record<string, CodeStylePayload>
  /** `(语言 + 键分隔符 + 规范化代码)` → `[类路径, 文本]` 片段表（类路径为空串表示无着色） */
  blocks: Record<string, Array<[string, string]>>
}

export interface CollectCodeHighlightOptions {
  /**
   * 是否暗色主题。导出的 Word 页面**恒为白底**，而暗色主题的 token 颜色是给深色页面配的
   * （荧光绿、亮青…），照搬会得到「白纸上的荧光字」。`true` 时按 `darkenForWhite()` 把过亮的
   * 颜色压到白底可读的亮度（保留色相）—— 与 `docxPalette` 对正文/底色/强调色的处理同一套规则。
   * 浅色主题保持原样（预览本身也是浅底，颜色本来就可读）。
   */
  isDark?: boolean
  /**
   * 「无着色片段」（空类路径，即代码里的空白与标点）要用的大底色。
   * 传 docx 侧算好的正文色最准确：预览里这类片段就是主题正文色，白底等效色正是它。
   */
  baseColor?: string
}

/**
 * 键分隔符：U+001F（单元分隔符）。用它是为了避免「语言 + 代码」直接拼接产生歧义
 * （否则 `("a", "b")` 与 `("ab", "")` 会撞键），Markdown 正文里不可能出现该控制字符。
 */
const SEP = '\u001f'

/**
 * 代码文本规范化 —— **必须与 Rust 侧 `normalize_code()` 完全一致**，否则查表键对不上、
 * 高亮静默失效：统一换行为 `\n`（CRLF / 单独 CR 都算换行）、去掉末尾换行。
 *
 * 末尾换行只是 Markdown 围栏语法产物，不是代码内容（预览里它也只是 HTML 里的空白）。
 */
export function normalizeCodeText(s: string): string {
  return s.replace(/\r\n?/g, '\n').replace(/\n+$/, '')
}

/** 高亮查表键（与 Rust 侧 `code_key()` 一致）：语言 + `U+001F` + 规范化后的代码 */
export function codeHighlightKey(lang: string, code: string): string {
  return lang + SEP + code
}

/** 取元素 class 属性里以 `hljs-` 开头的类（其余如 `language-rust` 不算着色类） */
function hljsClasses(el: { getAttribute(name: string): string | null }): string[] {
  const attr = el.getAttribute('class') || ''
  return attr.split(/\s+/).filter((c) => c.startsWith('hljs-'))
}

/**
 * 代码块的**语言**：优先取 `<code class="language-xxx">`（markdown-it 按围栏信息串第一个词生成，
 * 与 Rust 侧取 `info` 第一个词的规则一致）；没有该 class 说明围栏无语言标记（预览里
 * `data-lang="auto"` 是自动检测），按空语言处理。
 */
function languageOf(pre: Element, code: Element): string {
  const m = /(?:^|\s)language-([^\s]+)/.exec(code.getAttribute('class') || '')
  if (m) return m[1]
  const dataLang = (pre.getAttribute('data-lang') || '').trim()
  return dataLang === 'auto' ? '' : dataLang
}

/**
 * 从预览 DOM 收集代码块高亮。
 *
 * @param root 预览内容根节点（`.editor-content`）；为空时返回空表（导出走单色兜底）
 * @param options 白底适配（暗色主题压暗、无着色片段用大底色），见 `CollectCodeHighlightOptions`
 */
export function collectCodeHighlights(
  root: ParentNode | null | undefined,
  options: CollectCodeHighlightOptions = {},
): CodeHighlightsPayload {
  const out: CodeHighlightsPayload = { styles: {}, blocks: {} }
  if (!root || typeof getComputedStyle !== 'function') return out
  const { isDark = false, baseColor } = options

  // 类路径 → 该路径的样式宿主元素（取第一个遇到的实例即可，同一主题下样式必然相同）
  const styleHosts = new Map<string, Element>()
  const pres = root.querySelectorAll('pre.hljs')
  for (let i = 0; i < pres.length; i++) {
    const pre = pres[i]
    const code = pre.querySelector('code')
    if (!code) continue
    // `textContent` 就是预览里那份代码文本（HTML 解析已把 CRLF 归一成 LF、实体已解码）
    const text = normalizeCodeText(code.textContent || '')
    if (!text) continue
    // 无类片段（代码里的空白/标点）以 `<code>` 自身为样式宿主：它继承 `.hljs` 的正文色
    if (!styleHosts.has('')) styleHosts.set('', code)

    const spans: Array<[string, string]> = []
    collectSpans(code, [], spans, styleHosts)
    if (spans.length === 0) continue
    out.blocks[codeHighlightKey(languageOf(pre, code), text)] = trimTrailingNewlines(spans)
  }

  styleHosts.forEach((el, chain) => {
    const cs = getComputedStyle(el)
    // 白底适配：无着色片段用大底色（预览里它就是主题正文色）；暗色主题把过亮的 token 色压暗。
    // 两者都是为了「白纸上的可读性」，规则与 docxPalette 对正文/底色/强调色的处理一致。
    const color =
      chain === '' && baseColor ? baseColor : isDark ? darkenForWhite(cs.color) : cs.color
    out.styles[chain] = {
      color,
      bold: (parseInt(cs.fontWeight, 10) || 400) >= 600,
      italic: cs.fontStyle === 'italic',
    }
  })
  return out
}

/**
 * 去掉片段末尾的换行。
 *
 * 键里的代码已按 `normalizeCodeText` 去掉了末尾换行，片段也必须同样处理 —— 否则 Rust 侧会
 * 照片段画出最后一个 `<w:br/>`，Word 里就凭空多出一行空行。
 */
function trimTrailingNewlines(spans: Array<[string, string]>): Array<[string, string]> {
  const out = spans.slice()
  while (out.length > 0) {
    const last = out[out.length - 1]
    const text = last[1].replace(/\n+$/, '')
    if (text === '') {
      out.pop()
      continue
    }
    out[out.length - 1] = [last[0], text]
    break
  }
  return out
}

/**
 * 深度优先收集文本片段，每个片段带上它的**祖先类路径**（空格分隔）。
 *
 * 为什么要路径而不是单个类名：主题 CSS 里有后代选择器（如 `.hljs-meta .hljs-keyword`），
 * 只看最内层类名会取错颜色 —— 预览里这类片段的 computed style 由整条链决定。
 */
function collectSpans(
  node: Node,
  chain: string[],
  out: Array<[string, string]>,
  styleHosts: Map<string, Element>,
): void {
  const children = node.childNodes
  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    if (child.nodeType === 3) {
      const text = child.nodeValue || ''
      if (text) out.push([chain.join(' '), text])
      continue
    }
    if (child.nodeType !== 1) continue // 注释等非元素节点忽略
    const el = child as Element
    if (el.tagName === 'BR') {
      // highlight.js 正常不产出 <br>，兜一手：真出现就当换行，绝不能把行并掉
      out.push([chain.join(' '), '\n'])
      continue
    }
    const own = hljsClasses(el)
    const next = own.length > 0 ? chain.concat(own) : chain
    const key = next.join(' ')
    if (!styleHosts.has(key)) styleHosts.set(key, el)
    collectSpans(el, next, out, styleHosts)
  }
}

export default collectCodeHighlights
