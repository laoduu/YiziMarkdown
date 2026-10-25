import { useState, useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react'
import { EditorView, keymap, lineNumbers, drawSelection, highlightActiveLine } from '@codemirror/view'
import { EditorState, Compartment, Extension } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { defaultHighlightStyle, syntaxHighlighting, indentOnInput, bracketMatching, codeFolding, foldKeymap } from '@codemirror/language'
import { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo } from '@codemirror/commands'
import { search, searchKeymap, highlightSelectionMatches, closeSearchPanel } from '@codemirror/search'
import { autocompletion, completionKeymap } from '@codemirror/autocomplete'
import { Search, X, Replace as ReplaceIcon, ChevronUp, ChevronDown } from 'lucide-react'
import { languages } from '@codemirror/language-data'
import { useSettingsStore } from '../stores/settingsStore'
import { useEditorStore, type ViewMode } from '../stores/editorStore'
import { findOutlineByLine, computeOutlineItems } from '../lib/headingId'
import { numberOrderedLines } from '../lib/listFormat'
import { isTaskLine, toggleTaskAtLine } from '../lib/taskList'
import { liveEditExtension } from '../lib/cm-live-render'
import { frontMatterField, frontMatterLines } from '../lib/cm-frontmatter'
import { headingFoldExtension } from '../lib/cm-heading-fold'
import { slashMenuExtension, slashMenuState, showSlashMenu, hideSlashMenu, slashMenuAction } from '../lib/cm-slash-menu'
import { COLUMN_REGION_SNIPPET, COLUMN_REGION_CURSOR } from '../lib/slides'
import { selectionToolbarExtension, type SelectionToolbarInfo } from '../lib/cm-selection-toolbar'
import SlashMenu from './SlashMenu'
import SelectionToolbar from './SelectionToolbar'
import ContentWidthHandles from './ContentWidthHandles'
import { renderMarkdown } from '../lib/markdownRenderer'
import { extendMarkdownIt, postRender as pluginPostRender } from '../plugins/registry'
import { invokeTauri } from '../lib/tauri'
import { resolveLocalImageSrc } from '../lib/localImages'
import { getCurrentLang, translate, useI18n } from '../i18n'

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

/** 脚注插入（学术引用流）：正文光标/选区末尾插 `[^n]`（选中文本保留），文末确保 `[^n]: ` 定义行，
 *  光标落到定义行尾 —— 点击后直接开始写文献条目。n 取现有 [^n] 最大编号 +1。
 *  间隔：文末已是定义行 → 单换行（脚注区成块，条目间不空行）；否则空一行与正文分隔。
 *  边界：光标落在文档末尾空白区时引用贴正文末尾、定义吸掉尾随空白紧跟正文（避免重叠变更）。 */
export function insertFootnoteAtView(view: EditorView): void {
  const doc = view.state.doc.toString()
  const nums = [...doc.matchAll(/\[\^(\d+)\]/g)].map((m) => parseInt(m[1], 10))
  const n = (nums.length ? Math.max(...nums) : 0) + 1
  const ref = `[^${n}]`
  const def = `[^${n}]: `
  const trimmedLen = doc.replace(/\s+$/, '').length
  const docEnd = view.state.doc.length
  const trimmedLines = doc.slice(0, trimmedLen).split('\n')
  const lastTrimmedLine = trimmedLines[trimmedLines.length - 1] || ''
  const gap = /^\[\^[^\]]+\]:/.test(lastTrimmedLine) ? '\n' : '\n\n'
  const at = Math.min(view.state.selection.main.to, trimmedLen)
  const atTail = at === trimmedLen
  // 两种文档尾形态：有尾随空白 → 定义替换尾随空白；无 → 定义紧跟正文（at 与定义同点时合并为单变更）
  const changes = docEnd > trimmedLen
    ? (atTail
        ? [{ from: trimmedLen, to: docEnd, insert: `${ref}${gap}${def}` }]
        : [{ from: at, insert: ref }, { from: trimmedLen, to: docEnd, insert: `${gap}${def}` }])
    : (atTail
        ? [{ from: at, insert: `${ref}${gap}${def}` }]
        : [{ from: at, insert: ref }, { from: docEnd, insert: `${gap}${def}` }])
  view.dispatch({
    changes,
    selection: { anchor: trimmedLen + ref.length + gap.length + def.length },
  })
  view.focus()
}

export interface EditorRef {
  insertMarkdown: (markdown: string, mode?: 'wrap' | 'prefix' | 'ordered' | 'link' | 'tag' | 'block') => void
  insertCodeBlock: () => void
  insertFootnote: () => void
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
  onToast?: (message: string) => void
}

interface PreviewPaneProps {
  content: string
  currentTheme: string
  onContentChange?: (content: string) => void
  enabledPlugins?: string[]
  pluginConfigs?: Record<string, Record<string, unknown>>
  onToast?: (message: string) => void
}

/**
 * 预览代码块「点击改语言」的写回：把 content 中第 sourceLine 行（1 基）开栏
 * info 串的首个 token（语言）替换为 newLang，其余 info 保留。
 * 用 expectedCode 校验目标 fence 的代码体与预览中一致，防止源码已改、
 * 预览未刷新（防抖窗口）时按旧行号误改到别的代码块。
 * 返回新内容；无法安全定位时返回 null。
 */
function setFenceLanguage(
  content: string,
  sourceLine: number,
  newLang: string,
  expectedCode?: string
): string | null {
  const lines = content.split('\n')
  const idx = sourceLine - 1
  const m = lines[idx]?.match(/^(\s{0,3})(`{3,}|~{3,})(.*)$/)
  if (!m) return null
  const fence = m[2]
  const char = fence[0]
  const minLen = fence.length

  if (expectedCode != null) {
    const closing = new RegExp(`^ {0,3}\\${char}{${minLen},}\\s*$`)
    const body: string[] = []
    for (let i = idx + 1; i < lines.length; i++) {
      if (closing.test(lines[i])) break
      body.push(lines[i])
    }
    if (body.join('\n').replace(/\n$/, '') !== expectedCode.replace(/\n$/, '')) return null
  }

  const rest = m[3].trim().split(/\s+/).filter(Boolean).slice(1).join(' ')
  const info = [newLang.trim(), rest].filter(Boolean).join(' ')
  lines[idx] = `${m[1]}${fence}${info ? ' ' + info : ''}`
  return lines.join('\n')
}

function PreviewPane({ content, currentTheme, onContentChange, enabledPlugins = [], pluginConfigs = {}, onToast }: PreviewPaneProps) {
  const { t } = useI18n()
  // 插件就绪状态：变化时触发 markdown 重新渲染
  const pluginsReady = useEditorStore((s: any) => s._pluginsReady)

  // 当前文档所在目录：相对路径图片按它解析（云端文档解析到本地镜像里已下载的图片）。
  // 必须作为图片 effect 的依赖 —— 否则切换 tab 而未重渲染时，
  // 会拿上一个文档的目录去解析，图片指向错误位置。
  const docBaseDir = useEditorStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId)
    if (!tab?.filePath) return null
    const sep = Math.max(tab.filePath.lastIndexOf('\\'), tab.filePath.lastIndexOf('/'))
    return sep > 0 ? tab.filePath.substring(0, sep) : null
  })

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

      const li = target.closest('li')
      if (!li) return
      const isChecked = target.checked

      // 首选 data-source-line：渲染器已经把源码行号写在 <li> 上。
      // 不再用 textContent 全等匹配 —— 行内公式经 KaTeX 渲染后文本已经变了，
      // 行内标签/HTML、重复文案、嵌套任务都会匹配失败或串行。
      const hinted = Number(li.getAttribute('data-source-line'))
      let next = hinted > 0 ? toggleTaskAtLine(content, hinted, isChecked) : null
      if (next == null) {
        // 兜底：按任务项在预览中的顺序号，对应源码里的第 N 个任务行
        const items = Array.from(container.querySelectorAll('li.task-list-item'))
        const index = items.indexOf(li)
        if (index >= 0) {
          const taskLines = content.split('\n')
            .map((line, i) => (isTaskLine(line) ? i + 1 : 0))
            .filter((n) => n > 0)
          if (taskLines[index]) next = toggleTaskAtLine(content, taskLines[index], isChecked)
        }
      }
      if (next != null && next !== content) onContentChange(next)
    }

    container.addEventListener('click', handleClick)
    return () => container.removeEventListener('click', handleClick)
  }, [content, onContentChange])

  // 拦截预览中的超链接点击：强制用系统默认浏览器打开，
  // 避免点击后应用内导航变成"无头浏览器"、用户不知道怎么返回。
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const handleLinkClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a')
      if (!anchor) return
      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('#')) return
      e.preventDefault()
      e.stopPropagation()
      // 解析相对路径为绝对路径
      let url = href
      if (!href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('file://') && !href.startsWith('mailto:')) {
        const currentFilePath = useEditorStore.getState().currentFilePath()
        if (currentFilePath) {
          // 获取当前文件所在目录
          const lastSep = Math.max(currentFilePath.lastIndexOf('\\'), currentFilePath.lastIndexOf('/'))
          if (lastSep > 0) {
            const dir = currentFilePath.substring(0, lastSep)
            // 处理 ./ 和 ../ 相对路径
            if (href.startsWith('./')) {
              url = dir + '\\' + href.substring(2).replace(/\//g, '\\')
            } else if (href.startsWith('../')) {
              // 逐级向上查找
              const parts = href.split('/')
              let resolvedDir = dir
              for (const part of parts) {
                if (part === '..') {
                  const parentSep = Math.max(resolvedDir.lastIndexOf('\\'), resolvedDir.lastIndexOf('/'))
                  if (parentSep > 0) resolvedDir = resolvedDir.substring(0, parentSep)
                } else if (part !== '.') {
                  resolvedDir = resolvedDir + '\\' + part
                }
              }
              url = resolvedDir
            } else {
              // 直接相对路径（如 docs/readme.md）
              url = dir + '\\' + href.replace(/\//g, '\\')
            }
          }
        }
      }
      invokeTauri('open_url', { url })
    }
    container.addEventListener('click', handleLinkClick)
    return () => container.removeEventListener('click', handleLinkClick)
  }, [])

  // 解析本地图片路径为 data URL（Tauri 环境下）；任何加载失败都回退成 alt 文本
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const tauri = (window as any).__TAURI_INTERNALS__
    const canInvoke = !!tauri && typeof tauri.invoke === 'function'

    // 段落里只有图片（没有文字）时按块级排版；css 的 :only-child 不数文本节点，
    // 所以这里显式打标，避免把「文字 + 行内图 + 文字」也当成独占一行。
    container.querySelectorAll('p').forEach((p) => {
      if (!p.querySelector('img')) return
      if ((p.textContent || '').trim()) p.classList.remove('img-para')
      else p.classList.add('img-para')
    })

    const imgs = container.querySelectorAll('img')
    imgs.forEach((img) => {
      const src = img.getAttribute('src') || ''

      const bindFallback = () => {
        if (img.dataset.brokenBound) return
        img.dataset.brokenBound = '1'
        img.addEventListener('error', () => replaceBrokenImage(img), { once: true })
        // 绑定之前就已经失败（缓存命中的破图）也补一次
        if (img.complete && img.naturalWidth === 0) replaceBrokenImage(img)
      }

      const isLocal = !!src && !src.startsWith('http') && !src.startsWith('data:') &&
        !src.startsWith('asset://') && !src.startsWith('blob:')

      if (!canInvoke || !isLocal) {
        bindFallback()
        return
      }

      resolveLocalImageSrc(src, docBaseDir).then((path) => {
        if (!path) { replaceBrokenImage(img); return }
        return tauri.invoke('read_image_base64', { path })
          .then((dataUrl: string) => {
            img.setAttribute('src', dataUrl)
            bindFallback()
          })
      }).catch(() => replaceBrokenImage(img))
    })
  }, [renderedHtml, docBaseDir])

  // 代码块增强：右上角悬浮「换行 / 复制」，右下角可点击编辑的语言标签（Typora 风格）
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const codeBlocks = container.querySelectorAll('pre.hljs')
    codeBlocks.forEach((pre) => {
      // 避免重复处理
      if (pre.querySelector('.code-block-actions')) return

      const code = pre.querySelector('code')
      const lang = pre.getAttribute('data-lang') || ''
      // fence 令牌注入的源码行号（1 基），用于把语言修改写回源文档
      const sourceLine = Number(pre.getAttribute('data-source-line') || '0')
      const codeText = code?.textContent || ''

      // 右上角操作区：悬浮显示，不占文档布局
      const actions = document.createElement('div')
      actions.className = 'code-block-actions'
      actions.innerHTML = `
        <button class="code-block-wrap-btn" title="${t('live.toggleWrap')}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 6h18M3 12h12M3 18h6"/>
          </svg>
        </button>
        <button class="code-block-copy-btn" title="${t('live.copyCode')}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
          </svg>
        </button>
      `
      pre.appendChild(actions)

      // 复制按钮功能
      const copyBtn = actions.querySelector('.code-block-copy-btn')
      copyBtn?.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(codeText)
          onToast?.(t('editor.copied'))
          copyBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          `
          setTimeout(() => {
            copyBtn.innerHTML = `
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
              </svg>
            `
          }, 1500)
        } catch (err) {
          console.error('复制失败:', err)
        }
      })

      // 换行控制按钮功能
      const wrapBtn = actions.querySelector('.code-block-wrap-btn')
      wrapBtn?.addEventListener('click', () => {
        const preEl = pre as HTMLElement
        const isWrapped = preEl.style.whiteSpace === 'pre-wrap'
        preEl.style.whiteSpace = isWrapped ? 'pre' : 'pre-wrap'
        wrapBtn.classList.toggle('active', !isWrapped)
      })

      // 右下角语言标签：悬停显现，点击进入行内编辑
      const langLabel = document.createElement('div')
      langLabel.className = 'code-block-lang'
      const langText = lang && lang !== 'auto' ? lang : ''
      // 未标注语言的 fence 走 hljs 自动检测，标签显示 auto
      langLabel.textContent = langText || 'auto'
      if (!langText) langLabel.setAttribute('data-auto', '')
      pre.appendChild(langLabel)

      langLabel.addEventListener('click', () => {
        if (langLabel.querySelector('input')) return
        langLabel.classList.add('editing')
        const input = document.createElement('input')
        input.className = 'code-block-lang-input'
        input.value = langText
        input.setAttribute('spellcheck', 'false')
        langLabel.textContent = ''
        langLabel.appendChild(input)
        input.focus()
        input.select()

        let done = false
        // save=false 为 Esc 取消；提交走 onContentChange，渲染器随后重建整个 pre
        const finish = (save: boolean) => {
          if (done) return
          done = true
          langLabel.classList.remove('editing')
          langLabel.textContent = langText || 'auto'
          if (!langText) langLabel.setAttribute('data-auto', '')
          if (!save || !sourceLine) return
          const next = setFenceLanguage(content, sourceLine, input.value.trim(), codeText)
          if (next != null && next !== content) onContentChange?.(next)
        }
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') finish(true)
          else if (e.key === 'Escape') finish(false)
        })
        input.addEventListener('blur', () => finish(true))
      })
    })
  }, [renderedHtml, content, onContentChange])

  // ===== 脚注引用悬浮预览：hover 上标 → 浮窗显示文末定义（免跳转）；点击仍走锚点跳转 =====
  // 取材：直接克隆文末定义 <li>（预览 DOM 里必然存在），去掉返回链与 id 后注入浮窗。
  const [fnPreview, setFnPreview] = useState<null | { x: number; y: number; html: string; placeAbove: boolean }>(null)
  const fnHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const show = (a: HTMLAnchorElement) => {
      const hash = a.getAttribute('href') || ''
      if (!hash.startsWith('#fn')) return
      const li = container.querySelector<HTMLElement>(hash)
      if (!li) return
      const clone = li.cloneNode(true) as HTMLElement
      clone.querySelector('.footnote-backref')?.remove()  // 返回链在浮窗里无意义
      clone.removeAttribute('id')                          // 防锚点 id 重复
      const r = a.getBoundingClientRect()
      const placeAbove = r.bottom + 170 > window.innerHeight && r.top > 170
      const x = Math.max(8, Math.min(r.left, window.innerWidth - 396))
      setFnPreview({ x, y: placeAbove ? r.top - 6 : r.bottom + 6, html: clone.innerHTML, placeAbove })
    }
    const onOver = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest?.('.footnote-ref a') as HTMLAnchorElement | null
      if (!a) return  // 非脚注目标：不取消宽限定时器（否则移开后 mouseover 会把收起定时清掉，浮窗永不关）
      if (fnHideTimer.current) { clearTimeout(fnHideTimer.current); fnHideTimer.current = null }
      show(a)
    }
    const onOut = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest?.('.footnote-ref a')
      const to = e.relatedTarget as HTMLElement | null
      if (!a || (to && a.contains(to))) return
      // 移入浮窗由浮窗自身 onMouseEnter 取消宽限；移开即收
      fnHideTimer.current = setTimeout(() => setFnPreview(null), 120)
    }
    container.addEventListener('mouseover', onOver)
    container.addEventListener('mouseout', onOut)
    // 滚动 / 内容重渲染时浮窗位置即刻过期：直接收
    const onScroll = () => setFnPreview(null)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      container.removeEventListener('mouseover', onOver)
      container.removeEventListener('mouseout', onOut)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [])
  useEffect(() => { setFnPreview(null) }, [renderedHtml])

  return (
    <div className="min-h-full bg-[var(--editor-bg)]" ref={containerRef}>
      <div
        className={`editor-content prose prose-lg max-w-none theme-${currentTheme}`}
        // maxWidth 用内联样式是**有意为之**：各主题文件里都有
        // `.editor-content.theme-x { max-width: 800px }`（特异性 0,2,0），
        // 会盖掉 globals.css 里同名的低特异性规则；内联样式优先级更高且无需 !important，
        // 所以用户拖拽出来的宽度才能压过主题自带的固定值。
        style={{ fontFamily: 'var(--font-preview)', fontSize: 'var(--preview-font-size, var(--font-size-base))', lineHeight: 'var(--preview-line-height, var(--line-height))', maxWidth: 'var(--content-max-width, 900px)' }}
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />
      {fnPreview && (
        <div
          className={`fn-preview-popover ${fnPreview.placeAbove ? 'place-above' : ''}`}
          style={{ left: fnPreview.x, top: fnPreview.y }}
          onMouseEnter={() => { if (fnHideTimer.current) { clearTimeout(fnHideTimer.current); fnHideTimer.current = null } }}
          onMouseLeave={() => setFnPreview(null)}
          dangerouslySetInnerHTML={{ __html: fnPreview.html }}
        />
      )}
    </div>
  )
}


/**
 * 将HTML片段转换为Markdown文本。
 * 用于处理从网页粘贴的内容，尽可能保留格式结构。
 * 优先使用剪贴板中的纯文本（通常已包含markdown标记），
 * 仅在纯文本不含markdown标记时，才从HTML还原。
 */
function htmlToMarkdown(html: string, plainText: string): string {
  // 如果纯文本已经包含markdown标记（标题、粗体、链接等），直接使用
  if (/^#{1,6}\s|^[-*+]\s|^>\s|\*\*[^*]+\*\*|`[^`]+`|\[.+\]\(.+\)/m.test(plainText.trim())) {
    return plainText
  }

  const NL = '\n'
  const NL2 = '\n\n'

  // 否则从HTML还原markdown
  let md = html
    // 移除script/style/head
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    // 标题 h1-h6
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, c) => `# ${stripHtml(c).trim()}${NL2}`)
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, c) => `## ${stripHtml(c).trim()}${NL2}`)
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, c) => `### ${stripHtml(c).trim()}${NL2}`)
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_, c) => `#### ${stripHtml(c).trim()}${NL2}`)
    .replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, (_, c) => `##### ${stripHtml(c).trim()}${NL2}`)
    .replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, (_, c) => `###### ${stripHtml(c).trim()}${NL2}`)
    // 粗体
    .replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**')
    // 斜体
    .replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*')
    // 删除线
    .replace(/<del[^>]*>([\s\S]*?)<\/del>/gi, '~~$1~~')
    .replace(/<s[^>]*>([\s\S]*?)<\/s>/gi, '~~$1~~')
    // 行内代码
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
    // 链接 [text](url)
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
    // 图片 ![alt](src)
    .replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, '![$2]($1)')
    .replace(/<img[^>]*alt="([^"]*)"[^>]*src="([^"]*)"[^>]*\/?>/gi, '![$1]($2)')
    // 块引用
    .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, c) => {
      return stripHtml(c).trim().split('\n').map((l: string) => `> ${l}`).join('\n') + NL2
    })
    // 无序列表
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1')
    .replace(/<[uo]l[^>]*>[\s\S]*?<\/[uo]l>/gi, (match) => {
      return match.replace(/<\/?[uo]l[^>]*>/gi, '') + NL
    })
    // 换行
    .replace(/<br\s*\/?>/gi, NL)
    // 段落
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, `$1${NL2}`)
    // 水平线
    .replace(/<hr\s*\/?>/gi, `${NL}---${NL2}`)
    // 预格式化代码块
    .replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (_, c) => `${NL}\`\`\`${NL}${stripHtml(c)}${NL}\`\`\`${NL2}`)
    .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, c) => `${NL}\`\`\`${NL}${stripHtml(c)}${NL}\`\`\`${NL2}`)
    // 表格（简化处理：提取单元格文本）
    .replace(/<tr[^>]*>([\s\S]*?)<\/tr>/gi, (match) => {
      const cells: string[] = []
      const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi
      let m
      while ((m = cellRegex.exec(match)) !== null) {
        cells.push(stripHtml(m[1]).trim())
      }
      return '| ' + cells.join(' | ') + ' |' + NL
    })
    // 移除所有剩余HTML标签
    .replace(/<\/?[^>]+>/g, '')
    // 清理多余空行
    .replace(/\n{3,}/g, NL2)
    .trim()

  return md
}

/** 移除所有HTML标签，返回纯文本 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '')
}


function buildEditorTheme(fontFamily: string, fontSize: string, lineHeight: string, cursorStyle: 'text' | 'bold', liveContent: boolean): Extension {
  // 内容字体按模式分工（用户明确要求）：
  //   实时模式 →「预览字体」（--font-preview），源码模式 →「编辑器字体」（--font-editor）
  // 两者都由 App.tsx 从设置写入；这里保留设置值作为回退，避免变量缺失时字体塌掉。
  const contentFont = `var(--font-${liveContent ? 'preview' : 'editor'}, ${fontFamily})`
  return EditorView.theme({
    '&.cm-editor': {
      height: '100%',
    },
    '.cm-scroller': {
      overflow: 'auto',
    },
    '&': {
      fontSize: `var(--font-size-base, ${fontSize})`,
      fontFamily: contentFont,
      lineHeight: `var(--line-height, ${lineHeight})`,
    },
    '.cm-content': {
      padding: '40px 60px',
      // 正文列宽度由设置驱动（拖拽手柄改写 --content-max-width）。
      // 这里用变量而不是固定值，源码模式与实时模式才会一起跟随；
      // 默认 900px 与改动前一致。
      maxWidth: 'var(--content-max-width, 900px)',
      margin: '0 auto',
      caretColor: 'var(--editor-cursor)',
      color: 'var(--editor-text)',
      fontFamily: contentFont,
    },
    // 加粗模式：插入光标改为块状（主题色半透明，文字透出）
    ...(cursorStyle === 'bold' ? {
      '.cm-cursor': {
        borderLeft: 'none',
        width: '0.6ch',
        background: 'color-mix(in srgb, var(--editor-cursor) 45%, transparent)',
        marginLeft: '0',
      },
    } : {}),
    '.cm-line': {
      padding: '2px 0',
      lineHeight: 'var(--line-height, 1.8)',
    },
    '&.cm-focused': {
      outline: 'none',
    },
    '.cm-selectionBackground': {
      backgroundColor: 'var(--code-selection-bg) !important',
    },
    '.cm-activeLine': {
      backgroundColor: 'var(--code-active-line)',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--editor-bg)',
      color: 'var(--editor-border)',
      border: 'none',
      borderRight: '1px solid var(--editor-border)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'var(--code-active-line)',
    },
    '.cm-foldPlaceholder': {
      backgroundColor: 'var(--editor-hover)',
      color: 'var(--editor-text)',
      border: '1px solid var(--editor-border)',
      borderRadius: '3px',
      padding: '0 4px',
    },
    '.cm-heading-fold-marker': {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '16px',
      height: '16px',
      cursor: 'pointer',
      color: 'var(--editor-border)',
      borderRadius: '3px',
      transition: 'color 0.15s, background-color 0.15s',
      flexShrink: '0',
      verticalAlign: 'middle',
      marginRight: '2px',
    },
    '.cm-heading-fold-marker:hover': {
      color: 'var(--editor-accent)',
      backgroundColor: 'var(--editor-hover)',
    },
    '.cm-searchMatch': {
      backgroundColor: 'var(--code-search-match)',
      outline: '1px solid var(--code-search-match-border)',
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: 'var(--code-search-active)',
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

/**
 * 图片加载失败时用 alt 文本替换 <img>。
 * 预览里直接显示浏览器破图标会撑高行距、还会在表格里把列宽顶开；
 * 用 inline span（`.img-broken`）保持与原图片相同的位置感。
 */
function replaceBrokenImage(img: HTMLImageElement): void {
  if (!img.isConnected) return
  const alt = (img.getAttribute('alt') || '').trim()
  const span = document.createElement('span')
  span.className = 'img-broken'
  span.textContent = alt || `[${translate(getCurrentLang(), 'live.imageLoadFailed')}]`
  span.title = img.getAttribute('src') || ''
  img.replaceWith(span)
}

const Editor = forwardRef<EditorRef, EditorProps>(({ content, onChange, onSearchToggle, isSearchOpen: externalSearchOpen, viewMode: externalViewMode, onCursorChange, onToast }, ref) => {
  const { t } = useI18n()

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
  const { fontFamily, fontSize, lineHeight, currentTheme, showLineNumbers, wordWrap, spellCheck, liveAnimationMode, cursorStyle, mouseSpotlight, enabledPlugins, pluginConfigs } = useSettingsStore()
  const viewMode = externalViewMode ?? 'preview'
  const [slashMenuVisible, setSlashMenuVisible] = useState(false)
  const [slashMenuCoords, setSlashMenuCoords] = useState({ left: 0, bottom: 0 })
  const [slashMenuQuery, setSlashMenuQuery] = useState('')
  const [selToolbar, setSelToolbar] = useState<SelectionToolbarInfo & { visible: boolean }>({ visible: false, x: 0, y: 0, text: '' })
  const lineNumbersCompartment = useRef(new Compartment()).current
  const richCompartment = useRef(new Compartment()).current
  const lineWrappingCompartment = useRef(new Compartment()).current
  const themeCompartment = useRef(new Compartment()).current
  const spellCheckCompartment = useRef(new Compartment()).current
  const previewScrollRef = useRef<HTMLDivElement>(null)
  const viewReadyRef = useRef(false)
  // 同步滚动：driver lock + guard
  const syncGuardRef = useRef(false)
  // 大纲跳转后的 scroll spy 抑制窗口。
  // 跳转会把目标滚到视口中央，而 scroll spy 以视口 1/3 判定"当前标题" ——
  // 滚动事件会把高亮改回目标的上一条，表现为"第一次点击落在上一条，点两次才准"。
  const spySuppressUntilRef = useRef(0)
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
      // 用户主动滚动优先于大纲跳转的抑制窗口
      spySuppressUntilRef.current = 0
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
      if (Date.now() < spySuppressUntilRef.current) return
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
      if (Date.now() < spySuppressUntilRef.current) return
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
        if (Date.now() < spySuppressUntilRef.current) return
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
        if (Date.now() < spySuppressUntilRef.current) return
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
    //
    // 同时记录「是否本来就在顶部」—— 这一条很关键：
    // 锚点补偿会把"顶部"换算成"某一行停在视口 1/3 处"，而两种模式的**顶部留白并不相同**
    // （预览有 .editor-content 的 margin/padding，源码/实时里元信息还占着几行），
    // 于是同一 source line 在两边的 y 不同 ⇒ 切模式后被被动下滚一段。
    // 表现就是：明明在顶部，切过去元信息显示不全、预览专门设计的顶部留白被吃掉。
    // 已经在顶部时**不做任何补偿**（新模式本身就从顶部开始）。
    let savedLine: number | null = null
    let atTop = false
    if (prev === 'preview') {
      // 从预览快照：找视口顶部 1/3 处的 source-line
      if (pvDom) {
        atTop = pvDom.scrollTop <= 1
        const wrapTop = pvDom.getBoundingClientRect().top
        const threshold = wrapTop + pvDom.clientHeight / 3
        const list = getPreviewLines(pvDom)
        for (const { line, el } of list) {
          if (el.getBoundingClientRect().bottom >= threshold) { savedLine = line; break }
        }
      }
    } else {
      // 从编辑器快照：视口顶部 1/3 处的行号
      atTop = view.scrollDOM.scrollTop <= 1
      const top = view.scrollDOM.scrollTop + view.scrollDOM.clientHeight / 3
      const block = view.lineBlockAtHeight(top)
      savedLine = view.state.doc.lineAt(block.from).number
    }
    if (savedLine == null) return

    // 2. 等 DOM 更新后恢复到目标行（本来在顶部则跳过，见上面 atTop 的说明）
    if (atTop) return

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
    insertMarkdown: (markdown: string, mode?: 'wrap' | 'prefix' | 'ordered' | 'link' | 'tag' | 'block') => {
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
      } else if (mode === 'ordered') {
        // 多行选区按行号递增（1. 2. 3.…），不再每行都写 `1. `。
        // 空行跳过编号；已有编号会被重新排，避免连点两次叠加。
        if (selectedText) {
          const numbered = numberOrderedLines(selectedText)
          insertText = numbered
          newFrom = from + (numbered.match(/^\s*\d+[.)]\s+/)?.[0].length ?? 0)
          newTo = from + numbered.length
        } else {
          insertText = '1. '
          newFrom = from + insertText.length
          newTo = from + insertText.length
        }
      } else if (mode === 'tag') {
        // HTML 标签对包裹（如 <sup></sup>）：按第一个 >< 边界拆成开/闭标签。
        // 无选中：插入完整标签对，光标落在标签中间；有选中：包住选中内容并保持选中（与粗体等同款）。
        const cut = markdown.indexOf('><') + 1
        const open = cut > 0 ? markdown.slice(0, cut) : markdown
        const close = cut > 0 ? markdown.slice(cut) : ''
        if (selectedText) {
          insertText = `${open}${selectedText}${close}`
          newFrom = from + open.length
          newTo = newFrom + selectedText.length
        } else {
          insertText = markdown
          newFrom = from + open.length
          newTo = newFrom
        }
      } else if (mode === 'link') {
        if (selectedText) {
          insertText = markdown.replace('text', selectedText).replace('alt', selectedText)
          newFrom = insertText.indexOf('](') + from + 2
          newTo = newFrom + 3
        } else {
          insertText = markdown
          const bracketPos = markdown.indexOf('](')
          newFrom = from + (bracketPos >= 0 ? bracketPos + 2 : markdown.length)
          newTo = newFrom + 3
        }
      } else if (mode === 'block') {
        // 多行块片段：原样插入，光标落在片段里**第一个空行**上 —— 那是"该你填了"的位置。
        // 例：分栏区间 `\n***\n\n***\n\n***\n` → 光标落在第一个 `***` 之后的空行（左栏）；
        //     用户填完左栏，下面那个空档自然就是右栏，不必先理解语法。
        insertText = markdown
        const blank = /\n\s*\n/.exec(markdown)
        newFrom = from + (blank ? blank.index + 1 : markdown.length)
        newTo = newFrom
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
    insertCodeBlock: () => {
      const view = viewRef.current
      if (!view) return
      const { from, to } = view.state.selection.main
      // 有选中内容：用代码块包裹（而不是替换掉）。
      // ⚠️ 插入串首尾各带一个 \n，会把选中文字前后的换行"顶"出来 ⇒ 多出空行。
      // 所以包裹时用不带首尾换行的 ``` 围栏，前后换行交给原文档里已有的。
      if (to > from) {
        const txt = view.state.sliceDoc(from, to)
        const insert = `\`\`\`\n${txt}\n\`\`\``
        view.dispatch({
          changes: { from, to, insert },
          selection: { anchor: from + 4, head: from + 4 + txt.length },
        })
      } else {
        const insertText = '\n```\n\n```\n'
        // 光标定位到两个 ``` 之间（第3个字符位置）
        const cursorOffset = 4
        view.dispatch({
          changes: { from, to, insert: insertText },
          selection: { anchor: from + cursorOffset, head: from + cursorOffset },
        })
      }
      view.focus()
    },
    insertFootnote: () => {
      const view = viewRef.current
      if (!view) return
      insertFootnoteAtView(view)
    },
    toggleSearch: () => {
      setInternalSearchOpen(prev => !prev)
    },
    navigateToLine: ({ id, line }: { id: string; line: number }) => {
      // 抑制随后的 scroll spy：程序化跳转的滚动事件不应把高亮改回上一条标题。
      // 同时直接点亮被点击的标题 —— 跳转把目标放在视口中央，而 spy 以 1/3 处判定，
      // 若只靠 scroll 事件，高亮会停在目标的上一条（本次要修的就是这个）。
      spySuppressUntilRef.current = Date.now() + 700
      useEditorStore.getState().setActiveHeadingId(id)
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
        themeCompartment.of(buildEditorTheme(fontFamily, String(fontSize), String(lineHeight), cursorStyle, viewMode === 'live')),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        autocompletion(),
        spellCheckCompartment.of(EditorView.contentAttributes.of({ spellcheck: spellCheck ? 'true' : 'false' })),
        highlightActiveLine(),
        highlightSelectionMatches(),
        codeFolding(),
        keymap.of(foldKeymap),
        headingFoldExtension,
        search(),
        slashMenuExtension(),
        selectionToolbarExtension(
          (info) => setSelToolbar({ ...info, visible: true }),
          () => setSelToolbar((prev) => ({ ...prev, visible: false })),
        ),
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
        // 元信息块：解析器不认识 front matter（会被当成分隔线 + setext H2），
        // 这里用 StateField 判定区间、并给区间内每行套类；源码与实时模式共用。
        frontMatterField,
        frontMatterLines,
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

    // DOM paste事件：从网页粘贴时，优先使用纯文本（通常含markdown标记），
    // 如果纯文本不含markdown标记且HTML包含结构标签，则从HTML转换回markdown
    const onPaste = (e: ClipboardEvent) => {
      const htmlData = e.clipboardData?.getData('text/html')
      const textData = e.clipboardData?.getData('text/plain')
      if (!htmlData || !textData) return

      // 如果纯文本已含markdown标记，浏览器默认粘贴行为就是正确的，不干预
      if (/^#{1,6}\s|^[-*+]\s|^>\s|\*\*[^*]+\*\*|`[^`]+`|\[.+\]\(.+\)/m.test(textData.trim())) {
        return
      }

      // 如果HTML中包含块级标签（说明是从网页复制的渲染内容），转换HTML为markdown
      if (/<(h[1-6]|p|div|table|blockquote|pre|ul|ol|li|strong|em|a|img|code|br|hr)[\s>]/i.test(htmlData)) {
        e.preventDefault()
        e.stopPropagation()
        const md = htmlToMarkdown(htmlData, textData)
        if (md) {
          view.dispatch({ changes: { from: view.state.selection.main.from, to: view.state.selection.main.to, insert: md } })
        }
      }
    }
    view.dom.addEventListener('paste', onPaste)

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
      view.dom.removeEventListener('paste', onPaste)
      editorRef.current?.removeEventListener('slash-menu-update', onSlashMenuUpdate)
      editorRef.current?.removeEventListener('slash-menu-close', onSlashMenuClose)
      view.destroy()
      viewReadyRef.current = false
      viewRef.current = null
    }
  }, [])

  // 主题设置变更时动态 reconfigure（不重建编辑器）
  // Live mode: click task checkbox to write back to source (same line-based logic as preview).
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const onTaskClick = (e: MouseEvent) => {
      const target = e.target as HTMLInputElement | null
      if (!target || target.type !== 'checkbox' || !target.classList.contains('cm-md-task-checkbox')) return
      e.preventDefault()
      e.stopPropagation()
      const pos = Number(target.dataset.taskPos)
      if (!Number.isFinite(pos)) return
      const line = view.state.doc.lineAt(pos)
      const next = toggleTaskAtLine(view.state.doc.toString(), line.number, target.checked)
      if (next == null) return
      const nextLine = next.split('\n')[line.number - 1]
      if (nextLine !== line.text) {
        view.dispatch({ changes: { from: line.from, to: line.to, insert: nextLine } })
      }
    }
    view.dom.addEventListener('click', onTaskClick)
    return () => view.dom.removeEventListener('click', onTaskClick)
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: themeCompartment.reconfigure(buildEditorTheme(fontFamily, String(fontSize), String(lineHeight), cursorStyle, viewMode === 'live'))
    })
  }, [fontFamily, fontSize, lineHeight, cursorStyle, viewMode, themeCompartment])

  // spellCheck 设置变更时动态 reconfigure
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: spellCheckCompartment.reconfigure(EditorView.contentAttributes.of({ spellcheck: spellCheck ? 'true' : 'false' }))
    })
  }, [spellCheck, spellCheckCompartment])

  // ---- 点击涟漪：点击编辑区时在点击处扩散三圈细线（sonar 效果） ----
  useEffect(() => {
    if (!mouseSpotlight || viewMode === 'preview') return
    const container = editorRef.current
    if (!container) return

    const ripples: HTMLDivElement[] = []
    const onPointerDown = (e: PointerEvent) => {
      for (let i = 1; i <= 3; i++) {
        const ripple = document.createElement('div')
        ripple.className = `editor-click-ripple r${i}`
        ripple.style.left = `${e.clientX}px`
        ripple.style.top = `${e.clientY}px`
        document.body.appendChild(ripple)
        ripples.push(ripple)
        ripple.addEventListener('animationend', () => {
          ripple.remove()
          const idx = ripples.indexOf(ripple)
          if (idx >= 0) ripples.splice(idx, 1)
        })
      }
    }

    container.addEventListener('pointerdown', onPointerDown)
    return () => {
      container.removeEventListener('pointerdown', onPointerDown)
      for (const r of ripples) r.remove()
    }
  }, [mouseSpotlight, viewMode])

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
      case 'table': {
        const col = t('toolbar.column')
        view.dispatch({ changes: { from: newFrom, to: newTo, insert: `| ${col}1 | ${col}2 | ${col}3 |\n| --- | --- | --- |\n|  |  |  |\n` }, selection: { anchor: newFrom + 2, head: newFrom + 2 } }); break
      }
      case 'link': view.dispatch({ changes: { from: newFrom, to: newTo, insert: '[]()' }, selection: { anchor: newFrom + 1, head: newFrom + 1 } }); break
      case 'image': view.dispatch({ changes: { from: newFrom, to: newTo, insert: '![]()' }, selection: { anchor: newFrom + 2, head: newFrom + 2 } }); break
      case 'codeBlock': {
        // 有选中内容：用代码块包裹（而不是替换掉）；无选中：插入空代码块。
        // ⚠️ 包裹时插入串不带首尾换行（会把原文档的换行顶出来 ⇒ 多出空行）。
        if (newTo > newFrom) {
          const txt = selectedText
          view.dispatch({ changes: { from: newFrom, to: newTo, insert: `\`\`\`\n${txt}\n\`\`\`` }, selection: { anchor: newFrom + 4, head: newFrom + 4 + txt.length } })
        } else {
          view.dispatch({ changes: { from: newFrom, to: newTo, insert: '\n```\n\n```\n' }, selection: { anchor: newFrom + 4, head: newFrom + 4 } })
        }
        break
      }
      case 'horizontalRule': view.dispatch({ changes: { from: newFrom, to: newTo, insert: '\n---\n' }, selection: { anchor: newFrom + 5, head: newFrom + 5 } }); break
      case 'columnBreak': {
        // 插入**分栏区间**（三条 *** = 2 栏的形状），光标落在第一个空档（左栏）。
        // 详见 lib/slides.ts 的 COLUMN_REGION_SNIPPET / COLUMN_REGION_CURSOR。
        const caret = newFrom + COLUMN_REGION_CURSOR
        view.dispatch({ changes: { from: newFrom, to: newTo, insert: COLUMN_REGION_SNIPPET }, selection: { anchor: caret, head: caret } })
        break
      }
      case 'footnote': insertFootnoteAtView(view); break
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

  // 预览区划词监听：在 preview 或 split 模式下监听 selectionchange
  useEffect(() => {
    if (viewMode !== 'preview' && viewMode !== 'split') return
    const container = previewScrollRef.current
    if (!container) return

    let pendingRaf = 0
    const onSelectionChange = () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !sel.rangeCount) {
        setSelToolbar((prev) => ({ ...prev, visible: false }))
        return
      }
      const range = sel.getRangeAt(0)
      // 检查选区是否在预览容器内
      if (!container.contains(range.commonAncestorContainer)) return
      const text = sel.toString()
      if (text.trim().length < 2) {
        setSelToolbar((prev) => ({ ...prev, visible: false }))
        return
      }
      if (pendingRaf) cancelAnimationFrame(pendingRaf)
      pendingRaf = requestAnimationFrame(() => {
        const rect = range.getBoundingClientRect()
        setSelToolbar({ visible: true, x: rect.left, y: rect.top, text })
      })
    }

    document.addEventListener('selectionchange', onSelectionChange)
    return () => {
      document.removeEventListener('selectionchange', onSelectionChange)
      if (pendingRaf) cancelAnimationFrame(pendingRaf)
    }
  }, [viewMode])

  return (
    <div className="editor-container h-full flex flex-col">
      <div className="flex-1 overflow-hidden flex relative">
        {/* 编辑器面板：永远挂载，用flex比例控制显隐 */}
        <div ref={editorRef} data-animation={liveAnimationMode} data-cursor={cursorStyle} className="cm-editor-container" style={{ flex: viewMode === 'split' ? '1 1 0%' : (viewMode === 'edit' || viewMode === 'live') ? '1 1 100%' : '0 0 0%', minHeight: 0, overflow: viewMode === 'preview' ? 'hidden' : 'visible', width: viewMode === 'preview' ? 0 : undefined, pointerEvents: viewMode === 'preview' ? 'none' : 'auto' }} />
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

        {/* 划词助手浮动工具栏 */}
        <SelectionToolbar
          visible={selToolbar.visible}
          x={selToolbar.x}
          y={selToolbar.y}
          text={selToolbar.text}
        />

        {/* 预览面板：永远挂载 */}
        <div ref={previewScrollRef} style={{ flex: viewMode === 'split' ? '1 1 0%' : viewMode === 'preview' ? '1 1 100%' : '0 0 0%', minHeight: 0, overflow: 'auto', pointerEvents: (viewMode === 'edit' || viewMode === 'live') ? 'none' : 'auto' }}>
          <PreviewPane content={content} currentTheme={currentTheme} onContentChange={onChange} enabledPlugins={enabledPlugins} pluginConfigs={pluginConfigs} onToast={onToast} />
        </div>

        {/* 正文列宽度拖拽手柄：默认隐藏，鼠标移到正文列边缘才渐显（见组件内注释）。
            并排（split）时两列各有各的居中列，一个手柄对不齐两处，故隐藏。 */}
        <ContentWidthHandles
          visible={viewMode !== 'split'}
          mode={viewMode}
          getContentEl={() => {
            // 源码/实时走 CodeMirror 的 .cm-content；预览走 PreviewPane 的 .editor-content。
            // 两者都常驻挂载（另一半只是 flex 0 隐藏），所以必须按当前模式挑，不能简单 querySelector。
            const host = viewMode === 'preview' ? previewScrollRef.current : editorRef.current
            return host?.querySelector<HTMLElement>(
              viewMode === 'preview' ? '.editor-content' : '.cm-content'
            ) ?? null
          }}
        />
      </div>

      {isSearchOpen && (
        <div className="flex items-center gap-2 px-4 py-2 bg-[var(--editor-surface)] border-t border-[var(--editor-border)]">
          <div className="flex items-center gap-2 flex-1">
            <Search size={14} className="text-[var(--sidebar-text)]" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder={t('editor.searchPlaceholder')}
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
            title={t('editor.replace')}
          >
            <ReplaceIcon size={14} />
          </button>
          
          <button onClick={handleSearchPrev} className="p-1 rounded hover:bg-[var(--editor-hover)]" title={t('editor.prev')}>
            <ChevronUp size={14} />
          </button>
          <button onClick={handleSearchNext} className="p-1 rounded hover:bg-[var(--editor-hover)]" title={t('editor.next')}>
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
              placeholder={t('editor.replacePlaceholder')}
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
            {t('editor.replaceOne')}
          </button>
          
          <button
            onClick={handleReplaceAll}
            className="px-3 py-1 text-sm bg-[var(--editor-surface)] border border-[var(--editor-border)] rounded hover:bg-[var(--editor-hover)]"
          >
            {t('editor.replaceAll')}
          </button>
        </div>
      )}
    </div>
  )
})

export default Editor
