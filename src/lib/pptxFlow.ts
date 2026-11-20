/**
 * pptxFlow.ts — 场景图的「垂直回流」计算（零依赖，可被 Node 单测直接加载）。
 *
 * 背景：PPTX 里没有元素内横向滚动条，长代码行必须在导出时预折成多行（见
 * `pptxScene.ts` 的 `wrapCodeRuns`）。这些多出来的行让代码块比浏览器里更高，
 * 而场景图的其余节点仍来自浏览器坐标 —— 不回流就会出现「代码压住后面的列表」
 * 「代码溢出卡片底部」这类问题（issue #19）。
 *
 * 这里只做纯几何：位移累加、栏区增量、按区间平移 / 增高 / 取底边。
 * 场景层负责「谁属于哪个区间」，本模块不依赖 DOM。
 */

/** 可平移 / 增高的节点（与 pptxTypes.SceneNode 结构兼容） */
export interface FlowNode {
  t: string
  y?: number
  h?: number
  y1?: number
  y2?: number
  decorative?: boolean
}

/** 顺序流：每个子块相对容器顶部的累计位移（px），以及容器总增长。 */
export function accumulateShifts(growths: number[]): { shifts: number[]; total: number } {
  const shifts: number[] = []
  let acc = 0
  for (const raw of growths) {
    shifts.push(acc)
    acc += Math.max(0, raw || 0)
  }
  return { shifts, total: acc }
}

export interface ColumnFlow {
  /** 本栏内部回流造成的总增长（px） */
  growth: number
  /** 浏览器里该栏内容底部（px，幻灯片坐标） */
  bottomBefore: number
  /** 场景里该栏内容底部（px，幻灯片坐标，已含预折行增高） */
  bottomAfter: number
}

/**
 * 栏区（`.ys-cols`）整体要下移多少。
 *
 * - 卡片模式（CSS `align-items: stretch`）：卡片本来等高，且上下留白是设计的一部分，
 *   所以每张卡都按**最大栏增长**增高 —— 用「差多少补多少」会把留白压成 0；
 * - 非卡片模式：栏区高度只取决于最高的那一栏，取「场景内容底部 − 浏览器内容底部」的实际增量，
 *   矮栏长高但仍是矮栏时不该推动后面的内容。
 */
export function columnRowGrowth(columns: ColumnFlow[], cards: boolean): number {
  if (!columns.length) return 0
  const growths = columns.map((c) => Math.max(0, c.growth || 0))
  if (cards) return Math.max(...growths)
  const before = Math.max(...columns.map((c) => c.bottomBefore))
  const after = Math.max(...columns.map((c) => c.bottomAfter))
  if (!Number.isFinite(before) || !Number.isFinite(after)) return Math.max(...growths)
  return Math.max(0, after - before)
}

/** 把 `nodes[from..to]` 整体下移 `dy`（单位与节点坐标一致：场景里是 inch）。 */
export function shiftFlowNodes<T extends FlowNode>(
  nodes: T[],
  from: number,
  dy: number,
  to: number = nodes.length,
): void {
  if (!(dy > 0)) return
  const end = Math.min(to, nodes.length)
  for (let i = Math.max(0, from); i < end; i++) {
    const n = nodes[i]
    if (n.t === 'line') {
      if (Number.isFinite(n.y1)) n.y1 = (n.y1 as number) + dy
      if (Number.isFinite(n.y2)) n.y2 = (n.y2 as number) + dy
      continue
    }
    if (Number.isFinite(n.y)) n.y = (n.y as number) + dy
  }
}

/** 垂直增高（卡片 / 分隔线 / 容器边框）。 */
export function growFlowNodes<T extends FlowNode>(nodes: T[], indexes: number[], dy: number): void {
  if (!(dy > 0)) return
  for (const index of indexes) {
    const n = nodes[index]
    if (n && Number.isFinite(n.h)) n.h = (n.h as number) + dy
  }
}

/**
 * `nodes[from..]` 的最大底边（单位同节点坐标）；没有可用节点时返回 NaN。
 * 装饰性文本（大引号 / 章节序号）允许出血，不计入内容底部。
 */
export function flowBottom(nodes: FlowNode[], from: number): number {
  let max = -Infinity
  for (let i = Math.max(0, from); i < nodes.length; i++) {
    const n = nodes[i]
    if (n.decorative) continue
    const bottom = n.t === 'line'
      ? Math.max(n.y1 ?? -Infinity, n.y2 ?? -Infinity)
      : (n.y ?? -Infinity) + (n.h ?? 0)
    if (Number.isFinite(bottom)) max = Math.max(max, bottom)
  }
  return Number.isFinite(max) ? max : NaN
}
