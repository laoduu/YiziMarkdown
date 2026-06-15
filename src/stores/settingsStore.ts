import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface SettingsState {
  // 通用
  autoSave: boolean
  autoSaveInterval: number
  defaultTemplate: string

  // 编辑器
  fontFamily: string
  previewFontFamily: string
  fontSize: number
  lineHeight: number
  showLineNumbers: boolean
  wordWrap: boolean
  spellCheck: boolean

  // 预览模式排版
  previewFontSize: number
  previewLineHeight: number

  // 外观
  currentTheme: string
  isDark: boolean
  userThemeEnabled: boolean
  userThemeName: string

  // 实时模式动画
  liveAnimationMode: 'blur' | 'flash' | 'glow' | 'ripple'

  // 方法
  setField: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void
  updateSettings: (partial: Partial<SettingsState>) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      // 通用
      autoSave: true,
      autoSaveInterval: 3000,
      defaultTemplate: '',

      // 编辑器
      fontFamily: "'DengXian', 'Microsoft YaHei', 'Noto Sans SC', system-ui, sans-serif",
      previewFontFamily: "'DengXian', 'Microsoft YaHei', 'Noto Sans SC', system-ui, sans-serif",
      fontSize: 20,
      lineHeight: 2.0,
      previewFontSize: 20,
      previewLineHeight: 2.0,
      showLineNumbers: true,
      wordWrap: true,
      spellCheck: false,

      // 外观
      currentTheme: 'academic',
      isDark: false,
      userThemeEnabled: false,
      userThemeName: '',

      // 实时模式动画
      liveAnimationMode: 'blur',

      // 方法
      setField: (key, value) => set({ [key]: value }),
      updateSettings: (partial) => set(partial),
    }),
    {
      name: 'yizimarkdown-settings',
    }
  )
)
