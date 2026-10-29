/**
 * `@joplin/turndown-plugin-gfm` 只发布 CJS、且没有类型声明。
 * 这里按它的实际导出补一份最小声明（`require()` 验证过导出名）。
 */
declare module '@joplin/turndown-plugin-gfm' {
  import TurndownService from 'turndown'
  type Plugin = TurndownService.Plugin
  export const gfm: Plugin
  export const tables: Plugin
  export const strikethrough: Plugin
  export const taskListItems: Plugin
  export const highlightedCodeBlock: Plugin
}
