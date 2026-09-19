/**
 * slideTiles.test.ts — 演示模式「瓷砖转场」几何与时序的单元测试。
 *
 * 运行方式：npm test（node --test，Node 原生 TS 类型剥离，无额外依赖）。
 * 被测模块零依赖，import 带显式 .ts 后缀。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildTiles, delayFor, impulseVars, tileTotalDuration, TILE_ANIM_IDS, TILE_VARIANTS, type TileConfig } from '../src/lib/slideTiles.ts'

/** 种子化随机源（mulberry32），保证测试确定性 */
const seeded = (seed: number) => () => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const cfg = (over: Partial<TileConfig> = {}): TileConfig => ({
  shape: 'square', target: 100, delay: 'random', spread: 0.4, turn: 0.5, merge: 0.25, impulse: false, ...over,
})

/** 栅格覆盖检查：每个像素恰好被一个单元覆盖（clip 为矩形时用面积判据） */
const coversExactly = (tiles: { x: number; y: number; w: number; h: number }[], W: number, H: number) => {
  const area = tiles.reduce((s, t) => s + t.w * t.h, 0)
  return Math.abs(area - W * H) < 1e-6
}

// ---------- buildTiles: 方块 ----------

test('buildTiles: 方块网格数量与无缝覆盖', () => {
  const tiles = buildTiles(400, 300, cfg())
  assert.equal(tiles.length, 4 * 3)
  assert.ok(coversExactly(tiles, 400, 300))
  assert.equal(tiles[0].x, 0)
  assert.equal(tiles[0].y, 0)
  assert.equal(tiles[5].x, 100) // 第 2 行第 2 列
  assert.equal(tiles[5].y, 100)
  assert.equal(tiles[0].clip, null)
})

test('buildTiles: 非整除尺寸时末列末行裁到边界，仍无缝覆盖', () => {
  const tiles = buildTiles(450, 320, cfg({ target: 100 }))
  assert.equal(tiles.length, 5 * 4)
  assert.ok(coversExactly(tiles, 450, 320))
  const last = tiles[tiles.length - 1]
  assert.equal(last.w, 50)
  assert.equal(last.h, 20)
})

test('buildTiles: 尺寸非法时返回空', () => {
  assert.deepEqual(buildTiles(0, 300, cfg()), [])
  assert.deepEqual(buildTiles(400, -1, cfg()), [])
})

// ---------- buildTiles: 竖条（百叶窗） ----------

test('buildTiles: 竖条满高、等宽、横向铺满', () => {
  const tiles = buildTiles(500, 300, cfg({ shape: 'strip', target: 100 }))
  assert.equal(tiles.length, 5)
  assert.ok(tiles.every((t) => t.h === 300 && t.y === 0))
  assert.ok(tiles.every((t) => t.w === 100))
  assert.ok(coversExactly(tiles, 500, 300))
})

// ---------- buildTiles: 六边形 ----------

/** 尖顶六边形的 6 个顶点（顺序：上、右上、右下、下、左下、左上） */
const hexVerts = (t: { x: number; y: number; w: number; h: number }): [number, number][] => [
  [t.x + t.w / 2, t.y],
  [t.x + t.w, t.y + t.h / 4],
  [t.x + t.w, t.y + (3 * t.h) / 4],
  [t.x + t.w / 2, t.y + t.h],
  [t.x, t.y + (3 * t.h) / 4],
  [t.x, t.y + t.h / 4],
]

/** 射线法：点是否在多边形内 */
const inPoly = (px: number, py: number, poly: [number, number][]) => {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

test('buildTiles: 六边形无缝铺满（每个采样点恰在一个六边形内）', () => {
  // 这是能抓住"奇数行左缘楔形空洞/顶部三角没补格"的判据：
  // 空洞会让底下的新页透出来，视觉上六边形退化成"带缝的方块"。
  const c = cfg({ shape: 'hex', target: 100 })
  const tiles = buildTiles(400, 400, c)
  let holes = 0
  let overlaps = 0
  for (let py = 2; py < 400; py += 7) {
    for (let px = 2; px < 400; px += 7) {
      const n = tiles.filter((t) => inPoly(px, py, hexVerts(t))).length
      if (n === 0) holes++
      else if (n > 1) overlaps++
    }
  }
  assert.equal(holes, 0, `有 ${holes} 个采样点不在任何六边形内（铺不满）`)
  assert.equal(overlaps, 0, `有 ${overlaps} 个采样点落在多个六边形内（重叠）`)
})

test('buildTiles: 六边形相邻行错位半宽、全部带 clip、含出界补格', () => {
  const tiles = buildTiles(400, 400, cfg({ shape: 'hex', target: 100 }))
  const h = (100 * 2) / Math.sqrt(3)
  const rowStep = (h * 3) / 4
  assert.ok(tiles.every((t) => t.clip && t.clip.startsWith('polygon(')))
  assert.ok(tiles.every((t) => Math.abs(t.h - h) < 1e-9))
  const row0 = tiles.filter((t) => t.y === 0)
  const row1 = tiles.filter((t) => Math.abs(t.y - rowStep) < 1e-9)
  assert.equal(row1[0].x - row0[0].x, 50) // 相邻行错位半宽
  // 必须补出界格：最左列在负坐标、最上/最下行超出区域
  assert.ok(Math.min(...tiles.map((t) => t.x)) < 0)
  assert.ok(Math.min(...tiles.map((t) => t.y)) < 0)
  assert.ok(Math.max(...tiles.map((t) => t.y + t.h)) > 400)
})

// ---------- delayFor ----------

test('delayFor: random 落在 [0, spread] 且随种子确定', () => {
  const tiles = buildTiles(400, 300, cfg())
  // 随机源必须整个 map 共用一份（每格新建种子源会让所有格拿到同一个数）
  const run = () => {
    const rand = seeded(7)
    return tiles.map((t) => delayFor(t, 400, 300, cfg(), rand))
  }
  const d1 = run()
  assert.deepEqual(d1, run())
  assert.ok(d1.every((d) => d >= 0 && d <= 0.4))
  assert.ok(new Set(d1).size > 1, '各格延迟应互不相同')
})

test('delayFor: wave 中心≈0、角上≈spread、随距离单调不减', () => {
  const c = cfg({ delay: 'wave', spread: 0.5 })
  const tiles = buildTiles(400, 300, c)
  const rand = seeded(1)
  const center = tiles.find((t) => t.x === 100 && t.y === 100)! // 紧邻中心的格
  const corner = tiles.find((t) => t.x === 0 && t.y === 0)!
  const dc = delayFor(center, 400, 300, c, rand)
  const dk = delayFor(corner, 400, 300, c, rand)
  assert.ok(dc < 0.2, `中心应接近 0，实际 ${dc}`)
  // 注意：最角上的格子其【中心】离画面中心还有一段距离，不会到满 spread
  assert.ok(dk > 0.3, `角上应明显大于中心，实际 ${dk}`)
  const all = tiles.map((t) => delayFor(t, 400, 300, c, seeded(1)))
  assert.ok(Math.max(...all) > c.spread * 0.7, `最远格应接近 spread，实际 ${Math.max(...all)}`)
  // 单调性：距离越远延迟越大
  const dist = (t: { x: number; y: number; w: number; h: number }) =>
    Math.hypot(t.x + t.w / 2 - 200, t.y + t.h / 2 - 150)
  const sorted = [...tiles].sort((a, b) => dist(a) - dist(b))
  const delays = sorted.map((t) => delayFor(t, 400, 300, c, seeded(1)))
  for (let i = 1; i < delays.length; i++) assert.ok(delays[i] >= delays[i - 1] - 1e-9)
})

test('delayFor: row 从左到右递增且不超上限', () => {
  const c = cfg({ shape: 'strip', delay: 'row', spread: 0.3, target: 100 })
  const tiles = buildTiles(500, 300, c)
  const delays = tiles.map((t) => delayFor(t, 500, 300, c, seeded(3)))
  for (let i = 1; i < delays.length; i++) assert.ok(delays[i] > delays[i - 1])
  assert.ok(delays[delays.length - 1] <= 0.3 + 0.04 + 1e-9)
})

// ---------- impulseVars ----------

test('impulseVars: 输出全部冲量变量且单位正确', () => {
  const v = impulseVars(seeded(11))
  for (const k of ['--ys-tx', '--ys-ty', '--ys-rx', '--ys-ry', '--ys-rz', '--ys-z', '--ys-s']) {
    assert.ok(k in v, `缺少 ${k}`)
  }
  assert.match(v['--ys-tx'], /^-?\d+(\.\d+)?vw$/)
  assert.match(v['--ys-ty'], /^-?\d+(\.\d+)?vh$/)
  assert.match(v['--ys-rz'], /^-?\d+deg$/)
  assert.match(v['--ys-z'], /^-?\d+px$/)
  assert.match(v['--ys-s'], /^0\.\d+$/)
  const s = Number(v['--ys-s'])
  assert.ok(s >= 0.35 && s < 0.76)
})

test('impulseVars: 同种子结果一致、不同种子有差异', () => {
  assert.deepEqual(impulseVars(seeded(5)), impulseVars(seeded(5)))
  assert.notDeepEqual(impulseVars(seeded(5)), impulseVars(seeded(6)))
})

// ---------- TILE_VARIANTS ----------

test('TILE_VARIANTS: 覆盖全部瓷砖变体且配置合法', () => {
  const ids = ['checkerboard', 'cube3d', 'shatter', 'depth', 'hex', 'blinds']
  for (const id of ids) {
    const c = TILE_VARIANTS[id]
    assert.ok(c, `缺少变体 ${id}`)
    assert.ok(c.target > 0 && c.spread > 0 && c.turn > 0 && c.merge > 0)
    assert.ok(buildTiles(1920, 1080, c).length > 0)
  }
  assert.deepEqual([...TILE_ANIM_IDS].sort(), [...ids].sort())
  assert.equal(TILE_VARIANTS.blinds.shape, 'strip')
  assert.equal(TILE_VARIANTS.shatter.impulse, true)
  assert.equal(TILE_VARIANTS.depth.impulse, true)
  // depth 用波延迟（按到中心的距离），其余用随机/行扫
  assert.equal(TILE_VARIANTS.depth.delay, 'wave')
  assert.equal(TILE_VARIANTS.checkerboard.delay, 'random')
  assert.equal(TILE_VARIANTS.blinds.delay, 'row')
})

test('tileTotalDuration: 总时长 = 延迟铺开 + 单格 + 融合', () => {
  const c = cfg({ spread: 0.4, turn: 0.5, merge: 0.25 })
  assert.equal(tileTotalDuration(c), 1.15)
  // 各变体总时长都应在 0.8~1.6s 之间（转场不能拖太久）
  for (const [id, v] of Object.entries(TILE_VARIANTS)) {
    const t = tileTotalDuration(v)
    assert.ok(t > 0.8 && t < 1.6, `${id} 总时长 ${t}s 不合理`)
  }
})

test('TILE_VARIANTS: 1920×1080 下各变体单元数在可承受范围', () => {
  for (const [id, c] of Object.entries(TILE_VARIANTS)) {
    const n = buildTiles(1920, 1080, c).length
    assert.ok(n > 8, `${id} 单元太少：${n}`)
    // 每单元 2 份整页克隆，超过 ~160 会明显变重（实测 60 格 1140 元素/44ms）
    assert.ok(n <= 160, `${id} 单元过多：${n}`)
  }
})
