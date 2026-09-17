/**
 * 统一的保存出口。
 *
 * 三处保存入口（Ctrl+S / 自动保存 / 另存为）都走这里，使
 * 「写本地缓存 → PUT 云端 → 标记已保存」的顺序与失败处理只有一份实现。
 *
 * 为什么必须收敛：原先自动保存用 `invokeTauri`（吞掉错误返回 null）且不 await
 * 就无条件 `markAsSaved()` —— 离线或 401 时会显示"已保存"但实际没写成功。
 * 云端文档下这个缺陷会直接造成静默丢数据。
 */
import { invokeTauriOrThrow } from './tauri'
import { save as saveToCloud } from './webdav'
import { useEditorStore, type FileTab } from '../stores/editorStore'
import { useSettingsStore } from '../stores/settingsStore'

export interface SaveOutcome {
  ok: boolean
  /** 远程已被他人修改，本次未写入 */
  conflict: boolean
  error?: string
  imagesUploaded: number
  imagesFailed: number
}

/** 同一远程路径同时只允许一次 PUT —— 慢网络下自动保存的防抖可能叠加 */
const inFlight = new Set<string>()

/** 已检出远程冲突的路径：用户解决前不再自动重试，避免反复 412 与提示轰炸 */
const conflicted = new Set<string>()

export function isConflicted(remotePath: string): boolean {
  return conflicted.has(remotePath)
}

/** 用户已就冲突做出选择后调用，恢复自动保存 */
export function markConflictResolved(remotePath: string): void {
  conflicted.delete(remotePath)
}

/** 文件所在目录（图片上传的本地来源） */
export function dirOf(filePath: string): string | null {
  const sep = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'))
  return sep > 0 ? filePath.substring(0, sep) : null
}

/**
 * 保存一个 tab。
 *
 * 先写本地缓存（保证本地不丢），再 PUT 云端；**两步都成功才标记已保存**。
 * 失败一律保持 `isSaved=false`，绝不假装成功。
 *
 * @param opts.auto 自动保存调用：遇到已知冲突直接跳过，不重复提示
 */
export async function saveActiveTab(
  tab: FileTab,
  opts: { auto?: boolean } = {}
): Promise<SaveOutcome> {
  const failed = (error: string): SaveOutcome => ({
    ok: false, conflict: false, error, imagesUploaded: 0, imagesFailed: 0,
  })

  if (!tab.filePath) return failed('no-path')

  const store = useEditorStore.getState()
  const remote = tab.remote

  if (remote) {
    // 已知冲突且是自动保存 → 静默跳过，等用户按 Ctrl+S 决策
    if (opts.auto && conflicted.has(remote.path)) {
      return { ok: false, conflict: true, imagesUploaded: 0, imagesFailed: 0 }
    }
    if (inFlight.has(remote.path)) {
      return failed('in-flight')
    }
    inFlight.add(remote.path)
  }

  try {
    // 云端文档：PUT 是唯一的权威写入 —— 本地镜像由 Rust 侧 `webdav_save` 一并维护，
    // 这样本地缓存目录被清空也不会阻断云端保存（镜像是可丢弃的派生物）。
    if (remote) {
      const baseUrl = useSettingsStore.getState().webdavBaseUrl
      if (!baseUrl) return failed('not-configured')

      const result = await saveToCloud(
        baseUrl,
        remote.path,
        tab.content,
        remote.etag,
        false,
        dirOf(tab.filePath)
      )

      if (result.conflict) {
        conflicted.add(remote.path)
        return { ok: false, conflict: true, imagesUploaded: 0, imagesFailed: 0 }
      }

      conflicted.delete(remote.path)
      // 刷新 ETag，避免下次保存误判冲突
      store.setTabRemote(tab.id, { path: remote.path, etag: result.etag })
      store.markTabSaved(tab.id)
      return {
        ok: true,
        conflict: false,
        imagesUploaded: result.imagesUploaded ?? 0,
        imagesFailed: result.imagesFailed ?? 0,
      }
    }

    // 本地文件：直接写盘
    await invokeTauriOrThrow<void>('save_file', { path: tab.filePath, content: tab.content })
    store.markTabSaved(tab.id)
    return { ok: true, conflict: false, imagesUploaded: 0, imagesFailed: 0 }
  } catch (e) {
    return failed(e instanceof Error ? e.message : String(e))
  } finally {
    if (remote) inFlight.delete(remote.path)
  }
}
