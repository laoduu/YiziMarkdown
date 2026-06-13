import { useState, useMemo, useEffect, useCallback } from 'react'
import { 
  ChevronRight, 
  ChevronDown,
  ChevronUp,
  Folder, 
  FolderOpen,
  Hash,
  FileCode,
} from 'lucide-react'

interface SidebarProps {
  visible: boolean
  currentFile: string | null
  currentFolder: string | null
  content: string
  onFileSelect: (path: string) => void
  onFolderChange: (folderPath: string) => void
  onNavigateToLine?: (target: { id: string; line: number }) => void
  activeHeadingId?: string | null
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

export default function Sidebar({ visible, currentFile, currentFolder, content, onFileSelect, onFolderChange, onNavigateToLine, activeHeadingId }: SidebarProps) {
  const [activeTab, setActiveTab] = useState<'files' | 'outline'>('outline')
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
      // 更新 fileTree 中对应节点的 children
      const updateChildren = (nodes: FileNode[]): FileNode[] =>
        nodes.map(node => {
          if (node.path === folderPath) {
            return { ...node, children, loaded: true }
          }
          if (node.children) {
            return { ...node, children: updateChildren(node.children) }
          }
          return node
        })
      setFileTree(prev => updateChildren(prev))
      next.add(folderPath)
      setExpandedFolders(next)
    }
  }, [expandedFolders])

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
  const outlineItems = useMemo(() => {
    const headings: Array<{ level: number; text: string; id: string; line: number }> = []
    const headingCount: Record<string, number> = {}
    content.split('\n').forEach((line, index) => {
      const match = line.match(/^(#{1,6})\s+(.+)$/)
      if (match) {
        const base = match[2].trim().toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-')
        headingCount[base] = (headingCount[base] || 0) + 1
        const id = headingCount[base] === 1 ? base : `${base}-${headingCount[base]}`
        headings.push({
          level: match[1].length,
          text: match[2].trim(),
          id,
          line: index + 1,
        })
      }
    })
    return headings
  }, [content])

  if (!visible) return null

  return (
    <div className="sidebar">
      {/* 标签页 */}
      <div className="flex border-b border-[var(--editor-border)]">
        <TabButton 
          active={activeTab === 'files'} 
          onClick={() => setActiveTab('files')}
          icon={<Folder size={14} />}
          label="文件"
        />
        <TabButton 
          active={activeTab === 'outline'} 
          onClick={() => setActiveTab('outline')}
          icon={<Hash size={14} />}
          label="大纲"
        />
      </div>

      <div className="flex-1 overflow-auto">
        {activeTab === 'outline' ? (
          <OutlineView items={outlineItems} onNavigate={onNavigateToLine} activeHeadingId={activeHeadingId} />
        ) : (
          <>
            {/* 目录导航栏 */}
            <FolderPathNav
              currentFolder={currentFolder}
              onGoUp={goUp}
            />

            {fileTree.length === 0 ? (
              <div className="py-8 px-4 text-center text-sm text-[var(--sidebar-text)]">
                <Folder size={24} className="mx-auto mb-2 opacity-30" />
                <p>打开文件后显示目录</p>
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
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// 目录导航栏：显示当前路径 + 上级按钮
function FolderPathNav({ currentFolder, onGoUp }: { currentFolder: string | null; onGoUp: () => void }) {
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
        title="上级目录"
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
}

function FileNodeItem({ 
  node, currentFile, expandedFolders, onToggleFolder, onFileSelect, depth 
}: FileNodeItemProps) {
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
            {isExpanded ? <FolderOpen size={14} className="text-amber-500" /> : <Folder size={14} className="text-amber-500" />}
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
          空文件夹
        </div>
      )}
    </div>
  )
}

function OutlineView({ items, onNavigate, activeHeadingId }: { items: Array<{ level: number; text: string; id: string; line: number }>; onNavigate?: (target: { id: string; line: number }) => void; activeHeadingId?: string | null }) {
  if (items.length === 0) {
    return (
      <div className="py-4 px-2 text-center text-sm text-[var(--sidebar-text)]">
        文档中没有标题
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
