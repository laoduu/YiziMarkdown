import type MarkdownIt from 'markdown-it'

/** 插件配置项定义 */
export interface PluginConfigField {
  /** 配置项 key，对应 settingsStore 中 pluginConfigs[id][key] */
  key: string
  /** 显示名称 */
  label: string
  /** 配置项类型 */
  type: 'select' | 'checkbox' | 'number'
  /** type=select 时的选项列表 */
  options?: Array<{ value: string; label: string }>
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
}

/** 插件接口 */
export interface EditorPlugin {
  /** 唯一标识 */
  id: string
  /** 显示名称 */
  name: string
  /** 简短描述 */
  description: string
  /** 配置项定义（可选） */
  configFields?: PluginConfigField[]

  // ---- 生命周期 ----

  /** 首次启用时动态加载 JS/CSS，成功返回 true */
  load(): Promise<boolean>

  /** 注入 markdown-it 扩展 */
  extendMarkdownIt(md: MarkdownIt, configs: Record<string, unknown>): void

  /** HTML 挂载后的 DOM 后处理（公式渲染、图表渲染等） */
  postRender?(container: HTMLElement, configs: Record<string, unknown>): Promise<void>

  /** 注入到 <head> 的 CSS（首次加载成功后调用） */
  injectCSS?(): Promise<string | null>

  /** 停用时清理（移除动态注入的 CSS/全局状态等） */
  destroy?(): void
}
