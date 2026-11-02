/**
 * GitHub 风格提示块：`> [!NOTE]` / `> [!TIP]` / `> [!IMPORTANT]` / `> [!WARNING]` / `> [!CAUTION]`。
 *
 * 只做两件事：给引用块加两个 class（`md-alert` + `md-alert-<type>`），并在块首插入一个
 * 「图标 + 类型名」标题段（`<p class="md-alert-title">Note</p>`）。
 * **引用块本身的样式一律不碰** —— 边框、底色、圆角、阴影全交给当前主题，
 * 所以它在任何主题下都和同文档里的普通引用块长得一模一样（图标由 CSS `::before` 画）。
 *
 * 判定规则与 GitHub 一致：`[!TYPE]` 必须独占一行（后面不能跟正文），大小写不敏感。
 */

const ALERT_RE = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i

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
      // attrJoin 而不是 attrSet：blockquote 可能已经带了别的 class
      tokens[i].attrJoin('class', `md-alert md-alert-${type}`)

      // 标题段：不写进原段落，否则「Note」会和正文挤在同一行
      const Token = state.Token
      const pOpen = new Token('paragraph_open', 'p', 1)
      pOpen.block = true
      pOpen.attrSet('class', 'md-alert-title')
      const pInline = new Token('inline', '', 0)
      pInline.block = true
      pInline.content = ALERT_LABEL[type]
      const text = new Token('text', '', 0)
      text.content = ALERT_LABEL[type]
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
