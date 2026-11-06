/**
 * 剪贴板里的原始图片（截图 / 资源管理器里复制的图片文件）。
 *
 * 与 text/html、text/plain 两条粘贴路径互斥处理：
 * 只要有图片项就优先落盘成文件，避免把图片写成 data URL 撑爆文档。
 */

/** 从 DataTransfer 收集图片 File（items 优先，files 兜底；同一文件去重） */
export function collectClipboardImages(data: DataTransfer): File[] {
  const out: File[] = []
  const seen = new Set<string>()

  const push = (file: File | null) => {
    if (!file) return
    // Explorer 复制图片时 Chromium 有时给出空 MIME：按扩展名兜底
    const imageLike = file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name)
    if (!imageLike) return
    const key = `${file.name}|${file.size}|${file.type}|${file.lastModified}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(file)
  }

  const items = (data as unknown as { items?: DataTransferItemList }).items
  if (items) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item?.kind === 'file' && (item.type.startsWith('image/') || !item.type)) {
        push(item.getAsFile())
      }
    }
  }
  if (!out.length) {
    for (const file of Array.from(data.files || [])) push(file)
  }
  return out
}

/** 剪贴板图片 → 纯 base64（不含 `data:...;base64,` 前缀） */
export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error || new Error('read failed'))
    reader.readAsDataURL(file)
  })
}

/** 文件名去扩展名作为 alt 文本（截图常见 `image.png` → `image`） */
export function imageAltFromFile(file: File): string {
  const name = (file.name || '').replace(/\.[^.]+$/, '').trim()
  return name || 'image'
}
