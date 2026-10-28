import { deriveDocumentTitle } from './docTitle.ts'

/**
 * 导出对话框默认文件名的统一推导（所有「另存为」型导出共用一套口径）。
 *
 * 优先级（与 DOCX / HTML / PDF / PPTX 一致）：
 *   1. 已保存文件的路径文件名 —— 用户已经命名过，沿用最不意外
 *      （导出格式不同，但同名不同扩展名，方便在同一个目录里对照）
 *   2. 文档推导标题 —— front matter `title` → 正文第一个 ATX 标题行（见 docTitle.ts）
 *   3. 都推不出 → 调用方给的兜底名（document / slides / untitled）
 *
 * 单独抽成一个函数的原因：PPTX 之前拿 `tab.name` 当默认名，未保存的新文档
 * 那里是「未命名新文件」，于是文档里明明有 `# 标题`，导出文件名却与标题无关。
 * 现在 PPTX 与其它导出走同一条路径，改口径只需要改一处。
 */

/** 从完整路径取文件名（去扩展名）；取不到返回 null */
export function baseNameFromPath(filePath: string | null | undefined): string | null {
  if (!filePath) return null
  const seg = filePath.split(/[\\/]/).pop() || ''
  const base = seg.replace(/\.[^./\\]+$/, '')
  return base || null
}

export interface ExportBaseNameInput {
  content: string
  filePath?: string | null
  /** 推不出标题时的兜底名（不含扩展名） */
  fallback?: string
}

/** 导出文件名（不含扩展名） */
export function deriveExportBaseName(input: ExportBaseNameInput): string {
  const { content, filePath, fallback = 'document' } = input
  return baseNameFromPath(filePath) || deriveDocumentTitle(content) || fallback
}
