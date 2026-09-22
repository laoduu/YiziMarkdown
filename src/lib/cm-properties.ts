/**
 * 元信息属性面板（实时模式）—— 把文档顶部的 front matter 渲染成属性列表。
 *
 * 【布局】每一行：`[类型 icon] [属性名] [值]`，行尾 hover 出删除按钮。
 * 点类型 icon 弹出菜单（每项 = icon + 名称），而不是把原生 `<select>` 摆在属性名右边 ——
 * 后者既生硬又挤占了属性名的宽度。
 * 无表格线，仅 hover 时当前行有框线（与 Obsidian 一致）。
 *
 * 【为什么可行】项目里已有可编辑块 widget 的先例：`cm-live-blocks.ts` 的 `EditableTableWidget`
 * 已经解决了"在 CodeMirror 里放可编辑控件"的全部难点，本文件照抄其模式：
 *   · **Shadow DOM** 隔离：CM6 的 input/beforeinput 监听器在 light DOM，看不到 shadow root
 *     内部的事件 ⇒ 避免 CM 抢输入（这是该注释在 EditableTableWidget 里的原文理由）
 *   · 事件全部 `stopPropagation`，防止穿透到 CM
 *   · **提交走 `view.dispatch`** ⇒ 撤销/重做自动可用
 *   · 不 `preventDefault` beforeinput ⇒ 输入法可用
 *   · `ignoreEvent() { return true }` ⇒ CM 忽略 widget 内事件
 *
 * 【「常驻」与「编辑源码」如何共存】CM 的块 widget 约定是"光标进入就不渲染"
 * （见 cm-live-blocks.ts 的 `curLineStart` 守卫）。而本 widget 内的点击被 `stopPropagation`
 * 拦下 ⇒ **CM 光标不会进入块内** ⇒ 属性列表自然常驻、可就地编辑。
 * 于是"编辑源码"只需把**整个块选中**（区间选区），列表便让位显示原始 YAML。
 * 注意不能只把光标放在块首：折叠光标落在位置 0 与"刚打开文档"无法区分，会导致一打开就看不到列表。
 */

import { StateField, type EditorState } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view'
import { useSettingsStore } from '../stores/settingsStore'
import { translate, type Language } from '../i18n'
import type { FrontMatterProp, FrontMatterPropType } from './frontMatter'
import { frontMatterOf } from './cm-frontmatter'

/* ------------------------------------------------------------------ */
/* 图标                                                                 */
/* ------------------------------------------------------------------ */
/*
 * 从 lucide 的图标节点数据内联（ISC 许可）。**刻意不用 lucide-react 组件**：
 * 那是 React 组件，要在 widget 里渲染就得挂 React root，而 React 18 的 createRoot 是异步渲染，
 * 与 CodeMirror 在 toDOM 时同步测量 widget 高度的做法冲突（会闪、会跳）。
 * 内联 SVG 保持纯 DOM，与 EditableTableWidget 的做法一致。
 */
type IconNode = [string, Record<string, string>]

const ICON_PATHS: Record<FrontMatterPropType, IconNode[]> = {
  // Sparkles
  auto: [
    ['path', { d: 'M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z' }],
    ['path', { d: 'M20 3v4' }], ['path', { d: 'M22 5h-4' }],
    ['path', { d: 'M4 17v2' }], ['path', { d: 'M5 18H3' }],
  ],
  // Type
  text: [
    ['polyline', { points: '4 7 4 4 20 4 20 7' }],
    ['line', { x1: '9', x2: '15', y1: '20', y2: '20' }],
    ['line', { x1: '12', x2: '12', y1: '4', y2: '20' }],
  ],
  // Hash
  number: [
    ['line', { x1: '4', x2: '20', y1: '9', y2: '9' }],
    ['line', { x1: '4', x2: '20', y1: '15', y2: '15' }],
    ['line', { x1: '10', x2: '8', y1: '3', y2: '21' }],
    ['line', { x1: '16', x2: '14', y1: '3', y2: '21' }],
  ],
  // SquareCheck
  checkbox: [
    ['rect', { width: '18', height: '18', x: '3', y: '3', rx: '2' }],
    ['path', { d: 'm9 12 2 2 4-4' }],
  ],
  // Calendar
  date: [
    ['path', { d: 'M8 2v4' }], ['path', { d: 'M16 2v4' }],
    ['rect', { width: '18', height: '18', x: '3', y: '4', rx: '2' }],
    ['path', { d: 'M3 10h18' }],
  ],
  // CalendarClock
  datetime: [
    ['path', { d: 'M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5' }],
    ['path', { d: 'M16 2v4' }], ['path', { d: 'M8 2v4' }], ['path', { d: 'M3 10h5' }],
    ['path', { d: 'M17.5 17.5 16 16.3V14' }],
    ['circle', { cx: '16', cy: '16', r: '6' }],
  ],
  // List
  list: [
    ['line', { x1: '8', x2: '21', y1: '6', y2: '6' }],
    ['line', { x1: '8', x2: '21', y1: '12', y2: '12' }],
    ['line', { x1: '8', x2: '21', y1: '18', y2: '18' }],
    ['line', { x1: '3', x2: '3.01', y1: '6', y2: '6' }],
    ['line', { x1: '3', x2: '3.01', y1: '12', y2: '12' }],
    ['line', { x1: '3', x2: '3.01', y1: '18', y2: '18' }],
  ],
}

const SVG_NS = 'http://www.w3.org/2000/svg'

function svgIcon(nodes: IconNode[]): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', '14')
  svg.setAttribute('height', '14')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  for (const [tag, attrs] of nodes) {
    const el = document.createElementNS(SVG_NS, tag)
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
    svg.appendChild(el)
  }
  return svg
}

/* ------------------------------------------------------------------ */
/* 类型推断与值转换                                                      */
/* ------------------------------------------------------------------ */

const TYPES: FrontMatterPropType[] = ['auto', 'text', 'number', 'checkbox', 'date', 'datetime', 'list']

/** 按值推断类型（`auto` 档用；推断不出按文本） */
export function inferType(value: string): Exclude<FrontMatterPropType, 'auto'> {
  const v = value.trim()
  if (/^(true|false)$/i.test(v)) return 'checkbox'
  if (/^-?\d+(\.\d+)?$/.test(v)) return 'number'
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'date'
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(v)) return 'datetime'
  if (/^\[.*\]$/.test(v) || v.includes(',')) return 'list'
  return 'text'
}

/** 值写回 YAML 前做最小必要的加引号（含 `:`/`#`/首尾空白/空值时） */
function yamlValue(v: string): string {
  if (v === '' || /^\s|\s$/.test(v) || /[:#]/.test(v)) return `"${v.replace(/"/g, '\\"')}"`
  return v
}

/** 列表：逗号分隔 ⇄ `[a, b]` */
const listToText = (v: string) =>
  v.replace(/^\[|\]$/g, '').split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean).join(', ')
const textToList = (v: string) =>
  `[${v.split(',').map((s) => s.trim()).filter(Boolean).map(yamlValue).join(', ')}]`

/** 字符串的显示列宽（CJK / 全角算 2 列）。用来把属性名输入框调到"刚好放得下" ——
 *  否则按字符数算宽度，中文名会被截断，而英文名又留出过多空白。 */
function displayWidth(s: string): number {
  let w = 0
  for (const ch of s) {
    w += /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(ch) ? 2 : 1
  }
  return w
}

/* ------------------------------------------------------------------ */
/* Widget                                                              */
/* ------------------------------------------------------------------ */

class PropertiesWidget extends WidgetType {
  /** 关闭当前打开的类型菜单（widget 被销毁时调用，避免菜单留在 body 上） */
  private openMenu: (() => void) | null = null

  constructor(
    readonly from: number,
    readonly to: number,
    readonly props: FrontMatterProp[],
    /** 属性名 → 类型（全局，来自 settingsStore；widget 内部会就地更新以支持换控件） */
    readonly types: Record<string, FrontMatterPropType>,
  ) { super() }

  eq(other: PropertiesWidget): boolean {
    if (this.from !== other.from || this.to !== other.to) return false
    if (this.props.length !== other.props.length) return false
    for (let i = 0; i < this.props.length; i++) {
      const a = this.props[i]
      const b = other.props[i]
      if (a.key !== b.key || a.value !== b.value || a.valueFrom !== b.valueFrom) return false
      if (a.hasBlockValue !== b.hasBlockValue) return false
      if (this.types[a.key] !== other.types[b.key]) return false
    }
    return true
  }

  toDOM(view: EditorView): HTMLElement {
    const lang = useSettingsStore.getState().language
    const t = (k: string) => translate(lang as Language, `properties.${k}`)
    const store = useSettingsStore.getState()

    const host = document.createElement('div')
    host.className = 'cm-live-block cm-live-block--properties'
    const shadow = host.attachShadow({ mode: 'open' })

    const style = document.createElement('style')
    style.textContent = `
      * { box-sizing: border-box; }
      .head { display: flex; align-items: center; gap: 8px; margin: 0 0 4px; font-size: 0.78em; color: var(--sidebar-text, #888); }
      .head .title { font-weight: 600; letter-spacing: 0.02em; }
      .head button { margin-left: auto; }
      .row { display: flex; align-items: center; gap: 6px; padding: 3px 6px; border-radius: 6px; }
      .row:hover { background: color-mix(in srgb, var(--editor-text, #333) 6%, transparent); outline: 1px solid var(--editor-border, #ddd); outline-offset: -1px; }
      /* 属性名宽度**按内容自适应**（size 属性给内在宽度），上限 40% ——
         既不会窄到看不全，也不会宽到把值挤走 */
      .row .key { flex: 0 0 auto; max-width: 40%; }
      .row .val { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; }
      .row .val input[type=text] { width: 100%; }
      .row .del { flex: 0 0 auto; opacity: 0; }
      .row:hover .del { opacity: 1; }
      input, button {
        font: inherit; color: var(--editor-text, #333);
        background: transparent; border: 1px solid transparent; border-radius: 4px;
        padding: 2px 4px; outline: none;
      }
      input:hover { border-color: var(--editor-border, #ddd); }
      input:focus { border-color: var(--editor-accent, #4a9eff); }
      input[type=checkbox] { accent-color: var(--editor-accent, #4a9eff); width: auto; }
      button { cursor: pointer; color: var(--sidebar-text, #888); display: inline-flex; align-items: center; justify-content: center; padding: 3px; }
      button:hover { color: var(--editor-accent, #4a9eff); background: color-mix(in srgb, var(--editor-text, #333) 8%, transparent); }
      .type { color: var(--sidebar-text, #888); }
      .type:hover { color: var(--editor-accent, #4a9eff); }
      /* 类型菜单的样式在 globals.css（.properties-type-menu）—— 它挂在 light DOM，
         以便与其它菜单共用主题外观，见下方创建菜单处的说明。 */
      .blocked { color: var(--sidebar-text, #888); font-style: italic; font-size: 0.9em; }
      .add { margin-top: 2px; gap: 6px; font-size: 0.82em; }
    `

    const head = document.createElement('div')
    head.className = 'head'
    const title = document.createElement('span')
    title.className = 'title'
    title.textContent = t('title')
    const srcBtn = document.createElement('button')
    srcBtn.textContent = t('editSource')
    srcBtn.addEventListener('mousedown', (e) => e.stopPropagation())
    srcBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      // 把光标放在**第一个属性行的行首**，而不是选中整块：
      //  · 选中整块虽然也能让列表让位，但整块处于全选态，接着一敲键盘就会把整段 YAML 替换掉；
      //  · 光标也不能放在块首（位置 0）—— 那与"刚打开文档、光标本来就在 0"无法区分，
      //    会导致一打开文档就看不到属性列表。
      // 放在第一个属性行行首：位置 > range.from（守卫判定为"在块内"）且是折叠光标（可直接编辑）。
      const doc = view.state.doc
      const openLine = doc.lineAt(this.from)
      const target = openLine.number < doc.lines ? doc.line(openLine.number + 1).from : this.from
      view.dispatch({ selection: { anchor: target } })
      view.focus()
    })
    head.append(title, srcBtn)

    const list = document.createElement('div')
    list.className = 'rows'

    /** 提交改动（走 dispatch ⇒ 撤销栈自动接上） */
    const commit = (from: number, to: number, insert: string) =>
      view.dispatch({ changes: { from, to, insert } })

    /** 阻止事件穿透到 CM6（否则 CM 会抢输入 / 移动光标） */
    const guard = (el: HTMLElement) => {
      el.addEventListener('mousedown', (e) => e.stopPropagation())
      el.addEventListener('beforeinput', (e) => e.stopPropagation())
      el.addEventListener('input', (e) => e.stopPropagation())
      el.addEventListener('keydown', (e) => {
        e.stopPropagation()
        if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); (el as HTMLInputElement).blur() }
      })
    }

    // 同时只允许一个类型菜单打开；widget 被销毁时也要把挂在 body 上的菜单收走
    let closeMenu: (() => void) | null = null
    /** 当前菜单是哪个 icon 打开的 —— 用于"点同一个收起、点另一个直接切换" */
    let openFor: HTMLElement | null = null
    this.openMenu = () => closeMenu?.()

    // 属性名列的宽度**取所有属性名里最宽的那个**（按显示列宽算），
    // 让每行用同一个 size ⇒ 值列左对齐。逐行按自身内容定宽会导致值列参差不齐。
    const sharedKeySize = Math.min(
      Math.max(4, ...this.props.map((p) => displayWidth(p.key) + 1)),
      28,
    )

    for (const p of this.props) {
      const row = document.createElement('div')
      row.className = 'row'

      /* ── 类型 icon（点开菜单）── */
      const typeBtn = document.createElement('button')
      typeBtn.className = 'type'
      const paintTypeIcon = () => {
        typeBtn.textContent = ''
        const ty = this.types[p.key] ?? 'auto'
        const effective = ty === 'auto' ? inferType(p.value) : ty
        typeBtn.appendChild(svgIcon(ICON_PATHS[effective]))
        typeBtn.title = t(`type${ty[0].toUpperCase()}${ty.slice(1)}`)
      }
      paintTypeIcon()
      typeBtn.addEventListener('mousedown', (e) => e.stopPropagation())
      typeBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        // 同一个 icon ⇒ 收起；另一个 icon ⇒ 先收起旧的再开自己的（直接切换）
        if (openFor === typeBtn) { closeMenu?.(); return }
        closeMenu?.()
        const menu = document.createElement('div')
        menu.className = 'properties-type-menu'
        for (const ty of TYPES) {
          const item = document.createElement('button')
          item.appendChild(svgIcon(ICON_PATHS[ty]))
          const label = document.createElement('span')
          label.textContent = t(`type${ty[0].toUpperCase()}${ty.slice(1)}`)
          item.appendChild(label)
          if (ty === (this.types[p.key] ?? 'auto')) {
            const tick = document.createElement('span')
            tick.className = 'tick'
            tick.textContent = '✓'
            item.appendChild(tick)
          }
          item.addEventListener('mousedown', (ev) => ev.stopPropagation())
          item.addEventListener('click', (ev) => {
            ev.stopPropagation()
            const next = ty
            this.types[p.key] = next // 就地更新，供换控件用
            store.setField('frontMatterTypes', { ...useSettingsStore.getState().frontMatterTypes, [p.key]: next })
            close()
            paintTypeIcon()
            renderValue()
          })
          menu.appendChild(item)
        }
        // 菜单挂到 **light DOM（body）** 并固定定位，两个理由：
        //  1) 主题对菜单的定制写在 light DOM（如 `[class*="menu"] { … !important }`），
        //     而样式不跨 shadow 边界 ⇒ 放 shadow 里就得不到主题的菜单外观，与其它菜单不一致；
        //  2) fixed 定位避开 `.cm-scroller` 的 overflow 裁剪（编辑器底部/右侧的行不会切掉菜单）。
        document.body.appendChild(menu)
        const rect = typeBtn.getBoundingClientRect()
        const mw = menu.offsetWidth
        const mh = menu.offsetHeight
        // 下方/右侧放不下就向上/向左翻，避免出屏
        const top = rect.bottom + 4 + mh > window.innerHeight ? Math.max(4, rect.top - mh - 4) : rect.bottom + 4
        const left = rect.left + mw > window.innerWidth - 4 ? Math.max(4, window.innerWidth - mw - 4) : rect.left
        menu.style.top = `${top}px`
        menu.style.left = `${left}px`

        const onDocClick = (ev: Event) => {
          // 点在菜单内部不算"点外面"（菜单在 light DOM，用 composedPath 判断最稳）
          if (ev.composedPath().includes(menu)) return
          close()
        }
        const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') close() }
        const close = () => {
          menu.remove()
          // 用 **bubble 阶段**监听：图标与菜单项都 stopPropagation 了，所以点它们不会走到这里；
          // 若用 capture 阶段会在图标自身的处理器之前先关掉菜单，导致"点同一个图标关了又开"。
          document.removeEventListener('click', onDocClick)
          document.removeEventListener('keydown', onKey, true)
          closeMenu = null
          openFor = null
        }
        closeMenu = close
        openFor = typeBtn
        document.addEventListener('click', onDocClick)
        document.addEventListener('keydown', onKey, true)
        // 菜单自身的空白区域也拦住，避免点到 padding 就把菜单关了
        menu.addEventListener('click', (ev) => ev.stopPropagation())
      })

      /* ── 属性名（可改；宽度按内容自适应，最长 45%）── */
      const keyInput = document.createElement('input')
      keyInput.className = 'key'
      keyInput.type = 'text'
      keyInput.value = p.key
      keyInput.size = sharedKeySize
      keyInput.placeholder = 'key'
      guard(keyInput)
      keyInput.addEventListener('blur', () => {
        const next = keyInput.value.trim()
        if (!next || next === p.key) return
        commit(p.keyFrom, p.keyTo, next)
        // 类型跟随改名（与 Obsidian 一致：类型按属性名存）
        const types = useSettingsStore.getState().frontMatterTypes
        if (types[p.key] !== undefined) {
          const { [p.key]: moved, ...rest } = types
          store.setField('frontMatterTypes', { ...rest, [next]: moved })
        }
      })

      /* ── 值（按类型换控件）── */
      const valBox = document.createElement('div')
      valBox.className = 'val'
      const renderValue = () => {
        valBox.textContent = ''
        if (p.hasBlockValue) {
          // 块状值（缩进列表/嵌套）：只读，避免写坏结构
          const span = document.createElement('span')
          span.className = 'blocked'
          span.textContent = t('blockValue')
          valBox.appendChild(span)
          return
        }
        const ty = this.types[p.key] ?? 'auto'
        const effective = ty === 'auto' ? inferType(p.value) : ty
        const write = (insert: string) => commit(p.valueFrom, p.valueTo, insert)

        if (effective === 'checkbox') {
          const cb = document.createElement('input')
          cb.type = 'checkbox'
          cb.checked = /^(true|yes|1)$/i.test(p.value.trim())
          guard(cb)
          cb.addEventListener('change', () => write(cb.checked ? 'true' : 'false'))
          valBox.appendChild(cb)
        } else if (effective === 'date' || effective === 'datetime') {
          const dt = document.createElement('input')
          dt.type = effective === 'date' ? 'date' : 'datetime-local'
          dt.value = effective === 'date' ? p.value.slice(0, 10) : p.value.replace(' ', 'T').slice(0, 16)
          guard(dt)
          dt.addEventListener('change', () => { if (dt.value) write(dt.value) })
          valBox.appendChild(dt)
        } else if (effective === 'number') {
          const num = document.createElement('input')
          num.type = 'number'
          num.value = p.value
          guard(num)
          num.addEventListener('blur', () => { if (num.value !== p.value) write(num.value) })
          valBox.appendChild(num)
        } else {
          const txt = document.createElement('input')
          txt.type = 'text'
          txt.value = effective === 'list' ? listToText(p.value) : p.value
          guard(txt)
          // 只在 blur 提交：每次 input 都提交会重建 widget 而丢焦点
          txt.addEventListener('blur', () => {
            const raw = txt.value.trim()
            // 列表要的是 `[a, b]` 字面量，不能再套一层引号（否则会变成字符串而不是列表）
            const next = effective === 'list' ? textToList(raw) : yamlValue(raw)
            if (next !== p.value) commit(p.valueFrom, p.valueTo, next)
          })
          valBox.appendChild(txt)
        }
      }
      renderValue()

      /* ── 删除该属性 ── */
      const del = document.createElement('button')
      del.className = 'del'
      del.textContent = '×'
      del.title = t('deleteProp')
      guard(del)
      del.addEventListener('click', (e) => {
        e.stopPropagation()
        const doc = view.state.doc
        // 连同行尾换行一起删（\r\n 要删两个字符）
        let end = p.lineTo
        if (doc.sliceString(end, end + 2) === '\r\n') end += 2
        else if (doc.sliceString(end, end + 1) === '\n') end += 1
        commit(p.lineFrom, end, '')
      })

      row.append(typeBtn, keyInput, valBox, del)
      list.appendChild(row)
    }

    /* ── 添加属性：插到闭合行之前 ──
       键用合法 ASCII 占位 —— 空键或中文键会让整块失去"元信息"资格，属性列表会直接消失。 */
    const add = document.createElement('button')
    add.className = 'add'
    add.textContent = `+ ${t('add')}`
    guard(add)
    add.addEventListener('click', (e) => {
      e.stopPropagation()
      const closeLine = view.state.doc.lineAt(Math.max(0, this.to - 1))
      commit(closeLine.from, closeLine.from, 'prop: \n')
    })

    shadow.append(style, head, list, add)
    return host
  }

  ignoreEvent(): boolean { return true }

  /** widget 被移除时（改文档、切模式、重建）把挂在 body 上的菜单一并收走，避免残留 */
  destroy(): void {
    this.openMenu?.()
  }
}

/* ------------------------------------------------------------------ */

/**
 * 从编辑器状态构建属性面板装饰。
 *
 * 两点必须注意：
 * 1) **必须是 StateField，不能是 ViewPlugin**：本装饰是 `block: true` 的跨行替换，
 *    CodeMirror 明确规定"替换换行的装饰不能由 ViewPlugin 提供"（会直接抛 RangeError）。
 *    项目里的跨行块 widget 也是这么做的 —— 见 cm-live-blocks.ts 的 `blockDecorField`。
 * 2) 区间**自己算**（`frontMatterOf`），不读 `frontMatterField`：StateField 之间互相读取
 *    依赖扩展注册顺序，而两者挂在不同的 compartment 里，顺序不保证。
 */
function buildFromState(state: EditorState): DecorationSet {
  const { range, props } = frontMatterOf(state)
  if (!range || !props.length) return Decoration.none

  // 选区与块相交 ⇒ 不渲染 widget，让原始 YAML 可编辑。
  // 点面板内部不会移动 CM 选区（事件被 stopPropagation 拦下），所以属性列表是"常驻"的；
  // 「编辑源码」按钮显式选中整块，列表才让位。
  const sel = state.selection.main
  if (sel.from < range.to && sel.to > range.from) return Decoration.none

  const types = useSettingsStore.getState().frontMatterTypes
  return Decoration.set([
    Decoration.replace({
      widget: new PropertiesWidget(range.from, range.to, props, types),
      block: true,
    }).range(range.from, range.to),
  ])
}

/** 元信息属性面板：仅实时模式挂载（源码模式保持原样显示 YAML） */
export const propertiesPanel = StateField.define<DecorationSet>({
  create(state) { return buildFromState(state) },
  update(deco, tr) {
    // 选区变化也要重建：光标进出块时列表要显示/让位
    if (tr.docChanged || tr.selection) return buildFromState(tr.state)
    return deco.map(tr.changes)
  },
  provide: (f) => EditorView.decorations.from(f),
})
