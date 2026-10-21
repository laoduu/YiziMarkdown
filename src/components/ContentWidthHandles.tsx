/**
 * 正文列左右边缘的「宽度拖拽手柄」。
 *
 * 交互（刻意做得隐蔽，只有要用的时候才看得见）：
 *   · 默认完全不可见，不干扰阅读；
 *   · 鼠标移到正文列边缘的命中区（16px 宽的隐形竖条）时，渐显一条**跟随光标的短竖线**
 *     —— 主题色、上下两端渐变透明；
 *   · 按住左右拖动改变设置里的 contentMaxWidth，松开鼠标时落库持久化；
 *   · 双击竖线恢复默认宽度。
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

/** 竖线高度，以及「离上下边至少留多少」——纯观感参数 */
const LINE_HEIGHT = 88
const EDGE_PADDING = 44

interface Props {
  /** 是否显示（并排 split 模式隐藏：两列各有各的居中列，一个手柄对不齐两处） */
  visible: boolean
  /** 当前模式对应的正文列元素：源码/实时 = .cm-content，预览 = .editor-content */
  getContentEl: () => HTMLElement | null
  /** 模式标识：模式一变正文列就换元素，需要重新测量 */
  mode: string
}

export default function ContentWidthHandles({ visible, getContentEl, mode }: Props) {
  const contentMaxWidth = useSettingsStore((s) => s.contentMaxWidth)
  const wrapRef = useRef<HTMLDivElement>(null)
  const stripsRef = useRef<Array<HTMLDivElement | null>>([])
  const linesRef = useRef<Array<HTMLDivElement | null>>([])
  /** 拖动起点：按下时的光标 X、当时的宽度、以及抓的是哪一侧 */
  const dragStartRef = useRef({ x: 0, width: contentMaxWidth, side: 'left' as 'left' | 'right' })
  /** 拖动过程中最后算出的宽度；松开时才写进 store 持久化 */
  const dragWidthRef = useRef(contentMaxWidth)
  const [dragging, setDragging] = useState(false)

  // 用 ref 持有最新的取元素函数，这样测量逻辑不必随父组件每次重渲染而重建
  const getContentElRef = useRef(getContentEl)
  getContentElRef.current = getContentEl

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
    if (leftStrip) leftStrip.style.left = `${Math.max(0, contentRect.left - rowRect.left)}px`
    if (rightStrip) rightStrip.style.right = `${Math.max(0, rowRect.right - contentRect.right)}px`
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

  // 宽度变化（拖动 / 双击复位 / 其他入口改设置）后立刻重测一次，让线跟上新的边缘
  useLayoutEffect(() => {
    if (visible) recalc()
  }, [visible, mode, contentMaxWidth])

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
      setDragging(false)
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
    setDragging(true)
  }

  /** 让竖线跟着光标上下走（限制在留白内）。直接改 DOM 样式，避免每次 mousemove 触发重渲染 */
  const trackLine = (e: React.MouseEvent, index: number) => {
    const line = linesRef.current[index]
    const rowRect = wrapRef.current?.getBoundingClientRect()
    if (!line || !rowRect) return
    const y = Math.max(EDGE_PADDING, Math.min(rowRect.height - EDGE_PADDING, e.clientY - rowRect.top))
    line.style.top = `${y}px`
  }

  const renderStrip = (side: 'left' | 'right', index: number) => (
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
      onMouseMove={(e) => trackLine(e, index)}
      // 双击恢复默认宽度（两次 mousedown/mouseup 之间没有移动，不会误改宽度）
      onDoubleClick={() => useSettingsStore.getState().setField('contentMaxWidth', CONTENT_WIDTH_DEFAULT)}
    >
      <div
        ref={(el) => { linesRef.current[index] = el }}
        // top-1/2 用 CSS 类而不是内联样式：trackLine 会改写 inline top，重渲染时不能把它重置回 50%
        className={`absolute left-1/2 top-1/2 w-[2px] rounded-full pointer-events-none transition-opacity duration-150 ${
          dragging ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
        style={{
          height: LINE_HEIGHT,
          transform: 'translate(-50%, -50%)',
          background: 'linear-gradient(to bottom, transparent, var(--editor-accent), transparent)',
        }}
      />
    </div>
  )

  return (
    <div ref={wrapRef} className="absolute inset-0 z-20 pointer-events-none">
      {renderStrip('left', 0)}
      {renderStrip('right', 1)}
    </div>
  )
}
