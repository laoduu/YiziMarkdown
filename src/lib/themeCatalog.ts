/**
 * 主题目录（唯一数据源）的前端类型与加载入口。
 *
 * 数据由 Rust `get_theme_catalog` 合并产出：内置清单（`themes/builtin.json`）
 * + 用户层（`~/Documents/yizimarkdown/themes/` 的 `themes.user.json` / `overrides/` / `custom/`）。
 * 前端不再自己拼 `theme.json` + 目录扫描，避免两套规则逐渐分叉。
 */
import { invokeTauri } from './tauri'

export interface ThemeEntry {
  id: string
  name: string
  desc: string
  swatch: string[]
  /** 内置 / 用户覆盖内置 / 用户自建 */
  source: 'builtin' | 'override' | 'custom'
  /** 内置已更新但用户 override 被保留（卡片上显示「内置新版」） */
  hasUpdate: boolean
}

export interface ThemeCatalog {
  schema: number
  themes: ThemeEntry[]
  /** 用户主题层目录（设置页可用于提示路径） */
  userDir: string
  /** 安装目录里的内置主题目录 */
  builtinDir: string
}

const EMPTY: ThemeCatalog = { schema: 1, themes: [], userDir: '', builtinDir: '' }

export async function loadThemeCatalog(): Promise<ThemeCatalog> {
  const catalog = await invokeTauri<ThemeCatalog>('get_theme_catalog')
  if (!catalog || !Array.isArray(catalog.themes)) return EMPTY
  return {
    schema: catalog.schema ?? 1,
    themes: catalog.themes,
    userDir: catalog.userDir ?? '',
    builtinDir: catalog.builtinDir ?? '',
  }
}
