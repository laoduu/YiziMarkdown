/**
 * 语言代码归一化（纯函数，node --test 直接可测）。
 *
 * 来源有两个，写法都不干净：
 *   · NSIS 安装器 `$LANGUAGE` 是 LCID，installer.nsh 已经把它映射成应用 id
 *   · 命令行 `--lang` 是用户手敲的，可能是 `zh_CN`、`zh-Hant`、`PT-br` 之类
 * 所以这里再归一一次：小写化、下划线→连字符、常见地区后缀折叠到应用语言，
 * 最后用调用方给的支持列表（i18n 的 LANGUAGES）做白名单校验。
 */

/** 地区变体 → 应用语言 id（应用只区分这些语言，没有更细的地区差异） */
export const LOCALE_ALIASES: Record<string, string> = {
  zh: 'zh',
  'zh-cn': 'zh',
  'zh-hans': 'zh',
  'zh-sg': 'zh',
  cn: 'zh',
  'zh-tw': 'zh-tw',
  'zh-hk': 'zh-tw',
  'zh-mo': 'zh-tw',
  'zh-hant': 'zh-tw',
  pt: 'pt',
  'pt-br': 'pt',
  'pt-pt': 'pt',
  ru: 'ru',
  'ru-ru': 'ru',
}

/** 归一化到支持列表里的语言 id；不在列表里返回 null（调用方忽略） */
export function normalizeLocaleId(code: string | null | undefined, supported: readonly string[]): string | null {
  if (!code) return null
  const lowered = code.trim().toLowerCase().replace(/_/g, '-')
  if (!lowered) return null
  const mapped = LOCALE_ALIASES[lowered] ?? lowered
  if (supported.includes(mapped)) return mapped

  // 通用地区后缀折叠：fr-FR / en-GB / de-AT → fr / en / de。
  // 只接受「语言-地区」两段，避免把 zh-CN-x 这类多段扩展当成合法语言。
  const parts = lowered.split('-')
  if (parts.length === 2 && parts[0]) {
    const base = LOCALE_ALIASES[parts[0]] ?? parts[0]
    if (supported.includes(base)) return base
  }
  return null
}

/**
 * 从浏览器的语言列表（`navigator.languages`）挑出第一个受支持的语言。
 * 找不到时返回 null，由调用方决定回退（首次启动建议回退英文）。
 */
export function detectSystemLanguage(
  codes: readonly (string | null | undefined)[],
  supported: readonly string[],
): string | null {
  for (const code of codes) {
    const matched = normalizeLocaleId(code, supported)
    if (matched) return matched
  }
  return null
}
