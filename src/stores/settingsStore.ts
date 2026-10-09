import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SlideAnim } from '../lib/slideTiles'
import type { FrontMatterPropType } from '../lib/frontMatter'
import { DEFAULT_THEME } from '../lib/themeOrder.ts'
import {
  DEFAULT_SLIDE_TYPOGRAPHY, DEFAULT_SLIDE_FONT_WEIGHT, SLIDE_FONT_SCALE, SLIDE_FILL,
  clampNumber, isSlideFontId, type SlideFontId,
} from '../lib/slideTypography.ts'

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

  // 光标
  cursorStyle: 'text' | 'bold'
  mouseSpotlight: boolean

  // 预览模式排版
  previewFontSize: number
  previewLineHeight: number

  // 外观
  currentTheme: string
  isDark: boolean
  userThemeEnabled: boolean
  userThemeName: string
  /** 「自定义主题」的基底主题：保存自定义 CSS 时快照当时的当前主题（见 lib/themeLoader.ts）。
   *  有了它，「在织锦上只改一个强调色」得到的才是「织锦 + 新色」而不是「默认底 + 新色」。 */
  customCssBase: string

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

  // WebDAV 云端存储（v0.3.0）
  /** 服务器根地址，如 https://dav.jianguoyun.com/dav/（用户名/密码存 OS 凭据库，不在此处） */
  webdavBaseUrl: string
  /** 云端浏览器进入时的起始目录 */
  webdavRootPath: string
  /** 云端浏览器上次停留的目录，重新打开时恢复 */
  webdavLastPath: string

  // 演示模式（v0.3.1）
  /** 切换动画变体：在演示模式 HUD 里选择，立即持久化 */
  slideAnim: SlideAnim

  // 演示模式排版（v0.3.3）：HUD 的「字体 / 字重 / 字号 / 内容填充宽度 / 高度」旋钮。
  // 与 slideAnim 同一模式：在演示 HUD 里改、立即持久化、下次进入演示沿用。
  // 取值语义与默认值见 lib/slideTypography.ts；缺省值下的渲染与加入旋钮前完全一致。
  slideFontFamily: SlideFontId
  /** 字重（100–900，默认 400）：只影响正文，标题自带字重不受影响 */
  slideFontWeight: number
  /** 字号缩放（0.7–1.6，默认 1）：乘在 clamp(18px, 2.1vw, 30px) 上 */
  slideFontScale: number
  /** 内容区宽度占整屏百分比（50–95，默认 82）：**唯一**的宽度依据 */
  slideFillWidth: number
  /** 内容区高度占整屏百分比（50–95，默认 84）：**唯一**的高度依据 */
  slideFillHeight: number

  // 元信息属性（v0.3.2）
  /** front matter 属性类型：按**属性名**全局存（与 Obsidian 的 types.json 语义一致）。
   *  刻意不按文件路径索引 —— 项目里没有任何按路径索引的持久化，
   *  且"未命名新文件"与"云端文档"都没有可靠的本地路径。 */
  frontMatterTypes: Record<string, FrontMatterPropType>

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

      // 光标
      cursorStyle: 'bold',
      mouseSpotlight: true,

      // 外观
      currentTheme: DEFAULT_THEME,
      isDark: false,
      userThemeEnabled: false,
      userThemeName: '',
      customCssBase: DEFAULT_THEME,

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

      // WebDAV 云端存储（v0.3.0）
      webdavBaseUrl: '',
      webdavRootPath: '/yizimarkdown',
      // 空串表示"还没浏览过"：云端浏览器据此回落到起始目录，而不是服务器根
      webdavLastPath: '',

      // 演示模式（v0.3.1）
      slideAnim: 'cube',

      // 演示模式排版（v0.3.3）
      slideFontFamily: DEFAULT_SLIDE_TYPOGRAPHY.fontFamily,
      slideFontWeight: DEFAULT_SLIDE_TYPOGRAPHY.fontWeight,
      slideFontScale: DEFAULT_SLIDE_TYPOGRAPHY.fontScale,
      slideFillWidth: DEFAULT_SLIDE_TYPOGRAPHY.fillWidth,
      slideFillHeight: DEFAULT_SLIDE_TYPOGRAPHY.fillHeight,

      // 元信息属性（v0.3.2）：属性名 → 类型
      frontMatterTypes: {},

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
      // v2/v3: 涟漪反馈默认开启
      // v4: WebDAV 起始目录默认值改为 /yizimarkdown
      // v5: 默认主题改为 liquidglass-prism，旧的 liquidglass 主题已删除
      // v6: 自定义 CSS 升级为「自定义主题」——新增基底主题 customCssBase
      // v7: 演示模式排版旋钮 —— 新增 slideFontFamily / slideFontWeight / slideFontScale / slidePadScale
      // v8: 「页边距缩放」改为「内容填充宽度/高度」——删去 slidePadScale，新增 slideFillWidth / slideFillHeight
      version: 8,
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
          // v2/v3：涟漪反馈默认开启（新功能默认值统一为开启；v3 对存量已关闭的存档再强制一次）
          state.mouseSpotlight = true
          // v4：起始目录的旧默认值 '/' 迁移为 /yizimarkdown（坚果云预设目录）。
          // 只认旧默认值本身：用户手填过的路径（含其它值）一律不动。
          if (state.webdavRootPath === '/') state.webdavRootPath = '/yizimarkdown'
          // v5：旧的 liquidglass 主题文件已删除。选中它的存档必须改指后继 prism，
          // 否则 read_theme_css 会取不到文件、主题整块空白。
          // 只动这一种被删掉的值，用户明确选过的其它主题一概不动。
          if (state.currentTheme === 'liquidglass') state.currentTheme = DEFAULT_THEME
          // v6：新增基底主题字段。存量存档没有它 ⇒ 补默认值（旧行为的 user.css 是全局叠加，
          // 没有「基底」概念，取默认主题是最接近的语义）。
          if (typeof state.customCssBase !== 'string' || !state.customCssBase) {
            state.customCssBase = DEFAULT_THEME
          }
          // v7：演示模式排版旋钮。存量存档没有这四个键 ⇒ 补默认值。
          // 字体 id 只认枚举值（手改 localStorage 写入非法值会让 HUD 选择框空白）；
          // 数值统一收敛到合法区间，避免滑杆越界后 UI 与渲染不一致。
          if (!isSlideFontId(state.slideFontFamily)) state.slideFontFamily = DEFAULT_SLIDE_TYPOGRAPHY.fontFamily
          state.slideFontWeight = clampNumber(state.slideFontWeight, 100, 900, DEFAULT_SLIDE_FONT_WEIGHT)
          state.slideFontScale = clampNumber(state.slideFontScale, SLIDE_FONT_SCALE.min, SLIDE_FONT_SCALE.max, SLIDE_FONT_SCALE.default)
          // v8：「页边距缩放」被「内容填充宽度/高度」取代 —— slidePadScale 已无消费点，
          // 直接删掉（留着只会被 persist 反复写回存档）。新键收敛到 50~95。
          delete (state as Record<string, unknown>).slidePadScale
          state.slideFillWidth = clampNumber(state.slideFillWidth, SLIDE_FILL.min, SLIDE_FILL.max, SLIDE_FILL.defaultW)
          state.slideFillHeight = clampNumber(state.slideFillHeight, SLIDE_FILL.min, SLIDE_FILL.max, SLIDE_FILL.defaultH)
        }
        return state
      },
    }
  )
)
