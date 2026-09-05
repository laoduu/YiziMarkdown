/**
 * AI Skills 技能加载（v0.2.1）。
 *
 * 技能定义在应用根目录 `skills/skills.json`，提示词正文在 `skills/<file>.md`。
 * 选中技能后，提示词以 system 消息注入 AI 上下文，引导大模型按技能执行。
 */
import { invokeTauri } from './tauri'

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
}

interface SkillsFile {
  version: number
  skills: Skill[]
}

/** 读取技能清单（失败返回空列表，不阻断 AI 面板）。 */
export async function loadSkills(): Promise<Skill[]> {
  try {
    const raw = await invokeTauri<string>('list_skills')
    const parsed = JSON.parse(raw || '{}') as SkillsFile
    return Array.isArray(parsed.skills) ? parsed.skills : []
  } catch {
    return []
  }
}

/** 读取技能提示词正文（.md），读取失败返回空串。 */
export async function loadSkillPrompt(file: string): Promise<string> {
  if (!file) return ''
  try {
    return (await invokeTauri<string>('read_skill_file', { fileName: file })) || ''
  } catch {
    return ''
  }
}
