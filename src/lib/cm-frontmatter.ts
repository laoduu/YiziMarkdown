/**
 * 元信息块（YAML front matter）在 CodeMirror 里的处理。
 *
 * 【背景】`@lezer/markdown`（CodeMirror 的 Markdown 解析器）**不认识 front matter**。于是
 * 文档开头的
 *     ---
 *     title: 我的文档
 *     ---
 * 被按 CommonMark 解析成「第 1 行 = 分隔线」+「第 2~3 行 = setext 二级标题」
 * （CommonMark 规定"文本行 + 紧跟 `---` 下划线"就是 H2）。这一个事实同时造成三个现象：
 *   · 源码模式：setext 标题被 `defaultHighlightStyle` 加了 `text-decoration: underline`
 *     （该默认样式对 heading 就是"下划线 + 粗体"），而标题节点**跨越两行**，
 *     所以下划线画在第二个 `---` 那行下面 —— 就是那根"多余的下划线"
 *   · 实时模式：第 1 行被渲染成分隔线、`title:` 那行被渲染成 H2
 *
 * 【为什么不写 lezer 块解析器】看起来那是最"正统"的做法，但块解析器的 `parse` 一旦调用
 * `cx.nextLine()` 消费了行，就**不能再返回 false**（内置解析器全都遵守这条）。而
 * "文档以 `---` 开头、却没有闭合 `---`"（就是普通分隔线）是最常见的情况之一 ——
 * 那时必须能"退回原状"，块解析器做不到。所以改用 StateField：它拿得到全文，可以安全判定。
 *
 * 【产出】
 *   · `frontMatterField` —— 元信息区间（无则 null），供实时渲染插件过滤装饰
 *   · `frontMatterLines` —— 给区间内每行套一个类，源码与实时共用同一套"元信息块"外观
 */

import { StateField, type EditorState } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view'
import { splitFrontMatter, type FrontMatterSplit } from './frontMatter'

/** 只扫文档开头这么多字符：元信息总在顶部且通常很小。
 *  这样每次按键不必对整个文档调 `toString()`。 */
export const FM_SCAN_LIMIT = 4096

/** 从编辑器状态取元信息（区间 + 属性 + 正文）。
 *  导出给 cm-properties.ts 复用：属性面板自己算区间，**不跨 StateField 读取** ——
 *  StateField 之间互相读取依赖扩展注册顺序，而两者挂在不同的 compartment 里，顺序不保证。 */
export function frontMatterOf(state: EditorState): FrontMatterSplit {
  const head = state.doc.sliceString(0, Math.min(state.doc.length, FM_SCAN_LIMIT))
  return splitFrontMatter(head)
}

function rangeOf(state: EditorState): { from: number; to: number } | null {
  return frontMatterOf(state).range
}

/** 元信息块区间 [from, to)；无元信息时为 null */
export const frontMatterField = StateField.define<{ from: number; to: number } | null>({
  create: rangeOf,
  update: (value, tr) => (tr.docChanged ? rangeOf(tr.state) : value),
})

const fmLine = Decoration.line({ class: 'cm-md-frontmatter-line' })

function buildLines(view: EditorView): DecorationSet {
  const range = view.state.field(frontMatterField)
  if (!range) return Decoration.none
  const doc = view.state.doc
  // range.to 含闭合行末尾的换行符，直接 lineAt(to) 会多算一行 ⇒ 用 to-1 定位真正的末行
  const first = doc.lineAt(range.from).number
  const last = doc.lineAt(Math.max(0, range.to - 1)).number
  const out = []
  for (let n = first; n <= last; n++) out.push(fmLine.range(doc.line(n).from))
  return Decoration.set(out, true)
}

/** 给元信息块每一行套上 `cm-md-frontmatter-line`（源码与实时模式都生效） */
export const frontMatterLines = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildLines(view)
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.decorations = buildLines(u.view)
    }
  },
  { decorations: (v) => v.decorations }
)
