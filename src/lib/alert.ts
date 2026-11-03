/**
 * GitHub 风格提示块：`> [!NOTE]` / `> [!TIP]` / `> [!IMPORTANT]` / `> [!WARNING]` / `> [!CAUTION]`。
 *
 * 只做两件事：给引用块加两个 class（`md-alert` + `md-alert-<type>`），并在块首插入一个
 * 「图标 + 标题」段落（`<p class="md-alert-title">Note</p>`）。
 * **引用块本身的样式一律不碰** —— 边框、底色、圆角、阴影全交给当前主题，
 * 所以它在任何主题下都和同文档里的普通引用块长得一模一样（图标由 CSS `::before` 画）。
 *
 * 在 GitHub 原版基础上扩展：`[!TYPE]` 同一行后面可以跟自定义标题（纯文本），
 * 例如 `> [!TIP] 小技巧` 渲染成「灯泡图标 + 小技巧」；不写标题时退回英文类型名。
 * 类型大小写不敏感，标题为空或全空白时同样使用默认标题。
 */

const ALERT_RE = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*?)\s*$/i

/** 标题段文字。写死在 JS 里而不是 CSS `content`，这样它跟正文一样参与排版与选中/复制。 */
const ALERT_LABEL: Record<string, string> = {
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  warning: 'Warning',
  caution: 'Caution',
}

export function alertPlugin(md: any): void {
  md.core.ruler.after('inline', 'alert_blockquote', (state: any) => {
    const tokens = state.tokens
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== 'blockquote_open') continue
      if (tokens[i + 1]?.type !== 'paragraph_open') continue
      const inline = tokens[i + 2]
      if (!inline || inline.type !== 'inline') continue

      const [first, ...rest] = String(inline.content ?? '').split('\n')
      const match = ALERT_RE.exec(first)
      if (!match) continue

      const type = match[1].toLowerCase()
      // `]` 后的内容就是自定义标题；为空时用英文类型名。
      // 标题按纯文本渲染（与实时模式的 widget 一致，避免两处对 `**` 等标记的解析结果不同）。
      const customTitle = (match[2] ?? '').trim()
      const title = customTitle || ALERT_LABEL[type] || type
      // attrJoin 而不是 attrSet：blockquote 可能已经带了别的 class
      tokens[i].attrJoin('class', `md-alert md-alert-${type}`)

      // 标题段：不写进原段落，否则「Note」会和正文挤在同一行
      const Token = state.Token
      const pOpen = new Token('paragraph_open', 'p', 1)
      pOpen.block = true
      pOpen.attrSet('class', 'md-alert-title')
      const pInline = new Token('inline', '', 0)
      pInline.block = true
      pInline.content = title
      const text = new Token('text', '', 0)
      text.content = title
      pInline.children = [text]
      const pClose = new Token('paragraph_close', 'p', -1)
      pClose.block = true

      const body = rest.join('\n').trim()
      if (!body) {
        // 标记行独占一段：整段换成标题段，否则留下一个空段落撑高
        tokens.splice(i + 1, 3, pOpen, pInline, pClose)
        continue
      }

      // 只改 content 不管 children 的话，`[!NOTE]` 那行仍会渲染出来
      // （core 阶段行内 children 已经解析完），所以重新解析一次。
      const children: any[] = []
      state.md.inline.parse(body, state.md, state.env, children)
      inline.content = body
      inline.children = children

      tokens.splice(i + 1, 0, pOpen, pInline, pClose)
    }
  })
}
