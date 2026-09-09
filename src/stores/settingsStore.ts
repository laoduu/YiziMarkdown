import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface SettingsState {
  // 通用
  autoSave: boolean
  autoSaveInterval: number
  defaultTemplate: string
  language: string

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

  // AI（v0.2.0 侧边聊天面板）
  aiProvider: string
  aiModel: string
  aiBaseUrl: string
  /** 自定义服务的 wire 协议：OpenAI 兼容 / Anthropic 兼容（仅 provider=custom 时生效） */
  aiApiFormat: 'openai' | 'anthropic'
  aiSystemPrompt: string
  /** 引用当前文档时截断的字符上限（0 = 不限） */
  aiDocLimit: number
  /** 每次发送时包含的最近对话轮次（0 = 无上下文） */
  aiContextTurns: number
  /** 各供应商的配置缓存 { providerId: { model, baseUrl, apiFormat } } */
  aiProviderConfigs: Record<string, { model?: string; baseUrl?: string; apiFormat?: 'openai' | 'anthropic' }>
  /** AI 聊天面板宽度（px） */
  aiChatWidth: number

  // AI 面板运行时状态（不持久化）
  /** AI 面板是否打开 */
  aiPanelOpen: boolean
  /** 来自划词助手的待执行动作 */
  aiPendingAction: { type: 'skill'; skillId: string; fromSelection?: boolean; selectedText?: string } | { type: 'chat'; text: string } | null

  // 方法
  setField: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void
  updateSettings: (partial: Partial<SettingsState>) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      // 通用
      autoSave: true,
      autoSaveInterval: 60000,
      defaultTemplate: '',
      language: 'zh',

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

      // AI（v0.2.0 侧边聊天面板）
      aiProvider: 'deepseek',
      aiModel: '',
      aiBaseUrl: '',
      aiApiFormat: 'openai',
      aiSystemPrompt: '',
      aiDocLimit: 200000,
      aiContextTurns: 3,
      aiProviderConfigs: {},
      aiChatWidth: 380,

      // AI 面板运行时状态
      aiPanelOpen: false,
      aiPendingAction: null,

      // 方法
      setField: (key, value) => set({ [key]: value }),
      updateSettings: (partial) => set(partial),
    }),
    {
      name: 'yizimarkdown-settings',
      // v1: 自动保存间隔范围改为 5s~180s（旧数据越界需迁移）
      version: 1,
      migrate: (persisted: unknown) => {
        // 自动迁移旧字体栈到 MiSans 方案
        const oldFont = "'DengXian', 'Microsoft YaHei', 'Noto Sans SC', system-ui, sans-serif"
        const newFont = "'MiSans', 'Mi Sans', system-ui, -apple-system, 'PingFang SC', 'Segoe UI', 'Microsoft YaHei', 'Noto Sans SC', sans-serif"
        const state = persisted as Record<string, unknown>
        if (state) {
          if (state.fontFamily === oldFont) state.fontFamily = newFont
          if (state.previewFontFamily === oldFont) state.previewFontFamily = newFont
          // 自动保存间隔迁移：旧范围 1s~10s，新范围 5s~180s，越界值重置为默认 60s
          const iv = state.autoSaveInterval
          if (typeof iv !== 'number' || iv < 5000 || iv > 180000) {
            state.autoSaveInterval = 60000
          }
        }
        return state
      },
    }
  )
)
