/**
 * 「保存到云端」对话框 —— 目录浏览器式选点，替代手输完整路径。
 *
 * 只负责「选目录 + 起文件名」：面包屑 / 上级键导航，点文件夹进入，
 * 点文件把名字带进输入框（提示重名），内联新建文件夹。
 * 真正的上传（含图片镜像、ETag 冲突检测）仍由 App 的 runCloudSave 处理。
 */
import { useCallback, useEffect, useState } from 'react'
import { ChevronUp, Cloud, FileCode, Folder, FolderPlus, Loader2, RefreshCw } from 'lucide-react'
import Dialog from './Dialog'
import { useI18n } from '../i18n'
import { useSettingsStore } from '../stores/settingsStore'
import { list, mkdir, type RemoteEntry } from '../lib/webdav'
import { joinPath, parentPath } from '../lib/remotePath'

/** 与 CloudBrowser 一致：只把文件夹与 Markdown/文本文件作为可选条目展示 */
const MD_EXTS = ['.md', '.markdown', '.txt']

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
  const baseUrl = useSettingsStore((s) => s.webdavBaseUrl)

  // 从初始路径拆出目录与文件名（远程路径恒以 / 开头）
  const [dir, setDir] = useState('/')
  const [name, setName] = useState('')
  const [entries, setEntries] = useState<RemoteEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  // 新建文件夹：内联在列表顶部的一行输入（Esc/失焦取消，Enter 创建）
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  // 每次打开都从 initialPath 重置（App 在打开前已按「原文档 / 智能推导」备好默认名）
  useEffect(() => {
    if (!open) return
    const sep = initialPath.lastIndexOf('/')
    setDir(sep > 0 ? initialPath.slice(0, sep) || '/' : '/')
    setName(initialPath.slice(sep + 1))
    setCreating(false)
  }, [open, initialPath])

  const load = useCallback(async (target: string) => {
    if (!baseUrl) return
    setLoading(true)
    setListError(null)
    try {
      setEntries(await list(baseUrl, target))
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [baseUrl])

  useEffect(() => {
    if (!open) return
    load(dir)
  }, [open, dir, load])

  const crumbs = dir.split('/').filter(Boolean)

  const dirs = entries.filter((e) => e.isDir).sort((a, b) => a.name.localeCompare(b.name))
  const files = entries
    .filter((e) => !e.isDir && MD_EXTS.some((ext) => e.name.toLowerCase().endsWith(ext)))
    .sort((a, b) => a.name.localeCompare(b.name))

  const nameOk = name.replace(/[\\/]/g, '').trim().length > 0

  const confirm = () => {
    if (!nameOk || busy) return
    onConfirm(joinPath(dir, name.replace(/[\\/]/g, '').trim()))
  }

  const createFolder = async () => {
    const n = newName.trim()
    if (!n || !baseUrl) return
    try {
      await mkdir(baseUrl, joinPath(dir, n))
      setCreating(false)
      setNewName('')
      load(dir)
    } catch (e) {
      // 复用列表错误位显示创建失败，用户改个名重试即可
      setListError(e instanceof Error ? e.message : String(e))
    }
  }

  const rowBase = 'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] text-left'
  const rowHover = 'hover:bg-[var(--editor-hover)] cursor-pointer'

  return (
    <Dialog open={open} onClose={onClose} title={t('cloud.saveToCloudTitle')} width={480}>
      {/* 工具条：上级 + 根目录 + 面包屑 + 刷新/新建 */}
      <div className="flex items-center gap-1 mb-2 text-[var(--sidebar-text)]">
        <button
          onClick={() => setDir((p) => parentPath(p))}
          disabled={dir === '/' || loading}
          title={t('cloud.parentDir')}
          className={`p-1 rounded ${dir === '/' ? 'opacity-30 cursor-default' : 'hover:bg-[var(--editor-hover)] hover:text-[var(--editor-text)]'}`}
        >
          <ChevronUp size={14} />
        </button>
        <button onClick={() => setDir('/')} title={t('cloud.root')} className="p-1 rounded hover:bg-[var(--editor-hover)] hover:text-[var(--editor-text)] shrink-0">
          <Cloud size={13} />
        </button>
        <div className="flex-1 flex items-center gap-0.5 min-w-0 overflow-hidden text-[12px]">
          {crumbs.map((seg, i) => (
            <span key={i} className="flex items-center gap-0.5 min-w-0 shrink">
              {i > 0 && <span className="opacity-40 shrink-0">/</span>}
              <button
                onClick={() => setDir('/' + crumbs.slice(0, i + 1).join('/'))}
                className="truncate max-w-[110px] px-1 rounded hover:bg-[var(--editor-hover)] hover:text-[var(--editor-text)]"
                title={'/' + crumbs.slice(0, i + 1).join('/')}
              >
                {seg}
              </button>
            </span>
          ))}
          {crumbs.length === 0 && <span className="px-1 opacity-60">/</span>}
        </div>
        <button onClick={() => setCreating((v) => !v)} title={t('cloud.newFolder')} className="p-1 rounded hover:bg-[var(--editor-hover)] hover:text-[var(--editor-text)]">
          <FolderPlus size={14} />
        </button>
        <button onClick={() => load(dir)} disabled={loading} title={t('cloud.refresh')} className="p-1 rounded hover:bg-[var(--editor-hover)] hover:text-[var(--editor-text)] disabled:opacity-30">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* 目录列表 */}
      <div className="h-52 overflow-y-auto border border-[var(--editor-border)] rounded-lg p-1 mb-3">
        {creating && (
          <div className="flex items-center gap-2 px-2 py-1.5">
            <Folder size={14} className="text-[var(--sidebar-text)] shrink-0" />
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') createFolder()
                else if (e.key === 'Escape') { setCreating(false); setNewName('') }
              }}
              onBlur={createFolder}
              placeholder={t('cloud.folderNamePlaceholder')}
              className="settings-input flex-1 h-7"
            />
          </div>
        )}
        {loading && !entries.length ? (
          <div className="flex items-center justify-center h-full gap-2 text-[12px] text-[var(--sidebar-text)]">
            <Loader2 size={14} className="animate-spin" />{t('cloud.loading')}
          </div>
        ) : listError ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-[12px] text-red-500">
            <span className="break-all px-4 text-center">{listError}</span>
            <button onClick={() => load(dir)} className="settings-btn-secondary h-7 text-[12px]">{t('cloud.retry')}</button>
          </div>
        ) : !dirs.length && !files.length && !creating ? (
          <div className="flex items-center justify-center h-full text-[12px] text-[var(--sidebar-text)]">{t('cloud.empty')}</div>
        ) : (
          <>
            {dirs.map((e) => (
              <button key={e.path} onClick={() => setDir(e.path)} className={`${rowBase} ${rowHover}`}>
                <Folder size={14} className="shrink-0 opacity-70" />
                <span className="truncate">{e.name}</span>
              </button>
            ))}
            {files.map((e) => (
              <button key={e.path} onClick={() => setName(e.name)} title={e.name} className={`${rowBase} ${rowHover}`}>
                <FileCode size={14} className="shrink-0 opacity-50" />
                <span className="truncate">{e.name}</span>
              </button>
            ))}
          </>
        )}
      </div>

      {/* 文件名 */}
      <label className="text-[12px] text-[var(--editor-text)] block mb-1">{t('cloud.fileNameLabel')}</label>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') confirm() }}
        className="settings-input w-full mb-2"
        style={{ fontFamily: 'var(--font-mono)' }}
      />
      <p className="text-[11px] text-[var(--sidebar-text)] mb-2">{t('cloud.saveToCloudHint')}</p>
      {error && <p className="text-[11px] text-red-500 mb-2 break-words">{error}</p>}
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
