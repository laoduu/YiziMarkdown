/**
 * Skill 管理的 Tauri 命令封装。
 * 纯数据处理见 `skillsManifest.ts`，本文件只负责读写用户目录。
 */
import { invokeTauri, invokeTauriOrThrow } from './tauri'
import type { SkillManifest } from './skillsManifest'

/** 读取原始 `skills.json` 文本（沿用 AI 面板已有命令）。 */
export async function loadSkillManifestRaw(): Promise<string> {
  return (await invokeTauri<string>('list_skills')) || '{}'
}

/** 读取提示词正文（沿用 AI 面板已有命令）。 */
export async function readSkillContent(file: string): Promise<string> {
  return (await invokeTauri<string>('read_skill_file', { fileName: file })) || ''
}

export function writeSkillFile(fileName: string, content: string): Promise<void> {
  return invokeTauriOrThrow<void>('write_skill_file', { fileName, content })
}

export function deleteSkillFile(fileName: string): Promise<void> {
  return invokeTauriOrThrow<void>('delete_skill_file', { fileName })
}

export function writeSkillManifest(manifest: SkillManifest): Promise<void> {
  return invokeTauriOrThrow<void>('write_skills_manifest', {
    manifest: JSON.stringify(manifest),
  })
}

/** 技能清单或正文变更广播：AI 面板监听到后重新加载并清空提示词缓存。 */
export const SKILLS_CHANGED_EVENT = 'skills-changed'

export function notifySkillsChanged(): void {
  window.dispatchEvent(new CustomEvent(SKILLS_CHANGED_EVENT))
}
