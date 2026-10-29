/**
 * 阅读模式（v0.4.2 起）—— 全屏、双页对开、真实分页、目录/页码/脚注跳转。
 *
 * 分页引擎在 `lib/readerPagination.ts`（Phase 0 已验证）：
 *   · 页面是独立 DOM，不是滚动/多列条带；
 *   · 段落按行二分拆分、表格续页重复表头、代码按行拆分、列表按条目拆分；
 *   · 标题与后续内容绑定，避免标题孤行。
 *
 * 本组件负责：全屏、主题变量注入、HUD（主题/明暗/字体/字号）、目录抽屉、
 * 页码跳转、脚注往返、窗口尺寸变化后的重排、按文档记忆阅读位置。
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  BookOpen, Check, List, Minus, Moon, Palette, Plus,
  Sun, Type, X,
} from 'lucide-react'
import { renderMarkdown } from '../lib/markdownRenderer'
import { extendMarkdownIt, postRender as pluginPostRender } from '../plugins/registry'
import { computeOutlineItems } from '../lib/headingId'
import { splitFrontMatter } from '../lib/frontMatter'
import { stripInlineMarkers } from '../lib/liveSyntax'
import { paginateReader, type ReaderOutlineEntry } from '../lib/readerPagination'
import { loadThemeCatalog } from '../lib/themeCatalog'
import { orderThemes } from '../lib/themeOrder'
import { CUSTOM_THEME, readUserCss } from '../lib/themeLoader'
import { normalizeUserCss } from '../lib/userCss'
import { scopeThemeVars } from '../lib/slideDeck'
import { enterFullscreen, exitFullscreen, toggleFullscreen } from '../lib/fullscreen'
import { invokeTauri } from '../lib/tauri'
import { resolveLocalImageSrc } from '../lib/localImages'
import { useSettingsStore } from '../stores/settingsStore'
import { useI18n } from '../i18n'
import '../styles/reader.css'

interface ReaderProps {
  content: string
  title: string
  filePath?: string | null
  enabledPlugins: string[]
  pluginConfigs: Record<string, Record<string, unknown>>
  onExit: () => void
}

type FontChoice = 'theme' | 'serif' | 'sans' | 'mono'

const PAGE_PAD_X = 46
const PAGE_PAD_Y = 42
const FOLIO_H = 26
/** 3D 翻页动画时长；与 reader.css 的 .reader-flip-sheet animation 保持一致 */
const FLIP_MS = 620
/** 书叶被切成多少条竖向窄带：越多越像平滑的纸，12 条在渲染开销和顺滑度之间比较平衡 */
const LEAF_STRIPS = 12

const FONT_CHOICES: FontChoice[] = ['theme', 'serif', 'sans', 'mono']
const FONT_LABEL_KEY: Record<FontChoice, string> = {
  theme: 'slideshow.fontDefault',
  serif: 'slideshow.fontSerif',
  sans: 'slideshow.fontSans',
  mono: 'slideshow.fontMono',
}
const FONT_STACK: Record<FontChoice, string> = {
  theme: 'var(--font-preview)',
  serif: 'var(--font-serif)',
  sans: 'var(--font-sans)',
  mono: 'var(--font-mono)',
}

interface Layout {
  pageW: number
  pageH: number
  spread: boolean
  gap: number
  margin: number
  padX: number
}

interface StoredPosition {
  page: number
  anchor?: string
  total?: number
}

/** 翻页动画：dir 决定书叶从哪一半转出，from → to 是动画结束后落定的起始页 */
interface FlipState {
  dir: 'next' | 'prev'
  from: number
  to: number
}

type PageSide = 'left' | 'right' | 'single'

interface FlipPage {
  html: string
  index: number
  side: PageSide
}

interface FlipFaces {
  underLeft: FlipPage
  underRight: FlipPage
  front: FlipPage
  back: FlipPage
}

/** 书页渲染（正文页 / 前置页 / 翻页动画的每一面都共用这一个组件，保证版式完全一致） */
function BookPage({ html, index, side, front }: FlipPage & { front?: string }) {
  return (
    <div
      className={`reader-page${front ? ' reader-front-page' : ''}`}
      data-side={side}
      data-front={front || undefined}
      data-page={index >= 0 ? index : undefined}
    >
      <div className="reader-page-inner reader-content" dangerouslySetInnerHTML={{ __html: html }} />
      {index >= 0 && !front && <span className="reader-folio">{index + 1}</span>}
    </div>
  )
}

export default function Reader({
  content, title, filePath, enabledPlugins, pluginConfigs, onExit,
}: ReaderProps) {
  const { t } = useI18n()
  const rootRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const bookRef = useRef<HTMLDivElement>(null)

  const settings = useSettingsStore.getState()
  const [theme, setTheme] = useState(settings.currentTheme || 'liquidglass-prism')
  const [dark, setDark] = useState(!!settings.isDark)
  const [fontChoice, setFontChoice] = useState<FontChoice>('theme')
  const [fontSize, setFontSize] = useState(Math.max(18, Number(settings.previewFontSize) || 20))
  const [lineHeight, setLineHeight] = useState(Math.max(1.5, Number(settings.previewLineHeight) || 1.9))

  const [themeReady, setThemeReady] = useState(0)
  const [themes, setThemes] = useState<string[]>([])
  const [themeMeta, setThemeMeta] = useState<Record<string, string>>({})
  const [themeMenu, setThemeMenu] = useState(false)
  const [fontMenu, setFontMenu] = useState(false)

  const [layout, setLayout] = useState<Layout>({ pageW: 0, pageH: 0, spread: false, gap: 0, margin: 44, padX: 46 })
  const [pages, setPages] = useState<string[]>([])
  const [frontKinds, setFrontKinds] = useState<string[]>([])
  const [bookTitle, setBookTitle] = useState(title)
  const [toc, setToc] = useState<Array<ReaderOutlineEntry & { page: number }>>([])
  const anchorsRef = useRef<Record<string, number>>({})
  const [anchorTick, setAnchorTick] = useState(0)
  const [currentPage, setCurrentPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadProgress, setLoadProgress] = useState(0)
  const [tocOpen, setTocOpen] = useState(false)
  const [jumpOpen, setJumpOpen] = useState(false)
  const [jumpValue, setJumpValue] = useState('')
  const [backJump, setBackJump] = useState<{ page: number; id?: string } | null>(null)
  const [flashId, setFlashId] = useState<string | null>(null)
  const [flip, setFlip] = useState<FlipState | null>(null)
  const [bookInstant, setBookInstant] = useState(false)

  const wheelCooldown = useRef(0)
  const flipTimer = useRef<number | null>(null)
  const flippingRef = useRef(false)
  const flipRef = useRef<HTMLDivElement>(null)
  const currentPageRef = useRef(0)
  currentPageRef.current = currentPage

  const storageKey = useMemo(() => `yizi-reader-position:${filePath || title || 'untitled'}`, [filePath, title])
  const savedRef = useRef<StoredPosition | null>(readStored(storageKey))
  const restoredRef = useRef(false)

  /* ---------------- 主题列表 / 主题变量注入 ---------------- */

  useEffect(() => {
    let cancelled = false
    loadThemeCatalog().then((catalog) => {
      if (cancelled || !catalog.themes.length) return
      setThemes(orderThemes(catalog.themes.map((entry) => `${entry.id}.css`)))
      const meta: Record<string, string> = {}
      for (const entry of catalog.themes) meta[entry.id] = entry.name
      setThemeMeta(meta)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    const isCustom = theme === CUSTOM_THEME
    const base = isCustom ? (settings.customCssBase || 'liquidglass-prism') : theme
    invokeTauri<string>('read_theme_css', { name: `${base}.css` })
      .then(async (css) => {
        if (cancelled) return
        if (!css) {
          // 非 Tauri 环境 / 主题文件缺失：不带主题变量也要能排版（回退到全局默认）
          setThemeReady((n) => n + 1)
          return
        }
        const rawUser = isCustom ? await readUserCss().catch(() => '') : ''
        const userVars = rawUser ? normalizeUserCss(rawUser, CUSTOM_THEME) : ''
        const vars = scopeThemeVars(css, userVars, theme, '.yizi-reader')
        let el = document.getElementById('yizimarkdown-reader-theme-css')
        if (!el) {
          el = document.createElement('style')
          el.id = 'yizimarkdown-reader-theme-css'
          document.head.appendChild(el)
        }
        el.textContent = vars
        setThemeReady((n) => n + 1)
      })
      .catch(() => setThemeReady((n) => n + 1))
    return () => { cancelled = true }
  }, [theme, settings.customCssBase])

  useEffect(() => () => {
    document.getElementById('yizimarkdown-reader-theme-css')?.remove()
  }, [])

  /* ---------------- 全屏 ---------------- */

  useEffect(() => {
    void enterFullscreen()
    return () => { void exitFullscreen() }
  }, [])

  /* ---------------- 尺寸 ---------------- */

  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    let raf = 0
    const compute = () => {
      const rect = stage.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      // 四边等边距：只用同一个 margin，不做宽高不同比例。
      // 最小值 44px：底部要放得下 HUD（36px）而不压到书框。
      const margin = Math.max(44, Math.min(56, Math.round(Math.min(rect.width, rect.height) * 0.055)))
      const frameW = rect.width - margin * 2
      const frameH = rect.height - margin * 2
      const spread = frameW >= 920 && frameW / frameH >= 1.05
      // 双页共享一个“框内书页”，中间不留缝；单页居中
      const pageW = Math.floor(spread ? Math.min(frameW / 2, 900) : Math.min(frameW, 900))
      const pageH = Math.floor(Math.max(320, frameH))
      // 文字栏宽上限 820px：超宽屏幕上用更大的页内边距，避免一行过长
      const padX = Math.max(PAGE_PAD_X, Math.floor((pageW - 820) / 2))
      const next: Layout = { pageW, pageH, spread, gap: 0, margin, padX }
      setLayout((prev) =>
        prev.pageW === next.pageW && prev.pageH === next.pageH && prev.spread === next.spread &&
        prev.gap === next.gap && prev.margin === next.margin && prev.padX === next.padX
          ? prev
          : next,
      )
    }
    const schedule = () => {
      if (raf) return
      raf = requestAnimationFrame(() => { raf = 0; compute() })
    }
    compute()
    const ro = new ResizeObserver(schedule)
    ro.observe(stage)
    window.addEventListener('resize', schedule)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', schedule)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  const contentW = Math.max(200, layout.pageW - layout.padX * 2)
  const contentH = Math.max(260, layout.pageH - PAGE_PAD_Y * 2 - FOLIO_H)

  /* ---------------- 渲染 + 分页 ---------------- */

  useEffect(() => {
    if (!layout.pageW || !layout.pageH || !themeReady) return
    let cancelled = false
    setLoading(true)
    // 重新分页时丢弃进行中的翻页动画（旧页码已经失效）
    if (flipTimer.current) { window.clearTimeout(flipTimer.current); flipTimer.current = null }
    flippingRef.current = false
    setFlip(null)

    const run = async () => {
      const host = measureRef.current
      if (!host) return

      // 书名提取：front matter title → 首个 H1 → 文件名。首个 H1 与书名一致时从正文移除，
      // 由封面/扉页承担（传统书籍不会在正文第一页重复书名）。
      const split = splitFrontMatter(content)
      const meta = split.meta
      let body = split.body
      const first = firstAtxHeading(body)
      const docTitle = (meta.title || '').trim() || (first ? stripInlineMarkers(first.text) : '') || title || 'Untitled'
      let renderBody = body
      if (first && stripInlineMarkers(first.text) === docTitle) {
        renderBody = (body.slice(0, first.index) + body.slice(first.index + first.length)).replace(/^\s*\n+/, '')
      }

      host.style.width = `${contentW}px`
      const pluginExtenders = enabledPlugins.map(() => (md: any) => extendMarkdownIt(md, enabledPlugins, pluginConfigs))
      host.innerHTML = renderMarkdown(renderBody, pluginExtenders)
      await pluginPostRender(host, enabledPlugins, pluginConfigs).catch(() => {})
      await resolveLocalImages(host, filePath)
      try { await document.fonts.ready } catch { /* ignore */ }
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
      if (cancelled) return

      const outline = computeOutlineItems(renderBody).map((item) => ({
        id: item.id, title: item.text, level: item.level,
      }))
      // 直接把 host 里已渲染好的节点交给分页器：既不序列化也不重新解析整篇 HTML
      setLoadProgress(0)
      const result = await paginateReader('', {
        width: contentW, height: contentH, host, outline,
        sourceElement: host,
        onProgress: (f) => setLoadProgress(f),
        shouldCancel: () => cancelled,
      })
      if (cancelled) return

      // 封面 / 扉页 / 目录页（目录可能跨多页）。内容页的页码整体后移。
      // 目录字号与正文一致（1em），行高 1.45、行间距 0.55em —— 与 reader.css 的 .reader-toc-line 对齐，
      // 每页能放多少条按实际字号/行高算，而不是写死的 28px。
      const tocLineH = Math.max(1, Math.ceil(fontSize * (1.45 + 0.55)))
      // 目录页标题（kicker）：1.6em、继承正文行高，下方 margin 1.4em（相对 kicker 字号）
      const tocHeadH = Math.ceil(fontSize * 1.6 * (lineHeight + 1.4))
      const tocCaps: number[] = []
      for (let left = result.toc.length; left > 0; ) {
        const first = tocCaps.length === 0
        const cap = Math.max(1, Math.floor((contentH - (first ? tocHeadH : 0) - 8) / tocLineH))
        const take = Math.min(cap, left)
        tocCaps.push(take)
        left -= take
      }
      const tocPageCount = tocCaps.length
      const frontCount = renderBody.trim() ? 2 + tocPageCount : 0
      const shiftedToc = result.toc.map((item) => ({ ...item, page: item.page + frontCount }))
      const frontPages: string[] = []
      const kinds: string[] = []
      if (frontCount > 0) {
        frontPages.push(buildCoverPage(docTitle, meta))
        kinds.push('cover')
        frontPages.push(buildTitlePage(docTitle, meta))
        kinds.push('title')
        let offset = 0
        for (let i = 0; i < tocPageCount; i++) {
          const cap = tocCaps[i]
          frontPages.push(buildTocPage(shiftedToc.slice(offset, offset + cap), t('reader.toc'), i > 0))
          kinds.push('toc')
          offset += cap
        }
      }
      const shiftedAnchors: Record<string, number> = {}
      for (const [id, page] of Object.entries(result.anchorPages)) shiftedAnchors[id] = page + frontCount
      anchorsRef.current = shiftedAnchors
      const allPages = [...frontPages, ...result.pages]
      setPages(allPages)
      setFrontKinds(kinds)
      setBookTitle(docTitle)
      setToc(shiftedToc)
      setAnchorTick((n) => n + 1)

      // 恢复阅读位置（首次）：优先按章节 id，其次按页码
      if (!restoredRef.current) {
        restoredRef.current = true
        const saved = savedRef.current
        let page = 0
        if (saved?.anchor && saved.anchor in shiftedAnchors) page = shiftedAnchors[saved.anchor]
        else if (saved?.page) page = saved.page
        setCurrentPage(clampStartPage(page, allPages.length, layout.spread))
      } else {
        setCurrentPage((p) => clampStartPage(p, allPages.length, layout.spread))
      }
    }
    void run().catch(() => {
      if (!cancelled) setLoading(false)
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })

    return () => { cancelled = true }
  }, [content, contentW, contentH, layout.pageW, layout.pageH, layout.spread, themeReady, fontChoice, fontSize, lineHeight, enabledPlugins, pluginConfigs, filePath])

  /* ---------------- 当前章节 / 页码保存 ---------------- */

  const currentToc = useMemo(() => {
    let cur: (ReaderOutlineEntry & { page: number }) | undefined
    for (const item of toc) {
      if (item.page <= currentPage) cur = item
      else break
    }
    return cur
  }, [toc, currentPage])

  useEffect(() => {
    if (!restoredRef.current) return
    try {
      const stored: StoredPosition = {
        page: currentPage,
        anchor: currentToc?.id,
      }
      localStorage.setItem(storageKey, JSON.stringify(stored))
    } catch { /* ignore */ }
  }, [currentPage, currentToc, storageKey])

  /* ---------------- 导航 ---------------- */

  const spreadMode = layout.spread && pages.length > 1
  const step = spreadMode ? 2 : 1
  const maxStart = Math.max(0, pages.length - 1)

  // 翻页动画的四个面：垫在下面的左右页 + 正在翻动的书叶正反面。
  // 书叶以中缝（双页时 x=pageW，单页时 x=0）为轴：正向 0° → -180°，反向 -180° → 0°。
  // 所以正向：起始可见正面=当前右页，落定可见背面=下一跨页的左页；
  // 反向：起始（书叶压在左半）可见背面=当前左页，落定可见正面=上一跨页的右页。
  const flipFaces = useMemo<FlipFaces | null>(() => {
    if (!flip) return null
    const at = (i: number, side: PageSide): FlipPage =>
      i >= 0 && i < pages.length ? { html: pages[i], index: i, side } : { html: '', index: -1, side }
    if (spreadMode) {
      if (flip.dir === 'next') {
        return {
          underLeft: at(flip.from, 'left'),
          underRight: at(flip.from + 3, 'right'),
          front: at(flip.from + 1, 'right'),
          back: at(flip.from + 2, 'left'),
        }
      }
      return {
        underLeft: at(flip.from - 2, 'left'),
        underRight: at(flip.from + 1, 'right'),
        front: at(flip.from - 1, 'right'),
        back: at(flip.from, 'left'),
      }
    }
    // 单页：书叶绕左侧书脊翻走 / 翻回，下面垫着相邻页
    if (flip.dir === 'next') {
      return {
        underLeft: at(flip.from + 1, 'single'),
        underRight: at(-1, 'single'),
        front: at(flip.from, 'single'),
        back: at(-1, 'single'),
      }
    }
    return {
      underLeft: at(flip.from, 'single'),
      underRight: at(-1, 'single'),
      front: at(flip.from - 1, 'single'),
      back: at(-1, 'single'),
    }
  }, [flip, pages, spreadMode])

  // 书叶条带的 HTML：同一页要复制到每条带上，复制前先去掉 id，避免和真实页面的锚点 id 冲突
  const leafHtml = useMemo(() => {
    if (!flipFaces) return null
    const strip = (html: string) => html.replace(/\sid="[^"]*"/g, '')
    return {
      front: strip(flipFaces.front.html),
      back: strip(flipFaces.back.html),
    }
  }, [flipFaces])

  /* ---------------- 书叶弯折动画 ----------------
   * 书叶 = LEAF_STRIPS 条竖向窄带，整体绕中缝（或左侧书脊）转动，再叠一层「自由边滞后」的弯折：
   * β(u) = 总角度 − A·sin(π·t)·u^1.6，脊柱处跟上、自由边慢半拍，中段弯曲最大、两端归零。
   * 位置由角度积分得到（x += s·cosβ, z −= s·sinβ），逐帧只改 transform 和两个 CSS 变量。
   */
  useLayoutEffect(() => {
    if (!flip || !flipRef.current) return
    const leaf = flipRef.current.querySelector<HTMLElement>('.reader-leaf')
    const dogs = Array.from(flipRef.current.querySelectorAll<HTMLElement>('.reader-dogear'))
    const strips = Array.from(flipRef.current.querySelectorAll<HTMLElement>('.reader-leaf-strip'))
    if (!leaf || !strips.length) return
    const stripW = layout.pageW / strips.length
    const maxDog = Math.round(Math.min(layout.pageW, layout.pageH) * 0.22)
    const hinge = spreadMode ? layout.pageW : 0
    const fromAngle = flip.dir === 'next' ? 0 : -Math.PI
    const toAngle = flip.dir === 'next' ? -Math.PI : 0
    const start = performance.now()
    let raf = 0

    const draw = (elapsed: number) => {
      const raw = Math.min(1, Math.max(0, elapsed / FLIP_MS))
      // 前 0.14 只折角；折角还没折满整页就开始翻，两段动作有重叠，衔接不突兀
      const rotRaw = Math.min(1, Math.max(0, (raw - 0.14) / 0.86))
      const eased = rotRaw * rotRaw * (3 - 2 * rotRaw)
      const spineAngle = fromAngle + (toAngle - fromAngle) * eased
      // 自由边先翻过去（行程的 72% 就到 180°），脊柱随后跟上——纸是被自由边带过去的
      const edgeRaw = Math.min(1, rotRaw / 0.72)
      const edgeEased = edgeRaw * edgeRaw * (3 - 2 * edgeRaw)
      const edgeAngle = fromAngle + (toAngle - fromAngle) * edgeEased
      const bend = edgeAngle - spineAngle
      let x = 0
      let z = 0
      for (let i = 0; i < strips.length; i++) {
        const u = i / (strips.length - 1)
        const beta = spineAngle + bend * Math.pow(u, 1.6)
        strips[i].style.transform = `translate3d(${hinge + x}px, 0, ${z}px) rotateY(${beta}rad)`
        x += stripW * Math.cos(beta)
        z -= stripW * Math.sin(beta)
      }
      // 受光用整体角度（一条带一个值会把纸面切成竖条，所以只动两个全宽渐变）
      const meanAngle = spineAngle + bend * 0.55
      leaf.style.setProperty('--leaf-flat', ((1 - Math.abs(Math.cos(meanAngle))) * 0.34).toFixed(3))
      leaf.style.setProperty('--leaf-rise', (0.3 * Math.min(1, Math.abs(bend) / 0.9)).toFixed(3))
      // 翻动中整片纸朝读者微微抬起，避免「顶视压缩成一条」的扁平感
      leaf.style.transform = `rotateX(${(11 * Math.sin(Math.PI * raw)).toFixed(2)}deg)`

      // 右下角卷起：折角画在书叶的切片里，会跟着这一条纸一起转；
      // 纸转到 90° 后正（或背）面被 backface 隐藏，折角随之自然退场，不需要额外淡出
      if (dogs.length) {
        const grow = Math.min(1, Math.max(0, (raw - 0.02) / 0.22))
        const tail = Math.min(1, Math.max(0, (raw - 0.6) / 0.12))
        const s = Math.round(maxDog * grow * (1 - tail))
        const path = s > 3
          ? (flip.dir === 'prev'
            ? `path('M ${s} 0 L 0 0 Q ${Math.round(s * 0.18)} ${Math.round(s * 0.8)} ${s} ${s} Z')`
            : `path('M 0 0 L ${s} 0 Q ${Math.round(s * 0.8)} ${Math.round(s * 0.8)} 0 ${s} Z')`)
          : 'none'
        for (const dog of dogs) {
          dog.style.width = `${s}px`
          dog.style.height = `${s}px`
          dog.style.opacity = s > 3 ? '1' : '0'
          dog.style.clipPath = path
        }
      }
    }

    draw(0)
    const loop = (now: number) => {
      draw(now - start)
      if (now - start < FLIP_MS) raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [flip, layout.pageW, spreadMode])

  const goToPage = useCallback((pageIndex: number) => {
    // 跳页（目录/脚注/页码输入）不走 3D 翻页，并且要取消正在进行的翻页
    if (flipTimer.current) { window.clearTimeout(flipTimer.current); flipTimer.current = null }
    flippingRef.current = false
    setFlip(null)
    // 跳页时窗口会整体换一批页，位移动画必须关掉，否则会看到一长段滑行
    setBookInstant(true)
    window.setTimeout(() => setBookInstant(false), 90)
    setCurrentPage(clampStartPage(pageIndex, pages.length, spreadMode))
  }, [pages.length, spreadMode])

  const flipTo = useCallback((dir: FlipState['dir'], to: number) => {
    const from = currentPageRef.current
    if (flippingRef.current || to === from || to < 0 || to > maxStart) return
    setBackJump(null)
    // 系统开启「减少动态效果」时不做 3D 翻页，直接落页
    if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setBookInstant(true)
      setCurrentPage(to)
      window.setTimeout(() => setBookInstant(false), 90)
      return
    }
    flippingRef.current = true
    setFlip({ dir, from, to })
    if (flipTimer.current) window.clearTimeout(flipTimer.current)
    flipTimer.current = window.setTimeout(() => {
      flippingRef.current = false
      flipTimer.current = null
      setFlip(null)
      // 动画结束那一刻直接落定到目标跨页，不能再走 .reader-book 的位移动画（否则会二次滑动）
      setBookInstant(true)
      setCurrentPage(to)
      window.setTimeout(() => setBookInstant(false), 90)
    }, FLIP_MS + 20)
  }, [maxStart])

  const next = useCallback(() => {
    if (flippingRef.current) return
    flipTo('next', Math.min(maxStart, currentPageRef.current + step))
  }, [flipTo, maxStart, step])

  const prev = useCallback(() => {
    if (flippingRef.current) return
    flipTo('prev', Math.max(0, currentPageRef.current - step))
  }, [flipTo, step])

  useEffect(() => () => {
    if (flipTimer.current) window.clearTimeout(flipTimer.current)
  }, [])

  /* ---------------- 键盘 / 滚轮 ---------------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && /INPUT|TEXTAREA/.test(target.tagName)) {
        if (e.key === 'Escape') { setJumpOpen(false); setTocOpen(false); setThemeMenu(false); setFontMenu(false) }
        return
      }
      if (e.key === 'Escape') {
        if (themeMenu || fontMenu) { setThemeMenu(false); setFontMenu(false); return }
        if (tocOpen) { setTocOpen(false); return }
        if (jumpOpen) { setJumpOpen(false); return }
        onExit()
        return
      }
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); next(); return }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === 'Backspace') { e.preventDefault(); prev(); return }
      if (e.key === 'Home') { e.preventDefault(); goToPage(0); return }
      if (e.key === 'End') { e.preventDefault(); goToPage(Math.max(0, pages.length - 1)); return }
      if (e.key === 'f' || e.key === 'F') { e.preventDefault(); void toggleFullscreen(); return }
      if (e.key === 't' || e.key === 'T') { e.preventDefault(); setTocOpen((v) => !v); return }
      if (e.key === 'g' || e.key === 'G') { e.preventDefault(); openJump(); return }
      if (e.key === '+' || e.key === '=') { e.preventDefault(); setFontSize((s) => Math.min(36, s + 1)); return }
      if (e.key === '-' || e.key === '_') { e.preventDefault(); setFontSize((s) => Math.max(14, s - 1)); return }
      if (e.key === 'd' || e.key === 'D') { e.preventDefault(); setDark((v) => !v) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, prev, goToPage, pages.length, themeMenu, fontMenu, tocOpen, jumpOpen, onExit])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const onWheel = (e: WheelEvent) => {
      if (e.target instanceof Element && e.target.closest('.reader-hud, .reader-drawer')) return
      const now = Date.now()
      if (now < wheelCooldown.current) return
      if (Math.abs(e.deltaY) < 18 && Math.abs(e.deltaX) < 18) return
      e.preventDefault()
      wheelCooldown.current = now + 550
      if (e.deltaY > 0 || e.deltaX > 0) next()
      else prev()
    }
    stage.addEventListener('wheel', onWheel, { passive: false })
    return () => stage.removeEventListener('wheel', onWheel)
  }, [next, prev])

  /* ---------------- 链接 / 脚注跳转 ---------------- */

  const flashAfterJump = useCallback((id: string | null) => {
    if (!id) return
    setFlashId(id)
    window.setTimeout(() => setFlashId((cur) => (cur === id ? null : cur)), 1600)
  }, [])

  useEffect(() => {
    if (!flashId) return
    const el = rootRef.current?.querySelector<HTMLElement>(`[id="${CSS.escape(flashId)}"]`)
    el?.classList.add('reader-anchor-flash')
    const to = window.setTimeout(() => el?.classList.remove('reader-anchor-flash'), 1600)
    return () => { el?.classList.remove('reader-anchor-flash'); window.clearTimeout(to) }
  }, [flashId, currentPage, anchorTick])

  const onBookClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement | null
    const a = target?.closest('a')
    if (!a) return
    const href = a.getAttribute('href') || ''
    if (!href) return
    if (!href.startsWith('#')) {
      e.preventDefault()
      invokeTauri('open_url', { url: href }).catch(() => {})
      return
    }
    const id = href.slice(1)
    const page = anchorsRef.current[id]
    if (page == null) return
    e.preventDefault()
    e.stopPropagation()
    const isFootnote = /^fnref|^fn/.test(id) || a.closest('.footnotes') != null
    if (isFootnote) setBackJump({ page: currentPageRef.current, id: a.id || undefined })
    else setBackJump(null)
    setTocOpen(false)
    setJumpOpen(false)
    goToPage(page)
    flashAfterJump(id)
  }, [goToPage, flashAfterJump])

  const onStageClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement | null
    if (target?.closest('a,button,input,textarea,select,.reader-page-inner')) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = e.clientX - rect.left
    const edge = Math.max(40, rect.width * 0.07)
    if (x < edge) prev()
    else if (rect.width - x < edge) next()
  }, [next, prev])

  /* ---------------- 页码跳转 ---------------- */

  function openJump() {
    setJumpValue(String(currentPage + 1))
    setJumpOpen(true)
    setTocOpen(false)
  }

  const submitJump = () => {
    const n = Number.parseInt(jumpValue, 10)
    if (Number.isFinite(n)) { setBackJump(null); goToPage(n - 1) }
    setJumpOpen(false)
  }

  /* ---------------- HUD 内容 ---------------- */

  const fontStack = fontChoice === 'theme' ? 'var(--font-preview)' : FONT_STACK[fontChoice]
  const pageLabel = pages.length
    ? `${currentPage + 1}${spreadMode && currentPage + 1 < pages.length ? `–${Math.min(pages.length, currentPage + 2)}` : ''} / ${pages.length}`
    : '0 / 0'

  const bookOffset = currentPage * (layout.pageW + layout.gap)
  const viewportW = spreadMode ? layout.pageW * 2 + layout.gap : layout.pageW
  const leafStripW = layout.pageW / LEAF_STRIPS

  // 只渲染当前跨页前后的一小段页。长文档几百页全量挂进 DOM，光排版/绘制就要几百毫秒，
  // 而且翻页动画最多只用到 from-2 … from+3，窗口给到 ±10 足够。
  const windowStart = Math.max(0, currentPage - 6)
  const windowEnd = Math.min(pages.length, currentPage + 10)

  return (
    <div
      ref={rootRef}
      className={`yizi-reader theme-${theme}${dark ? ' dark' : ''}`}
      data-font={fontChoice}
      style={{
        '--reader-font': fontStack,
        '--reader-size': `${fontSize}px`,
        '--reader-line': String(lineHeight),
        '--reader-page-w': `${layout.pageW}px`,
        '--reader-page-h': `${layout.pageH}px`,
        '--reader-pad-x': `${layout.padX}px`,
        '--reader-pad-y': `${PAGE_PAD_Y}px`,
        '--reader-folio-h': `${FOLIO_H}px`,
        '--reader-gap': `${layout.gap}px`,
        '--reader-margin': `${layout.margin}px`,
      } as React.CSSProperties}
    >
      {/* 分页测量宿主：不可见，但必须挂在 DOM 里才能量字宽/行高 */}
      <div ref={measureRef} className="reader-measure" aria-hidden="true" />

      <div ref={stageRef} className="reader-stage" onClick={onStageClick}>
        <div className="reader-frame" style={{ inset: layout.margin }}>
          {pages.length > 0 && (
            <div className="reader-viewport" style={{ width: viewportW, height: layout.pageH }}>
              <div
                ref={bookRef}
                className={`reader-book${bookInstant ? ' is-instant' : ''}`}
                onClick={onBookClick}
                style={{
                  left: windowStart * (layout.pageW + layout.gap),
                  transform: `translateX(${-bookOffset}px)`,
                }}
              >
                {pages.slice(windowStart, windowEnd).map((html, i) => {
                  const index = windowStart + i
                  return (
                    <BookPage
                      key={index}
                      html={html}
                      index={index}
                      side={spreadMode ? (index % 2 === 0 ? 'left' : 'right') : 'single'}
                      front={index < frontKinds.length ? frontKinds[index] : ''}
                    />
                  )
                })}
              </div>

              {/* 3D 翻页：书叶绕中缝（或左侧书脊）弯折翻动，下面垫着下一页/上一页 */}
              {flip && flipFaces && leafHtml && (
                <div
                  ref={flipRef}
                  className={`reader-flip reader-flip-${flip.dir}${spreadMode ? '' : ' is-single'}`}
                  aria-hidden="true"
                >
                  {flipFaces.underLeft.index >= 0 && (
                    <div className="reader-flip-under reader-flip-under-left">
                      <BookPage {...flipFaces.underLeft} front={frontKinds[flipFaces.underLeft.index] || ''} />
                      <div className="reader-flip-cast" />
                    </div>
                  )}
                  {spreadMode && flipFaces.underRight.index >= 0 && (
                    <div className="reader-flip-under reader-flip-under-right">
                      <BookPage {...flipFaces.underRight} front={frontKinds[flipFaces.underRight.index] || ''} />
                      <div className="reader-flip-cast" />
                    </div>
                  )}

                  {/* 书叶由 LEAF_STRIPS 条竖向窄带拼成：每条带独立旋转，连起来就是一张弯折的纸 */}
                  <div className={`reader-leaf${flip.dir === 'prev' ? ' is-prev' : ''}`}>
                    {Array.from({ length: LEAF_STRIPS }, (_, i) => (
                      <div className="reader-leaf-strip" key={i} style={{ width: leafStripW + 1 }}>
                        <div className="reader-leaf-face reader-leaf-front">
                          <div className="reader-leaf-slice" style={{ width: layout.pageW, left: -i * leafStripW }}>
                            <BookPage
                              {...flipFaces.front}
                              html={leafHtml.front}
                              front={frontKinds[flipFaces.front.index] || ''}
                            />
                            <span className="reader-leaf-tone reader-leaf-tone-flat" />
                            <span className="reader-leaf-tone reader-leaf-tone-edge" />
                            {flip.dir === 'next' && i >= LEAF_STRIPS - 4 && <div className="reader-dogear" />}
                          </div>
                        </div>
                        <div className="reader-leaf-face reader-leaf-back">
                          {/* 背面是纸的另一面：同一张纸翻过去后，这一面要与落定后的左页/右页对齐 */}
                          <div
                            className="reader-leaf-slice"
                            style={{ width: layout.pageW, left: (i + 1) * leafStripW - layout.pageW }}
                          >
                            <BookPage
                              {...flipFaces.back}
                              html={leafHtml.back}
                              front={frontKinds[flipFaces.back.index] || ''}
                            />
                            <span className="reader-leaf-tone reader-leaf-tone-flat" />
                            <span className="reader-leaf-tone reader-leaf-tone-edge" />
                            {flip.dir === 'prev' && i < 4 && <div className="reader-dogear" />}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {loading && (
            <div className="reader-loading">
              {t('reader.loading')}
              {loadProgress > 0.01 ? ` ${Math.min(99, Math.round(loadProgress * 100))}%` : ''}
            </div>
          )}
          {!loading && pages.length === 0 && (
            <div className="reader-empty">{t('reader.empty')}</div>
          )}
        </div>
      </div>

      {/* 书名：左上角（与演示模式一致） */}
      <div className="reader-topbar">
        <div className="reader-topbar-title">
          <BookOpen size={14} />
          <span>{bookTitle}</span>
        </div>
      </div>

      {/* 章名 + 页码：左下角；进度条贴底（与演示模式一致） */}
      <div className="reader-footer">
        {currentToc && <span className="reader-chapter">{currentToc.title}</span>}
        <button className="reader-page-pill" onClick={openJump} title={t('reader.goto')}>
          {pageLabel}
        </button>
      </div>
      <div className="reader-progress-bar">
        <span style={{ width: `${pages.length ? ((currentPage + 1) / pages.length) * 100 : 0}%` }} />
      </div>

      {backJump && (
        <button
          className="reader-backref"
          onClick={() => {
            goToPage(backJump.page)
            flashAfterJump(backJump.id || null)
            setBackJump(null)
          }}
        >
          ↩ {t('reader.backRef')}
        </button>
      )}

      {/* HUD */}
      <div className="reader-hud">
        <button className="reader-icon-btn" title={t('reader.toc')} onClick={() => { setTocOpen((v) => !v); setThemeMenu(false); setFontMenu(false) }}>
          <List size={15} />
        </button>
        <button className="reader-icon-btn" title={t('reader.goto')} onClick={openJump}>
          <BookOpen size={15} />
        </button>
        <button className="reader-icon-btn" title={dark ? t('slideshow.toLight') : t('slideshow.toDark')} onClick={() => setDark((v) => !v)}>
          {dark ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        <button className="reader-icon-btn" title={t('slideshow.toggleTheme')} onClick={() => { setThemeMenu((v) => !v); setFontMenu(false) }}>
          <Palette size={15} />
        </button>
        <button className="reader-icon-btn" title={t('reader.typography')} onClick={() => { setFontMenu((v) => !v); setThemeMenu(false) }}>
          <Type size={15} />
        </button>
        <button className="reader-icon-btn" title={t('slideshow.exit')} onClick={onExit}>
          <X size={15} />
        </button>
      </div>

      {/* 主题菜单 */}
      {themeMenu && (
        <>
          <div className="reader-dismiss" onClick={() => setThemeMenu(false)} />
          <div className="reader-menu reader-menu--theme">
            {themes.map((file) => {
              const id = file.replace(/\.css$/, '')
              const active = id === theme
              return (
                <button
                  key={id}
                  className={active ? 'is-active' : ''}
                  onClick={() => { setTheme(id); setThemeMenu(false) }}
                >
                  {active && <Check size={13} />}
                  {themeMeta[id] || id}
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* 排版菜单 */}
      {fontMenu && (
        <>
          <div className="reader-dismiss" onClick={() => setFontMenu(false)} />
          <div className="reader-menu reader-menu--typo">
            <div className="reader-menu-title">{t('slideshow.fontFamily')}</div>
            {FONT_CHOICES.map((choice) => (
              <button
                key={choice}
                className={fontChoice === choice ? 'is-active' : ''}
                onClick={() => setFontChoice(choice)}
              >
                {fontChoice === choice && <Check size={13} />}
                {t(FONT_LABEL_KEY[choice])}
              </button>
            ))}
            <div className="reader-menu-sep" />
            <div className="reader-menu-row">
              <span>{t('reader.fontSize')} · {fontSize}px</span>
              <div className="reader-stepper">
                <button onClick={() => setFontSize((s) => Math.max(14, s - 1))}><Minus size={12} /></button>
                <button onClick={() => setFontSize((s) => Math.min(36, s + 1))}><Plus size={12} /></button>
              </div>
            </div>
            <div className="reader-menu-row">
              <span>{t('reader.lineHeight')}</span>
              <div className="reader-segmented">
                {[1.6, 1.9, 2.2].map((lh) => (
                  <button
                    key={lh}
                    className={Math.abs(lineHeight - lh) < 0.05 ? 'is-active' : ''}
                    onClick={() => setLineHeight(lh)}
                  >
                    {lh === 1.6 ? t('reader.lineCompact') : lh === 1.9 ? t('reader.lineNormal') : t('reader.lineLoose')}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* 目录抽屉 */}
      {tocOpen && (
        <>
          <div className="reader-dismiss" onClick={() => setTocOpen(false)} />
          <aside className="reader-drawer">
            <div className="reader-drawer-head">
              <span>{t('reader.toc')}</span>
              <button className="reader-icon-btn" onClick={() => setTocOpen(false)}><X size={15} /></button>
            </div>
            <div className="reader-toc-list">
              {toc.length === 0 && <div className="reader-toc-empty">{t('reader.tocEmpty')}</div>}
              {toc.map((item) => (
                <button
                  key={item.id}
                  className={`reader-toc-item level-${item.level}${currentToc?.id === item.id ? ' is-current' : ''}`}
                  onClick={() => { setTocOpen(false); setBackJump(null); goToPage(item.page); flashAfterJump(item.id) }}
                >
                  <span className="reader-toc-text">{item.title}</span>
                  <span className="reader-toc-page">{item.page + 1}</span>
                </button>
              ))}
            </div>
            <div className="reader-drawer-foot">
              <button className="reader-jump-btn" onClick={openJump}>{t('reader.goto')}</button>
            </div>
          </aside>
        </>
      )}

      {/* 页码跳转 */}
      {jumpOpen && (
        <>
          <div className="reader-dismiss" onClick={() => setJumpOpen(false)} />
          <div className="reader-jump">
            <div className="reader-jump-title">{t('reader.goto')}</div>
            <input
              autoFocus
              type="number"
              min={1}
              max={Math.max(1, pages.length)}
              value={jumpValue}
              onChange={(e) => setJumpValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); submitJump() }
                if (e.key === 'Escape') { e.preventDefault(); setJumpOpen(false) }
              }}
            />
            <div className="reader-jump-hint">{t('reader.gotoHint', { total: pages.length })}</div>
            <button className="reader-jump-ok" onClick={submitJump}>{t('reader.gotoConfirm')}</button>
          </div>
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */

function clampStartPage(page: number, total: number, spread: boolean): number {
  if (total <= 0) return 0
  const maxStart = Math.max(0, total - 1)
  let p = Math.max(0, Math.min(page, maxStart))
  // 双页模式：落点对齐到对开左页；但最后一页（奇数页数）允许单独显示
  if (spread && p % 2 === 1 && p !== maxStart) p -= 1
  return p
}

function readStored(key: string): StoredPosition | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredPosition
    if (!Number.isFinite(parsed.page)) return null
    return parsed
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ */
/*  封面 / 扉页 / 目录页                                               */
/* ------------------------------------------------------------------ */

function firstAtxHeading(body: string): { index: number; length: number; text: string } | null {
  const m = /^#\s+(.+?)\s*#*\s*$/m.exec(body)
  if (!m) return null
  if (body.slice(0, m.index).trim()) return null
  return { index: m.index, length: m[0].length, text: m[1] }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function buildCoverPage(title: string, meta: Record<string, string>): string {
  const subtitle = (meta.subtitle || meta.description || '').trim()
  const author = (meta.author || '').trim()
  const date = (meta.date || '').trim()
  const metaLine = [author, date].filter(Boolean).map(escapeHtml).join(' · ')
  return `<div class="reader-cover-page">
    ${subtitle ? `<div class="reader-cover-subtitle">${escapeHtml(subtitle)}</div>` : ''}
    <div class="reader-cover-title">${escapeHtml(title)}</div>
    <div class="reader-cover-rule"></div>
    ${metaLine ? `<div class="reader-cover-meta">${metaLine}</div>` : ''}
  </div>`
}

function buildTitlePage(title: string, meta: Record<string, string>): string {
  const subtitle = (meta.subtitle || meta.description || '').trim()
  const author = (meta.author || '').trim()
  const date = (meta.date || '').trim()
  const metaLine = [author, date].filter(Boolean).map(escapeHtml).join(' · ')
  return `<div class="reader-title-page">
    <div class="reader-title-page-title">${escapeHtml(title)}</div>
    ${subtitle ? `<div class="reader-title-page-subtitle">${escapeHtml(subtitle)}</div>` : ''}
    <div class="reader-title-page-rule"></div>
    ${metaLine ? `<div class="reader-title-page-meta">${metaLine}</div>` : ''}
  </div>`
}

function buildTocPage(
  items: Array<ReaderOutlineEntry & { page: number }>,
  label: string,
  continued: boolean,
): string {
  return `<div class="reader-toc-sheet">
    ${continued ? '' : `<div class="reader-toc-kicker">${escapeHtml(label)}</div>`}
    <div class="reader-toc-page-list">
      ${items.map((item) => `<div class="reader-toc-line level-${item.level}">
        <span class="reader-toc-line-text">${escapeHtml(item.title)}</span>
        <span class="reader-toc-line-dots"></span>
        <span class="reader-toc-line-page">${item.page + 1}</span>
      </div>`).join('')}
    </div>
  </div>`
}

async function resolveLocalImages(root: HTMLElement, filePath?: string | null): Promise<void> {
  let baseDir: string | null = null
  if (filePath) {
    const sep = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'))
    baseDir = sep > 0 ? filePath.slice(0, sep) : null
  }
  const imgs = Array.from(root.querySelectorAll('img'))
  await Promise.all(imgs.map(async (img) => {
    const src = img.getAttribute('src') || ''
    if (!src) return
    if (!/^(https?:|data:|blob:)/i.test(src)) {
      const resolved = await resolveLocalImageSrc(src, baseDir).catch(() => null)
      if (resolved) {
        const data = await invokeTauri<string>('read_image_base64', { path: resolved }).catch(() => null)
        if (data) img.src = data
      }
    }
    try { await img.decode?.() } catch { /* ignore */ }
  }))
}
