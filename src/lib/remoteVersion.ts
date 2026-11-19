/**
 * 云端版本校验：打开已缓存文档时比较本地与云端正文。
 *
 * 只做「内容是否变化」的判断与可读的差异摘要，不负责交互。
 * 交互（弹窗决策）由 App 的 remoteVersion 状态驱动。
 */

export interface ContentComparison {
  identical: boolean
  localBytes: number
  remoteBytes: number
  localLines: number
  remoteLines: number
  /** 前 12 位十六进制，仅用于人眼比对，不作为冲突判据 */
  localHash: string
  remoteHash: string
  /** 1 基行号；逐行比较时没有任何差异则为 null */
  firstDiffLine: number | null
  /** 本地副本最后保存时间（Unix 毫秒）；读不到文件元信息时为 null */
  localSavedAt: number | null
  /** 云端 Last-Modified（Unix 毫秒）；服务器未提供时为 null */
  remoteSavedAt: number | null
}

/** 两侧的保存时间（Unix 毫秒）。与正文比较解耦，缺一项只影响展示 */
export interface SavedAtInput {
  localSavedAt?: number | null
  remoteSavedAt?: number | null
}

/** 远端文件缺失或已有新版本时的待决策状态 */
export interface RemoteVersionPrompt {
  tabId: string
  remotePath: string
  name: string
  localContent: string
  /** 远端不存在时为 null */
  remoteContent: string | null
  remoteEtag: string | null
  remoteSize: number
  localDirty: boolean
  missing: boolean
  comparison: ContentComparison | null
}

const encoder = new TextEncoder()

function splitLines(text: string): string[] {
  // 统一行尾，避免 CRLF/LF 的写法差异被当成内容差异
  return text.replace(/\r\n?/g, '\n').split('\n')
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** FNV-1a：WebCrypto 不可用时的降级摘要（仍能区分绝大多数内容差异） */
function fnv1a(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

async function sha256(text: string): Promise<string> {
  try {
    const subtle = globalThis.crypto?.subtle
    if (subtle) {
      const digest = await subtle.digest('SHA-256', encoder.encode(text))
      return hex(digest)
    }
  } catch {
    // 某些 WebView 在非安全上下文里没有 subtle，走降级
  }
  return fnv1a(text)
}

const HASH_TAG = 'sha256:'

export async function hashContent(text: string): Promise<string> {
  const value = await sha256(text)
  return value.length === 64 ? HASH_TAG + value : 'fnv1a:' + value
}

export function byteLength(text: string): number {
  return encoder.encode(text).byteLength
}

/** 合法时间戳（正数且有限）才保留，其余一律视为未知 */
function normalizeTimestamp(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  return Math.round(value)
}

/**
 * 解析服务器给的时间字符串。
 *
 * WebDAV 的 `getlastmodified` 是 RFC 1123（`Wed, 01 Jan 2025 00:00:00 GMT`），
 * 也有服务器给 ISO 8601；`Date.parse` 两种都认，认不出就返回 null（展示为未知）。
 */
export function parseServerTime(raw: string | null | undefined): number | null {
  if (!raw) return null
  const ms = Date.parse(raw.trim())
  return Number.isFinite(ms) ? normalizeTimestamp(ms) : null
}

/** 本地时间 `YYYY-MM-DD HH:mm`；时间未知或非法时返回空串（由界面显示占位符） */
export function formatSavedAt(ms: number | null | undefined): string {
  const value = normalizeTimestamp(ms)
  if (value === null) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * 比较本地正文与云端正文。
 *
 * 判据是「规范化行尾后的完整字符串」，比单纯比字节数更可靠：
 * 服务器可能重写换行符，但那不算内容冲突。
 * 保存时间只用于展示（谁更新），**不参与** identical 判定。
 */
export async function compareContent(
  local: string,
  remote: string,
  times?: SavedAtInput,
): Promise<ContentComparison> {
  const localLines = splitLines(local)
  const remoteLines = splitLines(remote)
  let firstDiffLine: number | null = null
  const max = Math.max(localLines.length, remoteLines.length)
  for (let i = 0; i < max; i++) {
    if ((localLines[i] ?? null) !== (remoteLines[i] ?? null)) {
      firstDiffLine = i + 1
      break
    }
  }
  const [localHash, remoteHash] = await Promise.all([sha256(local), sha256(remote)])
  return {
    identical: firstDiffLine === null,
    localBytes: byteLength(local),
    remoteBytes: byteLength(remote),
    localLines: localLines.length,
    remoteLines: remoteLines.length,
    localHash,
    remoteHash,
    firstDiffLine,
    localSavedAt: normalizeTimestamp(times?.localSavedAt),
    remoteSavedAt: normalizeTimestamp(times?.remoteSavedAt),
  }
}

export function formatByteCount(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
