import { invokeTauri } from '../lib/tauri'
import { useState, useEffect } from 'react'
import type { CSSProperties } from 'react'
import { FileText, Clock, Check, FolderOpen, Save, PanelLeftClose, Eye, Code, TriangleAlert, Download } from 'lucide-react'
import { useI18n } from '../i18n'

/**
 * 状态栏里「芯片」（更新提示、缓存警示）的统一样式：**文字色只能是 `--statusbar-text`**。
 *
 * 为什么不能直接用强调色 / 危险色当文字色：状态栏底色由主题决定，而**多数主题的
 * `--statusbar-bg` 与 `--editor-accent` 是同一个颜色**（实测 16 个主题里 11 个相同，
 * 如 liquidglass-prism 两边都是 #2563eb）——拿强调色写「有新版本」，等于同色写在同色底上，
 * 整块隐形、功能等于不存在。`--danger` 也有同样的风险（lychee 的底色就是红的）。
 *
 * 所以强调只用**半透明底衬**表达：`color-mix` 出来的色铺在任意底色上都能与
 * `--statusbar-text` 拉开对比，文字永远读得见。
 */
const chipStyle = (tint: string): CSSProperties => ({
  color: 'var(--statusbar-text)',
  background: tint,
  borderRadius: 4,
  padding: '0 6px',
  fontWeight: 600,
})

interface StatusBarProps {
  wordCount: number
  readingTime: number
  cursorLine: number
  cursorColumn: number
  filePath: string | null
  isSaved: boolean
  isPreviewMode?: boolean
  onTogglePreview?: (preview: boolean) => void
  onToggleSidebar?: () => void
  onOpenAbout?: () => void
  /** 本地缓存降级 / 写入失败的说明；非空时状态栏常驻一个警示标记，悬停即全文 */
  storageWarning?: string | null
  /** 点警示标记：打开「清理本地缓存」。配额满时纯报警没有出路，这里给一个自救入口 */
  onStorageWarningClick?: () => void
  /** 有新版本时的版本号（如 "0.3.5"）：版本号右侧多一行提示，点击进「版本与更新」看更新内容 */
  updateVersion?: string | null
}

export default function StatusBar({
  wordCount, readingTime, cursorLine, cursorColumn,
  filePath, isSaved,
  isPreviewMode, onTogglePreview, onToggleSidebar, onOpenAbout, storageWarning, updateVersion,
  onStorageWarningClick,
}: StatusBarProps) {
  const { t } = useI18n()
  const [version, setVersion] = useState('')

  useEffect(() => {
    invokeTauri<string>('get_app_version').then((v) => { if (v) setVersion(v) })
  }, [])

  return (
    <div className="statusbar">
      {/* 左侧控制区 */}
      <button
        onClick={onToggleSidebar}
        className="statusbar-item"
        title={t('statusbar.toggleSidebar')}
      >
        <PanelLeftClose size={12} />
      </button>

      <button
        onClick={() => onTogglePreview?.(!isPreviewMode)}
        className="statusbar-item"
        title={isPreviewMode ? t('statusbar.toSource') : t('statusbar.toPreview')}
      >
        {isPreviewMode ? <Code size={12} /> : <Eye size={12} />}
      </button>

      {filePath && (
        <div className="flex items-center gap-1.5 max-w-[200px] truncate">
          <FolderOpen size={12} />
          <span className="truncate">{filePath}</span>
        </div>
      )}

      <div className="flex items-center gap-1.5">
        <FileText size={12} />
        <span>{t('statusbar.chars', { n: wordCount })}</span>
      </div>

      <div className="flex items-center gap-1.5">
        <Clock size={12} />
        <span>{t('statusbar.readingTime', { n: readingTime })}</span>
      </div>

      <div className="flex-1" />

      <div className="statusbar-item" onClick={onOpenAbout} style={{ cursor: onOpenAbout ? 'pointer' : 'default' }} title={t('statusbar.about')}>
        <span>YiziMarkdown {version}</span>
      </div>

      {/* 有新版本：版本号右侧一行提示。点击进「版本与更新」——更新卡片在那里，
          状态栏只负责让用户知道「有新东西」，不在状态栏里做安装动作 */}
      {updateVersion && (
        <div
          className="statusbar-item"
          onClick={onOpenAbout}
          style={{ ...chipStyle('color-mix(in srgb, var(--statusbar-text) 18%, transparent)'), cursor: onOpenAbout ? 'pointer' : 'default' }}
          title={t('settings.updateTitle')}
        >
          <Download size={12} />
          <span>{t('statusbar.updateAvailable', { v: updateVersion })}</span>
        </div>
      )}

      <div className="flex-1" />

      <div className="flex items-center gap-1.5">
        <span>{t('statusbar.line', { n: cursorLine })}</span>
        <span>{t('statusbar.col', { n: cursorColumn })}</span>
      </div>

      <div className="flex items-center gap-1.5">
        {isSaved ? (
          <><Check size={12} /><span>{t('statusbar.saved')}</span></>
        ) : (
          <><Save size={12} /><span>{t('statusbar.unsaved')}</span></>
        )}
      </div>

      {/* 本地缓存降级/写入失败：常驻提示，不随时间消失（配额满时持久化会静默失效）。
          可点击 —— 悬停给出的出路是「清理本地缓存」，否则报警只是干着急 */}
      {storageWarning && (
        <button
          type="button"
          className="statusbar-item"
          onClick={onStorageWarningClick}
          style={{
            ...chipStyle('color-mix(in srgb, var(--danger) 26%, transparent)'),
            cursor: onStorageWarningClick ? 'pointer' : 'default',
          }}
          title={onStorageWarningClick ? `${storageWarning}\n${t('app.storageCleanupTitle')}` : storageWarning}
        >
          <TriangleAlert size={12} />
        </button>
      )}

      <div className="flex items-center gap-1.5"><span>Markdown</span></div>
      <div className="flex items-center gap-1.5"><span>UTF-8</span></div>
    </div>
  )
}