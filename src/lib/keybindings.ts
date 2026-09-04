/**
 * keybindings.ts — 快捷键注册、匹配、持久化
 *
 * 数据流：
 *   keybindings.json  →  启动时 loadKeybindings()  →  内存 Map<actionId, keyCombo>
 *   设置页修改  →  saveKeybindings()  →  写入 keybindings.json + 刷新内存
 *   App.tsx handleKeyDown  →  resolveAction(event)  →  返回 actionId
 */

import { invokeTauri } from './tauri'
import { translate, getCurrentLang } from '../i18n'

/* ------------------------------------------------------------------ */
/*  Action 定义                                                        */
/* ------------------------------------------------------------------ */

export interface ShortcutAction {
  id: string          // "save" | "newFile" | ...
  labelKey: string    // "shortcuts.save"
  defaultKey: string  // "ctrl+s"
  categoryKey: string // "shortcuts.file" | ...
}

/** 应用支持的所有快捷键 action（按 category 分组，label 用 i18n key） */
export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  // -- 文件 --
  { id: 'newFile',       labelKey: 'shortcuts.newFile',       defaultKey: 'ctrl+n',            categoryKey: 'shortcuts.file' },
  { id: 'openFile',      labelKey: 'shortcuts.openFile',      defaultKey: 'ctrl+o',            categoryKey: 'shortcuts.file' },
  { id: 'save',          labelKey: 'shortcuts.save',          defaultKey: 'ctrl+s',            categoryKey: 'shortcuts.file' },
  { id: 'saveAs',        labelKey: 'shortcuts.saveAs',        defaultKey: 'ctrl+shift+s',      categoryKey: 'shortcuts.file' },
  { id: 'closeTab',      labelKey: 'shortcuts.closeTab',      defaultKey: 'ctrl+w',            categoryKey: 'shortcuts.file' },
  { id: 'exportHtml',    labelKey: 'shortcuts.exportHtml',    defaultKey: 'ctrl+h',                   categoryKey: 'shortcuts.file' },
  { id: 'exportMd',      labelKey: 'shortcuts.exportMd',      defaultKey: 'ctrl+m',                   categoryKey: 'shortcuts.file' },
  { id: 'exportTxt',     labelKey: 'shortcuts.exportTxt',     defaultKey: '',                   categoryKey: 'shortcuts.file' },
  // -- 编辑 --
  { id: 'undo',          labelKey: 'shortcuts.undo',          defaultKey: 'ctrl+z',            categoryKey: 'shortcuts.edit' },
  { id: 'redo',          labelKey: 'shortcuts.redo',          defaultKey: 'ctrl+y',            categoryKey: 'shortcuts.edit' },
  { id: 'search',        labelKey: 'shortcuts.search',        defaultKey: 'ctrl+f',            categoryKey: 'shortcuts.edit' },
  { id: 'toggleSidebar', labelKey: 'shortcuts.toggleSidebar', defaultKey: 'ctrl+\\',           categoryKey: 'shortcuts.edit' },
  // -- 格式 --
  { id: 'bold',          labelKey: 'shortcuts.bold',          defaultKey: 'ctrl+b',            categoryKey: 'shortcuts.format' },
  { id: 'italic',        labelKey: 'shortcuts.italic',        defaultKey: 'ctrl+i',            categoryKey: 'shortcuts.format' },
  { id: 'strikethrough', labelKey: 'shortcuts.strikethrough', defaultKey: 'ctrl+-',                   categoryKey: 'shortcuts.format' },
  { id: 'inlineCode',    labelKey: 'shortcuts.inlineCode',    defaultKey: 'ctrl++',                   categoryKey: 'shortcuts.format' },
  { id: 'heading1',      labelKey: 'shortcuts.heading1',      defaultKey: 'ctrl+1',            categoryKey: 'shortcuts.format' },
  { id: 'heading2',      labelKey: 'shortcuts.heading2',      defaultKey: 'ctrl+2',            categoryKey: 'shortcuts.format' },
  { id: 'heading3',      labelKey: 'shortcuts.heading3',      defaultKey: 'ctrl+3',            categoryKey: 'shortcuts.format' },
  { id: 'unorderedList', labelKey: 'shortcuts.unorderedList', defaultKey: 'ctrl+.',                   categoryKey: 'shortcuts.format' },
  { id: 'orderedList',   labelKey: 'shortcuts.orderedList',   defaultKey: 'ctrl+0',                   categoryKey: 'shortcuts.format' },
  { id: 'blockquote',    labelKey: 'shortcuts.blockquote',    defaultKey: 'ctrl+\'',                   categoryKey: 'shortcuts.format' },
  { id: 'link',          labelKey: 'shortcuts.link',          defaultKey: 'ctrl+k',            categoryKey: 'shortcuts.format' },
  { id: 'image',         labelKey: 'shortcuts.image',         defaultKey: '',                   categoryKey: 'shortcuts.format' },
  { id: 'codeBlock',     labelKey: 'shortcuts.codeBlock',     defaultKey: 'ctrl+`',                   categoryKey: 'shortcuts.format' },
  { id: 'table',         labelKey: 'shortcuts.table',         defaultKey: 'ctrl+t',                   categoryKey: 'shortcuts.format' },
  { id: 'horizontalRule', labelKey: 'shortcuts.horizontalRule', defaultKey: 'ctrl+l',                   categoryKey: 'shortcuts.format' },
  // -- 视图 --
  { id: 'toggleTheme',   labelKey: 'shortcuts.toggleTheme',   defaultKey: 'f2',                   categoryKey: 'shortcuts.view' },
  { id: 'viewCycle',     labelKey: 'shortcuts.viewCycle',     defaultKey: 'f3',      categoryKey: 'shortcuts.view' },
  { id: 'showShortcuts', labelKey: 'shortcuts.showShortcuts', defaultKey: 'f1',               categoryKey: 'shortcuts.view' },
  { id: 'slashMenu',     labelKey: 'shortcuts.slashMenu',     defaultKey: 'ins',              categoryKey: 'shortcuts.view' },
  { id: 'toggleDevtools', labelKey: 'shortcuts.toggleDevtools', defaultKey: 'f12',               categoryKey: 'shortcuts.view' },
  { id: 'presentSlides', labelKey: 'shortcuts.presentSlides', defaultKey: 'ctrl+alt+p',        categoryKey: 'shortcuts.view' },
]

/* ------------------------------------------------------------------ */
/*  运行时映射：actionId → keyCombo                                    */
/* ------------------------------------------------------------------ */

let currentMap: Record<string, string> = {}
let reverseMap: Record<string, string> = {}   // keyCombo → actionId

/** 从 Tauri 后端加载 keybindings.json 并缓存 */
export async function loadKeybindings(): Promise<void> {
  try {
    const json = await invokeTauri<string>('read_keybindings')
    const parsed: Record<string, string> = json ? JSON.parse(json) : {}
    // parsed 是 { "ctrl+s": "save" } 格式，需要反转为 { "save": "ctrl+s" }
    const actionMap: Record<string, string> = {}
    for (const [keyCombo, actionId] of Object.entries(parsed)) {
      actionMap[actionId] = keyCombo
    }
    buildMaps(actionMap)
  } catch {
    buildMaps({})
  }
}

/** 保存映射到 Tauri 后端 */
export async function saveKeybindings(actionMap: Record<string, string>): Promise<void> {
  // actionMap 是 { actionId: keyCombo }，后端存储格式是 { keyCombo: actionId }
  const jsonMap: Record<string, string> = {}
  for (const [actionId, keyCombo] of Object.entries(actionMap)) {
    if (keyCombo) jsonMap[keyCombo] = actionId
  }
  await invokeTauri('write_keybindings', { content: JSON.stringify(jsonMap, null, 2) })
  buildMaps(actionMap)
}

/** 构建正向/反向映射，补齐未配置的 action 为默认值 */
function buildMaps(actionMap: Record<string, string>): void {
  const merged: Record<string, string> = {}
  for (const action of SHORTCUT_ACTIONS) {
    merged[action.id] = actionMap[action.id] || action.defaultKey
  }
  currentMap = merged
  // 生成反向映射（用于 resolveAction）
  reverseMap = {}
  for (const [actionId, keyCombo] of Object.entries(currentMap)) {
    if (keyCombo) reverseMap[keyCombo] = actionId
  }
}

/** 获取当前 actionId → keyCombo 映射（供设置页展示） */
export function getKeybindingsMap(): Record<string, string> {
  return { ...currentMap }
}

/** 获取默认映射（供恢复默认） */
export function getDefaultMap(): Record<string, string> {
  const map: Record<string, string> = {}
  for (const action of SHORTCUT_ACTIONS) {
    map[action.id] = action.defaultKey
  }
  return map
}

/* ------------------------------------------------------------------ */
/*  键盘事件匹配                                                        */
/* ------------------------------------------------------------------ */

/** 将 KeyboardEvent 转为 keyCombo 字符串（如 "ctrl+s", "ctrl+shift+i"） */
export function eventToCombo(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('ctrl')
  if (e.shiftKey) parts.push('shift')
  if (e.altKey) parts.push('alt')
  // 主键：取 key 并规范化
  let key = e.key
  // Ctrl/Cmd + 字母时 e.code 是 "KeyX"，用 code 更可靠
  if ((e.ctrlKey || e.metaKey) && e.code && e.code.startsWith('Key')) {
    key = e.code.slice(3).toLowerCase() // "KeyS" → "s"
  } else if (key.length === 1) {
    key = key.toLowerCase()
  } else {
    // 功能键等
    key = key.toLowerCase()
  }
  // 过滤修饰键本身
  if (['control', 'shift', 'alt', 'meta'].includes(key)) return ''
  parts.push(key)
  return parts.join('+')
}

/** 根据当前映射表匹配 KeyboardEvent，返回 actionId 或 null */
export function resolveAction(e: KeyboardEvent): string | null {
  const combo = eventToCombo(e)
  return reverseMap[combo] || null
}

/** 获取 action 对应的当前快捷键字符串（用于设置页展示） */
export function getActionKey(actionId: string): string {
  return currentMap[actionId] || SHORTCUT_ACTIONS.find(a => a.id === actionId)?.defaultKey || ''
}


/** 检测快捷键冲突：返回与 combo 绑定的其他 actionId，无冲突返回 null */
export function findConflict(combo: string, currentMap: Record<string, string>, excludeActionId?: string): string | null {
  if (!combo) return null
  for (const [actionId, key] of Object.entries(currentMap)) {
    if (actionId === excludeActionId) continue
    if (key === combo) return actionId
  }
  return null
}

/** 根据 actionId 查找 action label（当前语言） */
export function getActionLabel(actionId: string): string {
  const action = SHORTCUT_ACTIONS.find(a => a.id === actionId)
  return action ? translate(getCurrentLang(), action.labelKey) : actionId
}

/* ------------------------------------------------------------------ */
/*  按键格式化（给用户看的）                                            */
/* ------------------------------------------------------------------ */

/** "ctrl+shift+i" → "Ctrl+Shift+I" */
export function formatKey(combo: string): string {
  if (!combo) return translate(getCurrentLang(), 'common.notSet')
  return combo
    .split('+')
    .map(part => {
      const lower = part.toLowerCase()
      if (lower === 'ctrl' || lower === 'alt' || lower === 'shift' || lower === 'meta') {
        return lower.charAt(0).toUpperCase() + lower.slice(1)
      }
      if (lower.startsWith('f') && lower.length <= 3 && !isNaN(Number(lower.slice(1)))) {
        return lower.toUpperCase()
      }
      return lower.toUpperCase()
    })
    .join('+')
}
