/**
 * 导出弹窗里「记住上次选择」的纯逻辑。
 *
 * 只记住偏好型的字段（checkbox / select）；text / number 往往是文档内容或本次导出
 * 的派生值（例如 EPUB 的「书名 / 作者」默认取当前文档标题），跨文档记住反而会
 * 把上一篇的标题带到下一篇，所以一律不存。
 *
 * 读取时还要做一次合法性校验：插件升级后选项可能改名 / 删除，旧存档里的值
 * 不能直接塞回受控 select（会显示为空）；不合法就回落到当前默认值。
 */
import type { PluginConfigField } from '../plugins/types'

export type ExportOptionValue = string | number | boolean

/** 设置存档里按「插件 + 导出格式」分组，避免同一插件多种格式互相覆盖。 */
export function exportOptionsStoreKey(pluginId: string, format: string): string {
  return `${pluginId}:${format}`
}

export function isRememberedExportField(field: PluginConfigField): boolean {
  return field.type === 'checkbox' || field.type === 'select'
}

/**
 * 校验并取出上次记住的值；没有 / 类型不符 / 选项已不存在时返回 undefined，
 * 由调用方回落到 `getExportDefaults()` 或字段的 defaultValue。
 */
export function rememberedExportValue(
  field: PluginConfigField,
  saved: unknown
): ExportOptionValue | undefined {
  if (field.type === 'checkbox') {
    return typeof saved === 'boolean' ? saved : undefined
  }
  if (field.type === 'select') {
    if (typeof saved !== 'string') return undefined
    return field.options?.some(opt => opt.value === saved) ? saved : undefined
  }
  return undefined
}
