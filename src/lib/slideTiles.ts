/** 演示模式「瓷砖转场」的几何与时序（纯函数、零依赖，可在 Node 直跑测试）。
 *
 * 机制：整页被切成 N 个单元（方块 / 竖条 / 六边形 / 三角），每个单元是一个
 * overflow:hidden 的窗口 + 一份「整页克隆」负偏移对齐 —— 因此每个单元都能
 * 独立做 2D/3D 变换、独立时序（CSS 无法对单个元素做分区变换，这是唯一解）。
 *
 * 本模块只负责「切成什么」与「什么节奏」；「怎么动」由 CSS 各变体负责。 */

/** 演示模式的切换动画 id（对应 slideshow.css 的 `.ys-anim-*` 变体）。
 *  其中 `TILE_ANIM_IDS` 走「瓷砖转场」（整页切成单元、每格持前后两页克隆），
 *  其余是纯 CSS mask / transform 变体。
 *  类型定义在这里而不是组件里：settingsStore.slideAnim 也要用它做持久化字段的类型。 */
export type SlideAnim =
  | 'slide' | 'fade' | 'zoom' | 'none' | 'dissolve'
  | 'blinds' | 'checkerboard' | 'cube' | 'cube3d' | 'shatter' | 'hex' | 'depth'

export type TileShape = 'square' | 'strip' | 'hex'
export type DelayMode = 'random' | 'wave' | 'row'

/** 动画模式：
 *  - 'shimmer'：小格网闪烁——每格是一块【纯色贴片】（不克隆页面），
 *    以随机延迟淡入淡出；随机一部分用主题的另一种颜色，整体呈格子闪烁感。
 *    新页由真实页面自身淡入承担（无 3D、无克隆 ⇒ 无左右异色、无方块、
 *    无 WebKit 合成层压力）。
 *  - 'flip'：旧方案（每格持整页克隆 + 3D 翻面）。 */
export type TileMode = 'shimmer' | 'flip'

export type TileConfig = {
  shape: TileShape
  /** 单元尺寸（方块边长 / 竖条宽 / 六边形宽），px */
  target: number
  delay: DelayMode
  /** 随机或波延迟的最大秒数（每格动画时长之外的部分） */
  spread: number
  /** 单格动画时长（秒），写成 CSS 变量 --ys-turn */
  turn: number
  /** 收尾融合淡出时长（秒），写成 CSS 变量 --ys-merge */
  merge: number
  /** 是否给每格随机 3D 冲量（仅 flip 模式用；CSS 读 --ys-tx/--ys-z 等） */
  impulse: boolean
  /** 每格的面数（仅 flip 模式用）：2 = 正/背；3 = 额外一个「侧面」 */
  faces: 2 | 3
  /** 动画模式（默认，Windows/共享路径） */
  mode: TileMode
  /** macOS 专属覆盖（部分字段即可）。不填 = 与默认完全相同。
   *  用途：棋盘在 Windows 用原 flip + 大格，在 macOS 用 shimmer + 小格
   *  —— 两平台各自独立，互不影响。 */
  mac?: Partial<Omit<TileConfig, 'mac'>>
}

export type Tile = {
  i: number
  x: number
  y: number
  w: number
  h: number
  /** clip-path 多边形；null = 矩形窗口（不裁剪） */
  clip: string | null
}

/** 各变体的切割与节奏配置（键 = SlideAnim 里的变体 id）。
 *  平台归属（用户明确要求，两平台各自独立）：
 *  - hex：两平台统一 shimmer 小格（用户要求把 mac 的蜂巢效果同步到 Windows）
 *  - checkerboard：Windows 保持原 flip + 192px 大格（"已经很好了"）；
 *    macOS 用 shimmer + 96px 小格（mac 那版"也不错"）
 *  - blinds：两平台都是 flip + 120px 竖条；macOS 仅 CSS 层不同
 *    （noshadow + 独立影层，避开 WebKit 黑块）
 *  - cube3d / shatter / depth：两平台均为原 flip（未改动） */
export const TILE_VARIANTS: Record<string, TileConfig> = {
  checkerboard: {
    shape: 'square', target: 192, delay: 'random', spread: 0.45, turn: 0.5, merge: 0.25, impulse: false, faces: 2, mode: 'flip',
    mac: { mode: 'shimmer', target: 96, spread: 0.5, turn: 0.42, merge: 0.22 },
  },
  cube3d: { shape: 'square', target: 192, delay: 'random', spread: 0.45, turn: 0.62, merge: 0.25, impulse: false, faces: 3, mode: 'flip' },
  shatter: { shape: 'square', target: 168, delay: 'random', spread: 0.4, turn: 0.6, merge: 0.3, impulse: true, faces: 2, mode: 'flip' },
  depth: { shape: 'square', target: 200, delay: 'wave', spread: 0.35, turn: 0.6, merge: 0.25, impulse: true, faces: 2, mode: 'flip' },
  hex: { shape: 'hex', target: 112, delay: 'random', spread: 0.5, turn: 0.42, merge: 0.22, impulse: false, faces: 2, mode: 'shimmer' },
  blinds: { shape: 'strip', target: 120, delay: 'row', spread: 0.3, turn: 0.55, merge: 0.25, impulse: false, faces: 2, mode: 'flip' },
}

/** 走瓷砖转场的变体 id（其余变体是纯 CSS mask/transform） */
export const TILE_ANIM_IDS = Object.keys(TILE_VARIANTS)

/** 变体总时长（秒）：延迟铺开 + 单格动画 + 收尾融合 */
export const tileTotalDuration = (cfg: TileConfig) => cfg.spread + cfg.turn + cfg.merge

/** 取该变体在指定平台上的实际配置（macOS 用 mac 覆盖合并） */
export const tileConfigFor = (cfg: TileConfig, isMac: boolean): TileConfig =>
  isMac && cfg.mac ? { ...cfg, ...cfg.mac } : cfg

const SQRT3 = Math.sqrt(3)
/** 正六边形（尖顶）内接于 w×h 矩形的 clip-path；h 取 w*2/√3 时为正六边形 */
const HEX_CLIP = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)'

/** 按配置把 W×H 的区域切成单元列表（坐标为相对转场层的 px） */
export function buildTiles(W: number, H: number, cfg: TileConfig): Tile[] {
  const tiles: Tile[] = []
  if (!(W > 0) || !(H > 0)) return tiles

  if (cfg.shape === 'strip') {
    const w = Math.max(40, Math.round(cfg.target))
    const cols = Math.ceil(W / w)
    for (let c = 0; c < cols; c++) {
      tiles.push({ i: c, x: c * w, y: 0, w: Math.min(w, W - c * w), h: H, clip: null })
    }
    return tiles
  }

  if (cfg.shape === 'hex') {
    // 尖顶正六边形铺砖：列距 = 宽，行距 = 3h/4，奇数行右移半宽。
    // ⚠️ r/c 必须从 -1 起（并多铺 1 行 1 列）：相邻行靠半宽错位【互锁】，
    // 最上一行、最左一列、以及奇数行左缘的楔形空隙都要靠出界的补格填上，
    // 否则铺不满 —— 空洞会露出底下的新页，视觉上六边形退化成"带缝的方块"。
    // ⚠️ w/h/rowStep 一律【不取整】：正六边形的 h = w·2/√3、行距 = 3h/4，
    // 取整会让相邻行互相压掉零点几像素（单测实测 9 个采样点落在两个六边形内）。
    // 小数 px 由 CSS 正常处理，精度换来的严格无缝更值。
    const w = Math.max(80, cfg.target)
    const h = (w * 2) / SQRT3
    const rowStep = (h * 3) / 4
    const cols = Math.ceil(W / w) + 2
    const rows = Math.ceil(H / rowStep) + 2
    let i = 0
    for (let r = -1; r < rows - 1; r++) {
      const off = (r & 1) !== 0 ? w / 2 : 0
      for (let c = -1; c < cols - 1; c++) {
        tiles.push({ i: i++, x: c * w + off, y: r * rowStep, w, h, clip: HEX_CLIP })
      }
    }
    return tiles
  }

  const cell = Math.max(80, Math.round(cfg.target))
  const cols = Math.ceil(W / cell)
  const rows = Math.ceil(H / cell)
  let i = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cell
      const y = r * cell
      const w = Math.min(cell, W - x)
      const h = Math.min(cell, H - y)
      tiles.push({ i: i++, x, y, w, h, clip: null })
    }
  }
  return tiles
}

/** 单格延迟（秒）。rand 为注入的随机源（测试可传种子化实现）。 */
export function delayFor(t: Tile, W: number, H: number, cfg: TileConfig, rand: () => number): number {
  if (cfg.delay === 'row') {
    // 竖条：从左到右依次扫过（留一点抖动，避免整齐得像机器）
    const p = W > 0 ? Math.min(1, t.x / W) : 0
    return +(p * cfg.spread + rand() * 0.04).toFixed(3)
  }
  if (cfg.delay === 'wave') {
    // 波：延迟正比于到画面中心的距离 ⇒ 一圈涟漪从中心向外扫
    const dx = t.x + t.w / 2 - W / 2
    const dy = t.y + t.h / 2 - H / 2
    const maxD = Math.sqrt((W / 2) * (W / 2) + (H / 2) * (H / 2)) || 1
    return +((Math.sqrt(dx * dx + dy * dy) / maxD) * cfg.spread).toFixed(3)
  }
  return +(rand() * cfg.spread).toFixed(3)
}

/** 每格随机 3D 冲量（爆裂飞散方向/景深层次用），写入 CSS 变量 */
export function impulseVars(rand: () => number): Record<string, string> {
  const ang = rand() * Math.PI * 2
  const dist = 22 + rand() * 30
  return {
    '--ys-tx': `${(Math.cos(ang) * dist).toFixed(1)}vw`,
    '--ys-ty': `${(Math.sin(ang) * dist).toFixed(1)}vh`,
    '--ys-rx': `${Math.round((rand() * 2 - 1) * 70)}deg`,
    '--ys-ry': `${Math.round((rand() * 2 - 1) * 70)}deg`,
    '--ys-rz': `${Math.round((rand() * 2 - 1) * 140)}deg`,
    '--ys-z': `${Math.round((rand() * 2 - 1) * 180)}px`,
    '--ys-s': `${(0.35 + rand() * 0.4).toFixed(2)}`,
  }
}
