/**
 * slideDeck.ts — 演示模式的「纯数据层」：Markdown → 页列表 / 目录 / 页面 HTML / 主题变量作用域化。
 *
 * 为什么单独抽出来：演示组件（Slideshow.tsx）与 PPTX 导出（lib/pptx*.ts）**必须**用同一份
 * 解析、同一份 HTML、同一份主题变量改写 —— 否则「演示里看到的」与「导出的」迟早漂移。
 * 本模块被两边同时 import，是唯一来源。
 *
 * 约定：不 import React / 不依赖 DOM（renderMarkdown 例外，它是纯字符串函数）。
 */
import { renderMarkdown } from './markdownRenderer.ts'
import { replaceTocPlaceholders, renderDeckTocHtml, type DeckTocEntry } from './toc.ts'
import {
  stripFrontMatter, parseFrontMatter, splitSlides, splitColumns, extractNotes, extractDirectives,
  detectLayout, COLUMN_BREAK, type SlideKind, type SlideLayout,
} from './slides.ts'

export interface DeckSlide {
  /** 页面 Markdown 源（HTML 惰性渲染，见 htmlCache） */
  src: string
  notes: string
  kind: SlideKind
  title?: string
  align?: 'left' | 'center' | 'right'
  /** 该页顶层列表是否参与片段逐步显示（版式 + deck/页级 fragments 指令共同决定） */
  fragmentEligible: boolean
  /** 分栏（页内 `***` 分隔）：栏数；未分栏时 undefined（= 1 栏） */
  columns?: number
  /** 各栏 Markdown 源，仅 columns >= 2 时存在（长度 === columns） */
  colParts?: string[]
  /** 页标题（页内第一个标题块）：整页渲染在分栏之上，不参与分栏 */
  colIntro?: string
  /** 栏前文案（圈定写法里，第一个 `***` 之前的内容）：页级，整页横跨 */
  colBefore?: string
  /** 栏后文案（圈定写法里，最后一个 `***` 之后的内容）：页级，整页横跨 */
  colAfter?: string
}

export interface DeckMeta {
  author?: string
  date?: string
}

export interface ParsedDeck {
  slides: DeckSlide[]
  /** front matter 的 title 优先，没有才用文档名 */
  docTitle: string
  meta: DeckMeta
  /** deck 级片段开关初始值（front matter `slideshow-fragments: on`） */
  fragmentsOn: boolean
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** 片段生效版式：内容/列表/路线图页的顶层列表逐条出现（目录 agenda 不分段） */
const FRAGMENT_KINDS: SlideKind[] = ['content', 'content-list', 'roadmap']

/**
 * 纯 markdown → 幻灯片：`---` 分页 + 整页结构自动版式推断。
 * 逻辑与重构前的 Slideshow.tsx 内联 useMemo 逐行一致（含分栏 intro/before/after 的版面推断源）。
 */
export function parseDeck(content: string, fallbackTitle = ''): ParsedDeck {
  const meta = parseFrontMatter(content)
  const body = stripFrontMatter(content)
  const slides = splitSlides(body).map((src) => {
    const { body: b, notes } = extractNotes(src)
    const { body: b2, directives } = extractDirectives(b)
    // 分栏：`***` = 栏区边界 / 栏分隔（`---` = 页分隔，已在 splitSlides 消费）。
    // 页内第一个标题块被抽成 intro（页标题），**不参与分栏**。
    // 圈定写法（≥3 条 `***`）时，栏区之外的内容是 before / after，同样按页级渲染。
    const split = splitColumns(b2)
    const hasColumns = split.parts.length > 1
    const layoutSrc = hasColumns
      ? [split.intro, split.before, ...split.parts, split.after]
          .filter((s) => s.trim() !== '').join(`\n\n${COLUMN_BREAK}\n\n`)
      : b2
    const layout: SlideLayout = detectLayout(layoutSrc)
    const kind = directives.layout || layout.kind
    // 页级 fragments 指令可否决（off 强制不分段；未设置时跟随 HUD 开关）
    const pageFragments = directives.fragments === 'off' ? false
      : directives.fragments === 'on' ? true
      : true
    const fragmentEligible = pageFragments && FRAGMENT_KINDS.includes(kind)
    return {
      src: b2, notes, kind, title: layout.title, align: directives.align, fragmentEligible,
      columns: hasColumns ? split.parts.length : undefined,
      colParts: hasColumns ? split.parts : undefined,
      colIntro: hasColumns && split.intro ? split.intro : undefined,
      colBefore: hasColumns && split.before ? split.before : undefined,
      colAfter: hasColumns && split.after ? split.after : undefined,
    }
  })
  return {
    slides,
    docTitle: meta.title || fallbackTitle || '',
    meta: { author: meta.author, date: meta.date },
    fragmentsOn: (meta['slideshow-fragments'] || '').toLowerCase() === 'on',
  }
}

/**
 * 整册目录：演示文稿按页独立渲染，`[toc]` 不能只统计当前页。
 * 条目 = 有标题的页（排除封面/结尾页和目录页自身）。
 */
export function buildDeckTocHtml(slides: DeckSlide[]): string {
  const entries: DeckTocEntry[] = []
  slides.forEach((s, i) => {
    if (!s.title || s.kind === 'cover' || s.kind === 'thanks') return
    if (/^\s*\[{1,2}toc\]{1,2}\s*$/mi.test(s.src)) return
    const marks = /^(#{1,6})\s/m.exec(s.src)?.[1].length
    entries.push({ text: s.title, slide: i, level: marks ? Math.min(6, marks) : 2 })
  })
  return renderDeckTocHtml(entries)
}

export interface SlideHtmlContext {
  pluginExtenders: Array<(md: any) => void>
  /** 整册目录 HTML；为空表示没有 `[toc]` 占位 */
  deckTocHtml?: string
  meta?: DeckMeta
}

/** 取页面 HTML（纯函数，调用方自行缓存） */
export function buildSlideHtml(slide: DeckSlide, ctx: SlideHtmlContext): string {
  const withToc = (src: string) => (ctx.deckTocHtml ? replaceTocPlaceholders(src, ctx.deckTocHtml!) : src)
  let html: string
  if (slide.colParts) {
    // 分栏：每栏各自渲染；栏数经 --ys-cols 下发（CSS 见 .ys-cols）。
    // 页标题（colIntro）**不包 div**、直接作为 .ys-slide 的直接子元素 ——
    // 这样 `.ys-slide > :first-child` 与各版式的 h2 规则仍能命中它。
    html = `${slide.colIntro ? renderMarkdown(withToc(slide.colIntro), ctx.pluginExtenders) : ''}${
      slide.colBefore ? `<div class="ys-col-aside">${renderMarkdown(withToc(slide.colBefore), ctx.pluginExtenders)}</div>` : ''
    }<div class="ys-cols" style="--ys-cols:${slide.colParts.length}">${
      slide.colParts.map((p) => `<div class="ys-col">${renderMarkdown(withToc(p), ctx.pluginExtenders)}</div>`).join('')
    }</div>${
      slide.colAfter ? `<div class="ys-col-aside">${renderMarkdown(withToc(slide.colAfter), ctx.pluginExtenders)}</div>` : ''
    }`
  } else {
    html = renderMarkdown(withToc(slide.src), ctx.pluginExtenders)
  }
  // 封面页：拼接 front matter 提供的作者/日期 meta 行
  const meta = ctx.meta
  if (slide.kind === 'cover' && meta?.author) {
    const metaLine = [meta.author, meta.date].filter(Boolean).join(' · ')
    html += `<div class="ys-cover-meta">${escapeHtml(metaLine)}</div>`
  }
  return html
}

/** 章节标记：封面/章节页的标题作为其后续页的章节名；章节页带序号（1 起） */
export function deckChapters(slides: DeckSlide[], docTitle: string): Array<{ chapter: string; num: number }> {
  const out: Array<{ chapter: string; num: number }> = []
  let sec = 0
  let curChapter = docTitle
  for (const s of slides) {
    if (s.kind === 'section') sec += 1
    if ((s.kind === 'cover' || s.kind === 'section') && s.title) curChapter = s.title
    out.push({ chapter: curChapter, num: s.kind === 'section' ? sec : 0 })
  }
  return out
}

/**
 * 主题继承：只取主题 CSS 的 `:root.theme-*` 变量定义块，改写为
 * `.yizi-slideshow.theme-*`，使配色变量作用到幻灯片根节点（保留 `.dark` 变体）。
 *
 * 丢弃所有元素规则（`.theme-x h1` 等），因为部分主题用未加作用域的选择器
 * 会漏进幻灯片覆盖版式字号/对齐 —— 幻灯片的字号/对齐/居中一律由 slideshow.css 控制。
 *
 * @param themeCss 主题文件原文
 * @param userRaw user.css 原文（仅「自定义主题」时非空）
 * @param theme 目标主题名（改写后写进选择器，保证与根节点 class 一致）
 */
export function scopeThemeVars(
  themeCss: string,
  userRaw: string,
  theme: string,
  rootSelector = '.yizi-slideshow',
): string {
  const userVars = userRaw
    ? userRaw
        .split('}')
        .filter((part) => /^[^{}]*:root\.theme-/.test(part.slice(0, part.indexOf('{'))))
        .join('}')
    : ''
  return (themeCss + userVars)
    .split('}')
    .filter((part) => /^[^{}]*:root\.theme-/.test(part.slice(0, part.indexOf('{'))))
    .join('}')
    .replace(
      /:root\.theme-[a-zA-Z0-9_-]+(\.dark)?/g,
      (_m, darkVariant?: string) => `${rootSelector}.theme-${theme}${darkVariant || ''}`,
    )
}
