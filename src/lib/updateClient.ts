/**
 * 在线更新的运行时外壳：把 `tauri-plugin-updater` 与后端的环境 / 安装形态判定收到一处。
 *
 * 为什么要单独一层：**「能不能自动更新」取决于运行环境**（浏览器 / 开发模式 / 非 Windows /
 * MSI 安装 / 便携版），这些判断一旦散在界面各处，迟早出现「这个入口拦住了、那个没拦住」，
 * 而后果是把 MSI 用户装出第二份程序。界面只问两件事：
 * `getUpdateBlocker()`（能不能更新、为什么不能）与 `checkForUpdate()` / `installUpdate()`。
 *
 * 纯展示逻辑（版本比较、要不要提示、进度、体积格式化）在 `update.ts`，那边有单测；
 * 这一层是薄胶水，不测。
 */
import { check as checkPlugin, type Update } from '@tauri-apps/plugin-updater'
import { invokeTauri, invokeTauriOrThrow } from './tauri'

/** 安装形态。取值与 `src-tauri/src/main.rs` 的 `detect_windows_install_kind` 一一对应 */
export type InstallKind = 'nsis' | 'msi' | 'portable'

/** 不能自动更新的原因；`null` = 可以 */
export type UpdateBlocker =
  /** 开发模式：热更新的是源码，装包没有意义，而且会覆盖正在调试的环境 */
  | 'dev'
  /** 浏览器里打开（没有 Tauri 运行时） */
  | 'not-tauri'
  /** 非 Windows：清单里没有 darwin 键，macOS 走 dmg 手动更新 */
  | 'not-windows'
  /** MSI 安装版：NSIS 安装包会装出**第二份**程序，绝不能自动更 */
  | 'msi'
  /** 便携版：没有安装位置，覆盖不了自己，只能手动换包 */
  | 'portable'
  /** 探测不出安装形态：宁可不更新，也不要装坏别人的环境 */
  | 'unknown'

/**
 * 这些环境「装不了，但查得到」—— macOS（清单里没有 darwin 资源，dmg 要手动装）
 * 与 Windows 便携版（没有安装目录可覆盖）。
 *
 * 它们的共同处理：仍然去读 latest.json，有新版本就提示用户**手动下载**，
 * 而不是像 msi / dev 那样直接闭嘴。判定只此一处，界面与状态机都引用它。
 */
export type ManualUpdateBlocker = 'not-windows' | 'portable'

export const isManualUpdateChannel = (blocker: UpdateBlocker | null | undefined): boolean =>
  blocker === 'not-windows' || blocker === 'portable'

export const isTauriRuntime = (): boolean =>
  typeof window !== 'undefined' && !!(window as { __TAURI_INTERNALS__?: { invoke?: unknown } }).__TAURI_INTERNALS__?.invoke

/**
 * 探测当前环境能不能自动更新。任何一步拿不到答案都按「不能」处理 ——
 * 这条路上失败必须是**保守**的：少提示一次更新没有任何代价，装坏一次代价很大。
 */
export const getUpdateBlocker = async (): Promise<UpdateBlocker | null> => {
  if (import.meta.env.DEV) return 'dev'
  if (!isTauriRuntime()) return 'not-tauri'

  const platform = await invokeTauri<string>('get_platform')
  if (platform !== 'windows') return 'not-windows'

  const kind = await invokeTauri<string>('get_install_kind')
  if (kind === 'nsis') return null
  if (kind === 'msi') return 'msi'
  if (kind === 'portable') return 'portable'
  return 'unknown'
}

/** 清单里读到的新版本（拍平成普通对象，界面不必认识插件的资源类型） */
export interface AvailableUpdate {
  version: string
  currentVersion: string
  /** 更新说明（Markdown，来自 `docs/changelog/CHANGELOG-V*.md`） */
  notes: string
  /** 发布日（RFC 3339），清单没给就是 null */
  date: string | null
  /**
   * `auto` = 插件能自己下载并装（Windows NSIS 安装版）
   * `manual` = 只能提示用户去下载页手动换包（macOS / 便携版）
   */
  mode: 'auto' | 'manual'
}

/** `check_manual_update` 的返回：只要提示所需的字段，没有下载地址也没有签名 */
export interface ManualUpdateInfo {
  version: string
  notes: string
  date: string | null
}

/** 当前运行版本（安装器交接之外的另一处用途：手动更新提示要显示「你现在是 v几」） */
export const getCurrentVersion = async (): Promise<string> =>
  (await invokeTauri<string>('get_app_version')) ?? '0.0.0'

/**
 * 只查版本、不安装（macOS / 便携版）。
 *
 * 后端读的是 `plugins.updater.endpoints` 指向的同一份 latest.json，但只取
 * version / notes / pub_date —— 不碰平台资源、不下载、不校验签名。
 * 失败**抛错**（用 OrThrow 版本）：调用方要区分「检查失败」与「已是最新」，
 * 静默吞掉会让用户以为检查过了。
 */
export const checkManualUpdate = async (): Promise<ManualUpdateInfo> =>
  invokeTauriOrThrow<ManualUpdateInfo>('check_manual_update')

/**
 * 插件返回的 `Update` 在 Rust 侧持有资源，用完必须 `close()`，
 * 否则每次检查都会漏一份（用户反复点「检查更新」就是在漏）。
 */
let pending: Update | null = null

const releasePending = async (): Promise<void> => {
  const handle = pending
  pending = null
  if (!handle) return
  try {
    await handle.close()
  } catch {
    // 关不掉只是资源晚一点回收，不影响功能，别打扰用户
  }
}

/** 检查更新。返回 `null` = 已是最新；网络/清单出错会抛错，由调用方决定怎么提示。 */
export const checkForUpdate = async (): Promise<AvailableUpdate | null> => {
  await releasePending()
  const update = await checkPlugin()
  if (!update) return null
  pending = update
  return {
    version: update.version,
    currentVersion: update.currentVersion,
    notes: typeof update.body === 'string' ? update.body : '',
    date: update.date ?? null,
    mode: 'auto',
  }
}

/**
 * 下载并安装。Windows NSIS 下 `installMode = passive`：装完安装器自己退出，
 * 我们的进程也会随之结束 —— 所以调用前必须把该落盘的东西落完（见 App.tsx 的调用点）。
 *
 * `restartAfterInstall` 传 true（也是插件的默认值，这里写明是为了不依赖默认值）：
 * 安装器装完会**自己把应用重新拉起来**，所以界面文案说的是「会自动重新打开」而不是「请手动打开」。
 *
 * 句柄活到进程结束：用户「跳过此版本」后仍可能改主意点「立即更新」，
 * 所以跳过时**不**释放它（释放了再装就会报「没有待安装的更新」）。
 */
export const installUpdate = async (
  onProgress: (downloaded: number, total: number | null) => void
): Promise<void> => {
  const handle = pending
  if (!handle) throw new Error('installUpdate: 没有待安装的更新')
  let downloaded = 0
  let total: number | null = null
  await handle.downloadAndInstall((event) => {
    if (event.event === 'Started') {
      total = event.data.contentLength ?? null
    } else if (event.event === 'Progress') {
      downloaded += event.data.chunkLength
    } else {
      downloaded = total ?? downloaded
    }
    onProgress(downloaded, total)
  }, { restartAfterInstall: true })
  // 走到这里说明安装器已接过控制权；资源随进程结束一并回收，不必再 close
  pending = null
}
