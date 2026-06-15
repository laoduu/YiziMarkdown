import { invokeTauri } from '../lib/tauri'
import { useEffect, useState } from 'react'
import { FileText, Clock, Trash2, FolderOpen } from 'lucide-react'
import { useEditorStore } from '../stores/editorStore'

export default function HomePage({ onOpenFile }: { onOpenFile: (filePath: string) => void }) {
  const { recentFiles, removeRecentFile } = useEditorStore()
  const [fileInfos, setFileInfos] = useState<Array<{ path: string; name: string; size: string; modified: string }>>([])

  useEffect(() => {
    const loadInfos = async () => {
      const infos: typeof fileInfos = []
      for (const p of recentFiles) {
        try {
          const meta = await invokeTauri<{ size: number; modified: number }>('get_file_meta', { path: p })
          if (meta) {
            const name = p.split('\\').pop()?.split('/').pop() || p
            const size = meta.size > 1024 ? `${(meta.size / 1024).toFixed(1)} KB` : `${meta.size} B`
            const d = new Date(meta.modified)
            const modified = `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
            infos.push({ path: p, name, size, modified })
          }
        } catch {
          infos.push({ path: p, name: p.split('\\').pop() || p, size: '-', modified: '-' })
        }
      }
      setFileInfos(infos)
    }
    if (recentFiles.length > 0) loadInfos()
    else setFileInfos([])
  }, [recentFiles])

  return (
    <div className="home-page">
      <div className="home-header">
        <div className="home-brand">
          <span className="text-2xl font-extrabold tracking-tight text-[var(--editor-accent)]">YiziMarkdown</span>
        </div>
        <p className="text-sm text-[var(--sidebar-text)] mt-2">点击文件打开，或使用 Ctrl+N 新建文件</p>
      </div>

      {fileInfos.length > 0 ? (
        <div className="home-list">
          <div className="home-list-header">
            <span className="text-xs font-semibold text-[var(--sidebar-text)] uppercase tracking-wider">最近文件</span>
          </div>
          {fileInfos.map((info) => (
            <button
              key={info.path}
              className="home-file-item"
              onClick={() => onOpenFile(info.path)}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <FileText size={16} className="text-[var(--editor-accent)] shrink-0" />
                <div className="min-w-0 flex-1 text-left">
                  <p className="text-sm text-[var(--editor-text)] truncate">{info.name}</p>
                  <p className="text-[11px] text-[var(--sidebar-text)] truncate">{info.path}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <span className="text-[11px] text-[var(--sidebar-text)]">{info.size}</span>
                <span className="text-[11px] text-[var(--sidebar-text)] flex items-center gap-1"><Clock size={10} />{info.modified}</span>
                <span
                  className="home-file-remove"
                  onClick={(e) => { e.stopPropagation(); removeRecentFile(info.path) }}
                  title="移除记录"
                >
                  <Trash2 size={12} />
                </span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="home-empty">
          <FolderOpen size={48} className="text-[var(--editor-border)] mb-3" />
          <p className="text-sm text-[var(--sidebar-text)]">暂无最近打开的文件</p>
          <p className="text-xs text-[var(--sidebar-text)] mt-1">使用 Ctrl+O 打开文件，文件会出现在这里</p>
        </div>
      )}
    </div>
  )
}
