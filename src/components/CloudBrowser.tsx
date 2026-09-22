/**
 * 云端文件浏览器（WebDAV）—— 侧边栏第三个标签页。
 *
 * 只负责「浏览 + 打开 + 云端侧管理操作」；文档的读写（含图片镜像）由
 * `lib/webdav` 与 `App.tsx` 的打开/保存流程处理。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronRight, ChevronUp, Cloud, CloudOff, FileCode, Folder, FolderOpen,
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

/** 只展示文件夹与 Markdown 文件（与本地文件树一致） */
function isVisible(entry: RemoteEntry): boolean {
  return entry.isDir || isMarkdownFile(entry.name)
}

/** 面包屑最多原样显示的层级数，超出则把上级折成「…」 */
const MAX_CRUMBS = 2

type DialogKind = 'newFolder' | 'rename' | 'delete'

/** 摊平后的树行：目录展开后其子项以更大的 depth 插在后面 */
type TreeRow =
  | { kind: 'entry'; key: string; depth: number; entry: RemoteEntry }
  | { kind: 'loading'; key: string; depth: number }
  | { kind: 'error'; key: string; depth: number; message: string }

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

  // ===== 目录树（Obsidian 式就地展开）=====
  /** 已展开的目录路径 */
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  /** 子目录内容缓存：展开过的目录不重复请求（无缓存 = 正在拉取） */
  const [children, setChildren] = useState<Record<string, RemoteEntry[]>>({})
  /** 子目录拉取失败信息（就地显示，不覆盖整个列表） */
  const [dirErrors, setDirErrors] = useState<Record<string, string>>({})
  const [crumbsOpen, setCrumbsOpen] = useState(false)

  const load = useCallback(async (target: string) => {
    if (!baseUrl) {
      setEntries([])
      return
    }
    // 目录内容可能已变（刷新、切换目录、增删改）→ 已展开子树的缓存一律作废，
    // 否则重命名/删除后展开的旧列表会继续显示已经不存在的条目
    setExpanded(new Set())
    setChildren({})
    setDirErrors({})
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

  // 关闭面包屑「…」下拉：点击任意处、按 Esc
  useEffect(() => {
    if (!crumbsOpen) return
    const close = () => setCrumbsOpen(false)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('click', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [crumbsOpen])

  // 只展示文件夹与 Markdown 文件（与本地文件树一致）
  const visible = useMemo(() => entries.filter(isVisible), [entries])

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

  /** 展开 / 收起某个目录；首次展开时按需拉取子项（懒加载，不递归预取） */
  const toggleDir = useCallback(async (dir: string) => {
    if (expanded.has(dir)) {
      setExpanded((prev) => {
        const next = new Set(prev)
        next.delete(dir)
        return next
      })
      return
    }
    setExpanded((prev) => new Set(prev).add(dir))
    if (children[dir]) return
    // 先清掉上次的失败记录：重新展开 = 重试，应回到「加载中」而不是继续显示旧错误
    setDirErrors((prev) => {
      const next = { ...prev }
      delete next[dir]
      return next
    })
    try {
      const result = await list(baseUrl, dir)
      setChildren((prev) => ({ ...prev, [dir]: result }))
    } catch (e) {
      setDirErrors((prev) => ({ ...prev, [dir]: e instanceof Error ? e.message : String(e) }))
    }
  }, [baseUrl, children, expanded])

  /** 当前目录 + 已展开子树 → 待渲染的行（depth 决定缩进与引导线数量） */
  const rows = useMemo(() => {
    const out: TreeRow[] = []
    const walk = (items: RemoteEntry[], depth: number) => {
      for (const item of items) {
        out.push({ kind: 'entry', key: item.path, depth, entry: item })
        if (!item.isDir || !expanded.has(item.path)) continue
        const failure = dirErrors[item.path]
        if (failure) {
          out.push({ kind: 'error', key: `${item.path}#error`, depth: depth + 1, message: failure })
          continue
        }
        const kids = children[item.path]
        if (!kids) {
          out.push({ kind: 'loading', key: `${item.path}#loading`, depth: depth + 1 })
          continue
        }
        walk(kids.filter(isVisible), depth + 1)
      }
    }
    walk(visible, 0)
    return out
  }, [visible, expanded, children, dirErrors])

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
  // 层级深时把上级折成「…」：常态只留当前目录名，从根上消掉横向滚动条
  const collapsed = crumbs.length > MAX_CRUMBS
  const shownCrumbs = (collapsed ? crumbs.slice(-1) : crumbs)
    .map((seg, i) => ({ seg, depth: collapsed ? crumbs.length : i + 1 }))
  const hiddenCrumbs = collapsed
    ? crumbs.slice(0, -1).map((seg, i) => ({ seg, depth: i + 1 }))
    : []

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
        <div className="flex-1 flex items-center gap-0.5 min-w-0">
          <button
            onClick={() => setPath('/')}
            className="hover:text-[var(--editor-text)] shrink-0"
            title={t('cloud.root')}
          >
            <Cloud size={13} />
          </button>
          {hiddenCrumbs.length > 0 && (
            <div className="relative shrink-0">
              <button
                // 必须阻止冒泡：否则同一次点击会被下面的 window 监听立刻关掉
                onClick={(e) => { e.stopPropagation(); setCrumbsOpen((v) => !v) }}
                title={path}
                className="flex items-center gap-0.5 px-0.5 rounded hover:bg-[var(--editor-hover)] hover:text-[var(--editor-text)]"
              >
                <span>…</span>
                <ChevronRight size={11} className="opacity-50" />
              </button>
              {crumbsOpen && (
                <div className="absolute left-0 top-full mt-0.5 z-[9500] min-w-[120px] max-w-[200px] py-1
                  rounded-lg shadow-xl border border-[var(--editor-border)] bg-[var(--editor-bg)] text-[var(--editor-text)]">
                  {hiddenCrumbs.map((c) => (
                    <button
                      key={c.depth}
                      onClick={() => {
                        setPath('/' + crumbs.slice(0, c.depth).join('/'))
                        setCrumbsOpen(false)
                      }}
                      className="w-full px-3 py-1 text-left text-xs truncate hover:bg-[var(--editor-hover)]"
                    >
                      {c.seg}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {shownCrumbs.map((c) => {
            const isCurrent = c.depth === crumbs.length
            return (
              <span
                key={c.depth}
                className={`flex items-center gap-0.5 ${isCurrent ? 'min-w-0 flex-1' : 'shrink-0'}`}
              >
                <ChevronRight size={11} className="opacity-50 shrink-0" />
                <button
                  onClick={() => setPath('/' + crumbs.slice(0, c.depth).join('/'))}
                  className={`truncate hover:text-[var(--editor-text)] ${
                    isCurrent
                      ? 'flex-1 text-left text-[var(--editor-text)] font-medium'
                      : 'max-w-[110px]'
                  }`}
                >
                  {c.seg}
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
            {rows.map((row) => {
              if (row.kind === 'entry') {
                return (
                  <CloudRow
                    key={row.key}
                    entry={row.entry}
                    depth={row.depth}
                    expanded={expanded.has(row.entry.path)}
                    onToggle={() => toggleDir(row.entry.path)}
                    onOpen={() => openEntry(row.entry)}
                    onMenu={(x, y) => setMenu({ entry: row.entry, x, y })}
                  />
                )
              }
              // 子目录正在拉取 / 拉取失败：就地占一行，不打断整棵树
              return (
                <div
                  key={row.key}
                  className={`flex items-stretch ${row.kind === 'error' ? 'text-red-500' : 'text-[var(--sidebar-text)]'}`}
                >
                  <TreeGuides depth={row.depth} />
                  <div className="flex items-center gap-1 py-1 pl-2 pr-2 text-xs min-w-0">
                    {row.kind === 'loading' ? (
                      <Loader2 size={12} className="animate-spin opacity-60" />
                    ) : (
                      <span className="truncate" title={row.message}>{row.message}</span>
                    )}
                  </div>
                </div>
              )
            })}
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

/** 逐层一条浅色竖线，把父子层级在视觉上串起来（Obsidian 风格） */
function TreeGuides({ depth }: { depth: number }) {
  if (depth <= 0) return null
  return (
    <>
      {Array.from({ length: depth }, (_, i) => (
        <span key={i} className="w-3.5 shrink-0 border-l border-[var(--editor-border)] opacity-50" />
      ))}
    </>
  )
}

function CloudRow({ entry, depth, expanded, onToggle, onOpen, onMenu }: {
  entry: RemoteEntry
  depth: number
  expanded: boolean
  onToggle: () => void
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
      className="group flex items-stretch cursor-pointer
        transition-colors duration-100 hover:bg-[var(--editor-hover)] text-[var(--editor-text)]"
    >
      <TreeGuides depth={depth} />
      <div className="flex items-center gap-1 flex-1 min-w-0 py-1 pl-2 pr-2">
        {entry.isDir ? (
          // 文件夹图标本身就是展开开关；点名称仍是「进入该目录」
          <button
            onClick={(e) => { e.stopPropagation(); onToggle() }}
            className="p-0.5 -m-0.5 rounded shrink-0 hover:bg-[var(--editor-bg)]"
          >
            {expanded
              ? <FolderOpen size={14} className="text-[var(--editor-accent)]" />
              : <Folder size={14} className="text-[var(--editor-accent)]" />}
          </button>
        ) : (
          <FileCode size={14} className="text-[var(--editor-accent)] opacity-70 shrink-0" />
        )}
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
    </div>
  )
}
