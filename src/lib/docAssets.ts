/**
 * 文档图片资产 —— Rust 命令的类型化封装（v0.4.3）。
 *
 * 目录约定见 `src-tauri/src/doc_assets.rs`：
 * - 已保存文档：`<文档目录>/images/image-<hash>.png`，Markdown 写相对路径；
 * - 未命名文档：先落 `<配置目录>/images/pending/<tabId>/`，Markdown 暂写绝对路径，
 *   首次「另存为 / 保存到云端」时迁移成相对路径。
 */
import { invokeTauri, invokeTauriOrThrow } from './tauri.ts'

/** 与 Rust `MAX_PASTED_IMAGE_BYTES` / WebDAV 单图上限一致 */
export const PASTED_IMAGE_MAX_BYTES = 8 * 1024 * 1024

export interface SavedImage {
  /** 落盘绝对路径（正斜杠），供调试/预览 */
  absolutePath: string
  /** 写进 Markdown 的引用：已保存文档为 `images/xxx.png`，未命名文档为绝对路径 */
  markdownRef: string
  relative: boolean
  fileName: string
}

export interface StagedAssets {
  content: string
  /** 上传云端时的本地来源目录；没有未命名图时为 null */
  localDir: string | null
  changed: boolean
}

/** 本地文档的图片保存位置（云端文档始终用 doc / 相对路径） */
export type ImageSaveMode = 'doc' | 'assets'

export function savePastedImage(
  docPath: string | null,
  tabId: string,
  base64: string,
  saveMode: ImageSaveMode = 'doc',
): Promise<SavedImage> {
  return invokeTauriOrThrow<SavedImage>('save_pasted_image', { docPath, tabId, base64, saveMode })
}

/** Word / WPS 剪贴板的临时 file:// 图片：读取后复制进文档 images/（或应用资源目录） */
export function importImageFile(
  docPath: string | null,
  tabId: string,
  path: string,
  saveMode: ImageSaveMode = 'doc',
): Promise<SavedImage> {
  return invokeTauriOrThrow<SavedImage>('import_image_file', { docPath, tabId, path, saveMode })
}

/**
 * 另存为：迁移 pending 图 + 复制相对引用图 + 写入正文，返回重写后的正文。
 * 调用方必须把返回值同步到编辑器与 store。
 */
export function saveFileWithAssets(
  sourcePath: string | null,
  targetPath: string,
  content: string,
  pendingKey: string | null,
): Promise<string> {
  return invokeTauriOrThrow<string>('save_file_with_assets', {
    sourcePath,
    targetPath,
    content,
    pendingKey,
  })
}

/** 未命名文档保存到云端：把 pending 图复制到 staging，引用改写为相对路径 */
export function stagePendingAssets(tabId: string, content: string): Promise<StagedAssets> {
  return invokeTauriOrThrow<StagedAssets>('stage_pending_assets', { tabId, content })
}

/** 未命名文档保存到云端后，把 staging 图片补进本地缓存（上传失败的图下次保存会重试） */
export function adoptStagedAssets(tabId: string, cachePath: string): Promise<number> {
  return invokeTauriOrThrow<number>('adopt_staged_assets', { tabId, cachePath })
}

/** 保存成功后清理 pending / staging 暂存（失败只是留下垃圾文件，静默） */
export function cleanupPastedAssets(tabId: string): void {
  void invokeTauri<void>('cleanup_pasted_assets', { tabId })
}

const TOO_LARGE_ERROR = 'IMAGE_TOO_LARGE'

export function isImageTooLargeError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '')
  return msg.includes(TOO_LARGE_ERROR)
}
