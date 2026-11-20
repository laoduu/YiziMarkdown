/**
 * selectionFormats.ts — 划词格式条（零依赖，可被 Node 单测直接加载）
 *
 * 与划词工具栏（selectionActions.ts）并列：用户可排序、可隐藏单个格式。
 * 动作参数直接复用 `Editor.insertMarkdown(markdown, mode)`，
 * 因此 toggle、标题换级、列表互转、表格内接管等行为与主格式工具栏完全一致。
 */

export type SelectionFormatId =
  | 'bold'
  | 'italic'
  | 'strikethrough'
  | 'highlight'
  | 'inlineCode'
  | 'superscript'
  | 'subscript'
  | 'heading'
  | 'unorderedList'
  | 'orderedList'
  | 'taskList'
  | 'quote'
  | 'math'
  | 'link'

export type SelectionFormatMode = 'wrap' | 'prefix' | 'ordered' | 'link' | 'tag' | 'block'

export type SelectionFormatAction =
  | { kind: 'insert'; markdown: string; mode?: SelectionFormatMode }
  /** 链接：把选中文字包成 `[文字](url)` 并选中 url（不弹窗） */
  | { kind: 'link' }

export interface SelectionFormatMenuItem {
  labelKey: string
  action: SelectionFormatAction
}

export interface SelectionFormatDef {
  labelKey: string
  /** 直接点击主按钮执行；有 menu 时主按钮只作为二级菜单入口 */
  action?: SelectionFormatAction
  /** 二级菜单项（hover 展开） */
  menu?: SelectionFormatMenuItem[]
}

/** 主格式工具栏的 `toolbar.*` 文案，保持两处命名一致 */
export const SELECTION_FORMAT_DEFS: Record<SelectionFormatId, SelectionFormatDef> = {
  bold: { labelKey: 'toolbar.bold', action: { kind: 'insert', markdown: '**', mode: 'wrap' } },
  italic: { labelKey: 'toolbar.italic', action: { kind: 'insert', markdown: '*', mode: 'wrap' } },
  strikethrough: { labelKey: 'toolbar.strikethrough', action: { kind: 'insert', markdown: '~~', mode: 'wrap' } },
  highlight: { labelKey: 'toolbar.highlight', action: { kind: 'insert', markdown: '==', mode: 'wrap' } },
  inlineCode: {
    labelKey: 'toolbar.inlineCode',
    menu: [
      { labelKey: 'toolbar.inlineCode', action: { kind: 'insert', markdown: '`', mode: 'wrap' } },
      { labelKey: 'toolbar.codeBlock', action: { kind: 'insert', markdown: '\n```\n\n```\n' } },
    ],
  },
  superscript: { labelKey: 'toolbar.superscript', action: { kind: 'insert', markdown: '^', mode: 'wrap' } },
  subscript: { labelKey: 'toolbar.subscript', action: { kind: 'insert', markdown: '~', mode: 'wrap' } },
  heading: {
    labelKey: 'toolbar.heading',
    menu: [
      { labelKey: 'toolbar.heading1', action: { kind: 'insert', markdown: '# ', mode: 'prefix' } },
      { labelKey: 'toolbar.heading2', action: { kind: 'insert', markdown: '## ', mode: 'prefix' } },
      { labelKey: 'toolbar.heading3', action: { kind: 'insert', markdown: '### ', mode: 'prefix' } },
    ],
  },
  unorderedList: { labelKey: 'toolbar.unorderedList', action: { kind: 'insert', markdown: '- ', mode: 'prefix' } },
  orderedList: { labelKey: 'toolbar.orderedList', action: { kind: 'insert', markdown: '1. ', mode: 'ordered' } },
  taskList: { labelKey: 'toolbar.taskList', action: { kind: 'insert', markdown: '- [ ] ', mode: 'prefix' } },
  quote: { labelKey: 'toolbar.quote', action: { kind: 'insert', markdown: '> ', mode: 'prefix' } },
  math: {
    labelKey: 'toolbar.math',
    menu: [
      { labelKey: 'toolbar.mathInline', action: { kind: 'insert', markdown: '$', mode: 'wrap' } },
      { labelKey: 'toolbar.mathBlock', action: { kind: 'insert', markdown: '\n$$\n公式\n$$\n' } },
    ],
  },
  link: { labelKey: 'toolbar.link', action: { kind: 'link' } },
}

export interface SelectionFormatConfig {
  id: SelectionFormatId
  enabled: boolean
}

/** 默认顺序：行内 → 标题 → 列表/引用 → 公式；链接默认隐藏，可在设置里打开 */
export const DEFAULT_SELECTION_FORMATS: SelectionFormatConfig[] = [
  { id: 'bold', enabled: true },
  { id: 'italic', enabled: true },
  { id: 'strikethrough', enabled: true },
  { id: 'highlight', enabled: true },
  { id: 'inlineCode', enabled: true },
  { id: 'superscript', enabled: true },
  { id: 'subscript', enabled: true },
  { id: 'heading', enabled: true },
  { id: 'unorderedList', enabled: true },
  { id: 'orderedList', enabled: true },
  { id: 'taskList', enabled: true },
  { id: 'quote', enabled: true },
  { id: 'math', enabled: true },
  { id: 'link', enabled: false },
]

const FORMAT_IDS = Object.keys(SELECTION_FORMAT_DEFS) as SelectionFormatId[]

export function isSelectionFormatId(value: unknown): value is SelectionFormatId {
  return typeof value === 'string' && (FORMAT_IDS as string[]).includes(value)
}

/**
 * 清理存档中的格式配置：
 * - 非数组 → 默认配置；
 * - 丢弃未知 id、重复 id（保留第一次出现）；
 * - 缺失项按默认顺序追加在末尾；
 * - enabled 非布尔时回落到默认值。
 * 兼容旧形态（纯 id 字符串数组），方便日后缩减存档结构。
 */
export function normalizeSelectionFormats(value: unknown): SelectionFormatConfig[] {
  if (!Array.isArray(value)) return DEFAULT_SELECTION_FORMATS.map((f) => ({ ...f }))
  const defaults = new Map(DEFAULT_SELECTION_FORMATS.map((f) => [f.id, f.enabled]))
  const seen = new Set<SelectionFormatId>()
  const out: SelectionFormatConfig[] = []
  for (const raw of value) {
    const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
    const id = typeof raw === 'string' ? raw : record?.id
    if (!isSelectionFormatId(id) || seen.has(id)) continue
    seen.add(id)
    const enabled = typeof record?.enabled === 'boolean' ? record.enabled : defaults.get(id) ?? true
    out.push({ id, enabled })
  }
  for (const def of DEFAULT_SELECTION_FORMATS) {
    if (!seen.has(def.id)) out.push({ ...def })
  }
  // 极端情况：全部被隐藏时至少恢复第一个，避免格式条什么都没有
  if (!out.some((f) => f.enabled)) out[0].enabled = true
  return out
}

/** 上移 / 下移一项；越界返回原数组 */
export function moveSelectionFormat(
  formats: SelectionFormatConfig[],
  id: SelectionFormatId,
  delta: -1 | 1,
): SelectionFormatConfig[] {
  const from = formats.findIndex((f) => f.id === id)
  if (from < 0) return formats
  const to = from + delta
  if (to < 0 || to >= formats.length) return formats
  const next = formats.slice()
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/** 显示 / 隐藏一项；不允许把最后一项隐藏掉（否则格式条只剩星芒入口） */
export function setSelectionFormatEnabled(
  formats: SelectionFormatConfig[],
  id: SelectionFormatId,
  enabled: boolean,
): SelectionFormatConfig[] {
  if (!enabled && formats.filter((f) => f.enabled).length <= 1) return formats
  return formats.map((f) => (f.id === id ? { ...f, enabled } : f))
}

export function enabledSelectionFormats(formats: SelectionFormatConfig[]): SelectionFormatConfig[] {
  return formats.filter((f) => f.enabled)
}
