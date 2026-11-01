import type MarkdownIt from 'markdown-it'

/** 插件配置项定义 */
export interface PluginConfigField {
  /** 配置项 key，对应 settingsStore 中 pluginConfigs[id][key] */
  key: string
  /** 显示名称 */
  label: string
  /** i18n key（可选，优先于 label） */
  labelKey?: string
  /** 配置项类型 */
  type: 'select' | 'checkbox' | 'number' | 'text'
  /** type=select 时的选项列表 */
  options?: Array<{ value: string; label: string; labelKey?: string }>
  /** type=number 时的范围 */
  min?: number
  max?: number
  step?: number
  /** type=number 时的单位后缀 */
  unit?: string
  /** 默认值 */
  defaultValue: string | number | boolean
  /** 选项下方的说明文字 */
  hint?: string
  /** 说明文字的 i18n key（可选，优先于 hint） */
  hintKey?: string
}

/** 插件激活时机。built-in 插件也可以声明 onCommand，由导出等动作触发。 */
export type PluginActivation =
  | 'startup'
  | `onLanguage:${string}`
  | `onCommand:${string}`

export type PluginPermission =
  | 'export'
  | 'network'
  | 'filesystem'
  | 'external-process'

export interface PluginCapabilities {
  /** 是否向 markdown-it 注入扩展 */
  markdown?: boolean
  /** 是否参与渲染后的 DOM 后处理 */
  postRender?: boolean
  /** 提供的导出格式（如 epub） */
  exportFormats?: string[]
}

/**
 * 插件 manifest。当前只加载编译进应用的内置插件；manifest 是未来安装/兼容性
 * 检查的稳定边界，不直接暴露应用内部模块。
 */
export interface PluginManifest {
  id: string
  version: string
  /** 插件 API 版本；应用升级时用于兼容性判断 */
  apiVersion: number
  /** 最低应用版本 */
  minAppVersion: string
  activation: PluginActivation[]
  permissions: PluginPermission[]
  capabilities: PluginCapabilities
}

/** 导出插件拿到的上下文；由 App 统一组装，插件不直接摸内部 store。 */
export interface PluginExportContext {
  content: string
  title: string
  author?: string
  date?: string
  filePath?: string | null
  docBaseDir?: string | null
  /** 预览正文 HTML（含已渲染的公式/图表/图片） */
  bodyHtml: string
  bodyClass: string
  bodyStyle: string
  rootStyle: string
  css: {
    base: string
    math: string
    theme: string
    user: string
    outline: string
  }
  theme: string
  isDark: boolean
  locale: string
  /** 导出面板选项（由插件 exportOptions/getExportDefaults 产生） */
  options: Record<string, unknown>
  /** 打包进度（0-based done / total）；label 可选，由面板本地化 */
  onProgress?: (done: number, total: number, label?: string) => void
}

export interface PluginExportWarning {
  messageKey?: string
  message?: string
  messageArgs?: Record<string, string | number>
}

export interface PluginExportResult {
  bytes: Uint8Array
  /** 保存对话框建议扩展名，如 epub */
  extension: string
  /** 可选 MIME，供诊断/未来使用 */
  mimeType?: string
  warnings?: PluginExportWarning[]
}

export interface EditorPlugin {
  /** 唯一标识（与 manifest.id 保持一致） */
  id: string
  manifest: PluginManifest
  /** 显示名称 */
  name: string
  /** i18n key（可选，优先于 name） */
  nameKey?: string
  /** 简短描述 */
  description: string
  /** 描述的 i18n key（可选，优先于 description） */
  descriptionKey?: string
  /** 配置项定义（可选） */
  configFields?: PluginConfigField[]

  // ---- 生命周期 ----

  /** 首次启用时动态加载 JS/CSS，成功返回 true（可由 activate 合并） */
  load?(): Promise<boolean>

  /** 启用后的激活；失败不应拖垮主应用 */
  activate?(): Promise<void>

  /** 注入 markdown-it 扩展（可选） */
  extendMarkdownIt?(md: MarkdownIt, configs: Record<string, unknown>): void

  /** HTML 挂载后的 DOM 后处理（公式渲染、图表渲染等，可选） */
  postRender?(container: HTMLElement, configs: Record<string, unknown>): Promise<void>

  /** 注入到 <head> 的 CSS（首次加载成功后调用，可选） */
  injectCSS?(): Promise<string | null>

  /** 停用时清理（移除动态注入的 CSS/全局状态等） */
  deactivate?(): void
  destroy?(): void

  /** 导出面板字段；当前用于 EPUB 的章节/封面/目录等选项 */
  exportOptions?: PluginConfigField[]
  /** 导出面板默认值（可结合当前文档标题/作者等动态生成） */
  getExportDefaults?(context: PluginExportContext): Record<string, unknown>

  /** 导出能力：format → 处理函数（如 epub） */
  exporters?: Record<string, (context: PluginExportContext) => Promise<PluginExportResult>>
}
