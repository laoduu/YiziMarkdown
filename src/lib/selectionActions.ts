/**
 * 划词助手配置（零依赖，可被 Node 单测直接加载）。
 *
 * 功能来源：
 * - skill：引用 `skills.json` 里的技能，显示名默认取技能名；
 * - 系统功能：复制 / 粘贴 / 添加到对话。
 *
 * 只持久化用户改过的显示名；默认名称按当前语言 / 技能清单动态计算。
 */
import type { Skill } from './skillsManifest.ts'
import { resolveSkillIcon, type SkillIconName } from './skillIconNames.ts'

export type SelectionSystemAction = 'copy' | 'paste' | 'chat'
export type SelectionActionType = 'skill' | SelectionSystemAction

export interface SelectionActionConfig {
  id: string
  type: SelectionActionType
  /** type = skill 时必填 */
  skillId?: string
  /** 自定义显示名；空串 / 缺省时使用默认名称 */
  label?: string
}

/** 与旧版硬编码工具栏保持一致：4 个内置技能 + 复制 + 添加到对话。 */
export const DEFAULT_SELECTION_ACTIONS: SelectionActionConfig[] = [
  { id: 'default-slides-outline', type: 'skill', skillId: 'slides-outline', label: '演示稿' },
  { id: 'default-doc-summary', type: 'skill', skillId: 'doc-summary', label: '摘要' },
  { id: 'default-polish-writing', type: 'skill', skillId: 'polish-writing', label: '改写' },
  { id: 'default-translate-fulltext', type: 'skill', skillId: 'translate-fulltext', label: '翻译' },
  { id: 'default-copy', type: 'copy' },
  { id: 'default-chat', type: 'chat' },
]

export const SYSTEM_SELECTION_ACTIONS: SelectionSystemAction[] = ['copy', 'paste', 'chat']

export interface SelectionToolbarItem {
  id: string
  type: SelectionActionType
  label: string
  skillId?: string
  skill?: Skill
  iconName?: SkillIconName
  systemAction?: SelectionSystemAction
  /** 引用的技能已从清单中删除 */
  missingSkill: boolean
}

const TYPES: SelectionActionType[] = ['skill', 'copy', 'paste', 'chat']
const MAX_LABEL_LENGTH = 24

export function isSelectionActionType(value: unknown): value is SelectionActionType {
  return typeof value === 'string' && (TYPES as readonly string[]).includes(value)
}

export function isSystemSelectionAction(value: unknown): value is SelectionSystemAction {
  return value === 'copy' || value === 'paste' || value === 'chat'
}

function normalizedLabel(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, MAX_LABEL_LENGTH) : undefined
}

function actionKey(action: Pick<SelectionActionConfig, 'type' | 'skillId'>): string {
  return action.type === 'skill' ? `skill:${action.skillId ?? ''}` : action.type
}

/**
 * 清理存档中的配置：
 * - 非数组 → 默认配置；
 * - 丢弃非法 type / 缺少 skillId 的技能项；
 * - 同一技能 / 同一系统功能只保留第一次出现；
 * - 缺 ID 时补一个稳定 ID。
 */
export function normalizeSelectionActions(value: unknown): SelectionActionConfig[] {
  if (!Array.isArray(value)) return DEFAULT_SELECTION_ACTIONS.map((a) => ({ ...a }))
  const seen = new Set<string>()
  const out: SelectionActionConfig[] = []
  value.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') return
    const record = raw as Record<string, unknown>
    if (!isSelectionActionType(record.type)) return
    const type = record.type
    const skillId = type === 'skill'
      ? (typeof record.skillId === 'string' ? record.skillId.trim() : '')
      : undefined
    if (type === 'skill' && !skillId) return
    const key = actionKey({ type, skillId })
    if (seen.has(key)) return
    seen.add(key)
    const id = typeof record.id === 'string' && record.id.trim()
      ? record.id.trim()
      : `sel-${type}-${skillId ?? `system-${index}`}`
    out.push({
      id,
      type,
      ...(skillId ? { skillId } : {}),
      ...(normalizedLabel(record.label) ? { label: normalizedLabel(record.label) } : {}),
    })
  })
  return out
}

/** 生成稳定的行 ID（同一会话内不重复即可）。 */
let actionSeq = 0
export function createSelectionActionId(
  type: SelectionActionType,
  skillId?: string,
): string {
  const suffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${(actionSeq++).toString(36)}`
  return `${type}-${skillId ?? 'system'}-${suffix}`
}

/** 同一个技能 / 系统功能是否已经在列表中。 */
export function hasSelectionAction(
  actions: SelectionActionConfig[],
  type: SelectionActionType,
  skillId?: string,
): boolean {
  const key = actionKey({ type, skillId })
  return actions.some((a) => actionKey(a) === key)
}

export function moveSelectionAction(
  actions: SelectionActionConfig[],
  id: string,
  delta: -1 | 1,
): SelectionActionConfig[] {
  const from = actions.findIndex((a) => a.id === id)
  if (from < 0) return actions
  const to = from + delta
  if (to < 0 || to >= actions.length) return actions
  const next = actions.slice()
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/**
 * 把配置解析成可渲染的按钮项。
 *
 * `systemLabels` 由调用方按当前语言传入，避免把翻译后的默认名写进存档。
 */
export function buildSelectionToolbarItems(
  actions: SelectionActionConfig[],
  skills: Skill[],
  systemLabels: Record<SelectionSystemAction, string>,
): SelectionToolbarItem[] {
  const byId = new Map(skills.map((s) => [s.id, s]))
  return actions.map((action) => {
    if (action.type === 'skill') {
      const skill = action.skillId ? byId.get(action.skillId) : undefined
      return {
        id: action.id,
        type: 'skill',
        skillId: action.skillId,
        skill,
        label: action.label?.trim() || skill?.name || action.skillId || '',
        iconName: skill ? resolveSkillIcon(skill) : undefined,
        missingSkill: !skill,
      }
    }
    return {
      id: action.id,
      type: action.type,
      label: action.label?.trim() || systemLabels[action.type],
      systemAction: action.type,
      missingSkill: false,
    }
  })
}
