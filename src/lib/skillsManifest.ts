/**
 * Skill 清单的纯数据处理（零依赖，可被 Node 单测直接加载）。
 *
 * 运行时读写（Tauri 命令）放在 `skillsAdmin.ts`，这里只负责：
 * - 解析/序列化 `skills.json`
 * - ID / 文件名校验
 * - 新建 / 编辑 / 删除时更新清单（含 hiddenIds / customized 标记）
 */
import { isSkillIconName, resolveSkillIcon, type SkillIconName } from './skillIconNames.ts'

export interface Skill {
  id: string
  name: string
  /** 列表中显示的一句话简介 */
  summary: string
  /** hover / 弹窗中显示的详细介绍 */
  description: string
  /** 提示词文件名（skills/ 目录下的 .md） */
  file: string
  /** 是否需要引用当前文档作为上下文 */
  needsDoc?: boolean
  /** 结果去向：chat = 送进右侧 AI 助手（默认）；inline = 直接改写文档 */
  delivery?: 'chat' | 'inline'
  /** 图标名称，见 `skillIconNames.ts` */
  icon?: string
  /** 用户通过管理页改过：升级同步时不覆盖 */
  customized?: boolean
}

export interface SkillManifest {
  version: number
  skills: Skill[]
  /** 用户删除 / 改 ID 的内置技能：升级同步时不恢复 */
  hiddenIds: string[]
  [key: string]: unknown
}

/** 管理页表单中的可编辑字段 */
export interface SkillDraft {
  id: string
  name: string
  summary: string
  description: string
  needsDoc: boolean
  delivery?: 'chat' | 'inline'
  icon?: SkillIconName
}

export type SkillValidationError =
  | 'name-required'
  | 'id-required'
  | 'id-invalid'
  | 'id-duplicate'
  | 'file-collision'

const ID_PATTERN = /^[A-Za-z0-9_-]+$/

/** 解析清单；缺字段时补默认值，并把脏条目过滤掉。 */
export function parseSkillManifest(raw: string): SkillManifest {
  let parsed: Record<string, unknown> = {}
  try {
    const value = JSON.parse(raw || '{}')
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      parsed = value as Record<string, unknown>
    }
  } catch {
    parsed = {}
  }
  const skills = Array.isArray(parsed.skills)
    ? parsed.skills
        .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
        .filter((s) => typeof s.id === 'string' && typeof s.file === 'string')
        .map((s) => ({
          ...s,
          id: String(s.id),
          name: typeof s.name === 'string' ? s.name : String(s.id),
          summary: typeof s.summary === 'string' ? s.summary : '',
          description: typeof s.description === 'string' ? s.description : '',
          file: String(s.file),
          needsDoc: s.needsDoc === true,
          delivery: s.delivery === 'inline' ? 'inline' : 'chat',
          ...(typeof s.icon === 'string' ? { icon: s.icon } : {}),
          ...(s.customized === true ? { customized: true } : {}),
        })) as Skill[]
    : []
  const hiddenIds = Array.isArray(parsed.hiddenIds)
    ? parsed.hiddenIds.filter((v): v is string => typeof v === 'string')
    : []
  return {
    ...parsed,
    version: typeof parsed.version === 'number' ? parsed.version : 0,
    skills,
    hiddenIds,
  }
}

export function serializeSkillManifest(manifest: SkillManifest): string {
  return JSON.stringify(manifest, null, 2)
}

/**
 * 由 ID 派生一个未被占用的提示词文件名。
 * 例：`translate` → `translate.md`；已存在时 `translate-2.md`。
 */
export function skillFileFromId(id: string, takenFiles: Iterable<string>): string {
  const taken = new Set(Array.from(takenFiles, (f) => f.toLowerCase()))
  const base = id.trim() || 'skill'
  let candidate = `${base}.md`
  let n = 2
  while (taken.has(candidate.toLowerCase())) {
    candidate = `${base}-${n}.md`
    n += 1
  }
  return candidate
}

/** 校验表单；通过返回 null。 */
export function validateSkillDraft(
  draft: SkillDraft,
  skills: Skill[],
  currentId: string | null,
): SkillValidationError | null {
  if (!draft.name.trim()) return 'name-required'
  const id = draft.id.trim()
  if (!id) return 'id-required'
  if (!ID_PATTERN.test(id)) return 'id-invalid'
  const duplicated = skills.some((s) => s.id === id && s.id !== currentId)
  if (duplicated) return 'id-duplicate'
  return null
}

export interface SkillSavePlan {
  manifest: SkillManifest
  /** 需要写入的正文文件 */
  file: string
  /** 改 ID / 文件名后需要删除的旧文件 */
  deleteFile: string | null
  content: string
}

/**
 * 生成保存计划：
 * - 新建：文件名由 ID 派生；
 * - 编辑：保留原文件；改动 ID 时换新文件名，并把旧 ID 记入 hiddenIds；
 * - 所有保存过的条目都标记 customized，升级时不被内置版本覆盖。
 */
export function planSkillSave(
  manifest: SkillManifest,
  draft: SkillDraft,
  content: string,
  currentId: string | null,
): SkillSavePlan {
  const id = draft.id.trim()
  const name = draft.name.trim()
  const existing = currentId
    ? manifest.skills.find((s) => s.id === currentId)
    : undefined

  const otherFiles = manifest.skills
    .filter((s) => s.id !== (existing?.id ?? ''))
    .map((s) => s.file)

  let file: string
  let deleteFile: string | null = null
  if (existing) {
    const idChanged = existing.id !== id
    if (idChanged) {
      file = skillFileFromId(id, otherFiles)
      deleteFile = existing.file
    } else {
      file = existing.file
    }
  } else {
    file = skillFileFromId(id, otherFiles)
  }

  const entry: Skill = {
    ...(existing ?? {}),
    id,
    name,
    summary: draft.summary.trim(),
    description: draft.description.trim(),
    file,
    needsDoc: draft.needsDoc,
    delivery: draft.delivery === 'inline' ? 'inline' : 'chat',
    icon: isSkillIconName(draft.icon)
      ? draft.icon
      : resolveSkillIcon(existing ?? { id }),
    customized: true,
  }

  const hiddenIds = new Set(
    manifest.hiddenIds.filter((hidden) => hidden !== id),
  )
  if (existing && existing.id !== id) hiddenIds.add(existing.id)

  const skills = existing
    ? manifest.skills.map((s) => (s.id === existing.id ? entry : s))
    : [...manifest.skills, entry]

  return {
    manifest: {
      ...manifest,
      skills,
      hiddenIds: Array.from(hiddenIds),
    },
    file,
    deleteFile,
    content,
  }
}

export interface SkillDeletePlan {
  manifest: SkillManifest
  /** 需要删除的正文文件；仍被其它技能引用时为 null */
  deleteFile: string | null
}

/** 生成删除计划：移除条目、记录 hiddenId、清理不再被引用的文件。 */
export function planSkillDelete(manifest: SkillManifest, id: string): SkillDeletePlan {
  const target = manifest.skills.find((s) => s.id === id)
  const remaining = manifest.skills.filter((s) => s.id !== id)
  const stillUsed = target
    ? remaining.some((s) => s.file.toLowerCase() === target.file.toLowerCase())
    : false
  const hiddenIds = new Set(manifest.hiddenIds)
  if (target) hiddenIds.add(id)
  return {
    manifest: {
      ...manifest,
      skills: remaining,
      hiddenIds: Array.from(hiddenIds),
    },
    deleteFile: target && !stillUsed ? target.file : null,
  }
}
