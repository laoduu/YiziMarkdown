/**
 * 正文列左右边缘的「宽度拖拽手柄」。
 *
 * 交互（刻意做得隐蔽，只有要用的时候才看得见）：
 *   · 默认完全不可见，不干扰阅读；
 *   · 鼠标移到正文列边缘的命中区（16px 宽的隐形竖条）时，渐显一条**跟随光标的短竖线**
 *     —— 主题色、上下两端渐变透明 —— 并在竖线**外侧**显示一句提示文案「按住拖动调整宽度」；
 *   · 按住左右拖动改变设置里的 contentMaxWidth，松开鼠标时落库持久化；
 *     拖动时**只保留被抓那一侧**的线与文案，另一侧立即隐藏（两条线同时动容易看花）；
 *   · 双击竖线恢复默认宽度；
 *   · 命中条永远不与滚动条重合：小窗口下正文列顶到面板边、右边缘正好压着纵向滚动条时，
 *     把条往内推到「滚动条外沿 + 半宽 + 最小间距」之外（横向滚动条同理，抬高条的底端），
 *     否则滚动条会被 col-resize 的命中条整段盖住、点不到。
 *
 * 提示文案为什么可能出现在内侧：文案宽度有限，正文列一旦贴着面板边缘（窄窗口），
 * 外侧就只剩几个像素，文案会被编辑区的 overflow-hidden 裁掉。因此这里实测两侧留白，
 * 放不下时把文案翻到内侧 —— 默认仍然是外侧。
 *
 * 语义：它只改 max-width 的**上限**。窗口变窄时正文仍按原有 flex 逻辑自适应收窄，
 * 实际宽度 = min(contentMaxWidth, 可用宽度)，所以窄窗口下这两条线会贴到面板边缘。
 *
 * 为什么必须实测正文列矩形、而不是像「正文列相对面板居中」那样纯 CSS 推算：
 *   · CodeMirror（源码/实时）的 .cm-scroller 是 flex 容器，行号 gutters 占着左侧空间，
 *     而 .cm-content 只在其**剩余**空间里居中 —— 它的中心比面板中心偏右半个 gutter 宽；
 *   · 预览面板有纵向滚动条，clientWidth 比面板窄，居中基准同样会偏。
 *   两者都会让纯 CSS 算出的边缘位置偏移十几到二十几像素，所以这里读 getBoundingClientRect。
 *
 * 拖动为什么用「光标位移增量 × 2」：正文列居中、两侧对称外扩，光标移动 1px 意味着
 * 两侧各外扩 1px、总宽 +2px —— 所以被抓的那一侧边缘会精确跟随光标，按住哪边都一样。
 * 不用「光标到列中心的绝对距离」是为了避免按下时光标没完全压在边缘上而出现的初始跳变。
 */
import { useLayoutEffect, useEffect, useRef, useState } from 'react'
import { useSettingsStore, CONTENT_WIDTH_DEFAULT, CONTENT_WIDTH_MAX, CONTENT_WIDTH_MIN } from '../stores/settingsStore'
import { useI18n } from '../i18n'

/** 竖线高度，以及「离上下边至少留多少」——纯观感参数 */
const LINE_HEIGHT = 88
const EDGE_PADDING = 44
/** 手柄外侧放提示文案的保守留白估计（真实阈值用文案实测宽度，这里只是兜底） */
const HINT_OUTSIDE_SPACE = 200
/** 命中条半宽：条宽 w-4 = 16px，以正文列边缘为中心向两侧各探出这么多 */
const STRIP_HALF = 8
/** 手柄与滚动条之间必须保住的最小间距（像素） */
const SCROLLBAR_GAP = 6

interface Props {
  /** 是否显示（并排 split 模式隐藏：两列各有各的居中列，一个手柄对不齐两处） */
  visible: boolean
  /** 当前模式对应的正文列元素：源码/实时 = .cm-content，预览 = .editor-content */
  getContentEl: () => HTMLElement | null
  /** 当前模式承载滚动条的容器：源码/实时 = .cm-scroller，预览 = overflow:auto 的面板本身
   *  （手柄要避开的滚动条长在它上面，测宽度就找它） */
  getScrollEl: () => HTMLElement | null
  /** 模式标识：模式一变正文列就换元素，需要重新测量 */
  mode: string
}

export default function ContentWidthHandles({ visible, getContentEl, getScrollEl, mode }: Props) {
  const contentMaxWidth = useSettingsStore((s) => s.contentMaxWidth)
  const { t, lang } = useI18n()
  const wrapRef = useRef<HTMLDivElement>(null)
  const stripsRef = useRef<Array<HTMLDivElement | null>>([])
  /** 跟随光标的容器（竖线 + 提示文案都在里面，一起上下走） */
  const followersRef = useRef<Array<HTMLDivElement | null>>([])
  /** 拖动起点：按下时的光标 X、当时的宽度、以及抓的是哪一侧 */
  const dragStartRef = useRef({ x: 0, width: contentMaxWidth, side: 'left' as 'left' | 'right' })
  /** 拖动过程中最后算出的宽度；松开时才写进 store 持久化 */
  const dragWidthRef = useRef(contentMaxWidth)
  /** 当前正被抓着的一侧：另一侧的竖线与文案要立即隐藏 */
  const [dragSide, setDragSide] = useState<'left' | 'right' | null>(null)
  const dragging = dragSide !== null
  /** 提示文案是否翻到内侧（窗口太窄、外侧放不下时） */
  const [hintInside, setHintInside] = useState({ left: false, right: false })

  // 用 ref 持有最新的取元素函数，这样测量逻辑不必随父组件每次重渲染而重建
  const getContentElRef = useRef(getContentEl)
  getContentElRef.current = getContentEl
  const getScrollElRef = useRef(getScrollEl)
  getScrollElRef.current = getScrollEl

  /** 实测正文列相对本行容器的左右边缘，直接写到命中条的 left/right 上（绕开重渲染） */
  const recalc = () => {
    const wrap = wrapRef.current
    const el = getContentElRef.current()
    if (!wrap || !el) return
    const rowRect = wrap.getBoundingClientRect()
    const contentRect = el.getBoundingClientRect()
    if (rowRect.width <= 0) return
    const [leftStrip, rightStrip] = stripsRef.current
    // max(0, …)：窗口窄到正文列铺满时，边缘就是面板边缘
    const leftOffset = Math.max(0, contentRect.left - rowRect.left)
    // 与滚动条保持最小距离：正文列顶到面板边时，右边缘正好落在纵向滚动条上，
    // 以边缘为中心向两侧各探出 STRIP_HALF 的命中条会把滚动条整段盖住（点不到、拖不动）。
    // 此时把条往内推到「滚动条外沿 + 半宽 + 最小间距」之外；宽窗口下正文列离边缘远，不受影响。
    // 滚动条占位宽度 = 滚动容器 offsetWidth/clientWidth 之差（这两个容器都没有边框），
    // 0 表示当前没有滚动条，不需要避让。
    const scrollEl = getScrollElRef.current()
    const vBar = scrollEl ? Math.max(0, scrollEl.offsetWidth - scrollEl.clientWidth) : 0
    const hBar = scrollEl ? Math.max(0, scrollEl.offsetHeight - scrollEl.clientHeight) : 0
    const minRight = vBar > 0 ? vBar + STRIP_HALF + SCROLLBAR_GAP : 0
    const rightOffset = Math.max(minRight, Math.max(0, rowRect.right - contentRect.right))
    // 横向滚动条同理：把命中条底端抬到它上方；清空时回落到 Tailwind 的 bottom-0
    const bottomInset = hBar > 0 ? `${hBar + SCROLLBAR_GAP}px` : ''
    if (leftStrip) {
      leftStrip.style.left = `${leftOffset}px`
      leftStrip.style.bottom = bottomInset
    }
    if (rightStrip) {
      rightStrip.style.right = `${rightOffset}px`
      rightStrip.style.bottom = bottomInset
    }
    // 外侧留白够不够放下提示文案：不够就翻到内侧，否则会被编辑区的 overflow-hidden 裁掉。
    // 阈值取文案实测宽度（各语言长短差很多），拿不到时退回保守估计。
    const hintWidth = leftStrip?.querySelector<HTMLElement>('[data-cw-hint]')?.offsetWidth ?? HINT_OUTSIDE_SPACE
    const need = hintWidth + 24
    const next = { left: leftOffset < need, right: rightOffset < need }
    setHintInside((prev) => (prev.left === next.left && prev.right === next.right ? prev : next))
  }

  // 测量（重）挂：只随「显示开关 / 模式」变化重建观察器与监听。
  // 注意 contentMaxWidth 不在这里的依赖里 —— 拖动时它每帧都在变，若放进来会每帧重建
  // ResizeObserver 和一堆监听器（真实卡顿源）。宽度变化的重测交给下面的 layout effect
  // 和 varObserver（监听 <html> 上 --content-max-width 的实际写入）。
  useLayoutEffect(() => {
    if (!visible) return
    recalc()

    let raf = 0
    let tries = 0
    let observedEl: HTMLElement | null = null
    const observer = new ResizeObserver(() => recalc())

    // .cm-content 由 CodeMirror 在父组件 effect 里创建，首次挂载时可能还不存在 —— 找不到就再等几帧
    const tick = () => {
      recalc()
      const el = getContentElRef.current()
      if (el && el !== observedEl) {
        if (observedEl) observer.unobserve(observedEl)
        observer.observe(el)
        observedEl = el
      }
      if (!el && tries++ < 180) raf = requestAnimationFrame(tick)
    }

    // 宽度变化还有一条更可靠的信号：谁改了 --content-max-width（拖动、双击复位、
    // 设置面板、存档迁移恢复）都会落到 <html> 的 style 属性上，MutationObserver 立刻能收到，
    // 不依赖 ResizeObserver 的帧调度 —— 否则变量更新与重测之间会有一帧的错位。
    const varObserver = new MutationObserver(() => recalc())
    varObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] })

    if (wrapRef.current) observer.observe(wrapRef.current)
    raf = requestAnimationFrame(tick)
    window.addEventListener('resize', recalc)
    document.addEventListener('scroll', recalc, true)

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      varObserver.disconnect()
      window.removeEventListener('resize', recalc)
      document.removeEventListener('scroll', recalc, true)
    }
  }, [visible, mode])

  // 宽度变化（拖动 / 双击复位 / 其他入口改设置）后立刻重测一次，让线跟上新的边缘；
  // 切语言时文案宽度会变，也要重算「放外侧还是内侧」
  useLayoutEffect(() => {
    if (visible) recalc()
  }, [visible, mode, contentMaxWidth, lang])

  // 拖动：正文列居中、两侧对称外扩，所以宽度变化 = 2 × 光标位移。
  // 用位移增量而不是「到列中心的绝对距离」，是为了避免按下时因光标不完全压在边缘上而跳变。
  useEffect(() => {
    if (!dragging) return
    const handleMove = (e: MouseEvent) => {
      const { x, width, side } = dragStartRef.current
      const delta = (e.clientX - x) * (side === 'right' ? 2 : -2)
      const next = Math.min(CONTENT_WIDTH_MAX, Math.max(CONTENT_WIDTH_MIN, Math.round(width + delta)))
      dragWidthRef.current = next
      // 拖动中**不写 store**：App 用无 selector 的 useSettingsStore() 订阅了全部状态，
      // 每帧 setField 会让整棵树重渲染（真实卡顿源）。这里直接改 CSS 变量 + 重测，
      // 视觉即时生效；松开鼠标时再落库持久化。
      document.documentElement.style.setProperty('--content-max-width', `${next}px`)
      recalc()
    }
    const handleUp = () => {
      useSettingsStore.getState().setField('contentMaxWidth', dragWidthRef.current)
      setDragSide(null)
    }
    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
    // 窗口失焦（比如在 webview 外松开鼠标）也要收尾，否则会一直卡在拖动状态
    window.addEventListener('blur', handleUp)
    // 拖动时锁住光标与选区：否则扫过正文会顺手选中一堆文字、光标也会在 col-resize / text 间乱跳
    const prevCursor = document.body.style.cursor
    const prevUserSelect = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
      window.removeEventListener('blur', handleUp)
      document.body.style.cursor = prevCursor
      document.body.style.userSelect = prevUserSelect
    }
  }, [dragging])

  if (!visible) return null

  const handleMouseDown = (side: 'left' | 'right', e: React.MouseEvent) => {
    e.preventDefault()
    // 以当前状态为起点：若只是点了一下没拖动，松开时写回的仍是原值
    dragStartRef.current = {
      x: e.clientX,
      width: useSettingsStore.getState().contentMaxWidth,
      side,
    }
    dragWidthRef.current = dragStartRef.current.width
    setDragSide(side)
  }

  /** 让竖线与提示文案跟着光标上下走（限制在留白内）。直接改 DOM 样式，避免每次 mousemove 触发重渲染 */
  const trackFollower = (e: React.MouseEvent, index: number) => {
    const follower = followersRef.current[index]
    const rowRect = wrapRef.current?.getBoundingClientRect()
    if (!follower || !rowRect) return
    const y = Math.max(EDGE_PADDING, Math.min(rowRect.height - EDGE_PADDING, e.clientY - rowRect.top))
    follower.style.top = `${y}px`
  }

  const renderStrip = (side: 'left' | 'right', index: number) => {
    const isDragSide = dragSide === side
    // 可见性：拖动中只留被抓那一侧；非拖动时靠 hover（group-hover）渐显
    const followerClass = dragging
      ? isDragSide
        ? 'opacity-100'
        : 'opacity-0'
      : 'opacity-0 group-hover:opacity-100'
    // 文案默认挂在外侧；外侧放不下时（见 recalc）翻到内侧
    const hintSideClass = hintInside[side]
      ? side === 'left' ? 'left-0 ml-2.5' : 'right-0 mr-2.5'
      : side === 'left' ? 'right-0 mr-2.5' : 'left-0 ml-2.5'

    return (
      <div
        key={side}
        ref={(el) => { stripsRef.current[index] = el }}
        className={`group absolute top-0 bottom-0 w-4 pointer-events-auto cursor-col-resize ${
          side === 'left' ? 'left-0' : 'right-0'
        }`}
        // 位置由 recalc() 实测后写入 inline left/right（覆盖这两个 0 值）；
        // React 的 style 里不写 left/right，重渲染才不会把实测值重置掉。
        style={{ transform: side === 'left' ? 'translateX(-50%)' : 'translateX(50%)' }}
        onMouseDown={(e) => handleMouseDown(side, e)}
        onMouseMove={(e) => trackFollower(e, index)}
        // 双击恢复默认宽度（两次 mousedown/mouseup 之间没有移动，不会误改宽度）
        onDoubleClick={() => useSettingsStore.getState().setField('contentMaxWidth', CONTENT_WIDTH_DEFAULT)}
      >
        {/* 跟随光标的容器：宽 0，恰好落在正文列边缘上，无需横向偏移 */}
        <div
          ref={(el) => { followersRef.current[index] = el }}
          // top-1/2 用 CSS 类而不是内联样式：trackFollower 会改写 inline top，重渲染时不能把它重置回 50%
          className={`absolute left-1/2 top-1/2 w-0 pointer-events-none transition-opacity duration-150 ${followerClass}`}
          style={{ height: LINE_HEIGHT, transform: 'translateY(-50%)' }}
        >
          <div
            className="absolute inset-y-0 left-0 w-[2px] -translate-x-1/2 rounded-full"
            style={{ background: 'linear-gradient(to bottom, transparent, var(--editor-accent), transparent)' }}
          />
          <span
            data-cw-hint
            className={`absolute top-1/2 -translate-y-1/2 whitespace-nowrap rounded-ui border px-2 py-1 text-xs leading-none shadow-sm ${hintSideClass}`}
            style={{
              background: 'var(--editor-surface)',
              borderColor: 'var(--editor-border)',
              color: 'var(--editor-text)',
            }}
          >
            {t('editor.widthHandleHint')}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div ref={wrapRef} className="absolute inset-0 z-20 pointer-events-none">
      {renderStrip('left', 0)}
      {renderStrip('right', 1)}
    </div>
  )
}
