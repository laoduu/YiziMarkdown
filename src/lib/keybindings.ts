/**
 * keybindings.ts — 快捷键注册、匹配、持久化
 *
 * 数据流：
 *   keybindings.json  →  启动时 loadKeybindings()  →  内存 Map<actionId, keyCombo>
 *   设置页修改  →  saveKeybindings()  →  写入 keybindings.json + 刷新内存
 *   App.tsx handleKeyDown  →  resolveAction(event)  →  返回 actionId
 */

import { invokeTauri } from './tauri'

/* ------------------------------------------------------------------ */
/*  Action 定义                                                        */
/* ------------------------------------------------------------------ */

export interface ShortcutAction {
  id: string          // "save" | "newFile" | ...
  label: string       // "保存文件"
  defaultKey: string  // "ctrl+s"
  category: string    // "文件" | "编辑" | "格式" | "视图"
}

/** 应用支持的所有快捷键 action（按 category 分组） */
export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  // -- 文件 --
  { id: 'newFile',       label: '新建文件',     defaultKey: 'ctrl+n',            category: '文件' },
  { id: 'openFile',      label: '打开文件',     defaultKey: 'ctrl+o',            category: '文件' },
  { id: 'save',          label: '保存文件',     defaultKey: 'ctrl+s',            category: '文件' },
  { id: 'saveAs',        label: '另存为',       defaultKey: 'ctrl+shift+s',      category: '文件' },
  { id: 'closeTab',      label: '关闭标签',     defaultKey: 'ctrl+w',            category: '文件' },
  { id: 'exportHtml',    label: '导出 HTML',    defaultKey: 'ctrl+h',                   category: '文件' },
  { id: 'exportMd',      label: '导出 Markdown', defaultKey: 'ctrl+m',                   category: '文件' },
  { id: 'exportTxt',     label: '导出纯文本',   defaultKey: '',                   category: '文件' },
  // -- 编辑 --
  { id: 'undo',          label: '撤销',         defaultKey: 'ctrl+z',            category: '编辑' },
  { id: 'redo',          label: '重做',         defaultKey: 'ctrl+y',            category: '编辑' },
  { id: 'search',        label: '搜索',         defaultKey: 'ctrl+f',            category: '编辑' },
  { id: 'toggleSidebar', label: '切换侧边栏',   defaultKey: 'ctrl+\\',           category: '编辑' },
  // -- 格式 --
  { id: 'bold',          label: '粗体',         defaultKey: 'ctrl+b',            category: '格式' },
  { id: 'italic',        label: '斜体',         defaultKey: 'ctrl+i',            category: '格式' },
  { id: 'strikethrough', label: '删除线',       defaultKey: 'ctrl+-',                   category: '格式' },
  { id: 'inlineCode',    label: '行内代码',     defaultKey: 'ctrl++',                   category: '格式' },
  { id: 'heading1',      label: '一级标题',     defaultKey: 'ctrl+1',            category: '格式' },
  { id: 'heading2',      label: '二级标题',     defaultKey: 'ctrl+2',            category: '格式' },
  { id: 'heading3',      label: '三级标题',     defaultKey: 'ctrl+3',            category: '格式' },
  { id: 'unorderedList', label: '无序列表',     defaultKey: 'ctrl+.',                   category: '格式' },
  { id: 'orderedList',   label: '有序列表',     defaultKey: 'ctrl+0',                   category: '格式' },
  { id: 'blockquote',    label: '引用',         defaultKey: 'ctrl+\'',                   category: '格式' },
  { id: 'link',          label: '链接',         defaultKey: 'ctrl+k',            category: '格式' },
  { id: 'image',         label: '图片',         defaultKey: '',                   category: '格式' },
  { id: 'codeBlock',     label: '代码块',       defaultKey: 'ctrl+`',                   category: '格式' },
  { id: 'table',         label: '表格',         defaultKey: 'ctrl+t',                   category: '格式' },
  { id: 'horizontalRule', label: '分割线',     defaultKey: 'ctrl+l',                   category: '格式' },
  // -- 视图 --
  { id: 'toggleTheme',   label: '切换深浅模式', defaultKey: 'f2',                   category: '视图' },
  { id: 'viewCycle',     label: '切换视图',     defaultKey: 'f3',      category: '视图' },
  { id: 'showShortcuts', label: '快捷键大全',   defaultKey: 'f1',               category: '视图' },
  { id: 'slashMenu',     label: '斜杠菜单',     defaultKey: 'ins',              category: '视图' },
  { id: 'toggleDevtools', label: '开发者工具',  defaultKey: 'f12',               category: '视图' },
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

/** 根据 actionId 查找 action label */
export function getActionLabel(actionId: string): string {
  return SHORTCUT_ACTIONS.find(a => a.id === actionId)?.label || actionId
}

/* ------------------------------------------------------------------ */
/*  按键格式化（给用户看的）                                            */
/* ------------------------------------------------------------------ */

/** "ctrl+shift+i" → "Ctrl+Shift+I" */
export function formatKey(combo: string): string {
  if (!combo) return '未设置'
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
