/**
 * 云端文件浏览器（WebDAV）—— 侧边栏第三个标签页。
 *
 * 只负责「浏览 + 打开 + 云端侧管理操作」；文档的读写（含图片镜像）由
 * `lib/webdav` 与 `App.tsx` 的打开/保存流程处理。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ChevronDown, ChevronRight, ChevronUp, ChevronsDown, ChevronsUp, Cloud, CloudOff, FileCode, FilePlus2, Folder,
  FolderOpen, FolderPlus, Home, Info, Loader2, Lock, MoreHorizontal, Move, Pencil, RefreshCw, Trash2,
} from 'lucide-react'
import { useI18n } from '../i18n'
import Dialog from './Dialog'
import CloudMoveDialog from './CloudMoveDialog'
import { openContextMenu, type ContextMenuItem } from './ContextMenu'
import { useSettingsStore } from '../stores/settingsStore'
import {
  list, mkdir, move, remove, save,
  WEBDAV_DIR_CHANGED_EVENT,
  type RemoteEntry,
} from '../lib/webdav'
import {
  joinPath, parentPath, normalizeRemotePath, formatSize, isRemotePathWithin,
} from '../lib/remotePath'
import { ensureRemoteAssetsReadme } from '../lib/docAssets'

const MARKDOWN_EXTS = ['.md', '.markdown', '.txt']
const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.ico']

function isMarkdownFile(name: string): boolean {
  const lower = name.toLowerCase()
  return MARKDOWN_EXTS.some((ext) => lower.endsWith(ext))
}

/** 只用于统计（不列进树）：assets/ 里的图片数量 */
function isImageFile(name: string): boolean {
  const lower = name.toLowerCase()
  return IMAGE_EXTS.some((ext) => lower.endsWith(ext))
}

/**
 * 系统资源目录：只认 `<配置根>/assets` 这一层。
 *
 * 云端所有图片都集中在这里（见 `src-tauri/src/doc_assets.rs`），它在文档树里看着
 * 像空目录，所以单独标记并禁止移动/改名/删除；用户自建的同名目录不受影响。
 */
function isSystemAssetsDir(dirPath: string, assetsDirPath: string): boolean {
  return normalizeRemotePath(dirPath) === assetsDirPath
}

/** 只展示文件夹与 Markdown 文件（与本地文件树一致） */
function isVisible(entry: RemoteEntry): boolean {
  return entry.isDir || isMarkdownFile(entry.name)
}

type DialogKind = 'newFile' | 'newFolder' | 'rename' | 'delete'

/** 摊平后的树行：目录展开后其子项以更大的 depth 插在后面 */
type TreeRow =
  | { kind: 'entry'; key: string; depth: number; entry: RemoteEntry }
  | { kind: 'hint'; key: string; depth: number; imageCount: number }
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

  /** 云端系统资源目录：`<配置根>/assets`，所有云端文档共享的图片都在这里 */
  const assetsDirPath = useMemo(
    () => joinPath(normalizeRemotePath(rootPath || '/'), 'assets'),
    [rootPath],
  )

  const [path, setPath] = useState(() => normalizeRemotePath(lastPath || rootPath || '/'))
  const [entries, setEntries] = useState<RemoteEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<{ kind: DialogKind; entry?: RemoteEntry } | null>(null)
  const [nameInput, setNameInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)

  // ===== 目录树（Obsidian 式就地展开）=====
  /** 已展开的目录路径 */
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  /** 子目录内容缓存：展开过的目录不重复请求（无缓存 = 正在拉取） */
  const [children, setChildren] = useState<Record<string, RemoteEntry[]>>({})
  /** 子目录拉取失败信息（就地显示，不覆盖整个列表） */
  const [dirErrors, setDirErrors] = useState<Record<string, string>>({})
  /** 当前高亮的条目（文件夹或文件） */
  const [selectedEntryPath, setSelectedEntryPath] = useState<string | null>(null)
  /** 新建文件/文件夹的目标目录：跟随当前选中的文件夹（选中文件时用其父目录） */
  const [targetDir, setTargetDir] = useState(() => normalizeRemotePath(lastPath || rootPath || '/'))
  /** 「一键展开」进行中：避免重复触发 */
  const [expandingAll, setExpandingAll] = useState(false)
  /** 是否已处于「全部展开」状态：控制按钮在展开全部 / 收折全部之间切换 */
  const [allExpanded, setAllExpanded] = useState(false)
  /** 移动弹窗的目标条目 */
  const [moveEntry, setMoveEntry] = useState<RemoteEntry | null>(null)

  const load = useCallback(async (target: string) => {
    if (!baseUrl) {
      setEntries([])
      return
    }
    // 目录内容可能已变（刷新、切换目录、增删改）→ 已展开子树的缓存一律作废，
    // 否则重命名/删除后展开的旧列表会继续显示已经不存在的条目
    setExpanded(new Set())
    setAllExpanded(false)
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

  // 切换树根（上级 / 根目录 / 主目录）后清空选中状态，新建目标回到新根目录
  useEffect(() => {
    setSelectedEntryPath(null)
    setTargetDir(normalizeRemotePath(path))
  }, [path])

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

  // 只展示文件夹与 Markdown 文件（与本地文件树一致）
  const visible = useMemo(() => entries.filter(isVisible), [entries])

  /** 导航到新的树根；同一路径时等价于刷新 */
  const navigate = useCallback((target: string) => {
    const next = normalizeRemotePath(target)
    setSelectedEntryPath(null)
    setTargetDir(next)
    if (next === normalizeRemotePath(path)) {
      load(next)
    } else {
      setPath(next)
    }
  }, [load, path])

  /**
   * 展开某个目录；首次展开时按需拉取子项（懒加载，不递归预取）。
   * 现在点击文件夹只在本树内展开，不再把树根切到该目录。
   */
  const toggleDir = useCallback(async (dir: string) => {
    // 手动展开/收折后就不再是「全部展开」状态，按钮回到「展开全部」
    setAllExpanded(false)
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
      // 系统资源目录：首次展开时顺带补写说明文件（历史目录没有 README.md）。
      // 必须在 list 之前完成，否则刚写进去的说明文件不会出现在本次列表里。
      if (isSystemAssetsDir(dir, assetsDirPath)) {
        await ensureRemoteAssetsReadme(baseUrl, rootPath || '/').catch(() => false)
      }
      const result = await list(baseUrl, dir)
      setChildren((prev) => ({ ...prev, [dir]: result }))
    } catch (e) {
      setDirErrors((prev) => ({ ...prev, [dir]: e instanceof Error ? e.message : String(e) }))
    }
  }, [baseUrl, children, expanded, assetsDirPath, rootPath])

  /** 点击条目：文件夹 = 选中并展开/收折；文件 = 选中并打开 */
  const activateEntry = useCallback((entry: RemoteEntry) => {
    setSelectedEntryPath(entry.path)
    setTargetDir(entry.isDir ? normalizeRemotePath(entry.path) : parentPath(entry.path))
    if (entry.isDir) {
      void toggleDir(entry.path)
    } else {
      onOpenRemote(entry.path)
    }
  }, [onOpenRemote, toggleDir])

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
        // 系统资源目录：图片不列进文档树，只用一行说明「这是什么 + 有多少张」
        if (isSystemAssetsDir(item.path, assetsDirPath)) {
          const imageCount = kids.filter((k) => !k.isDir && isImageFile(k.name)).length
          out.push({
            kind: 'hint', key: `${item.path}#hint`, depth: depth + 1, imageCount,
          })
        }
        walk(kids.filter(isVisible), depth + 1)
      }
    }
    walk(visible, 0)
    return out
  }, [visible, expanded, children, dirErrors, assetsDirPath])

  /**
   * 一键展开：从当前树根开始递归拉取所有子/孙目录，成功后一次性写入缓存与展开集合。
   * 并发上限 6，避免目录很深时把 WebDAV 服务器打满；失败目录保留错误行，不影响其他分支。
   */
  const expandAll = useCallback(async () => {
    if (!baseUrl || expandingAll) return
    setExpandingAll(true)
    const loaded: string[] = []
    const cache: Record<string, RemoteEntry[]> = {}
    const errors: Record<string, string> = {}
    const queue = visible.filter((e) => e.isDir).map((e) => e.path)
    const queued = new Set(queue)
    try {
      while (queue.length > 0) {
        const batch = queue.splice(0, 6)
        await Promise.all(batch.map(async (dir) => {
          try {
            const result = children[dir] ?? await list(baseUrl, dir)
            cache[dir] = result
            loaded.push(dir)
            for (const child of result.filter(isVisible)) {
              if (child.isDir && !queued.has(child.path)) {
                queued.add(child.path)
                queue.push(child.path)
              }
            }
          } catch (e) {
            errors[dir] = e instanceof Error ? e.message : String(e)
            // 仍然展开失败目录，让它就地显示错误行而不是悄无声息地收起
            loaded.push(dir)
          }
        }))
      }
    } finally {
      setChildren((prev) => ({ ...prev, ...cache }))
      setDirErrors(errors)
      setExpanded(new Set(loaded))
      setAllExpanded(true)
      setExpandingAll(false)
    }
  }, [baseUrl, children, expandingAll, visible])

  /** 收折全部：保留已拉取的子目录缓存，下次展开无需重新请求 */
  const collapseAll = useCallback(() => {
    setExpanded(new Set())
    setAllExpanded(false)
  }, [])

  /**
   * 操作完成后重新展开到目标目录，让新建/移入的条目在嵌套层级下也能立刻看到。
   * `load(path)` 会清空所有展开缓存，所以这里逐级重新拉取祖先目录。
   */
  const revealDir = useCallback(async (target: string) => {
    if (!baseUrl) return
    const root = normalizeRemotePath(path)
    const goal = normalizeRemotePath(target)
    if (goal === root || !isRemotePathWithin(goal, root)) return
    const rootSegs = root === '/' ? [] : root.split('/').filter(Boolean)
    const goalSegs = goal.split('/').filter(Boolean)
    const rel = goalSegs.slice(rootSegs.length)
    if (rel.length === 0) return

    const updates: Record<string, RemoteEntry[]> = {}
    let cur = root
    for (const seg of rel) {
      cur = joinPath(cur, seg)
      try {
        updates[cur] = await list(baseUrl, cur)
      } catch {
        // 目录可能在操作中又被删除/改名：保留已取到的部分即可
        break
      }
    }
    setChildren((prev) => ({ ...prev, ...updates }))
    setExpanded((prev) => {
      const next = new Set(prev)
      for (const dir of Object.keys(updates)) next.add(dir)
      return next
    })
  }, [baseUrl, path])

  const openDialog = (kind: DialogKind, entry?: RemoteEntry) => {
    setDialogError(null)
    setDialog({ kind, entry })
    setNameInput(kind === 'rename' && entry ? entry.name : '')
  }

  /** 行右键 / 行尾「…」按钮共用：打开 / 移动 / 重命名 / 删除（danger） */
  const openEntryMenu = (entry: RemoteEntry, x: number, y: number) => {
    // 系统资源目录由应用托管：移动/改名/删除都会让已保存文档的图片失联，直接不提供
    if (entry.isDir && isSystemAssetsDir(entry.path, assetsDirPath)) return
    const items: ContextMenuItem[] = []
    if (!entry.isDir) {
      items.push({ key: 'open', icon: <FileCode size={13} />, label: t('cloud.open'), onClick: () => onOpenRemote(entry.path) })
    }
    items.push(
      {
        key: 'move',
        icon: <Move size={13} />,
        label: entry.isDir ? t('cloud.moveFolder') : t('cloud.moveFile'),
        onClick: () => setMoveEntry(entry),
      },
      { key: 'rename', icon: <Pencil size={13} />, label: t('cloud.rename'), onClick: () => openDialog('rename', entry) },
      { key: 'delete', icon: <Trash2 size={13} />, label: t('cloud.delete'), danger: true, separatorBefore: true, onClick: () => openDialog('delete', entry) },
    )
    openContextMenu(x, y, items)
  }

  /** 目标目录：新建文件夹/新建文件都在当前选中的文件夹内 */
  const runDialog = async () => {
    if (!dialog || !baseUrl) return
    // 兜底：系统资源目录既不可改名也不可删除（菜单已隐藏，这里防其它入口绕过）
    if (
      dialog.entry?.isDir
      && isSystemAssetsDir(dialog.entry.path, assetsDirPath)
      && (dialog.kind === 'rename' || dialog.kind === 'delete')
    ) {
      setDialog(null)
      return
    }
    const name = nameInput.trim()
    setBusy(true)
    setDialogError(null)
    const wasCreate = dialog.kind === 'newFile' || dialog.kind === 'newFolder'
    try {
      if (dialog.kind === 'newFile') {
        if (!name) throw new Error(t('sidebar.namePlaceholder'))
        // 不带已知后缀时自动补 .md（与本地新建文件一致）
        const fileName = /\.(md|markdown|txt)$/i.test(name) ? name : `${name}.md`
        // create=true（If-None-Match）：已存在同名文件会报冲突，避免静默覆盖
        await save(baseUrl, joinPath(targetDir, fileName), '', null, true, null)
      } else if (dialog.kind === 'newFolder') {
        if (!name) throw new Error(t('cloud.folderNamePlaceholder'))
        await mkdir(baseUrl, joinPath(targetDir, name))
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
      setSelectedEntryPath(null)
      await load(path)
      // 在嵌套文件夹中新建后，重新展开到目标位置，避免新条目藏在收起的子树里
      if (wasCreate) await revealDir(targetDir)
    } catch (e) {
      setDialogError(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }

  /** 移动成功：刷新当前树，并在目标位于当前树内时展开到目标目录 */
  const handleMoved = useCallback(async (destDir: string) => {
    setMoveEntry(null)
    setSelectedEntryPath(null)
    await load(path)
    await revealDir(destDir)
  }, [load, path, revealDir])

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

  const iconBtn = 'p-1 rounded transition-colors duration-100 text-[var(--sidebar-text)] ' +
    'hover:bg-[var(--editor-hover)] hover:text-[var(--editor-text)] disabled:opacity-30 disabled:cursor-default'
  const homeDir = normalizeRemotePath(rootPath || '/')

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* 顶部常驻图标：上级 / 根目录 / 主目录 / 新建文件夹 / 新建文件 / 一键展开 / 刷新 */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-[var(--editor-border)] text-xs shrink-0">
        <button
          onClick={() => navigate(parentPath(path))}
          disabled={path === '/'}
          title={t('cloud.parentDir')}
          className={iconBtn}
        >
          <ChevronUp size={14} />
        </button>
        <button onClick={() => navigate('/')} title={t('cloud.root')} className={iconBtn}>
          <Cloud size={14} />
        </button>
        <button
          onClick={() => navigate(homeDir)}
          title={`${t('cloud.home')} (${homeDir})`}
          className={iconBtn}
        >
          <Home size={14} />
        </button>
        <div className="flex-1 min-w-0" />
        <button onClick={() => openDialog('newFolder')} title={t('cloud.newFolder')} className={iconBtn}>
          <FolderPlus size={14} />
        </button>
        <button onClick={() => openDialog('newFile')} title={t('cloud.newFile')} className={iconBtn}>
          <FilePlus2 size={14} />
        </button>
        <button
          onClick={allExpanded ? collapseAll : expandAll}
          disabled={expandingAll}
          title={allExpanded ? t('cloud.collapseAll') : t('cloud.expandAll')}
          className={iconBtn}
        >
          {allExpanded
            ? <ChevronsUp size={14} className={expandingAll ? 'animate-pulse' : ''} />
            : <ChevronsDown size={14} className={expandingAll ? 'animate-pulse' : ''} />}
        </button>
        <button
          onClick={() => load(path)}
          disabled={loading}
          title={t('cloud.refresh')}
          className={iconBtn}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* 内容（空白处右键 = 在选中文件夹中新建 / 刷新；行右键由 CloudRow 自行 stopPropagation 接管） */}
      <div
        className="flex-1 overflow-auto min-h-0"
        onContextMenu={(e) => {
          e.preventDefault()
          openContextMenu(e.clientX, e.clientY, [
            { key: 'newFile', icon: <FilePlus2 size={13} />, label: t('cloud.newFile'), onClick: () => openDialog('newFile') },
            { key: 'newFolder', icon: <FolderPlus size={13} />, label: t('cloud.newFolder'), onClick: () => openDialog('newFolder') },
            { key: 'refresh', icon: <RefreshCw size={13} />, label: t('cloud.refresh'), onClick: () => load(path) },
          ])
        }}
      >
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
                    selected={row.entry.path === selectedEntryPath}
                    system={row.entry.isDir && isSystemAssetsDir(row.entry.path, assetsDirPath)}
                    onActivate={() => activateEntry(row.entry)}
                    onMenu={openEntryMenu}
                  />
                )
              }
              if (row.kind === 'hint') {
                return (
                  <div key={row.key} className="flex items-stretch text-[var(--sidebar-text)]">
                    <TreeGuides depth={row.depth} />
                    <div className="flex items-start gap-1 py-1 pl-2 pr-2 text-[0.6875rem] leading-relaxed min-w-0">
                      <Info size={12} className="mt-0.5 shrink-0 opacity-60" />
                      <span>{t('cloud.assetsDirHint', { count: row.imageCount })}</span>
                    </div>
                  </div>
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

      {/* 新建文件 / 新建文件夹 / 重命名 */}
      <Dialog
        open={dialog?.kind === 'newFile' || dialog?.kind === 'newFolder' || dialog?.kind === 'rename'}
        onClose={() => setDialog(null)}
        title={dialog?.kind === 'rename'
          ? t('cloud.rename')
          : dialog?.kind === 'newFile' ? t('cloud.newFile') : t('cloud.newFolder')}
        width={320}
      >
        {(dialog?.kind === 'newFile' || dialog?.kind === 'newFolder') && (
          <div className="flex items-baseline gap-1.5 mb-2 text-[0.6875rem] text-[var(--sidebar-text)]">
            <span className="shrink-0">{t('cloud.pathLabel')}</span>
            <span className="truncate font-mono" title={targetDir}>{targetDir}</span>
          </div>
        )}
        <input
          autoFocus
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') runDialog() }}
          placeholder={dialog?.kind === 'rename'
            ? t('cloud.newNamePlaceholder')
            : dialog?.kind === 'newFile' ? t('sidebar.namePlaceholder') : t('cloud.folderNamePlaceholder')}
          className="settings-input w-full mb-3"
        />
        {dialogError && <p className="text-[0.6875rem] text-red-500 mb-2 break-words">{dialogError}</p>}
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
        <p className="text-[0.8125rem] text-[var(--editor-text)] mb-1">
          {t('cloud.deleteConfirmBody', { name: dialog?.entry?.name ?? '' })}
        </p>
        {dialog?.entry?.isDir && (
          <p className="text-[0.75rem] text-red-500 mb-1">
            {t('cloud.deleteConfirmFolder', { name: dialog.entry.name })}
          </p>
        )}
        {dialogError && <p className="text-[0.6875rem] text-red-500 mb-2 break-words">{dialogError}</p>}
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

      {/* 移动文件 / 目录 */}
      <CloudMoveDialog
        entry={moveEntry}
        onClose={() => setMoveEntry(null)}
        onMoved={handleMoved}
      />
    </div>
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

function CloudRow({ entry, depth, expanded, selected, system, onActivate, onMenu }: {
  entry: RemoteEntry
  depth: number
  expanded: boolean
  selected: boolean
  /** 系统资源目录（`<配置根>/assets`）：加锁标记，且不提供管理操作 */
  system: boolean
  onActivate: () => void
  onMenu: (entry: RemoteEntry, x: number, y: number) => void
}) {
  const { t } = useI18n()
  return (
    <div
      onClick={onActivate}
      onContextMenu={(e) => {
        e.preventDefault()
        // 阻止冒泡到内容容器的空白处菜单
        e.stopPropagation()
        onMenu(entry, e.clientX, e.clientY)
      }}
      title={system
        ? `${entry.name} · ${t('cloud.assetsDirLabel')}`
        : entry.isDir ? entry.name : `${entry.name} · ${formatSize(entry.size)}`}
      aria-selected={selected}
      className={`group flex items-stretch cursor-pointer
        transition-colors duration-100 hover:bg-[var(--editor-hover)] text-[var(--editor-text)]
        ${selected ? 'bg-[var(--editor-hover)]' : ''}`}
    >
      <TreeGuides depth={depth} />
      <div className="flex items-center gap-1 flex-1 min-w-0 py-1 pl-2 pr-2">
        {entry.isDir ? (
          // Obsidian 风格：点击文件夹只在本树内展开/收折，不再切换树根
          <>
            <button
              onClick={(e) => { e.stopPropagation(); onActivate() }}
              className="p-0.5 -m-0.5 rounded shrink-0 hover:bg-[var(--editor-bg)]"
            >
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {system ? (
              // 系统资源目录用锁标出来，与用户自建文件夹区分
              <Lock size={14} className="text-[var(--sidebar-text)] shrink-0" />
            ) : expanded
              ? <FolderOpen size={14} className="text-[var(--editor-accent)] shrink-0" />
              : <Folder size={14} className="text-[var(--editor-accent)] shrink-0" />}
          </>
        ) : (
          // 与文件夹行的三角位对齐（本地文件树同款占位）
          <>
            <span className="w-3.5 shrink-0" />
            <FileCode size={14} className="text-[var(--editor-accent)] opacity-70 shrink-0" />
          </>
        )}
        <span className={`flex-1 truncate text-sm ${selected ? 'font-medium' : ''}`}>{entry.name}</span>
        {system && (
          <span className="shrink-0 text-[0.625rem] px-1 py-0.5 rounded
            bg-[var(--editor-hover)] text-[var(--sidebar-text)]">
            {t('cloud.assetsDirLabel')}
          </span>
        )}
        {!system && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
              onMenu(entry, r.left, r.bottom + 2)
            }}
            className="p-0.5 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100
              text-[var(--sidebar-text)] hover:bg-[var(--editor-bg)] shrink-0"
          >
            <MoreHorizontal size={13} />
          </button>
        )}
      </div>
    </div>
  )
}
