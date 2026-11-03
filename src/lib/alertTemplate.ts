/**
 * 工具栏插入提示块时的 Markdown 模板。
 *
 * 结构固定为「类型标记 + 默认标题」一行 + 一行空正文：
 * 光标会停在末尾 `> ` 之后，用户可直接输入正文。
 */
export type AlertType = 'NOTE' | 'TIP' | 'IMPORTANT' | 'WARNING' | 'CAUTION'

export function buildAlertMarkdown(type: AlertType, title: string): string {
  return `\n> [!${type}] ${title}\n> `
}
