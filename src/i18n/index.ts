/**
 * i18n — 轻量实现（无第三方库）：语言字典 + 响应式 t() 函数。
 * 由 settingsStore.language 驱动；缺失的 key 回退到英文，再回退到 key 本身。
 *
 * 用法：
 *   const { t } = useI18n()
 *   t('toolbar.newFile')            → "新建文件"
 *   t('home.recentCount', { n: 3 }) → "3 个最近文件"
 */
// 相对导入带 .ts 扩展名：`node --test` 的类型剥离不做扩展名补全，
// 而 `src/lib/cm-live-blocks.ts` 需要在自己的测试里直接加载本模块。
import { useSettingsStore } from '../stores/settingsStore.ts'
import { en } from './en.ts'
import { zh } from './zh.ts'
import { zhTW } from './zh-tw.ts'
import { ja } from './ja.ts'
import { ko } from './ko.ts'
import { de } from './de.ts'
import { fr } from './fr.ts'
import { es } from './es.ts'
import { pt } from './pt.ts'
import { it } from './it.ts'
import { pl } from './pl.ts'
import { nl } from './nl.ts'
import { tr } from './tr.ts'
import { sv } from './sv.ts'
import { uk } from './uk.ts'

export type Language = keyof typeof dicts

const dicts = { en, zh, 'zh-tw': zhTW, ja, ko, de, fr, es, pt, it, pl, nl, tr, sv, uk } as const

export const LANGUAGES: Array<{ id: Language; label: string }> = [
  { id: 'zh', label: '简体中文' },
  { id: 'zh-tw', label: '繁體中文' },
  { id: 'en', label: 'English' },
  { id: 'ja', label: '日本語' },
  { id: 'ko', label: '한국어' },
  { id: 'de', label: 'Deutsch' },
  { id: 'fr', label: 'Français' },
  { id: 'es', label: 'Español' },
  { id: 'pt', label: 'Português' },
  { id: 'it', label: 'Italiano' },
  { id: 'pl', label: 'Polski' },
  { id: 'nl', label: 'Nederlands' },
  { id: 'tr', label: 'Türkçe' },
  { id: 'sv', label: 'Svenska' },
  { id: 'uk', label: 'Українська' },
]

type Dict = Record<string, unknown>

function lookup(d: Dict | undefined, parts: string[]): string | undefined {
  let cur: unknown = d
  for (const p of parts) {
    if (cur == null) return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return typeof cur === 'string' ? cur : undefined
}

/** 纯函数翻译：供非组件代码（keybindings 等）使用，无响应式。 */
export function translate(lang: Language | undefined, key: string, params?: Record<string, string | number>): string {
  const parts = key.split('.')
  let str = lookup(dicts[lang ?? 'en'], parts) ?? lookup(en, parts) ?? key
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
    }
  }
  return str
}

/** React hook：订阅 settingsStore.language，返回响应式 t()。 */
export function useI18n() {
  const language = useSettingsStore((s) => s.language)
  const t = (key: string, params?: Record<string, string | number>) => translate(language as Language, key, params)
  return { t, lang: language as Language }
}

/** 非 hook 场景：读取当前语言（不订阅变化）。 */
export function getCurrentLang(): Language {
  return useSettingsStore.getState().language as Language
}
