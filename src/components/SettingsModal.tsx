import { invokeTauri } from '../lib/tauri'
import { useState, useEffect, useCallback, useRef } from 'react'
import { X, Loader2, ChevronRight, FolderOpen, Palette, FileText, Keyboard, Settings2, Eye, Info, Github, History, BookOpen, ExternalLink, Zap, Globe, Puzzle } from 'lucide-react'
import { useSettingsStore } from '../stores/settingsStore'
import { SHORTCUT_ACTIONS, getKeybindingsMap, saveKeybindings, getDefaultMap, formatKey, findConflict, getActionLabel } from '../lib/keybindings'
import { RotateCcw } from 'lucide-react'
import { getAllPlugins, loadPlugin, unloadPlugin } from '../plugins/registry'

const fallbackFonts = [
  'Consolas', 'Courier New', 'Lucida Console', 'Monaco', 'Menlo',
  'Source Code Pro', 'Fira Code', 'JetBrains Mono', 'Cascadia Code',
  'Arial', 'Verdana', 'Segoe UI', 'Times New Roman', 'Georgia',
  'Noto Sans SC', 'Microsoft YaHei', 'SimSun', 'KaiTi',
]

/** 各面板的默认值（恢复默认时使用） */
const DEFAULTS_GENERAL = { autoSave: true, autoSaveInterval: 3000, defaultTemplate: '' }
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

type CategoryKey = 'general' | 'appearance' | 'editor' | 'liveMode' | 'plugins' | 'shortcuts' | 'templates' | 'about'

const categories: Array<{ key: CategoryKey; label: string; icon: React.ReactNode }> = [
  { key: 'general', label: '通用', icon: <Settings2 size={16} /> },
  { key: 'appearance', label: '外观', icon: <Palette size={16} /> },
  { key: 'editor', label: '编辑器', icon: <FileText size={16} /> },
  { key: 'liveMode', label: '实时模式', icon: <Zap size={16} /> },
  { key: 'plugins', label: '插件', icon: <Puzzle size={16} /> },
  { key: 'shortcuts', label: '快捷键', icon: <Keyboard size={16} /> },
  { key: 'templates', label: '模板', icon: <FolderOpen size={16} /> },
  { key: 'about', label: '关于', icon: <Info size={16} /> },
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
  return (
    <div className="settings-footer-bar">
      <button onClick={onRestore} className="settings-btn-secondary">恢复默认</button>
      <button onClick={onSave} className="settings-btn-primary" disabled={!hasChanges} style={!hasChanges ? { opacity: 0.5 } : undefined}>
        保存
      </button>
    </div>
  )
}

// ===================== 通用设置 =====================
function GeneralSettings() {
  const store = useSettingsStore()
  const [local, setLocal] = useState({ autoSave: store.autoSave, autoSaveInterval: store.autoSaveInterval, defaultTemplate: store.defaultTemplate })
  const [configDir, setConfigDir] = useState('')
  const [templates, setTemplates] = useState<string[]>([])
  const [isDefaultEditor, setIsDefaultEditor] = useState(false)
  const [associating, setAssociating] = useState(false)
  const initialized = useRef(false)

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
          <Section title="文件关联">
            <Row label="设为默认 Markdown 编辑器" hint="将 .md 文件关联到 YiziMarkdown，双击即可打开">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={isDefaultEditor} disabled={associating} onChange={(e) => handleAssociateChange(e.target.checked)} className="settings-checkbox" />
                <span className="text-xs text-[var(--editor-text)]">
                  {associating ? '处理中...' : isDefaultEditor ? '已设为默认' : '未关联'}
                </span>
              </label>
            </Row>
          </Section>
          <Section title="启动选项">
            <Row label="默认模板">
              <select value={local.defaultTemplate} onChange={(e) => setLocal({ ...local, defaultTemplate: e.target.value })} className="settings-select">
                <option value="">无</option>
                {templates.map((t) => <option key={t} value={t}>{t.replace(/\.\w+$/, '')}</option>)}
              </select>
            </Row>
          </Section>
          <Section title="保存">
            <Row label="自动保存">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={local.autoSave} onChange={(e) => setLocal({ ...local, autoSave: e.target.checked })} className="settings-checkbox" />
                <span className="text-xs text-[var(--editor-text)]">自动保存</span>
              </label>
            </Row>
            <Row label={`保存间隔: ${local.autoSaveInterval / 1000} 秒`}>
              <div className="w-full">
                <input type="range" min="1000" max="10000" step="1000" value={local.autoSaveInterval} onChange={(e) => setLocal({ ...local, autoSaveInterval: Number(e.target.value) })} className="settings-range" />
                <div className="flex justify-between text-[11px] text-[var(--sidebar-text)] mt-0.5"><span>1 秒</span><span>10 秒</span></div>
              </div>
            </Row>
          </Section>
          <Section title="配置目录">
            {configDir && (
              <div className="px-4 py-2 bg-[var(--editor-surface)] border border-[var(--editor-border)] rounded-lg">
                <p className="text-[11px] text-[var(--sidebar-text)] mb-1">用户配置存储位置</p>
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
      <p className="text-[11px] text-[var(--sidebar-text)]">自定义 CSS 会加载在所有主题之后，优先级最高。保存并手动重启后生效。</p>
      <textarea value={cssContent} onChange={(e) => { setCssContent(e.target.value); setSaved(false) }}
        className="settings-textarea font-mono" rows={6} spellCheck={false} />
      <button onClick={handleSave} className="settings-btn-primary">{saved ? '已保存' : '保存 CSS'}</button>
    </div>
  )
}

// ===================== 外观设置（即时生效，只保留恢复默认） =====================
function AppearanceSettings() {
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
  const academicMeta = { name: '学术蓝', swatch: ['#f5f8ff', '#002FA7'], desc: '沉稳专业的学术风格' }

  // 构建统一主题列表：academic 优先，其余按 theme.json 顺序，未收录的 CSS 文件追加末尾
  const themeList: { id: string; name: string; swatch: string[]; desc: string; isPreset: boolean }[] = []
  const cssIds = new Set(themeFiles.map(f => f.replace(/\.css$/, '')))
  // academic 保底
  themeList.push({ id: 'academic', ...academicMeta, isPreset: true })
  // theme.json 中的预设主题（跳过 academic）
  for (const [id, meta] of Object.entries(themeMeta)) {
    if (id === 'academic' || !cssIds.has(id)) continue
    themeList.push({ id, name: meta.name, swatch: meta.swatch || ['#e8ecf0', '#c0c8d4'], desc: meta.desc || '自定义主题', isPreset: true })
  }
  // 不在 theme.json 中的 CSS 文件（用户自定义）
  for (const id of cssIds) {
    if (id === 'academic' || themeMeta[id]) continue
    themeList.push({ id, name: id, swatch: ['#e8ecf0', '#c0c8d4'], desc: '自定义主题', isPreset: false })
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
      updated[id] = { name: newName, swatch: ['#e8ecf0', '#c0c8d4'], desc: '自定义主题' }
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
          <Section title="主题">
            <div className="grid grid-cols-2 gap-2">
              {themeList.map((t) => (
                <button key={t.id} onClick={() => setField('currentTheme', t.id)}
                  className={`settings-theme-card ${currentTheme === t.id ? 'settings-theme-active' : ''}`}>
                  <div className="w-full h-10 rounded-md mb-1.5"
                    style={{ background: `linear-gradient(135deg, ${t.swatch[0]} 0%, ${t.swatch[1]} 100%)`, border: '1px solid var(--editor-border)' }} />
                  {editingId === t.id ? (
                    <input
                      className="w-full text-xs font-medium text-[var(--editor-text)] bg-transparent border-b border-[var(--editor-accent)] outline-none px-0.5 py-0.5"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={() => commitEdit(t.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(t.id); if (e.key === 'Escape') setEditingId(null) }}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <p className="text-xs font-medium text-[var(--editor-text)] truncate cursor-pointer hover:text-[var(--editor-accent)]"
                      title="点击编辑名称"
                      onClick={(e) => { e.stopPropagation(); startEdit(t.id, t.name) }}>{t.name}</p>
                  )}
                  <p className="text-[10px] text-[var(--sidebar-text)] truncate">{t.desc}</p>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-[var(--sidebar-text)] mt-2">点击主题名称可编辑显示名称，自定义 CSS 放入 themes/ 目录即可识别。</p>
          </Section>
          <Section title="模式">
            <Row label="深色模式">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={isDark} onChange={(e) => setField('isDark', e.target.checked)} className="settings-checkbox" />
                <span className="text-xs text-[var(--editor-text)]">启用深色模式</span>
              </label>
            </Row>
          </Section>
        </div>
      </div>
      <div className="settings-footer-bar">
        <button onClick={handleRestore} className="settings-btn-secondary">恢复默认</button>
      </div>
    </>
  )
}

// ===================== 实时模式设置 =====================
function LiveModeSettings() {
  const { liveAnimationMode, setField } = useSettingsStore()
  
  const animations = [
    { key: 'blur' as const, name: '聚焦', desc: '文字模糊后重新对焦，简洁干净', css: 'filter: blur(2px) → blur(0)' },
    { key: 'flash' as const, name: '闪光', desc: '文字闪过一束光，利落干脆', css: 'filter: brightness(1) → 1.5 → 1' },
    { key: 'glow' as const, name: '辉光', desc: '模糊+闪光叠加，推荐效果', css: 'blur + brightness 组合' },
    { key: 'ripple' as const, name: '涟漪', desc: '多波峰衰减，像水面波纹', css: '多段 blur + brightness' },
  ]

  return (
    <>
      <div className="settings-content-scroll">
        <div className="space-y-4">
          <Section title="动画方案">
            <p className="text-[11px] text-[var(--sidebar-text)] px-5 mb-3">
              实时模式下，Markdown标记出现时文字的过渡动画效果。点击下方卡片可实时预览。
            </p>
            <div className="grid grid-cols-2 gap-3 px-5">
              {animations.map(({ key, name, desc, css }) => (
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
                    <span className="font-medium text-sm">{name}</span>
                    {liveAnimationMode === key && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-white/20 rounded">当前</span>
                    )}
                  </div>
                  <p className={`text-[11px] ${liveAnimationMode === key ? 'opacity-80' : 'opacity-60'}`}>{desc}</p>
                  <p className={`text-[10px] mt-2 font-mono ${liveAnimationMode === key ? 'opacity-60' : 'opacity-40'}`}>{css}</p>
                </button>
              ))}
            </div>
          </Section>

          <Section title="动画预览">
            <div className="px-5">
              <div className="p-4 bg-[var(--editor-bg)] rounded-xl border border-[var(--editor-border)]">
                <div className="text-[11px] text-[var(--sidebar-text)] mb-3">点击下方文字触发动画演示</div>
                <AnimationDemo mode={liveAnimationMode} />
              </div>
            </div>
          </Section>

          <Section title="说明">
            <div className="px-5 space-y-2">
              <div className="flex items-start gap-2">
                <span className="text-[var(--editor-accent)] mt-0.5">•</span>
                <p className="text-[11px] text-[var(--sidebar-text)]">动画仅在光标进入新行时触发，离开时不触发，避免干扰</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[var(--editor-accent)] mt-0.5">•</span>
                <p className="text-[11px] text-[var(--sidebar-text)]">所有方案均使用GPU加速的CSS动画，性能开销可忽略</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[var(--editor-accent)] mt-0.5">•</span>
                <p className="text-[11px] text-[var(--sidebar-text)]">设置即时生效，切换方案后进入新行即可看到效果</p>
              </div>
            </div>
          </Section>
        </div>
      </div>
      <div className="settings-footer-bar">
        <button onClick={() => setField('liveAnimationMode', 'blur')} className="settings-btn-secondary">恢复默认</button>
      </div>
    </>
  )
}

function AnimationDemo({ mode }: { mode: string }) {
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
          <span className={`text-sm font-bold ${active ? animClass : ''}`}>这是一级标题</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="demo-mark">## </span>
          <span className={`text-sm ${active ? animClass : ''}`}>这是二级标题</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="demo-mark">- </span>
          <span className={`text-sm ${active ? animClass : ''}`}>这是列表项</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="demo-mark">**</span>
          <span className={`text-sm font-bold ${active ? animClass : ''}`}>这是加粗文字</span>
          <span className="demo-mark">**</span>
        </div>
      </div>
      <p className="text-[10px] text-[var(--sidebar-text)] mt-3 text-center">点击此处重新播放动画</p>
    </div>
  )
}

// ===================== 编辑器设置 =====================
function EditorSettings() {
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
          <Section title="字体">
            <div className="flex gap-2 mb-2">
              {(['edit', 'preview'] as const).map((m) => (
                <button key={m} onClick={() => setMode(m)}
                  className={`px-2.5 py-1 text-[12px] rounded-md transition-colors ${mode === m ? 'bg-[var(--editor-accent)] text-white' : 'bg-[var(--editor-surface)] text-[var(--sidebar-text)] hover:bg-[var(--editor-hover)]'}`}>
                  {m === 'edit' ? '源代码模式' : '预览模式'}
                </button>
              ))}
            </div>
            <input type="text" value={fontFilter} onChange={(e) => setFontFilter(e.target.value)} placeholder="搜索字体..." className="settings-input mb-1.5" />
            <div className="border border-[var(--editor-border)] rounded-lg overflow-hidden bg-[var(--editor-surface)]" style={{ maxHeight: '150px', overflowY: 'auto' }}>
              {!fontsLoaded && <div className="flex items-center justify-center gap-2 py-3 text-xs text-[var(--sidebar-text)]"><Loader2 size={12} className="animate-spin" /> 加载中...</div>}
              {filtered.map((f) => (
                <button key={f} onClick={() => setFont(`'${f}', sans-serif`)}
                  className={`w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--editor-hover)] flex items-center justify-between ${cur.includes(f) ? 'bg-[var(--editor-accent)] text-white' : 'text-[var(--editor-text)]'}`}>
                  <span>{f}</span><span className="text-[11px] opacity-60" style={{ fontFamily: `'${f}', sans-serif` }}>Aa</span>
                </button>
              ))}
              {fontsLoaded && filtered.length === 0 && <div className="px-3 py-3 text-xs text-[var(--sidebar-text)] text-center">无匹配</div>}
            </div>
            <input type="text" value={cur} onChange={(e) => setFont(e.target.value)} placeholder="手动输入 CSS font-family" className="settings-input mt-1.5" />
          </Section>
          <Section title="源代码排版">
            <Row label={`字体大小: ${local.fontSize}px`}>
              <div className="w-full">
                <input type="range" min="12" max="32" value={local.fontSize} onChange={(e) => setLocal({ ...local, fontSize: Number(e.target.value) })} className="settings-range" />
                <div className="flex justify-between text-[11px] text-[var(--sidebar-text)] mt-0.5"><span>12px</span><span>32px</span></div>
              </div>
            </Row>
            <Row label={`行高: ${local.lineHeight}`}>
              <div className="w-full">
                <input type="range" min="1.2" max="3.0" step="0.1" value={local.lineHeight} onChange={(e) => setLocal({ ...local, lineHeight: Number(e.target.value) })} className="settings-range" />
                <div className="flex justify-between text-[11px] text-[var(--sidebar-text)] mt-0.5"><span>1.2</span><span>3.0</span></div>
              </div>
            </Row>
          </Section>
          <Section title="预览排版">
            <Row label={`字体大小: ${local.previewFontSize}px`}>
              <div className="w-full">
                <input type="range" min="12" max="32" value={local.previewFontSize} onChange={(e) => setLocal({ ...local, previewFontSize: Number(e.target.value) })} className="settings-range" />
                <div className="flex justify-between text-[11px] text-[var(--sidebar-text)] mt-0.5"><span>12px</span><span>32px</span></div>
              </div>
            </Row>
            <Row label={`行高: ${local.previewLineHeight}`}>
              <div className="w-full">
                <input type="range" min="1.2" max="3.0" step="0.1" value={local.previewLineHeight} onChange={(e) => setLocal({ ...local, previewLineHeight: Number(e.target.value) })} className="settings-range" />
                <div className="flex justify-between text-[11px] text-[var(--sidebar-text)] mt-0.5"><span>1.2</span><span>3.0</span></div>
              </div>
            </Row>
          </Section>
          <Section title="显示">
            <Row label="显示行号">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={local.showLineNumbers} onChange={(e) => setLocal({ ...local, showLineNumbers: e.target.checked })} className="settings-checkbox" />
              </label>
            </Row>
            <Row label="自动换行">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={local.wordWrap} onChange={(e) => setLocal({ ...local, wordWrap: e.target.checked })} className="settings-checkbox" />
              </label>
            </Row>
          </Section>
          
          <Section title="预览">
            <div className="p-3 bg-[var(--editor-surface)] border border-[var(--editor-border)] rounded-lg text-[var(--editor-text)]" style={{ fontFamily: local.fontFamily, fontSize: `${local.fontSize}px`, lineHeight: local.lineHeight }}>
              <div className="text-[11px] text-[var(--sidebar-text)] mb-1">源代码模式</div>
              <div style={{ fontFamily: "'Consolas', monospace", background: 'var(--editor-bg)', padding: '6px', borderRadius: '4px', fontSize: '12px' }}>function hello() {'{'}<br/>&nbsp;&nbsp;console.log("Hello, YiziMarkdown!");<br/>{'}'}</div>
              <div className="mt-2 text-[11px] text-[var(--sidebar-text)] mb-1">预览模式</div>
              <div style={{ fontFamily: local.previewFontFamily, fontSize: `${local.previewFontSize}px`, lineHeight: local.previewLineHeight }}><h3 style={{ fontWeight: 600, margin: '0.3em 0 0.2em' }}>标题示例</h3><p>这是一段<strong>示例文字</strong>。</p></div>
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

  const categories = [...new Set(SHORTCUT_ACTIONS.map(a => a.category))]

  return (
    <>
      <div className="settings-content-scroll">
        <div className="space-y-4">
          <Section title="快捷键配置">
            <p className="text-[10px] text-[var(--sidebar-text)] pb-2">点击快捷键按钮，按下组合键即可修改。按 Esc 取消录制。</p>
            {hasConflict && (
              <div className="px-4 py-2 bg-amber-50 border border-amber-300 rounded-lg">
                <p className="text-[11px] text-amber-700 font-medium">存在快捷键冲突，请修改后保存</p>
                {Object.entries(conflicts).map(([id, dupId]) => (
                  <p key={id} className="text-[10px] text-amber-600 mt-0.5">
                    {getActionLabel(id)} ({formatKey(map[id])}) 与 {getActionLabel(dupId)} 冲突
                  </p>
                ))}
              </div>
            )}
          </Section>
          {categories.map(cat => (
            <Section key={cat} title={cat}>
              <div className="space-y-0.5">
                {SHORTCUT_ACTIONS.filter(a => a.category === cat).map(action => {
                  const currentKey = map[action.id] || ''
                  const defaultKey = action.defaultKey
                  const isConflict = !!conflicts[action.id]
                  return (
                  <div key={action.id} className="settings-row">
                    <div className="flex-shrink-0">
                      <span className="text-[12px] text-[var(--editor-text)]">{action.label}</span>
                      {action.id === 'viewCycle' && (
                        <span className="text-[9px] text-[var(--sidebar-text)] ml-1">源代码 → 并排 → 实时 → 预览</span>
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
                        title={currentKey ? '点击重新录制' : '点击设置快捷键'}
                      >
                        {recordingId === action.id ? '按下组合键...' : formatKey(currentKey || defaultKey)}
                      </button>
                      {currentKey !== defaultKey && currentKey && (
                        <button onClick={() => setMap(prev => ({ ...prev, [action.id]: defaultKey }))}
                          className="p-1 rounded hover:bg-[var(--editor-hover)] text-[var(--sidebar-text)]" title="恢复默认">
                          <RotateCcw size={11} />
                        </button>
                      )}
                      {currentKey && (
                        <button onClick={() => setMap(prev => ({ ...prev, [action.id]: '' }))}
                          className="p-1 rounded hover:bg-[var(--editor-hover)] text-[var(--sidebar-text)]" title="清除快捷键">
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
        <Section title="文档模板">
          <div className="flex items-center justify-between pb-2">
            <p className="text-[11px] text-[var(--sidebar-text)]">新建文件时可选择模板</p>
            <button onClick={handleNew} className="text-[11px] text-[var(--editor-accent)] hover:underline">+ 新建</button>
          </div>
          {editing ? (
            <div className="space-y-2">
              <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="settings-input" placeholder="模板名称" />
              <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} className="settings-textarea font-mono" rows={10} />
              <div className="flex gap-2">
                <button onClick={handleSave} className="settings-btn-primary">保存</button>
                <button onClick={() => setEditing(false)} className="settings-btn-secondary">取消</button>
              </div>
            </div>
          ) : (
            <div className="flex gap-3">
              <div className="w-44 border border-[var(--editor-border)] rounded-lg overflow-hidden bg-[var(--editor-surface)]" style={{ maxHeight: '260px', overflowY: 'auto' }}>
                {templates.map((t) => (
                  <button key={t} onClick={() => load(t)} className={`w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--editor-hover)] flex items-center gap-2 ${selected === t ? 'bg-[var(--editor-accent)] text-white' : 'text-[var(--editor-text)]'}`}>
                    <span className="truncate flex-1">{t.replace(/\.\w+$/, '')}</span><Eye size={11} className="opacity-50 flex-shrink-0" />
                  </button>
                ))}
                {templates.length === 0 && <div className="px-3 py-3 text-xs text-[var(--sidebar-text)] text-center">暂无模板</div>}
              </div>
              <div className="flex-1 relative">
                {selected && <div className="absolute top-1 right-1"><button onClick={handleEdit} className="text-[11px] text-[var(--editor-accent)] hover:underline px-2 py-1">编辑</button></div>}
                {selected ? <textarea value={tContent} readOnly className="settings-textarea font-mono opacity-80" rows={12} />
                  : <div className="flex items-center justify-center h-36 text-xs text-[var(--sidebar-text)] border border-[var(--editor-border)] rounded-lg bg-[var(--editor-surface)]">选择左侧模板预览</div>}
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
        <Section title="插件管理">
          <p className="text-[11px] text-[var(--sidebar-text)] px-5 mb-3">
            启用插件后可增强 Markdown 的渲染能力。未启用的插件不会加载，不占用系统资源。
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
                        <span className="text-sm font-medium text-[var(--editor-text)]">{plugin.name}</span>
                        {isEnabled && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-[var(--editor-accent)] text-white rounded">
                            已启用
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[var(--sidebar-text)] mt-0.5">{plugin.description}</p>
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
                            <span className="text-[12px] text-[var(--editor-text)]">{field.label}</span>
                            {field.hint && (
                              <p className="text-[10px] text-[var(--sidebar-text)] mt-0.5">{field.hint}</p>
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
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
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
          既好看，又彪悍！
        </p>
        <p style={{ fontSize: 13, color: 'var(--sidebar-text)', textAlign: 'center', margin: '0 0 4px', lineHeight: 1.5, maxWidth: 320 }}>
          用YiziMarkdown，开心写出好运气
        </p>
        <p style={{ fontSize: 11, color: 'var(--sidebar-text)', textAlign: 'center', margin: 0, opacity: 0.6, lineHeight: 1.4, maxWidth: 320 }}>
          一款简洁精致的 Windows 便携 Markdown 编辑器 · 免安装，解压即用
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
          <span style={{ flex: 1, textAlign: 'left' }}>官方网站</span>
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
          <span style={{ flex: 1, textAlign: 'left' }}>GitHub</span>
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
          <span style={{ flex: 1, textAlign: 'left' }}>历史版本</span>
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
          <span style={{ flex: 1, textAlign: 'left' }}>帮助文档</span>
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

// ===================== 主弹窗 =====================
export default function SettingsModal({ isOpen, onClose, defaultTab }: SettingsModalProps) {
  const [active, setActive] = useState<CategoryKey>('general')

  useEffect(() => {
    if (isOpen) setActive(defaultTab || 'general')
  }, [isOpen, defaultTab])

  if (!isOpen) return null

  const content: Record<CategoryKey, React.ReactNode> = {
    general: <GeneralSettings />, appearance: <AppearanceSettings />, editor: <EditorSettings />,
    liveMode: <LiveModeSettings />, plugins: <PluginsSettings />,
    shortcuts: <ShortcutsSettings />, templates: <TemplatesSettings />, about: <AboutSettings />,
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="settings-modal-container">
        <div className="settings-modal-header">
          <button onClick={onClose} className="mr-2 p-0.5 rounded hover:bg-[var(--editor-hover)] text-[var(--sidebar-text)]"><ChevronRight size={14} className="rotate-180" /></button>
          <span>偏好设置</span>
          <button onClick={onClose} className="ml-auto p-1 rounded-lg hover:bg-[var(--editor-hover)] text-[var(--sidebar-text)]"><X size={14} /></button>
        </div>
        <div className="flex flex-1 overflow-hidden">
          <div className="settings-modal-sidebar">
            {categories.map((cat) => (
              <button key={cat.key} onClick={() => setActive(cat.key)}
                className={`settings-sidebar-item ${active === cat.key ? 'settings-sidebar-active' : ''}`}>
                {cat.icon}<span>{cat.label}</span>
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
