/**
 * 主题样式的**唯一注入入口**。
 *
 * 为什么必须唯一：启动加载与「保存自定义 CSS」两条路径曾经各写一份注入逻辑，
 * 保存路径漏了提权 ⇒ 改了自定义 CSS 保存后毫无反应、必须重启（真实 bug）。
 *
 * 「自定义主题」= **基底主题 + user.css**：
 *   · 基底主题（`customCssBase`，保存时的当前主题）提供完整外观；
 *   · user.css 作为覆盖层叠在其上 —— 既可以粘贴整份新主题，也可以只改几个变量。
 * 两者都归一到 `theme-custom`，因此 `<html class="theme-custom">` 与观感永远一致
 * （不会出现「主题菜单里激活的是原主题、看到的却是被覆盖后的样式」）。
 */
import { invokeTauri } from './tauri'
import { THEME_CSS_STYLE_ID, USER_CSS_STYLE_ID, retargetThemeCss, normalizeUserCss } from './userCss'
import { DEFAULT_THEME } from './themeOrder'

/** 合成主题 id：内容 = 基底主题 + user.css（见模块头注释） */
export const CUSTOM_THEME = 'custom'

/** 写入（或移除）一个 `<style>`；始终 append 到 head 末尾，保证排在既有样式之后 */
function setStyle(id: string, css: string): void {
  const existing = document.getElementById(id)
  if (!css) { existing?.remove(); return }
  const el = (existing as HTMLStyleElement | null) ?? document.createElement('style')
  el.id = id
  el.textContent = css
  document.head.appendChild(el)
}

/** 读 user.css（不存在时 Rust 侧返回空串） */
export async function readUserCss(): Promise<string> {
  return (await invokeTauri<string>('read_user_css')) || ''
}

/**
 * 应用主题样式。先 `#theme` 后 `#user` 落位，用户规则才能在同特异性下胜出。
 * @param userCss 显式传入用户 CSS（保存路径用它免去一次磁盘往返）；省略则从磁盘读
 */
export async function applyThemeStyles(theme: string, base: string, userCss?: string): Promise<void> {
  const isCustom = theme === CUSTOM_THEME
  const baseName = isCustom ? (base || DEFAULT_THEME) : theme

  const themeCss = (await invokeTauri<string>('read_theme_css', { name: `${baseName}.css` })) || ''
  setStyle(THEME_CSS_STYLE_ID, themeCss ? retargetThemeCss(themeCss, theme) : '')

  // 非自定义主题不叠加 user.css —— 否则「选中态 ≠ 观感」，用户会分不清自己选了什么
  if (!isCustom) { setStyle(USER_CSS_STYLE_ID, ''); return }

  const raw = userCss ?? (await readUserCss())
  setStyle(USER_CSS_STYLE_ID, raw.trim() ? normalizeUserCss(raw, CUSTOM_THEME) : '')
}
