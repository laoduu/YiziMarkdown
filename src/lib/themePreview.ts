/**
 * 主题卡片预览用的 CSS 生成器。
 *
 * 设置面板里的每张主题卡片是一个「迷你编辑器窗格」，要用**该主题自己的令牌**上色，
 * 但整个应用当时只挂着当前主题的类（`<html class="theme-x">`），所以不能直接复用主题
 * 样式的元素规则。这里只做一件事：把每份主题 CSS 里的 `:root.theme-<id>` / `.dark`
 * 变量声明抽出来，改写成 `[data-theme-preview="<id>"]` 作用域，供卡片子树使用。
 *
 * 为什么不用 `retargetThemeCss` 注入整份主题：
 *   · 16 张卡 × 完整主题（含元素规则）体量大，且元素规则会互相/与设置面板样式打架；
 *   · 卡片只需要 CSS 变量（背景/文字/强调色/侧栏/状态栏/圆角/字体）。
 *
 * 纯函数，便于单测（测试见 tests/themePreview.test.ts）。
 */

export interface ThemePreviewSource {
  /** 卡片作用域键（主题 id；「自定义主题」用基底主题 id） */
  key: string
  /** 该主题的 CSS 原文 */
  css: string
}

/** `:root.theme-<id>[.dark] { … }`（块内不含嵌套花括号） */
const ROOT_BLOCK = /^[ \t]*:root\.theme-([A-Za-z0-9_-]+)(\.dark)?[ \t]*\{([^}]*)\}/gm

/** 把属性名/值里的花括号去掉：值里合法 CSS 不会出现 `}`，出现即视为试图逃逸作用域 */
function cleanDeclarations(raw: string): string {
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/[{}]/g, '')
    .trim()
}

/** 属性选择器里的引号/反斜杠转义（自定义主题文件名可能含特殊字符） */
function escapeAttr(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ')
}

/**
 * 合并多份主题 CSS，生成卡片预览样式表。
 * 亮色规则用 `:not(.is-dark)`，暗色规则用 `.is-dark`，因此每张卡可独立切换明暗。
 */
export function buildThemePreviewCss(sources: ThemePreviewSource[]): string {
  const rules: string[] = []
  for (const source of sources) {
    if (!source.key || !source.css) continue
    const light: string[] = []
    const dark: string[] = []
    for (const match of source.css.matchAll(ROOT_BLOCK)) {
      const body = cleanDeclarations(match[3] ?? '')
      if (!body) continue
      if (match[2]) dark.push(body)
      else light.push(body)
    }
    if (!light.length && !dark.length) continue
    const scope = `.settings-theme-scope[data-theme-preview="${escapeAttr(source.key)}"]`
    if (light.length) rules.push(`${scope}:not(.is-dark){${light.join('\n')}}`)
    if (dark.length) rules.push(`${scope}.is-dark{${dark.join('\n')}}`)
  }
  return rules.join('\n')
}
