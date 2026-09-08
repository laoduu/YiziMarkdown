import { invokeTauri, invokeTauriOrThrow } from '../lib/tauri'
import { useState, useEffect, useCallback, useRef } from 'react'
import { X, Loader2, ChevronRight, FolderOpen, Palette, FileText, Keyboard, Settings2, Eye, EyeOff, Info, Github, History, BookOpen, ExternalLink, Zap, Globe, Puzzle, Bot } from 'lucide-react'
import { useSettingsStore } from '../stores/settingsStore'
import { SHORTCUT_ACTIONS, getKeybindingsMap, saveKeybindings, getDefaultMap, formatKey, findConflict, getActionLabel } from '../lib/keybindings'
import { RotateCcw } from 'lucide-react'
import { getAllPlugins, loadPlugin, unloadPlugin } from '../plugins/registry'
import { useI18n, LANGUAGES } from '../i18n'
import { PROVIDERS, providerById } from '../lib/ai-providers'

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
const DEFAULTS_APPEARANCE = { currentTheme: 'academic', isDark: false }
const DEFAULTS_EDITOR = {
  liveAnimationMode: 'blur' as const,
  fontFamily: "'MiSans', 'Mi Sans', system-ui, -apple-system, 'PingFang SC', 'Segoe UI', 'Microsoft YaHei', 'Noto Sans SC', sans-serif",
  previewFontFamily: "'MiSans', 'Mi Sans', system-ui, -apple-system, 'PingFang SC', 'Segoe UI', 'Microsoft YaHei', 'Noto Sans SC', sans-serif",
  fontSize: 20, lineHeight: 2.0, previewFontSize: 20, previewLineHeight: 2.0,
  showLineNumbers: true, wordWrap: true,
}

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  defaultTab?: CategoryKey
}

type CategoryKey = 'general' | 'appearance' | 'editor' | 'liveMode' | 'ai' | 'plugins' | 'shortcuts' | 'templates' | 'about'

const categories: Array<{ key: CategoryKey; labelKey: string; icon: React.ReactNode }> = [
  { key: 'general', labelKey: 'settings.general', icon: <Settings2 size={16} /> },
  { key: 'appearance', labelKey: 'settings.appearance', icon: <Palette size={16} /> },
  { key: 'editor', labelKey: 'settings.editor', icon: <FileText size={16} /> },
  { key: 'liveMode', labelKey: 'settings.liveMode', icon: <Zap size={16} /> },
  { key: 'ai', labelKey: 'settings.ai', icon: <Bot size={16} /> },
  { key: 'plugins', labelKey: 'settings.plugins', icon: <Puzzle size={16} /> },
  { key: 'shortcuts', labelKey: 'settings.shortcuts', icon: <Keyboard size={16} /> },
  { key: 'templates', labelKey: 'settings.templates', icon: <FolderOpen size={16} /> },
  { key: 'about', labelKey: 'settings.about', icon: <Info size={16} /> },
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

// ===================== 通用设置 =====================
function GeneralSettings() {
  const store = useSettingsStore()
  const { t } = useI18n()
  const [local, setLocal] = useState({ autoSave: store.autoSave, autoSaveInterval: store.autoSaveInterval, defaultTemplate: store.defaultTemplate })
  const [configDir, setConfigDir] = useState('')
  const [templates, setTemplates] = useState<string[]>([])
  const [isDefaultEditor, setIsDefaultEditor] = useState(false)
  const [associating, setAssociating] = useState(false)
  const initialized = useRef(false)

  const currentLang = store.language

  useEffect(() => {
    if (!initialized.current) {
      setLocal({ autoSave: store.autoSave, autoSaveInterval: store.autoSaveInterval, defaultTemplate: store.defaultTemplate })
      initialized.current = true
    }
  }, [store])

  useEffect(() => {
    invokeTauri<Record<string, string>>('get_config_dir').then((dirs) => {
      if (dirs) {
        setConfigDir(dirs.appDir || '')
        invokeTauri<string[]>('list_templates').then((l) => setTemplates(l || []))
      }
    })
    invokeTauri<boolean>('is_md_associated').then((v) => setIsDefaultEditor(v || false))
  }, [])

  const hasChanges = local.autoSave !== store.autoSave || local.autoSaveInterval !== store.autoSaveInterval || local.defaultTemplate !== store.defaultTemplate

  const handleSave = () => { store.updateSettings(local) }
  const handleRestore = () => { setLocal({ ...DEFAULTS_GENERAL }) }

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
              <select value={local.defaultTemplate} onChange={(e) => setLocal({ ...local, defaultTemplate: e.target.value })} className="settings-select">
                <option value="">{t('common.none')}</option>
                {templates.map((t) => <option key={t} value={t}>{t.replace(/\.\w+$/, '')}</option>)}
              </select>
            </Row>
          </Section>
          <Section title={t('settings.saving')}>
            <Row label={t('settings.autoSave')}>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={local.autoSave} onChange={(e) => setLocal({ ...local, autoSave: e.target.checked })} className="settings-checkbox" />
                <span className="text-xs text-[var(--editor-text)]">{t('settings.autoSave')}</span>
              </label>
            </Row>
            <Row label={t('settings.saveInterval', { n: local.autoSaveInterval / 1000 })}>
              <div className="w-full">
                <input type="range" min="5000" max="180000" step="1000" value={local.autoSaveInterval} onChange={(e) => setLocal({ ...local, autoSaveInterval: Number(e.target.value) })} className="settings-range" />
                <div className="flex justify-between text-[11px] text-[var(--sidebar-text)] mt-0.5"><span>{t('settings.secMin')}</span><span>{t('settings.secMax')}</span></div>
              </div>
            </Row>
          </Section>
          <Section title={t('settings.configDir')}>
            {configDir && (
              <div className="px-4 py-2 bg-[var(--editor-surface)] border border-[var(--editor-border)] rounded-lg">
                <p className="text-[11px] text-[var(--sidebar-text)] mb-1">{t('settings.configDirHint')}</p>
                <p className="text-xs text-[var(--editor-text)] font-mono break-all">{configDir}</p>
              </div>
            )}
          </Section>
        </div>
      </div>
      <FooterBar hasChanges={hasChanges} onSave={handleSave} onRestore={handleRestore} />
    </>
  )
}

// ===================== 自定义CSS编辑器 =====================
function UserCssEditor() {
  const { t } = useI18n()
  const [cssContent, setCssContent] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    invokeTauri<string>('read_user_css').then((c) => setCssContent(c || ''))
  }, [])

  const handleSave = async () => {
    await invokeTauri('write_user_css', { content: cssContent })
    let el = document.getElementById('yizimarkdown-user-css')
    if (!el) { el = document.createElement('style'); el.id = 'yizimarkdown-user-css'; }
    el.textContent = cssContent
    document.head.appendChild(el)  // 移到末尾确保优先级
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-[var(--sidebar-text)]">{t('settings.customCssHint')}</p>
      <textarea value={cssContent} onChange={(e) => { setCssContent(e.target.value); setSaved(false) }}
        className="settings-textarea font-mono" rows={6} spellCheck={false} />
      <button onClick={handleSave} className="settings-btn-primary">{saved ? t('settings.saved') : t('settings.saveCss')}</button>
    </div>
  )
}

// ===================== 外观设置（即时生效，只保留恢复默认） =====================
function AppearanceSettings() {
  const { t } = useI18n()
  const { currentTheme, isDark, setField } = useSettingsStore()
  const [themeFiles, setThemeFiles] = useState<string[]>([])
  const [themeMeta, setThemeMeta] = useState<Record<string, { name: string; swatch?: string[]; desc?: string }>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  // 加载 theme.json 和 themes/ 目录列表
  useEffect(() => {
    invokeTauri<string[]>('list_themes').then((l) => setThemeFiles(l || []))
    invokeTauri<string>('read_theme_json').then((json) => {
      try { setThemeMeta(JSON.parse(json || '{}')) } catch { setThemeMeta({}) }
    })
  }, [])

  // 保存 theme.json
  const saveThemeMeta = useCallback(async (updated: Record<string, any>) => {
    setThemeMeta(updated)
    await invokeTauri('write_theme_json', { content: JSON.stringify(updated, null, 2) })
  }, [])

  // academic 保底主题
  const academicMeta = { name: t('settings.academic'), swatch: ['#f5f8ff', '#002FA7'], desc: t('settings.academicDesc') }

  // 构建统一主题列表：academic 优先，其余按 theme.json 顺序，未收录的 CSS 文件追加末尾
  const themeList: { id: string; name: string; swatch: string[]; desc: string; isPreset: boolean }[] = []
  const cssIds = new Set(themeFiles.map(f => f.replace(/\.css$/, '')))
  // academic 保底
  themeList.push({ id: 'academic', ...academicMeta, isPreset: true })
  // theme.json 中的预设主题（跳过 academic）
  for (const [id, meta] of Object.entries(themeMeta)) {
    if (id === 'academic' || !cssIds.has(id)) continue
    themeList.push({ id, name: meta.name, swatch: meta.swatch || ['#e8ecf0', '#c0c8d4'], desc: meta.desc || t('settings.customTheme'), isPreset: true })
  }
  // 不在 theme.json 中的 CSS 文件（用户自定义）
  for (const id of cssIds) {
    if (id === 'academic' || themeMeta[id]) continue
    themeList.push({ id, name: id, swatch: ['#e8ecf0', '#c0c8d4'], desc: t('settings.customTheme'), isPreset: false })
  }

  const handleRestore = () => {
    setField('currentTheme', DEFAULTS_APPEARANCE.currentTheme)
    setField('isDark', DEFAULTS_APPEARANCE.isDark)
  }

  // 开始编辑主题名称
  const startEdit = (id: string, currentName: string) => {
    setEditingId(id)
    setEditName(currentName)
  }

  // 保存编辑
  const commitEdit = (id: string) => {
    const newName = editName.trim()
    if (!newName || newName === (themeMeta[id]?.name || id)) {
      setEditingId(null)
      return
    }
    const updated = { ...themeMeta }
    if (!updated[id]) {
      // 自定义主题首次命名，创建条目
      updated[id] = { name: newName, swatch: ['#e8ecf0', '#c0c8d4'], desc: t('settings.customTheme') }
    } else {
      updated[id] = { ...updated[id], name: newName }
    }
    saveThemeMeta(updated)
    setEditingId(null)
  }

  return (
    <>
      <div className="settings-content-scroll">
        <div className="space-y-4">
          <Section title={t('settings.theme')}>
            <div className="grid grid-cols-2 gap-2">
              {themeList.map((th) => (
                <button key={th.id} onClick={() => setField('currentTheme', th.id)}
                  className={`settings-theme-card ${currentTheme === th.id ? 'settings-theme-active' : ''}`}>
                  <div className="w-full h-10 rounded-md mb-1.5"
                    style={{ background: `linear-gradient(135deg, ${th.swatch[0]} 0%, ${th.swatch[1]} 100%)`, border: '1px solid var(--editor-border)' }} />
                  {editingId === th.id ? (
                    <input
                      className="w-full text-xs font-medium text-[var(--editor-text)] bg-transparent border-b border-[var(--editor-accent)] outline-none px-0.5 py-0.5"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={() => commitEdit(th.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(th.id); if (e.key === 'Escape') setEditingId(null) }}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <p className="text-xs font-medium text-[var(--editor-text)] truncate cursor-pointer hover:text-[var(--editor-accent)]"
                      title={t('settings.clickToEditName')}
                      onClick={(e) => { e.stopPropagation(); startEdit(th.id, th.name) }}>{th.name}</p>
                  )}
                  <p className="text-[10px] text-[var(--sidebar-text)] truncate">{th.desc}</p>
                </button>
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
            <UserCssEditor />
          </Section>
        </div>
      </div>
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
      <style>{`
        .demo-anim-blur { animation: demo-blur 0.45s ease forwards; }
        .demo-anim-flash { animation: demo-flash 0.5s ease forwards; }
        .demo-anim-glow { animation: demo-glow 0.55s ease forwards; }
        .demo-anim-ripple { animation: demo-ripple 0.7s ease forwards; }
        @keyframes demo-blur { 0% { filter: blur(3px); } 100% { filter: blur(0); } }
        @keyframes demo-flash { 0% { filter: brightness(1); } 30% { filter: brightness(1.6); } 100% { filter: brightness(1); } }
        @keyframes demo-glow { 0% { filter: blur(3px) brightness(0.8); } 30% { filter: blur(0.5px) brightness(1.6); } 100% { filter: blur(0) brightness(1); } }
        @keyframes demo-ripple { 0% { filter: blur(3px) brightness(0.8); } 20% { filter: blur(1px) brightness(1.7); } 50% { filter: blur(0) brightness(1.3); } 100% { filter: blur(0) brightness(1); } }
        
        .demo-mark {
          display: inline-block;
          overflow: hidden;
          max-width: 0;
          opacity: 0;
          transition: max-width 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease;
          color: var(--editor-accent);
          font-family: var(--font-mono);
          font-size: 0.85em;
        }
        .demo-active .demo-mark {
          max-width: 3em;
          opacity: 0.6;
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

// ===================== 编辑器设置 =====================
function EditorSettings() {
  const { t } = useI18n()
  const store = useSettingsStore()
  const [local, setLocal] = useState({
    fontFamily: store.fontFamily, previewFontFamily: store.previewFontFamily,
    fontSize: store.fontSize, lineHeight: store.lineHeight,
    previewFontSize: store.previewFontSize, previewLineHeight: store.previewLineHeight,
    showLineNumbers: store.showLineNumbers, wordWrap: store.wordWrap,
    liveAnimationMode: store.liveAnimationMode,
  })
  const [systemFonts, setSystemFonts] = useState(fallbackFonts)
  const [fontsLoaded, setFontsLoaded] = useState(false)
  const [fontFilter, setFontFilter] = useState('')
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const initialized = useRef(false)

  useEffect(() => {
    if (!initialized.current) {
      setLocal({
        fontFamily: store.fontFamily, previewFontFamily: store.previewFontFamily,
        fontSize: store.fontSize, lineHeight: store.lineHeight,
        previewFontSize: store.previewFontSize, previewLineHeight: store.previewLineHeight,
        showLineNumbers: store.showLineNumbers, wordWrap: store.wordWrap,
        liveAnimationMode: store.liveAnimationMode,
      })
      initialized.current = true
    }
  }, [store])

  useEffect(() => {
    invokeTauri<string[]>('get_system_fonts').then((f) => { if (f && f.length > 0) setSystemFonts(f); setFontsLoaded(true) })
  }, [])

  const hasChanges = local.fontFamily !== store.fontFamily || local.previewFontFamily !== store.previewFontFamily
    || local.fontSize !== store.fontSize || local.lineHeight !== store.lineHeight
    || local.previewFontSize !== store.previewFontSize || local.previewLineHeight !== store.previewLineHeight
    || local.showLineNumbers !== store.showLineNumbers || local.wordWrap !== store.wordWrap
    || local.liveAnimationMode !== store.liveAnimationMode
  const handleSave = () => { store.updateSettings(local) }
  const handleRestore = () => { setLocal({ ...DEFAULTS_EDITOR }) }

  const filtered = fontFilter ? systemFonts.filter(f => f.toLowerCase().includes(fontFilter.toLowerCase())) : systemFonts
  const cur = mode === 'edit' ? local.fontFamily : local.previewFontFamily
  const setFont = (v: string) => setLocal({ ...local, [mode === 'edit' ? 'fontFamily' : 'previewFontFamily']: v })

  return (
    <>
      <div className="settings-content-scroll">
        <div className="space-y-4">
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
            <input type="text" value={fontFilter} onChange={(e) => setFontFilter(e.target.value)} placeholder={t('settings.searchLocalFonts')} className="settings-input mb-1.5" />
            <div className="border border-[var(--editor-border)] rounded-lg overflow-hidden bg-[var(--editor-surface)]" style={{ maxHeight: '150px', overflowY: 'auto' }}>
              {!fontsLoaded && <div className="flex items-center justify-center gap-2 py-3 text-xs text-[var(--sidebar-text)]"><Loader2 size={12} className="animate-spin" /> {t('common.loading')}</div>}
              {filtered.map((f) => (
                <button key={f} onClick={() => setFont(`'${f}', sans-serif`)}
                  className={`w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--editor-hover)] flex items-center justify-between ${cur.includes(f) ? 'bg-[var(--editor-accent)] text-white' : 'text-[var(--editor-text)]'}`}>
                  <span>{f}</span><span className="text-[11px] opacity-60" style={{ fontFamily: `'${f}', sans-serif` }}>Aa</span>
                </button>
              ))}
              {fontsLoaded && filtered.length === 0 && <div className="px-3 py-3 text-xs text-[var(--sidebar-text)] text-center">{t('common.noMatch')}</div>}
            </div>
            <input type="text" value={cur} onChange={(e) => setFont(e.target.value)} placeholder={t('settings.manualFont')} className="settings-input mt-1.5" />
          </Section>
          <Section title={t('settings.sourceLayout')}>
            <Row label={t('settings.fontSize', { n: local.fontSize })}>
              <div className="w-full">
                <input type="range" min="12" max="32" value={local.fontSize} onChange={(e) => setLocal({ ...local, fontSize: Number(e.target.value) })} className="settings-range" />
                <div className="flex justify-between text-[11px] text-[var(--sidebar-text)] mt-0.5"><span>12px</span><span>32px</span></div>
              </div>
            </Row>
            <Row label={t('settings.lineHeight', { n: local.lineHeight })}>
              <div className="w-full">
                <input type="range" min="1.2" max="3.0" step="0.1" value={local.lineHeight} onChange={(e) => setLocal({ ...local, lineHeight: Number(e.target.value) })} className="settings-range" />
                <div className="flex justify-between text-[11px] text-[var(--sidebar-text)] mt-0.5"><span>1.2</span><span>3.0</span></div>
              </div>
            </Row>
          </Section>
          <Section title={t('settings.previewLayout')}>
            <Row label={t('settings.fontSize', { n: local.previewFontSize })}>
              <div className="w-full">
                <input type="range" min="12" max="32" value={local.previewFontSize} onChange={(e) => setLocal({ ...local, previewFontSize: Number(e.target.value) })} className="settings-range" />
                <div className="flex justify-between text-[11px] text-[var(--sidebar-text)] mt-0.5"><span>12px</span><span>32px</span></div>
              </div>
            </Row>
            <Row label={t('settings.lineHeight', { n: local.previewLineHeight })}>
              <div className="w-full">
                <input type="range" min="1.2" max="3.0" step="0.1" value={local.previewLineHeight} onChange={(e) => setLocal({ ...local, previewLineHeight: Number(e.target.value) })} className="settings-range" />
                <div className="flex justify-between text-[11px] text-[var(--sidebar-text)] mt-0.5"><span>1.2</span><span>3.0</span></div>
              </div>
            </Row>
          </Section>
          <Section title={t('settings.display')}>
            <Row label={t('settings.showLineNumbers')}>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={local.showLineNumbers} onChange={(e) => setLocal({ ...local, showLineNumbers: e.target.checked })} className="settings-checkbox" />
              </label>
            </Row>
            <Row label={t('settings.wordWrap')}>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={local.wordWrap} onChange={(e) => setLocal({ ...local, wordWrap: e.target.checked })} className="settings-checkbox" />
              </label>
            </Row>
          </Section>
          
          <Section title={t('settings.preview')}>
            <div className="p-3 bg-[var(--editor-surface)] border border-[var(--editor-border)] rounded-lg text-[var(--editor-text)]" style={{ fontFamily: local.fontFamily, fontSize: `${local.fontSize}px`, lineHeight: local.lineHeight }}>
              <div className="text-[11px] text-[var(--sidebar-text)] mb-1">{t('settings.sourceMode')}</div>
              <div style={{ fontFamily: "'Consolas', monospace", background: 'var(--editor-bg)', padding: '6px', borderRadius: '4px', fontSize: '12px' }}>function hello() {'{'}<br/>&nbsp;&nbsp;console.log("Hello, YiziMarkdown!");<br/>{'}'}</div>
              <div className="mt-2 text-[11px] text-[var(--sidebar-text)] mb-1">{t('settings.previewMode')}</div>
              <div style={{ fontFamily: local.previewFontFamily, fontSize: `${local.previewFontSize}px`, lineHeight: local.previewLineHeight }}><h3 style={{ fontWeight: 600, margin: '0.3em 0 0.2em' }}>{t('settings.headingSample')}</h3><p>{t('settings.sampleText')}</p></div>
            </div>
          </Section>
        </div>
      </div>
      <FooterBar hasChanges={hasChanges} onSave={handleSave} onRestore={handleRestore} />
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
  const [tDir, setTDir] = useState('')
  const [templates, setTemplates] = useState<string[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [tContent, setTContent] = useState('')
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [editName, setEditName] = useState('')

  const refresh = useCallback(async () => { const l = await invokeTauri<string[]>('list_templates'); setTemplates(l || []) }, [])

  useEffect(() => { invokeTauri<Record<string, string>>('get_config_dir').then((d) => { if (d) setTDir(d.appDir || ''); refresh() }) }, [refresh])

  const load = async (name: string) => { const c = await invokeTauri<string>('read_template', { name }); if (c) { setTContent(c); setSelected(name); setEditing(false) } }
  const handleNew = () => { setEditContent('# 新模板\n\n'); setEditName('new-template.md'); setEditing(true) }
  const handleEdit = () => { setEditContent(tContent); setEditName(selected || ''); setEditing(true) }
  const handleSave = async () => {
    const n = editName.endsWith('.md') ? editName : `${editName}.md`
    await invokeTauri('save_file', { path: `${tDir}\\templates\\${n}`, content: editContent })
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

// ===================== 关于 =====================
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

  const saveModel = () => {
    store.setField('aiModel', model)
    store.setField('aiBaseUrl', baseUrl)
    store.setField('aiSystemPrompt', systemPrompt)
    // 更新当前供应商的缓存
    const newConfigs = { ...store.aiProviderConfigs }
    newConfigs[store.aiProvider] = {
      model: model || providerById(store.aiProvider)?.defaultModel || '',
      baseUrl: baseUrl || '',
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
                  onChange={(e) => setModel(e.target.value)}
                  onBlur={saveModel}
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
                onChange={(e) => setBaseUrl(e.target.value)}
                onBlur={saveModel}
                placeholder={provider?.defaultBaseUrl || ''}
                className="settings-input"
                style={{ width: '100%' }}
              />
            </Row>
            <Row label={t('settings.aiSystemPrompt')} hint={t('settings.aiSystemPromptHint')}>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                onBlur={saveModel}
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
    liveMode: <LiveModeSettings />, ai: <AISettings />, plugins: <PluginsSettings />,
    shortcuts: <ShortcutsSettings />, templates: <TemplatesSettings />, about: <AboutSettings />,
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
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
