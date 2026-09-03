import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Sun, Moon, Palette, Check } from 'lucide-react'
import { renderMarkdown } from '../lib/markdownRenderer'
import { extendMarkdownIt, postRender as pluginPostRender } from '../plugins/registry'
import {
  stripFrontMatter, parseFrontMatter, splitSlides, extractNotes, extractDirectives,
  detectLayout, type SlideKind, type SlideLayout,
} from '../lib/slides'
import { enterFullscreen, exitFullscreen, toggleFullscreen } from '../lib/fullscreen'
import { resolveLocalImageSrc } from '../lib/localImages'
import '../styles/slideshow.css'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

interface Slide {
  html: string
  notes: string
  kind: SlideKind
  title?: string
  align?: 'left' | 'center' | 'right'
}

interface SlideshowProps {
  content: string
  title?: string
  enabledPlugins: string[]
  pluginConfigs: Record<string, Record<string, unknown>>
  currentTheme: string
  isDark: boolean
  onExit: () => void
}

export default function Slideshow({
  content,
  title,
  enabledPlugins,
  pluginConfigs,
  currentTheme,
  isDark,
  onExit,
}: SlideshowProps) {
  const [h, setH] = useState(0)
  const [showHelp, setShowHelp] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  // 主题/明暗：进入时继承应用当前设定；可在演示内切换（仅本次播放生效）
  const [theme, setTheme] = useState(currentTheme)
  const [dark, setDark] = useState(isDark)
  const [themes, setThemes] = useState<string[]>([])
  const [themeMeta, setThemeMeta] = useState<Record<string, { name: string }>>({})
  const [themeMenuOpen, setThemeMenuOpen] = useState(false)
  const deckRef = useRef<HTMLDivElement>(null)

  // 退出相关
  const exitingRef = useRef(false)
  const toggleIntentRef = useRef(false)
  const hadFullscreenRef = useRef(false)

  const pluginExtenders = useMemo(() => {
    const exts: Array<(md: any) => void> = []
    for (const _id of enabledPlugins) {
      exts.push((md: any) => extendMarkdownIt(md, enabledPlugins, pluginConfigs || {}))
    }
    return exts
  }, [enabledPlugins, pluginConfigs])

  // 纯 markdown → 幻灯片：`---` 分页 + 整页结构自动版式推断
  const slides: Slide[] = useMemo(() => {
    const meta = parseFrontMatter(content)
    const body = stripFrontMatter(content)
    return splitSlides(body).map((src) => {
      const { body: b, notes } = extractNotes(src)
      const { body: b2, directives } = extractDirectives(b)
      const layout: SlideLayout = detectLayout(b2)
      const kind = directives.layout || layout.kind
      let html = renderMarkdown(b2, pluginExtenders)
      // 封面页：拼接 front matter 提供的作者/日期 meta 行
      if (kind === 'cover' && (meta.author || meta.date)) {
        const metaLine = [meta.author, meta.date].filter(Boolean).join(' · ')
        html += `<div class="ys-cover-meta">${escapeHtml(metaLine)}</div>`
      }
      return { html, notes, kind, title: layout.title, align: directives.align }
    })
  }, [content, pluginExtenders])

  const total = slides.length
  const cur = slides[h]

  // 章节标记：封面/章节页的标题作为其后续页的章节名，供页脚展示；章节页带序号
  const { chapter, sectionNums } = useMemo(() => {
    const nums: number[] = []
    let sec = 0
    for (const s of slides) {
      if (s.kind === 'section') sec += 1
      nums.push(s.kind === 'section' ? sec : 0)
    }
    // 当前页所属章节 = 从第 0 页到第 h 页中最后一个封面/章节页的标题
    let curChapter = title || ''
    for (let i = 0; i <= h; i++) {
      const s = slides[i]
      if (s && (s.kind === 'cover' || s.kind === 'section') && s.title) curChapter = s.title
    }
    return { chapter: curChapter, sectionNums: nums }
  }, [slides, h, title])

  const next = useCallback(() => setH((x) => Math.min(x + 1, slides.length - 1)), [slides.length])
  const prev = useCallback(() => setH((x) => Math.max(x - 1, 0)), [])

  // 统一退出：退出全屏后关闭演示，回到打开前的编辑视图
  const requestExit = useCallback(() => {
    if (exitingRef.current) return
    exitingRef.current = true
    exitFullscreen()
    onExit()
  }, [onExit])

  const onKey = useCallback((e: KeyboardEvent) => {
    const k = e.key
    if (['ArrowRight', ' ', 'PageDown', 'Enter'].includes(k)) {
      e.preventDefault(); next(); return
    }
    if (['ArrowLeft', 'PageUp', 'Backspace'].includes(k)) {
      e.preventDefault(); prev(); return
    }
    if (k === 'Home') { e.preventDefault(); setH(0); return }
    if (k === 'End') { e.preventDefault(); setH(slides.length - 1); return }
    if (k === 'f' || k === 'F') {
      e.preventDefault()
      toggleIntentRef.current = true
      toggleFullscreen().then(async () => {
        try {
          const tauri = (window as any).__TAURI_INTERNALS__
          if (tauri?.invoke) {
            const label = tauri.metadata?.currentWindow?.label || 'main'
            const fs = await tauri.invoke('plugin:window|is_fullscreen', { label })
            hadFullscreenRef.current = !!fs
          }
        } catch {}
      }).finally(() => setTimeout(() => { toggleIntentRef.current = false }, 400))
      return
    }
    if (k === 's' || k === 'S') { e.preventDefault(); setShowNotes((x) => !x); return }
    if (k === '?') { e.preventDefault(); setShowHelp((x) => !x); return }
    if (k === 'Escape') {
      if (showHelp) { setShowHelp(false); return }
      requestExit()
    }
  }, [next, prev, slides.length, requestExit, showHelp])

  useEffect(() => {
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onKey])

  // 鼠标滚轮：内容可滚动时先滚内容，滚到上/下边界再翻页；翻页后短暂锁定防惯性连翻
  const wheelLockRef = useRef(false)
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 8) return
      const deck = deckRef.current
      const active = deck?.querySelector<HTMLElement>('.ys-slide.ys-active')
      if (!active) return
      const canScroll = active.scrollHeight > active.clientHeight + 4
      const atTop = active.scrollTop <= 4
      const atBottom = active.scrollTop + active.clientHeight >= active.scrollHeight - 4
      if (e.deltaY > 0) {
        // 向下：内容未滚到底 → 滚动内容；到底 → 下一页
        if (canScroll && !atBottom) {
          e.preventDefault()
          active.scrollBy(0, e.deltaY)
          return
        }
        if (wheelLockRef.current) return
        wheelLockRef.current = true
        e.preventDefault()
        next()
      } else {
        // 向上：内容未滚到顶 → 滚动内容；到顶 → 上一页
        if (canScroll && !atTop) {
          e.preventDefault()
          active.scrollBy(0, e.deltaY)
          return
        }
        if (wheelLockRef.current) return
        wheelLockRef.current = true
        e.preventDefault()
        prev()
      }
      setTimeout(() => { wheelLockRef.current = false }, 400)
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [next, prev])

  // 进入时尝试全屏；卸载时退出全屏
  // enterFullscreen() 已内建处理窗口最大化状态（先取消最大化再进全屏）
  useEffect(() => {
    enterFullscreen().then((ok) => { if (ok) hadFullscreenRef.current = true })
    return () => { exitFullscreen() }
  }, [])

  // 全屏状态丢失（如操作系统截获 Esc 退出全屏）→ 关闭演示
  useEffect(() => {
    const onResize = async () => {
      if (exitingRef.current || toggleIntentRef.current || !hadFullscreenRef.current) return
      try {
        const tauri = (window as any).__TAURI_INTERNALS__
        if (!tauri?.invoke) return
        const label = tauri.metadata?.currentWindow?.label || 'main'
        const fs = await tauri.invoke('plugin:window|is_fullscreen', { label })
        if (!fs) {
          hadFullscreenRef.current = false
          requestExit()
        }
      } catch {}
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [requestExit])

  // HTML5 全屏（如被采用）退出检测
  useEffect(() => {
    const onChange = () => {
      if (exitingRef.current || toggleIntentRef.current) return
      if (hadFullscreenRef.current && !document.fullscreenElement) {
        hadFullscreenRef.current = false
        requestExit()
      }
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [requestExit])

  // 加载主题列表
  useEffect(() => {
    const tauri = (window as any).__TAURI_INTERNALS__
    if (!tauri?.invoke) return
    tauri.invoke('list_themes').then((files: string[]) => setThemes(files || [])).catch(() => {})
    tauri.invoke('read_theme_json').then((json: string) => {
      try { setThemeMeta(JSON.parse(json || '{}')) } catch {}
    }).catch(() => {})
  }, [])

  // 主题继承：只取主题 CSS 的 :root.theme-* 变量定义块，改写为
  // .yizi-slideshow.theme-*，使配色变量（含 --editor-h1/h2/h3）作用到幻灯片根节点
  // （保留 .dark 变体以使用暗色方案）。
  // 丢弃所有元素规则（.theme-x h1 / .editor-content.theme-x 等），因为部分主题用
  // 未加作用域的选择器（如 .theme-lychee h1）会漏进幻灯片覆盖版式字号/对齐；
  // 幻灯片的字号/对齐/居中一律由 slideshow.css 控制，配色仅通过 CSS 变量继承。
  useEffect(() => {
    const tauri = (window as any).__TAURI_INTERNALS__
    if (!tauri?.invoke) return
    tauri.invoke('read_theme_css', { name: `${theme}.css` }).then((themeCss: string) => {
      if (!themeCss) return
      const vars = themeCss
        .split('}')
        .filter((part) => /^[^{}]*:root\.theme-/.test(part.slice(0, part.indexOf('{'))))
        .join('}')
        .replace(
          /:root\.theme-[a-zA-Z0-9_-]+(\.dark)?/g,
          (_m, darkVariant?: string) => `.yizi-slideshow.theme-${theme}${darkVariant || ''}`
        )
      let el = document.getElementById('yizimarkdown-slideshow-theme-css')
      if (!el) { el = document.createElement('style'); el.id = 'yizimarkdown-slideshow-theme-css'; document.head.appendChild(el) }
      el.textContent = vars
    }).catch(() => {})
  }, [theme])

  // 卸载时清理注入的主题样式
  useEffect(() => () => {
    document.getElementById('yizimarkdown-slideshow-theme-css')?.remove()
  }, [])

  // DOM 后处理：katex/mermaid 渲染 + 本地图片转 data URL
  useEffect(() => {
    const container = deckRef.current
    if (!container) return
    if (enabledPlugins.length > 0) {
      pluginPostRender(container, enabledPlugins, pluginConfigs)
    }
    const tauri = (window as any).__TAURI_INTERNALS__
    if (!tauri || typeof tauri.invoke !== 'function') return
    container.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src')
      if (!src || src.startsWith('http') || src.startsWith('data:') || src.startsWith('asset://')) return
      resolveLocalImageSrc(src).then((path) => {
        if (!path) return
        return tauri.invoke('read_image_base64', { path })
          .then((dataUrl: string) => img.setAttribute('src', dataUrl))
      }).catch(() => {})
    })
  }, [slides, enabledPlugins, pluginConfigs])

  return (
    <div className={`yizi-slideshow theme-${theme}${dark ? ' dark' : ''}`}>
      <div className="ys-deck" ref={deckRef}>
        {slides.map((slide, i) => {
          const active = i === h
          const past = i < h
          const classes = ['ys-slide', `ys-layout-${slide.kind}`]
          if (slide.align) classes.push(`ys-align-${slide.align}`)
          if (active) classes.push('ys-active')
          if (past) classes.push('ys-past')
          else classes.push('ys-future')
          return (
            <section
              key={i}
              className={classes.join(' ')}
              data-num={sectionNums[i] || undefined}
              dangerouslySetInnerHTML={{ __html: slide.html }}
            />
          )
        })}
      </div>

      {/* 页脚：章节名 + 页码 + 进度条 */}
      <div className="ys-footer">
        <span className="ys-chapter">{chapter}</span>
        <span className="ys-pos">{total === 0 ? 0 : h + 1} / {total}</span>
      </div>
      <div className="ys-progress" style={{ width: `${total ? ((h + 1) / total) * 100 : 0}%` }} />

      {/* HUD */}
      <div className="ys-hud">
        {cur?.notes && (
          <button className="ys-hud-btn" onClick={() => setShowNotes((x) => !x)}>备注</button>
        )}
        <div className="ys-hud-ctrl">
          <button
            className="ys-icon-btn"
            title={dark ? '切换亮色' : '切换暗色'}
            onClick={() => setDark((d) => !d)}
          >
            {dark ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <button
            className="ys-icon-btn"
            title="切换主题"
            onClick={() => setThemeMenuOpen((o) => !o)}
          >
            <Palette size={14} />
          </button>
        </div>
        <span className="ys-hint">F 全屏 · ? 帮助 · Esc 退出</span>
      </div>

      {/* 主题菜单 */}
      {themeMenuOpen && (
        <>
          <div className="ys-dismiss" onClick={() => setThemeMenuOpen(false)} />
          <div className="ys-theme-menu">
            {themes.map((file) => {
              const id = file.replace(/\.css$/, '')
              const name = themeMeta[id]?.name || (id === 'academic' ? '学术蓝' : id)
              return (
                <button
                  key={file}
                  className={id === theme ? 'ys-theme-active' : ''}
                  onClick={() => { setTheme(id); setThemeMenuOpen(false) }}
                >
                  {id === theme && <Check size={13} />}
                  {name}
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* 帮助浮层 */}
      {showHelp && (
        <div className="ys-overlay" onClick={() => setShowHelp(false)}>
          <div className="ys-card" onClick={(e) => e.stopPropagation()}>
            <h2>幻灯片快捷键</h2>
            <table>
              <tbody>
                <tr><td>下一页</td><td>→ 空格 PageDown Enter</td></tr>
                <tr><td>上一页</td><td>← PageUp Backspace</td></tr>
                <tr><td>首页 / 末页</td><td>Home / End</td></tr>
                <tr><td>全屏切换</td><td>F</td></tr>
                <tr><td>演讲者备注</td><td>S</td></tr>
                <tr><td>帮助开关</td><td>?</td></tr>
                <tr><td>退出</td><td>Esc</td></tr>
              </tbody>
            </table>
            <p className="ys-card-foot">
              纯 Markdown 即幻灯片：用 <code>---</code>（单独成行）分页，
              版式由引擎按每页结构自动推断，配色继承当前主题。
              备注：<code>&lt;!-- notes: 内容 --&gt;</code>。
            </p>
          </div>
        </div>
      )}

      {/* 备注面板 */}
      {showNotes && cur?.notes && (
        <div className="ys-notes-panel">
          <div className="ys-notes-head">
            <span>演讲者备注</span>
            <button onClick={() => setShowNotes(false)}>关闭</button>
          </div>
          <div className="ys-notes-body">{cur.notes}</div>
        </div>
      )}

      <div className="ys-title">{title || ''}</div>
    </div>
  )
}
