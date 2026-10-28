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
import { normalizeLocaleId } from './localeCode'
import { LANGUAGES, type Language } from '../i18n'
import { useSettingsStore } from '../stores/settingsStore'

const SUPPORTED = LANGUAGES.map((l) => l.id as string)

/** 应用安装语言；返回是否真的改了语言（供启动日志/测试观察） */
export async function applyInstallLanguage(): Promise<boolean> {
  // 非 Tauri 环境（浏览器预览、node 测试）返回 null，什么也不做
  const code = await invokeTauri<string | null>('take_install_language')
  const lang = normalizeLocaleId(code, SUPPORTED) as Language | null
  if (!lang) return false
  const store = useSettingsStore.getState()
  if (store.language === lang) return false
  store.setField('language', lang)
  return true
}
