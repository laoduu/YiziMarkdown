/**
 * WebDAV 云端存储 —— Tauri 命令的类型化封装。
 *
 * 分工：
 *   - 服务器地址 / 根目录等非敏感项存 settingsStore（localStorage）
 *   - 用户名 / 密码存 OS 凭据库，**只经由 Rust 读写，绝不进入 localStorage 或本模块**
 *
 * 参数名用 camelCase：Tauri 会把 JS 的 `baseUrl` 映射到 Rust 的 `base_url`。
 */
import { invokeTauri, invokeTauriOrThrow } from './tauri'

/** 列目录返回的一项。`path` 是相对配置根目录的绝对路径，如 `/Notes/a.md` */
export interface RemoteEntry {
  path: string
  name: string
  isDir: boolean
  size: number
  modified: string | null
  etag: string | null
}

export interface WebdavReadResult {
  content: string
  etag: string | null
}

export interface WebdavOpenResult extends WebdavReadResult {
  /** 本地缓存镜像路径，用作 FileTab.filePath */
  cachePath: string
  imagesOk: number
  imagesFailed: number
}

export interface WebdavSaveResult {
  /** 远程已被他人修改（If-Match 失败） */
  conflict: boolean
  etag: string | null
  imagesUploaded?: number
  imagesFailed?: number
}

// ===== 凭据（OS 凭据库）=====

export function setCredentials(username: string, password: string): Promise<void> {
  return invokeTauriOrThrow<void>('webdav_set_credentials', { username, password })
}

export function hasCredentials(): Promise<boolean> {
  return invokeTauri<boolean>('webdav_has_credentials').then((v) => v === true)
}

/** 回填设置界面用；密码永不回传。 */
export function getUsername(): Promise<string | null> {
  return invokeTauri<string | null>('webdav_get_username')
}

export function clearCredentials(): Promise<void> {
  return invokeTauriOrThrow<void>('webdav_clear_credentials')
}

// ===== 连接与文件操作 =====

/**
 * 测试连通性 + 认证。
 * 成功时返回以 `OK` 开头的字符串；失败抛错（错误文本已是中文可读原因）。
 */
export function testConnection(baseUrl: string): Promise<string> {
  return invokeTauriOrThrow<string>('webdav_test_connection', { baseUrl })
}

export function list(baseUrl: string, path: string): Promise<RemoteEntry[]> {
  return invokeTauriOrThrow<RemoteEntry[]>('webdav_list', { baseUrl, path })
}

/**
 * 打开云端文档：下载正文到本地缓存镜像，并把相对引用的图片一并镜像下来。
 * 返回的 `cachePath` 用作 `FileTab.filePath`。
 */
export function openRemote(baseUrl: string, path: string): Promise<WebdavOpenResult> {
  // 注意：Rust 侧参数名为 remote_path，Tauri 要求 JS 传 remotePath。
  // 传错键名只会在运行时抛「missing required key」，类型系统拦不住。
  return invokeTauriOrThrow<WebdavOpenResult>('webdav_open', { baseUrl, remotePath: path })
}

/**
 * 保存到云端。
 * @param etag     打开时记录的 ETag；有值时启用冲突检测（远程被改过则返回 conflict）
 * @param create   新建文件（带 If-None-Match，已存在则 conflict）
 * @param localDir 图片的本地来源目录；提供时会把 md 中相对引用的图片一并上传
 */
export function save(
  baseUrl: string,
  path: string,
  content: string,
  etag: string | null,
  create: boolean,
  localDir?: string | null
): Promise<WebdavSaveResult> {
  // remote_path → remotePath（同上）
  return invokeTauriOrThrow<WebdavSaveResult>('webdav_save', {
    baseUrl,
    remotePath: path,
    content,
    etag,
    create,
    localDir: localDir ?? null,
  })
}

/** 递归创建目录（已存在视为成功）。 */
export function mkdir(baseUrl: string, path: string): Promise<void> {
  return invokeTauriOrThrow<void>('webdav_mkdir', { baseUrl, path })
}

/** 删除文件或目录（不存在视为成功）。 */
export function remove(baseUrl: string, path: string): Promise<void> {
  return invokeTauriOrThrow<void>('webdav_delete', { baseUrl, path })
}

/** 重命名 / 移动（目标已存在时抛错）。 */
export function move(baseUrl: string, from: string, to: string): Promise<void> {
  return invokeTauriOrThrow<void>('webdav_move', { baseUrl, from, to })
}

// ===== 目录变更广播 =====

/**
 * 云端目录内容已变更时广播（新建文件夹、上传新文档等）。
 *
 * 云端浏览器的目录列表是组件内部状态，而"保存到云端"发生在 App 层，
 * 两者没有直接引用关系；用事件解耦，避免把列表状态提升到全局。
 * `detail` 为发生变更的远程目录路径，浏览器只在正好看着该目录时才重新拉取。
 */
export const WEBDAV_DIR_CHANGED_EVENT = 'webdav-dir-changed'

export function notifyRemoteDirChanged(dir: string): void {
  window.dispatchEvent(new CustomEvent<string>(WEBDAV_DIR_CHANGED_EVENT, { detail: dir }))
}
