/**
 * 安装时选定的界面语言 → 应用设置（首次启动的一次性交接）。
 *
 * 链路：
 *   1. NSIS 安装器（src-tauri/installer.nsh）在**全新安装**时把向导里选的
 *      语言写进 HKCU\Software\YiziMarkdown\InstallLanguage
 *   2. 应用启动时 Rust 的 take_install_language 读走该值并立即删除
 *      （命令行 `--lang` 优先级更高，见 src-tauri/src/main.rs）
 *   3. 这里在首帧渲染**之前**把它写进 settingsStore —— 用户第一次打开看到
 *      的就是安装时选的语言，不会先闪一下简体中文再跳
 *
 * 只在启动时调用一次；之后一切以应用内「设置 → 语言」为准。
 */
import { invokeTauri } from './tauri'
import { detectSystemLanguage, normalizeLocaleId } from './localeCode'
import { LANGUAGES, type Language } from '../i18n'
import { useSettingsStore } from '../stores/settingsStore'

const SUPPORTED = LANGUAGES.map((l) => l.id as string)
const SETTINGS_STORAGE_KEY = 'yizimarkdown-settings'

/**
 * 应用安装语言；返回是否**读到**了安装器选定的语言（即使它刚好等于默认中文）。
 *
 * 返回 true 时调用方不要再跑系统语言检测：安装器选择优先级最高。
 */
export async function applyInstallLanguage(): Promise<boolean> {
  // 非 Tauri 环境（浏览器预览、node 测试）返回 null，什么也不做
  const code = await invokeTauri<string | null>('take_install_language')
  const lang = normalizeLocaleId(code, SUPPORTED) as Language | null
  if (!lang) return false
  // 即便值等于当前默认（zh），也显式 set 一次，让 persist 立刻写入存档；
  // 否则下次启动会被误判成「首次运行」而重新做系统语言检测。
  useSettingsStore.getState().setField('language', lang)
  return true
}

/**
 * 首次启动（从未写过任何设置）且没有安装器语言时，按系统语言初始化界面。
 *
 * 这是给便携版 / macOS / Linux 以及非 Windows 安装器用户的兜底：
 * - 系统语言受支持 → 直接用（English 用户打开就是英文，俄语用户直接俄语）
 * - 系统语言不支持 → 回退 English（而不是让不懂中文的人面对中文界面）
 *
 * 有存档（哪怕只是改过任何其他设置）就说明不是首次启动，绝不覆盖用户选择。
 */
export function applySystemLanguageOnFirstRun(): boolean {
  try {
    if (localStorage.getItem(SETTINGS_STORAGE_KEY)) return false
  } catch {
    return false
  }
  const langs = typeof navigator !== 'undefined'
    ? [...(navigator.languages || []), navigator.language].filter(Boolean)
    : []
  const detected = detectSystemLanguage(langs, SUPPORTED) as Language | null
  const lang = detected ?? 'en'
  useSettingsStore.getState().setField('language', lang)
  return true
}
