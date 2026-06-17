import { useState, useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react'
import { EditorView, keymap, lineNumbers, drawSelection, highlightActiveLine } from '@codemirror/view'
import { EditorState, Compartment, Extension } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { defaultHighlightStyle, syntaxHighlighting, indentOnInput, bracketMatching } from '@codemirror/language'
import { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo } from '@codemirror/commands'
import { search, searchKeymap, highlightSelectionMatches, closeSearchPanel } from '@codemirror/search'
import { autocompletion, completionKeymap } from '@codemirror/autocomplete'
import { Search, X, Replace as ReplaceIcon, ChevronUp, ChevronDown } from 'lucide-react'
import { languages } from '@codemirror/language-data'
import { useSettingsStore } from '../stores/settingsStore'
import { useEditorStore, type ViewMode } from '../stores/editorStore'
import { findOutlineByLine, computeOutlineItems } from '../lib/headingId'
import { liveEditExtension } from '../lib/cm-live-render'
import { slashMenuExtension, slashMenuState, showSlashMenu, hideSlashMenu, slashMenuAction } from '../lib/cm-slash-menu'
import SlashMenu from './SlashMenu'
import { renderMarkdown } from '../lib/markdownRenderer'
import { extendMarkdownIt, postRender as pluginPostRender } from '../plugins/registry'

// const markdownHighlight = HighlightStyle.define([
//   // 标题
//   { tag: tags.heading1, fontSize: '1.8em', fontWeight: 'bold', color: 'var(--editor-accent)' },
//   { tag: tags.heading2, fontSize: '1.5em', fontWeight: 'bold', color: 'var(--editor-accent)' },
//   { tag: tags.heading3, fontSize: '1.3em', fontWeight: 'bold', color: 'var(--editor-accent)' },
//   { tag: tags.heading4, fontWeight: 'bold', color: 'var(--editor-accent)' },
//   { tag: tags.heading5, fontWeight: 'bold', color: 'var(--editor-accent)' },
//   { tag: tags.heading6, fontWeight: 'bold', color: 'var(--editor-accent)' },
//   // 行内格式
//   { tag: tags.emphasis, fontStyle: 'italic' },
//   { tag: tags.strong, fontWeight: 'bold' },
//   { tag: tags.strikethrough, textDecoration: 'line-through' },
//   { tag: tags.monospace, fontFamily: 'var(--font-mono)', fontSize: '0.9em', background: 'var(--editor-surface)', padding: '2px 4px', borderRadius: '3px' },
//   // 链接与引用
//   { tag: tags.link, color: 'var(--editor-accent)', textDecoration: 'underline' },
//   { tag: tags.url, color: 'var(--editor-accent)', textDecoration: 'underline' },
//   { tag: tags.quote, color: 'var(--editor-text)', fontStyle: 'italic' },
//   // 结构
//   { tag: tags.contentSeparator, color: 'var(--editor-border)', fontWeight: 'bold' },
//   { tag: tags.list, color: 'var(--editor-text)' },
//   // 代码与关键字
//   { tag: tags.keyword, color: 'var(--editor-accent)' },
//   { tag: tags.atom, color: 'var(--editor-accent)' },
//   { tag: tags.bool, color: 'var(--editor-accent)' },
//   { tag: tags.null, color: 'var(--editor-accent)' },
//   { tag: tags.string, color: 'var(--editor-accent)' },
//   { tag: tags.special(tags.string), color: 'var(--editor-accent)' },
//   { tag: tags.number, color: 'var(--editor-accent)' },
//   { tag: tags.regexp, color: 'var(--editor-accent)' },
//   { tag: tags.escape, color: 'var(--editor-accent)' },
//   { tag: tags.variableName, color: 'var(--editor-text)' },
//   { tag: tags.definition(tags.variableName), color: 'var(--editor-accent)' },
//   { tag: tags.function(tags.variableName), color: 'var(--editor-accent)' },
//   { tag: tags.special(tags.variableName), color: 'var(--editor-accent)' },
//   // 注释
//   { tag: tags.comment, color: 'var(--editor-border)', fontStyle: 'italic' },
//   { tag: tags.lineComment, color: 'var(--editor-border)', fontStyle: 'italic' },
//   { tag: tags.blockComment, color: 'var(--editor-border)', fontStyle: 'italic' },
//   // HTML / 标签
//   { tag: tags.tagName, color: 'var(--editor-accent)' },
//   { tag: tags.attributeName, color: 'var(--editor-accent)' },
//   { tag: tags.attributeValue, color: 'var(--editor-accent)' },
//   // 类型与属性
//   { tag: tags.typeName, color: 'var(--editor-accent)' },
//   { tag: tags.className, color: 'var(--editor-accent)' },
//   { tag: tags.propertyName, color: 'var(--editor-accent)' },
//   { tag: tags.labelName, color: 'var(--editor-accent)' },
//   { tag: tags.namespace, color: 'var(--editor-accent)' },
//   { tag: tags.macroName, color: 'var(--editor-accent)' },
//   // 其他
//   { tag: tags.meta, color: 'var(--editor-accent)' },
//   { tag: tags.processingInstruction, color: 'var(--editor-accent)' },
//   { tag: tags.operator, color: 'var(--editor-text)' },
//   { tag: tags.punctuation, color: 'var(--editor-text)' },
//   { tag: tags.separator, color: 'var(--editor-text)' },
//   { tag: tags.content, color: 'var(--editor-text)' },
//   { tag: tags.self, color: 'var(--editor-accent)' },
//   { tag: tags.special(tags.brace), color: 'var(--editor-text)' },
//   { tag: tags.invalid, color: '#ff0000' },
// ])

export interface EditorRef {
  insertMarkdown: (markdown: string, mode?: 'wrap' | 'prefix' | 'link') => void
  toggleSearch: () => void
  navigateToLine: (target: { id: string; line: number }) => void
  getScrollDoms: () => { editor: HTMLElement | null; preview: HTMLElement | null }
  undo: () => void
  redo: () => void
}

interface EditorProps {
  content: string
  onChange: (content: string) => void
  onSearchToggle?: () => void
  isSearchOpen?: boolean
  viewMode?: ViewMode
  onCursorChange?: (pos: { line: number; column: number }) => void
}

interface PreviewPaneProps {
  content: string
  currentTheme: string
  onContentChange?: (content: string) => void
  enabledPlugins?: string[]
  pluginConfigs?: Record<string, Record<string, unknown>>
}

function PreviewPane({ content, currentTheme, onContentChange, enabledPlugins = [], pluginConfigs = {} }: PreviewPaneProps) {
  // 插件就绪状态：变化时触发 markdown 重新渲染
  const pluginsReady = useEditorStore((s: any) => s._pluginsReady)

  // 防抖渲染：150ms 内不重复触发 markdown-it
  const [debouncedContent, setDebouncedContent] = useState(content)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => setDebouncedContent(content), 150)
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current) }
  }, [content])
  // 首次立即渲染（不等防抖）
  const isFirstRender = useRef(true)
  if (isFirstRender.current) {
    isFirstRender.current = false
    if (debouncedContent !== content) setDebouncedContent(content)
  }
  const pluginExtenders = useMemo(() => {
    const exts: Array<(md: any) => void> = []
    for (const _id of enabledPlugins) {
      exts.push((md: any) => extendMarkdownIt(md, enabledPlugins, pluginConfigs || {}))
    }
    return exts
  }, [enabledPlugins, pluginConfigs])
  // 插件未就绪时跳过渲染（避免用空 loadedPlugins 生成无公式/图表的 HTML）
  const renderedHtml = useMemo(() => {
    if (enabledPlugins.length > 0 && !pluginsReady) return ''
    return renderMarkdown(debouncedContent, pluginExtenders)
  }, [debouncedContent, pluginExtenders, pluginsReady, enabledPlugins.length])
  const containerRef = useRef<HTMLDivElement>(null)

  // 插件后处理：公式渲染、图表渲染等
  useEffect(() => {
    const container = containerRef.current
    if (!container || enabledPlugins.length === 0) return
    pluginPostRender(container, enabledPlugins, pluginConfigs || {})
  }, [renderedHtml, enabledPlugins, pluginConfigs, pluginsReady])

  // 监听任务列表 checkbox 点击，同步回源码
  useEffect(() => {
    const container = containerRef.current
    if (!container || !onContentChange) return

    const handleClick = (e: Event) => {
      const target = e.target as HTMLInputElement
      if (target.type !== 'checkbox' || !target.closest('.task-list-item')) return

      // 找到 checkbox 所在的行内容
      const li = target.closest('li')
      if (!li) return
      const text = li.textContent?.trim() || ''
      const isChecked = target.checked

      // 在源码中匹配对应行并更新
      const lines = content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const taskMatch = line.match(/^- \[([ xX])\] (.+)$/)
        if (taskMatch && taskMatch[2].trim() === text) {
          lines[i] = line.replace(/^- \[([ xX])\]/, isChecked ? '- [x]' : '- [ ]')
          onContentChange(lines.join('\n'))
          break
        }
      }
    }

    container.addEventListener('click', handleClick)
    return () => container.removeEventListener('click', handleClick)
  }, [content, onContentChange])

  // 解析本地图片路径为 data URL（Tauri 环境下）
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const tauri = (window as any).__TAURI_INTERNALS__
    if (!tauri || typeof tauri.invoke !== 'function') return

    const imgs = container.querySelectorAll('img')
    imgs.forEach((img) => {
      const src = img.getAttribute('src')
      if (!src || src.startsWith('http') || src.startsWith('data:') || src.startsWith('asset://')) return
      // 判断是否为本地路径（含盘符或以 / 开头）
      const isLocal = /^[A-Za-z]:\\/.test(src) || /^[A-Za-z]:\//.test(src) || src.startsWith('/')
      if (!isLocal) return

      const normalized = src.replace(/\\/g, '/')
      tauri.invoke('read_image_base64', { path: normalized })
        .then((dataUrl: string) => {
          img.setAttribute('src', dataUrl)
        })
        .catch(() => {})
    })
  }, [renderedHtml])

  return (
    <div className="min-h-full bg-[var(--editor-bg)]" ref={containerRef}>
      <div 
        className={`editor-content prose prose-lg max-w-none theme-${currentTheme}`}
        style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--preview-font-size, var(--font-size-base))', lineHeight: 'var(--preview-line-height, var(--line-height))' }}
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />
    </div>
  )
}


function buildEditorTheme(isDark: boolean, fontFamily: string, fontSize: string, lineHeight: string): Extension {
  return EditorView.theme({
    '&.cm-editor': {
      height: '100%',
    },
    '.cm-scroller': {
      overflow: 'auto',
    },
    '&': {
      fontSize: `var(--font-size-base, ${fontSize})`,
      fontFamily: `var(--font-mono, ${fontFamily})`,
      lineHeight: `var(--line-height, ${lineHeight})`,
    },
    '.cm-content': {
      padding: '40px 60px',
      maxWidth: '900px',
      margin: '0 auto',
      caretColor: 'var(--editor-cursor)',
      color: 'var(--editor-text)',
      fontFamily: `var(--font-mono, ${fontFamily})`,
    },
    '.cm-line': {
      padding: '2px 0',
      lineHeight: 'var(--line-height, 1.8)',
    },
    '&.cm-focused': {
      outline: 'none',
    },
    '.cm-selectionBackground': {
      backgroundColor: `${isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)'} !important`,
    },
    '.cm-activeLine': {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--editor-bg)',
      color: 'var(--editor-border)',
      border: 'none',
      borderRight: '1px solid var(--editor-border)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
    },
    '.cm-foldPlaceholder': {
      backgroundColor: 'var(--editor-hover)',
      color: 'var(--editor-text)',
      border: '1px solid var(--editor-border)',
    },
    '.cm-searchMatch': {
      backgroundColor: 'rgba(255, 213, 0, 0.3)',
      outline: '1px solid rgba(255, 213, 0, 0.6)',
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: 'rgba(255, 150, 0, 0.4)',
    },
    '.cm-tooltip': {
      backgroundColor: 'var(--editor-surface)',
      border: '1px solid var(--editor-border)',
      color: 'var(--editor-text)',
    },
    '.cm-tooltip-autocomplete': {
      '& > ul > li': {
        padding: '4px 8px',
      },
      '& > ul > li[aria-selected]': {
        backgroundColor: 'var(--editor-hover)',
        color: 'var(--editor-text)',
      },
    },
  })
}

const Editor = forwardRef<EditorRef, EditorProps>(({ content, onChange, onSearchToggle, isSearchOpen: externalSearchOpen, viewMode: externalViewMode, onCursorChange }, ref) => {

  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const [internalSearchOpen, setInternalSearchOpen] = useState(false)
  const isSearchOpen = externalSearchOpen !== undefined ? externalSearchOpen : internalSearchOpen
  const [searchTerm, setSearchTerm] = useState('')
  const [replaceTerm, setReplaceTerm] = useState('')
  const [isReplaceOpen, setIsReplaceOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [searchMatches, setSearchMatches] = useState<number>(0)
  const [searchIndex, setSearchIndex] = useState<number>(-1)
  const { fontFamily, fontSize, lineHeight, currentTheme, isDark, showLineNumbers, wordWrap, spellCheck, liveAnimationMode, enabledPlugins, pluginConfigs } = useSettingsStore()
  const viewMode = externalViewMode ?? 'preview'
  const [slashMenuVisible, setSlashMenuVisible] = useState(false)
  const [slashMenuCoords, setSlashMenuCoords] = useState({ left: 0, bottom: 0 })
  const [slashMenuQuery, setSlashMenuQuery] = useState('')
  const lineNumbersCompartment = useRef(new Compartment()).current
  const richCompartment = useRef(new Compartment()).current
  const lineWrappingCompartment = useRef(new Compartment()).current
  const themeCompartment = useRef(new Compartment()).current
  const spellCheckCompartment = useRef(new Compartment()).current
  const previewScrollRef = useRef<HTMLDivElement>(null)
  const viewReadyRef = useRef(false)
  // 同步滚动：driver lock + guard
  const syncGuardRef = useRef(false)
  const activeScrollPaneRef = useRef<'editor' | 'preview' | null>(null)
  const activeScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 同步滚动 cleanup holders
  const scrollCleanupRef = useRef<(() => void) | null>(null)
  const lastSyncedFromEditorRef = useRef('')
  const syncingFromExternalRef = useRef(false)
  // 缓存大纲 items，仅在 content 变化时重算
  const outlineCacheRef = useRef<{ content: string; items: ReturnType<typeof computeOutlineItems> }>({ content: '', items: [] })
  const getOutlineItems = (text: string) => {
    const cache = outlineCacheRef.current
    if (cache.content !== text) {
      cache.content = text
      cache.items = computeOutlineItems(text)
    }
    return cache.items
  }

  // ---- 同步滚动辅助 ----
  /** 获取预览面板中所有带 data-source-line 的元素，按行号排序 */
  const getPreviewLines = useCallback((container: HTMLElement) => {
    const nodes = container.querySelectorAll<HTMLElement>('[data-source-line]')
    const list: Array<{ line: number; el: HTMLElement }> = []
    for (const el of Array.from(nodes)) {
      const n = Number(el.getAttribute('data-source-line') || '0')
      if (n > 0) list.push({ line: n, el })
    }
    list.sort((a, b) => a.line - b.line)
    return list
  }, [])

  /** 二分查找：找到 list 中 line <= target 的最大项 */
  const findNearestLine = useCallback((list: Array<{ line: number; el?: HTMLElement }>, target: number) => {
    if (!list.length) return null
    let lo = 0, hi = list.length - 1, best = list[0]
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (list[mid].line <= target) { best = list[mid]; lo = mid + 1 }
      else hi = mid - 1
    }
    return best
  }, [])

  // ---- 统一同步滚动（借鉴 SoloMD driver-lock + data-source-line 方案） ----
  // 绑定/解绑 scroll 事件，仅在 split 模式下激活
  useEffect(() => {
    // 先清理旧的
    scrollCleanupRef.current?.()

    if (viewMode !== 'split') {
      scrollCleanupRef.current = null
      return
    }

    const view = viewRef.current
    const editor = view?.scrollDOM ?? null
    const preview = previewScrollRef.current
    if (!editor || !preview) { scrollCleanupRef.current = null; return }

    // ---- Driver lock：区分用户主动滚动 vs 程序同步 ----
    const intentEvents = ['wheel', 'pointerdown', 'touchstart', 'keydown'] as const
    const markActive = (which: 'editor' | 'preview') => {
      activeScrollPaneRef.current = which
      if (activeScrollTimerRef.current) clearTimeout(activeScrollTimerRef.current)
      activeScrollTimerRef.current = setTimeout(() => { activeScrollPaneRef.current = null }, 250)
    }
    const onEditorIntent = () => markActive('editor')
    const onPreviewIntent = () => markActive('preview')
    for (const ev of intentEvents) {
      editor.addEventListener(ev, onEditorIntent, { passive: true })
      preview.addEventListener(ev, onPreviewIntent, { passive: true })
    }

    // ---- 编辑器 → 预览 ----
    const onEditorScroll = () => {
      if (syncGuardRef.current || activeScrollPaneRef.current === 'preview') return
      const v = viewRef.current
      if (!v) return
      // 获取编辑器视口顶部 1/3 处的行号
      const top = v.scrollDOM.scrollTop + v.scrollDOM.clientHeight / 3
      const block = v.lineBlockAtHeight(top)
      const currentLine = v.state.doc.lineAt(block.from).number
      // 更新大纲高亮
      const items = getOutlineItems(v.state.doc.toString())
      const item = findOutlineByLine(items, currentLine)
      useEditorStore.getState().setActiveHeadingId(item?.id ?? null)
      // 同步预览
      const previewLines = getPreviewLines(preview)
      const entry = findNearestLine(previewLines, currentLine)
      if (!entry) return
      const elRect = entry.el!.getBoundingClientRect()
      const wrapRect = preview.getBoundingClientRect()
      syncGuardRef.current = true
      preview.scrollTop += elRect.top - wrapRect.top - preview.clientHeight / 3
      requestAnimationFrame(() => { syncGuardRef.current = false })
    }

    // ---- 预览 → 编辑器 ----
    const onPreviewScroll = () => {
      if (syncGuardRef.current || activeScrollPaneRef.current === 'editor') return
      const v = viewRef.current
      if (!v) return
      const wrapTop = preview.getBoundingClientRect().top
      const threshold = wrapTop + preview.clientHeight / 3
      // 找到预览视口 1/3 处对应的 source line
      const previewLines = getPreviewLines(preview)
      let targetLine: number | null = null
      for (const { line, el } of previewLines) {
        if (el.getBoundingClientRect().bottom >= threshold) { targetLine = line; break }
      }
      if (targetLine == null) return
      // 更新大纲高亮
      const items = getOutlineItems(v.state.doc.toString())
      const item = findOutlineByLine(items, targetLine)
      useEditorStore.getState().setActiveHeadingId(item?.id ?? null)
      // 同步编辑器
      const safe = Math.max(1, Math.min(targetLine, v.state.doc.lines))
      const lineObj = v.state.doc.line(safe)
      syncGuardRef.current = true
      v.dispatch({
        effects: EditorView.scrollIntoView(lineObj.from, { y: 'start', yMargin: v.scrollDOM.clientHeight / 3 }),
      })
      requestAnimationFrame(() => { syncGuardRef.current = false })
    }

    editor.addEventListener('scroll', onEditorScroll, { passive: true })
    preview.addEventListener('scroll', onPreviewScroll, { passive: true })

    // cleanup
    scrollCleanupRef.current = () => {
      editor.removeEventListener('scroll', onEditorScroll)
      preview.removeEventListener('scroll', onPreviewScroll)
      for (const ev of intentEvents) {
        editor.removeEventListener(ev, onEditorIntent)
        preview.removeEventListener(ev, onPreviewIntent)
      }
      if (activeScrollTimerRef.current) clearTimeout(activeScrollTimerRef.current)
    }
  }, [viewMode, viewReadyRef.current, getPreviewLines, findNearestLine, getOutlineItems])

  // ---- 单面板模式下的 scroll spy（大纲高亮） ----
  useEffect(() => {
    if (viewMode === 'split') return
    // edit/live 模式：监听编辑器滚动
    if (viewMode === 'edit' || viewMode === 'live') {
      const view = viewRef.current
      if (!view) return
      const scroller = view.scrollDOM
      const onScroll = () => {
        if (syncGuardRef.current) return
        const top = scroller.scrollTop + scroller.clientHeight / 3
        const lineObj = view.lineBlockAtHeight(top)
        const line = view.state.doc.lineAt(lineObj.from).number
        const items = getOutlineItems(view.state.doc.toString())
        const item = findOutlineByLine(items, line)
        useEditorStore.getState().setActiveHeadingId(item?.id ?? null)
      }
      scroller.addEventListener('scroll', onScroll, { passive: true })
      return () => scroller.removeEventListener('scroll', onScroll)
    }
    // preview 模式：监听预览滚动
    if (viewMode === 'preview') {
      const container = previewScrollRef.current
      if (!container) return
      const onScroll = () => {
        if (syncGuardRef.current) return
        const wrapTop = container.getBoundingClientRect().top
        const threshold = wrapTop + container.clientHeight / 3
        const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6')
        let activeId: string | null = null
        for (const el of headings) {
          if (el.getBoundingClientRect().top <= threshold) { activeId = el.id } else break
        }
        useEditorStore.getState().setActiveHeadingId(activeId)
      }
      container.addEventListener('scroll', onScroll, { passive: true })
      return () => container.removeEventListener('scroll', onScroll)
    }
  }, [viewMode, getOutlineItems])

  // ---- Live 模式：reconfigure richCompartment ----
  useEffect(() => {
    const view = viewRef.current
    if (!view || !viewReadyRef.current) return
    view.dispatch({ effects: richCompartment.reconfigure(viewMode === 'live' ? liveEditExtension() : []) })
  }, [viewMode])

  // ---- 跨模式切换定位（借鉴 SoloMD：保存 top line，恢复到同一行） ----
  const prevViewModeRef = useRef(viewMode)
  useEffect(() => {
    const prev = prevViewModeRef.current
    prevViewModeRef.current = viewMode
    if (prev === viewMode) return

    const view = viewRef.current
    const pvDom = previewScrollRef.current
    if (!view) return

    // 1. 从旧模式快照当前 top line
    let savedLine: number | null = null
    if (prev === 'preview') {
      // 从预览快照：找视口顶部 1/3 处的 source-line
      if (pvDom) {
        const wrapTop = pvDom.getBoundingClientRect().top
        const threshold = wrapTop + pvDom.clientHeight / 3
        const list = getPreviewLines(pvDom)
        for (const { line, el } of list) {
          if (el.getBoundingClientRect().bottom >= threshold) { savedLine = line; break }
        }
      }
    } else {
      // 从编辑器快照：视口顶部 1/3 处的行号
      const top = view.scrollDOM.scrollTop + view.scrollDOM.clientHeight / 3
      const block = view.lineBlockAtHeight(top)
      savedLine = view.state.doc.lineAt(block.from).number
    }
    if (savedLine == null) return

    // 2. 等 DOM 更新后恢复到目标行
    setTimeout(() => {
      const v = viewRef.current
      const pv = previewScrollRef.current
      if (!v) return

      syncGuardRef.current = true

      // 恢复到编辑器
      if (viewMode === 'edit' || viewMode === 'live' || viewMode === 'split') {
        const safe = Math.max(1, Math.min(savedLine, v.state.doc.lines))
        const lineObj = v.state.doc.line(safe)
        v.dispatch({
          effects: EditorView.scrollIntoView(lineObj.from, { y: 'start', yMargin: v.scrollDOM.clientHeight / 3 }),
        })
      }
      // 恢复到预览
      if (viewMode === 'preview' || viewMode === 'split') {
        if (pv) {
          const list = getPreviewLines(pv)
          const entry = findNearestLine(list, savedLine)
          if (entry) {
            const elRect = entry.el!.getBoundingClientRect()
            const wrapRect = pv.getBoundingClientRect()
            pv.scrollTop += elRect.top - wrapRect.top - pv.clientHeight / 3
          }
        }
      }

      requestAnimationFrame(() => { syncGuardRef.current = false })
    }, 100)
  }, [viewMode, getPreviewLines, findNearestLine])

  useImperativeHandle(ref, () => ({
    insertMarkdown: (markdown: string, mode?: 'wrap' | 'prefix' | 'link') => {
      const view = viewRef.current
      if (!view) return
      const { from, to } = view.state.selection.main
      const selectedText = view.state.sliceDoc(from, to)

      let insertText: string
      let newFrom: number
      let newTo: number

      if (mode === 'wrap') {
        if (selectedText) {
          insertText = `${markdown}${selectedText}${markdown}`
          newFrom = from + markdown.length
          newTo = to + markdown.length
        } else {
          insertText = `${markdown}${markdown}`
          newFrom = from + markdown.length
          newTo = from + markdown.length
        }
      } else if (mode === 'prefix') {
        if (selectedText) {
          const lines = selectedText.split('\n')
          const prefixed = lines.map(l => `${markdown}${l}`).join('\n')
          insertText = prefixed
          newFrom = from + markdown.length
          newTo = from + prefixed.length
        } else {
          insertText = markdown
          newFrom = from + markdown.length
          newTo = from + markdown.length
        }
      } else if (mode === 'link') {
        if (selectedText) {
          insertText = markdown.replace('链接', selectedText).replace('alt', selectedText)
          newFrom = insertText.indexOf('](') + from + 2
          newTo = newFrom + 3
        } else {
          insertText = markdown
          const bracketPos = markdown.indexOf('](')
          newFrom = from + (bracketPos >= 0 ? bracketPos + 2 : markdown.length)
          newTo = newFrom + 3
        }
      } else {
        insertText = markdown
        newFrom = from + markdown.length
        newTo = from + markdown.length
      }

      view.dispatch({
        changes: { from, to, insert: insertText },
        selection: { anchor: newFrom, head: newTo },
      })
      view.focus()
    },
    toggleSearch: () => {
      setInternalSearchOpen(prev => !prev)
    },
    navigateToLine: ({ id, line }: { id: string; line: number }) => {
      const view = viewRef.current
      if (viewMode === 'edit' || viewMode === 'live') {
        // 源代码模式：按行号跳转
        if (!view) return
        const doc = view.state.doc
        const lineNum = Math.max(1, Math.min(line, doc.lines))
        const lineObj = doc.line(lineNum)
        view.dispatch({
          selection: { anchor: lineObj.from },
          effects: EditorView.scrollIntoView(lineObj.from, { y: 'center' }),
        })
        view.focus()
      } else if (viewMode === 'preview') {
        // 纯预览模式：滚动预览面板
        const el = document.getElementById(id)
        const pvDom = previewScrollRef.current
        if (el && pvDom) {
          const pvRect = pvDom.getBoundingClientRect()
          const elRect = el.getBoundingClientRect()
          const offset = elRect.top - pvRect.top + pvDom.scrollTop - pvDom.clientHeight / 2 + elRect.height / 2
          pvDom.scrollTo({ top: Math.max(0, offset) })
        }
      } else if (viewMode === 'split') {
        // 并排模式：同时滚动编辑器和预览
        syncGuardRef.current = true
        // 编辑器跳转到对应行
        if (view) {
          const doc = view.state.doc
          const lineNum = Math.max(1, Math.min(line, doc.lines))
          const lineObj = doc.line(lineNum)
          view.dispatch({
            selection: { anchor: lineObj.from },
            effects: EditorView.scrollIntoView(lineObj.from, { y: 'center' }),
          })
        }
        // 预览跳转到对应标题
        const el = document.getElementById(id)
        const pvDom = previewScrollRef.current
        if (el && pvDom) {
          const pvRect = pvDom.getBoundingClientRect()
          const elRect = el.getBoundingClientRect()
          const offset = elRect.top - pvRect.top + pvDom.scrollTop - pvDom.clientHeight / 2 + elRect.height / 2
          pvDom.scrollTo({ top: Math.max(0, offset) })
        }
        requestAnimationFrame(() => { syncGuardRef.current = false })
      }
      // 更新大纲高亮
      useEditorStore.getState().setActiveHeadingId(id)
    },
    getScrollDoms: () => {
      const view = viewRef.current
      return {
        editor: view?.scrollDOM ?? null,
        preview: previewScrollRef.current ?? null,
      }
    },
    undo: () => {
      const view = viewRef.current
      if (view) {
        undo({ state: view.state, dispatch: view.dispatch })
        view.focus()
      }
    },
    redo: () => {
      const view = viewRef.current
      if (view) {
        redo({ state: view.state, dispatch: view.dispatch })
        view.focus()
      }
    }
  }))

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault()
        setInternalSearchOpen(prev => !prev)
      }
      if (e.key === 'Escape') {
        setInternalSearchOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (isSearchOpen && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [isSearchOpen])

  useEffect(() => {
    if (!editorRef.current) return

    const state = EditorState.create({
      doc: content,
      extensions: [
        lineNumbersCompartment.of([]),
        richCompartment.of(viewMode === 'live' ? liveEditExtension() : []),
        history(),
        lineWrappingCompartment.of(wordWrap ? EditorView.lineWrapping : []),
        themeCompartment.of(buildEditorTheme(isDark, fontFamily, String(fontSize), String(lineHeight))),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        autocompletion(),
        spellCheckCompartment.of(EditorView.contentAttributes.of({ spellcheck: spellCheck ? 'true' : 'false' })),
        highlightActiveLine(),
        highlightSelectionMatches(),
        search(),
        slashMenuExtension(),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged && !update.selectionSet && update.transactions.length === 0) return
          for (const tr of update.transactions) {
            for (const effect of tr.effects) {
              if (effect.is(showSlashMenu)) {
                setSlashMenuVisible(true)
                setSlashMenuCoords(effect.value.coords)
                setSlashMenuQuery('')
              }
              if (effect.is(hideSlashMenu) || effect.is(slashMenuAction)) {
                setSlashMenuVisible(false)
              }
            }
          }
        }),
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        keymap.of([
        ...defaultKeymap, ...historyKeymap, ...searchKeymap.filter(k => !(k.key === 'Mod-f' && 'run' in k)), ...completionKeymap, indentWithTab,
        
      ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            // 外部同步（切换Tab/打开文件）触发的dispatch，跳过onChange避免误标为未保存
            if (syncingFromExternalRef.current) return
            const newContent = update.state.doc.toString()
            lastSyncedFromEditorRef.current = newContent
            onChange(newContent)
          }
          if (update.selectionSet && onCursorChange) {
            const pos = update.state.selection.main.head
            const line = update.state.doc.lineAt(pos)
            onCursorChange({ line: line.number, column: pos - line.from + 1 })
          }
        }),
      ],
    })

    const view = new EditorView({
      state,
      parent: editorRef.current,
    })

    viewRef.current = view
    viewReadyRef.current = true
    lastSyncedFromEditorRef.current = content

    // StateField 自动关闭菜单 → 同步 React state
    const onSlashMenuClose = () => {
      setSlashMenuVisible(false)
    }
    // 监听 slash-menu-update 事件（坐标更新）
    const onSlashMenuUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail
      const smState = view.state.field(slashMenuState, false)
      if (smState && !smState.active) {
        setSlashMenuVisible(false)
        return
      }
      if (detail.coords) setSlashMenuCoords(detail.coords)
    }
    editorRef.current!.addEventListener('slash-menu-update', onSlashMenuUpdate)
    editorRef.current!.addEventListener('slash-menu-close', onSlashMenuClose)

    return () => {
      editorRef.current?.removeEventListener('slash-menu-update', onSlashMenuUpdate)
      editorRef.current?.removeEventListener('slash-menu-close', onSlashMenuClose)
      view.destroy()
      viewReadyRef.current = false
      viewRef.current = null
    }
  }, [])

  // 主题设置变更时动态 reconfigure（不重建编辑器）
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: themeCompartment.reconfigure(buildEditorTheme(isDark, fontFamily, String(fontSize), String(lineHeight)))
    })
  }, [isDark, fontFamily, fontSize, lineHeight, themeCompartment])

  // spellCheck 设置变更时动态 reconfigure
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: spellCheckCompartment.reconfigure(EditorView.contentAttributes.of({ spellcheck: spellCheck ? 'true' : 'false' }))
    })
  }, [spellCheck, spellCheckCompartment])

  // Toggle line numbers based on settings
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: lineNumbersCompartment.reconfigure(showLineNumbers ? [lineNumbers()] : [])
    })
  }, [showLineNumbers, lineNumbersCompartment])







  // 同步外部content到编辑器（切换Tab、打开文件时）
  // 通过记录"最近一次onChange同步的内容"来区分：用户编辑 vs 外部变更
  // 用户编辑：content由onChange同步，和view一致，无需回写
  // 外部变更：content来自store但不是当前view写入的，需要同步
  useEffect(() => {
    const view = viewRef.current
    if (!view || view.composing) return
    if (content === lastSyncedFromEditorRef.current) return
    // 编辑器有焦点时跳过dispatch，避免打断IME composition
    const cmContent = view.dom.querySelector('.cm-content')
    if (cmContent && document.activeElement === cmContent) {
      lastSyncedFromEditorRef.current = content
      return
    }
    lastSyncedFromEditorRef.current = content
    const currentContent = view.state.doc.toString()
    if (currentContent !== content) {
      syncingFromExternalRef.current = true
      view.dispatch({
        changes: { from: 0, to: currentContent.length, insert: content },
      })
      syncingFromExternalRef.current = false
    }
  }, [content])

  const findAllMatches = useCallback((text: string, term: string): number[] => {
    if (!term) return []
    const positions: number[] = []
    let pos = 0
    while (true) {
      const idx = text.indexOf(term, pos)
      if (idx === -1) break
      positions.push(idx)
      pos = idx + 1
    }
    return positions
  }, [])

  const handleSearch = useCallback(() => {
    const view = viewRef.current
    if (!view || !searchTerm) return

    const text = view.state.doc.toString()
    const matches = findAllMatches(text, searchTerm)
    setSearchMatches(matches.length)
    if (matches.length === 0) return

    // 默认选中下一个（当前index+1，循环）
    const nextIdx = (searchIndex + 1) % matches.length
    setSearchIndex(nextIdx)
    const pos = matches[nextIdx]
    closeSearchPanel(view)
    view.dispatch({
      selection: { anchor: pos, head: pos + searchTerm.length },
      effects: EditorView.scrollIntoView(pos),
    })
  }, [searchTerm, searchIndex, findAllMatches])

  const handleSearchPrev = useCallback(() => {
    const view = viewRef.current
    if (!view || !searchTerm) return
    closeSearchPanel(view)
    const text = view.state.doc.toString()
    const matches = findAllMatches(text, searchTerm)
    setSearchMatches(matches.length)
    if (matches.length === 0) return
    const prevIdx = searchIndex <= 0 ? matches.length - 1 : searchIndex - 1
    setSearchIndex(prevIdx)
    const pos = matches[prevIdx]
    view.dispatch({
      selection: { anchor: pos, head: pos + searchTerm.length },
      effects: EditorView.scrollIntoView(pos),
    })
  }, [searchTerm, searchIndex, findAllMatches])

  const handleSearchNext = useCallback(() => {
    handleSearch()
  }, [handleSearch])

  // 搜索词变化时重置匹配
  const prevSearchTermRef = useRef(searchTerm)
  if (searchTerm !== prevSearchTermRef.current) {
    prevSearchTermRef.current = searchTerm
    setSearchMatches(0)
    setSearchIndex(-1)
  }

  const handleReplace = useCallback(() => {
    const view = viewRef.current
    if (!view || !searchTerm || !replaceTerm) return

    const { from, to } = view.state.selection.main
    const selectedText = view.state.sliceDoc(from, to)
    
    if (selectedText === searchTerm) {
      view.dispatch({
        changes: { from, to, insert: replaceTerm },
        selection: { anchor: from, head: from + replaceTerm.length },
      })
    }
  }, [searchTerm, replaceTerm])

  const handleReplaceAll = useCallback(() => {
    const view = viewRef.current
    if (!view || !searchTerm || !replaceTerm) return

    const content = view.state.doc.toString()
    const newContent = content.split(searchTerm).join(replaceTerm)
    
    view.dispatch({
      changes: { from: 0, to: content.length, insert: newContent },
    })
  }, [searchTerm, replaceTerm])

  // ---- 斜杠菜单处理 ----
  const handleSlashMenuSelect = useCallback((id: string) => {
    const view = viewRef.current
    if (!view) return
    const state = view.state.field(slashMenuState)

    // 计算要删除的范围（触发字符 + 搜索词）
    const cursor = view.state.selection.main.head
    const deleteFrom = state.from
    const deleteTo = cursor > state.from ? cursor : state.from

    // 执行删除触发字符+搜索词
    view.dispatch({
      changes: { from: deleteFrom, to: deleteTo, insert: '' },
      effects: slashMenuAction.of({ id, from: deleteFrom, to: deleteTo }),
    })

    setSlashMenuVisible(false)

    // 执行格式操作
    const { from: newFrom, to: newTo } = view.state.selection.main
    const selectedText = view.state.sliceDoc(newFrom, newTo)

    switch (id) {
      case 'bold': {
        const txt = selectedText || ''
        const insert = `**${txt}**`
        view.dispatch({ changes: { from: newFrom, to: newTo, insert }, selection: { anchor: newFrom + 2, head: newFrom + 2 + txt.length } }); break
      }
      case 'italic': {
        const txt = selectedText || ''
        const insert = `*${txt}*`
        view.dispatch({ changes: { from: newFrom, to: newTo, insert }, selection: { anchor: newFrom + 1, head: newFrom + 1 + txt.length } }); break
      }
      case 'strikethrough': {
        const txt = selectedText || ''
        const insert = `~~${txt}~~`
        view.dispatch({ changes: { from: newFrom, to: newTo, insert }, selection: { anchor: newFrom + 2, head: newFrom + 2 + txt.length } }); break
      }
      case 'inlineCode': {
        const txt = selectedText || ''
        const insert = `\`${txt}\``
        view.dispatch({ changes: { from: newFrom, to: newTo, insert }, selection: { anchor: newFrom + 1, head: newFrom + 1 + txt.length } }); break
      }
      case 'blockquote': view.dispatch({ changes: { from: newFrom, to: newTo, insert: '> ' }, selection: { anchor: newFrom + 2, head: newFrom + 2 } }); break
      case 'orderedList': view.dispatch({ changes: { from: newFrom, to: newTo, insert: '1. ' }, selection: { anchor: newFrom + 3, head: newFrom + 3 } }); break
      case 'unorderedList': view.dispatch({ changes: { from: newFrom, to: newTo, insert: '- ' }, selection: { anchor: newFrom + 2, head: newFrom + 2 } }); break
      case 'taskList': view.dispatch({ changes: { from: newFrom, to: newTo, insert: '- [ ] ' }, selection: { anchor: newFrom + 6, head: newFrom + 6 } }); break
      case 'heading1': view.dispatch({ changes: { from: newFrom, to: newTo, insert: '# ' }, selection: { anchor: newFrom + 2, head: newFrom + 2 } }); break
      case 'heading2': view.dispatch({ changes: { from: newFrom, to: newTo, insert: '## ' }, selection: { anchor: newFrom + 3, head: newFrom + 3 } }); break
      case 'heading3': view.dispatch({ changes: { from: newFrom, to: newTo, insert: '### ' }, selection: { anchor: newFrom + 4, head: newFrom + 4 } }); break
      case 'table': view.dispatch({ changes: { from: newFrom, to: newTo, insert: '| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n|  |  |  |\n' }, selection: { anchor: newFrom + 2, head: newFrom + 2 } }); break
      case 'link': view.dispatch({ changes: { from: newFrom, to: newTo, insert: '[]()' }, selection: { anchor: newFrom + 1, head: newFrom + 1 } }); break
      case 'image': view.dispatch({ changes: { from: newFrom, to: newTo, insert: '![]()' }, selection: { anchor: newFrom + 2, head: newFrom + 2 } }); break
      case 'horizontalRule': view.dispatch({ changes: { from: newFrom, to: newTo, insert: '\n---\n' }, selection: { anchor: newFrom + 5, head: newFrom + 5 } }); break
    }

    view.focus()
  }, [])

  const handleSlashMenuClose = useCallback(() => {
    const view = viewRef.current
    if (view) {
      view.dispatch({ effects: hideSlashMenu.of(undefined) })
    }
    setSlashMenuVisible(false)
  }, [])

  return (
    <div className="editor-container h-full flex flex-col">
      <div className="flex-1 overflow-hidden flex">
        {/* 编辑器面板：永远挂载，用flex比例控制显隐 */}
        <div ref={editorRef} data-animation={liveAnimationMode} className="cm-editor-container" style={{ flex: viewMode === 'split' ? '1 1 0%' : (viewMode === 'edit' || viewMode === 'live') ? '1 1 100%' : '0 0 0%', minHeight: 0, overflow: viewMode === 'preview' ? 'hidden' : 'visible', width: viewMode === 'preview' ? 0 : undefined, pointerEvents: viewMode === 'preview' ? 'none' : 'auto' }} />
        {/* 分割线 */}
        {viewMode === 'split' && <div style={{ width: 1, flexShrink: 0, background: 'var(--editor-border)' }} />}
        {/* 斜杠菜单 */}
        {slashMenuVisible && (
          <SlashMenu
            visible={slashMenuVisible}
            coords={slashMenuCoords}
            query={slashMenuQuery}
            onSelect={handleSlashMenuSelect}
            onClose={handleSlashMenuClose}
          />
        )}

        {/* 预览面板：永远挂载 */}
        <div ref={previewScrollRef} style={{ flex: viewMode === 'split' ? '1 1 0%' : viewMode === 'preview' ? '1 1 100%' : '0 0 0%', minHeight: 0, overflow: 'auto', pointerEvents: (viewMode === 'edit' || viewMode === 'live') ? 'none' : 'auto' }}>
          <PreviewPane content={content} currentTheme={currentTheme} onContentChange={onChange} enabledPlugins={enabledPlugins} pluginConfigs={pluginConfigs} />
        </div>
      </div>

      {isSearchOpen && (
        <div className="flex items-center gap-2 px-4 py-2 bg-[var(--editor-surface)] border-t border-[var(--editor-border)]">
          <div className="flex items-center gap-2 flex-1">
            <Search size={14} className="text-[var(--sidebar-text)]" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="搜索..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSearch()
                if (e.key === 'Escape') {
                  onSearchToggle?.()
                  setSearchTerm('')
                  setReplaceTerm('')
                }
              }}
              className="flex-1 px-2 py-1 bg-[var(--editor-bg)] border border-[var(--editor-border)] rounded text-sm text-[var(--editor-text)] outline-none focus:border-[var(--editor-accent)]"
            />
          </div>
          
          <button
            onClick={() => setIsReplaceOpen(!isReplaceOpen)}
            className={`p-1 rounded hover:bg-[var(--editor-hover)] ${isReplaceOpen ? 'bg-[var(--editor-hover)]' : ''}`}
            title="替换"
          >
            <ReplaceIcon size={14} />
          </button>
          
          <button onClick={handleSearchPrev} className="p-1 rounded hover:bg-[var(--editor-hover)]" title="上一个 (Shift+Enter)">
            <ChevronUp size={14} />
          </button>
          <button onClick={handleSearchNext} className="p-1 rounded hover:bg-[var(--editor-hover)]" title="下一个 (Enter)">
            <ChevronDown size={14} />
          </button>
          <span className="text-xs text-[var(--sidebar-text)] tabular-nums min-w-[3em] text-center">
            {searchMatches > 0 ? `${searchIndex + 1}/${searchMatches}` : searchTerm ? '0/0' : ''}
          </span>
          
          <button
            onClick={() => {
              onSearchToggle?.()
              setSearchTerm('')
              setReplaceTerm('')
            }}
            className="p-1 rounded hover:bg-[var(--editor-hover)]"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {isSearchOpen && isReplaceOpen && (
        <div className="flex items-center gap-2 px-4 py-2 bg-[var(--editor-surface)] border-t border-[var(--editor-border)]">
          <div className="flex items-center gap-2 flex-1">
            <Search size={14} className="text-[var(--sidebar-text)] opacity-0" />
            <input
              type="text"
              placeholder="替换..."
              value={replaceTerm}
              onChange={(e) => setReplaceTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleReplace()
                if (e.key === 'Escape') {
                  setIsReplaceOpen(false)
                  setReplaceTerm('')
                }
              }}
              className="flex-1 px-2 py-1 bg-[var(--editor-bg)] border border-[var(--editor-border)] rounded text-sm text-[var(--editor-text)] outline-none focus:border-[var(--editor-accent)]"
            />
          </div>
          
          <button
            onClick={handleReplace}
            className="px-3 py-1 text-sm bg-[var(--editor-surface)] border border-[var(--editor-border)] rounded hover:bg-[var(--editor-hover)]"
          >
            替换
          </button>
          
          <button
            onClick={handleReplaceAll}
            className="px-3 py-1 text-sm bg-[var(--editor-surface)] border border-[var(--editor-border)] rounded hover:bg-[var(--editor-hover)]"
          >
            全部替换
          </button>
        </div>
      )}
    </div>
  )
})

export default Editor
