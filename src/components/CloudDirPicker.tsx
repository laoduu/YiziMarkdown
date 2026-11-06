/**
 * 云端目录选择器 —— 「保存到云端」与「移动」弹窗共用的目录浏览区。
 *
 * 只负责选目录：上级 / 根目录 / 主目录 / 面包屑导航、刷新、内联新建文件夹。
 * 文件名输入或移动确认等业务动作由外层弹窗处理，避免两套弹窗各写一份列表。
 */
import { useCallback, useEffect, useState } from 'react'
import { ChevronUp, Cloud, FileCode, Folder, FolderPlus, Home, Loader2, RefreshCw } from 'lucide-react'
import { useI18n } from '../i18n'
import { useSettingsStore } from '../stores/settingsStore'
import { list, mkdir, type RemoteEntry } from '../lib/webdav'
import { joinPath, normalizeRemotePath, parentPath } from '../lib/remotePath'

/** 只把文件夹与 Markdown/文本文件作为可选条目展示 */
const MD_EXTS = ['.md', '.markdown', '.txt']

interface CloudDirPickerProps {
  /** 当前目录 */
  dir: string
  onDirChange: (dir: string) => void
  /** 点击文件时回调；不传则只展示文件夹（移动目标只能选目录） */
  onFileClick?: (entry: RemoteEntry) => void
  /** 禁用的目录（例如移动时不能进入源目录） */
  isDirDisabled?: (dir: string) => boolean
}

export default function CloudDirPicker({ dir, onDirChange, onFileClick, isDirDisabled }: CloudDirPickerProps) {
  const { t } = useI18n()
  const baseUrl = useSettingsStore((s) => s.webdavBaseUrl)
  const rootPath = useSettingsStore((s) => s.webdavRootPath)

  const [entries, setEntries] = useState<RemoteEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  // 新建文件夹：内联在列表顶部的一行输入（Esc/失焦取消，Enter 创建）
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

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
    load(dir)
  }, [dir, load])

  const crumbs = dir.split('/').filter(Boolean)

  const dirs = entries.filter((e) => e.isDir).sort((a, b) => a.name.localeCompare(b.name))
  const files = entries
    .filter((e) => !e.isDir && MD_EXTS.some((ext) => e.name.toLowerCase().endsWith(ext)))
    .sort((a, b) => a.name.localeCompare(b.name))

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

  const rowBase = 'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[0.75rem] text-left'
  const rowHover = 'hover:bg-[var(--editor-hover)] cursor-pointer'

  return (
    <>
      {/* 工具条：上级 + 根目录 + 主目录 + 面包屑 + 刷新/新建 */}
      <div className="flex items-center gap-1 mb-2 text-[var(--sidebar-text)]">
        <button
          onClick={() => onDirChange(parentPath(dir))}
          disabled={dir === '/' || loading}
          title={t('cloud.parentDir')}
          className={`p-1 rounded ${dir === '/' ? 'opacity-30 cursor-default' : 'hover:bg-[var(--editor-hover)] hover:text-[var(--editor-text)]'}`}
        >
          <ChevronUp size={14} />
        </button>
        <button
          onClick={() => onDirChange('/')}
          title={t('cloud.root')}
          className="p-1 rounded hover:bg-[var(--editor-hover)] hover:text-[var(--editor-text)] shrink-0"
        >
          <Cloud size={13} />
        </button>
        <button
          onClick={() => onDirChange(normalizeRemotePath(rootPath || '/'))}
          title={t('cloud.home')}
          className="p-1 rounded hover:bg-[var(--editor-hover)] hover:text-[var(--editor-text)] shrink-0"
        >
          <Home size={13} />
        </button>
        <div className="flex-1 flex items-center gap-0.5 min-w-0 overflow-hidden text-[0.75rem]">
          {crumbs.map((seg, i) => (
            <span key={i} className="flex items-center gap-0.5 min-w-0 shrink">
              {i > 0 && <span className="opacity-40 shrink-0">/</span>}
              <button
                onClick={() => onDirChange('/' + crumbs.slice(0, i + 1).join('/'))}
                className="truncate max-w-[110px] px-1 rounded hover:bg-[var(--editor-hover)] hover:text-[var(--editor-text)]"
                title={'/' + crumbs.slice(0, i + 1).join('/')}
              >
                {seg}
              </button>
            </span>
          ))}
          {crumbs.length === 0 && <span className="px-1 opacity-60">/</span>}
        </div>
        <button
          onClick={() => setCreating((v) => !v)}
          title={t('cloud.newFolder')}
          className="p-1 rounded hover:bg-[var(--editor-hover)] hover:text-[var(--editor-text)]"
        >
          <FolderPlus size={14} />
        </button>
        <button
          onClick={() => load(dir)}
          disabled={loading}
          title={t('cloud.refresh')}
          className="p-1 rounded hover:bg-[var(--editor-hover)] hover:text-[var(--editor-text)] disabled:opacity-30"
        >
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
          <div className="flex items-center justify-center h-full gap-2 text-[0.75rem] text-[var(--sidebar-text)]">
            <Loader2 size={14} className="animate-spin" />{t('cloud.loading')}
          </div>
        ) : listError ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-[0.75rem] text-red-500">
            <span className="break-all px-4 text-center">{listError}</span>
            <button onClick={() => load(dir)} className="settings-btn-secondary h-7 text-[0.75rem]">{t('cloud.retry')}</button>
          </div>
        ) : !dirs.length && !files.length && !creating ? (
          <div className="flex items-center justify-center h-full text-[0.75rem] text-[var(--sidebar-text)]">{t('cloud.empty')}</div>
        ) : (
          <>
            {dirs.map((e) => {
              const disabled = isDirDisabled?.(e.path) ?? false
              return (
                <button
                  key={e.path}
                  onClick={() => { if (!disabled) onDirChange(normalizeRemotePath(e.path)) }}
                  disabled={disabled}
                  title={disabled ? t('cloud.moveIntoSelf') : e.name}
                  className={`${rowBase} ${disabled ? 'opacity-40 cursor-default' : rowHover}`}
                >
                  <Folder size={14} className="shrink-0 opacity-70" />
                  <span className="truncate">{e.name}</span>
                </button>
              )
            })}
            {onFileClick && files.map((e) => (
              <button key={e.path} onClick={() => onFileClick(e)} title={e.name} className={`${rowBase} ${rowHover}`}>
                <FileCode size={14} className="shrink-0 opacity-50" />
                <span className="truncate">{e.name}</span>
              </button>
            ))}
          </>
        )}
      </div>
    </>
  )
}
