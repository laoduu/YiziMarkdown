/**
 * 「移动文件 / 目录」对话框 —— 与「保存到云端」共用 CloudDirPicker 的弹窗样式。
 *
 * 只允许选择目录：起始位置是被移动条目的父目录；源目录及其子目录不可作为目标，
 * 选回原目录时禁用确认。真正执行 WebDAV MOVE 由 lib/webdav 的 move 处理。
 */
import { useEffect, useState } from 'react'
import Dialog from './Dialog'
import CloudDirPicker from './CloudDirPicker'
import { useI18n } from '../i18n'
import { useSettingsStore } from '../stores/settingsStore'
import { move, type RemoteEntry } from '../lib/webdav'
import { joinPath, normalizeRemotePath, parentPath, isRemotePathWithin } from '../lib/remotePath'

interface CloudMoveDialogProps {
  /** 待移动的条目；为 null 时关闭 */
  entry: RemoteEntry | null
  onClose: () => void
  /** 移动成功后回调目标目录，供浏览器刷新并展开 */
  onMoved: (destDir: string) => void | Promise<void>
}

export default function CloudMoveDialog({ entry, onClose, onMoved }: CloudMoveDialogProps) {
  const { t } = useI18n()
  const baseUrl = useSettingsStore((s) => s.webdavBaseUrl)
  // 目录覆盖值按条目缓存：首次打开时直接用父目录，避免先请求一次服务器根目录
  const [dirState, setDirState] = useState<{ entryPath: string; dir: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const source = entry ? normalizeRemotePath(entry.path) : '/'
  const originalDir = entry ? parentPath(source) : '/'
  const dir = entry && dirState?.entryPath === entry.path ? dirState.dir : originalDir
  const setDir = (next: string) => {
    if (entry) setDirState({ entryPath: entry.path, dir: next })
  }

  useEffect(() => {
    setDirState(null)
    setError(null)
    setBusy(false)
  }, [entry])

  const sameDir = normalizeRemotePath(dir) === originalDir
  const intoSelf = !!entry?.isDir && isRemotePathWithin(dir, source)
  const canMove = !!entry && !sameDir && !intoSelf && !busy

  const confirm = async () => {
    if (!entry || !canMove || !baseUrl) return
    setBusy(true)
    setError(null)
    try {
      await move(baseUrl, entry.path, joinPath(dir, entry.name))
      await onMoved(normalizeRemotePath(dir))
    } catch (e) {
      setError(t('cloud.moveFailed', { msg: e instanceof Error ? e.message : String(e) }))
    } finally {
      setBusy(false)
    }
  }

  const invalidHint = sameDir
    ? t('cloud.moveSameDir')
    : intoSelf ? t('cloud.moveIntoSelf') : null

  return (
    <Dialog
      open={!!entry}
      onClose={onClose}
      title={entry?.isDir ? t('cloud.moveFolder') : t('cloud.moveFile')}
      width={480}
    >
      <p className="text-[0.75rem] text-[var(--editor-text)] mb-2 break-words">
        {t('cloud.moveHint', { name: entry?.name ?? '' })}
      </p>
      <CloudDirPicker
        dir={dir}
        onDirChange={setDir}
        isDirDisabled={(d) => (entry?.isDir ? isRemotePathWithin(d, source) : false)}
      />
      {invalidHint && <p className="text-[0.6875rem] text-amber-600 mb-2">{invalidHint}</p>}
      {error && <p className="text-[0.6875rem] text-red-500 mb-2 break-words">{error}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="settings-btn-secondary">{t('cloud.cancel')}</button>
        <button
          onClick={confirm}
          disabled={!canMove}
          className="settings-btn-primary"
          style={!canMove ? { opacity: 0.5 } : undefined}
        >
          {busy ? t('cloud.moving') : t('cloud.moveConfirm')}
        </button>
      </div>
    </Dialog>
  )
}
