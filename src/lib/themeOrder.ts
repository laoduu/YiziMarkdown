/**
 * 主题的默认项与展示顺序。
 *
 * 单独成模块的原因：默认主题既要作为 `settingsStore.currentTheme` 的初值与迁移目标，
 * 又要决定**主题列表的第一位**（用户要求把 liquidglass-prism 排在最前）——
 * 两处若各写一遍，改名字时很容易漏改一处。
 *
 * `list_themes()`（Rust 侧）按文件名排序返回，所以"排第一"必须在前端做一次归位。
 */
export const DEFAULT_THEME = 'liquidglass-prism'

/** 把默认主题（及其 `<name>.css`）挪到列表首位，其余保持原序。 */
export function orderThemes(files: string[]): string[] {
  const key = `${DEFAULT_THEME}.css`
  const i = files.indexOf(key)
  if (i <= 0) return files
  return [key, ...files.slice(0, i), ...files.slice(i + 1)]
}
