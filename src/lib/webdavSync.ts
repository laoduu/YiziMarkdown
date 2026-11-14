/**
 * 云端缓存同步的统一入口：启动后台同步 / 设置页手动同步共用。
 * 同步范围固定为设置里的 WebDAV 根目录；不触碰用户目录与 root 之外缓存。
 */
import { syncCache, type WebdavSyncResult } from './webdav'
import { useSettingsStore } from '../stores/settingsStore'

export async function runCloudCacheSync(
  baseUrl: string,
  rootPath: string,
): Promise<WebdavSyncResult> {
  const mirrorAll = useSettingsStore.getState().webdavMirrorAll
  const result = await syncCache(baseUrl, rootPath, mirrorAll)
  const at = result.lastSyncAt > 0
    ? new Date(result.lastSyncAt * 1000).toISOString()
    : new Date().toISOString()
  useSettingsStore.getState().updateSettings({
    webdavLastSyncAt: at,
    webdavLastSyncRemoved: result.removed,
    webdavLastSyncDownloaded: result.downloaded,
    webdavLastSyncUpdated: result.updated,
    webdavLastSyncFailed: result.failed,
    webdavLastSyncTotal: result.total,
  })
  return result
}
