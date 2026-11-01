/**
 * EPUB 阅读支持：把 EPUB 的 XHTML 章节整理成阅读模式可直接分页的 HTML。
 *
 * 设计取舍：
 *   · 不转换成 Markdown，避免公式 / Mermaid / 表格 / 脚注在来回转换中丢失；
 *   · 忽略出版社 CSS，统一使用应用阅读主题（暗色、字号、字体才可控）；
 *   · 只保留文字流 EPUB（EPUB 3 / 基础 EPUB 2），固定版式和 DRM 明确拒绝；
 *   · 图片以 blob URL 注入，阅读结束时统一释放。
 */

import JSZip from 'jszip'
import type { ReaderOutlineEntry } from './readerPagination'
import { postRenderMermaid } from '../renderers/mermaid.ts'
import { readThemePalette } from './themePalette.ts'

const EPUB_NS = 'http://www.idpf.org/2007/ops'
const XLINK_NS = 'http://www.w3.org/1999/xlink'

export interface EpubBookSource {
  /** 合并后的正文 HTML（章节顺序，已清洗、已改写链接、图片已注入） */
  html: string
  /** 书名（dc:title，缺失时回退首个标题 / 文件名） */
  title: string
  /** 阅读模式封面/扉页使用的元信息 */
  meta: Record<string, string>
  /** EPUB 导航（nav 优先，NCX 其次，最后按标题推导） */
  outline: ReaderOutlineEntry[]
  /** EPUB 内嵌封面图（blob URL，可能为空） */
  coverImage?: string
  /** 释放图片 blob URL；退出阅读模式时调用 */
  dispose: () => void
}

export type EpubOpenErrorCode = 'invalid' | 'drm' | 'fixed-layout' | 'empty'

export class EpubOpenError extends Error {
  code: EpubOpenErrorCode

  constructor(code: EpubOpenErrorCode, message: string) {
    super(message)
    this.name = 'EpubOpenError'
    this.code = code
  }
}

interface ManifestItem {
  id: string
  href: string
  path: string
  mediaType: string
  properties: string
}

interface Chapter {
  path: string
  box: HTMLElement
  idMap: Map<string, string>
}

interface ParsedChapter {
  path: string
  nodes: Node[]
}

function localName(el: Element): string {
  const name = el.localName || el.tagName || ''
  const idx = name.indexOf(':')
  return (idx >= 0 ? name.slice(idx + 1) : name).toLowerCase()
}

function isElement(node: Node): node is Element {
  return node.nodeType === 1
}

function decodePart(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

function splitHref(href: string): { path: string; fragment: string } {
  const hash = href.indexOf('#')
  const pathPart = hash >= 0 ? href.slice(0, hash) : href
  const fragPart = hash >= 0 ? href.slice(hash + 1) : ''
  const query = pathPart.indexOf('?')
  return {
    path: decodePart((query >= 0 ? pathPart.slice(0, query) : pathPart).replace(/\\/g, '/')),
    fragment: decodePart(fragPart),
  }
}

/** 把相对路径按 base 所在目录解析成 ZIP 内路径（POSIX 分隔符） */
function resolvePath(basePath: string, href: string): string {
  const { path } = splitHref(href)
  if (!path) return ''
  const baseDir = basePath.includes('/') ? basePath.slice(0, basePath.lastIndexOf('/')) : ''
  const absolute = path.startsWith('/')
  const combined = absolute ? path.slice(1) : (baseDir ? `${baseDir}/${path}` : path)
  const parts = combined.split('/')
  const out: string[] = []
  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return out.join('/')
}

/** 供单元测试：EPUB 内相对路径解析 */
export function resolveEpubPath(basePath: string, href: string): string {
  return resolvePath(basePath, href)
}

function mimeOf(path: string): string {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  switch (ext) {
    case 'jpg':
    case 'jpeg': return 'image/jpeg'
    case 'png': return 'image/png'
    case 'gif': return 'image/gif'
    case 'webp': return 'image/webp'
    case 'svg': return 'image/svg+xml'
    case 'bmp': return 'image/bmp'
    case 'avif': return 'image/avif'
    case 'ico': return 'image/x-icon'
    default: return 'application/octet-stream'
  }
}

function parseDocument(text: string): Document {
  try {
    const xml = new DOMParser().parseFromString(text, 'application/xml')
    if (xml.documentElement && !xml.getElementsByTagName('parsererror').length) return xml
  } catch {
    // 有些 EPUB 的 XHTML 含未定义实体，退回宽松的 HTML 解析
  }
  return new DOMParser().parseFromString(text, 'text/html')
}

function allElements(root: Element): Element[] {
  return Array.from(root.querySelectorAll('*'))
}

function findFirst(root: Element | Document, name: string): Element | null {
  const lower = name.toLowerCase()
  if (root.nodeType === 1 && localName(root as Element) === lower) return root as Element
  for (const el of Array.from(root.querySelectorAll('*'))) {
    if (localName(el) === lower) return el
  }
  return null
}

function findAll(root: Element | Document, name: string): Element[] {
  const lower = name.toLowerCase()
  const out: Element[] = []
  if (root.nodeType === 1 && localName(root as Element) === lower) out.push(root as Element)
  for (const el of Array.from(root.querySelectorAll('*'))) {
    if (localName(el) === lower) out.push(el)
  }
  return out
}

function directChildren(el: Element, name: string): Element[] {
  const lower = name.toLowerCase()
  return Array.from(el.children).filter((c) => localName(c) === lower)
}

function childText(el: Element): string {
  return (el.textContent || '').replace(/\s+/g, ' ').trim()
}

function attr(el: Element, name: string): string {
  const direct = el.getAttribute(name)
  if (direct != null) return direct
  if (name.startsWith('epub:')) return el.getAttributeNS(EPUB_NS, name.slice(5)) || ''
  if (name.startsWith('xlink:')) return el.getAttributeNS(XLINK_NS, name.slice(6)) || ''
  return ''
}

function epubTypes(el: Element): string[] {
  return attr(el, 'epub:type').split(/\s+/).filter(Boolean).map((s) => s.toLowerCase())
}

function hasEpubType(root: Element, token: string): boolean {
  if (epubTypes(root).includes(token)) return true
  return allElements(root).some((el) => epubTypes(el).includes(token))
}

function directNavLists(li: Element): Element[] {
  return Array.from(li.children).filter((c) => {
    const name = localName(c)
    return name === 'ol' || name === 'ul'
  })
}

function ownAnchor(li: Element): Element | null {
  const anchors = Array.from(li.querySelectorAll('a'))
  return anchors.find((a) => a.closest('li') === li) || null
}

function walkNavList(list: Element, level: number, out: RawOutlineEntryBase[]): void {
  for (const li of directChildren(list, 'li')) {
    const a = ownAnchor(li)
    if (a) {
      const href = attr(a, 'href').trim()
      const title = childText(a)
      if (href && title) out.push({ href, title, level: Math.min(3, level) })
    }
    for (const sub of directNavLists(li)) walkNavList(sub, level + 1, out)
  }
}

interface RawOutlineEntryBase {
  href: string
  title: string
  level: number
}

function parseNavOutline(doc: Document): RawOutlineEntryBase[] {
  const navs = findAll(doc, 'nav')
  const tocNav = navs.find((nav) => epubTypes(nav).includes('toc')) || navs[0]
  if (!tocNav) return []
  const list = findFirst(tocNav, 'ol') || findFirst(tocNav, 'ul')
  if (!list) return []
  const out: RawOutlineEntryBase[] = []
  walkNavList(list, 1, out)
  return out
}

function parseNcxOutline(doc: Document): RawOutlineEntryBase[] {
  const navMap = findFirst(doc, 'navmap')
  if (!navMap) return []
  const out: RawOutlineEntryBase[] = []
  const walk = (parent: Element, level: number) => {
    for (const point of directChildren(parent, 'navpoint')) {
      const label = findFirst(point, 'navlabel')
      const content = findFirst(point, 'content')
      const href = content ? attr(content, 'src').trim() : ''
      const title = label ? childText(label) : ''
      if (href && title) out.push({ href, title, level: Math.min(3, level) })
      walk(point, level + 1)
    }
  }
  walk(navMap, 1)
  return out
}

function cleanMetaText(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

const BLOCKED_TAGS = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button',
  'select', 'textarea', 'video', 'audio', 'source', 'track', 'canvas', 'link',
  'meta', 'base', 'template', 'noscript', 'nav',
])

const BLOCK_CHILDREN = new Set([
  'p', 'div', 'section', 'article', 'header', 'footer', 'main', 'h1', 'h2',
  'h3', 'h4', 'h5', 'h6', 'table', 'pre', 'ul', 'ol', 'blockquote', 'figure',
  'img', 'svg', 'picture', 'hr',
])

function canUnwrapDiv(el: Element): boolean {
  const children = Array.from(el.children)
  return children.some((c) => BLOCK_CHILDREN.has(localName(c)))
}

function makeAnchor(doc: Document, id: string): HTMLElement {
  const span = doc.createElement('span')
  span.setAttribute('id', id)
  span.setAttribute('class', 'epub-chapter-anchor')
  return span
}

function flattenNodes(
  nodes: Node[],
  doc: Document,
  out: Node[],
): void {
  for (const node of nodes) {
    if (node.nodeType === 3) {
      const text = node.nodeValue || ''
      if (text.trim()) {
        const p = doc.createElement('p')
        p.textContent = text
        out.push(p)
      }
      continue
    }
    if (!isElement(node)) continue

    const el = node
    const name = localName(el)
    if (name === 'nav') continue

    const unwrap = name === 'section' || name === 'article' || name === 'header'
      || name === 'footer' || name === 'main' || name === 'aside'
      || (name === 'div' && canUnwrapDiv(el))

    if (unwrap) {
      if (el.id) out.push(makeAnchor(doc, el.id))
      flattenNodes(Array.from(el.childNodes), doc, out)
      continue
    }

    if (name === 'figure' || name === 'picture') {
      if (el.id) out.push(makeAnchor(doc, el.id))
      flattenNodes(Array.from(el.childNodes), doc, out)
      continue
    }

    if (name === 'img' || name === 'svg') {
      const p = doc.createElement('p')
      p.appendChild(el)
      out.push(p)
      continue
    }

    out.push(el)
  }
}

function collectNodes(root: HTMLElement): Element[] {
  return Array.from(root.querySelectorAll('*'))
}

function uniqueId(prefix: string, raw: string, seen: Set<string>): string {
  const base = prefix + raw
  let id = base
  let n = 2
  while (seen.has(id)) id = `${base}-${n++}`
  seen.add(id)
  return id
}

function sanitizeElement(el: Element, docPath: string, assetUrl: (path: string) => string | null): void {
  const name = localName(el)
  if (BLOCKED_TAGS.has(name)) {
    if (name === 'style' && el.closest('svg')) return
    el.remove()
    return
  }

  const inSvg = !!el.closest('svg')
  for (const a of Array.from(el.attributes)) {
    const key = a.name.toLowerCase()
    if (key.startsWith('on') || key === 'srcdoc' || key === 'formaction' || key === 'xml:base' || key === 'base') {
      el.removeAttribute(a.name)
      continue
    }
    if (key === 'style' && !inSvg) {
      el.removeAttribute(a.name)
      continue
    }
    if (key === 'srcset' || key === 'poster' || key === 'background') {
      el.removeAttribute(a.name)
      continue
    }
    if (key === 'href' || key === 'src' || key === 'xlink:href') {
      const value = a.value.trim()
      if (/^(javascript|vbscript|file):/i.test(value)) {
        el.removeAttribute(a.name)
      } else if (key === 'src' && /^data:/i.test(value) && !/^data:image\//i.test(value)) {
        el.removeAttribute(a.name)
      }
    }
  }

  if (name === 'a') {
    const anchorName = el.getAttribute('name')
    if (!el.id && anchorName) el.setAttribute('id', anchorName)
    el.removeAttribute('name')
  }

  if (name === 'img') {
    const src = el.getAttribute('src') || ''
    const resolved = resolveImageUrl(src, docPath, assetUrl)
    if (resolved) el.setAttribute('src', resolved)
    else el.removeAttribute('src')
  }

  if (name === 'image') {
    const href = el.getAttribute('href') || el.getAttributeNS(XLINK_NS, 'href') || ''
    const resolved = resolveImageUrl(href, docPath, assetUrl)
    if (resolved) {
      el.setAttribute('href', resolved)
      el.setAttributeNS(XLINK_NS, 'xlink:href', resolved)
    } else {
      el.removeAttribute('href')
      el.removeAttributeNS(XLINK_NS, 'href')
    }
  }
}

function resolveImageUrl(src: string, docPath: string, assetUrl: (path: string) => string | null): string | null {
  const value = src.trim()
  if (!value) return null
  if (/^(data:image\/|blob:|https?:)/i.test(value)) return value
  const { path } = splitHref(value)
  if (!path) return null
  return assetUrl(resolvePath(docPath, value))
}

function rewriteLinks(
  box: HTMLElement,
  docPath: string,
  chapterByPath: Map<string, number>,
  chapters: Chapter[],
): void {
  for (const a of Array.from(box.querySelectorAll('a'))) {
    const href = a.getAttribute('href') || ''
    const value = href.trim()
    if (!value) continue

    if (/^(https?:|mailto:|tel:)/i.test(value)) continue
    if (/^(javascript|vbscript|data|file|blob):/i.test(value)) {
      a.removeAttribute('href')
      continue
    }

    const { path, fragment } = splitHref(value)
    const targetPath = path ? resolvePath(docPath, value) : docPath
    const targetIndex = chapterByPath.get(targetPath)
    if (targetIndex == null) {
      a.removeAttribute('href')
      continue
    }

    const target = chapters[targetIndex]
    if (!target) {
      a.removeAttribute('href')
      continue
    }
    const startId = `c${targetIndex + 1}-start`
    const id = (fragment && target.idMap.get(fragment)) || startId
    a.setAttribute('href', `#${id}`)
  }
}

function hasDrmMarker(zip: JSZip, encryption: string | null): boolean {
  if (zip.file('META-INF/rights.xml') || zip.file('META-INF/license.lcpl')) return true
  return !!encryption && /\.(xhtml|html|opf|ncx)\b/i.test(encryption)
}

async function readText(zip: JSZip, path: string): Promise<string | null> {
  const file = findZipFile(zip, path)
  if (!file) return null
  return file.async('string')
}

function findZipFile(zip: JSZip, path: string): JSZip.JSZipObject | null {
  const direct = zip.file(path)
  if (direct) return direct
  const needle = path.toLowerCase()
  const key = Object.keys(zip.files).find((k) => k.toLowerCase() === needle)
  return key ? zip.file(key) : null
}

function fileStem(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1)
  return decodePart(name.replace(/\.(xhtml|html|htm|xml)$/i, ''))
}

/**
 * 解析 EPUB 字节。失败时抛 `EpubOpenError`，调用方按 code 显示本地化文案。
 */
export async function parseEpub(
  bytes: Uint8Array,
  opts?: { fallbackTitle?: string },
): Promise<EpubBookSource> {
  const zip = await JSZip.loadAsync(bytes)
  const encryption = await readText(zip, 'META-INF/encryption.xml')
  if (hasDrmMarker(zip, encryption)) {
    throw new EpubOpenError('drm', 'This EPUB is encrypted or DRM-protected.')
  }

  const containerText = await readText(zip, 'META-INF/container.xml')
  if (!containerText) throw new EpubOpenError('invalid', 'Missing META-INF/container.xml.')

  const containerDoc = parseDocument(containerText)
  const rootfile = findFirst(containerDoc, 'rootfile')
  let opfPath = rootfile ? attr(rootfile, 'full-path') : ''
  opfPath = opfPath.replace(/\\/g, '/').replace(/^\//, '')
  if (!opfPath) {
    const opfKey = Object.keys(zip.files).find((k) => k.toLowerCase().endsWith('.opf'))
    if (!opfKey) throw new EpubOpenError('invalid', 'Missing package document.')
    opfPath = opfKey
  }

  const opfText = await readText(zip, opfPath)
  if (!opfText) throw new EpubOpenError('invalid', 'Cannot read package document.')
  const opfDoc = parseDocument(opfText)

  // 固定版式（漫画/画册）不是文字流，分页阅读会失真。
  const metas = findAll(opfDoc, 'meta')
  for (const meta of metas) {
    const prop = (attr(meta, 'property') || attr(meta, 'name') || '').toLowerCase()
    const content = (attr(meta, 'content') || childText(meta) || '').toLowerCase()
    if ((prop === 'rendition:layout' || prop === 'fixed-layout') && /pre-paginated|true|fixed/i.test(content)) {
      throw new EpubOpenError('fixed-layout', 'Fixed-layout EPUB is not supported yet.')
    }
  }

  const metadataEl = findFirst(opfDoc, 'metadata')
  const metadataRoot = metadataEl || opfDoc.documentElement
  const metaValues = (name: string): string[] =>
    findAll(metadataRoot, name).map((el) => cleanMetaText(childText(el))).filter(Boolean)

  const titles = metaValues('title')
  const creators = metaValues('creator')
  const dates = metaValues('date')
  const descriptions = metaValues('description')
  const languages = metaValues('language')

  const manifestEl = findFirst(opfDoc, 'manifest')
  if (!manifestEl) throw new EpubOpenError('invalid', 'Missing manifest.')
  const manifest: ManifestItem[] = directChildren(manifestEl, 'item').map((item) => {
    const href = attr(item, 'href')
    const rel = href.replace(/\\/g, '/')
    return {
      id: attr(item, 'id'),
      href: rel,
      path: resolvePath(opfPath, rel),
      mediaType: attr(item, 'media-type'),
      properties: attr(item, 'properties'),
    }
  })

  const spineEl = findFirst(opfDoc, 'spine')
  if (!spineEl) throw new EpubOpenError('invalid', 'Missing spine.')
  const spineRefs = directChildren(spineEl, 'itemref')
  const byId = new Map(manifest.map((item) => [item.id, item]))
  const navItems = manifest.filter((item) => item.properties.split(/\s+/).includes('nav'))
  const navPaths = new Set(navItems.map((item) => item.path))
  const ncxId = attr(spineEl, 'toc')
  const ncxItem = (ncxId ? byId.get(ncxId) : null)
    || manifest.find((item) => item.mediaType === 'application/x-dtbncx+xml')
  if (ncxItem) navPaths.add(ncxItem.path)

  const guide = findFirst(opfDoc, 'guide')
  const guideRefs = guide ? directChildren(guide, 'reference') : []
  const guidePaths = (type: string): Set<string> => new Set(
    guideRefs
      .filter((r) => attr(r, 'type').toLowerCase() === type)
      .map((r) => resolvePath(opfPath, attr(r, 'href')))
      .filter(Boolean),
  )
  const coverDocPaths = guidePaths('cover')
  const tocDocPaths = guidePaths('toc')

  // 封面图：EPUB3 properties="cover-image" → EPUB2 meta name="cover" → 封面文档里的第一张图。
  let coverPath = ''
  const coverItem = manifest.find((item) => item.properties.split(/\s+/).includes('cover-image'))
  if (coverItem) coverPath = coverItem.path
  if (!coverPath) {
    const coverMeta = metas.find((meta) => (attr(meta, 'name') || '').toLowerCase() === 'cover')
    if (coverMeta) {
      const id = attr(coverMeta, 'content')
      const item = byId.get(id)
      if (item) coverPath = item.path
    }
  }

  const objectUrls: string[] = []
  const makeAssetUrl = async (path: string): Promise<string | null> => {
    const file = findZipFile(zip, path)
    if (!file) return null
    try {
      const data = await file.async('uint8array')
      const url = URL.createObjectURL(new Blob([data as BlobPart], { type: mimeOf(path) }))
      objectUrls.push(url)
      return url
    } catch {
      return null
    }
  }

  // 预先把图片解出来，避免 DOM 清洗阶段出现异步回调。
  const assetUrls = new Map<string, string>()
  const preloadAsset = async (path: string): Promise<string | null> => {
    if (!path) return null
    const cached = assetUrls.get(path)
    if (cached) return cached
    const url = await makeAssetUrl(path)
    if (url) assetUrls.set(path, url)
    return url
  }

  const htmlDoc = document.implementation.createHTMLDocument('epub-reader')
  let parsed: ParsedChapter[] = []
  let chapters: Chapter[] = []

  /** 有的 EPUB 省略 media-type，或写成带参数的 MIME；按扩展名兜底。 */
  const readableSpineItem = (item: ManifestItem, fallback: boolean): boolean => {
    const mt = (item.mediaType || '').toLowerCase()
    if (mt.includes('xhtml') || mt.includes('html')) return true
    if (/\.(xhtml|html|htm)$/i.test(item.path)) return true
    // 第二遍放宽：允许缺 media-type 的 XHTML/DTBook XML。
    return fallback && (mt === '' || mt.includes('xml')) && !/\.(ncx|opf)$/i.test(item.path)
  }

  const spineItems = spineRefs
    .map((ref) => ({ item: byId.get(attr(ref, 'idref')), linear: attr(ref, 'linear') }))
    .filter((entry): entry is { item: ManifestItem; linear: string } => !!entry.item)

  // 第一遍按标准跳过封面/扉页/目录页和 linear="no"；若整本没有任何可读章节，
  // 第二遍放宽这些过滤，避免把不规范的 EPUB 误判成"没有内容"。
  for (const fallback of [false, true]) {
    parsed = []
    const candidates = fallback
      ? manifest
        .filter((item) => readableSpineItem(item, true))
        .map((item) => ({ item, linear: '' }))
      : spineItems.length
        ? spineItems
        : manifest.filter((item) => readableSpineItem(item, false)).map((item) => ({ item, linear: '' }))

    for (const entry of candidates) {
      const item = entry.item
      if (!fallback && entry.linear.toLowerCase() === 'no') continue
      if (!readableSpineItem(item, fallback)) continue
      if (navPaths.has(item.path)) continue

      const text = await readText(zip, item.path)
      if (!text) continue
      const doc = parseDocument(text)
      const body = findFirst(doc, 'body')
      if (!body) continue

      const coverDoc = coverDocPaths.has(item.path) || hasEpubType(body, 'cover') || hasEpubType(body, 'titlepage')
      const tocDoc = tocDocPaths.has(item.path) || hasEpubType(body, 'toc')

      if (coverDoc || tocDoc) {
        const img = findFirst(body, 'img') || findFirst(body, 'image')
        if (img && !coverPath) {
          const src = attr(img, 'src') || attr(img, 'href')
          const path = src ? resolvePath(item.path, src) : ''
          if (path) coverPath = path
        }
        if (!fallback) continue
      }

      const nodes = Array.from(body.childNodes).map((node) => htmlDoc.importNode(node, true))
      parsed.push({
        path: item.path,
        nodes,
      })
    }

    if (!parsed.length) continue
    chapters = parsed.map((chapter) => {
      const box = htmlDoc.createElement('div')
      const flat: Node[] = []
      flattenNodes(chapter.nodes, htmlDoc, flat)
      for (const node of flat) box.appendChild(node)
      return { path: chapter.path, box, idMap: new Map() }
    }).filter((chapter) => {
      const hasText = (chapter.box.textContent || '').trim().length > 0
      const hasVisual = !!chapter.box.querySelector('img,svg,table,figure,picture,math')
      return hasText || hasVisual
    })

    if (chapters.length) break
    if (!fallback) {
      console.warn('[epub] strict pass found no readable chapters; retrying without cover/toc/linear filters')
    }
  }

  if (!chapters.length) {
    console.warn('[epub] no readable chapters', {
      spineItems: spineRefs.length,
      manifestItems: manifest.length,
    })
    throw new EpubOpenError('empty', 'No readable content was found in this EPUB.')
  }

  // 图片注入 / 安全清洗必须在图片 URL 预解之后。
  for (const chapter of chapters) {
    // 收集这一章需要的资源，先解出 blob URL。
    const resources: string[] = []
    for (const el of Array.from(chapter.box.querySelectorAll('img,image')) as Element[]) {
      const src = localName(el) === 'img'
        ? el.getAttribute('src') || ''
        : el.getAttribute('href') || el.getAttributeNS(XLINK_NS, 'href') || ''
      if (!src || /^(data:image\/|blob:|https?:)/i.test(src)) continue
      const path = resolvePath(chapter.path, src)
      if (path) resources.push(path)
    }
    for (const path of resources) await preloadAsset(path)
  }

  for (const chapter of chapters) {
    for (const el of collectNodes(chapter.box)) {
      sanitizeElement(el, chapter.path, (path) => assetUrls.get(path) || null)
    }
  }

  // 清洗完成（<a name> 已转成 id）后再分配章节前缀，最后改写跨章节链接。
  for (let i = 0; i < chapters.length; i++) {
    const prefix = `c${i + 1}-`
    const chapter = chapters[i]
    const seen = new Set<string>()
    for (const el of Array.from(chapter.box.querySelectorAll('[id]'))) {
      const raw = el.getAttribute('id') || ''
      if (!raw.trim()) { el.removeAttribute('id'); continue }
      const actual = uniqueId(prefix, raw.trim(), seen)
      if (!chapter.idMap.has(raw.trim())) chapter.idMap.set(raw.trim(), actual)
      el.setAttribute('id', actual)
    }
    const start = makeAnchor(htmlDoc, `${prefix}start`)
    chapter.box.insertBefore(start, chapter.box.firstChild)
  }

  const chapterByPath = new Map(chapters.map((chapter, index) => [chapter.path, index]))

  for (const chapter of chapters) {
    rewriteLinks(chapter.box, chapter.path, chapterByPath, chapters)
  }

  const bookTitle = titles[0] || cleanedFirstHeading(chapters) || opts?.fallbackTitle || fileStem(chapters[0].path) || 'Untitled'
  const meta: Record<string, string> = {}
  if (creators.length) meta.author = creators.join(' · ')
  if (dates.length) meta.date = dates[0]
  if (descriptions.length) meta.description = descriptions[0]
  if (languages.length) meta.language = languages[0]

  // 目录：EPUB3 nav → EPUB2 NCX → 标题推导。
  let outline: ReaderOutlineEntry[] = []
  const navItem = navItems[0]
  if (navItem) {
    const navText = await readText(zip, navItem.path)
    if (navText) {
      const navDoc = parseDocument(navText)
      outline = mapOutline(parseNavOutline(navDoc), navItem.path, chapterByPath, chapters)
    }
  }
  if (!outline.length && ncxItem) {
    const ncxText = await readText(zip, ncxItem.path)
    if (ncxText) {
      const ncxDoc = parseDocument(ncxText)
      outline = mapOutline(parseNcxOutline(ncxDoc), ncxItem.path, chapterByPath, chapters)
    }
  }
  if (!outline.length) outline = outlineFromHeadings(chapters)

  // 保证每一章在目录里都有入口（nav 可能漏章，或干脆没有 nav）。
  outline = completeOutline(outline, chapters)

  const coverImage = coverPath ? await preloadAsset(coverPath) : undefined
  let html = chapters.map((c) => c.box.innerHTML).join('\n')

  // 我们导出的 EPUB 会把预览里已经渲染好的 Mermaid SVG 带进阅读包。
  // 预览默认 htmlLabels=true，SVG 里是 <foreignObject>；Chromium 在 3D 翻页层里
  // 会把 foreignObject 渲染成黑色。阅读前用 htmlLabels=false 重渲染一次。
  if (/class="[^"]*mermaid/i.test(html)) {
    const mermaidHost = htmlDoc.createElement('div')
    mermaidHost.innerHTML = html
    await postRenderMermaid(mermaidHost, readThemePalette(document.documentElement), false)
    html = mermaidHost.innerHTML
  }

  return {
    html,
    title: bookTitle,
    meta,
    outline,
    coverImage: coverImage || undefined,
    dispose: () => { for (const url of objectUrls) URL.revokeObjectURL(url) },
  }
}

function cleanedFirstHeading(chapters: Chapter[]): string {
  for (const chapter of chapters) {
    const heading = findFirst(chapter.box, 'h1') || findFirst(chapter.box, 'h2') || findFirst(chapter.box, 'h3')
    if (heading) {
      const text = childText(heading)
      if (text) return text
    }
  }
  return ''
}

function mapOutline(
  raw: Array<{ href: string; title: string; level: number }>,
  basePath: string,
  chapterByPath: Map<string, number>,
  chapters: Chapter[],
): ReaderOutlineEntry[] {
  const out: ReaderOutlineEntry[] = []
  const seen = new Set<string>()
  for (const entry of raw) {
    const { path, fragment } = splitHref(entry.href)
    const targetPath = path ? resolvePath(basePath, entry.href) : basePath
    const chapterIndex = chapterByPath.get(targetPath)
    if (chapterIndex == null) continue
    const chapter = chapters[chapterIndex]
    const id = (fragment && chapter.idMap.get(fragment)) || `c${chapterIndex + 1}-start`
    if (seen.has(id)) continue
    seen.add(id)
    out.push({ id, title: entry.title, level: entry.level })
  }
  return out
}

function outlineFromHeadings(chapters: Chapter[]): ReaderOutlineEntry[] {
  const out: ReaderOutlineEntry[] = []
  const seen = new Set<string>()
  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i]
    const headings = Array.from(chapter.box.querySelectorAll('h1,h2,h3,h4,h5,h6'))
    for (const heading of headings) {
      if (!heading.id) heading.id = `c${i + 1}-h${out.length + 1}`
      if (seen.has(heading.id)) continue
      const title = childText(heading)
      if (!title) continue
      seen.add(heading.id)
      const level = Math.min(3, Number(localName(heading).slice(1)) || 1)
      out.push({ id: heading.id, title, level })
    }
  }
  return out
}

function chapterTitle(chapter: Chapter): string {
  const heading = findFirst(chapter.box, 'h1') || findFirst(chapter.box, 'h2') || findFirst(chapter.box, 'h3')
  const text = heading ? childText(heading) : ''
  return text || fileStem(chapter.path)
}

function completeOutline(outline: ReaderOutlineEntry[], chapters: Chapter[]): ReaderOutlineEntry[] {
  const covered = new Set<number>()
  for (const item of outline) {
    const m = /^c(\d+)-/.exec(item.id)
    if (m) covered.add(Number(m[1]) - 1)
  }
  const byChapter = new Map<number, ReaderOutlineEntry[]>()
  for (const item of outline) {
    const m = /^c(\d+)-/.exec(item.id)
    const index = m ? Number(m[1]) - 1 : -1
    if (index < 0) continue
    const list = byChapter.get(index) || []
    list.push(item)
    byChapter.set(index, list)
  }

  const out: ReaderOutlineEntry[] = []
  for (let i = 0; i < chapters.length; i++) {
    const entries = byChapter.get(i) || []
    if (!covered.has(i)) {
      entries.unshift({ id: `c${i + 1}-start`, title: chapterTitle(chapters[i]), level: 1 })
    }
    out.push(...entries)
  }
  return out
}
