import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Sun, Moon, Palette, Check, X, ListOrdered, Sparkles } from 'lucide-react'
import { renderMarkdown } from '../lib/markdownRenderer'
import { extendMarkdownIt, postRender as pluginPostRender } from '../plugins/registry'
import {
  stripFrontMatter, parseFrontMatter, splitSlides, extractNotes, extractDirectives,
  detectLayout, type SlideKind, type SlideLayout,
} from '../lib/slides'
import { orderThemes } from '../lib/themeOrder'
import { enterFullscreen, exitFullscreen, toggleFullscreen } from '../lib/fullscreen'
import { resolveLocalImageSrc } from '../lib/localImages'
import { buildTiles, delayFor, impulseVars, tileTotalDuration, tileConfigFor, TILE_ANIM_IDS, TILE_VARIANTS, type SlideAnim } from '../lib/slideTiles'
import { useEditorStore } from '../stores/editorStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useI18n } from '../i18n'
import '../styles/slideshow.css'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

interface Slide {
  /** 页面 Markdown 源（HTML 惰性渲染，见 htmlCache） */
  src: string
  notes: string
  kind: SlideKind
  title?: string
  align?: 'left' | 'center' | 'right'
  /** 该页顶层列表是否参与片段逐步显示（版式 + deck/页级 fragments 指令共同决定） */
  fragmentEligible: boolean
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

/** 页面元素的状态类：瓷砖转场克隆整页时必须滤掉，否则克隆会命中
 *  ys-past/ys-future（opacity:0 + hidden）或 ys-leaving 等状态规则而变空。 */
const SLIDE_STATE_CLASSES = new Set(['ys-active', 'ys-past', 'ys-future', 'ys-leaving'])

export default function Slideshow({
  content,
  title,
  enabledPlugins,
  pluginConfigs,
  currentTheme,
  isDark,
  onExit,
}: SlideshowProps) {
  const { t } = useI18n()
  // 当前文档所在目录：相对路径图片按它解析（云端文档解析到本地镜像）
  const docBaseDir = useEditorStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId)
    if (!tab?.filePath) return null
    const sep = Math.max(tab.filePath.lastIndexOf('\\'), tab.filePath.lastIndexOf('/'))
    return sep > 0 ? tab.filePath.substring(0, sep) : null
  })
  const [h, setH] = useState(0)
  const [showHelp, setShowHelp] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  // 平台：macOS（WKWebView）上翻面族的"方块感"需要 tile 层实体化（背景+边框+
  // 更大缩小幅度）才可见——face 背景与页面同色在 WebKit 3D 变换中无对比。
  // Windows（WebView2）走原版视觉，不加任何分支类。
  const [isMac, setIsMac] = useState(false)
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

  // 记录进入演示前的窗口状态
  const savedWindowState = useRef<{ isMaximized: boolean; isFullscreen: boolean }>({ isMaximized: false, isFullscreen: false })

  // 鼠标活动检测
  const [showExitBtn, setShowExitBtn] = useState(false)
  const mouseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const pluginExtenders = useMemo(() => {
    const exts: Array<(md: any) => void> = []
    for (const _id of enabledPlugins) {
      exts.push((md: any) => extendMarkdownIt(md, enabledPlugins, pluginConfigs || {}))
    }
    return exts
  }, [enabledPlugins, pluginConfigs])

  // 纯 markdown → 幻灯片：`---` 分页 + 整页结构自动版式推断。
  // 元数据全量廉价计算；HTML 惰性渲染（htmlCache，仅窗口内页面渲染）。
  // 注意：slideMetaRef 在此同步填充（useMemo 先于 JSX 渲染执行），
  // 保证 getSlideHtml 首次渲染封面页时 meta 已就绪。
  const slideMetaRef = useRef<{ author?: string; date?: string }>({})
  // deck 级片段开关初始值（front matter slideshow-fragments: on → 初始开启），
  // 默认关闭：列表整页显示，避免目录等内容被迫逐条点击；需要时用户在 HUD 打开
  // 或 front matter 显式声明。HUD 按钮可在播放中随时切换（仅本次播放生效，同主题/明暗）
  const deckFragmentsInitial = useMemo(
    () => (parseFrontMatter(content)['slideshow-fragments'] || '').toLowerCase() === 'on',
    [content]
  )
  const [fragmentsOn, setFragmentsOn] = useState(deckFragmentsInitial)
  // 切换动画变体：柔和型 slide（默认，水平滑动）/ fade（溶解淡入）/ zoom（缩放）/ none（无）
  //            强烈型 dissolve（像素溶解）/ blinds（百叶窗）/ checkerboard（棋盘）/ cube（立方体）
  // 切换动画：持久化在 settingsStore（zustand persist → localStorage），
  // 下次进入演示模式沿用上次的选择；类挂在 .ys-deck 上（ys-anim-*）
  const anim = useSettingsStore((s) => s.slideAnim)
  const setSlideAnim = useSettingsStore((s) => s.setField)
  const [animMenuOpen, setAnimMenuOpen] = useState(false)

  /**
   * 演示标题：**front matter 的 `title` 优先**，没有才用文档名（`title` 属性）。
   * 此前只解析了 author/date，`title` 解析出来却从未使用 ⇒ 元信息里写了 title 也不生效，
   * HUD 与章节名一律显示文档名。
   */
  const docTitle = useMemo(() => parseFrontMatter(content).title || title || '', [content, title])

  const slides: Slide[] = useMemo(() => {
    const meta = parseFrontMatter(content)
    slideMetaRef.current = { author: meta.author, date: meta.date }
    const body = stripFrontMatter(content)
    // 片段生效版式：内容/列表/路线图页的顶层列表逐条出现（目录 agenda 不分段）
    const FRAGMENT_KINDS: SlideKind[] = ['content', 'content-list', 'roadmap']
    return splitSlides(body).map((src) => {
      const { body: b, notes } = extractNotes(src)
      const { body: b2, directives } = extractDirectives(b)
      const layout: SlideLayout = detectLayout(b2)
      const kind = directives.layout || layout.kind
      // 页级 fragments 指令可否决（off 强制不分段；未设置时跟随 HUD 开关）
      const pageFragments = directives.fragments === 'off' ? false
        : directives.fragments === 'on' ? true
        : true
      const fragmentEligible = pageFragments && FRAGMENT_KINDS.includes(kind)
      return { src: b2, notes, kind, title: layout.title, align: directives.align, fragmentEligible }
    })
  }, [content])

  // 惰性 HTML 渲染缓存：仅渲染窗口内的页面；content 变化时随 slides 重建清空
  const htmlCacheRef = useRef(new Map<number, string>())
  useEffect(() => { htmlCacheRef.current.clear() }, [slides])

  /** 取页面 HTML：命中缓存直接返回，否则渲染并缓存 */
  const getSlideHtml = useCallback((slide: Slide, index: number): string => {
    const cache = htmlCacheRef.current
    let html = cache.get(index)
    if (html === undefined) {
      html = renderMarkdown(slide.src, pluginExtenders)
      // 封面页：拼接 front matter 提供的作者/日期 meta 行
      if (slide.kind === 'cover' && slideMetaRef.current.author) {
        const meta = slideMetaRef.current
        const metaLine = [meta.author, meta.date].filter(Boolean).join(' · ')
        html += `<div class="ys-cover-meta">${escapeHtml(metaLine)}</div>`
      }
      cache.set(index, html)
    }
    return html
  }, [pluginExtenders])

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
    let curChapter = docTitle
    for (let i = 0; i <= h; i++) {
      const s = slides[i]
      if (s && (s.kind === 'cover' || s.kind === 'section') && s.title) curChapter = s.title
    }
    return { chapter: curChapter, sectionNums: nums }
  }, [slides, h, docTitle])

  // ===== 片段逐步显示 =====
  // 片段 = 当前页顶层列表项（data-fragment 标记）。
  // next：先点亮最早未显示片段，走完再翻页（新页片段全隐）；
  // prev：先隐藏最晚已显示片段，退完再翻页（目标页片段全显）。
  const REVEAL_ALL = '__ys_reveal_all__'

  // 离场页索引：翻页时同步记录（与 setH 同一渲染周期），className 直接计算
  // ys-leaving——若用 commit 后的 effect 加类，旧页会先经历一帧
  // "past 且无 leaving"（opacity 0 / hidden），导致渐隐闪烁与穿帮。
  // 方向 dir 同理必须在 goTo 里同步设置：若在 commit 后的 effect 里更新，
  // 入场动画第一帧会用上一次的方向（后退时先播前进动画再重启）。
  const [leavingIdx, setLeavingIdx] = useState<number | null>(null)
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd')
  const leavingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 瓷砖转场（棋盘/波浪/立方体/爆裂/景深/六边形/三角/百叶窗）：翻页时置为
  // {from,to,anim}，渲染出格子层，动画结束后清空。每格持有旧页/新页的
  // 【活 DOM 克隆】——见下面的 useLayoutEffect。
  const [flip, setFlip] = useState<{ from: number; to: number; anim: SlideAnim } | null>(null)
  const flipLayerRef = useRef<HTMLDivElement | null>(null)
  const flipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const goTo = useCallback((target: number) => {
    setLeavingIdx(h)
    setDir(target > h ? 'fwd' : target < h ? 'back' : dir)
    if (TILE_ANIM_IDS.includes(anim) && target !== h) {
      const cfg = TILE_VARIANTS[anim]
      setFlip({ from: h, to: target, anim })
      if (flipTimerRef.current) clearTimeout(flipTimerRef.current)
      flipTimerRef.current = setTimeout(() => setFlip(null), Math.round(tileTotalDuration(cfg) * 1000) + 80)
    }
    setH(target)
    if (leavingTimerRef.current) clearTimeout(leavingTimerRef.current)
    // 旧页可见时长：默认 600ms 够覆盖 0.4s 的入场动画；溶解（水）0.85s
    // 更长，必须撑到新页水渍铺满——否则 mask 孔洞里的旧内容会提前消失。
    leavingTimerRef.current = setTimeout(() => setLeavingIdx(null), anim === 'dissolve' ? 1000 : 600)
  }, [h, dir, anim])

  // 瓷砖转场的格子层：在提交后、绘制前把每格填好内容。
  // 每格 = 窗口（矩形或 clip-path 形状）+ 一份【整页克隆】负偏移对齐，
  // 正面是旧页、背面是新页的活 DOM 克隆（含 postRender 产物与图片 data URL）。
  // 切割形状 / 延迟节奏 / 单格时长 / 冲量全部来自 TILE_VARIANTS 配置，
  // 经 CSS 变量下发（--ys-delay/--ys-turn/--ys-merge + 冲量变量）。
  // 必须在 useLayoutEffect 里做：此时 DOM 已提交（新页已是 ys-active、
  // 旧页已是 ys-leaving），但浏览器还没绘制 ⇒ 不会闪一帧未铺格子的新页。
  useLayoutEffect(() => {
    const layer = flipLayerRef.current
    const deck = deckRef.current
    if (!flip || !layer || !deck) return
    // 平台决定实际配置：棋盘 Windows=flip+192px / macOS=shimmer+96px（各自独立）
    const cfg = tileConfigFor(TILE_VARIANTS[flip.anim], isMac)
    const W = layer.clientWidth
    const H = layer.clientHeight
    const mode = cfg.mode
    // shimmer 模式不需要页面克隆（格子是纯色贴片），只要求几何有效
    const needsClones = mode === 'flip'
    const fromEl = needsClones ? deck.querySelector<HTMLElement>(`.ys-slide[data-index="${flip.from}"]`) : null
    const toEl = needsClones ? deck.querySelector<HTMLElement>('.ys-slide.ys-active') : null
    if (!cfg || !W || !H) return
    if (needsClones && (!fromEl || !toEl)) return

    layer.style.setProperty('--ys-turn', `${cfg.turn}s`)
    layer.style.setProperty('--ys-merge', `${cfg.merge}s`)
    layer.style.setProperty('--ys-merge-delay', `${(cfg.spread + cfg.turn).toFixed(3)}s`)

    const rand = Math.random
    const frag = document.createDocumentFragment()
    // ===== shimmer 模式（棋盘 / 六边形 / 百叶窗）：小格闪烁 =====
    // 每格是一块【纯色贴片】（不克隆页面、不做 3D）：以随机延迟淡入淡出，
    // 随机一部分用主题的另一种颜色（surface / accent）⇒ 整体格子闪烁感。
    // 新页由真实页面自身淡入承担（.ys-anim-<v> .ys-slide.ys-active 的
    // ys-fade-in）⇒ 无左右异色、无方块、无克隆开销、无 WebKit 合成层压力。
    if (mode === 'shimmer') {
      for (const t of buildTiles(W, H, cfg)) {
        const tile = document.createElement('div')
        tile.className = 'ys-shimmer-tile'
        tile.style.cssText = `left:${t.x}px;top:${t.y}px;width:${t.w}px;height:${t.h}px`
        if (t.clip) tile.style.clipPath = t.clip
        tile.style.setProperty('--ys-delay', `${delayFor(t, W, H, cfg, rand)}s`)
        // 随机取主题的另一种颜色（"相同主题不同颜色"）+ 随机峰值透明度
        // （"轻微渐显"）。两者都用 CSS 变量下发，keyframes 里消费。
        tile.style.setProperty('--ys-tint-color', rand() < 0.45 ? 'var(--editor-accent, #4f46e5)' : 'var(--editor-surface, #f0f7ff)')
        tile.style.setProperty('--ys-tint-alpha', (0.14 + rand() * 0.26).toFixed(2))
        frag.appendChild(tile)
      }
      layer.replaceChildren(frag)
      return () => { layer.replaceChildren() }
    }

    for (const t of buildTiles(W, H, cfg)) {
      const tile = document.createElement('div')
      tile.className = 'ys-flip-tile'
      tile.style.cssText = `left:${t.x}px;top:${t.y}px;width:${t.w}px;height:${t.h}px`
      tile.style.setProperty('--ys-delay', `${delayFor(t, W, H, cfg, rand)}s`)
      // 立方体：每个面沿自身法线平移半格宽 ⇒ 拼成一个边长 = 格宽的立方体
      tile.style.setProperty('--ys-half', `${(t.w / 2).toFixed(1)}px`)
      if (cfg.impulse) {
        for (const [k, v] of Object.entries(impulseVars(rand))) tile.style.setProperty(k, v)
      }

      const card = document.createElement('div')
      card.className = 'ys-flip-card'
      // 影层（shade）：仅在【macOS 的百叶窗】需要。
      // 原方案（Windows）把 box-shadow 放进 keyframes；WebKit 对 preserve-3d
      // 层内动画 box-shadow 会逐帧重绘 face，重绘间隙 backface-visibility
      // 判定失效 ⇒ 背面被 GPU 画成黑块。macOS 因此改用独立 shade 层承担影：
      // 本体透明（不遮内容），仅 box-shadow 溢出格子边界外可见，挂在 card
      // 之后（绘制在上）⇒ 翻转中 card 缩小露缝隙时影从缝隙可见。
      // 其他变体两平台均用原方案（Windows 的 box-shadow keyframes /
      // cube3d 的棱厚 / shatter 的碎片影），不建 shade。
      let shadeEl: HTMLDivElement | undefined = undefined
      const needsShade = isMac && flip.anim === 'blinds'
      if (needsShade) {
        shadeEl = document.createElement('div')
        shadeEl.className = 'ys-flip-shade'
      }
      // flip 模式：front = 旧页克隆、back = 新页克隆（needsClones 已保证非空）
      for (const [src, side] of [[fromEl as HTMLElement, 'front'], [toEl as HTMLElement, 'back']] as const) {
        const face = document.createElement('div')
        face.className = `ys-flip-face ${side}`
        // 裁形挂在【面】上而不是格子：格子上的 clip-path 会把格子级投影一起
        // 裁掉（box-shadow/filter 都逃不掉），挂面上则格子的 drop-shadow 能
        // 沿裁剪后的轮廓描影 ⇒ 六边形也能有卡片外阴影。
        if (t.clip) face.style.clipPath = t.clip
        const page = src.cloneNode(true) as HTMLElement
        // 滤掉状态类：否则克隆会命中 ys-past/ys-future/ys-leaving 的隐藏规则
        page.className = [
          ...src.className.split(/\s+/).filter((k) => k && !SLIDE_STATE_CLASSES.has(k)),
          'ys-flip-page',
        ].join(' ')
        page.removeAttribute('data-index')
        page.style.cssText = `position:absolute;left:${-t.x}px;top:${-t.y}px;width:${W}px;height:${H}px`
        face.appendChild(page)
        card.appendChild(face)
      }
      if (cfg.faces === 3) {
        // 侧面：不装页面内容，只做立方体的厚度面（配色见 CSS，主题色派生）
        const side = document.createElement('div')
        side.className = 'ys-flip-face ys-flip-side'
        card.appendChild(side)
      }
      tile.appendChild(card)
      // macOS 百叶窗的影层挂在 card 之后（绘制在上，见上方注释）
      if (needsShade && shadeEl) tile.appendChild(shadeEl)
      frag.appendChild(tile)
    }
    layer.replaceChildren(frag)
    return () => { layer.replaceChildren() }
  }, [flip])

  /** 查询当前活动 section 的片段元素（按 DOM 顺序） */
  const getFragments = useCallback((): HTMLElement[] => {
    const deck = deckRef.current
    const active = deck?.querySelector<HTMLElement>('.ys-slide.ys-active')
    if (!active) return []
    return Array.from(active.querySelectorAll<HTMLElement>('[data-fragment]'))
  }, [])

  const next = useCallback(() => {
    // HUD 片段开关关闭时，直接翻页（片段全部显示态）
    if (!fragmentsOn) {
      goTo(Math.min(h + 1, slides.length - 1))
      return
    }
    const frags = getFragments()
    const hidden = frags.find((el) => !el.classList.contains('ys-fragment-visible'))
    if (hidden) {
      hidden.classList.add('ys-fragment-visible')
      return
    }
    goTo(Math.min(h + 1, slides.length - 1))
  }, [slides.length, getFragments, fragmentsOn, goTo, h])

  const prev = useCallback(() => {
    if (!fragmentsOn) {
      sessionStorage.setItem(REVEAL_ALL, '1')
      goTo(Math.max(h - 1, 0))
      return
    }
    const frags = getFragments()
    const visible = frags.filter((el) => el.classList.contains('ys-fragment-visible'))
    if (visible.length) {
      visible[visible.length - 1].classList.remove('ys-fragment-visible')
      return
    }
    // 翻回上一页：目标页片段全部显示（revealAll 标志在渲染 effect 中消费）
    sessionStorage.setItem(REVEAL_ALL, '1')
    goTo(Math.max(h - 1, 0))
  }, [getFragments, REVEAL_ALL, fragmentsOn, goTo, h])

  // 统一退出：退出全屏后关闭演示，回到打开前的编辑视图
  const requestExit = useCallback(async () => {
    if (exitingRef.current) return
    exitingRef.current = true
    await exitFullscreen()
    // 还原之前的窗口状态
    const tauri = (window as any).__TAURI_INTERNALS__
    if (tauri?.invoke) {
      const label = tauri.metadata?.currentWindow?.label || 'main'
      const { isMaximized, isFullscreen } = savedWindowState.current
      try {
        const currentFs = await tauri.invoke('plugin:window|is_fullscreen', { label })
        if (isFullscreen && !currentFs) {
          await tauri.invoke('plugin:window|set_fullscreen', { label, fullscreen: true })
        } else if (!isFullscreen && isMaximized) {
          await tauri.invoke('toggle_window_size')
        }
      } catch {}
    }
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
    if (k === 'Home') { e.preventDefault(); sessionStorage.setItem(REVEAL_ALL, ''); goTo(0); return }
    if (k === 'End') { e.preventDefault(); sessionStorage.setItem(REVEAL_ALL, '1'); goTo(slides.length - 1); return }
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
  }, [next, prev, slides.length, requestExit, showHelp, REVEAL_ALL, goTo])

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
    // 记录进入演示前的窗口状态
    const tauri = (window as any).__TAURI_INTERNALS__
    if (tauri?.invoke) {
      const label = tauri.metadata?.currentWindow?.label || 'main'
      Promise.all([
        tauri.invoke('plugin:window|is_maximized', { label }),
        tauri.invoke('plugin:window|is_fullscreen', { label }),
      ]).then(([maximized, fullscreen]) => {
        savedWindowState.current = { isMaximized: !!maximized, isFullscreen: !!fullscreen }
      }).catch(() => {})
    }
    enterFullscreen().then((ok) => { if (ok) hadFullscreenRef.current = true })
    return () => { exitFullscreen() }
  }, [])

  // 鼠标活动检测：显示/隐藏退出按钮
  useEffect(() => {
    const onMouseMove = () => {
      setShowExitBtn(true)
      if (mouseTimerRef.current) clearTimeout(mouseTimerRef.current)
      mouseTimerRef.current = setTimeout(() => setShowExitBtn(false), 1500)
    }
    window.addEventListener('mousemove', onMouseMove)
    // 初始触发一次
    onMouseMove()
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      if (mouseTimerRef.current) clearTimeout(mouseTimerRef.current)
    }
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

  // 加载主题列表 + 平台检测（macOS 翻面方块感分支，见 isMac 注释）
  useEffect(() => {
    const tauri = (window as any).__TAURI_INTERNALS__
    if (!tauri?.invoke) return
    tauri.invoke('get_platform').then((p: string) => setIsMac(p === 'macos')).catch(() => {})
    tauri.invoke('list_themes').then((files: string[]) => setThemes(orderThemes(files || []))).catch(() => {})
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

  // ===== 懒渲染窗口 + 按 section 后处理 =====
  // 仅渲染 |i - h| <= 2 的页面（窗口外空壳，absolute 定位无布局影响）；
  // section key 含窗口态（w/e 前缀），进出窗口即卸载重挂载，天然清理
  // data-processed 与片段类残留。每个 section 挂载后：
  //   1. 片段标记（fragmentEligible 页的顶层列表项打 data-fragment）
  //   2. 插件 postRender（katex/mermaid，作用域即该 section）
  //   3. 本地图片转 data URL
  // 全部用 data-processed 防重复。
  const WINDOW = 2
  const inWindow = (i: number) => Math.abs(i - h) <= WINDOW

  // 片段方向语义：前进进入新页 → 全隐；后退进入 → 全显（REVEAL_ALL 标志）。
  // Home → 全隐（空标志）；End → 全显。
  // 翻页方向 dir 已在 goTo 中同步设置（见上）。
  const prevHRef = useRef(h)
  useEffect(() => {
    const prevH = prevHRef.current
    prevHRef.current = h
    const flag = sessionStorage.getItem(REVEAL_ALL)
    sessionStorage.removeItem(REVEAL_ALL)
    // flag: '1' = 全显（prev/End）；'' = 全隐（Home）；null = 前进翻页 → 全隐
    const revealAll = flag === '1'
    const deck = deckRef.current
    if (!deck) return
    const active = deck.querySelector<HTMLElement>('.ys-slide.ys-active')
    if (!active) return
    // 仅当页码真的变化时处理片段（初始挂载 h=0 时 flag 为 null，全隐即默认态）
    if (h !== prevH) {
      active.querySelectorAll<HTMLElement>('[data-fragment]').forEach((el) => {
        el.classList.toggle('ys-fragment-visible', revealAll)
      })
    }
  }, [h, REVEAL_ALL])

  // 卸载时清理 leaving / flip 定时器
  useEffect(() => () => {
    if (leavingTimerRef.current) clearTimeout(leavingTimerRef.current)
    if (flipTimerRef.current) clearTimeout(flipTimerRef.current)
  }, [])

  // section 挂载后处理：片段标记 + 插件 + 图片（按 section 粒度，data-processed 防重复）
  const processSection = useCallback((section: HTMLElement | null) => {
    if (!section) return
    if (section.dataset.processed) return
    section.dataset.processed = '1'
    const index = Number(section.dataset.index)
    const slide = slides[index]
    if (!slide) return

    // 1. 片段标记：仅 fragmentEligible 页；顶层列表的直接子 li（嵌套随父项出现）。
    //    HUD 运行时开关关闭时不打标记（列表整页显示）；重新开启时由
    //    fragmentsOn effect 对当前页补打标记。
    if (slide.fragmentEligible && fragmentsOn) {
      section.querySelectorAll<HTMLElement>(':scope > ul > li, :scope > ol > li').forEach((li) => {
        li.setAttribute('data-fragment', '')
      })
    }

    // 2. 插件后处理（katex/mermaid 等，作用域限定本 section）
    if (enabledPlugins.length > 0) {
      pluginPostRender(section, enabledPlugins, pluginConfigs)
    }

    // 3. 本地图片转 data URL
    const tauri = (window as any).__TAURI_INTERNALS__
    if (!tauri || typeof tauri.invoke !== 'function') return
    section.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src')
      if (!src || src.startsWith('http') || src.startsWith('data:') || src.startsWith('asset://')) return
      resolveLocalImageSrc(src, docBaseDir).then((path) => {
        if (!path) return
        return tauri.invoke('read_image_base64', { path })
          .then((dataUrl: string) => img.setAttribute('src', dataUrl))
      }).catch(() => {})
    })
  }, [slides, enabledPlugins, pluginConfigs, docBaseDir, fragmentsOn])

  // HUD 片段开关切换时的即时生效：
  //   开 → 当前页补打 data-fragment 标记并全隐（从头逐条）
  //   关 → 当前页移除标记（列表立即整页显示）
  useEffect(() => {
    const deck = deckRef.current
    const active = deck?.querySelector<HTMLElement>('.ys-slide.ys-active')
    if (!active) return
    if (fragmentsOn) {
      active.querySelectorAll<HTMLElement>(':scope > ul > li, :scope > ol > li').forEach((li) => {
        li.setAttribute('data-fragment', '')
        li.classList.remove('ys-fragment-visible')
      })
    } else {
      active.querySelectorAll<HTMLElement>('[data-fragment]').forEach((el) => {
        el.removeAttribute('data-fragment')
        el.classList.remove('ys-fragment-visible')
      })
    }
  }, [fragmentsOn, h])

  return (
    <div className={`yizi-slideshow theme-${theme}${dark ? ' dark' : ''}`}>
      {/* 退出按钮：鼠标活动时显示 */}
      <button
        className="ys-exit-btn"
        style={{ opacity: showExitBtn ? 1 : 0, pointerEvents: showExitBtn ? 'auto' : 'none' }}
        onClick={requestExit}
        title={t('slideshow.exit')}
      >
        <X size={16} />
        <span>{t('slideshow.exit')}</span>
      </button>

      <div className={`ys-deck ys-dir-${dir}${anim !== 'slide' ? ` ys-anim-${anim}` : ''}${isMac ? ' ys-mac' : ''}`} ref={deckRef}>
        {slides.map((slide, i) => {
          const active = i === h
          const past = i < h
          const classes = ['ys-slide', `ys-layout-${slide.kind}`]
          if (slide.align) classes.push(`ys-align-${slide.align}`)
          if (active) {
            classes.push('ys-active')
          } else if (i === leavingIdx) {
            // 翻页瞬间的旧页：保持可见供入场页覆盖（与 setH 同一 commit）
            classes.push('ys-leaving')
            classes.push(past ? 'ys-past' : 'ys-future')
          } else if (past) {
            classes.push('ys-past')
          } else {
            classes.push('ys-future')
          }
          // key 含窗口态：进出窗口卸载重挂载，清理 data-processed/片段残留
          const key = `${inWindow(i) ? 'w' : 'e'}${i}`
          const windowed = inWindow(i)
          return (
            <section
              key={key}
              className={classes.join(' ')}
              data-num={sectionNums[i] || undefined}
              data-index={i}
              ref={windowed ? processSection : undefined}
              dangerouslySetInnerHTML={windowed ? { __html: getSlideHtml(slide, i) } : undefined}
            />
          )
        })}
        {/* 棋盘（瓷砖翻转）的格子层：内容由 useLayoutEffect 命令式填充 */}
        {flip && <div className="ys-flip-layer" ref={flipLayerRef} />}
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
          <button className="ys-hud-btn" onClick={(e) => { e.currentTarget.blur(); setShowNotes((x) => !x) }}>{t('slideshow.notes')}</button>
        )}
        <div className="ys-hud-ctrl">
          <button
            className="ys-icon-btn"
            title={fragmentsOn ? t('slideshow.fragmentsOff') : t('slideshow.fragmentsOn')}
            onClick={(e) => { e.currentTarget.blur(); setFragmentsOn((f) => !f) }}
          >
            <ListOrdered size={14} style={{ opacity: fragmentsOn ? 1 : 0.4 }} />
          </button>
          <button
            className="ys-icon-btn"
            title={dark ? t('slideshow.toLight') : t('slideshow.toDark')}
            onClick={(e) => { e.currentTarget.blur(); setDark((d) => !d) }}
          >
            {dark ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <button
            className="ys-icon-btn"
            title={t('slideshow.toggleTheme')}
            onClick={(e) => { e.currentTarget.blur(); setThemeMenuOpen((o) => !o) }}
          >
            <Palette size={14} />
          </button>
          <button
            className="ys-icon-btn"
            title={t('slideshow.toggleAnim')}
            onClick={(e) => { e.currentTarget.blur(); setAnimMenuOpen((o) => !o) }}
          >
            <Sparkles size={14} />
          </button>
        </div>
        <span className="ys-hint">{t('slideshow.hintBar')}</span>
      </div>

      {/* 切换动画菜单：默认的「卡片推换」放最前，其余按「柔和型 → 强烈型」排列 */}
      {animMenuOpen && (
        <>
          <div className="ys-dismiss" onClick={() => setAnimMenuOpen(false)} />
          <div className="ys-theme-menu">
            {([
              ['cube', t('slideshow.animCube')],
              ['slide', t('slideshow.animSlide')],
              ['fade', t('slideshow.animFade')],
              ['zoom', t('slideshow.animZoom')],
              ['dissolve', t('slideshow.animDissolve')],
              ['blinds', t('slideshow.animBlinds')],
              ['checkerboard', t('slideshow.animCheckerboard')],
              ['cube3d', t('slideshow.animCube3d')],
              ['hex', t('slideshow.animHex')],
              ['shatter', t('slideshow.animShatter')],
              ['depth', t('slideshow.animDepth')],
              ['none', t('slideshow.animNone')],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                className={anim === id ? 'ys-theme-active' : ''}
                onClick={() => { setSlideAnim('slideAnim', id); setAnimMenuOpen(false) }}
              >
                {anim === id && <Check size={13} />}
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* 主题菜单 */}
      {themeMenuOpen && (
        <>
          <div className="ys-dismiss" onClick={() => setThemeMenuOpen(false)} />
          <div className="ys-theme-menu">
            {themes.map((file) => {
              const id = file.replace(/\.css$/, '')
              const name = themeMeta[id]?.name || (id === 'academic' ? t('slideshow.academic') : id)
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
            <h2>{t('slideshow.shortcutsTitle')}</h2>
            <table>
              <tbody>
                <tr><td>{t('slideshow.next')}</td><td>→ 空格 PageDown Enter</td></tr>
                <tr><td>{t('slideshow.prev')}</td><td>← PageUp Backspace</td></tr>
                <tr><td>{t('slideshow.homeEnd')}</td><td>Home / End</td></tr>
                <tr><td>{t('slideshow.fullscreen')}</td><td>F</td></tr>
                <tr><td>{t('slideshow.speakerNotes')}</td><td>S</td></tr>
                <tr><td>{t('slideshow.helpToggle')}</td><td>?</td></tr>
                <tr><td>{t('slideshow.exit')}</td><td>Esc</td></tr>
              </tbody>
            </table>
            <p className="ys-card-foot">
              {t('slideshow.helpFragments')}
              {t('slideshow.helpLayouts')}
              {t('slideshow.helpText1')}
              {t('slideshow.helpText2')}
              {t('slideshow.helpText3')}
            </p>
          </div>
        </div>
      )}

      {/* 备注面板 */}
      {showNotes && cur?.notes && (
        <div className="ys-notes-panel">
          <div className="ys-notes-head">
            <span>{t('slideshow.notesTitle')}</span>
            <button onClick={() => setShowNotes(false)}>{t('slideshow.close')}</button>
          </div>
          <div className="ys-notes-body">{cur.notes}</div>
        </div>
      )}

      <div className="ys-title">{docTitle}</div>
    </div>
  )
}
