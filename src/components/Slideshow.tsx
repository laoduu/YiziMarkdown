import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import { Sun, Moon, Palette, Check, X, ListOrdered, List, Sparkles, Type, FileDown } from 'lucide-react'
import { extendMarkdownIt, postRender as pluginPostRender } from '../plugins/registry'
import {
  parseDeck, buildDeckTocHtml, buildSlideHtml, deckChapters,
  scopeThemeVars, type DeckSlide,
} from '../lib/slideDeck'
import { orderThemes } from '../lib/themeOrder'
import { loadThemeCatalog } from '../lib/themeCatalog'
import { enterFullscreen, exitFullscreen, toggleFullscreen } from '../lib/fullscreen'
import { resolveLocalImageSrc } from '../lib/localImages'
import { buildTiles, delayFor, impulseVars, tileTotalDuration, tileConfigFor, TILE_ANIM_IDS, TILE_VARIANTS, type SlideAnim } from '../lib/slideTiles'
import {
  SLIDE_FONT_WEIGHTS, SLIDE_FONT_SCALE, SLIDE_FILL,
  DEFAULT_SLIDE_TYPOGRAPHY, slideTypographyVars, type SlideFontId,
} from '../lib/slideTypography'
import {
  DEFAULT_SLIDE_COL_ALIGN, DEFAULT_SLIDE_COL_STYLE,
  resolveColAlign, colAlignClass, colStyleClass,
} from '../lib/slideColumns'
import { useEditorStore } from '../stores/editorStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useI18n } from '../i18n'
import { CUSTOM_THEME, readUserCss } from '../lib/themeLoader'
import { normalizeUserCss } from '../lib/userCss'
import '../styles/slideshow.css'

interface SlideshowProps {
  content: string
  title?: string
  enabledPlugins: string[]
  pluginConfigs: Record<string, Record<string, unknown>>
  currentTheme: string
  isDark: boolean
  onExit: () => void
  /** 演示 HUD 的「导出 PPTX」：由 App 注入（导出逻辑在 lib/pptxExport.ts）。
   *  传入当前页 + **演示内实际生效**的主题/明暗（HUD 可临时切换，可能与应用设置不同）。 */
  onExportPptx?: (slideIndex: number, theme: string, dark: boolean) => void
  /** 打开时直接定位到某页（工具栏「先看演示效果」/ 告警跳页用；0-based） */
  initialSlide?: number
  /** 演示已打开时外部请求翻页：每次 `token` 变化即按 `index` 跳页。
   *  用 token 而不是只给 index —— 连续两次点同一告警页码也要真的跳一次。 */
  jumpRequest?: { index: number; token: number }
  /** 有模态弹窗盖在上面（如 PPTX 导出）：暂停键盘/滚轮翻页，避免误操作演示。
   *  只挂起**演示自己的**快捷键；弹窗内的输入框与按钮照常工作。 */
  interactionSuspended?: boolean
}

/** 页面元素的状态类：瓷砖转场克隆整页时必须滤掉，否则克隆会命中
 *  ys-past/ys-future（opacity:0 + hidden）或 ys-leaving 等状态规则而变空。 */
const SLIDE_STATE_CLASSES = new Set(['ys-active', 'ys-past', 'ys-future', 'ys-leaving'])

/** 片段 = 顶层列表的直接子 li。分栏页多包一层 .ys-cols > .ys-col，
 *  同一条选择器在两处使用（打标记 / HUD 开关即时生效），写成常量防止漏改。 */
const FRAGMENT_ITEM_SELECTOR = [
  ':scope > ul > li', ':scope > ol > li',
  ':scope > .ys-cols > .ys-col > ul > li', ':scope > .ys-cols > .ys-col > ol > li',
].join(', ')

/** 按 S 时本页无备注 ⇒ 提示停留时长（毫秒）。够看清即可，不必等人点掉 */
const NOTES_HINT_MS = 2200

export default function Slideshow({
  content,
  title,
  enabledPlugins,
  pluginConfigs,
  currentTheme,
  isDark,
  onExit,
  onExportPptx,
  initialSlide,
  jumpRequest,
  interactionSuspended,
}: SlideshowProps) {
  const { t } = useI18n()
  // 当前文档所在目录：相对路径图片按它解析（云端文档解析到本地镜像）
  const docBaseDir = useEditorStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId)
    if (!tab?.filePath) return null
    const sep = Math.max(tab.filePath.lastIndexOf('\\'), tab.filePath.lastIndexOf('/'))
    return sep > 0 ? tab.filePath.substring(0, sep) : null
  })
  const [h, setH] = useState(() => Math.max(0, initialSlide ?? 0))
  const [showHelp, setShowHelp] = useState(false)
  // 提词备注：**与幻灯片同屏显示**（不像 PPT 有副屏演示者视图），单屏投影时观众必然看得到。
  // 因此默认收在屏幕左缘外，鼠标移到左缘热区（.ys-notes-edge）才滑出；notesPinned = 按 S 锁定常显。
  const [notesPinned, setNotesPinned] = useState(false)
  // 按 S 时当前页没有备注 ⇒ 短暂提示一下。
  // 为什么需要：HUD 的「备注」按钮是 `cur?.notes &&` 才渲染的，无备注时按钮不出现、
  // 按 S 又毫无反应 —— 用户据此以为「没有演讲者备注这个功能」（实际反馈过）。
  const [notesHint, setNotesHint] = useState(false)
  const notesHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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
  // 「自定义主题」= 基底主题 + user.css（见 lib/themeLoader.ts）；user.css 非空时菜单里才有它
  const customCssBase = useSettingsStore((s) => s.customCssBase)
  const [hasUserCss, setHasUserCss] = useState(false)
  const deckRef = useRef<HTMLDivElement>(null)

  // 退出相关
  const exitingRef = useRef(false)
  const toggleIntentRef = useRef(false)
  const hadFullscreenRef = useRef(false)

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
  // 注意：slideMetaRef 在 parsed 之后同步填充，保证 getSlideHtml 首次渲染封面页时 meta 已就绪。
  // deck 级片段开关初始值（front matter slideshow-fragments: on → 初始开启），
  // 默认关闭：列表整页显示，避免目录等内容被迫逐条点击；需要时用户在 HUD 打开
  // 或 front matter 显式声明。HUD 按钮可在播放中随时切换（仅本次播放生效，同主题/明暗）
  /** 演示标题 / 页列表：统一由 lib/slideDeck.ts 解析（与 PPTX 导出同源） */
  const parsed = useMemo(() => parseDeck(content, title), [content, title])
  const slides: DeckSlide[] = parsed.slides
  const docTitle = parsed.docTitle
  const slideMetaRef = useRef<{ author?: string; date?: string }>({})
  slideMetaRef.current = parsed.meta

  const deckFragmentsInitial = parsed.fragmentsOn
  const [fragmentsOn, setFragmentsOn] = useState(deckFragmentsInitial)
  // 切换动画变体：柔和型 slide（默认，水平滑动）/ fade（溶解淡入）/ zoom（缩放）/ none（无）
  //            强烈型 dissolve（像素溶解）/ blinds（百叶窗）/ checkerboard（棋盘）/ cube（立方体）
  // 切换动画：持久化在 settingsStore（zustand persist → localStorage），
  // 下次进入演示模式沿用上次的选择；类挂在 .ys-deck 上（ys-anim-*）
  const anim = useSettingsStore((s) => s.slideAnim)
  const setSlideSetting = useSettingsStore((s) => s.setField)
  const [animMenuOpen, setAnimMenuOpen] = useState(false)
  const [tocOpen, setTocOpen] = useState(false)
  const [slideJumpValue, setSlideJumpValue] = useState('')

  // 演示排版旋钮（字体 / 字重 / 字号 / 页边距）：与 slideAnim 一样持久化在 settingsStore，
  // 值 → CSS 变量的映射在 lib/slideTypography.ts（纯函数，见 tests/slideTypography.test.ts）。
  // 变量写成 .yizi-slideshow 根节点的**行内变量**（而非 documentElement）：作用域限定在
  // 演示子树、退出演示自动失效、不污染预览/编辑器。
  const [typeMenuOpen, setTypeMenuOpen] = useState(false)
  const slideFontFamily = useSettingsStore((s) => s.slideFontFamily)
  const slideFontWeight = useSettingsStore((s) => s.slideFontWeight)
  const slideFontScale = useSettingsStore((s) => s.slideFontScale)
  const slideFillWidth = useSettingsStore((s) => s.slideFillWidth)
  const slideFillHeight = useSettingsStore((s) => s.slideFillHeight)
  const typographyVars = slideTypographyVars({
    fontFamily: slideFontFamily,
    fontWeight: slideFontWeight,
    fontScale: slideFontScale,
    fillWidth: slideFillWidth,
    fillHeight: slideFillHeight,
  })

  // 分栏旋钮（v0.3.4）：栏内对齐 / 分栏样式，与排版旋钮同源（settingsStore 持久化）。
  // slideColAlign 是 HUD **全局默认**：与页级 <!-- align: xxx --> 的合成发生在渲染处
  // （resolveColAlign，页级优先），CSS 只认合成后的 ys-col-align-* 一个来源。
  const slideColAlign = useSettingsStore((s) => s.slideColAlign)
  const slideColStyle = useSettingsStore((s) => s.slideColStyle)
  // 分栏样式作用于**整副演示**（所有页同时生效）⇒ 挂在根节点；默认 card，
  // 仅用户显式选「无」时为空串（不产出 class）
  const colStyleCls = colStyleClass(slideColStyle)

  /**
   * 整册目录：演示文稿按页独立渲染，`[toc]` 不能只统计当前页。
   * 条目 = 有标题的页（排除封面/结尾页和目录页自身），点击翻到对应页。
   */
  const deckTocHtml = useMemo(() => buildDeckTocHtml(slides), [slides])

  // 惰性 HTML 渲染缓存：仅渲染窗口内的页面；content 变化时随 slides 重建清空
  const htmlCacheRef = useRef(new Map<number, string>())
  useEffect(() => { htmlCacheRef.current.clear() }, [slides])

  /** 取页面 HTML：命中缓存直接返回，否则渲染并缓存 */
  const getSlideHtml = useCallback((slide: DeckSlide, index: number): string => {
    const cache = htmlCacheRef.current
    let html = cache.get(index)
    if (html === undefined) {
      html = buildSlideHtml(slide, {
        pluginExtenders,
        deckTocHtml,
        meta: slideMetaRef.current,
      })
      cache.set(index, html)
    }
    return html
  }, [pluginExtenders, deckTocHtml])

  const total = slides.length
  const cur = slides[h]

  // 章节标记：封面/章节页的标题作为其后续页的章节名，供页脚展示；章节页带序号
  const chapters = useMemo(() => deckChapters(slides, docTitle), [slides, docTitle])
  const chapter = chapters[h]?.chapter ?? docTitle
  const sectionNums = useMemo(() => chapters.map((c) => c.num), [chapters])

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

  // 进入新页时回到顶部。长页在离开后仍保留自己的 scrollTop（再次进入会停在
  // 上次的中段/底部），而且相邻页常驻窗口时 DOM 不会重建、scrollTop 不会自然清零。
  // 默认从顶部开始；页内滚动仍由下面的 wheel 处理器接管（先滚内容，触底后再翻页）。
  useLayoutEffect(() => {
    const active = deckRef.current?.querySelector<HTMLElement>('.ys-slide.ys-active')
    if (active) active.scrollTop = 0
  }, [h])

  // slides 变短（文档被替换/清空）时把当前页夹回范围内：h 是索引，越界会让 cur 变 undefined
  useEffect(() => {
    if (h < slides.length) return
    setH(Math.max(0, slides.length - 1))
  }, [h, slides.length])

  // 外部请求翻页（PPTX 导出告警里的页码）。只在 token 变化时执行：
  // 直接依赖 index 会在父组件重渲染时重复触发，而同一页连续点两次也应各跳一次。
  const jumpTokenRef = useRef(-1)
  useEffect(() => {
    if (!jumpRequest || jumpRequest.token === jumpTokenRef.current) return
    jumpTokenRef.current = jumpRequest.token
    if (!slides.length) return
    goTo(Math.max(0, Math.min(slides.length - 1, jumpRequest.index)))
  }, [jumpRequest, slides.length, goTo])

  // 整册目录里的条目带 data-slide：点击翻到对应页（演示文稿没有跨页锚点）
  const onDeckClick = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement | null)?.closest('a[data-slide]')
    if (!a) return
    const idx = Number(a.getAttribute('data-slide'))
    if (!Number.isInteger(idx)) return
    e.preventDefault()
    e.stopPropagation()
    goTo(idx)
  }, [goTo])

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

  // 统一退出：退出全屏后关闭演示，回到打开前的编辑视图。
  // 窗口状态还原（最大化/原生全屏）由 windowStateStore 的转移钩子消费共享快照完成
  // （enterFullscreen 内部已拍快照），这里不再自管 savedWindowState。
  const requestExit = useCallback(async () => {
    if (exitingRef.current) return
    exitingRef.current = true
    await exitFullscreen()
    onExit()
  }, [onExit])

  const onKey = useCallback((e: KeyboardEvent) => {
    // 弹窗（如 PPTX 导出）盖在演示上时，演示快捷键整体让位：
    // 否则 Esc 会连弹窗带演示一起退出、方向键会翻页。弹窗自己处理自己的键。
    if (interactionSuspended) return
    const k = e.key
    // 排版面板里的 select / 滑杆需要方向键（改值），不能被翻页快捷键抢走；
    // 但 Escape 必须放行 —— 关闭浮层是演示模式的强预期（见下面的分支）。
    const el = e.target as HTMLElement | null
    const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA')
    if (typing && k !== 'Escape') return
    if (k === 't' || k === 'T') { e.preventDefault(); setTocOpen((v) => !v); return }
    if (k === 'g' || k === 'G') { e.preventDefault(); setTocOpen(true); return }
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
    if (k === 's' || k === 'S') {
      e.preventDefault()
      if (cur?.notes) { setNotesPinned((x) => !x); return }
      // 本页无备注：提示一下，别让按键石沉大海（见 notesHint 的注释）
      setNotesHint(true)
      if (notesHintTimerRef.current) clearTimeout(notesHintTimerRef.current)
      notesHintTimerRef.current = setTimeout(() => setNotesHint(false), NOTES_HINT_MS)
      return
    }
    if (k === '?') { e.preventDefault(); setShowHelp((x) => !x); return }
    if (k === 'Escape') {
      if (tocOpen) { setTocOpen(false); return }
      if (typeMenuOpen) { setTypeMenuOpen(false); return }
      if (animMenuOpen) { setAnimMenuOpen(false); return }
      if (themeMenuOpen) { setThemeMenuOpen(false); return }
      if (showHelp) { setShowHelp(false); return }
      if (notesPinned) { setNotesPinned(false); return }   // 先收起锁定的备注，再退出
      requestExit()
    }
  }, [next, prev, slides.length, requestExit, showHelp, REVEAL_ALL, goTo, typeMenuOpen, animMenuOpen, themeMenuOpen, cur, notesPinned, interactionSuspended, tocOpen])

  useEffect(() => {
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onKey])

  // 鼠标滚轮：内容可滚动时先滚内容，滚到上/下边界再翻页；翻页后短暂锁定防惯性连翻
  const wheelLockRef = useRef(false)
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      // 模态弹窗打开时滚轮只作用于弹窗（否则在弹窗里滚动会翻演示的页）
      if (interactionSuspended) return
      // 鼠标在浮层/面板上滚轮：不翻页（否则拖滑杆/翻主题列表时页面会乱翻）
      const tgt = e.target
      if (tgt instanceof Element && tgt.closest('.ys-hud-panel, .ys-theme-menu')) return
      if (Math.abs(e.deltaY) < 8) return
      const deck = deckRef.current
      const active = deck?.querySelector<HTMLElement>('.ys-slide.ys-active')
      if (!active) return
      // ⚠️ 内边距也计入 scrollHeight：HUD「内容填充高度」会把上下内边距做得很大
      // （如 50% ⇒ 上下各 25vh）。此时即使内容已完整显示，scrollHeight 仍比
      // clientHeight 大，于是 canScroll 为真、atBottom 为假 ⇒ 滚轮只滚那段
      // **空白内边距**而不翻页。所以滚动到底要按「内容底部对齐视口底部」判断：
      // 扣掉底部内边距才是真实可滚动量（多出的那段只通向空白）。
      const padBottom = parseFloat(getComputedStyle(active).paddingBottom) || 0
      const maxScroll = Math.max(0, active.scrollHeight - padBottom - active.clientHeight)
      const canScroll = maxScroll > 4
      const atTop = active.scrollTop <= 4
      const atBottom = active.scrollTop >= maxScroll - 4
      if (e.deltaY > 0) {
        // 向下：内容未滚到底 → 滚动内容；到底 → 下一页
        if (canScroll && !atBottom) {
          e.preventDefault()
          // 夹到 maxScroll：不越过「内容底部对齐视口底部」那条线，避免滚进空白内边距
          active.scrollBy(0, Math.min(e.deltaY, maxScroll - active.scrollTop))
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
  }, [next, prev, interactionSuspended])

  // 进入时尝试全屏；卸载时退出全屏
  // enterFullscreen() 内建：进入前把窗口状态拍进 windowStateStore 快照（退出后统一还原），
  // 且先取消最大化再进全屏（HTML5 fullscreen 从最大化窗口触发只能小窗全屏）
  useEffect(() => {
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
    // 主题列表来自 Rust 合并目录（内置清单 + 用户层），不再读 theme.json
    loadThemeCatalog().then((catalog) => {
      if (!catalog.themes.length) return
      setThemes(orderThemes(catalog.themes.map((entry) => `${entry.id}.css`)))
      const meta: Record<string, { name: string }> = {}
      for (const entry of catalog.themes) meta[entry.id] = { name: entry.name }
      setThemeMeta(meta)
    }).catch(() => {})
    readUserCss().then((c) => setHasUserCss(!!c.trim())).catch(() => {})
  }, [])

  // 主题继承：只取主题 CSS 的 :root.theme-* 变量定义块，改写为
  // .yizi-slideshow.theme-*，使配色变量（含 --editor-h1/h2/h3）作用到幻灯片根节点
  // （保留 .dark 变体以使用暗色方案）。
  // 丢弃所有元素规则（.theme-x h1 / .editor-content.theme-x 等），因为部分主题用
  // 未加作用域的选择器（如 .theme-lychee h1）会漏进幻灯片覆盖版式字号/对齐；
  // 幻灯片的字号/对齐/居中一律由 slideshow.css 控制，配色仅通过 CSS 变量继承。
  // 「自定义主题」= 基底主题 + user.css：基底变量块 + user.css 的变量块（归一到 custom）。
  useEffect(() => {
    const tauri = (window as any).__TAURI_INTERNALS__
    if (!tauri?.invoke) return
    const isCustom = theme === CUSTOM_THEME
    const baseName = isCustom ? (customCssBase || 'liquidglass-prism') : theme
    tauri.invoke('read_theme_css', { name: `${baseName}.css` }).then(async (themeCss: string) => {
      if (!themeCss) return
      // user.css 的变量块（:root / :root.theme-*）也要进幻灯片 —— 它定义的变量
      // 会覆盖基底主题的；元素规则照旧丢弃（幻灯片版式由 slideshow.css 全权控制）
      const rawUser = isCustom ? await readUserCss().catch(() => '') : ''
      const userRaw = rawUser ? normalizeUserCss(rawUser, CUSTOM_THEME) : ''
      const vars = scopeThemeVars(themeCss, userRaw, theme)
      let el = document.getElementById('yizimarkdown-slideshow-theme-css')
      if (!el) { el = document.createElement('style'); el.id = 'yizimarkdown-slideshow-theme-css'; document.head.appendChild(el) }
      el.textContent = vars
    }).catch(() => {})
  }, [theme, customCssBase])

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

  // 卸载时清理 leaving / flip / 备注提示定时器
  useEffect(() => () => {
    if (leavingTimerRef.current) clearTimeout(leavingTimerRef.current)
    if (flipTimerRef.current) clearTimeout(flipTimerRef.current)
    if (notesHintTimerRef.current) clearTimeout(notesHintTimerRef.current)
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
      section.querySelectorAll<HTMLElement>(FRAGMENT_ITEM_SELECTOR).forEach((li) => {
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
      active.querySelectorAll<HTMLElement>(FRAGMENT_ITEM_SELECTOR).forEach((li) => {
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
    <div className={`yizi-slideshow theme-${theme}${dark ? ' dark' : ''}${colStyleCls ? ` ${colStyleCls}` : ''}`} style={typographyVars as CSSProperties}>
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

      <div className={`ys-deck ys-dir-${dir}${anim !== 'slide' ? ` ys-anim-${anim}` : ''}${isMac ? ' ys-mac' : ''}`} ref={deckRef} onClick={onDeckClick}>
        {slides.map((slide, i) => {
          const active = i === h
          const past = i < h
          const classes = ['ys-slide', `ys-layout-${slide.kind}`]
          if (slide.columns) {
            classes.push('ys-has-cols')
            // 栏内对齐：页级 <!-- align: xxx --> 覆盖 HUD 全局默认（resolveColAlign 合成，
            // 合成后只剩一个来源 ⇒ CSS 只认 ys-col-align-*）。左对齐也照发 class：
            // 它没有对应规则（默认零变化），但保持三值对称，选择器可 grep、后续可扩展。
            classes.push(colAlignClass(resolveColAlign(slideColAlign, slide.align)))
          }
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
          <button className="ys-hud-btn" onClick={(e) => { e.currentTarget.blur(); setNotesPinned((x) => !x) }}>{t('slideshow.notes')}</button>
        )}
        <div className="ys-hud-ctrl">
          <button
            className="ys-icon-btn"
            title={t('reader.toc')}
            onClick={(e) => { e.currentTarget.blur(); setTocOpen((v) => !v); setThemeMenuOpen(false); setAnimMenuOpen(false); setTypeMenuOpen(false) }}
          >
            <List size={14} />
          </button>
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
          <button
            className="ys-icon-btn"
            title={t('slideshow.toggleTypography')}
            onClick={(e) => { e.currentTarget.blur(); setTypeMenuOpen((o) => !o) }}
          >
            <Type size={14} />
          </button>
          {onExportPptx && (
            <button
              className="ys-icon-btn"
              title={t('slideshow.exportPptx')}
              onClick={(e) => {
                e.currentTarget.blur()
                setThemeMenuOpen(false)
                setAnimMenuOpen(false)
                setTypeMenuOpen(false)
                onExportPptx(h, theme, dark)
              }}
            >
              <FileDown size={14} />
            </button>
          )}
        </div>
        <span className="ys-hint">{t('slideshow.hintBar')}</span>
      </div>

      {/* 目录 / 跳页抽屉（T 打开；点击条目跳转） */}
      {tocOpen && (
        <>
          <div className="ys-dismiss" onClick={() => setTocOpen(false)} />
          <aside className="ys-drawer">
            <div className="ys-drawer-head">
              <span>{t('reader.toc')}</span>
              <button className="ys-icon-btn" onClick={() => setTocOpen(false)}><X size={14} /></button>
            </div>
            <div className="ys-drawer-list">
              {slides.map((s, i) => (
                <button
                  key={i}
                  className={`ys-drawer-item${i === h ? ' is-current' : ''}`}
                  onClick={() => { setTocOpen(false); sessionStorage.setItem(REVEAL_ALL, '1'); goTo(i) }}
                >
                  <span className="ys-drawer-num">{i + 1}</span>
                  <span className="ys-drawer-title">{s.title || `— ${i + 1} —`}</span>
                </button>
              ))}
            </div>
            <div className="ys-drawer-foot">
              <input
                type="number"
                min={1}
                max={slides.length}
                placeholder={t('reader.gotoHint', { total: slides.length })}
                value={slideJumpValue}
                onChange={(e) => setSlideJumpValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    const n = Number.parseInt(slideJumpValue, 10)
                    if (Number.isFinite(n)) {
                      sessionStorage.setItem(REVEAL_ALL, '1')
                      goTo(Math.max(0, Math.min(slides.length - 1, n - 1)))
                      setTocOpen(false)
                    }
                  }
                }}
              />
              <button
                onClick={() => {
                  const n = Number.parseInt(slideJumpValue, 10)
                  if (Number.isFinite(n)) {
                    sessionStorage.setItem(REVEAL_ALL, '1')
                    goTo(Math.max(0, Math.min(slides.length - 1, n - 1)))
                    setTocOpen(false)
                  }
                }}
              >
                {t('reader.gotoConfirm')}
              </button>
            </div>
          </aside>
        </>
      )}

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
                onClick={() => { setSlideSetting('slideAnim', id); setAnimMenuOpen(false) }}
              >
                {anim === id && <Check size={13} />}
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* 演示排版菜单：字体 / 字重 / 字号 / 页边距（持久化，下次进入演示沿用） */}
      {typeMenuOpen && (
        <>
          <div className="ys-dismiss" onClick={() => setTypeMenuOpen(false)} />
          <div className="ys-hud-panel">
            <div className="ys-hud-panel-title">{t('slideshow.typographyTitle')}</div>

            <label className="ys-hud-row">
              <span>{t('slideshow.fontFamily')}</span>
              <select
                className="ys-hud-select"
                value={slideFontFamily}
                onChange={(e) => setSlideSetting('slideFontFamily', e.target.value as SlideFontId)}
              >
                <option value="default">{t('slideshow.fontDefault')}</option>
                <option value="sans">{t('slideshow.fontSans')}</option>
                <option value="serif">{t('slideshow.fontSerif')}</option>
                <option value="mono">{t('slideshow.fontMono')}</option>
              </select>
            </label>

            <div className="ys-hud-row">
              <span>{t('slideshow.fontWeight')}</span>
              <div className="ys-hud-seg">
                {SLIDE_FONT_WEIGHTS.map((w) => (
                  <button
                    key={w}
                    className={slideFontWeight === w ? 'ys-hud-seg-btn ys-active' : 'ys-hud-seg-btn'}
                    onClick={(e) => { e.currentTarget.blur(); setSlideSetting('slideFontWeight', w) }}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>

            <label className="ys-hud-row ys-hud-row-col">
              <span>{t('slideshow.fontSize', { n: Math.round(slideFontScale * 100) })}</span>
              <input
                type="range" className="settings-range ys-hud-range"
                min={SLIDE_FONT_SCALE.min} max={SLIDE_FONT_SCALE.max} step={SLIDE_FONT_SCALE.step}
                value={slideFontScale}
                onChange={(e) => setSlideSetting('slideFontScale', Number(e.target.value))}
              />
            </label>

            <label className="ys-hud-row ys-hud-row-col">
              <span>{t('slideshow.fillWidth', { n: Math.round(slideFillWidth) })}</span>
              <input
                type="range" className="settings-range ys-hud-range"
                min={SLIDE_FILL.min} max={SLIDE_FILL.max} step={SLIDE_FILL.step}
                value={slideFillWidth}
                onChange={(e) => setSlideSetting('slideFillWidth', Number(e.target.value))}
              />
            </label>

            <label className="ys-hud-row ys-hud-row-col">
              <span>{t('slideshow.fillHeight', { n: Math.round(slideFillHeight) })}</span>
              <input
                type="range" className="settings-range ys-hud-range"
                min={SLIDE_FILL.min} max={SLIDE_FILL.max} step={SLIDE_FILL.step}
                value={slideFillHeight}
                onChange={(e) => setSlideSetting('slideFillHeight', Number(e.target.value))}
              />
            </label>

            {/* 分栏：栏内对齐 / 分栏样式（仅作用于用 `***` 分栏的页；非分栏页不受影响） */}
            <div className="ys-hud-row">
              <span>{t('slideshow.colAlign')}</span>
              <div className="ys-hud-seg">
                {([
                  ['left', t('slideshow.colAlignLeft')],
                  ['center', t('slideshow.colAlignCenter')],
                  ['right', t('slideshow.colAlignRight')],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    className={slideColAlign === id ? 'ys-hud-seg-btn ys-active' : 'ys-hud-seg-btn'}
                    onClick={(e) => { e.currentTarget.blur(); setSlideSetting('slideColAlign', id) }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="ys-hud-row">
              <span>{t('slideshow.colStyle')}</span>
              <div className="ys-hud-seg">
                {([
                  ['none', t('slideshow.colStyleNone')],
                  ['line', t('slideshow.colStyleLine')],
                  ['card', t('slideshow.colStyleCard')],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    className={slideColStyle === id ? 'ys-hud-seg-btn ys-active' : 'ys-hud-seg-btn'}
                    onClick={(e) => { e.currentTarget.blur(); setSlideSetting('slideColStyle', id) }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <button
              className="ys-hud-reset"
              onClick={(e) => {
                e.currentTarget.blur()
                setSlideSetting('slideFontFamily', DEFAULT_SLIDE_TYPOGRAPHY.fontFamily)
                setSlideSetting('slideFontWeight', DEFAULT_SLIDE_TYPOGRAPHY.fontWeight)
                setSlideSetting('slideFontScale', DEFAULT_SLIDE_TYPOGRAPHY.fontScale)
                setSlideSetting('slideFillWidth', DEFAULT_SLIDE_TYPOGRAPHY.fillWidth)
                setSlideSetting('slideFillHeight', DEFAULT_SLIDE_TYPOGRAPHY.fillHeight)
                setSlideSetting('slideColAlign', DEFAULT_SLIDE_COL_ALIGN)
                setSlideSetting('slideColStyle', DEFAULT_SLIDE_COL_STYLE)
              }}
            >
              {t('common.restoreDefault')}
            </button>
          </div>
        </>
      )}

      {/* 主题菜单 */}
      {themeMenuOpen && (
        <>
          <div className="ys-dismiss" onClick={() => setThemeMenuOpen(false)} />
          <div className="ys-theme-menu">
            {/* 「自定义主题」= 基底主题 + user.css，user.css 非空时才出现在菜单里 */}
            {hasUserCss && (
              <button
                className={CUSTOM_THEME === theme ? 'ys-theme-active' : ''}
                onClick={() => { setTheme(CUSTOM_THEME); setThemeMenuOpen(false) }}
              >
                {CUSTOM_THEME === theme && <Check size={13} />}
                {t('settings.customTheme')}
              </button>
            )}
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
              {t('slideshow.helpColumns')}
              {t('slideshow.helpText1')}
              {t('slideshow.helpText2')}
              {t('slideshow.helpText3')}
            </p>
          </div>
        </div>
      )}

      {/* 提词备注：默认收在屏幕左缘外，鼠标移到左缘热区（.ys-notes-edge，纯 CSS :hover）
          或按 `S` 锁定（notesPinned）才滑出 —— 它与幻灯片同屏，观众看得到，见 CSS 里的说明 */}
      {cur?.notes && (
        <>
          <div className="ys-notes-edge" />
          <div className={`ys-notes-panel${notesPinned ? ' ys-pinned' : ''}`}>
            <div className="ys-notes-head">
              <span>{t('slideshow.notesTitle')}</span>
              <button onClick={() => setNotesPinned(false)}>{t('slideshow.close')}</button>
            </div>
            <div className="ys-notes-body">{cur.notes}</div>
          </div>
        </>
      )}

      {/* 本页无备注时按 S 的短暂提示：HUD 按钮此时不出现，若按键毫无反应会让人以为没有这个功能 */}
      {notesHint && <div className="ys-notes-hint">{t('slideshow.notesEmpty')}</div>}

      {/* 超长文档名被 .ys-title 的单行省略号截断 ⇒ 悬停可看完整值 */}
      <div className="ys-title" title={docTitle}>{docTitle}</div>
    </div>
  )
}
