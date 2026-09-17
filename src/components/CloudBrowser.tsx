/**
 * 云端文件浏览器（WebDAV）—— 侧边栏第三个标签页。
 *
 * 只负责「浏览 + 打开 + 云端侧管理操作」；文档的读写（含图片镜像）由
 * `lib/webdav` 与 `App.tsx` 的打开/保存流程处理。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronRight, ChevronUp, Cloud, CloudOff, FileCode, Folder,
  Loader2, RefreshCw, FolderPlus, Pencil, Trash2, MoreHorizontal,
} from 'lucide-react'
import { useI18n } from '../i18n'
import Dialog from './Dialog'
import { useSettingsStore } from '../stores/settingsStore'
import {
  list, mkdir, move, remove,
  WEBDAV_DIR_CHANGED_EVENT,
  type RemoteEntry,
} from '../lib/webdav'
import { joinPath, parentPath, normalizeRemotePath, formatSize } from '../lib/remotePath'

const MARKDOWN_EXTS = ['.md', '.markdown', '.txt']

function isMarkdownFile(name: string): boolean {
  const lower = name.toLowerCase()
  return MARKDOWN_EXTS.some((ext) => lower.endsWith(ext))
}

type DialogKind = 'newFolder' | 'rename' | 'delete'

interface CloudBrowserProps {
  /** 打开云端文档（远程路径） */
  onOpenRemote: (remotePath: string) => void
  /** 未配置时引导到设置界面 */
  onRequestSettings: () => void
}

export default function CloudBrowser({ onOpenRemote, onRequestSettings }: CloudBrowserProps) {
  const { t } = useI18n()
  const baseUrl = useSettingsStore((s) => s.webdavBaseUrl)
  const rootPath = useSettingsStore((s) => s.webdavRootPath)
  const lastPath = useSettingsStore((s) => s.webdavLastPath)
  const setField = useSettingsStore((s) => s.setField)

  const [path, setPath] = useState(() => lastPath || rootPath || '/')
  const [entries, setEntries] = useState<RemoteEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ entry: RemoteEntry; x: number; y: number } | null>(null)
  const [dialog, setDialog] = useState<{ kind: DialogKind; entry?: RemoteEntry } | null>(null)
  const [nameInput, setNameInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async (target: string) => {
    if (!baseUrl) {
      setEntries([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await list(baseUrl, target)
      setEntries(result)
      setField('webdavLastPath', target)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setEntries([])
    }
    setLoading(false)
  }, [baseUrl, setField])

  // 服务器地址变化（首次配置 / 更换服务器）时也重新加载
  useEffect(() => {
    load(path)
  }, [path, load])

  // 「保存到云端」等外部动作新建了远程文件 → 自动刷新当前目录，
  // 否则用户得手动点刷新才能看到刚上传的文档
  useEffect(() => {
    const onDirChanged = (e: Event) => {
      const changed = (e as CustomEvent<string>).detail
      // 必须归一化后比较：目录条目的 path 带结尾斜杠（来自服务器 href），
      // 而 parentPath() 不带 —— 直接比较会永远不相等。
      // 只在正好浏览该目录时重拉，在别处浏览就不打扰。
      if (changed && normalizeRemotePath(changed) === normalizeRemotePath(path)) {
        load(path)
      }
    }
    window.addEventListener(WEBDAV_DIR_CHANGED_EVENT, onDirChanged)
    return () => window.removeEventListener(WEBDAV_DIR_CHANGED_EVENT, onDirChanged)
  }, [path, load])

  // 关闭右键菜单：点击任意处、滚动、按 Esc
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('click', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  // 只展示文件夹与 Markdown 文件（与本地文件树一致）
  const visible = useMemo(
    () => entries.filter((e) => e.isDir || isMarkdownFile(e.name)),
    [entries]
  )

  const goUp = useCallback(() => {
    setPath((p) => parentPath(p))
  }, [])

  const openEntry = useCallback((entry: RemoteEntry) => {
    if (entry.isDir) {
      setPath(entry.path)
    } else {
      onOpenRemote(entry.path)
    }
  }, [onOpenRemote])

  const openDialog = (kind: DialogKind, entry?: RemoteEntry) => {
    setDialogError(null)
    setDialog({ kind, entry })
    setNameInput(kind === 'rename' && entry ? entry.name : '')
    setMenu(null)
  }

  /** 目标目录：新建文件夹/重命名都在当前目录内 */
  const runDialog = async () => {
    if (!dialog || !baseUrl) return
    const name = nameInput.trim()
    setBusy(true)
    setDialogError(null)
    try {
      if (dialog.kind === 'newFolder') {
        if (!name) throw new Error(t('cloud.folderNamePlaceholder'))
        await mkdir(baseUrl, joinPath(path, name))
      } else if (dialog.kind === 'rename' && dialog.entry) {
        if (!name) throw new Error(t('cloud.newNamePlaceholder'))
        const target = joinPath(parentPath(dialog.entry.path), name)
        if (target !== dialog.entry.path) {
          await move(baseUrl, dialog.entry.path, target)
        }
      } else if (dialog.kind === 'delete' && dialog.entry) {
        await remove(baseUrl, dialog.entry.path)
      }
      setDialog(null)
      await load(path)
    } catch (e) {
      setDialogError(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }

  // ===== 未配置 =====
  if (!baseUrl) {
    return (
      <div className="py-8 px-4 text-center text-sm text-[var(--sidebar-text)]">
        <CloudOff size={24} className="mx-auto mb-2 opacity-40" />
        <p className="mb-3">{t('cloud.notConfigured')}</p>
        <button
          onClick={onRequestSettings}
          className="px-3 py-1.5 rounded-md text-xs font-medium
            bg-[var(--editor-accent)] text-white hover:opacity-90 transition-opacity"
        >
          {t('cloud.goToSettings')}
        </button>
      </div>
    )
  }

  // ===== 面包屑 =====
  const crumbs = path.split('/').filter(Boolean)

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* 路径导航 */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--editor-border)] text-xs text-[var(--sidebar-text)] shrink-0">
        <button
          onClick={goUp}
          disabled={path === '/'}
          title={t('sidebar.parentDir')}
          className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded transition-colors duration-100
            ${path === '/'
              ? 'opacity-30 cursor-default'
              : 'hover:bg-[var(--editor-hover)] hover:text-[var(--editor-text)] cursor-pointer'}`}
        >
          <ChevronUp size={14} />
          <span>..</span>
        </button>
        <div className="flex-1 flex items-center gap-0.5 overflow-x-auto whitespace-nowrap">
          <button
            onClick={() => setPath('/')}
            className="hover:text-[var(--editor-text)] shrink-0"
            title={t('cloud.root')}
          >
            <Cloud size={13} />
          </button>
          {crumbs.map((seg, i) => {
            const target = '/' + crumbs.slice(0, i + 1).join('/')
            return (
              <span key={target} className="flex items-center gap-0.5 shrink-0">
                <ChevronRight size={11} className="opacity-50" />
                <button
                  onClick={() => setPath(target)}
                  className={`hover:text-[var(--editor-text)] max-w-[110px] truncate ${
                    i === crumbs.length - 1 ? 'text-[var(--editor-text)] font-medium' : ''
                  }`}
                >
                  {seg}
                </button>
              </span>
            )
          })}
        </div>
        <button
          onClick={() => load(path)}
          disabled={loading}
          title={t('cloud.refresh')}
          className="p-0.5 rounded hover:bg-[var(--editor-hover)] hover:text-[var(--editor-text)] shrink-0"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
        <button
          onClick={() => openDialog('newFolder')}
          title={t('cloud.newFolder')}
          className="p-0.5 rounded hover:bg-[var(--editor-hover)] hover:text-[var(--editor-text)] shrink-0"
        >
          <FolderPlus size={13} />
        </button>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-auto min-h-0">
        {loading && entries.length === 0 ? (
          <div className="py-8 text-center text-sm text-[var(--sidebar-text)]">
            <Loader2 size={18} className="mx-auto mb-2 animate-spin opacity-50" />
            {t('cloud.loading')}
          </div>
        ) : error ? (
          <div className="py-6 px-3 text-center text-xs">
            <p className="text-red-500 break-words mb-2">{error}</p>
            <button
              onClick={() => load(path)}
              className="text-[var(--editor-accent)] hover:underline"
            >
              {t('cloud.retry')}
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="py-8 px-4 text-center text-sm text-[var(--sidebar-text)]">
            <Folder size={24} className="mx-auto mb-2 opacity-30" />
            <p>{t('cloud.empty')}</p>
          </div>
        ) : (
          <div className="py-1">
            {visible.map((entry) => (
              <CloudRow
                key={entry.path}
                entry={entry}
                onOpen={() => openEntry(entry)}
                onMenu={(x, y) => setMenu({ entry, x, y })}
              />
            ))}
          </div>
        )}
      </div>

      {/* 右键 / 更多 菜单 */}
      {menu && (
        <div
          ref={menuRef}
          className="fixed z-[9500] min-w-[140px] py-1 rounded-lg shadow-xl
            border border-[var(--editor-border)] bg-[var(--editor-bg)] text-[var(--editor-text)]"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {!menu.entry.isDir && (
            <MenuItem icon={<FileCode size={13} />} label={t('cloud.open')} onClick={() => { onOpenRemote(menu.entry.path); setMenu(null) }} />
          )}
          <MenuItem icon={<Pencil size={13} />} label={t('cloud.rename')} onClick={() => openDialog('rename', menu.entry)} />
          <MenuItem icon={<Trash2 size={13} />} label={t('cloud.delete')} danger onClick={() => openDialog('delete', menu.entry)} />
        </div>
      )}

      {/* 新建文件夹 / 重命名 */}
      <Dialog
        open={dialog?.kind === 'newFolder' || dialog?.kind === 'rename'}
        onClose={() => setDialog(null)}
        title={dialog?.kind === 'rename' ? t('cloud.rename') : t('cloud.newFolder')}
        width={320}
      >
        <input
          autoFocus
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') runDialog() }}
          placeholder={dialog?.kind === 'rename' ? t('cloud.newNamePlaceholder') : t('cloud.folderNamePlaceholder')}
          className="settings-input w-full mb-3"
        />
        {dialogError && <p className="text-[11px] text-red-500 mb-2 break-words">{dialogError}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={() => setDialog(null)} className="settings-btn-secondary">{t('cloud.cancel')}</button>
          <button
            onClick={runDialog}
            disabled={busy || !nameInput.trim()}
            className="settings-btn-primary"
            style={busy || !nameInput.trim() ? { opacity: 0.5 } : undefined}
          >
            {dialog?.kind === 'rename' ? t('cloud.renameConfirm') : t('cloud.create')}
          </button>
        </div>
      </Dialog>

      {/* 删除确认 */}
      <Dialog
        open={dialog?.kind === 'delete'}
        onClose={() => setDialog(null)}
        title={t('cloud.deleteConfirmTitle')}
        width={340}
      >
        <p className="text-[13px] text-[var(--editor-text)] mb-1">
          {t('cloud.deleteConfirmBody', { name: dialog?.entry?.name ?? '' })}
        </p>
        {dialog?.entry?.isDir && (
          <p className="text-[12px] text-red-500 mb-1">
            {t('cloud.deleteConfirmFolder', { name: dialog.entry.name })}
          </p>
        )}
        {dialogError && <p className="text-[11px] text-red-500 mb-2 break-words">{dialogError}</p>}
        <div className="flex justify-end gap-2 mt-3">
          <button onClick={() => setDialog(null)} className="settings-btn-secondary">{t('cloud.cancel')}</button>
          <button
            onClick={runDialog}
            disabled={busy}
            className="settings-btn-primary"
            style={{ background: '#dc2626', ...(busy ? { opacity: 0.5 } : {}) }}
          >
            {t('cloud.delete')}
          </button>
        </div>
      </Dialog>
    </div>
  )
}

function MenuItem({ icon, label, onClick, danger }: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left
        hover:bg-[var(--editor-hover)] ${danger ? 'text-red-500' : 'text-[var(--editor-text)]'}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

function CloudRow({ entry, onOpen, onMenu }: {
  entry: RemoteEntry
  onOpen: () => void
  onMenu: (x: number, y: number) => void
}) {
  return (
    <div
      onClick={onOpen}
      onContextMenu={(e) => {
        e.preventDefault()
        onMenu(Math.min(e.clientX, window.innerWidth - 160), Math.min(e.clientY, window.innerHeight - 100))
      }}
      title={entry.isDir ? entry.name : `${entry.name} · ${formatSize(entry.size)}`}
      className="group flex items-center gap-1 py-1 px-2 cursor-pointer
        transition-colors duration-100 hover:bg-[var(--editor-hover)] text-[var(--editor-text)]"
    >
      {entry.isDir
        ? <Folder size={14} className="text-amber-500 shrink-0" />
        : <FileCode size={14} className="text-[var(--editor-accent)] opacity-70 shrink-0" />}
      <span className="flex-1 truncate text-sm">{entry.name}</span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
          onMenu(Math.min(r.left, window.innerWidth - 160), r.bottom + 2)
        }}
        className="p-0.5 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100
          text-[var(--sidebar-text)] hover:bg-[var(--editor-bg)] shrink-0"
      >
        <MoreHorizontal size={13} />
      </button>
    </div>
  )
}
