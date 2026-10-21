/**
 * 导出文档（独立 HTML / PDF 打印）的组装。
 *
 * 为什么要把这段从 App.tsx 里拎出来：
 *   · 导出的「还原度」是这版的主线（见 changelog 0.3.5），而它依赖的输入全是**预览现场的实测值**
 *     —— 正文内联样式、<html> 上的 CSS 变量、主题/用户 CSS、KaTeX 样式；
 *   · 这些输入一旦漏搬，PDF 就退回主题默认字体字号（此前正是如此），而这类缺陷在 UI 上很难看出来，
 *     所以做成纯函数以后可以单元测试（tests/exportHtml.test.ts）逐条钉住。
 *
 * 三条必须遵守的约定：
 *   1. **预览是唯一事实来源**。排版（字体/字号/行高/列宽）在预览里是**内联**在 `.editor-content` 上的，
 *      `innerHTML` 带不走；设置面板写的变量也全在 `<html style>` 上 —— 两者都必须原样搬进导出文档。
 *   2. **PDF 是纸，纸是白的**。打印**不带 `dark` 类**、页面强制白底：暗色主题导出按主题自己的亮色
 *      配色走（与 Word 一致），不会出现「深色纸面」或「白底 + 亮色字」两种极端。独立 HTML 导出
 *      仍然照预览带 `dark`（浏览器里看，就该和预览一个样）。
 *   3. **纸面没有滚动条**：代码块长行要折行，悬浮控件不该印出来，表格/代码/公式不跨页断开。
 */

/** 大纲条目：与预览正文同源（同一批带 id 的标题元素） */
export interface ExportOutlineItem {
  level: number
  id: string
  text: string
}

export interface ExportDocInput {
  /** 全部内联进导出文档的样式表 */
  css: {
    /** globals.css（含 Tailwind prose 与编辑器排版） */
    base: string
    /** KaTeX（字体已内联成 data URL，导出文档不依赖外部资源） */
    math: string
    /** 当前主题 CSS */
    theme: string
    /** 用户自定义 CSS */
    user: string
    /** 大纲侧栏样式（仅独立 HTML 用得上） */
    outline: string
  }
  /** 预览正文的 innerHTML（图片在预览里已转成 data URL） */
  bodyHtml: string
  /** 预览正文元素的 class（含 theme-x / prose / max-w-none） */
  bodyClass: string
  /** 预览正文元素的**内联**样式：字体、字号、行高、正文列宽 */
  bodyStyle: string
  /** `<html>` 的内联样式：设置面板写入的 CSS 变量（--font-preview / --preview-font-size …） */
  rootStyle: string
  /** 主题 id，如 `ink`（不带 theme-/dark 前缀） */
  theme: string
  /** 应用当前是否暗色主题 */
  isDark: boolean
  /** 左侧大纲；省略则不出大纲（PDF / 打印没有侧栏） */
  outline?: { title: string; items: ExportOutlineItem[] }
  /** true = PDF 用的打印样式 */
  print?: boolean
}

/** 属性值转义：内联样式里可能带引号（字体名、url(...)），拼进 style="…" 必须转义 */
function attr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function text(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * 打印样式（PDF）。页面尺寸与 Rust 侧 PrintToPdf 的 PrintSettings 保持一致（A4 / 18mm）：
 * CSS @page 与打印参数谁生效都不影响结果，避免出现「双重页边距」或尺寸对不上的两套规则。
 */
const PRINT_CSS = [
  '@page{size:A4;margin:18mm}',
  // height/overflow 是应用 UI 的锁死规则（globals.css 里 html,body{height:100%;overflow:hidden}），
  // 不解开的话文档被锁在视口高度里、只出一页。
  // 纸面**一律白底**（用户要求：不要背景色，亮/暗主题都按亮色纸面导出 —— 与 Word 一致）。
  // 打印时页面不带 `dark` 类（见 buildExportHtml），主题按它自己的亮色配色走，所以白底上是深色字。
  // print-color-adjust:exact 保证代码块/表头/引用这类**局部**底色照实印出来。
  'html,body{height:auto!important;overflow:visible!important;background:#fff!important;color:var(--editor-text);-webkit-print-color-adjust:exact;print-color-adjust:exact}',
  // 正文容器只保留“版心”作用：纸面统一去掉**页面背景与页面边框**。
  // 有些主题（液态玻璃 Prism、Facebook 等）把 `.editor-content` 做成一张带渐变底、圆角、
  // 外圈 box-shadow 描边（+ 投影）的“卡片”，屏幕上好看，但纸上就是一块带边框的色块 ——
  // 用户要求 PDF 统一去掉。注意只清**容器**，代码块/表头/引用的局部底色仍保留（见下一条）。
  '.editor-content{padding:0!important;max-width:none!important;margin:0!important;height:auto!important;background:none!important;border:none!important;box-shadow:none!important;outline:none!important;border-radius:0!important}',
  // 预览里的悬浮控件（代码块右上角按钮、右下角语言标签）是编辑辅助，不该印到纸上
  '.code-block-actions,.code-block-lang,.code-block-lang-input{display:none!important}',
  // 纸上没有横向滚动条：代码块长行必须折行，否则右侧被直接裁掉
  '.editor-content pre,.editor-content pre code{overflow:visible!important;white-space:pre-wrap!important;overflow-wrap:anywhere}',
  // 分页：标题不孤零零落在页尾；表格 / 代码 / 引用 / 图片 / 块级公式不跨页断开
  '.editor-content h1,.editor-content h2,.editor-content h3,.editor-content h4,.editor-content h5,.editor-content h6{break-after:avoid;page-break-after:avoid;break-inside:avoid}',
  '.editor-content pre,.editor-content table,.editor-content blockquote,.editor-content figure,.editor-content img,.editor-content .katex-display{break-inside:avoid;page-break-inside:avoid}',
  '.editor-content tr,.editor-content li{break-inside:avoid}',
  '.editor-content p{orphans:3;widows:3}',
  // 长表格跨页时表头在每页重复
  '.editor-content thead{display:table-header-group}',
].join('')

/** 独立 HTML 的额外样式：只解开应用 UI 的视口锁定，其余排版照预览 */
const SCREEN_CSS = 'html,body{height:auto!important;overflow:visible!important}'

export function buildExportHtml(input: ExportDocInput): string {
  const { css, print } = input
  const outlineItems = input.outline?.items ?? []
  const wantToc = !print && outlineItems.length > 0 && input.outline !== undefined

  // 打印**不带 dark 类**：PDF 一律按亮色纸面导出（与 Word 一致，用户要求「暗色也按亮色导出」）。
  // 主题 CSS 里亮色变量是 `:root.theme-x`、暗色是 `:root.theme-x.dark`，去掉 dark 就自动落到亮色配色，
  // 不需要另做一套「白底等效色」换算。独立 HTML 仍按预览原样带 dark。
  const themeClass = `theme-${input.theme}${input.isDark && !print ? ' dark' : ''}`

  const tocHtml = wantToc
    ? `<nav class="export-toc"><div class="export-toc-title">${text(input.outline!.title)}</div>${
        outlineItems.map((it) => `<a href="#${attr(it.id)}" style="--lv:${it.level}">${text(it.text)}</a>`).join('')
      }</nav>`
    : ''

  // 大纲卡片与正文第一个标题的**底部**对齐。各主题的留白/字号不同，写死数值换主题就偏，
  // 所以在文档解析后实测一次；取不到标题时保留 CSS 里的 96px 回退。
  const tocScript = wantToc
    ? '<script>(function(){var h=document.querySelector(".editor-content h1,.editor-content h2,.editor-content h3,.editor-content h4");if(!h)return;document.documentElement.style.setProperty("--toc-top",Math.round(h.getBoundingClientRect().bottom+16)+"px")})()</script>'
    : ''

  const extraCss = print ? PRINT_CSS : SCREEN_CSS
  const tocCss = wantToc ? `<style>${css.outline}</style>` : ''
  // 正文元素的 class / 内联样式原样搬过来：预览的字体、字号、行高、列宽都挂在这上面
  const bodyClass = input.bodyClass || 'editor-content prose prose-lg max-w-none'
  const bodyStyle = input.bodyStyle ? ` style="${attr(input.bodyStyle)}"` : ''
  const rootStyle = input.rootStyle ? ` style="${attr(input.rootStyle)}"` : ''

  return `<!DOCTYPE html><html class="${attr(themeClass)}"${rootStyle}><head><meta charset="utf-8"><style>${css.base}</style><style>${css.math}</style><style>${css.theme}</style><style>${css.user}</style>${tocCss}<style>${extraCss}</style></head><body class="${attr(themeClass)}">${tocHtml}<div class="${attr(bodyClass)}"${bodyStyle}>${input.bodyHtml}</div>${tocScript}</body></html>`
}
