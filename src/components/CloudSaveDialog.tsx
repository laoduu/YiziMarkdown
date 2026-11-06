/**
 * 「保存到云端」对话框 —— 目录浏览器式选点，替代手输完整路径。
 *
 * 只负责「选目录 + 起文件名」：目录浏览区由 CloudDirPicker 提供（与移动弹窗共用），
 * 点文件把名字带进输入框（提示重名）。
 * 真正的上传（含图片镜像、ETag 冲突检测）仍由 App 的 runCloudSave 处理。
 */
import { useEffect, useState } from 'react'
import Dialog from './Dialog'
import CloudDirPicker from './CloudDirPicker'
import { useI18n } from '../i18n'
import { joinPath } from '../lib/remotePath'

interface CloudSaveDialogProps {
  open: boolean
  /** 初始完整远程路径（含文件名） */
  initialPath: string
  busy: boolean
  error: string | null
  onClose: () => void
  /** 确认保存：回传组合好的完整远程路径 */
  onConfirm: (fullPath: string) => void
}

export default function CloudSaveDialog({ open, initialPath, busy, error, onClose, onConfirm }: CloudSaveDialogProps) {
  const { t } = useI18n()

  // 从初始路径拆出目录与文件名（远程路径恒以 / 开头）
  const [dir, setDir] = useState('/')
  const [name, setName] = useState('')

  // 每次打开都从 initialPath 重置（App 在打开前已按「原文档 / 智能推导」备好默认名）
  useEffect(() => {
    if (!open) return
    const sep = initialPath.lastIndexOf('/')
    setDir(sep > 0 ? initialPath.slice(0, sep) || '/' : '/')
    setName(initialPath.slice(sep + 1))
  }, [open, initialPath])

  const nameOk = name.replace(/[\\/]/g, '').trim().length > 0

  const confirm = () => {
    if (!nameOk || busy) return
    onConfirm(joinPath(dir, name.replace(/[\\/]/g, '').trim()))
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('cloud.saveToCloudTitle')} width={480}>
      <CloudDirPicker
        dir={dir}
        onDirChange={setDir}
        onFileClick={(entry) => setName(entry.name)}
      />

      {/* 文件名 */}
      <label className="text-[0.75rem] text-[var(--editor-text)] block mb-1">{t('cloud.fileNameLabel')}</label>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') confirm() }}
        className="settings-input w-full mb-2"
        style={{ fontFamily: 'var(--font-mono)' }}
      />
      <p className="text-[0.6875rem] text-[var(--sidebar-text)] mb-2">{t('cloud.saveToCloudHint')}</p>
      {error && <p className="text-[0.6875rem] text-red-500 mb-2 break-words">{error}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="settings-btn-secondary">{t('cloud.cancel')}</button>
        <button
          onClick={confirm}
          disabled={busy || !nameOk}
          className="settings-btn-primary"
          style={busy || !nameOk ? { opacity: 0.5 } : undefined}
        >
          {busy ? t('cloud.saving') : t('cloud.upload')}
        </button>
      </div>
    </Dialog>
  )
}
