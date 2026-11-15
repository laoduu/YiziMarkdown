/**
 * Skill 图标名称（零依赖，可被 Node 单测 / AI 面板 / 设置页共用）。
 *
 * 清单里只存名称字符串，React 组件映射见 `components/SkillIcon.tsx`。
 * 现有内置技能没有 icon 字段时按 ID 回退到语义图标。
 */

export const SKILL_ICON_NAMES = [
  'sparkles',
  'file-text',
  'pencil',
  'presentation',
  'languages',
  'wand2',
  'code2',
  'file-code2',
  'book-open',
  'list-tree',
  'search',
  'message-square',
  'bot',
  'globe',
  'lightbulb',
  'clipboard-list',
  'table2',
  'image',
  'music',
  'video',
  'briefcase',
  'graduation-cap',
  'rocket',
  'zap',
  'brain',
  'scan-text',
  'pen-tool',
  'spell-check',
  'align-left',
  'notebook-pen',
  'text-quote',
  'target',
] as const

export type SkillIconName = (typeof SKILL_ICON_NAMES)[number]

export const DEFAULT_SKILL_ICON: SkillIconName = 'sparkles'

/** 旧清单 / 内置技能没有 icon 时的语义回退。 */
const ID_FALLBACK: Record<string, SkillIconName> = {
  'slides-outline': 'presentation',
  'doc-summary': 'file-text',
  'polish-writing': 'pencil',
  'translate-fulltext': 'languages',
  'markdown-format': 'file-code2',
}

export function isSkillIconName(value: unknown): value is SkillIconName {
  return typeof value === 'string'
    && (SKILL_ICON_NAMES as readonly string[]).includes(value)
}

/** 优先使用技能自带的 icon，其次按内置 ID 回退，最后用通用 Sparkles。 */
export function resolveSkillIcon(skill: { id: string; icon?: string }): SkillIconName {
  if (isSkillIconName(skill.icon)) return skill.icon
  return ID_FALLBACK[skill.id] ?? DEFAULT_SKILL_ICON
}
