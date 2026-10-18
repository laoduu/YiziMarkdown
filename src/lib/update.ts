/**
 * 在线更新：界面侧的纯逻辑（版本比较、是否提示、进度、大小格式化）。
 *
 * 为什么单独成模块：这里的判断一旦出错，表现是「用户被反复打扰」或「该提示时不提示」，
 * 都极难复现，所以做成纯函数用 node --test 覆盖（见 tests/update.test.ts）。
 *
 * 真正的检查 / 下载 / 安装由 tauri-plugin-updater 负责；本模块只回答
 * 「要不要把这个版本给用户看」「进度条画到哪儿」这类展示层问题。
 */

/** 去掉前导 v 与首尾空白：清单里允许写 "v1.0.0"（Tauri 明确接受），本地版本不带 v。
 *  界面统一按不带 v 的形态比较与展示，否则会出现「vv0.3.5」这种拼出来的怪东西。 */
export const normalizeVersion = (v: string): string =>
  String(v ?? '').trim().replace(/^v/i, '')

interface ParsedVersion {
  /** 主版本段：1.2.3 → [1, 2, 3] */
  main: number[]
  /** 预发布标识：正式版为 []，1.0.0-beta.1 → ['beta', '1'] */
  pre: string[]
}

/** 解析 semver（宽松版：允许 1.2 这种段数不足的写法）。无法解析返回 null */
const parseVersion = (raw: string): ParsedVersion | null => {
  const cleaned = normalizeVersion(raw).split('+')[0] // 忽略 build metadata
  const [core, ...rest] = cleaned.split('-')
  if (!/^\d+(\.\d+)*$/.test(core)) return null
  const pre = rest.join('-')
  return { main: core.split('.').map(Number), pre: pre ? pre.split('.') : [] }
}

/** 比较版本：a < b 返回 -1，相等返回 0，a > b 返回 1。
 *  任一侧无法解析时返回 0（不判断）—— 宁可「不提示」，也不要因为一个脏版本号弹更新。 */
export const compareVersion = (a: string, b: string): number => {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  if (!pa || !pb) return 0

  const len = Math.max(pa.main.length, pb.main.length)
  for (let i = 0; i < len; i++) {
    const x = pa.main[i] ?? 0
    const y = pb.main[i] ?? 0
    if (x !== y) return x < y ? -1 : 1
  }

  // 主版本相同：带预发布标识的更小（1.0.0-beta < 1.0.0）
  if (pa.pre.length && !pb.pre.length) return -1
  if (!pa.pre.length && pb.pre.length) return 1

  // 按 semver：纯数字标识 < 字母标识；标识少的更小
  const preLen = Math.max(pa.pre.length, pb.pre.length)
  for (let i = 0; i < preLen; i++) {
    const x = pa.pre[i]
    const y = pb.pre[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const xNum = /^\d+$/.test(x)
    const yNum = /^\d+$/.test(y)
    if (xNum && yNum) {
      if (Number(x) !== Number(y)) return Number(x) < Number(y) ? -1 : 1
      continue
    }
    if (xNum !== yNum) return xNum ? -1 : 1
    if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

/**
 * 要不要把这个版本提示给用户？
 * - candidate 必须**严格新于** current：清单被传成旧版本、或写错版本号时不弹提示
 * - 用户点过「跳过此版本」后，同一版本不再提示（其他版本照常提示）
 */
export const shouldOfferUpdate = (
  candidate: string,
  current: string,
  skipped?: string | null,
): boolean => {
  if (!normalizeVersion(candidate) || !normalizeVersion(current)) return false
  if (compareVersion(candidate, current) <= 0) return false
  if (skipped && compareVersion(candidate, skipped) === 0) return false
  return true
}

/** 下载进度 0~1。总大小未知时返回 null —— 界面据此画「不确定态」进度条，
 *  而不是假装 0%（那会让用户以为卡住了）。 */
export const progressRatio = (
  downloaded: number,
  total: number | null | undefined,
): number | null => {
  if (!Number.isFinite(downloaded) || !total || total <= 0) return null
  return Math.max(0, Math.min(1, downloaded / total))
}

/** 人类可读大小：1835008 → "1.8 MB" */
export const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${i === 0 ? value : Math.round(value * 10) / 10} ${units[i]}`
}
