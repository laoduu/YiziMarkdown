import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Sun, Moon, Palette, Check } from 'lucide-react'
import { renderMarkdown } from '../lib/markdownRenderer'
import { extendMarkdownIt, postRender as pluginPostRender } from '../plugins/registry'
import { parseSlidesConfig, splitSlides, extractSlide, detectElementType } from '../lib/slides'
import { enterFullscreen, exitFullscreen, toggleFullscreen } from '../lib/fullscreen'
import '../styles/slideshow.css'

interface Slide {
  html: string
  bg?: string
  bgIsImage?: boolean
  bgSize?: string
  bgPosition?: string
  bgOpacity?: string
  notes: string
  /** 布局指令（hero/divider/content/image 等），未指定时为 defaultLayout */
  layout?: string
  /** 对齐指令（center/left/right/top/middle/bottom） */
  align?: string
  /** class 指令 + 自定义指令追加的类 */
  extraClasses: string[]
  /** elementMap 按首块元素类型映射的类 */
  elementClass?: string
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

/** 将背景指令转为 section 的 inline style */
function backgroundStyle(slide: Slide): CSSProperties | undefined {
  if (!slide.bg) return undefined
  if (slide.bgIsImage) {
    let image = `url(${slide.bg})`
    if (slide.bgOpacity) {
      const o = Number(slide.bgOpacity)
      const alpha = Number.isFinite(o) ? Math.max(0, Math.min(1, o)) : 1
      image = `linear-gradient(rgba(0,0,0,${1 - alpha}), rgba(0,0,0,${1 - alpha})), ${image}`
    }
    return {
      backgroundImage: image,
      backgroundSize: slide.bgSize || 'cover',
      backgroundPosition: slide.bgPosition || 'center',
      backgroundRepeat: 'no-repeat',
    }
  }
  return { background: slide.bg }
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
  const [v, setV] = useState(0)
  const [showHelp, setShowHelp] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  // 主题/明暗：进入时继承应用当前设定，文档 front matter 可指定默认主题；可在演示内切换（仅本次播放生效）
  const [theme, setTheme] = useState(() => parseSlidesConfig(content).config.theme || currentTheme)
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

  const deck: Slide[][] = useMemo(() => {
    const { config, rest } = parseSlidesConfig(content)
    const groups = splitSlides(rest, config.splitHorizontal, config.splitVertical)
    return groups.map((stack) =>
      stack.map((slideSrc) => {
        const meta = extractSlide(slideSrc, config.directives)
        const elementClass = config.elementMap?.[detectElementType(meta.body)]
        return {
          html: renderMarkdown(meta.body, pluginExtenders),
          bg: meta.bg,
          bgIsImage: meta.bgIsImage,
          bgSize: meta.bgSize,
          bgPosition: meta.bgPosition,
          bgOpacity: meta.bgOpacity,
          notes: meta.notes,
          layout: meta.layout || config.defaultLayout,
          align: meta.align,
          extraClasses: meta.extraClasses,
          elementClass,
        }
      })
    )
  }, [content, pluginExtenders])

  const total = deck.reduce((n, s) => n + s.length, 0)
  const cur = deck[h]?.[v]
  // 扁平序号：之前的横向页所有子页数 + 当前横向页内序号 + 1
  const flatIndex = deck.slice(0, h).reduce((n, s) => n + s.length, 0) + v + 1

  // 翻页逻辑：→/← 只在主（横向）页之间前进/后退，跳过纵向子页；
  // 纵向子页仅由 ↑/↓ 进入与退出（作为可选细节展示）。
  const next = useCallback(() => {
    if (h < deck.length - 1) { setH(h + 1); setV(0) }
  }, [deck, h])

  const prev = useCallback(() => {
    if (h > 0) { setH(h - 1); setV(0) }
  }, [deck, h])

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
    if (k === 'ArrowDown' || k === 'ArrowUp') {
      e.preventDefault()
      if (k === 'ArrowDown') setV((vv) => Math.min(vv + 1, deck[h].length - 1))
      else setV((vv) => Math.max(vv - 1, 0))
      return
    }
    if (k === 'Home') { e.preventDefault(); setH(0); setV(0); return }
    if (k === 'End') { e.preventDefault(); setH(deck.length - 1); setV(0); return }
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
  }, [deck, h, next, prev, requestExit, showHelp])

  useEffect(() => {
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onKey])

  // 进入时尝试全屏；卸载时退出全屏
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

  // 主题变更时注入对应主题 CSS。
  // 主题文件把变量定义在 :root.theme-xxx 上（即 <html>），而幻灯片把 theme-xxx
  // 类加在根 div 上；这里把 :root.theme-* 改写为 .yizi-slideshow.theme-*，
  // 使变量作用到幻灯片根节点（保留 .dark 变体以使用当前主题的暗色方案）。
  // 同时把 .editor-content.theme-* 的元素级配色/排版规则改写为
  // .yizi-slideshow.theme-*，让标题/代码/引用等跟随主题色（裸容器规则因
  // 幻灯片无 .editor-content 类而自然不生效，避免 max-width 缩窄根节点）。
  useEffect(() => {
    const tauri = (window as any).__TAURI_INTERNALS__
    if (!tauri?.invoke) return
    tauri.invoke('read_theme_css', { name: `${theme}.css` }).then((themeCss: string) => {
      if (!themeCss) return
      const processed = themeCss
        .replace(
          /:root\.theme-[a-zA-Z0-9_-]+(\.dark)?/g,
          (_m, dark?: string) => `.yizi-slideshow.theme-${theme}${dark || ''}`
        )
        .replace(
          /\.editor-content\.theme-[a-zA-Z0-9_-]+(?=\s+[.#a-zA-Z])/g,
          `.yizi-slideshow.theme-${theme}`
        )
      let el = document.getElementById('yizimarkdown-slideshow-theme-css')
      if (!el) { el = document.createElement('style'); el.id = 'yizimarkdown-slideshow-theme-css'; document.head.appendChild(el) }
      el.textContent = processed
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
      const isLocal = /^[A-Za-z]:\\/.test(src) || /^[A-Za-z]:\//.test(src) || src.startsWith('/')
      if (!isLocal) return
      const normalized = src.replace(/\\/g, '/')
      tauri.invoke('read_image_base64', { path: normalized })
        .then((dataUrl: string) => img.setAttribute('src', dataUrl))
        .catch(() => {})
    })
  }, [deck, enabledPlugins, pluginConfigs])

  return (
    <div className={`yizi-slideshow theme-${theme}${dark ? ' dark' : ''}`}>
      <div className="ys-deck" ref={deckRef}>
        {deck.map((stack, hi) =>
          stack.map((slide, vi) => {
            const active = hi === h && vi === v
            const past = hi < h || (hi === h && vi < v)
            const classes = ['ys-slide']
            if (active) classes.push('ys-active')
            if (past) classes.push('ys-past')
            else classes.push('ys-future')
            if (slide.layout) classes.push(`ys-layout-${slide.layout}`)
            if (slide.align) classes.push(`ys-align-${slide.align}`)
            if (slide.elementClass) classes.push(slide.elementClass)
            classes.push(...slide.extraClasses)
            return (
              <section
                key={`${hi}-${vi}`}
                className={classes.join(' ')}
                style={backgroundStyle(slide)}
                dangerouslySetInnerHTML={{ __html: slide.html }}
              />
            )
          })
        )}
      </div>

      {/* HUD */}
      <div className="ys-hud">
        <span className="ys-pos">{total === 0 ? 0 : flatIndex} / {total}</span>
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
                <tr><td>下一页</td><td>→ 空格 PageDown Enter（只切主页面）</td></tr>
                <tr><td>上一页</td><td>← PageUp Backspace（只切主页面）</td></tr>
                <tr><td>纵向子页</td><td>↓ 进入 / ↑ 退出</td></tr>
                <tr><td>首页 / 末页</td><td>Home / End</td></tr>
                <tr><td>全屏切换</td><td>F</td></tr>
                <tr><td>演讲者备注</td><td>S</td></tr>
                <tr><td>帮助开关</td><td>?</td></tr>
                <tr><td>退出</td><td>Esc</td></tr>
              </tbody>
            </table>
            <p className="ys-card-foot">
              幻灯片用 <code>---</code> 分页（横向主页面）、<code>--</code>（纵向子页）。
              →/← 只在主页面间切换，子页用 ↓/↑ 进入退出。
              背景指令：<code>&lt;!-- bg: #颜色|渐变|图片 --&gt;</code>；
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
