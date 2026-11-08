/**
 * 文档图片资产 —— Rust 命令的类型化封装（v0.4.3）。
 *
 * 目录约定见 `src-tauri/src/doc_assets.rs`：
 * - 本地文档（含未命名文档）：统一落 `~/Documents/yizimarkdown/assets/`，Markdown 写绝对路径；
 *   不侵入项目目录，也不随缓存清理丢失。
 * - 云端文档：图片统一放 `<WebDAV 根>/assets/`，本地镜像到缓存同名目录；
 *   Markdown 写相对引用（`assets/xxx.png` 或 `../assets/xxx.png`）。
 *   保存到云端时 `stagePendingAssets` 会把本地 assets 图片复制进 staging 并重写引用。
 */
import { invokeTauri, invokeTauriOrThrow } from './tauri.ts'

/** 与 Rust `MAX_PASTED_IMAGE_BYTES` / WebDAV 单图上限一致 */
export const PASTED_IMAGE_MAX_BYTES = 8 * 1024 * 1024

export interface SavedImage {
  /** 落盘绝对路径（正斜杠），供调试/预览 */
  absolutePath: string
  /** 写进 Markdown 的引用：本地文档为绝对路径，云端文档为 `[../]assets/xxx.png` */
  markdownRef: string
  relative: boolean
  fileName: string
}

export interface StagedAssets {
  content: string
  /** 上传云端时的本地来源目录；没有需要迁移的图片时为 null */
  localDir: string | null
  changed: boolean
}

/** `assets` = 本地文档（用户资源目录 + 绝对路径）；`cloud` = 云端文档（WebDAV 根/assets/ + 相对路径） */
export type ImageSaveMode = 'assets' | 'cloud'

export interface CloudImageContext {
  /** WebDAV 服务地址（用于定位本地缓存根） */
  baseUrl: string
  /** 当前文档的远程路径，如 `/yizimarkdown/Notes/doc.md` */
  remotePath: string
  /** 设置里的 WebDAV 根目录，如图 `/yizimarkdown` */
  remoteRoot: string
}

export function savePastedImage(
  docPath: string | null,
  base64: string,
  saveMode: ImageSaveMode,
  cloud?: CloudImageContext,
): Promise<SavedImage> {
  return invokeTauriOrThrow<SavedImage>('save_pasted_image', {
    docPath,
    base64,
    saveMode,
    baseUrl: cloud?.baseUrl ?? null,
    remotePath: cloud?.remotePath ?? null,
    remoteRoot: cloud?.remoteRoot ?? null,
  })
}

/** Word / WPS 剪贴板的临时 file:// 图片：读取后复制进用户资源目录 / 云端统一 assets/ */
export function importImageFile(
  docPath: string | null,
  path: string,
  saveMode: ImageSaveMode,
  cloud?: CloudImageContext,
): Promise<SavedImage> {
  return invokeTauriOrThrow<SavedImage>('import_image_file', {
    docPath,
    path,
    saveMode,
    baseUrl: cloud?.baseUrl ?? null,
    remotePath: cloud?.remotePath ?? null,
    remoteRoot: cloud?.remoteRoot ?? null,
  })
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

/**
 * 未命名 / 本地文档保存到云端：把本地 assets 图复制到 staging，
 * 按云端统一目录改写为相对引用（如 `assets/`、`../assets/`）。
 */
export function stagePendingAssets(
  tabId: string,
  content: string,
  remotePath: string,
  remoteRoot: string,
): Promise<StagedAssets> {
  return invokeTauriOrThrow<StagedAssets>('stage_pending_assets', {
    tabId,
    content,
    remotePath,
    remoteRoot,
  })
}

/** 保存到云端后，把 staging 图片补进本地缓存里的 `<WebDAV 根>/assets/` */
export function adoptStagedAssets(
  tabId: string,
  cachePath: string,
  baseUrl: string,
  remoteRoot: string,
): Promise<number> {
  return invokeTauriOrThrow<number>('adopt_staged_assets', {
    tabId,
    cachePath,
    baseUrl,
    remoteRoot,
  })
}

/** 保存成功后清理 pending / staging 暂存（失败只是留下垃圾文件，静默） */
export function cleanupPastedAssets(tabId: string): void {
  void invokeTauri<void>('cleanup_pasted_assets', { tabId })
}

/**
 * 补写云端 `<WebDAV 根>/assets/README.md`（历史目录回填，仅在缺失时写）。
 * 由云端浏览器展开系统资源目录时调用；失败可忽略（不阻塞浏览）。
 */
export function ensureRemoteAssetsReadme(baseUrl: string, remoteRoot: string): Promise<boolean> {
  return invokeTauriOrThrow<boolean>('ensure_remote_assets_readme', { baseUrl, remoteRoot })
}

const TOO_LARGE_ERROR = 'IMAGE_TOO_LARGE'

export function isImageTooLargeError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '')
  return msg.includes(TOO_LARGE_ERROR)
}
