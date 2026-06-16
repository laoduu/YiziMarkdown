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

  // 插件
  enabledPlugins: string[]
  pluginConfigs: Record<string, Record<string, unknown>>

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
      fontFamily: "'MiSans', 'Mi Sans', system-ui, -apple-system, 'PingFang SC', 'Segoe UI', 'Microsoft YaHei', 'Noto Sans SC', sans-serif",
      previewFontFamily: "'MiSans', 'Mi Sans', system-ui, -apple-system, 'PingFang SC', 'Segoe UI', 'Microsoft YaHei', 'Noto Sans SC', sans-serif",
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

      // 插件
      enabledPlugins: [],
      pluginConfigs: {},

      // 方法
      setField: (key, value) => set({ [key]: value }),
      updateSettings: (partial) => set(partial),
    }),
    {
      name: 'yizimarkdown-settings',
      migrate: (persisted: unknown) => {
        // 自动迁移旧字体栈到 MiSans 方案
        const oldFont = "'DengXian', 'Microsoft YaHei', 'Noto Sans SC', system-ui, sans-serif"
        const newFont = "'MiSans', 'Mi Sans', system-ui, -apple-system, 'PingFang SC', 'Segoe UI', 'Microsoft YaHei', 'Noto Sans SC', sans-serif"
        const state = persisted as Record<string, unknown>
        if (state) {
          if (state.fontFamily === oldFont) state.fontFamily = newFont
          if (state.previewFontFamily === oldFont) state.previewFontFamily = newFont
        }
        return state
      },
    }
  )
)
