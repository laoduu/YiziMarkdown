/**
 * 阅读模式分页引擎（Phase 0 原型）。
 *
 * 目标：把已渲染的 Markdown HTML 切成固定尺寸的“真实页面”，而不是整条滚动/
 * CSS 多列条带。页面对象 = 独立 DOM，页码/目录/脚注映射都直接按页对象算，
 * 后续翻页动画、双页对开、3D 卷页都基于这些页面。
 *
 * 已覆盖：
 *   · 段落按行/字符二分拆分（保留行内样式与链接）；
 *   · 标题与后续内容绑定（避免标题孤零零留在页底）；
 *   · 表格按行拆分（续页重复表头）；
 *   · 代码块按行拆分（保留高亮 DOM 片段）；
 *   · 列表按条目拆分（有序列表续页保留 start）；
 *   · 图片块等比缩放；
 *   · 目录 / 脚注等带 id 元素的页码映射。
 *
 * 尚未覆盖（Phase 2）：
 *   · blockquote / 复杂嵌套列表内部再拆分（目前整块换页）；
 *   · 超高单行表格 / 超高单条列表项；
 *   · 跨页选中的极端边界。
 *
 * 分页需要真实布局，所以只能在浏览器/WebView 里跑；纯逻辑（页码映射、
 * 目录换算）拆在可单测的小函数里。
 */

export interface ReaderOutlineEntry {
  id: string
  title: string
  level: number
}

export interface ReaderPaginationOptions {
  /** 页面内容区宽（px，不含页边距） */
  width: number
  /** 页面内容区高（px，不含页脚/页边距） */
  height: number
  /** 已挂载的、带阅读排版样式的宿主（用于离屏测量） */
  host: HTMLElement
  /** 目录条目（id 与渲染后标题 id 一致） */
  outline?: ReaderOutlineEntry[]
  /** 页首/页尾至少保留的行数，默认 2 */
  orphans?: number
  widows?: number
  /** 进度回调（0–1），长文档排版时用来刷新「正在排版… 42%」 */
  onProgress?: (fraction: number) => void
  /** 返回 true 时尽快中止（用户按 Esc 退出阅读模式） */
  shouldCancel?: () => boolean
  /** 直接接手这个容器里已经渲染好的节点（省掉把整篇 HTML 再解析一遍的开销） */
  sourceElement?: HTMLElement
}

export interface ReaderPaginationResult {
  /** 每页正文 HTML（按阅读顺序） */
  pages: string[]
  /** 目录条目 + 页码（0-based） */
  toc: Array<ReaderOutlineEntry & { page: number }>
  /** 所有带 id 元素的页码（脚注 fn1 / 返回锚点 fnref1 / 标题 id） */
  anchorPages: Record<string, number>
}

/** 让出主线程：长文档排版时避免整段冻住界面（Chrome 的 scheduler.yield 比 setTimeout 便宜得多） */
function yieldToUi(): Promise<void> {
  const scheduler = (window as unknown as { scheduler?: { yield?: () => Promise<void> } }).scheduler
  if (scheduler?.yield) return scheduler.yield()
  return new Promise((resolve) => { window.setTimeout(resolve, 0) })
}

const HEADING_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6'])
const ATOMIC_TAGS = new Set(['IMG', 'HR', 'SVG', 'CANVAS'])

interface PageBox {
  page: HTMLElement
  inner: HTMLElement
}

export async function paginateReader(html: string, opts: ReaderPaginationOptions): Promise<ReaderPaginationResult> {
  const { width, height } = opts
  const orphans = opts.orphans ?? 2
  const widows = opts.widows ?? 2

  const measureHost = document.createElement('div')
  measureHost.className = 'reader-measure-host'
  measureHost.setAttribute('aria-hidden', 'true')
  measureHost.style.cssText = `position:absolute;left:-10000px;top:0;width:${width}px;visibility:hidden;pointer-events:none;`

  const source = document.createElement('div')
  source.className = 'reader-content reader-measure-content'
  source.style.width = `${width}px`
  if (opts.sourceElement) source.append(...Array.from(opts.sourceElement.childNodes))
  else source.innerHTML = html
  // 刻意不挂进 DOM：source 里放着整篇正文（几千个块），只要它在布局树里，
  // 每次量当前页都会把这份「还没处理的剩余正文」一起重排，长文档直接卡死。
  // 块的样式来自页容器（同样带 reader-content），不依赖 source 的父级。

  const ruler = document.createElement('div')
  ruler.className = 'reader-content reader-measure-content'
  ruler.style.cssText = `position:absolute;left:-10000px;top:0;width:${width}px;display:flow-root;visibility:hidden;`
  measureHost.appendChild(ruler)
  opts.host.appendChild(measureHost)

  const pageHtml: string[] = []
  const anchorPages: Record<string, number> = {}
  let current: PageBox = newPage()
  const queue: HTMLElement[] = Array.from(source.children) as HTMLElement[]
  const totalBlocks = Math.max(1, queue.length)
  let tick = 0
  // 保险丝：万一遇到没覆盖的边界情况，宁可少排一页也不要整个界面转圈卡死
  const maxTicks = totalBlocks * 8 + 500

  try {
    while (queue.length) {
      if (tick > maxTicks) break
      // 每处理一小批就让出主线程并回报进度：几百页的长文档也不会把界面冻住
      if ((tick & 15) === 0) {
        if (opts.shouldCancel?.()) break
        opts.onProgress?.(Math.min(1, 1 - queue.length / totalBlocks))
        await yieldToUi()
        if (opts.shouldCancel?.()) break
      }
      tick++
      const node = queue.shift()!
      const placed = tryPlace(node)
      if (placed === 'ok') continue
      if (placed === 'retry') {
        // 标题分组失败已经把当前页结束；在新页上重新尝试
        queue.unshift(node)
        continue
      }

      // node 仍在页内且溢出：按类型拆分（拆分函数需要 node 处于已布局状态）
      const rest = splitNode(node, false)
      if (rest) {
        queue.unshift(rest)
        finishPage()
        continue
      }

      // 无法拆分：整块换页；若本页只有这一块，则让它独占一页（允许溢出）
      if (current.inner.childElementCount > 1) {
        current.inner.removeChild(node)
        // 页底只剩一个标题：把它也带到下一页，避免孤行。
        // 但若本页现在只剩它自己（标题在页首、后面就是那个不可拆的大块），
        // 就不要再挪——否则「标题 + 大块」会被反复配到新页上，死循环。
        const last = current.inner.lastElementChild as HTMLElement | null
        if (last && current.inner.childElementCount > 1 && HEADING_TAGS.has(last.nodeName)) {
          current.inner.removeChild(last)
          queue.unshift(node)
          queue.unshift(last)
          finishPage()
        } else {
          queue.unshift(node)
          finishPage()
        }
      } else {
        finishPage()
      }
    }
  } finally {
    // 收尾：最后正在写的那页也要入列（空页不入）
    if (current.inner.childElementCount) finishPage()
  }

  const toc = (opts.outline || [])
    .filter((item) => item.id in anchorPages)
    .map((item) => ({ ...item, page: anchorPages[item.id] }))

  measureHost.remove()
  return { pages: pageHtml, toc, anchorPages }

  /* ------------------------------------------------------------------ */

  function newPage(): PageBox {
    const page = document.createElement('div')
    page.className = 'reader-page-measure'
    page.style.width = `${width}px`
    const inner = document.createElement('div')
    inner.className = 'reader-page-content reader-page-body reader-measure-content reader-content'
    inner.style.width = `${width}px`
    page.appendChild(inner)
    measureHost.appendChild(page)
    return { page, inner }
  }

  function finishPage(): void {
    if (current.inner.childElementCount) {
      // 页一满就序列化并收集锚点：把几千页的 innerHTML 留到最后一次性做，
      // 会在结尾留一个几百毫秒的卡顿（长文档表现为「排版完了还卡一下」）。
      const index = pageHtml.length
      pageHtml.push(current.inner.innerHTML)
      for (const el of Array.from(current.inner.querySelectorAll<HTMLElement>('[id]'))) {
        const id = el.id
        if (id && !(id in anchorPages)) anchorPages[id] = index
      }
      // 已完成的页从测量宿主摘掉，否则每次量当前页都会连带重排前面所有页
      measureHost.removeChild(current.page)
    }
    current = newPage()
  }

  function pageFits(): boolean {
    return current.inner.getBoundingClientRect().height <= height + 0.5
  }

  function limitBottom(): number {
    return current.inner.getBoundingClientRect().top + height
  }

  function tryPlace(node: HTMLElement): 'ok' | 'overflow' | 'retry' {
    // 标题与后续块绑定：标题落在页底、正文在下一页是排版硬伤
    if (HEADING_TAGS.has(node.nodeName) && queue.length && current.inner.childElementCount) {
      const next = queue[0]
      current.inner.appendChild(node)
      current.inner.appendChild(next)
      if (pageFits()) {
        queue.shift()
        return 'ok'
      }
      current.inner.removeChild(node)
      current.inner.removeChild(next)
      finishPage()
      return 'retry'
    }

    current.inner.appendChild(node)
    if (pageFits()) return 'ok'
    // 图片块可以在页面内等比缩放
    if (fitImageBlock(node)) return 'ok'
    return 'overflow'
  }

  /** 放不下时尝试拆分；返回剩余部分（已准备好排队） */
  function splitNode(node: HTMLElement, _onEmptyPage: boolean): HTMLElement | null {
    switch (node.nodeName) {
      case 'P':
      case 'DIV':
        return splitFlowBlock(node, orphans, widows, limitBottom())
      case 'PRE':
        return splitPre(node, limitBottom())
      case 'TABLE':
        return splitTable(node, limitBottom())
      case 'UL':
      case 'OL':
        return splitList(node, limitBottom())
      case 'BLOCKQUOTE':
        // 长引用块以前整块换页：一旦比一页还高就会独占一页（还会和前面的标题反复配对）。
        // 引用块内部是普通段落流，按行拆一样安全。
        return splitFlowBlock(node, orphans, widows, limitBottom())
      default:
        // section 等其它容器：暂不拆内部（Phase 2）
        return null
    }
  }

  function fitImageBlock(node: HTMLElement): boolean {
    if (node.nodeName !== 'P') return false
    const img = node.querySelector('img')
    if (!img || node.textContent?.trim()) return false
    const pageTop = current.inner.getBoundingClientRect().top
    const maxH = Math.max(40, height - 24)
    if (img.getBoundingClientRect().height > maxH) {
      img.style.maxHeight = `${maxH}px`
      img.style.width = 'auto'
      img.style.height = 'auto'
      return pageFits()
    }
    // 本页剩余空间不足但下一页能放下：交给调用方换页
    const remaining = limitBottom() - node.getBoundingClientRect().top
    if (remaining < img.getBoundingClientRect().height && img.getBoundingClientRect().height <= maxH) {
      if (current.inner.childElementCount > 1) {
        current.inner.removeChild(node)
        return false
      }
    }
    void pageTop
    return pageFits()
  }

  function splitFlowBlock(node: HTMLElement, minKeep: number, minRest: number, limit: number): HTMLElement | null {
    const remaining = limit - node.getBoundingClientRect().top
    if (remaining <= 0) return null
    if (ATOMIC_TAGS.has(node.nodeName)) return null

    // 只对纯文本流做字符级拆分；含块级子元素（div 内嵌表格等）交给换页
    if (node.querySelector('table, pre, ul, ol, blockquote, .katex-display, svg')) return null

    const leaves = collectTextRuns(node)
    if (!leaves.length) return null
    const total = leaves[leaves.length - 1].end
    if (total <= 0) return null

    const lineHeight = lineHeightOf(node)
    const fullH = node.getBoundingClientRect().height
    if (fullH <= remaining) return null
    // 块本身最多只够 minKeep + minRest 行时，怎么拆都不满足孤行/寡行规则，
    // 直接放弃拆分（省掉整轮按行二分：短段落多的时候这一步能占一半以上时间）
    const fullLines = Math.floor(fullH / lineHeight + 0.01)
    if (fullLines < minKeep + minRest) return null

    let lo = 1
    let hi = Math.max(1, total - 1)
    let best = 0
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2)
      const h = prefixHeight(node, leaves, mid)
      if (h <= remaining) {
        best = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }
    if (best <= 0) return null

    // 英文不要断在单词中间；中文可直接断
    best = wordSafeOffset(node.textContent || '', best)
    if (best <= 0) return null

    // 孤行/寡行：页首至少 minKeep 行，下一页至少 minRest 行
    const bestH = prefixHeight(node, leaves, best)
    const keepLines = Math.floor(bestH / lineHeight + 0.01)
    const restLines = Math.floor((fullH - bestH) / lineHeight + 0.01)
    if (keepLines < minKeep) return null
    if (restLines < minRest) {
      // 把断点往前挪两行左右；挪不动就放弃拆分
      const charsPerLine = Math.max(1, Math.ceil(total / Math.max(1, Math.floor(fullH / lineHeight))))
      const alt = wordSafeOffset(node.textContent || '', Math.max(1, best - charsPerLine * 2))
      if (alt <= 0) return null
      best = alt
      if (Math.floor(prefixHeight(node, leaves, best) / lineHeight + 0.01) < minKeep) return null
    }

    return splitAtOffset(node, leaves, best)
  }

  function splitPre(node: HTMLElement, limit: number): HTMLElement | null {
    const code = node.querySelector('code') || node
    const remaining = limit - node.getBoundingClientRect().top
    if (remaining <= 0) return null
    const leaves = collectTextRuns(code)
    const total = leaves.length ? leaves[leaves.length - 1].end : 0
    if (total <= 0) return null
    const text = code.textContent || ''

    // 只在换行处切：先按高度二分，再回退到最近的 '\n'
    let lo = 1
    let hi = Math.max(1, total - 1)
    let best = 0
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2)
      const h = prefixHeight(node, leaves, mid)
      if (h <= remaining) {
        best = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }
    if (best <= 0) return null
    const nl = text.lastIndexOf('\n', Math.max(0, best - 1))
    const cut = nl >= 0 ? nl : 0
    if (cut <= 0) return null

    const fragment = extractRangeFragment(code, leaves, cut)
    if (!fragment || !fragment.childNodes.length) return null

    const rest = node.cloneNode(false) as HTMLElement
    rest.removeAttribute('id')
    const restCode = document.createElement('code')
    restCode.className = (code as HTMLElement).className || ''
    restCode.appendChild(fragment)
    rest.appendChild(restCode)
    trimTrailingNewline(code)
    return rest
  }

  function splitTable(node: HTMLElement, limit: number): HTMLElement | null {
    const rows = Array.from(node.querySelectorAll('tr'))
    const headerRows = node.querySelectorAll('thead tr').length
    let cut = -1
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].getBoundingClientRect().bottom > limit + 0.5) {
        cut = i
        break
      }
    }
    if (cut <= headerRows) return null

    const rest = node.cloneNode(false) as HTMLElement
    rest.removeAttribute('id')
    // 表头复制；没有 thead 时把第一行当表头（GFM 表格本来就有 thead）
    const head = node.querySelector('thead')
    if (head) rest.appendChild(head.cloneNode(true))
    const body = node.querySelector('tbody')
    if (body) {
      const restBody = document.createElement('tbody')
      for (let i = cut; i < rows.length; i++) restBody.appendChild(rows[i])
      rest.appendChild(restBody)
    } else {
      for (let i = cut; i < rows.length; i++) rest.appendChild(rows[i])
    }
    return rest
  }

  function splitList(node: HTMLElement, limit: number): HTMLElement | null {
    const items = Array.from(node.children).filter((el) => el.nodeName === 'LI')
    let cut = -1
    for (let i = 0; i < items.length; i++) {
      if (items[i].getBoundingClientRect().bottom > limit + 0.5) {
        cut = i
        break
      }
    }
    if (cut <= 0) return null
    const rest = node.cloneNode(false) as HTMLElement
    rest.removeAttribute('id')
    if (node.nodeName === 'OL') {
      const start = Number.parseInt(node.getAttribute('start') || '1', 10) || 1
      rest.setAttribute('start', String(start + cut))
    }
    for (let i = cut; i < items.length; i++) rest.appendChild(items[i])
    return rest
  }

  /* ------------------------------------------------------------------ */

  function prefixHeight(node: HTMLElement, leaves: TextRun[], offset: number): number {
    const shell = node.cloneNode(false) as HTMLElement
    shell.removeAttribute('id')
    shell.appendChild(cloneRange(node, leaves, offset))
    ruler.innerHTML = ''
    ruler.appendChild(shell)
    return shell.getBoundingClientRect().height
  }

  function splitAtOffset(node: HTMLElement, leaves: TextRun[], offset: number): HTMLElement | null {
    const fragment = extractRangeFragment(node, leaves, offset)
    if (!fragment || !fragment.childNodes.length) return null
    const rest = node.cloneNode(false) as HTMLElement
    rest.removeAttribute('id')
    rest.appendChild(fragment)
    // 续页段落不再段首缩进（首行缩进只属于每段第一行）
    if (node.nodeName === 'P') rest.classList.add('reader-para-continuation')
    return rest
  }
}

/* ------------------------------------------------------------------ */
/*  文本定位工具                                                       */
/* ------------------------------------------------------------------ */

interface TextRun {
  node: Text
  start: number
  end: number
}

function collectTextRuns(root: Node): TextRun[] {
  const out: TextRun[] = []
  let pos = 0
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node as Text
      const len = t.nodeValue?.length || 0
      if (len) {
        out.push({ node: t, start: pos, end: pos + len })
        pos += len
      }
      return
    }
    for (const child of Array.from(node.childNodes)) walk(child)
  }
  walk(root)
  return out
}

function positionAt(runs: TextRun[], offset: number): { node: Node; offset: number } {
  for (const run of runs) {
    if (offset <= run.end) {
      return { node: run.node, offset: Math.max(0, offset - run.start) }
    }
  }
  // 末尾
  const last = runs[runs.length - 1]
  return { node: last.node, offset: last.node.nodeValue?.length || 0 }
}

function cloneRange(root: Node, runs: TextRun[], offset: number): DocumentFragment {
  const range = document.createRange()
  range.setStart(root, 0)
  const pos = positionAt(runs, offset)
  range.setEnd(pos.node, pos.offset)
  return range.cloneContents()
}

function extractRangeFragment(root: Node, runs: TextRun[], offset: number): DocumentFragment {
  const range = document.createRange()
  const pos = positionAt(runs, offset)
  range.setStart(pos.node, pos.offset)
  range.setEnd(root, root.childNodes.length)
  return range.extractContents()
}

/** 英文断行回到最近的空格；中文原样 */
function wordSafeOffset(text: string, offset: number): number {
  if (offset <= 0 || offset >= text.length) return offset
  const prev = text[offset - 1]
  const cur = text[offset]
  if (/\s/.test(prev) || /\s/.test(cur)) return offset
  const isWord = (c: string) => /[A-Za-z0-9]/.test(c)
  if (!isWord(prev) || !isWord(cur)) return offset
  const space = text.lastIndexOf(' ', offset - 1)
  return space > 0 ? space + 1 : offset
}

function trimTrailingNewline(node: Node): void {
  const textNodes: Text[] = []
  const walk = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) textNodes.push(n as Text)
    else for (const c of Array.from(n.childNodes)) walk(c)
  }
  walk(node)
  const last = textNodes[textNodes.length - 1]
  if (last) last.nodeValue = (last.nodeValue || '').replace(/\n$/, '')
}

function lineHeightOf(node: HTMLElement): number {
  const style = getComputedStyle(node)
  const parsed = Number.parseFloat(style.lineHeight)
  if (Number.isFinite(parsed) && parsed > 0) return parsed
  const size = Number.parseFloat(style.fontSize) || 16
  return size * 1.6
}
