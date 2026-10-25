/**
 * slideTheme.ts — 读出「演示配色」所需的两份 CSS，并作用域化到 `.yizi-slideshow.theme-*`。
 *
 * Slideshow.tsx 在演示期间会把这份样式注入主窗口的 `<head>`；PPTX 导出既可能从
 * 演示 HUD 触发（样式已在 head 里），也可能从工具栏触发（演示未挂载）。
 * 这里提供统一的读取入口，两种入口都拿同一份字符串 —— 导出与演示的配色不会漂移。
 */
import { invokeTauri } from './tauri.ts'
import { scopeThemeVars } from './slideDeck.ts'
import { CUSTOM_THEME, readUserCss } from './themeLoader.ts'
import { normalizeUserCss } from './userCss.ts'

/**
 * @param theme 主题 id（可能是 `custom`）
 * @param customCssBase 「自定义主题」的基底主题（非 custom 时忽略）
 */
export async function loadSlideshowThemeCss(theme: string, customCssBase?: string): Promise<string> {
  const isCustom = theme === CUSTOM_THEME
  const baseName = isCustom ? (customCssBase || 'liquidglass-prism') : theme
  let themeCss = ''
  try {
    themeCss = (await invokeTauri<string>('read_theme_css', { name: `${baseName}.css` })) || ''
  } catch {
    themeCss = ''
  }
  if (!themeCss) return ''
  let userRaw = ''
  if (isCustom) {
    try {
      const raw = await readUserCss()
      userRaw = raw ? normalizeUserCss(raw, CUSTOM_THEME) : ''
    } catch {
      userRaw = ''
    }
  }
  return scopeThemeVars(themeCss, userRaw, theme)
}
