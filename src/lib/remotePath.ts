/**
 * 远程路径与展示的纯函数工具。
 *
 * 刻意**不引入任何依赖**：一是这些函数是纯粹的字符串运算，二是这样可以直接被
 * `node --test` 加载验证（`lib/webdav.ts` 依赖 `./tauri` 而无扩展名导入，
 * Node 的 ESM 解析器加载不了，所以纯逻辑单独放这里）。
 */

/** 规范化服务器地址：去空白 + 补结尾斜杠（与设置界面保存时的处理一致）。 */
export function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`
}

/** 把目录路径与名称拼成子路径，避免出现 `//`。 */
export function joinPath(dir: string, name: string): string {
  const base = dir.endsWith('/') ? dir.slice(0, -1) : dir
  return `${base}/${name}`
}

/** 父目录路径；已在根目录时返回 `/`。 */
export function parentPath(path: string): string {
  const trimmed = path.endsWith('/') ? path.slice(0, -1) : path
  const idx = trimmed.lastIndexOf('/')
  return idx <= 0 ? '/' : trimmed.slice(0, idx)
}

/** 路径最后一段（文件名）。 */
export function baseName(path: string): string {
  const trimmed = path.endsWith('/') ? path.slice(0, -1) : path
  return trimmed.slice(trimmed.lastIndexOf('/') + 1)
}

/**
 * 归一化远程路径用于**比较**：去掉结尾斜杠，根目录保持 `/`。
 *
 * 必须归一化的原因：目录条目的 path 直接来自服务器返回的 href，天然带结尾斜杠
 * （`/Notes/`，因为集合 URL 需要以 `/` 结尾）；而 `parentPath()` 的结果不带
 * （`/Notes`）。两者语义相同，直接 `===` 比较会永远不相等。
 */
export function normalizeRemotePath(path: string): string {
  const trimmed = path.replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed
}

/**
 * 把任意来源（用户输入、字符串拼接）的远程路径收敛成**规范形式**：
 * 折叠重复斜杠、丢弃 `.` 段、按词法消解 `..`、保证单个前导斜杠、去掉结尾斜杠。
 *
 * 为什么必须做：目录条目的 path 带结尾斜杠，用 `` `${dir}/${name}` `` 这种朴素拼接
 * 会得到 `/Notes//doc.md`。该路径 PUT 到服务器后（服务端会折叠空段）实际落在
 * `/Notes/doc.md`，于是 tab 上记的远程身份与云端浏览器列出的路径不一致 ——
 * 再次打开同一文件时去重失败，会多开一个 tab。
 *
 * @returns 规范路径；若 `..` 越出根目录则返回 `null`
 */
export function canonicalRemotePath(raw: string): string | null {
  const out: string[] = []
  for (const seg of raw.trim().split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (out.length === 0) return null // 越出根目录
      out.pop()
      continue
    }
    out.push(seg)
  }
  return `/${out.join('/')}`
}

/** 人类可读的文件大小。 */
export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
