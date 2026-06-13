import { useState, useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react'
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter, indentOnInput, foldKeymap } from '@codemirror/language'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { lintKeymap } from '@codemirror/lint'
import { HighlightStyle } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { Search, X, Replace as ReplaceIcon, ChevronUp, ChevronDown } from 'lucide-react'
import { languages } from '@codemirror/language-data'
import { useSettingsStore } from '../stores/settingsStore'
import { useEditorStore } from '../stores/editorStore'
import { findOutlineByLine, computeOutlineItems } from '../lib/headingId'
import { renderMarkdown } from '../lib/markdownRenderer'

const markdownHighlight = HighlightStyle.define([
  // 标题
  { tag: tags.heading1, fontSize: '1.8em', fontWeight: 'bold', color: 'var(--editor-accent)' },
  { tag: tags.heading2, fontSize: '1.5em', fontWeight: 'bold', color: 'var(--editor-accent)' },
  { tag: tags.heading3, fontSize: '1.3em', fontWeight: 'bold', color: 'var(--editor-accent)' },
  { tag: tags.heading4, fontWeight: 'bold', color: 'var(--editor-accent)' },
  { tag: tags.heading5, fontWeight: 'bold', color: 'var(--editor-accent)' },
  { tag: tags.heading6, fontWeight: 'bold', color: 'var(--editor-accent)' },
  // 行内格式
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.monospace, fontFamily: 'var(--font-mono)', fontSize: '0.9em', background: 'var(--editor-surface)', padding: '2px 4px', borderRadius: '3px' },
  // 链接与引用
  { tag: tags.link, color: 'var(--editor-accent)', textDecoration: 'underline' },
  { tag: tags.url, color: 'var(--editor-accent)', textDecoration: 'underline' },
  { tag: tags.quote, color: 'var(--editor-text)', fontStyle: 'italic' },
  // 结构
  { tag: tags.contentSeparator, color: 'var(--editor-border)', fontWeight: 'bold' },
  { tag: tags.list, color: 'var(--editor-text)' },
  // 代码与关键字
  { tag: tags.keyword, color: 'var(--editor-accent)' },
  { tag: tags.atom, color: 'var(--editor-accent)' },
  { tag: tags.bool, color: 'var(--editor-accent)' },
  { tag: tags.null, color: 'var(--editor-accent)' },
  { tag: tags.string, color: 'var(--editor-accent)' },
  { tag: tags.special(tags.string), color: 'var(--editor-accent)' },
  { tag: tags.number, color: 'var(--editor-accent)' },
  { tag: tags.regexp, color: 'var(--editor-accent)' },
  { tag: tags.escape, color: 'var(--editor-accent)' },
  { tag: tags.variableName, color: 'var(--editor-text)' },
  { tag: tags.definition(tags.variableName), color: 'var(--editor-accent)' },
  { tag: tags.function(tags.variableName), color: 'var(--editor-accent)' },
  { tag: tags.special(tags.variableName), color: 'var(--editor-accent)' },
  // 注释
  { tag: tags.comment, color: 'var(--editor-border)', fontStyle: 'italic' },
  { tag: tags.lineComment, color: 'var(--editor-border)', fontStyle: 'italic' },
  { tag: tags.blockComment, color: 'var(--editor-border)', fontStyle: 'italic' },
  // HTML / 标签
  { tag: tags.tagName, color: 'var(--editor-accent)' },
  { tag: tags.attributeName, color: 'var(--editor-accent)' },
  { tag: tags.attributeValue, color: 'var(--editor-accent)' },
  // 类型与属性
  { tag: tags.typeName, color: 'var(--editor-accent)' },
  { tag: tags.className, color: 'var(--editor-accent)' },
  { tag: tags.propertyName, color: 'var(--editor-accent)' },
  { tag: tags.labelName, color: 'var(--editor-accent)' },
  { tag: tags.namespace, color: 'var(--editor-accent)' },
  { tag: tags.macroName, color: 'var(--editor-accent)' },
  // 其他
  { tag: tags.meta, color: 'var(--editor-accent)' },
  { tag: tags.processingInstruction, color: 'var(--editor-accent)' },
  { tag: tags.operator, color: 'var(--editor-text)' },
  { tag: tags.punctuation, color: 'var(--editor-text)' },
  { tag: tags.separator, color: 'var(--editor-text)' },
  { tag: tags.content, color: 'var(--editor-text)' },
  { tag: tags.self, color: 'var(--editor-accent)' },
  { tag: tags.special(tags.brace), color: 'var(--editor-text)' },
  { tag: tags.invalid, color: '#ff0000' },
])

export type ViewMode = 'edit' | 'split' | 'preview'

export interface EditorRef {
  insertMarkdown: (markdown: string, mode?: 'wrap' | 'prefix' | 'link') => void
  toggleSearch: () => void
  navigateToLine: (target: { id: string; line: number }) => void
  getScrollDoms: () => { editor: HTMLElement | null; preview: HTMLElement | null }
}

interface EditorProps {
  content: string
  onChange: (content: string) => void
  onSearchToggle?: () => void
  isSearchOpen?: boolean
  viewMode?: ViewMode
}

interface PreviewPaneProps {
  content: string
  currentTheme: string
  onContentChange?: (content: string) => void
}

function PreviewPane({ content, currentTheme, onContentChange }: PreviewPaneProps) {
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
  const renderedHtml = useMemo(() => renderMarkdown(debouncedContent), [debouncedContent])
  const containerRef = useRef<HTMLDivElement>(null)

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

const Editor = forwardRef<EditorRef, EditorProps>(({ content, onChange, onSearchToggle: _onSearchToggle, isSearchOpen: externalSearchOpen, viewMode: externalViewMode }, ref) => {
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
  const { fontFamily, fontSize, lineHeight, currentTheme, isDark, showLineNumbers } = useSettingsStore()
  const viewMode = externalViewMode ?? 'preview'
  const lineNumbersCompartment = useRef(new Compartment()).current
  const activeHeadingId = useEditorStore(state => state.activeHeadingId)
  const previewScrollRef = useRef<HTMLDivElement>(null)
  const isSyncingRef = useRef(false)
  const lastSyncSourceRef = useRef<'editor' | 'preview'>('editor')
  const viewReadyRef = useRef(false)
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

  // 源代码 scroll spy：滚动时更新大纲高亮（同步由下方 useEffect 统一处理）
  useEffect(() => {
    if (!viewReadyRef.current) return
    const view = viewRef.current
    if (!view) return
    const scroller = view.scrollDOM

    const onScroll = () => {
      if (isSyncingRef.current) return
      lastSyncSourceRef.current = 'editor'
      const { state } = view
      const top = scroller.scrollTop + scroller.clientHeight / 3
      const lineObj = view.lineBlockAtHeight(top)
      const line = state.doc.lineAt(lineObj.from).number
      const items = getOutlineItems(state.doc.toString())
      const item = findOutlineByLine(items, line)
      useEditorStore.getState().setActiveHeadingId(item?.id ?? null)
    }

    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => scroller.removeEventListener('scroll', onScroll)
  }, [viewReadyRef.current])

  // 预览面板 scroll spy：滚动时更新大纲高亮（同步由下方 useEffect 统一处理）
  useEffect(() => {
    const container = previewScrollRef.current
    if (!container) return

    const onScroll = () => {
      if (isSyncingRef.current) return
      lastSyncSourceRef.current = 'preview'
      const containerRect = container.getBoundingClientRect()
      const threshold = containerRect.top + containerRect.height / 3
      const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6')
      let activeId: string | null = null
      for (const el of headings) {
        if (el.getBoundingClientRect().top <= threshold) {
          activeId = el.id
        } else {
          break
        }
      }
      useEditorStore.getState().setActiveHeadingId(activeId)
    }

    container.addEventListener('scroll', onScroll, { passive: true })
    return () => container.removeEventListener('scroll', onScroll)
  }, [])

  // 统一并排联动：activeHeadingId 变化时只同步对侧面板
  useEffect(() => {
    if (viewMode !== 'split') return
    const id = activeHeadingId
    if (!id) return
    const view = viewRef.current
    const pvDom = previewScrollRef.current
    if (!view || !pvDom) return

    const source = lastSyncSourceRef.current
    const items = getOutlineItems(view.state.doc.toString())
    const item = items.find(i => i.id === id)
    if (!item) return

    isSyncingRef.current = true

    if (source === 'editor') {
      // 源代码触发的 → 只同步预览面板
      const el = document.getElementById(id)
      if (el) {
        const pvRect = pvDom.getBoundingClientRect()
        const elRect = el.getBoundingClientRect()
        const offset = elRect.top - pvRect.top + pvDom.scrollTop - pvDom.clientHeight / 2
        pvDom.scrollTo({ top: Math.max(0, offset) })
      }
    } else {
      // 预览触发的 → 只同步源代码面板
      const lineObj = view.state.doc.line(item.line)
      view.dispatch({
        effects: EditorView.scrollIntoView(lineObj.from, { y: 'center' }),
      })
    }

    const timer = setTimeout(() => { isSyncingRef.current = false }, 150)
    return () => clearTimeout(timer)
  }, [viewMode, activeHeadingId])

  // 模式切换时自动定位到当前大纲位置
  const prevViewModeRef = useRef(viewMode)
  useEffect(() => {
    const prev = prevViewModeRef.current
    prevViewModeRef.current = viewMode
    // 只在模式真正切换时触发，首次挂载跳过
    if (prev === viewMode) return

    const id = activeHeadingId
    if (!id) return
    const view = viewRef.current
    const pvDom = previewScrollRef.current
    if (!view) return

    const items = getOutlineItems(view.state.doc.toString())
    const item = items.find(i => i.id === id)
    if (!item) return

    isSyncingRef.current = true

    // 源代码→预览/并排：等 DOM 渲染后滚动预览
    if ((prev === 'edit') && (viewMode === 'preview' || viewMode === 'split')) {
      requestAnimationFrame(() => {
        if (pvDom) {
          const el = document.getElementById(id)
          if (el) {
            const pvRect = pvDom.getBoundingClientRect()
            const elRect = el.getBoundingClientRect()
            const offset = elRect.top - pvRect.top + pvDom.scrollTop - pvDom.clientHeight / 2
            pvDom.scrollTo({ top: Math.max(0, offset), behavior: 'smooth' })
          }
        }
      })
    }
    // 预览/并排→源代码：滚动编辑器
    if ((prev === 'preview' || prev === 'split') && viewMode === 'edit') {
      requestAnimationFrame(() => {
        const lineObj = view.state.doc.line(item.line)
        view.dispatch({
          effects: EditorView.scrollIntoView(lineObj.from, { y: 'center' }),
        })
      })
    }

    const timer = setTimeout(() => { isSyncingRef.current = false }, 300)
    return () => clearTimeout(timer)
  }, [viewMode])

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
      if (viewMode === 'edit') {
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
      }
      // 更新大纲高亮（并排模式由 useEffect 统一联动）
      useEditorStore.getState().setActiveHeadingId(id)
    },
    getScrollDoms: () => {
      const view = viewRef.current
      return {
        editor: view?.scrollDOM ?? null,
        preview: previewScrollRef.current ?? null,
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

    const editorTheme = EditorView.theme({
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

    const state = EditorState.create({
      doc: content,
      extensions: [
        lineNumbersCompartment.of([]),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...completionKeymap,
          ...lintKeymap,
          indentWithTab,
        ]),
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        EditorView.lineWrapping,
        editorTheme,
        syntaxHighlighting(markdownHighlight),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChange(update.state.doc.toString())
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

    return () => {
      view.destroy()
      viewReadyRef.current = false
      viewRef.current = null
    }
  }, [isDark, fontFamily, fontSize, lineHeight])

  // Toggle line numbers based on settings
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: lineNumbersCompartment.reconfigure(showLineNumbers ? [lineNumbers()] : [])
    })
  }, [showLineNumbers, lineNumbersCompartment])







  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const currentContent = view.state.doc.toString()
    if (currentContent !== content) {
      view.dispatch({
        changes: { from: 0, to: currentContent.length, insert: content },
      })
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
    view.dispatch({
      selection: { anchor: pos, head: pos + searchTerm.length },
      effects: EditorView.scrollIntoView(pos),
    })
  }, [searchTerm, searchIndex, findAllMatches])

  const handleSearchPrev = useCallback(() => {
    const view = viewRef.current
    if (!view || !searchTerm) return
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

  return (
    <div className="editor-container h-full flex flex-col">
      <div className="flex-1 overflow-hidden flex">
        {/* 编辑器面板：永远挂载，用flex比例控制显隐 */}
        <div ref={editorRef} className="cm-editor-container" style={{ flex: viewMode === 'split' ? '1 1 0%' : viewMode === 'edit' ? '1 1 100%' : '0 0 0%', minHeight: 0, overflow: viewMode === 'preview' ? 'hidden' : 'visible', width: viewMode === 'preview' ? 0 : undefined, pointerEvents: viewMode === 'preview' ? 'none' : 'auto' }} />
        {/* 分割线 */}
        {viewMode === 'split' && <div style={{ width: 1, flexShrink: 0, background: 'var(--editor-border)' }} />}
        {/* 预览面板：永远挂载 */}
        <div ref={previewScrollRef} style={{ flex: viewMode === 'split' ? '1 1 0%' : viewMode === 'preview' ? '1 1 100%' : '0 0 0%', minHeight: 0, overflow: 'auto', pointerEvents: viewMode === 'edit' ? 'none' : 'auto' }}>
          <PreviewPane content={content} currentTheme={currentTheme} onContentChange={onChange} />
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
                  setInternalSearchOpen(false)
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
              setInternalSearchOpen(false)
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
