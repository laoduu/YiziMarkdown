import { invokeTauri, invokeTauriOrThrow } from '../lib/tauri'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { X, Loader2, ChevronRight, FolderOpen, Palette, FileText, Keyboard, Settings2, Eye, EyeOff, Info, Github, History, BookOpen, ExternalLink, Zap, Globe, Puzzle, Bot, Cloud, Boxes, Download, RefreshCw, Presentation, Layers, Sparkles } from 'lucide-react'
import { useSettingsStore } from '../stores/settingsStore'
import { useUpdateStore } from '../stores/updateStore'
import type { UpdateBlocker } from '../lib/updateClient'
import { isManualUpdateChannel } from '../lib/updateClient'
import { renderMarkdown } from '../lib/markdownRenderer'
import { onEditorStorageWarning, getLastEditorStorageWarning } from '../lib/editorStorage'
import { progressRatio, formatBytes } from '../lib/update'
import { SHORTCUT_ACTIONS, getKeybindingsMap, saveKeybindings, getDefaultMap, formatKey, findConflict, getActionLabel } from '../lib/keybindings'
import { RotateCcw } from 'lucide-react'
import { OtherProductsSettings } from './OtherProducts'
import { getAllPlugins, loadPlugin, unloadPlugin } from '../plugins/registry'
import { useI18n, LANGUAGES } from '../i18n'
import { PROVIDERS, providerById } from '../lib/ai-providers'
import {
  hasCredentials,
  getUsername,
  setCredentials,
  clearCredentials,
  testConnection,
} from '../lib/webdav'
import { normalizeBaseUrl } from '../lib/remotePath'
import { liveAnimPreviewCss } from '../lib/liveAnimKeyframes'
import { DEFAULT_THEME } from '../lib/themeOrder'
import { CUSTOM_THEME, applyThemeStyles, readUserCss } from '../lib/themeLoader'
import { sanitizeUserCss } from '../lib/userCss'
import { loadThemeCatalog, type ThemeEntry } from '../lib/themeCatalog'
import { buildThemePreviewCss } from '../lib/themePreview'

const fallbackFonts = [
  'Consolas', 'Courier New', 'Lucida Console', 'Monaco', 'Menlo',
  'Source Code Pro', 'Fira Code', 'JetBrains Mono', 'Cascadia Code',
  'Arial', 'Verdana', 'Segoe UI', 'Times New Roman', 'Georgia',
  'Noto Sans SC', 'Microsoft YaHei', 'SimSun', 'KaiTi',
]

/** 推荐互联网字体（精选适合 Markdown 编辑的中英文字体） */
const webFonts = [
  { name: 'LXGW WenKai', labelKey: 'settings.fontLxgw', descKey: 'settings.fontLxgwDesc', importUrl: "https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.7.0/style.css", family: "'LXGW WenKai', cursive" },
  { name: 'Noto Serif SC', labelKey: 'settings.fontNotoSerif', descKey: 'settings.fontNotoSerifDesc', importUrl: "https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;700&display=swap", family: "'Noto Serif SC', serif" },
  { name: 'Noto Sans SC', labelKey: 'settings.fontNotoSans', descKey: 'settings.fontNotoSansDesc', importUrl: "https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;700&display=swap", family: "'Noto Sans SC', sans-serif" },
  { name: 'Lora', labelKey: 'settings.fontLora', descKey: 'settings.fontLoraDesc', importUrl: "https://fonts.googleapis.com/css2?family=Lora:wght@400;700&display=swap", family: "'Lora', serif" },
  { name: 'Source Han Serif SC', labelKey: 'settings.fontSourceHan', descKey: 'settings.fontSourceHanDesc', importUrl: "https://fonts.googleapis.com/css2?family=Source+Han+Serif+SC:wght@400;700&display=swap", family: "'Source Han Serif SC', serif" },
  { name: 'MiSans', labelKey: 'settings.fontMiSans', descKey: 'settings.fontMiSansDesc', importUrl: "https://cdn.jsdelivr.net/npm/misans@4.0/lib/Normal/MiSans-Regular.min.css", family: "'MiSans', 'Mi Sans', sans-serif" },
]

/** 各面板的默认值（恢复默认时使用） */
const DEFAULTS_GENERAL = { autoSave: true, autoSaveInterval: 60000, defaultTemplate: '' }
const DEFAULTS_APPEARANCE = { currentTheme: DEFAULT_THEME, isDark: false }
const DEFAULTS_EDITOR = {
  liveAnimationMode: 'blur' as const,
  fontFamily: "'MiSans', 'Mi Sans', system-ui, -apple-system, 'PingFang SC', 'Segoe UI', 'Microsoft YaHei', 'Noto Sans SC', sans-serif",
  previewFontFamily: "'MiSans', 'Mi Sans', system-ui, -apple-system, 'PingFang SC', 'Segoe UI', 'Microsoft YaHei', 'Noto Sans SC', sans-serif",
  fontSize: 20, lineHeight: 2.0, previewFontSize: 20, previewLineHeight: 2.0,
  showLineNumbers: true, wordWrap: true,
  cursorStyle: 'bold' as const, mouseSpotlight: true,
}

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  defaultTab?: CategoryKey
}

type CategoryKey = 'general' | 'appearance' | 'editor' | 'liveMode' | 'ai' | 'cloud' | 'plugins' | 'shortcuts' | 'templates' | 'docs' | 'about' | 'products'

const categories: Array<{ key: CategoryKey; labelKey: string; icon: React.ReactNode }> = [
  { key: 'general', labelKey: 'settings.general', icon: <Settings2 size={16} /> },
  { key: 'appearance', labelKey: 'settings.appearance', icon: <Palette size={16} /> },
  { key: 'editor', labelKey: 'settings.editor', icon: <FileText size={16} /> },
  { key: 'liveMode', labelKey: 'settings.liveMode', icon: <Zap size={16} /> },
  { key: 'ai', labelKey: 'settings.ai', icon: <Bot size={16} /> },
  { key: 'cloud', labelKey: 'settings.cloud', icon: <Cloud size={16} /> },
  { key: 'plugins', labelKey: 'settings.plugins', icon: <Puzzle size={16} /> },
  { key: 'shortcuts', labelKey: 'settings.shortcuts', icon: <Keyboard size={16} /> },
  { key: 'templates', labelKey: 'settings.templates', icon: <FolderOpen size={16} /> },
  { key: 'docs', labelKey: 'settings.docs', icon: <BookOpen size={16} /> },
  { key: 'about', labelKey: 'settings.about', icon: <Info size={16} /> },
  { key: 'products', labelKey: 'settings.products', icon: <Boxes size={16} /> },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <h3 className="settings-section-title">{title}</h3>
      <div className="px-5 pb-1 space-y-1">{children}</div>
    </div>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="settings-row">
      <div className="flex-shrink-0">
        <span className="text-[12px] text-[var(--editor-text)]">{label}</span>
        {hint && <p className="text-[10px] text-[var(--sidebar-text)] mt-0.5">{hint}</p>}
      </div>
      <div className="flex-1 flex flex-col gap-1.5 items-end">{children}</div>
    </div>
  )
}

/** 底部操作栏 */
function FooterBar({ hasChanges, onSave, onRestore }: { hasChanges: boolean; onSave: () => void; onRestore: () => void }) {
  const { t } = useI18n()
  return (
    <div className="settings-footer-bar">
      <button onClick={onRestore} className="settings-btn-secondary">{t('common.restoreDefault')}</button>
      <button onClick={onSave} className="settings-btn-primary" disabled={!hasChanges} style={!hasChanges ? { opacity: 0.5 } : undefined}>
        {t('common.save')}
      </button>
    </div>
  )
}

// ===================== 通用设置（改动即时生效并自动保存） =====================
function GeneralSettings() {
  const store = useSettingsStore()
  const { t } = useI18n()
  const [dirs, setDirs] = useState<{ appDir?: string; userConfigDir?: string }>({})
  const [templates, setTemplates] = useState<string[]>([])
  const [isDefaultEditor, setIsDefaultEditor] = useState(false)
  const [associating, setAssociating] = useState(false)

  const currentLang = store.language

  useEffect(() => {
    invokeTauri<Record<string, string>>('get_config_dir').then((d) => {
      if (d) {
        setDirs({ appDir: d.appDir, userConfigDir: d.userConfigDir })
        invokeTauri<string[]>('list_templates').then((l) => setTemplates(l || []))
      }
    })
    invokeTauri<boolean>('is_md_associated').then((v) => setIsDefaultEditor(v || false))
  }, [])

  const handleRestore = () => {
    store.updateSettings({ ...DEFAULTS_GENERAL })
  }

  const handleAssociateChange = async (checked: boolean) => {
    setAssociating(true)
    try {
      if (checked) {
        const ok = await invokeTauri<boolean>('associate_md_files')
        if (ok) setIsDefaultEditor(true)
      } else {
        const ok = await invokeTauri<boolean>('disassociate_md_files')
        if (ok) setIsDefaultEditor(false)
      }
    } catch (e) { console.error('File association failed:', e) }
    setAssociating(false)
  }

  return (
    <>
      <div className="settings-content-scroll">
        <div className="px-5 py-2 text-[11px] text-[var(--sidebar-text)]">{t('settings.instantSaveHint')}</div>
        <div className="space-y-4">
          <Section title={t('settings.language')}>
            <Row label={t('settings.language')} hint={t('settings.languageHint')}>
              <select
                value={currentLang}
                onChange={(e) => store.setField('language', e.target.value)}
                className="settings-select"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.id} value={l.id}>{l.label}</option>
                ))}
              </select>
            </Row>
          </Section>
          <Section title={t('settings.fileAssoc')}>
            <Row label={t('settings.setDefaultEditor')} hint={t('settings.setDefaultEditorHint')}>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={isDefaultEditor} disabled={associating} onChange={(e) => handleAssociateChange(e.target.checked)} className="settings-checkbox" />
                <span className="text-xs text-[var(--editor-text)]">
                  {associating ? t('settings.processing') : isDefaultEditor ? t('settings.isDefault') : t('settings.notAssociated')}
                </span>
              </label>
            </Row>
          </Section>
          <Section title={t('settings.startup')}>
            <Row label={t('settings.defaultTemplate')}>
              <select value={store.defaultTemplate} onChange={(e) => store.setField('defaultTemplate', e.target.value)} className="settings-select">
                <option value="">{t('common.none')}</option>
                {templates.map((t) => <option key={t} value={t}>{t.replace(/\.\w+$/, '')}</option>)}
              </select>
            </Row>
          </Section>
          <Section title={t('settings.saving')}>
            <Row label={t('settings.autoSave')}>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={store.autoSave} onChange={(e) => store.setField('autoSave', e.target.checked)} className="settings-checkbox" />
                <span className="text-xs text-[var(--editor-text)]">{t('settings.autoSave')}</span>
              </label>
            </Row>
            <Row label={t('settings.saveInterval', { n: store.autoSaveInterval / 1000 })}>
              <div className="w-full">
                <input type="range" min="5000" max="180000" step="1000" value={store.autoSaveInterval} onChange={(e) => store.setField('autoSaveInterval', Number(e.target.value))} className="settings-range" />
                <div className="flex justify-between text-[11px] text-[var(--sidebar-text)] mt-0.5"><span>{t('settings.secMin')}</span><span>{t('settings.secMax')}</span></div>
              </div>
            </Row>
          </Section>
          <Section title={t('settings.configDir')}>
            {(dirs.appDir || dirs.userConfigDir) && (
              <div className="px-4 py-2 bg-[var(--editor-surface)] border border-[var(--editor-border)] rounded-lg space-y-2">
                <p className="text-[11px] text-[var(--sidebar-text)]">{t('settings.configDirHint')}</p>
                <div>
                  <p className="text-[11px] text-[var(--sidebar-text)]">{t('settings.appRunDir')}</p>
                  <p className="text-xs text-[var(--editor-text)] font-mono break-all">{dirs.appDir}</p>
                </div>
                <div>
                  <p className="text-[11px] text-[var(--sidebar-text)]">{t('settings.userConfigDirLabel')}</p>
                  <p className="text-xs text-[var(--editor-text)] font-mono break-all">{dirs.userConfigDir}</p>
                </div>
              </div>
            )}
          </Section>
        </div>
      </div>
      <div className="settings-footer-bar">
        <button onClick={handleRestore} className="settings-btn-secondary">{t('common.restoreDefault')}</button>
      </div>
    </>
  )
}

// ===================== 自定义CSS编辑器 =====================
function UserCssEditor({ onSaved }: { onSaved?: () => void }) {
  const { t } = useI18n()
  const currentTheme = useSettingsStore((s) => s.currentTheme)
  const customCssBase = useSettingsStore((s) => s.customCssBase)
  const [cssContent, setCssContent] = useState('')
  const [saved, setSaved] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  useEffect(() => {
    readUserCss().then(setCssContent)
  }, [])

  const handleSave = async () => {
    // 保存前清洗：剥离复制污染（行首行号 / 零宽字符），并把清洗结果回写文本框，
    // 让用户看到「实际保存的内容」—— 否则行号还在框里，下次保存又会带上
    const cleaned = sanitizeUserCss(cssContent)
    if (cleaned !== cssContent) setCssContent(cleaned)
    await invokeTauri('write_user_css', { content: cleaned })
    const { setField } = useSettingsStore.getState()
    // 基底 = 保存时所在的主题。已选中自定义主题时沿用原基底，
    // 否则「在自定义主题上再改一次」会把自定义内容叠到自己身上。
    const base = currentTheme === CUSTOM_THEME ? customCssBase : currentTheme
    const alreadyCustom = currentTheme === CUSTOM_THEME
    setField('customCssBase', base)
    // 清空自定义 CSS ⇒ 回落到基底主题（否则会停在一个没有内容的「自定义主题」上）
    setField('currentTheme', cleaned.trim() ? CUSTOM_THEME : base)
    // 已经选中自定义主题时 currentTheme 不变、App 的 effect 不会重跑，这里显式注入一次
    if (alreadyCustom && cleaned.trim()) await applyThemeStyles(CUSTOM_THEME, base, cleaned)
    setSaved(true); setTimeout(() => setSaved(false), 2000)
    onSaved?.()
  }

  // 清除：先弹二次确认（误点一下就删光 CSS 太危险），确认后才清空文本框 +
  // 删除 user.css + 立即回落到基底主题（等价于「清空后保存」的一步版）
  const handleClear = () => setShowClearConfirm(true)
  const handleClearConfirmed = async () => {
    setShowClearConfirm(false)
    setCssContent('')
    await invokeTauri('write_user_css', { content: '' })
    const { setField } = useSettingsStore.getState()
    const base = currentTheme === CUSTOM_THEME ? customCssBase : currentTheme
    setField('customCssBase', base)
    setField('currentTheme', base)
    setSaved(false)
    onSaved?.()
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-[var(--sidebar-text)]">{t('settings.customCssHint')}</p>
      <textarea value={cssContent} onChange={(e) => { setCssContent(e.target.value); setSaved(false) }}
        className="settings-textarea font-mono" rows={6} spellCheck={false} />
      <div className="flex items-center gap-2">
        <button onClick={handleSave} className="settings-btn-primary">{saved ? t('settings.saved') : t('settings.saveCss')}</button>
        <button onClick={handleClear} className="settings-btn-secondary">{t('settings.clearCss')}</button>
      </div>
      {/* 清除确认弹窗：复用关闭未保存 tab 的弹窗样式（tab-close-dialog） */}
      {showClearConfirm && (
        <div className="tab-close-overlay" onClick={() => setShowClearConfirm(false)}>
          <div className="tab-close-dialog" onClick={(e) => e.stopPropagation()}>
            <p className="tab-close-dialog-title">{t('settings.clearCssTitle')}</p>
            <p className="tab-close-dialog-msg">{t('settings.clearCssMsg')}</p>
            <div className="tab-close-dialog-actions">
              <button className="tab-close-btn-discard" onClick={handleClearConfirmed}>{t('settings.clearCss')}</button>
              <button className="tab-close-btn-cancel" onClick={() => setShowClearConfirm(false)}>{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ===================== 外观设置（即时生效，只保留恢复默认） =====================

/** 卡片上的日/月图标：11px 下内联 SVG 比 ☀/☾ 字形清晰（字形会糊成一团） */
function SunIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="3.1" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
        <line x1="8" y1="1.2" x2="8" y2="3" /><line x1="8" y1="13" x2="8" y2="14.8" />
        <line x1="1.2" y1="8" x2="3" y2="8" /><line x1="13" y1="8" x2="14.8" y2="8" />
        <line x1="3.2" y1="3.2" x2="4.5" y2="4.5" /><line x1="11.5" y1="11.5" x2="12.8" y2="12.8" />
        <line x1="3.2" y1="12.8" x2="4.5" y2="11.5" /><line x1="11.5" y1="4.5" x2="12.8" y2="3.2" />
      </g>
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M10.8 2.2a6.2 6.2 0 1 0 3 8.6 5 5 0 0 1-3-8.6z" fill="currentColor" />
    </svg>
  )
}

interface ThemeCardProps {
  entry: ThemeEntry
  /** 令牌来源键：「自定义主题」用基底主题 id，其余用自身 id */
  previewKey: string
  active: boolean
  darkPreview: boolean
  editable: boolean
  editing: boolean
  editName: string
  onActivate: () => void
  onToggleDark: () => void
  onStartEdit: () => void
  onEditName: (value: string) => void
  onCommitEdit: () => void
  onCancelEdit: () => void
  onShowUpdate: () => void
}

/** 主题卡 = 迷你编辑器窗格：标题栏放主题名/明暗预览/选中勾，正文是诠释 + 配色示例。 */
function ThemeCard({
  entry, previewKey, active, darkPreview, editable, editing, editName,
  onActivate, onToggleDark, onStartEdit, onEditName, onCommitEdit, onCancelEdit, onShowUpdate,
}: ThemeCardProps) {
  const { t } = useI18n()
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={active}
      aria-label={entry.name}
      data-theme-preview={previewKey}
      className={`settings-theme-scope settings-theme-pane${active ? ' is-active' : ''}${darkPreview ? ' is-dark' : ''}`}
      onClick={onActivate}
      onKeyDown={(e) => {
        // 只处理卡片本体；内部输入框/按钮的键盘事件由它们自己处理
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onActivate()
        }
      }}
    >
      <span className="settings-theme-side" aria-hidden="true"><i /><i /><i /></span>
      <span className="settings-theme-main">
        <span className="settings-theme-titlebar">
          <span className="settings-theme-dot" aria-hidden="true" />
          <span className="settings-theme-dot dim" aria-hidden="true" />
          {editing ? (
            <input
              className="settings-theme-name-input"
              value={editName}
              onChange={(e) => onEditName(e.target.value)}
              onBlur={onCommitEdit}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') onCommitEdit()
                if (e.key === 'Escape') onCancelEdit()
              }}
              autoFocus
            />
          ) : (
            <span
              className={`settings-theme-name${editable ? ' editable' : ''}`}
              title={editable ? t('settings.clickToEditName') : entry.name}
              onClick={editable ? (e) => { e.stopPropagation(); onStartEdit() } : undefined}
            >{entry.name}</span>
          )}
          {entry.hasUpdate && (
            <button
              type="button"
              className="settings-theme-new"
              title={t('settings.themeUpdateTitle')}
              onClick={(e) => { e.stopPropagation(); onShowUpdate() }}
            >{t('settings.themeNewVersion')}</button>
          )}
          {/* 仅预览该卡的暗色配色，不写全局 isDark、也不激活主题 */}
          <button
            type="button"
            className="settings-theme-mode"
            title={t('settings.themePreviewToggle')}
            aria-label={t('settings.themePreviewToggle')}
            aria-pressed={darkPreview}
            onClick={(e) => { e.stopPropagation(); onToggleDark() }}
          >{darkPreview ? <MoonIcon /> : <SunIcon />}</button>
          {active && <span className="settings-theme-check" aria-hidden="true">✓</span>}
        </span>
        <span className="settings-theme-doc">
          <span className="settings-theme-desc">{entry.desc || t('settings.customThemeDesc')}</span>
          <span className="settings-theme-line">
            {t('settings.themeSampleText')} <span className="settings-theme-sel">{t('settings.themeSampleSelection')}</span>
          </span>
          <span className="settings-theme-line">
            <code className="settings-theme-code">inline</code>{' '}
            <span className="settings-theme-link">{t('settings.themeSampleLink')}</span>
          </span>
        </span>
        <span className="settings-theme-statusbar" aria-hidden="true"><i /><i /></span>
      </span>
    </div>
  )
}

function AppearanceSettings() {
  const { t } = useI18n()
  const { currentTheme, isDark, customCssBase, setField } = useSettingsStore()
  const [catalog, setCatalog] = useState<ThemeEntry[]>([])
  const [cssById, setCssById] = useState<Record<string, string>>({})
  const [hasUserCss, setHasUserCss] = useState(false)
  const [darkPreview, setDarkPreview] = useState<Record<string, boolean>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [updatePrompt, setUpdatePrompt] = useState<ThemeEntry | null>(null)

  // user.css 是否非空：决定「自定义主题」是否出现（合成条目 = 基底主题 + user.css）
  const refreshUserCssFlag = useCallback(() => {
    readUserCss().then((c) => setHasUserCss(!!c.trim()))
  }, [])

  // 目录是唯一数据源；卡片预览需要每套主题的真实令牌，因此一次性读回全部 CSS
  const refreshCatalog = useCallback(async () => {
    const cat = await loadThemeCatalog()
    setCatalog(cat.themes)
    const keys = new Set<string>([customCssBase])
    for (const entry of cat.themes) keys.add(entry.id)
    const loaded: Record<string, string> = {}
    await Promise.all(Array.from(keys).map(async (id) => {
      loaded[id] = (await invokeTauri<string>('read_theme_css', { name: `${id}.css` })) || ''
    }))
    setCssById(loaded)
  }, [customCssBase])

  useEffect(() => {
    refreshCatalog()
    refreshUserCssFlag()
  }, [refreshCatalog, refreshUserCssFlag])

  // 一张 <style> 容纳所有卡片的作用域令牌；明暗由卡片自己的 .is-dark 切换
  const previewCss = useMemo(() => buildThemePreviewCss([
    // 「自定义主题」按基底主题预览（user.css 只做覆盖，不改变卡片示例的结构）
    { key: CUSTOM_THEME, css: cssById[customCssBase] || '' },
    ...catalog.map((entry) => ({ key: entry.id, css: cssById[entry.id] || '' })),
  ]), [catalog, cssById, customCssBase])

  // 合成条目最前（与旧版列表一致）；user.css 非空或正选中它时才出现
  const customEntry: ThemeEntry | null = (hasUserCss || currentTheme === CUSTOM_THEME) ? {
    id: CUSTOM_THEME,
    name: t('settings.customTheme'),
    desc: t('settings.customThemeDesc'),
    swatch: catalog.find((e) => e.id === customCssBase)?.swatch || [],
    source: 'custom',
    hasUpdate: false,
  } : null
  const themeList = customEntry ? [customEntry, ...catalog] : catalog

  const activate = (id: string) => setField('currentTheme', id)
  const isCardDark = (id: string) => darkPreview[id] ?? isDark
  const toggleDarkPreview = (id: string) =>
    setDarkPreview((prev) => ({ ...prev, [id]: !(prev[id] ?? isDark) }))

  const handleRestore = () => {
    setField('currentTheme', DEFAULTS_APPEARANCE.currentTheme)
    setField('isDark', DEFAULTS_APPEARANCE.isDark)
  }

  const startEdit = (entry: ThemeEntry) => {
    setEditingId(entry.id)
    setEditName(entry.name)
  }

  // 改名写入用户层（`rename_theme`），不再改安装目录的 theme.json
  const commitEdit = async () => {
    const id = editingId
    if (!id) return
    const entry = catalog.find((e) => e.id === id)
    const newName = editName.trim()
    setEditingId(null)
    if (!entry || !newName || newName === entry.name) return
    await invokeTauri('rename_theme', { id, name: newName })
    await refreshCatalog()
  }

  // 内置主题有新版本：useBuiltin=true 用内置新版；false 保留自己的修改并清掉提示
  const resolveUpdate = async (useBuiltin: boolean) => {
    const entry = updatePrompt
    setUpdatePrompt(null)
    if (!entry) return
    await invokeTauri('resolve_theme_update', { id: entry.id, useBuiltin })
    await refreshCatalog()
  }

  return (
    <>
      <style>{previewCss}</style>
      <div className="settings-content-scroll">
        <div className="space-y-4">
          <Section title={t('settings.theme')}>
            <div className="settings-theme-grid">
              {themeList.map((entry) => (
                <ThemeCard
                  key={entry.id}
                  entry={entry}
                  previewKey={entry.id === CUSTOM_THEME ? customCssBase : entry.id}
                  active={currentTheme === entry.id}
                  darkPreview={isCardDark(entry.id)}
                  editable={entry.id !== CUSTOM_THEME}
                  editing={editingId === entry.id}
                  editName={editName}
                  onActivate={() => activate(entry.id)}
                  onToggleDark={() => toggleDarkPreview(entry.id)}
                  onStartEdit={() => startEdit(entry)}
                  onEditName={setEditName}
                  onCommitEdit={commitEdit}
                  onCancelEdit={() => setEditingId(null)}
                  onShowUpdate={() => setUpdatePrompt(entry)}
                />
              ))}
            </div>
            <p className="text-[10px] text-[var(--sidebar-text)] mt-2">{t('settings.themeEditHint')}</p>
          </Section>
          <Section title={t('settings.mode')}>
            <Row label={t('settings.darkMode')}>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={isDark} onChange={(e) => setField('isDark', e.target.checked)} className="settings-checkbox" />
                <span className="text-xs text-[var(--editor-text)]">{t('settings.enableDark')}</span>
              </label>
            </Row>
          </Section>
          <Section title={t('settings.customCss')}>
            <UserCssEditor onSaved={refreshUserCssFlag} />
          </Section>
        </div>
      </div>

      {/* 「内置主题已更新」：保留用户修改（默认安全选项）或改用内置新版 */}
      {updatePrompt && (
        <div className="tab-close-overlay" onClick={() => setUpdatePrompt(null)}>
          <div className="tab-close-dialog" onClick={(e) => e.stopPropagation()}>
            <p className="tab-close-dialog-title">{t('settings.themeUpdateTitle')}</p>
            <p className="tab-close-dialog-msg">{t('settings.themeUpdateMsg', { name: updatePrompt.name })}</p>
            <div className="tab-close-dialog-actions">
              <button className="tab-close-btn-discard" onClick={() => resolveUpdate(true)}>{t('settings.themeUseBuiltin')}</button>
              <button className="tab-close-btn-cancel" onClick={() => resolveUpdate(false)}>{t('settings.themeKeepMine')}</button>
            </div>
          </div>
        </div>
      )}

      <div className="settings-footer-bar">
        <button onClick={handleRestore} className="settings-btn-secondary">{t('common.restoreDefault')}</button>
      </div>
    </>
  )
}

// ===================== 实时模式设置 =====================
function LiveModeSettings() {
  const { t } = useI18n()
  const { liveAnimationMode, setField } = useSettingsStore()
  
  const animations = [
    { key: 'blur' as const, nameKey: 'settings.animFocus', descKey: 'settings.animFocusDesc', cssKey: 'settings.animFocusCss' },
    { key: 'flash' as const, nameKey: 'settings.animFlash', descKey: 'settings.animFlashDesc', cssKey: 'settings.animFlashCss' },
    { key: 'glow' as const, nameKey: 'settings.animGlow', descKey: 'settings.animGlowDesc', cssKey: 'settings.animGlowCss' },
    { key: 'ripple' as const, nameKey: 'settings.animRipple', descKey: 'settings.animRippleDesc', cssKey: 'settings.animRippleCss' },
  ]

  return (
    <>
      <div className="settings-content-scroll">
        <div className="space-y-4">
          <Section title={t('settings.animScheme')}>
            <p className="text-[11px] text-[var(--sidebar-text)] px-5 mb-3">
              {t('settings.animIntro')}
            </p>
            <div className="grid grid-cols-2 gap-3 px-5">
              {animations.map(({ key, nameKey, descKey, cssKey }) => (
                <button
                  key={key}
                  onClick={() => setField('liveAnimationMode', key)}
                  className={`p-4 rounded-xl text-left transition-all ${
                    liveAnimationMode === key
                      ? 'bg-[var(--editor-accent)] text-white shadow-lg shadow-[var(--editor-accent)]/20'
                      : 'bg-[var(--editor-surface)] text-[var(--editor-text)] hover:bg-[var(--editor-hover)] border border-[var(--editor-border)]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm">{t(nameKey)}</span>
                    {liveAnimationMode === key && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-white/20 rounded">{t('common.current')}</span>
                    )}
                  </div>
                  <p className={`text-[11px] ${liveAnimationMode === key ? 'opacity-80' : 'opacity-60'}`}>{t(descKey)}</p>
                  <p className={`text-[10px] mt-2 font-mono ${liveAnimationMode === key ? 'opacity-60' : 'opacity-40'}`}>{t(cssKey)}</p>
                </button>
              ))}
            </div>
          </Section>

          <Section title={t('settings.animPreview')}>
            <div className="px-5">
              <div className="p-4 bg-[var(--editor-bg)] rounded-xl border border-[var(--editor-border)]">
                <div className="text-[11px] text-[var(--sidebar-text)] mb-3">{t('settings.animClickHint')}</div>
                <AnimationDemo mode={liveAnimationMode} />
              </div>
            </div>
          </Section>

          <Section title={t('settings.notes')}>
            <div className="px-5 space-y-2">
              <div className="flex items-start gap-2">
                <span className="text-[var(--editor-accent)] mt-0.5">•</span>
                <p className="text-[11px] text-[var(--sidebar-text)]">{t('settings.animNote1')}</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[var(--editor-accent)] mt-0.5">•</span>
                <p className="text-[11px] text-[var(--sidebar-text)]">{t('settings.animNote2')}</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[var(--editor-accent)] mt-0.5">•</span>
                <p className="text-[11px] text-[var(--sidebar-text)]">{t('settings.animNote3')}</p>
              </div>
            </div>
          </Section>
        </div>
      </div>
      <div className="settings-footer-bar">
        <button onClick={() => setField('liveAnimationMode', 'blur')} className="settings-btn-secondary">{t('common.restoreDefault')}</button>
      </div>
    </>
  )
}

function AnimationDemo({ mode }: { mode: string }) {
  const { t } = useI18n()
  const [active, setActive] = useState(false)
  
  const triggerAnimation = () => {
    setActive(false)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setActive(true))
    })
  }
  
  useEffect(() => {
    triggerAnimation()
  }, [mode])
  
  const animClass = `demo-anim-${mode}`
  
  return (
    <div onClick={triggerAnimation} className="cursor-pointer select-none">
      <style>{liveAnimPreviewCss() + `
        /* .demo-mark 对应真实的 .cm-md-hiding-span（cm-live-render.ts）：
           同为 0.18s ease / max-width 0→5em / opacity 0→1；
           染成强调色是预览的示意设计（让学员看清哪些是标记），参数不再自成一套 */
        .demo-mark {
          display: inline-block;
          overflow: hidden;
          max-width: 0;
          opacity: 0;
          transition: opacity 0.18s ease, max-width 0.18s ease;
          color: var(--editor-accent);
          font-family: var(--font-mono);
          font-size: 0.85em;
        }
        .demo-active .demo-mark {
          max-width: 5em;
          opacity: 1;
        }
      `}</style>
      
      <div className={`space-y-2 ${active ? 'demo-active' : ''}`}>
        <div className="flex items-baseline gap-1">
          <span className="demo-mark"># </span>
          <span className={`text-sm font-bold ${active ? animClass : ''}`}>{t('settings.animDemoH1')}</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="demo-mark">## </span>
          <span className={`text-sm ${active ? animClass : ''}`}>{t('settings.animDemoH2')}</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="demo-mark">- </span>
          <span className={`text-sm ${active ? animClass : ''}`}>{t('settings.animDemoList')}</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="demo-mark">**</span>
          <span className={`text-sm font-bold ${active ? animClass : ''}`}>{t('settings.animDemoBold')}</span>
          <span className="demo-mark">**</span>
        </div>
      </div>
      <p className="text-[10px] text-[var(--sidebar-text)] mt-3 text-center">{t('settings.animReplay')}</p>
    </div>
  )
}

// ===================== 编辑器设置（改动即时生效并自动保存） =====================
const LOCAL_FONTS_CACHE_KEY = 'yizimarkdown.localFonts.v1'
const FONT_PAGE_SIZE = 80

/** 读取本地字体缓存：只在这台机器上缓存，首次仍需用户点一次「加载本地字体」 */
function readLocalFontsCache(): string[] | null {
  try {
    const raw = localStorage.getItem(LOCAL_FONTS_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.every((f) => typeof f === 'string') ? parsed : null
  } catch {
    return null
  }
}

function EditorSettings() {
  const { t } = useI18n()
  const store = useSettingsStore()
  const [systemFonts, setSystemFonts] = useState<string[]>(() => readLocalFontsCache() || fallbackFonts)
  const [fontsLoaded, setFontsLoaded] = useState(() => !!readLocalFontsCache())
  const [fontsLoading, setFontsLoading] = useState(false)
  const [fontFilter, setFontFilter] = useState('')
  const [fontLimit, setFontLimit] = useState(FONT_PAGE_SIZE)
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')

  /**
   * 进入编辑器设置时**不再**自动读取系统字体。
   * macOS 的 `system_profiler SPFontsDataType -json` 要枚举所有字体文件，动辄数秒；
   * 而且一次性渲染上千个字体按钮会同步触发大量字体匹配，面板直接卡住。
   * 改为用户主动点击后读取，结果写入 localStorage，下次进入直接用缓存。
   */
  const loadLocalFonts = async () => {
    setFontsLoading(true)
    try {
      const fonts = await invokeTauri<string[]>('get_system_fonts')
      if (fonts && fonts.length > 0) {
        setSystemFonts(fonts)
        try { localStorage.setItem(LOCAL_FONTS_CACHE_KEY, JSON.stringify(fonts)) } catch { /* 配额不足时忽略缓存 */ }
      }
    } finally {
      setFontsLoaded(true)
      setFontsLoading(false)
    }
  }

  const handleRestore = () => {
    store.updateSettings({ ...DEFAULTS_EDITOR })
  }

  const filtered = fontFilter ? systemFonts.filter(f => f.toLowerCase().includes(fontFilter.toLowerCase())) : systemFonts
  // 只渲染前 N 项：系统字体动辄上千个，全部挂到 DOM 里每个都带 font-family，滚动和打开都会卡
  const visibleFonts = filtered.slice(0, fontLimit)
  const cur = mode === 'edit' ? store.fontFamily : store.previewFontFamily
  const setFont = (v: string) => store.setField(mode === 'edit' ? 'fontFamily' : 'previewFontFamily', v)
  // 底部预览：左源码 / 右预览，两侧都渲染真正的设置值（不是写死的示例）
  const sourceSampleLines = t('settings.sourceSampleText').split('\n')

  return (
    <>
      <div className="settings-content-scroll">
        <div className="px-5 py-2 text-[11px] text-[var(--sidebar-text)]">{t('settings.instantSaveHint')}</div>
        <div className="space-y-4">
          <Section title={t('settings.sourceLayout')}>
            <Row label={t('settings.fontSize', { n: store.fontSize })}>
              <div className="w-full">
                <input type="range" min="12" max="32" value={store.fontSize} onChange={(e) => store.setField('fontSize', Number(e.target.value))} className="settings-range" />
                <div className="flex justify-between text-[11px] text-[var(--sidebar-text)] mt-0.5"><span>12px</span><span>32px</span></div>
              </div>
            </Row>
            <Row label={t('settings.lineHeight', { n: store.lineHeight })}>
              <div className="w-full">
                <input type="range" min="1.2" max="3.0" step="0.1" value={store.lineHeight} onChange={(e) => store.setField('lineHeight', Number(e.target.value))} className="settings-range" />
                <div className="flex justify-between text-[11px] text-[var(--sidebar-text)] mt-0.5"><span>1.2</span><span>3.0</span></div>
              </div>
            </Row>
          </Section>
          <Section title={t('settings.cursor')}>
            <Row label={t('settings.cursorStyle')}>
              <select className="settings-select" value={store.cursorStyle}
                onChange={(e) => store.setField('cursorStyle', e.target.value as 'text' | 'bold')}>
                <option value="bold">{t('settings.cursorStyleBold')}</option>
                <option value="text">{t('settings.cursorStyleText')}</option>
              </select>
            </Row>
            <Row label={t('settings.mouseSpotlight')} hint={t('settings.mouseSpotlightHint')}>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={store.mouseSpotlight}
                  onChange={(e) => store.setField('mouseSpotlight', e.target.checked)} className="settings-checkbox" />
              </label>
            </Row>
          </Section>
          <Section title={t('settings.previewLayout')}>
            <Row label={t('settings.fontSize', { n: store.previewFontSize })}>
              <div className="w-full">
                <input type="range" min="12" max="32" value={store.previewFontSize} onChange={(e) => store.setField('previewFontSize', Number(e.target.value))} className="settings-range" />
                <div className="flex justify-between text-[11px] text-[var(--sidebar-text)] mt-0.5"><span>12px</span><span>32px</span></div>
              </div>
            </Row>
            <Row label={t('settings.lineHeight', { n: store.previewLineHeight })}>
              <div className="w-full">
                <input type="range" min="1.2" max="3.0" step="0.1" value={store.previewLineHeight} onChange={(e) => store.setField('previewLineHeight', Number(e.target.value))} className="settings-range" />
                <div className="flex justify-between text-[11px] text-[var(--sidebar-text)] mt-0.5"><span>1.2</span><span>3.0</span></div>
              </div>
            </Row>
          </Section>
          <Section title={t('settings.display')}>
            <Row label={t('settings.showLineNumbers')}>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={store.showLineNumbers} onChange={(e) => store.setField('showLineNumbers', e.target.checked)} className="settings-checkbox" />
              </label>
            </Row>
            <Row label={t('settings.wordWrap')}>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={store.wordWrap} onChange={(e) => store.setField('wordWrap', e.target.checked)} className="settings-checkbox" />
              </label>
            </Row>
          </Section>
          
          <Section title={t('settings.font')}>
            <div className="flex gap-2 mb-2">
              {(['edit', 'preview'] as const).map((m) => (
                <button key={m} onClick={() => setMode(m)}
                  className={`px-2.5 py-1 text-[12px] rounded-md transition-colors ${mode === m ? 'bg-[var(--editor-accent)] text-white' : 'bg-[var(--editor-surface)] text-[var(--sidebar-text)] hover:bg-[var(--editor-hover)]'}`}>
                  {m === 'edit' ? t('settings.sourceMode') : t('settings.previewMode')}
                </button>
              ))}
            </div>
            {/* 推荐互联网字体 */}
            <div className="grid grid-cols-2 gap-1.5 mb-2">
              {webFonts.map((wf) => {
                const isActive = cur.includes(wf.name)
                return (
                  <button key={wf.name} onClick={() => {
                    // 动态加载字体
                    if (!document.querySelector(`link[href="${wf.importUrl}"]`)) {
                      const link = document.createElement('link')
                      link.rel = 'stylesheet'
                      link.href = wf.importUrl
                      document.head.appendChild(link)
                    }
                    setFont(`${wf.family}`)
                  }}
                    className={`px-2.5 py-1.5 text-left rounded-lg border transition-all ${
                      isActive
                        ? 'bg-[var(--editor-accent)] border-[var(--editor-accent)] text-white'
                        : 'bg-[var(--editor-surface)] border-[var(--editor-border)] text-[var(--editor-text)] hover:border-[var(--editor-accent)]'
                    }`}>
                    <span className="text-[11px] font-medium block" style={{ fontFamily: wf.family }}>{t(wf.labelKey)}</span>
                    <span className={`text-[9px] ${isActive ? 'text-white/70' : 'text-[var(--sidebar-text)]'}`}>{t(wf.descKey)}</span>
                  </button>
                )
              })}
            </div>
            <div className="flex items-center gap-2 mb-1.5">
              {!fontsLoaded
                ? <p className="flex-1 text-[11px] leading-snug text-[var(--sidebar-text)]">{t('settings.localFontsHint')}</p>
                : <span className="flex-1" />}
              <button onClick={loadLocalFonts} disabled={fontsLoading} className="settings-btn-secondary shrink-0" style={{ padding: '3px 9px', fontSize: 11 }}>
                {fontsLoading ? <span className="inline-flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> {t('common.loading')}</span> : t('settings.loadLocalFonts')}
              </button>
            </div>
            <input
              type="text"
              value={fontFilter}
              onChange={(e) => { setFontFilter(e.target.value); setFontLimit(FONT_PAGE_SIZE) }}
              placeholder={t('settings.searchLocalFonts')}
              className="settings-input"
            />
            <div className="border border-[var(--editor-border)] rounded-lg overflow-hidden bg-[var(--editor-surface)] mt-1.5" style={{ maxHeight: '150px', overflowY: 'auto' }}>
              {visibleFonts.map((f) => (
                <button key={f} onClick={() => setFont(`'${f}', sans-serif`)}
                  className={`w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--editor-hover)] flex items-center justify-between ${cur.includes(f) ? 'bg-[var(--editor-accent)] text-white' : 'text-[var(--editor-text)]'}`}>
                  <span>{f}</span><span className="text-[11px] opacity-60" style={{ fontFamily: `'${f}', sans-serif` }}>Aa</span>
                </button>
              ))}
              {filtered.length === 0 && <div className="px-3 py-3 text-xs text-[var(--sidebar-text)] text-center">{t('common.noMatch')}</div>}
              {filtered.length > fontLimit && (
                <button onClick={() => setFontLimit((n) => n + FONT_PAGE_SIZE)} className="w-full px-3 py-2 text-[11px] text-[var(--editor-accent)] hover:bg-[var(--editor-hover)]">
                  {t('settings.showMoreFonts')} ({filtered.length - fontLimit})
                </button>
              )}
            </div>
            <input type="text" value={cur} onChange={(e) => setFont(e.target.value)} placeholder={t('settings.manualFont')} className="settings-input mt-1.5" />
          </Section>
          <Section title={t('settings.preview')}>
            {/* 左源码 / 右预览：本页的字体、字号、行距、行号、换行、鼠标指针样式全部按当前设置实时渲染 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-[var(--editor-border)] overflow-hidden">
                <div className="px-3 py-1.5 text-[11px] text-[var(--sidebar-text)] bg-[var(--editor-surface)] border-b border-[var(--editor-border)]">{t('settings.sourceMode')}</div>
                <div
                  className="p-2.5 overflow-x-auto"
                  style={{
                    fontFamily: store.fontFamily,
                    fontSize: `${store.fontSize}px`,
                    lineHeight: store.lineHeight,
                    background: 'var(--editor-bg)',
                    color: 'var(--editor-text)',
                    // 鼠标指针与真实编辑器同源（themeCursor 注入的两档主题色 I-beam），移上来即可看到所选样式
                    cursor: store.cursorStyle === 'bold'
                      ? 'var(--cursor-bold, text)'
                      : 'var(--cursor-standard, var(--cursor-bold, text))',
                  }}
                >
                  <div className="flex">
                    {store.showLineNumbers && (
                      <div className="select-none text-right opacity-40 pr-2 mr-2 shrink-0" style={{ borderRight: '1px solid var(--editor-border)' }}>
                        {sourceSampleLines.map((_, i) => (<div key={i}>{i + 1}</div>))}
                      </div>
                    )}
                    <div style={{ whiteSpace: store.wordWrap ? 'pre-wrap' : 'pre' }}>
                      {sourceSampleLines.map((line, i) => (<div key={i}>{line}</div>))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-[var(--editor-border)] overflow-hidden">
                <div className="px-3 py-1.5 text-[11px] text-[var(--sidebar-text)] bg-[var(--editor-surface)] border-b border-[var(--editor-border)]">{t('settings.previewMode')}</div>
                <div
                  className="p-2.5"
                  style={{
                    fontFamily: store.previewFontFamily,
                    fontSize: `${store.previewFontSize}px`,
                    lineHeight: store.previewLineHeight,
                    background: 'var(--editor-bg)',
                    color: 'var(--editor-text)',
                    minHeight: '110px',
                  }}
                >
                  {/* sampleText 是词典里的渲染示例 HTML（<strong>/<a>/<code>），内容自有且静态，可安全直出 */}
                  <p className="m-0" dangerouslySetInnerHTML={{ __html: t('settings.sampleText') }} />
                </div>
              </div>
            </div>
          </Section>
        </div>
      </div>
      <div className="settings-footer-bar">
        <button onClick={handleRestore} className="settings-btn-secondary">{t('common.restoreDefault')}</button>
      </div>
    </>
  )
}

// ===================== 快捷键设置（可视化面板） =====================
function ShortcutsSettings() {
  const { t } = useI18n()
  const [map, setMap] = useState<Record<string, string>>({})
  const [originalMap, setOriginalMap] = useState<Record<string, string>>({})
  const [recordingId, setRecordingId] = useState<string | null>(null)
  const initialized = useRef(false)

  // 初始化
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    const current = getKeybindingsMap()
    setMap({ ...current })
    setOriginalMap({ ...current })
  }, [])

  // 计算所有冲突
  const conflicts: Record<string, string> = {}
  for (const action of SHORTCUT_ACTIONS) {
    const key = map[action.id] || ''
    if (!key) continue
    const dup = findConflict(key, map, action.id)
    if (dup) conflicts[action.id] = dup
  }
  const hasConflict = Object.keys(conflicts).length > 0

  const hasChanges = JSON.stringify(map) !== JSON.stringify(originalMap)

  const handleSave = async () => {
    if (hasConflict) return
    await saveKeybindings(map)
    setOriginalMap({ ...map })
  }

  const handleRestore = () => {
    const defaults = getDefaultMap()
    setMap({ ...defaults })
    setOriginalMap({ ...defaults })
  }

  // 按键录制
  useEffect(() => {
    if (!recordingId) return
    const handler = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') { setRecordingId(null); return }
      const hasModifier = e.ctrlKey || e.metaKey || e.shiftKey || e.altKey
      const isFnKey = e.key.startsWith('F') && e.key.length <= 3 && !isNaN(Number(e.key.slice(1)))
      if (!hasModifier && !isFnKey) return
      const parts: string[] = []
      if (e.ctrlKey || e.metaKey) parts.push('ctrl')
      if (e.shiftKey) parts.push('shift')
      if (e.altKey) parts.push('alt')
      let key = e.key
      if (e.code && e.code.startsWith('Key')) key = e.code.slice(3).toLowerCase()
      else if (e.code && e.code.startsWith('Digit')) key = e.code.slice(5)
      else if (key.length === 1) key = key.toLowerCase()
      else key = key.toLowerCase()
      if (['control', 'shift', 'alt', 'meta'].includes(key)) return
      parts.push(key)
      const combo = parts.join('+')
      if (combo) setMap(prev => ({ ...prev, [recordingId]: combo }))
      setRecordingId(null)
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [recordingId])

  const categories = [...new Set(SHORTCUT_ACTIONS.map(a => a.categoryKey))]

  return (
    <>
      <div className="settings-content-scroll">
        <div className="space-y-4">
          <Section title={t('settings.shortcutConfig')}>
            <p className="text-[10px] text-[var(--sidebar-text)] pb-2">{t('settings.shortcutHint')}</p>
            {hasConflict && (
              <div className="px-4 py-2 bg-amber-50 border border-amber-300 rounded-lg">
                <p className="text-[11px] text-amber-700 font-medium">{t('settings.shortcutConflict')}</p>
                {Object.entries(conflicts).map(([id, dupId]) => (
                  <p key={id} className="text-[10px] text-amber-600 mt-0.5">
                    {t('settings.conflictMsg', { a: getActionLabel(id), k: formatKey(map[id]), b: getActionLabel(dupId) })}
                  </p>
                ))}
              </div>
            )}
          </Section>
          {categories.map(cat => (
            <Section key={cat} title={t(cat)}>
              <div className="space-y-0.5">
                {SHORTCUT_ACTIONS.filter(a => a.categoryKey === cat).map(action => {
                  const currentKey = map[action.id] || ''
                  const defaultKey = action.defaultKey
                  const isConflict = !!conflicts[action.id]
                  return (
                  <div key={action.id} className="settings-row">
                    <div className="flex-shrink-0">
                      <span className="text-[12px] text-[var(--editor-text)]">{t(action.labelKey)}</span>
                      {action.id === 'viewCycle' && (
                        <span className="text-[9px] text-[var(--sidebar-text)] ml-1">{t('settings.viewCycleOrder')}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setRecordingId(action.id)}
                        className={`min-w-[80px] px-2.5 py-1 text-[11px] font-mono rounded-md border transition-colors ${
                          isConflict
                            ? 'border-red-400 bg-red-50 text-red-600'
                            : recordingId === action.id
                              ? 'border-[var(--editor-accent)] bg-[var(--editor-accent)]/10 text-[var(--editor-accent)] animate-pulse'
                              : 'border-[var(--editor-border)] bg-[var(--editor-surface)] text-[var(--editor-text)] hover:bg-[var(--editor-hover)]'
                        }`}
                        title={currentKey ? t('settings.clickToReRecord') : t('settings.clickToSet')}
                      >
                        {recordingId === action.id ? t('settings.clickToRecord') : formatKey(currentKey || defaultKey)}
                      </button>
                      {currentKey !== defaultKey && currentKey && (
                        <button onClick={() => setMap(prev => ({ ...prev, [action.id]: defaultKey }))}
                          className="p-1 rounded hover:bg-[var(--editor-hover)] text-[var(--sidebar-text)]" title={t('settings.resetShortcut')}>
                          <RotateCcw size={11} />
                        </button>
                      )}
                      {currentKey && (
                        <button onClick={() => setMap(prev => ({ ...prev, [action.id]: '' }))}
                          className="p-1 rounded hover:bg-[var(--editor-hover)] text-[var(--sidebar-text)]" title={t('settings.clearShortcut')}>
                          <X size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                )})}
              </div>
            </Section>
          ))}
        </div>
      </div>
      <FooterBar hasChanges={hasChanges} onSave={handleSave} onRestore={handleRestore} />
    </>
  )
}

function TemplatesSettings() {
  const { t } = useI18n()
  const [templates, setTemplates] = useState<string[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [tContent, setTContent] = useState('')
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [editName, setEditName] = useState('')

  const refresh = useCallback(async () => { const l = await invokeTauri<string[]>('list_templates'); setTemplates(l || []) }, [])

  useEffect(() => { refresh() }, [refresh])

  const load = async (name: string) => { const c = await invokeTauri<string>('read_template', { name }); if (c) { setTContent(c); setSelected(name); setEditing(false) } }
  const handleNew = () => { setEditContent('# 新模板\n\n'); setEditName('new-template.md'); setEditing(true) }
  const handleEdit = () => { setEditContent(tContent); setEditName(selected || ''); setEditing(true) }
  const handleSave = async () => {
    const name = editName.trim()
    if (!name) return
    const n = name.endsWith('.md') ? name : `${name}.md`
    // 写入用户文档目录（~/Documents/yizimarkdown/templates/），卸载重装不丢
    await invokeTauri('write_template', { name: n, content: editContent })
    await refresh(); setSelected(n); setTContent(editContent); setEditing(false)
  }

  return (
    <div className="settings-content-scroll">
      <div className="space-y-4">
        <Section title={t('settings.docTemplates')}>
          <div className="flex items-center justify-between pb-2">
            <p className="text-[11px] text-[var(--sidebar-text)]">{t('settings.templateHint')}</p>
            <button onClick={handleNew} className="text-[11px] text-[var(--editor-accent)] hover:underline">{t('settings.newTemplate')}</button>
          </div>
          {editing ? (
            <div className="space-y-2">
              <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="settings-input" placeholder={t('settings.templateName')} />
              <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} className="settings-textarea font-mono" rows={10} />
              <div className="flex gap-2">
                <button onClick={handleSave} className="settings-btn-primary">{t('common.save')}</button>
                <button onClick={() => setEditing(false)} className="settings-btn-secondary">{t('common.cancel')}</button>
              </div>
            </div>
          ) : (
            <div className="flex gap-3">
              <div className="w-44 border border-[var(--editor-border)] rounded-lg overflow-hidden bg-[var(--editor-surface)]" style={{ maxHeight: '260px', overflowY: 'auto' }}>
                {templates.map((tmpl) => (
                  <button key={tmpl} onClick={() => load(tmpl)} className={`w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--editor-hover)] flex items-center gap-2 ${selected === tmpl ? 'bg-[var(--editor-accent)] text-white' : 'text-[var(--editor-text)]'}`}>
                    <span className="truncate flex-1">{tmpl.replace(/\.\w+$/, '')}</span><Eye size={11} className="opacity-50 flex-shrink-0" />
                  </button>
                ))}
                {templates.length === 0 && <div className="px-3 py-3 text-xs text-[var(--sidebar-text)] text-center">{t('settings.noTemplates')}</div>}
              </div>
              <div className="flex-1 relative">
                {selected && <div className="absolute top-1 right-1"><button onClick={handleEdit} className="text-[11px] text-[var(--editor-accent)] hover:underline px-2 py-1">{t('settings.edit')}</button></div>}
                {selected ? <textarea value={tContent} readOnly className="settings-textarea font-mono opacity-80" rows={12} />
                  : <div className="flex items-center justify-center h-36 text-xs text-[var(--sidebar-text)] border border-[var(--editor-border)] rounded-lg bg-[var(--editor-surface)]">{t('settings.selectToPreview')}</div>}
              </div>
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}

// ===================== 插件设置 =====================
function PluginsSettings() {
  const { t } = useI18n()
  const store = useSettingsStore()
  const plugins = getAllPlugins()
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set())
  const initialized = useRef(false)

  // 初始化：确保启用的插件已加载
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true
      for (const id of store.enabledPlugins) {
        loadPlugin(id)
      }
    }
  }, [])

  const handleToggle = async (pluginId: string, enable: boolean) => {
    if (enable) {
      setLoadingIds(prev => new Set(prev).add(pluginId))
      const ok = await loadPlugin(pluginId)
      setLoadingIds(prev => { const s = new Set(prev); s.delete(pluginId); return s })
      if (ok) {
        store.updateSettings({
          enabledPlugins: [...new Set([...store.enabledPlugins, pluginId])],
        })
      }
    } else {
      await unloadPlugin(pluginId)
      store.updateSettings({
        enabledPlugins: store.enabledPlugins.filter(id => id !== pluginId),
      })
    }
  }

  const handleConfigChange = (pluginId: string, key: string, value: unknown) => {
    const currentConfigs = { ...store.pluginConfigs }
    const pluginConfig = { ...(currentConfigs[pluginId] || {}) }
    pluginConfig[key] = value
    currentConfigs[pluginId] = pluginConfig
    store.updateSettings({ pluginConfigs: currentConfigs })
  }

  return (
    <div className="settings-content-scroll">
      <div className="space-y-4">
        <Section title={t('settings.pluginMgmt')}>
          <p className="text-[11px] text-[var(--sidebar-text)] px-5 mb-3">
            {t('settings.pluginHint')}
          </p>
          <div className="px-5 space-y-2">
            {plugins.map((plugin) => {
              const isEnabled = store.enabledPlugins.includes(plugin.id)
              const isLoading = loadingIds.has(plugin.id)
              const configs = store.pluginConfigs[plugin.id] || {}

              return (
                <div
                  key={plugin.id}
                  className={`border rounded-lg overflow-hidden transition-colors ${
                    isEnabled
                      ? 'border-[var(--editor-accent)] bg-[var(--editor-accent)]/5'
                      : 'border-[var(--editor-border)] bg-[var(--editor-surface)]'
                  }`}
                >
                  {/* 插件头部：名称 + 开关 */}
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[var(--editor-text)]">{plugin.nameKey ? t(plugin.nameKey) : plugin.name}</span>
                        {isEnabled && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-[var(--editor-accent)] text-white rounded">
                            {t('common.enabled')}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[var(--sidebar-text)] mt-0.5">{plugin.descriptionKey ? t(plugin.descriptionKey) : plugin.description}</p>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer ml-4 flex-shrink-0">
                      {isLoading ? (
                        <Loader2 size={16} className="animate-spin text-[var(--sidebar-text)]" />
                      ) : (
                        <input
                          type="checkbox"
                          checked={isEnabled}
                          onChange={(e) => handleToggle(plugin.id, e.target.checked)}
                          className="settings-checkbox"
                        />
                      )}
                    </label>
                  </div>

                  {/* 插件配置区域 */}
                  {isEnabled && plugin.configFields && plugin.configFields.length > 0 && (
                    <div className="border-t border-[var(--editor-border)] bg-[var(--editor-bg)] px-4 py-3 space-y-2">
                      {plugin.configFields.map((field) => (
                        <div key={field.key} className="settings-row">
                          <div className="flex-shrink-0">
                            <span className="text-[12px] text-[var(--editor-text)]">{field.labelKey ? t(field.labelKey) : field.label}</span>
                            {field.hint && (
                              <p className="text-[10px] text-[var(--sidebar-text)] mt-0.5">{field.hintKey ? t(field.hintKey) : field.hint}</p>
                            )}
                          </div>
                          <div className="flex-1 flex flex-col items-end gap-1.5">
                            {field.type === 'select' && field.options && (
                              <select
                                value={String(configs[field.key] ?? field.defaultValue)}
                                onChange={(e) => handleConfigChange(plugin.id, field.key, e.target.value)}
                                className="settings-select"
                              >
                                {field.options.map((opt) => (
                                  <option key={opt.value} value={opt.value}>{opt.labelKey ? t(opt.labelKey) : opt.label}</option>
                                ))}
                              </select>
                            )}
                            {field.type === 'checkbox' && (
                              <input
                                type="checkbox"
                                checked={Boolean(configs[field.key] ?? field.defaultValue)}
                                onChange={(e) => handleConfigChange(plugin.id, field.key, e.target.checked)}
                                className="settings-checkbox"
                              />
                            )}
                            {field.type === 'number' && (
                              <input
                                type="number"
                                min={field.min}
                                max={field.max}
                                step={field.step}
                                value={Number(configs[field.key] ?? field.defaultValue)}
                                onChange={(e) => handleConfigChange(plugin.id, field.key, Number(e.target.value))}
                                className="settings-input"
                                style={{ width: '100px', textAlign: 'right' }}
                              />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Section>
      </div>
    </div>
  )
}

// ===================== 在线更新（v0.3.4） =====================
/**
 * 不能自动更新的原因 → 文案键。
 *
 * 明确映射而不是拼字符串：拼出来的键漏一个，界面上就会把 `settings.updateBlockerXxx`
 * 这种原始键名直接显示给用户。映射里没有的（浏览器里打开时的 `not-tauri`）退回「未识别」。
 */
const UPDATE_BLOCKER_KEYS: Record<UpdateBlocker, string> = {
  'dev': 'settings.updateBlockerDev',
  'not-tauri': 'settings.updateBlockerUnknown',
  'not-windows': 'settings.updateBlockerNotWindows',
  'msi': 'settings.updateBlockerMsi',
  'portable': 'settings.updateBlockerPortable',
  'unknown': 'settings.updateBlockerUnknown',
}

/**
 * 「版本与更新」里的更新卡片。
 *
 * 只回答三件事：这台机器能不能自动更新（不能就说清为什么）、有没有新版本（有就连更新说明一起渲染）、
 * 要不要现在装。所有状态都在 `stores/updateStore.ts`，这里只负责画。
 *
 * 一条有意为之的文案：「编辑内容已实时保存」——正文是**每次按键**就落本地缓存的
 * （见 lib/editorStorage.ts），所以安装前不需要弹窗拦着用户保存，这句话就是那个弹窗的替代品。
 */
function UpdateCard() {
  const { t } = useI18n()
  const store = useSettingsStore()
  const currentTheme = useSettingsStore((s) => s.currentTheme)
  const status = useUpdateStore((s) => s.status)
  const blocker = useUpdateStore((s) => s.blocker)
  const update = useUpdateStore((s) => s.update)
  const downloaded = useUpdateStore((s) => s.downloaded)
  const total = useUpdateStore((s) => s.total)
  const error = useUpdateStore((s) => s.error)
  const errorPhase = useUpdateStore((s) => s.errorPhase)

  // 打开卡片就查一次。启动时自动检查过的话状态已不是 idle，不会重复问网络。
  useEffect(() => {
    if (useUpdateStore.getState().status === 'idle') void useUpdateStore.getState().check(true)
  }, [])

  // 本地缓存已经写不进去时，「编辑内容已实时保存」这句话就是**假的** —— 不能这么说。
  // 这是本进程内的降级标记（见 lib/editorStorage.ts）：挂载时补读一次，并订阅后续变化。
  const [storageLost, setStorageLost] = useState(() => getLastEditorStorageWarning()?.level === 'lost')
  useEffect(() => onEditorStorageWarning((w) => setStorageLost(w.level === 'lost')), [])

  const busy = status === 'checking' || status === 'downloading'
  const ratio = progressRatio(downloaded, total)
  const notesHtml = useMemo(() => (update?.notes ? renderMarkdown(update.notes) : ''), [update?.notes])
  // macOS / 便携版：查得到、装不了 —— 卡片改成「打开下载页」，不画「立即更新」
  const manualChannel = isManualUpdateChannel(blocker)

  const muted: React.CSSProperties = { fontSize: 11, color: 'var(--sidebar-text)', margin: '6px 0 0', lineHeight: 1.5 }
  const smallBtn: React.CSSProperties = { padding: '4px 10px', fontSize: 12, flexShrink: 0 }

  const renderBody = () => {
    if (status === 'checking') return <p style={muted}>{t('settings.updateChecking')}</p>
    if (status === 'installed') return <p style={muted}>{t('settings.updateInstalling')}</p>
    if (status === 'error') {
      // 「检查更新失败」和「更新装不上」不是一个问题：前者查清单就挂了，
      // 后者是下载/签名。文案与重试动作都按阶段分开（errorPhase 由状态机记录）
      const installFailed = errorPhase === 'install'
      return (
        <>
          <p style={{ ...muted, color: 'var(--danger)' }}>
            {installFailed
              ? t('settings.updateInstallFailed', { msg: error ?? '' })
              : t('settings.updateFailed', { msg: error ?? '' })}
          </p>
          <button
            onClick={() => {
              // 装不上就原地重试安装（更新信息还在），检查失败才重新问网络
              if (installFailed) void useUpdateStore.getState().install()
              else void useUpdateStore.getState().check(true)
            }}
            className="settings-btn-secondary" style={{ ...smallBtn, marginTop: 6 }}>
            {installFailed ? t('settings.updateRetry') : t('settings.updateCheck')}
          </button>
        </>
      )
    }
    if (status === 'downloading') {
      return (
        <>
          <div style={{ height: 4, borderRadius: 2, background: 'var(--editor-border)', overflow: 'hidden', margin: '8px 0 0' }}>
            {/* 总大小未知时不画假的进度条：宁可只让用户看到「已下载多少」，
                也不要画一个停着不动的 0% 让人以为卡死了 */}
            {ratio !== null && (
              <div style={{ width: `${Math.round(ratio * 100)}%`, height: '100%', background: 'var(--editor-accent)', transition: 'width 0.2s' }} />
            )}
          </div>
          <p style={muted}>
            {t('settings.updateDownloading')}{' '}
            {total
              ? t('settings.updateProgress', { done: formatBytes(downloaded), total: formatBytes(total) })
              : t('settings.updateDownloaded', { done: formatBytes(downloaded) })}
          </p>
        </>
      )
    }
    if (status === 'latest') {
      return (
        <>
          <p style={muted}>{t('settings.updateLatest')}</p>
          {/* 手动通道没有「一键更新」可点，说明清楚怎么更新，免得用户以为功能坏了 */}
          {manualChannel && <p style={muted}>{t('update.manualHint')}</p>}
        </>
      )
    }
    if (!update) {
      // 没结果时把「为什么不能自动更新」说清楚（dev / MSI / 浏览器）；
      // 手动通道（macOS / 便携版）此时是 idle，同样需要这句解释
      return blocker
        ? <p style={muted}>{t(UPDATE_BLOCKER_KEYS[blocker] ?? 'settings.updateBlockerUnknown')}</p>
        : null
    }
    const manual = update.mode === 'manual'
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <Download size={14} style={{ color: 'var(--editor-accent)', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--editor-text)', flex: 1 }}>
            {t('settings.updateFound', { v: update.version })}
          </span>
          {manual ? (
            <button onClick={() => void useUpdateStore.getState().openDownloadPage()} className="settings-btn-primary" style={smallBtn}>
              {t('update.downloadPage')}
            </button>
          ) : (
            <button onClick={() => void useUpdateStore.getState().install()} className="settings-btn-primary" style={smallBtn}>
              {t('settings.updateInstall')}
            </button>
          )}
          <button onClick={() => void useUpdateStore.getState().skip()} className="settings-btn-secondary" style={smallBtn}>
            {t('settings.updateSkip')}
          </button>
        </div>
        {status === 'skipped' && <p style={muted}>{t('settings.updateSkipped', { v: update.version })}</p>}
        {manual ? (
          <p style={muted}>{t('update.manualHint')}</p>
        ) : (
          // 两个键都写成 t('字面量') 的直调形式：check-i18n 只认这种形状，
          // 写成 t(cond ? 'a' : 'b') 会让两个键都变成「没人用」而漏掉检查
          <p style={muted}>
            {storageLost ? t('settings.updateAutoRestoreLost') : t('settings.updateAutoRestore')}
          </p>
        )}
        {notesHtml && (
          <>
            <p style={{ ...muted, marginTop: 10, fontWeight: 600 }}>{t('settings.updateNotes')}</p>
            {/* 高度自适应：这里**不能**限高内滚 —— 更新说明常有几十行，内层再套一根滚动条
                就成了「面板里滚着一段、里面还有一段」，用户不知道该滚哪个。让它自然撑开，
                由外层 .settings-content-scroll 统一滚（外观见 globals.css 的 .update-notes） */}
            <div
              className={`update-notes editor-content prose max-w-none theme-${currentTheme}`}
              dangerouslySetInnerHTML={{ __html: notesHtml }}
            />
          </>
        )}
      </>
    )
  }

  return (
    <div style={{ margin: '0 24px 12px', padding: '12px 14px', borderRadius: 10, background: 'var(--editor-hover)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <RefreshCw size={14} style={{ color: 'var(--editor-accent)', flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--editor-text)', flex: 1 }}>
          {t('settings.updateTitle')}
        </span>
        {/* 不能自动更新的环境不给「检查更新」按钮：点了也不会有结果。
            例外是手动通道（macOS / 便携版）——它们查得到版本，只是装不了 */}
        {(!blocker || manualChannel) && status !== 'downloading' && status !== 'installed' && (
          <button
            onClick={() => void useUpdateStore.getState().check(true)}
            disabled={busy}
            className="settings-btn-secondary"
            style={{ ...smallBtn, opacity: busy ? 0.5 : 1 }}
          >
            {status === 'checking' ? t('settings.updateChecking') : t('settings.updateCheck')}
          </button>
        )}
      </div>

      {renderBody()}

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, cursor: 'pointer' }}>
        <input
          type="checkbox"
          className="settings-checkbox"
          checked={store.autoCheckUpdate}
          onChange={(e) => {
            const on = e.target.checked
            store.setField('autoCheckUpdate', on)
            // 刚打开这个开关 ⇒ 当场查一次，别让用户等下次启动
            if (on && useUpdateStore.getState().status === 'idle') void useUpdateStore.getState().check(true)
          }}
        />
        <span style={{ fontSize: 11, color: 'var(--sidebar-text)' }}>{t('settings.updateAutoCheck')}</span>
      </label>
    </div>
  )
}

// ===================== 关于 =====================
// ===================== 文档集合（帮助中心 / 演示语法 / 主题规范 / 技能规范） =====================
function DocumentationSettings() {
  const { t } = useI18n()
  const openUrl = (url: string) => invokeTauri('open_url', { url })

  const docs = [
    { key: 'docsHelp', icon: <BookOpen size={16} />, url: 'https://md.yizigpt.com/help.html', label: t('settings.docsHelp') },
    { key: 'docsSlideshow', icon: <Presentation size={16} />, url: 'https://md.yizigpt.com/slideshow-syntax.html', label: t('settings.docsSlideshow') },
    { key: 'docsTheme', icon: <Layers size={16} />, url: 'https://md.yizigpt.com/theme-spec.html', label: t('settings.docsTheme') },
    { key: 'docsSkill', icon: <Sparkles size={16} />, url: 'https://md.yizigpt.com/skill-spec.html', label: t('settings.docsSkill') },
  ]

  return (
    <div className="settings-content-scroll">
      <div className="px-5 py-2 text-[11px] text-[var(--sidebar-text)]">{t('settings.docsHint')}</div>
      <div className="px-4 pb-4 space-y-1">
        {docs.map((doc) => (
          <button
            key={doc.key}
            onClick={() => openUrl(doc.url)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors hover:bg-[var(--editor-hover)] text-[var(--editor-text)]"
            style={{ background: 'var(--editor-surface)', border: '1px solid var(--editor-border)' }}
          >
            <span style={{ color: 'var(--editor-accent)', flexShrink: 0 }}>{doc.icon}</span>
            <span className="flex-1 text-[13px]">{doc.label}</span>
            <span className="text-[10px] text-[var(--sidebar-text)] truncate" style={{ maxWidth: 170 }}>{doc.url.replace(/^https?:\/\//, '')}</span>
            <ExternalLink size={12} style={{ color: 'var(--sidebar-text)', opacity: 0.5, flexShrink: 0 }} />
          </button>
        ))}
      </div>
    </div>
  )
}

function AboutSettings() {
  const { t } = useI18n()
  const [version, setVersion] = useState('')
  useEffect(() => {
    invokeTauri<string>('get_app_version').then((v) => {
      if (v) setVersion(v)
    })
    invokeTauri<string>('read_help').then(() => {})
  }, [])

  const handleOpenHelp = async () => {
    const root = await invokeTauri<Record<string, string>>('get_config_dir')
    if (root?.appDir) {
      const filePath = `${root.appDir}\\help.md`
      await invokeTauri('open_in_app', { filePath })
    }
  }

  const handleOpenLink = (url: string) => {
    invokeTauri('open_url', { url })
  }

  return (
    <div className="settings-content-scroll" style={{ height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 24px 16px' }}>
        {/* App Icon */}
        <img
          src={new URL('../assets/app-icon.png', import.meta.url).href}
          alt="YiziMarkdown"
          style={{ width: 72, height: 72, borderRadius: 16, marginBottom: 16 }}
        />
        {/* Product Name */}
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--editor-text)', margin: 0, letterSpacing: '-0.02em' }}>YiziMarkdown</h1>
        {/* Version */}
        <span style={{ fontSize: 12, color: 'var(--sidebar-text)', marginTop: 4, marginBottom: 6 }}>
          v{version}
        </span>
        <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--sidebar-text)', textAlign: 'center', margin: '0 0 6px', lineHeight: 1.3, maxWidth: 320 }}>
          {t('settings.slogan')}
        </p>
        <p style={{ fontSize: 13, color: 'var(--sidebar-text)', textAlign: 'center', margin: '0 0 4px', lineHeight: 1.5, maxWidth: 320 }}>
          {t('settings.tagline')}
        </p>
        <p style={{ fontSize: 11, color: 'var(--sidebar-text)', textAlign: 'center', margin: 0, opacity: 0.6, lineHeight: 1.4, maxWidth: 320 }}>
          {t('settings.intro')}
        </p>
      </div>

      {/* 在线更新（v0.3.4） */}
      <UpdateCard />

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--editor-border)', margin: '0 24px' }} />

      {/* Link List */}
      <div style={{ padding: '12px 16px 16px' }}>
        <button
          onClick={() => handleOpenLink('https://md.yizigpt.com')}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 12px', border: 'none', borderRadius: 8, cursor: 'pointer',
            background: 'transparent', color: 'var(--editor-text)', fontSize: 13,
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--editor-hover)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        >
          <Globe size={16} style={{ color: 'var(--editor-accent)', flexShrink: 0 }} />
          <span style={{ flex: 1, textAlign: 'left' }}>{t('settings.website')}</span>
          <span style={{ fontSize: 11, color: 'var(--sidebar-text)' }}>md.yizigpt.com</span>
          <ExternalLink size={12} style={{ color: 'var(--sidebar-text)', opacity: 0.5, flexShrink: 0 }} />
        </button>

        <button
          onClick={() => handleOpenLink('https://github.com/laoduu/yizimarkdown')}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 12px', border: 'none', borderRadius: 8, cursor: 'pointer',
            background: 'transparent', color: 'var(--editor-text)', fontSize: 13,
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--editor-hover)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        >
          <Github size={16} style={{ color: 'var(--sidebar-text)', flexShrink: 0 }} />
          <span style={{ flex: 1, textAlign: 'left' }}>{t('settings.github')}</span>
          <span style={{ fontSize: 11, color: 'var(--sidebar-text)' }}>github.com/laoduu/yizimarkdown</span>
          <ExternalLink size={12} style={{ color: 'var(--sidebar-text)', opacity: 0.5, flexShrink: 0 }} />
        </button>

        <button
          onClick={() => handleOpenLink('https://github.com/laoduu/yizimarkdown/releases')}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 12px', border: 'none', borderRadius: 8, cursor: 'pointer',
            background: 'transparent', color: 'var(--editor-text)', fontSize: 13,
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--editor-hover)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        >
          <History size={16} style={{ color: 'var(--sidebar-text)', flexShrink: 0 }} />
          <span style={{ flex: 1, textAlign: 'left' }}>{t('settings.releases')}</span>
          <ExternalLink size={12} style={{ color: 'var(--sidebar-text)', opacity: 0.5, flexShrink: 0 }} />
        </button>

        <button
          onClick={handleOpenHelp}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 12px', border: 'none', borderRadius: 8, cursor: 'pointer',
            background: 'transparent', color: 'var(--editor-text)', fontSize: 13,
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--editor-hover)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        >
          <BookOpen size={16} style={{ color: 'var(--sidebar-text)', flexShrink: 0 }} />
          <span style={{ flex: 1, textAlign: 'left' }}>{t('settings.helpDoc')}</span>
          <span style={{ fontSize: 11, color: 'var(--sidebar-text)' }}>help.md</span>
          <ChevronRight size={12} style={{ color: 'var(--sidebar-text)', opacity: 0.5, flexShrink: 0 }} />
        </button>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--editor-border)', margin: '0 24px' }} />

      {/* Copyright */}
      <div style={{ padding: '16px 24px', textAlign: 'center' }}>
        <p style={{ fontSize: 11, color: 'var(--sidebar-text)', lineHeight: 1.6, margin: 0 }}>
          Built with Tauri 2 + React + CodeMirror 6
        </p>
        <p style={{ fontSize: 11, color: 'var(--sidebar-text)', lineHeight: 1.6, margin: '4px 0 0', opacity: 0.6 }}>
          MIT License
        </p>
      </div>
    </div>
  )}

// ===================== AI 设置（v0.2.0） =====================
function AISettings() {
  const { t } = useI18n()
  const store = useSettingsStore()
  const provider = providerById(store.aiProvider)
  const [model, setModel] = useState(store.aiModel || provider?.defaultModel || '')
  const [baseUrl, setBaseUrl] = useState(store.aiBaseUrl)
  const [systemPrompt, setSystemPrompt] = useState(store.aiSystemPrompt)
  const [keyInput, setKeyInput] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [hasKey, setHasKey] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [verifyMsg, setVerifyMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // 切换供应商时：保存当前供应商配置，加载目标供应商配置
  const handleProviderChange = (pid: string) => {
    const currentPid = store.aiProvider
    const currentCfg = providerById(currentPid)
    
    // 保存当前供应商的配置（如果用户修改过）
    const newConfigs = { ...store.aiProviderConfigs }
    newConfigs[currentPid] = {
      model: model || currentCfg?.defaultModel || '',
      baseUrl: baseUrl || '',
      apiFormat: store.aiApiFormat,
    }
    
    // 加载目标供应商的配置
    const targetCfg = providerById(pid)
    const savedCfg = newConfigs[pid]
    
    store.updateSettings({
      aiProvider: pid,
      aiProviderConfigs: newConfigs,
      aiModel: savedCfg?.model || targetCfg?.defaultModel || '',
      aiBaseUrl: savedCfg?.baseUrl || '',
      aiApiFormat: (savedCfg?.apiFormat || targetCfg?.apiFormat || 'openai') as 'openai' | 'anthropic',
    })
    
    setModel(savedCfg?.model || targetCfg?.defaultModel || '')
    setBaseUrl(savedCfg?.baseUrl || '')
    setVerifyMsg(null)
  }

  useEffect(() => {
    invokeTauri<boolean>('ai_has_key', { provider: store.aiProvider }).then((v) => setHasKey(v || false))
  }, [store.aiProvider])

  const saveModel = (m: string, b: string, p: string) => {
    store.setField('aiModel', m)
    store.setField('aiBaseUrl', b)
    store.setField('aiSystemPrompt', p)
    // 更新当前供应商的缓存
    const newConfigs = { ...store.aiProviderConfigs }
    newConfigs[store.aiProvider] = {
      model: m || providerById(store.aiProvider)?.defaultModel || '',
      baseUrl: b || '',
      apiFormat: store.aiApiFormat,
    }
    store.setField('aiProviderConfigs', newConfigs)
  }

  // 清理粘贴时常见的多余字符：首尾空白 + 包裹引号 + 尾随引号
  const cleanKey = (raw: string) => {
    let k = raw.trim()
    while (k.startsWith('"') || k.startsWith("'") || k.endsWith('"') || k.endsWith("'")) {
      k = k.replace(/^["']+|["']+$/g, '').trim()
    }
    return k
  }

  const handleSaveKey = async () => {
    const k = cleanKey(keyInput)
    if (!k) return
    try {
      await invokeTauriOrThrow('ai_set_key', { provider: store.aiProvider, key: k })
      setHasKey(true); setKeyInput(''); setVerifyMsg(null)
    } catch { /* keyring 写入失败忽略，由验证兜底 */ }
  }

  const handleClearKey = async () => {
    try {
      await invokeTauriOrThrow('ai_clear_key', { provider: store.aiProvider })
      setHasKey(false)
      setVerifyMsg(null)
    } catch {}
  }

  const handleVerify = async () => {
    setVerifying(true)
    setVerifyMsg(null)
    try {
      const msg = await invokeTauriOrThrow<string>('ai_verify_key', {
        provider: store.aiProvider,
        key: cleanKey(keyInput) || null,
        apiFormat: provider?.id === 'custom' ? store.aiApiFormat : provider?.apiFormat,
        baseUrl: baseUrl || provider?.defaultBaseUrl || null,
        model: model || null,
      })
      setVerifyMsg({ ok: msg.startsWith('OK'), text: msg })
    } catch (e) {
      setVerifyMsg({ ok: false, text: e instanceof Error ? e.message : String(e) })
    }
    setVerifying(false)
  }

  const isKeyless = provider?.keyless
  const signedIn = hasKey

  return (
    <>
      <div className="settings-content-scroll ai-settings">
        <div className="space-y-4">
          <Section title={t('settings.aiSectionGeneral')}>
            <Row label={t('settings.aiProvider')} hint={t('settings.aiProviderHint')}>
              <select
                value={store.aiProvider}
                onChange={(e) => handleProviderChange(e.target.value)}
                className="settings-select"
              >
                {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.i18nKey ? t(`settings.${p.i18nKey}`) : p.label}</option>)}
              </select>
            </Row>
            {provider?.id === 'custom' && (
              <Row label={t('settings.aiProtocol')} hint={t('settings.aiProtocolHint')}>
                <select
                  value={store.aiApiFormat}
                  onChange={(e) => store.setField('aiApiFormat', e.target.value as 'openai' | 'anthropic')}
                  className="settings-select"
                >
                  <option value="openai">{t('settings.aiProtocolOpenAI')}</option>
                  <option value="anthropic">{t('settings.aiProtocolAnthropic')}</option>
                </select>
              </Row>
            )}
            <Row label={t('settings.aiModel')}>
              <div className="flex flex-col items-end gap-1 w-full">
                <input
                  type="text"
                  value={model}
                  onChange={(e) => { setModel(e.target.value); saveModel(e.target.value, baseUrl, systemPrompt) }}
                  placeholder={t('settings.aiModelPlaceholder')}
                  className="settings-input"
                  style={{ width: '100%' }}
                />
                {provider?.modelHint && (
                  <p className="text-[10px] text-[var(--sidebar-text)]">{t('settings.aiModelHint', { hint: provider.modelHint })}</p>
                )}
              </div>
            </Row>
            <Row label={t('settings.aiBaseUrl')} hint={provider?.id === 'custom' ? t('settings.aiBaseUrlCustomHint') : t('settings.aiBaseUrlHint')}>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => { setBaseUrl(e.target.value); saveModel(model, e.target.value, systemPrompt) }}
                placeholder={provider?.defaultBaseUrl || ''}
                className="settings-input"
                style={{ width: '100%' }}
              />
            </Row>
            <Row label={t('settings.aiSystemPrompt')} hint={t('settings.aiSystemPromptHint')}>
              <textarea
                value={systemPrompt}
                onChange={(e) => { setSystemPrompt(e.target.value); saveModel(model, baseUrl, e.target.value) }}
                rows={2}
                className="settings-textarea"
                style={{ width: '100%' }}
              />
            </Row>
            <Row label={t('settings.aiDocLimit')} hint={t('settings.aiDocLimitHint')}>
              <select
                value={store.aiDocLimit}
                onChange={(e) => store.setField('aiDocLimit', Number(e.target.value))}
                className="settings-select"
              >
                <option value={65536}>{t('settings.aiDocLimitK', { n: 64 })}</option>
                <option value={131072}>{t('settings.aiDocLimitK', { n: 128 })}</option>
                <option value={200000}>{t('settings.aiDocLimitK', { n: 200 })}</option>
                <option value={262144}>{t('settings.aiDocLimitK', { n: 256 })}</option>
                <option value={524288}>{t('settings.aiDocLimitK', { n: 512 })}</option>
                <option value={0}>{t('settings.aiDocLimitNone')}</option>
              </select>
            </Row>
            <Row label={t('settings.aiContextTurns')} hint={t('settings.aiContextTurnsHint')}>
              <select
                value={store.aiContextTurns}
                onChange={(e) => store.setField('aiContextTurns', Number(e.target.value))}
                className="settings-select"
              >
                <option value={0}>{t('settings.aiContextTurnsNone')}</option>
                <option value={1}>{t('settings.aiContextTurnsN', { n: 1 })}</option>
                <option value={2}>{t('settings.aiContextTurnsN', { n: 2 })}</option>
                <option value={3}>{t('settings.aiContextTurnsN', { n: 3 })}</option>
                <option value={5}>{t('settings.aiContextTurnsN', { n: 5 })}</option>
                <option value={10}>{t('settings.aiContextTurnsN', { n: 10 })}</option>
                <option value={20}>{t('settings.aiContextTurnsN', { n: 20 })}</option>
              </select>
            </Row>
          </Section>

          <Section title={t('settings.aiSectionKey')}>
            {isKeyless ? (
              <p className="text-[11px] text-[var(--sidebar-text)] px-5">{t('settings.aiKeylessNote')}</p>
            ) : (
              <>
                <Row label={t('settings.aiApiKey')} hint={provider?.id === 'custom' ? t('settings.aiKeyOptionalHint') : t('settings.aiApiKeyHint')}>
                  <div className="flex flex-col items-end gap-1.5 w-full">
                    {/* 密钥输入：独占一行全宽（密钥通常很长），等宽字体 + 显隐切换 */}
                    <div className="relative w-full">
                      <input
                        type={showKey ? 'text' : 'password'}
                        value={keyInput}
                        onChange={(e) => setKeyInput(e.target.value)}
                        placeholder={signedIn ? t('settings.aiKeySaved') : t('settings.aiKeyNotSet')}
                        className="settings-input w-full pr-8"
                        style={{ fontFamily: 'var(--font-mono)' }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey((v) => !v)}
                        title={t('settings.aiKeyToggle')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-[var(--sidebar-text)] hover:text-[var(--editor-text)]"
                      >
                        {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                    <div className="flex items-center gap-2 w-full justify-end">
                      <button onClick={handleSaveKey} disabled={!keyInput.trim()} className="settings-btn-primary"> {t('settings.aiSaveKey')}</button>
                      <span className="text-[10px] text-[var(--sidebar-text)]">{signedIn ? `✓ ${t('settings.aiKeySaved')}` : t('settings.aiKeyNotSet')}</span>
                      {signedIn && (
                        <button onClick={handleClearKey} className="text-[10px] text-[var(--sidebar-text)] hover:text-[var(--editor-accent)] underline">{t('settings.aiClearKey')}</button>
                      )}
                      <button onClick={handleVerify} disabled={verifying} className="text-[10px] text-[var(--editor-accent)] hover:underline">
                        {verifying ? t('settings.aiVerifying') : t('settings.aiVerify')}
                      </button>
                    </div>
                    {verifyMsg && (
                      <p className={`text-[10px] break-all ${verifyMsg.ok ? 'text-emerald-500' : 'text-red-500'}`}>
                        {verifyMsg.ok ? t('settings.aiVerified', { msg: verifyMsg.text }) : t('settings.aiVerifyFailed', { msg: verifyMsg.text })}
                      </p>
                    )}
                    {provider?.signupUrl && (
                      <button onClick={() => invokeTauri('open_url', { url: provider.signupUrl })} className="text-[10px] text-[var(--editor-accent)] hover:underline">
                        {t('settings.aiSignup')} ↗
                      </button>
                    )}
                  </div>
                </Row>
              </>
            )}
          </Section>
        </div>
      </div>
    </>
  )
}

// ===================== 云端存储（WebDAV）=====================

/** 内置预设：坚果云 WebDAV 根地址（其"起始目录"约定为 /yizimarkdown） */
const WEBDAV_PRESET_BASE_URL = 'https://dav.jianguoyun.com/dav/'

function CloudSettings() {
  const { t } = useI18n()
  const store = useSettingsStore()

  const [baseUrl, setBaseUrl] = useState(store.webdavBaseUrl)
  const [rootPath, setRootPath] = useState(store.webdavRootPath)
  const [baseUrlFocused, setBaseUrlFocused] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [hasCred, setHasCred] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // 回填已保存的用户名（密码永不回传，只能显示"已保存"）
  useEffect(() => {
    getUsername().then((u) => { if (u) setUsername(u) }).catch(() => {})
    hasCredentials().then(setHasCred).catch(() => {})
  }, [])

  const commitBaseUrl = (raw: string) => {
    const normalized = normalizeBaseUrl(raw)
    setBaseUrl(normalized)
    store.setField('webdavBaseUrl', normalized)
    setTestMsg(null)
  }

  const commitRootPath = (raw: string) => {
    // 统一成以 / 开头的形式，避免拼出相对路径
    const trimmed = raw.trim()
    const normalized = trimmed ? (trimmed.startsWith('/') ? trimmed : `/${trimmed}`) : '/'
    setRootPath(normalized)
    store.setField('webdavRootPath', normalized)
  }

  const handleSaveCredentials = async () => {
    try {
      await setCredentials(username, password)
      setHasCred(true)
      setPassword('')
      setTestMsg(null)
    } catch (e) {
      setTestMsg({ ok: false, text: e instanceof Error ? e.message : String(e) })
    }
  }

  const handleClearCredentials = async () => {
    try {
      await clearCredentials()
      setHasCred(false)
      setUsername('')
      setPassword('')
      setTestMsg(null)
    } catch { /* 清除失败无需打断用户 */ }
  }

  const handleTest = async () => {
    setTesting(true)
    setTestMsg(null)
    try {
      const msg = await testConnection(baseUrl)
      setTestMsg({ ok: msg.startsWith('OK'), text: msg })
    } catch (e) {
      setTestMsg({ ok: false, text: e instanceof Error ? e.message : String(e) })
    }
    setTesting(false)
  }

  return (
    <>
      <div className="settings-content-scroll cloud-settings">
        <div className="space-y-4">
          <Section title={t('settings.cloudSectionServer')}>
            <Row label={t('settings.cloudBaseUrl')} hint={t('settings.cloudBaseUrlHint')}>
              {/* 聚焦时才在框内右侧浮出「加载预设」，点一下填入坚果云地址；
                  平时不占位，避免干扰已配置好的用户 */}
              <div className="relative w-full">
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  onFocus={() => setBaseUrlFocused(true)}
                  onBlur={(e) => { setBaseUrlFocused(false); commitBaseUrl(e.target.value) }}
                  placeholder={t('settings.cloudBaseUrlPlaceholder')}
                  className={`settings-input w-full${baseUrlFocused ? ' pr-20' : ''}`}
                  style={{ fontFamily: 'var(--font-mono)' }}
                />
                {baseUrlFocused && (
                  <button
                    type="button"
                    // 必须阻止默认行为：否则按下瞬间输入框先失焦、按钮在 click 之前就被卸载
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => commitBaseUrl(WEBDAV_PRESET_BASE_URL)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--editor-accent)] hover:underline"
                  >
                    {t('settings.cloudLoadPreset')}
                  </button>
                )}
              </div>
            </Row>
            <Row label={t('settings.cloudRootPath')} hint={t('settings.cloudRootPathHint')}>
              <input
                type="text"
                value={rootPath}
                onChange={(e) => setRootPath(e.target.value)}
                onBlur={(e) => commitRootPath(e.target.value)}
                placeholder="/"
                className="settings-input w-full"
                style={{ fontFamily: 'var(--font-mono)' }}
              />
            </Row>
          </Section>

          <Section title={t('settings.cloudSectionAuth')}>
            <Row label={t('settings.cloudUsername')} hint={t('settings.cloudUsernameHint')}>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="settings-input w-full"
                autoComplete="off"
              />
            </Row>
            <Row label={t('settings.cloudPassword')} hint={t('settings.cloudPasswordHint')}>
              {/* 与 AI 密钥一致的密码输入：等宽字体 + 显隐切换 */}
              <div className="relative w-full">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={hasCred ? t('settings.cloudPasswordSaved') : t('settings.cloudPasswordNotSet')}
                  className="settings-input w-full pr-8"
                  style={{ fontFamily: 'var(--font-mono)' }}
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-[var(--sidebar-text)] hover:text-[var(--editor-text)]"
                >
                  {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
              <div className="flex items-center gap-2 w-full justify-end flex-wrap">
                <button
                  onClick={handleSaveCredentials}
                  disabled={!username.trim() || !password}
                  className="settings-btn-primary"
                  style={!username.trim() || !password ? { opacity: 0.5 } : undefined}
                >
                  {t('settings.cloudSaveCredentials')}
                </button>
                <span className="text-[10px] text-[var(--sidebar-text)]">
                  {hasCred ? `✓ ${t('settings.cloudPasswordSaved')}` : t('settings.cloudPasswordNotSet')}
                </span>
                {hasCred && (
                  <button
                    onClick={handleClearCredentials}
                    className="text-[10px] text-[var(--sidebar-text)] hover:text-[var(--editor-accent)] underline"
                  >
                    {t('settings.cloudClearCredentials')}
                  </button>
                )}
                <button
                  onClick={handleTest}
                  disabled={testing || !baseUrl.trim()}
                  className="text-[10px] text-[var(--editor-accent)] hover:underline disabled:opacity-50"
                >
                  {testing ? t('settings.cloudTesting') : t('settings.cloudTest')}
                </button>
              </div>
              {testMsg && (
                <p className={`text-[10px] break-all ${testMsg.ok ? 'text-emerald-500' : 'text-red-500'}`}>
                  {testMsg.ok
                    ? t('settings.cloudTestOk', { msg: testMsg.text })
                    : t('settings.cloudTestFailed', { msg: testMsg.text })}
                </p>
              )}
              <p className="text-[10px] text-[var(--sidebar-text)]">{t('settings.cloudCredentialsNote')}</p>
            </Row>
          </Section>
        </div>
      </div>
    </>
  )
}

// ===================== 主弹窗 =====================
export default function SettingsModal({ isOpen, onClose, defaultTab }: SettingsModalProps) {
  const { t } = useI18n()
  const [active, setActive] = useState<CategoryKey>('general')

  useEffect(() => {
    if (isOpen) setActive(defaultTab || 'general')
  }, [isOpen, defaultTab])

  if (!isOpen) return null

  const content: Record<CategoryKey, React.ReactNode> = {
    general: <GeneralSettings />, appearance: <AppearanceSettings />, editor: <EditorSettings />,
    liveMode: <LiveModeSettings />, ai: <AISettings />, cloud: <CloudSettings />,
    plugins: <PluginsSettings />,
    shortcuts: <ShortcutsSettings />, templates: <TemplatesSettings />, docs: <DocumentationSettings />,
    about: <AboutSettings />, products: <OtherProductsSettings />,
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 backdrop-blur-sm" style={{ background: 'var(--overlay-bg)' }} onClick={onClose} />
      <div className="settings-modal-container">
        <div className="settings-modal-header">
          <button onClick={onClose} className="mr-2 p-0.5 rounded hover:bg-[var(--editor-hover)] text-[var(--sidebar-text)]"><ChevronRight size={14} className="rotate-180" /></button>
          <span>{t('settings.title')}</span>
          <button onClick={onClose} className="ml-auto p-1 rounded-lg hover:bg-[var(--editor-hover)] text-[var(--sidebar-text)]"><X size={14} /></button>
        </div>
        <div className="flex flex-1 overflow-hidden">
          <div className="settings-modal-sidebar">
            {categories.map((cat) => (
              <button key={cat.key} onClick={() => setActive(cat.key)}
                className={`settings-sidebar-item ${active === cat.key ? 'settings-sidebar-active' : ''}`}>
                {cat.icon}<span>{t(cat.labelKey)}</span>
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-hidden flex flex-col">
            {content[active]}
          </div>
        </div>
      </div>
    </div>
  )
}
