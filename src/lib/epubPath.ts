/** 文件路径 / 文件名是否指向 EPUB（用于打开文件、最近文件、命令行、单实例） */
export function isEpubPath(path: string | null | undefined): boolean {
  return !!path && /\.epub$/i.test(path.trim())
}
