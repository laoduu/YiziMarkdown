/**
 * ZenScrollIndicator — 禅模式下的自绘滚动条。
 *
 * 为什么不用原生滚动条：
 *   · Linux 的 WebKitGTK 用 overlay 滚动条，只在滚动瞬间闪一下，**鼠标移动不唤出**；
 *   · 改成经典滚动条会占 8px 宽度 —— 一旦隐藏就会出现「正文横向位移」，违背禅模式的铁律。
 *   所以这里画一条**固定定位的细条**：不占布局、不推动正文，显隐完全由我们控制：
 *   鼠标动（App 的 zenScrollVisible）/ 正在滚动 / 悬停或拖动时出现，其余时间完全隐形。
 *
 * 交互：可以直接拖动细条滚动（触摸板用户也能用）；不抢编辑器焦点。
 */
import { useEffect, useRef, useState } from 'react'

interface Geometry {
  /** 细条左边缘（视口坐标） */
  left: number
  /** 细条上边缘（视口坐标） */
  top: number
  /** 细条高度 */
  height: number
  /** 轨道上下端 */
  trackTop: number
  trackHeight: number
  /** 可滚动距离 */
  maxScroll: number
}

interface ZenScrollIndicatorProps {
  /** 鼠标刚动过（禅模式里由 App 维护的 1.4s 窗口） */
  active: boolean
  /** 进出场动画期间：完全不渲染（动画全程隐藏滚动条） */
  suppressed?: boolean
}

export default function ZenScrollIndicator({ active, suppressed = false }: ZenScrollIndicatorProps) {
  const [geom, setGeom] = useState<Geometry | null>(null)
  const [dragging, setDragging] = useState(false)
  const [hovering, setHovering] = useState(false)
  const [scrolling, setScrolling] = useState(false)
  /** 指针贴近滚动条区域（像原生 overlay 那样，靠近即显形） */
  const [nearEdge, setNearEdge] = useState(false)
  const scrollerRef = useRef<HTMLElement | null>(null)
  const geomRef = useRef<Geometry | null>(null)
  const dragRef = useRef<{ startY: number; startScroll: number } | null>(null)
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 找到编辑器滚动容器并持续测量（滚动 / 窗口尺寸 / 内容高度变化都会影响细条位置）
  useEffect(() => {
    const measure = () => {
      const el = scrollerRef.current
      if (!el) {
        setGeom(null)
        return
      }
      const rect = el.getBoundingClientRect()
      if (rect.height < 40 || rect.width < 80) {
        setGeom(null)
        return
      }
      const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight)
      const trackTop = rect.top + 8
      const trackHeight = Math.max(40, rect.height - 16)
      const thumbHeight = Math.max(
        28,
        Math.round(trackHeight * (el.clientHeight / Math.max(1, el.scrollHeight))),
      )
      const ratio = maxScroll > 0 ? el.scrollTop / maxScroll : 0
      const next: Geometry = {
        left: rect.right - 6,
        top: trackTop + ratio * (trackHeight - thumbHeight),
        height: thumbHeight,
        trackTop,
        trackHeight,
        maxScroll,
      }
      geomRef.current = next
      setGeom(next)
    }

    let ro: ResizeObserver | null = null
    let boundEl: HTMLElement | null = null
    const onScroll = () => {
      measure()
      setScrolling(true)
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current)
      scrollTimerRef.current = setTimeout(() => setScrolling(false), 900)
    }
    const bind = (el: HTMLElement | null) => {
      if (boundEl === el) {
        measure()
        return
      }
      boundEl?.removeEventListener('scroll', onScroll)
      ro?.disconnect()
      boundEl = el
      scrollerRef.current = el
      if (el) {
        el.addEventListener('scroll', onScroll, { passive: true })
        // 内容增减（打字、插图、折叠）后滚动范围会变；**滚动容器自身**的尺寸变化
        // （拖动 AI 面板、折叠侧栏、窗口缩放）会移动右边缘 —— 不观察它，细条会留在
        // 旧位置，变成一根孤立的滚动条，直到下一次滚动才归位。
        ro = new ResizeObserver(measure)
        ro.observe(el)
        const content = el.querySelector<HTMLElement>('.cm-content')
        if (content) ro.observe(content)
      }
      measure()
    }

    // 组件在 App 启动时就挂载，此时编辑器可能还不存在 —— 用 MutationObserver
    // 等 .cm-scroller 出现/被替换（切换文档、切视图都会重建）再绑定。
    let raf = 0
    const sync = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        bind(document.querySelector<HTMLElement>('.cm-scroller'))
      })
    }
    sync()
    const mo = new MutationObserver(sync)
    mo.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('resize', measure)

    return () => {
      mo.disconnect()
      if (raf) cancelAnimationFrame(raf)
      boundEl?.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', measure)
      ro?.disconnect()
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current)
    }
  }, [])

  // 指针贴近编辑区右缘 → 显形（离开 1s 后消失）；这样"跟随鼠标动作"的感觉和原生一致
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const el = scrollerRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const near = e.clientX >= r.right - 56 && e.clientY >= r.top && e.clientY <= r.bottom
      if (!near) return
      setNearEdge(true)
      if (nearTimerRef.current) clearTimeout(nearTimerRef.current)
      nearTimerRef.current = setTimeout(() => setNearEdge(false), 1000)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      if (nearTimerRef.current) clearTimeout(nearTimerRef.current)
    }
  }, [])

  // 拖动：按比例改 scrollTop，松手结束（不抢焦点，避免打断输入）
  useEffect(() => {
    if (!dragging) return
    const onMove = (e: PointerEvent) => {
      const g = geomRef.current
      const drag = dragRef.current
      const el = scrollerRef.current
      if (!g || !drag || !el) return
      const span = Math.max(1, g.trackHeight - g.height)
      const delta = (e.clientY - drag.startY) / span
      el.scrollTop = drag.startScroll + delta * g.maxScroll
    }
    const onUp = () => {
      dragRef.current = null
      setDragging(false)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [dragging])

  // 进出场动画期间整体隐藏；没有可滚动距离（短文档）也不画
  if (suppressed || !geom || geom.maxScroll <= 2) return null

  const visible = active || dragging || hovering || scrolling || nearEdge

  return (
    <div
      className={`zen-scroll-indicator${visible ? ' is-visible' : ''}${dragging ? ' is-dragging' : ''}`}
      style={{ left: geom.left, top: geom.top, height: geom.height }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onPointerDown={(e) => {
        e.preventDefault()
        const el = scrollerRef.current
        if (!el) return
        // 点在轨道空白处：先跳过去，再开始拖
        const g = geomRef.current
        if (g && e.clientY < g.top - 4) {
          const span = Math.max(1, g.trackHeight - g.height)
          el.scrollTop = ((e.clientY - g.trackTop) / span) * g.maxScroll
        }
        dragRef.current = { startY: e.clientY, startScroll: el.scrollTop }
        setDragging(true)
      }}
      aria-hidden="true"
    />
  )
}
