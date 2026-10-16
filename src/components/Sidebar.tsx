import { computeOutlineItems } from '../lib/headingId'
import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Cloud,
  Folder,
  FolderOpen,
  Hash,
  FileCode,
  FilePlus2,
  FolderPlus,
  Pencil,
  Trash2,
  ExternalLink,
  RefreshCw,
} from 'lucide-react'
import { useI18n } from '../i18n'
import CloudBrowser from './CloudBrowser'
import Dialog from './Dialog'
import { openContextMenu, type ContextMenuItem } from './ContextMenu'
import { invokeTauriOrThrow } from '../lib/tauri'

interface SidebarProps {
  visible: boolean
  currentFile: string | null
  currentFolder: string | null
  content: string
  onFileSelect: (path: string) => void
  onFolderChange: (folderPath: string) => void
  onNavigateToLine?: (target: { id: string; line: number }) => void
  activeHeadingId?: string | null
  /** 当前 tab 是否为云端文档（其 filePath 指向本地缓存镜像） */
  isRemote?: boolean
  /** 打开云端文档 */
  onOpenRemote: (remotePath: string) => void
  /** 未配置 WebDAV 时跳转到设置 */
  onRequestSettings: () => void
}

interface FileNode {
  name: string
  path: string
  type: 'file' | 'folder'
  children?: FileNode[]
  loaded?: boolean
}

const MARKDOWN_EXTS = ['.md', '.markdown', '.txt']

function isMarkdownFile(name: string): boolean {
  const lower = name.toLowerCase()
  return MARKDOWN_EXTS.some(ext => lower.endsWith(ext))
}

/** 用与传入路径一致的分隔符拼接子路径（Windows \，类 Unix /） */
function joinLocalPath(folder: string, name: string): string {
  const sep = folder.includes('\\') ? '\\' : '/'
  return folder.endsWith('\\') || folder.endsWith('/') ? folder + name : folder + sep + name
}

/** 父目录路径（无分隔符边界时原样返回） */
function parentOf(p: string): string {
  const lastSep = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'))
  return lastSep > 0 ? p.substring(0, lastSep) : p
}

/** 深度优先把指定目录的 children 替换为新列表（返回新树，不改原数组） */
function updateChildren(nodes: FileNode[], folderPath: string, children: FileNode[]): FileNode[] {
  return nodes.map(node => {
    if (node.path === folderPath) {
      return { ...node, children, loaded: true }
    }
    if (node.children) {
      return { ...node, children: updateChildren(node.children, folderPath, children) }
    }
    return node
  })
}

/** 本地文件管理对话框类型（侧栏右键菜单 v0.3.4） */
type LocalDialogKind = 'newFile' | 'newFolder' | 'rename' | 'delete'

// 调用 Tauri read_directory 命令
async function fetchDirectory(folderPath: string): Promise<FileNode[]> {
  const tauri = (window as any).__TAURI_INTERNALS__
  if (tauri && typeof tauri.invoke === 'function') {
    try {
      const result = await tauri.invoke('read_directory', { path: folderPath })
      console.log('[Sidebar] read_directory result for', folderPath, ':', result)
      if (result && Array.isArray(result)) {
        return result
          .filter((entry: any) => {
            if (entry.isFolder) {
              const name = (entry.name || '').toLowerCase()
              return !name.startsWith('.') && name !== 'node_modules'
            }
            return isMarkdownFile(entry.name || '')
          })
          .map((entry: any) => ({
            name: entry.name,
            path: entry.path,
            type: entry.isFolder ? 'folder' : 'file',
            children: entry.isFolder ? [] : undefined,
            loaded: false,
          }))
      }
      console.warn('[Sidebar] read_directory unexpected result:', result)
    } catch (err) {
      console.error('[Sidebar] read_directory failed:', err)
    }
  } else {
    console.warn('[Sidebar] Tauri invoke not available')
  }
  return []
}

export default function Sidebar({ visible, currentFile, currentFolder, content, onFileSelect, onFolderChange, onNavigateToLine, activeHeadingId, isRemote = false, onOpenRemote, onRequestSettings }: SidebarProps) {
  const { t } = useI18n()
  const [activeTab, setActiveTab] = useState<'files' | 'outline' | 'cloud'>('outline')
  const [fileTree, setFileTree] = useState<FileNode[]>([])
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())

  // 读取当前目录
  const readFolder = useCallback(async (folderPath: string) => {
    const nodes = await fetchDirectory(folderPath)
    setFileTree(nodes)
    setExpandedFolders(new Set())
  }, [])

  useEffect(() => {
    if (currentFolder) {
      readFolder(currentFolder)
    }
  }, [currentFolder, readFolder])

  // 文件打开后自动切换到所在目录
  useEffect(() => {
    if (currentFile) {
      const lastSep = Math.max(currentFile.lastIndexOf('\\'), currentFile.lastIndexOf('/'))
      const folder = currentFile.substring(0, lastSep)
      if (folder && folder !== currentFolder) {
        onFolderChange(folder)
      }
    }
  }, [currentFile]) // eslint-disable-line

  // 展开/折叠子文件夹
  const toggleSubFolder = useCallback(async (folderPath: string) => {
    const next = new Set(expandedFolders)
    if (next.has(folderPath)) {
      next.delete(folderPath)
      setExpandedFolders(next)
    } else {
      // 懒加载子目录内容
      const children = await fetchDirectory(folderPath)
      setFileTree(prev => updateChildren(prev, folderPath, children))
      next.add(folderPath)
      setExpandedFolders(next)
    }
  }, [expandedFolders])

  // ===== 右键菜单 + 本地文件管理（v0.3.4）=====
  const [dialog, setDialog] = useState<{ kind: LocalDialogKind; node?: FileNode } | null>(null)
  const [nameInput, setNameInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)

  /** 只刷新目录树当前目录（含已展开子目录），不整界面刷新、不折叠已展开目录 */
  const refreshTree = useCallback(async () => {
    if (!currentFolder) return
    const nodes = await fetchDirectory(currentFolder)
    setFileTree(nodes)
    for (const dir of expandedFolders) {
      const kids = await fetchDirectory(dir)
      setFileTree(prev => updateChildren(prev, dir, kids))
    }
  }, [currentFolder, expandedFolders])

  const openLocalDialog = (kind: LocalDialogKind, node?: FileNode) => {
    setDialogError(null)
    setDialog({ kind, node })
    setNameInput(kind === 'rename' && node ? node.name : '')
  }

  /** 目标（含其子树）是否正被当前打开文件占用 —— 重命名/删除会造成 tab 路径失效，拒绝并提示 */
  const isOpenTarget = (p: string) => {
    if (!currentFile) return false
    if (currentFile === p) return true
    const sep = p.includes('\\') ? '\\' : '/'
    return currentFile.startsWith(p + sep)
  }

  /** 文件/文件夹行右键 */
  const openNodeMenu = (node: FileNode, x: number, y: number) => {
    const items: ContextMenuItem[] = []
    if (node.type === 'file') {
      items.push({ key: 'open', icon: <FileCode size={13} />, label: t('cloud.open'), onClick: () => onFileSelect(node.path) })
    }
    items.push(
      { key: 'rename', icon: <Pencil size={13} />, label: t('cloud.rename'), onClick: () => openLocalDialog('rename', node) },
      { key: 'reveal', icon: <ExternalLink size={13} />, label: t('sidebar.revealInExplorer'), onClick: () => { void invokeTauriOrThrow('reveal_in_explorer', { path: node.path }) } },
      { key: 'delete', icon: <Trash2 size={13} />, label: t('cloud.delete'), danger: true, separatorBefore: true, onClick: () => openLocalDialog('delete', node) },
    )
    openContextMenu(x, y, items)
  }

  /** 文件树空白处右键（无目录时无菜单 —— 原生已被全局屏蔽，表现即「无反应」） */
  const openBlankMenu = (e: React.MouseEvent) => {
    if (!currentFolder || isRemote) return
    e.preventDefault()
    e.stopPropagation()
    openContextMenu(e.clientX, e.clientY, [
      { key: 'newFile', icon: <FilePlus2 size={13} />, label: t('sidebar.newFile'), onClick: () => openLocalDialog('newFile') },
      { key: 'newFolder', icon: <FolderPlus size={13} />, label: t('sidebar.newFolder'), onClick: () => openLocalDialog('newFolder') },
      { key: 'refresh', icon: <RefreshCw size={13} />, label: t('cloud.refresh'), onClick: () => { void refreshTree() } },
    ])
  }

  const runLocalDialog = async () => {
    if (!dialog || !currentFolder) return
    const node = dialog.node
    const name = nameInput.trim()
    setBusy(true)
    setDialogError(null)
    try {
      if (dialog.kind === 'newFile') {
        if (!name) throw new Error(t('sidebar.namePlaceholder'))
        // 不带已知后缀时自动补 .md
        const fileName = /\.(md|markdown|txt)$/i.test(name) ? name : `${name}.md`
        await invokeTauriOrThrow('save_file', { path: joinLocalPath(currentFolder, fileName), content: '' })
      } else if (dialog.kind === 'newFolder') {
        if (!name) throw new Error(t('cloud.folderNamePlaceholder'))
        await invokeTauriOrThrow('create_directory', { path: joinLocalPath(currentFolder, name) })
      } else if (dialog.kind === 'rename' && node) {
        if (!name) throw new Error(t('cloud.newNamePlaceholder'))
        if (isOpenTarget(node.path)) throw new Error(t('sidebar.openFileGuard'))
        const target = joinLocalPath(parentOf(node.path), name)
        if (target !== node.path) {
          await invokeTauriOrThrow('rename_path', { from: node.path, to: target })
        }
      } else if (dialog.kind === 'delete' && node) {
        if (isOpenTarget(node.path)) throw new Error(t('sidebar.openFileGuard'))
        await invokeTauriOrThrow('delete_to_trash', { path: node.path })
      }
      setDialog(null)
      await refreshTree()
    } catch (e) {
      setDialogError(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }

  // 进入上级目录
  const goUp = useCallback(() => {
    if (!currentFolder) return
    const lastSep = Math.max(currentFolder.lastIndexOf('\\'), currentFolder.lastIndexOf('/'))
    const parent = currentFolder.substring(0, lastSep)
    if (parent && parent.length >= 3) {
      onFolderChange(parent)
    }
  }, [currentFolder, onFolderChange])

  // 大纲
  const outlineItems = useMemo(() => computeOutlineItems(content), [content])

  if (!visible) return null

  return (
    <div className="sidebar">
      {/* 标签页 */}
      <div className="flex border-b border-[var(--editor-border)]">
        <TabButton 
          active={activeTab === 'files'} 
          onClick={() => setActiveTab('files')}
          icon={<Folder size={14} />}
          label={t('sidebar.files')}
        />
        <TabButton 
          active={activeTab === 'outline'} 
          onClick={() => setActiveTab('outline')}
          icon={<Hash size={14} />}
          label={t('sidebar.outline')}
        />
        <TabButton
          active={activeTab === 'cloud'}
          onClick={() => setActiveTab('cloud')}
          icon={<Cloud size={14} />}
          label={t('sidebar.cloud')}
        />
      </div>

      <div className="flex-1 overflow-auto min-h-0">
        {activeTab === 'outline' ? (
          <OutlineView items={outlineItems} onNavigate={onNavigateToLine} activeHeadingId={activeHeadingId} />
        ) : activeTab === 'cloud' ? (
          <CloudBrowser onOpenRemote={onOpenRemote} onRequestSettings={onRequestSettings} />
        ) : (
          <div className="min-h-full" onContextMenu={openBlankMenu}>
            {/* 目录导航栏 */}
            <FolderPathNav
              currentFolder={isRemote ? null : currentFolder}
              onGoUp={goUp}
            />

            {isRemote ? (
              <div className="py-8 px-4 text-center text-sm text-[var(--sidebar-text)]">
                <Cloud size={24} className="mx-auto mb-2 opacity-30" />
                <p>{t('cloud.remoteDocHint')}</p>
              </div>
            ) : fileTree.length === 0 ? (
              <div className="py-8 px-4 text-center text-sm text-[var(--sidebar-text)]">
                <Folder size={24} className="mx-auto mb-2 opacity-30" />
                <p>{t('sidebar.showAfterOpen')}</p>
              </div>
            ) : (
              <div className="py-1">
                {fileTree.map((node) => (
                  <FileNodeItem
                    key={node.path}
                    node={node}
                    currentFile={currentFile}
                    expandedFolders={expandedFolders}
                    onToggleFolder={toggleSubFolder}
                    onFileSelect={onFileSelect}
                    depth={0}
                    onNodeMenu={openNodeMenu}
                  />
                ))}
              </div>
            )}

            {/* 新建文件 / 新建文件夹 / 重命名 */}
            <Dialog
              open={dialog?.kind === 'newFile' || dialog?.kind === 'newFolder' || dialog?.kind === 'rename'}
              onClose={() => setDialog(null)}
              title={dialog?.kind === 'rename'
                ? t('cloud.rename')
                : dialog?.kind === 'newFolder' ? t('cloud.newFolder') : t('sidebar.newFile')}
              width={320}
            >
              <input
                autoFocus
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { void runLocalDialog() } }}
                placeholder={dialog?.kind === 'rename'
                  ? t('cloud.newNamePlaceholder')
                  : dialog?.kind === 'newFolder' ? t('cloud.folderNamePlaceholder') : t('sidebar.namePlaceholder')}
                className="settings-input w-full mb-3"
              />
              {dialogError && <p className="text-[11px] text-red-500 mb-2 break-words">{dialogError}</p>}
              <div className="flex justify-end gap-2">
                <button onClick={() => setDialog(null)} className="settings-btn-secondary">{t('cloud.cancel')}</button>
                <button
                  onClick={() => { void runLocalDialog() }}
                  disabled={busy || !nameInput.trim()}
                  className="settings-btn-primary"
                  style={busy || !nameInput.trim() ? { opacity: 0.5 } : undefined}
                >
                  {dialog?.kind === 'rename' ? t('cloud.renameConfirm') : t('cloud.create')}
                </button>
              </div>
            </Dialog>

            {/* 删除确认（本地，移入回收站） */}
            <Dialog
              open={dialog?.kind === 'delete'}
              onClose={() => setDialog(null)}
              title={t('sidebar.deleteConfirmTitle')}
              width={340}
            >
              <p className="text-[13px] text-[var(--editor-text)] mb-1">
                {t('sidebar.deleteConfirmBody', { name: dialog?.node?.name ?? '' })}
              </p>
              {dialog?.node?.type === 'folder' && (
                <p className="text-[12px] text-red-500 mb-1">
                  {t('cloud.deleteConfirmFolder', { name: dialog.node.name })}
                </p>
              )}
              {dialogError && <p className="text-[11px] text-red-500 mb-2 break-words">{dialogError}</p>}
              <div className="flex justify-end gap-2 mt-3">
                <button onClick={() => setDialog(null)} className="settings-btn-secondary">{t('cloud.cancel')}</button>
                <button
                  onClick={() => { void runLocalDialog() }}
                  disabled={busy}
                  className="settings-btn-primary"
                  style={{ background: '#dc2626', ...(busy ? { opacity: 0.5 } : {}) }}
                >
                  {t('cloud.delete')}
                </button>
              </div>
            </Dialog>
          </div>
        )}
      </div>
    </div>
  )
}

// 目录导航栏：显示当前路径 + 上级按钮
function FolderPathNav({ currentFolder, onGoUp }: { currentFolder: string | null; onGoUp: () => void }) {
  const { t } = useI18n()
  if (!currentFolder) return null

  const canGoUp = currentFolder.length > 3 // 大于 "C:\"
  const folderName = currentFolder.split('\\').pop() || currentFolder

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--editor-border)] text-xs text-[var(--sidebar-text)]">
      <button
        onClick={onGoUp}
        disabled={!canGoUp}
        className={`
          flex items-center gap-0.5 px-1.5 py-0.5 rounded
          transition-colors duration-100
          ${canGoUp 
            ? 'hover:bg-[var(--editor-hover)] hover:text-[var(--editor-text)] cursor-pointer' 
            : 'opacity-30 cursor-default'
          }
        `}
        title={t('sidebar.parentDir')}
      >
        <ChevronUp size={14} />
        <span>..</span>
      </button>
      <span className="flex-1 truncate text-[var(--editor-text)] font-medium">{folderName}</span>
      <span className="truncate opacity-50" title={currentFolder}>{currentFolder}</span>
    </div>
  )
}

function TabButton({ 
  active, onClick, icon, label 
}: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`
        flex-1 py-2.5 px-3 text-xs font-medium
        flex items-center justify-center gap-1.5
        transition-colors duration-150
        ${active 
          ? 'text-[var(--editor-accent)] border-b-2 border-[var(--editor-accent)]' 
          : 'text-[var(--sidebar-text)] hover:text-[var(--editor-text)]'
        }
      `}
    >
      {icon}
      {label}
    </button>
  )
}

interface FileNodeItemProps {
  node: FileNode
  currentFile: string | null
  expandedFolders: Set<string>
  onToggleFolder: (path: string) => void
  onFileSelect: (path: string) => void
  depth: number
  /** 行右键（v0.3.4）：在 Sidebar 里弹出该节点的操作菜单 */
  onNodeMenu?: (node: FileNode, x: number, y: number) => void
}

function FileNodeItem({
  node, currentFile, expandedFolders, onToggleFolder, onFileSelect, depth, onNodeMenu
}: FileNodeItemProps) {
  const { t } = useI18n()
  const isExpanded = expandedFolders.has(node.path)
  const isSelected = currentFile === node.path

  const handleClick = () => {
    if (node.type === 'folder') {
      onToggleFolder(node.path)
    } else {
      onFileSelect(node.path)
    }
  }

  return (
    <div>
      <div
        onClick={handleClick}
        onContextMenu={(e) => {
          e.preventDefault()
          // 阻止冒泡到文件树空白处的菜单
          e.stopPropagation()
          onNodeMenu?.(node, e.clientX, e.clientY)
        }}
        className={`
          flex items-center gap-1 py-1 px-2 cursor-pointer
          transition-colors duration-100
          ${isSelected 
            ? 'bg-[var(--editor-accent)] text-white' 
            : 'hover:bg-[var(--editor-hover)] text-[var(--editor-text)]'
          }
        `}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {node.type === 'folder' ? (
          <>
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {isExpanded ? <FolderOpen size={14} className="text-[var(--editor-accent)]" /> : <Folder size={14} className="text-[var(--editor-accent)]" />}
          </>
        ) : (
          <>
            <span className="w-3.5" />
            <FileCode size={14} className="text-[var(--editor-accent)] opacity-70" />
          </>
        )}
        <span className="flex-1 truncate text-sm">{node.name}</span>
      </div>

      {/* 子节点 */}
      {node.type === 'folder' && isExpanded && node.children && node.children.length > 0 && (
        <div>
          {node.children.map((child) => (
            <FileNodeItem
              key={child.path}
              node={child}
              currentFile={currentFile}
              expandedFolders={expandedFolders}
              onToggleFolder={onToggleFolder}
              onFileSelect={onFileSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
      {/* 空文件夹提示 */}
      {node.type === 'folder' && isExpanded && node.loaded && (!node.children || node.children.length === 0) && (
        <div 
          className="py-1 px-2 text-xs text-[var(--sidebar-text)] opacity-50 italic"
          style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
        >
          {t('sidebar.emptyFolder')}
        </div>
      )}
    </div>
  )
}

function OutlineView({ items, onNavigate, activeHeadingId }: { items: Array<{ level: number; text: string; id: string; line: number }>; onNavigate?: (target: { id: string; line: number }) => void; activeHeadingId?: string | null }) {
  const { t } = useI18n()
  if (items.length === 0) {
    return (
      <div className="py-4 px-2 text-center text-sm text-[var(--sidebar-text)]">
        {t('sidebar.noHeadings')}
      </div>
    )
  }
  
  return (
    <div className="py-2 px-2">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onNavigate?.({ id: item.id, line: item.line })}
          className={`
            w-full py-1 px-2 rounded-md
            flex items-center gap-2 text-sm
            transition-colors duration-100
            hover:bg-[var(--editor-hover)]
            text-left
            ${item.id === activeHeadingId
              ? 'border-l-2 border-[var(--editor-accent)] bg-[var(--editor-hover)] font-medium text-[var(--editor-text)]'
              : 'border-l-2 border-transparent text-[var(--sidebar-text)] hover:text-[var(--editor-text)]'
            }
          `}
          style={{ paddingLeft: `${(item.level - 1) * 12 + 8}px` }}
        >
          <span className="truncate">{item.text}</span>
        </button>
      ))}
    </div>
  )
}
