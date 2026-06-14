import { useState, useEffect, useCallback, useRef } from 'react'
import { X, Loader2, ChevronRight, FolderOpen, Palette, FileText, Keyboard, Settings2, Eye, Info, Github, History, BookOpen, ExternalLink } from 'lucide-react'
import { useSettingsStore } from '../stores/settingsStore'

const invokeTauri = async <T,>(cmd: string, args?: Record<string, unknown>): Promise<T | null> => {
  try {
    const tauri = (window as any).__TAURI_INTERNALS__
    if (tauri && typeof tauri.invoke === 'function') {
      return await tauri.invoke(cmd, args)
    }
    return null
  } catch (error) {
    console.warn(`Tauri command failed: ${cmd}`, error)
    return null
  }
}

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
  fontFamily: "'DengXian', 'Microsoft YaHei', 'Noto Sans SC', system-ui, sans-serif",
  previewFontFamily: "'DengXian', 'Microsoft YaHei', 'Noto Sans SC', system-ui, sans-serif",
  fontSize: 20, lineHeight: 2.0, previewFontSize: 20, previewLineHeight: 2.0,
  showLineNumbers: true, wordWrap: true,
}

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  defaultTab?: CategoryKey
}

type CategoryKey = 'general' | 'appearance' | 'editor' | 'shortcuts' | 'templates' | 'about'

const categories: Array<{ key: CategoryKey; label: string; icon: React.ReactNode }> = [
  { key: 'general', label: '通用', icon: <Settings2 size={16} /> },
  { key: 'appearance', label: '外观', icon: <Palette size={16} /> },
  { key: 'editor', label: '编辑器', icon: <FileText size={16} /> },
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

  useEffect(() => {
    invokeTauri<string[]>('list_themes').then((l) => setThemeFiles(l || []))
  }, [])

  const handleRestore = () => {
    setField('currentTheme', DEFAULTS_APPEARANCE.currentTheme)
    setField('isDark', DEFAULTS_APPEARANCE.isDark)
  }

  const nameMap: Record<string, string> = {
    'minimal': '极简风', 'magazine': '杂志感', 'tech': '科技感', 'nature': '自然风',
  }
  const descMap: Record<string, string> = {
    'minimal': '清爽干净的默认风格', 'magazine': '温暖优雅的阅读体验',
    'tech': '冷峻专业的技术文档', 'nature': '柔和舒适的森林绿调',
  }
  return (
    <>
      <div className="settings-content-scroll">
        <div className="space-y-4">
          <Section title="主题">
            <div className="grid grid-cols-2 gap-2">
              {themeFiles.map((file) => {
                const id = file.replace(/\.css$/, '')
                const displayName = nameMap[id] || id
                const desc = descMap[id] || '用户自定义主题'
                return (
                <button key={file} onClick={() => setField('currentTheme', id)}
                  className={`settings-theme-card ${currentTheme === id ? 'settings-theme-active' : ''}`}>
                  <div className={`w-full h-10 rounded-md mb-1.5 ${nameMap[id] ? `theme-swatch-${id}` : ''}`}
                    style={!nameMap[id] ? { background: 'var(--editor-surface)', border: '1px solid var(--editor-border)' } : undefined} />
                  <p className="text-xs font-medium text-[var(--editor-text)] truncate">{displayName}</p>
                  <p className="text-[10px] text-[var(--sidebar-text)] truncate">{desc}</p>
                </button>
              )})}
            </div>
          </Section>
          <Section title="模式">
            <Row label="深色模式">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={isDark} onChange={(e) => setField('isDark', e.target.checked)} className="settings-checkbox" />
                <span className="text-xs text-[var(--editor-text)]">启用深色模式</span>
              </label>
            </Row>
          </Section>
          <Section title="自定义 CSS"><UserCssEditor /></Section>
        </div>
      </div>
      <div className="settings-footer-bar">
        <button onClick={handleRestore} className="settings-btn-secondary">恢复默认</button>
      </div>
    </>
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

// ===================== 快捷键设置 =====================
function ShortcutsSettings() {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [originalText, setOriginalText] = useState('')

  useEffect(() => {
    invokeTauri<string>('read_keybindings').then((c) => { if (c) { setText(c); setOriginalText(c) } })
  }, [])

  const hasChanges = text !== originalText

  const handleSave = async () => {
    try { JSON.parse(text); setError(''); await invokeTauri('write_keybindings', { content: text }); setOriginalText(text) }
    catch { setError('JSON 格式无效') }
  }

  const handleRestore = () => {
    setText('{\n  "ctrl+s": "save",\n  "ctrl+n": "newFile",\n  "ctrl+o": "openFile",\n  "ctrl+f": "search",\n  "f12": "toggleDevtools"\n}')
  }

  return (
    <>
      <div className="settings-content-scroll">
        <div className="space-y-4">
          <Section title="快捷键配置">
            <p className="text-[10px] text-[var(--sidebar-text)] pb-2">键名使用 <code className="bg-[var(--editor-surface)] px-1 py-0.5 rounded text-[11px]">ctrl+s</code> 格式。</p>
            <textarea value={text} onChange={(e) => { setText(e.target.value); setError('') }} className="settings-textarea font-mono" rows={10} spellCheck={false} />
            {error && <p className="text-[11px] text-red-500">{error}</p>}
          </Section>
        </div>
      </div>
      <FooterBar hasChanges={hasChanges} onSave={handleSave} onRestore={handleRestore} />
    </>
  )
}

// ===================== 模板设置 =====================
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
