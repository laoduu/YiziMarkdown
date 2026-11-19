/**
 * Skill 清单纯逻辑单测（不依赖 Tauri / 浏览器）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseSkillManifest,
  serializeSkillManifest,
  skillFileFromId,
  validateSkillDraft,
  planSkillSave,
  planSkillDelete,
  type Skill,
  type SkillManifest,
} from '../src/lib/skillsManifest.ts'

function manifest(skills: Skill[] = [], hiddenIds: string[] = []): SkillManifest {
  return { version: 6, skills, hiddenIds }
}

function skill(overrides: Partial<Skill> & Pick<Skill, 'id'>): Skill {
  return {
    id: overrides.id,
    name: overrides.name ?? overrides.id,
    summary: overrides.summary ?? '',
    description: overrides.description ?? '',
    file: overrides.file ?? `${overrides.id}.md`,
    needsDoc: overrides.needsDoc ?? false,
    ...(overrides.customized === true ? { customized: true } : {}),
  }
}

test('parseSkillManifest 补默认值并过滤脏条目', () => {
  const parsed = parseSkillManifest(JSON.stringify({
    version: 6,
    skills: [
      { id: 'a', file: 'a.md', icon: 'rocket' },
      { id: 1, file: 'bad.md' },
      { name: 'no id', file: 'x.md' },
    ],
    hiddenIds: ['old', 2],
    extra: 'keep-me',
  }))
  assert.equal(parsed.version, 6)
  assert.equal(parsed.skills.length, 1)
  assert.equal(parsed.skills[0].name, 'a', '缺失名称时回落到 id')
  assert.equal(parsed.skills[0].icon, 'rocket')
  assert.deepEqual(parsed.hiddenIds, ['old'])
  assert.equal(parsed.extra, 'keep-me', '未知字段必须保留')
})

test('parseSkillManifest 对损坏 JSON 返回空清单', () => {
  const parsed = parseSkillManifest('{oops')
  assert.deepEqual(parsed.skills, [])
  assert.deepEqual(parsed.hiddenIds, [])
  assert.equal(parsed.version, 0)
})

test('serializeSkillManifest 输出可再次解析的 JSON', () => {
  const m = manifest([skill({ id: 'a' })], ['b'])
  const parsed = parseSkillManifest(serializeSkillManifest(m))
  assert.equal(parsed.skills[0].id, 'a')
  assert.deepEqual(parsed.hiddenIds, ['b'])
})

test('skillFileFromId 避开已占用文件名', () => {
  assert.equal(skillFileFromId('a', []), 'a.md')
  assert.equal(skillFileFromId('a', ['a.md']), 'a-2.md')
  assert.equal(skillFileFromId('a', ['a.md', 'A-2.MD']), 'a-3.md')
})

test('validateSkillDraft 校验名称、ID 格式与唯一性', () => {
  const skills = [skill({ id: 'a' })]
  const base = { id: 'b', name: 'B', summary: '', description: '', needsDoc: false }
  assert.equal(validateSkillDraft(base, skills, null), null)
  assert.equal(validateSkillDraft({ ...base, name: ' ' }, skills, null), 'name-required')
  assert.equal(validateSkillDraft({ ...base, id: ' ' }, skills, null), 'id-required')
  assert.equal(validateSkillDraft({ ...base, id: 'bad id' }, skills, null), 'id-invalid')
  assert.equal(validateSkillDraft({ ...base, id: 'a' }, skills, null), 'id-duplicate')
  // 编辑自己时不把自身算重复
  assert.equal(validateSkillDraft({ ...base, id: 'a' }, skills, 'a'), null)
})

test('planSkillSave 新建技能：派生文件并标记 customized', () => {
  const plan = planSkillSave(manifest(), {
    id: 'new-skill', name: '新技能', summary: '摘要', description: '说明', needsDoc: true, icon: 'rocket',
  }, '# 正文', null)
  assert.equal(plan.file, 'new-skill.md')
  assert.equal(plan.deleteFile, null)
  assert.equal(plan.content, '# 正文')
  assert.equal(plan.manifest.skills.length, 1)
  const entry = plan.manifest.skills[0]
  assert.equal(entry.id, 'new-skill')
  assert.equal(entry.name, '新技能')
  assert.equal(entry.needsDoc, true)
  assert.equal(entry.icon, 'rocket')
  assert.equal(entry.customized, true)
})

test('planSkillSave 编辑同 ID：保留原文件并更新字段', () => {
  const existing = skill({ id: 'a', file: 'custom-file.md', name: '旧名' })
  const plan = planSkillSave(manifest([existing]), {
    id: 'a', name: '新名', summary: 's', description: 'd', needsDoc: false,
  }, 'content', 'a')
  assert.equal(plan.file, 'custom-file.md')
  assert.equal(plan.deleteFile, null)
  assert.equal(plan.manifest.skills.length, 1)
  assert.equal(plan.manifest.skills[0].name, '新名')
  assert.equal(plan.manifest.skills[0].customized, true)
})

test('planSkillSave 改 ID：换文件、隐藏旧 ID、删除旧文件', () => {
  const existing = skill({ id: 'old', file: 'old.md', customized: true })
  const plan = planSkillSave(manifest([existing]), {
    id: 'new', name: 'N', summary: '', description: '', needsDoc: false,
  }, 'content', 'old')
  assert.equal(plan.file, 'new.md')
  assert.equal(plan.deleteFile, 'old.md')
  assert.deepEqual(plan.manifest.hiddenIds, ['old'])
  assert.equal(plan.manifest.skills[0].id, 'new')
  assert.equal(plan.manifest.skills[0].customized, true)
})

test('planSkillSave 重新使用 hidden ID 时解除隐藏', () => {
  const plan = planSkillSave(manifest([], ['a']), {
    id: 'a', name: 'A', summary: '', description: '', needsDoc: false,
  }, 'x', null)
  assert.deepEqual(plan.manifest.hiddenIds, [])
})

test('planSkillDelete 记录 hiddenId 并清理独占文件', () => {
  const m = manifest([skill({ id: 'a', file: 'a.md' }), skill({ id: 'b', file: 'b.md' })])
  const plan = planSkillDelete(m, 'a')
  assert.equal(plan.manifest.skills.length, 1)
  assert.deepEqual(plan.manifest.hiddenIds, ['a'])
  assert.equal(plan.deleteFile, 'a.md')
})

test('planSkillDelete 共享文件不删除', () => {
  const m = manifest([
    skill({ id: 'a', file: 'same.md' }),
    skill({ id: 'b', file: 'same.md' }),
  ])
  const plan = planSkillDelete(m, 'a')
  assert.equal(plan.deleteFile, null)
})

test('delivery：解析保留 inline，缺省为 chat', () => {
  const parsed = parseSkillManifest(JSON.stringify({
    version: 7,
    skills: [
      { id: 'a', file: 'a.md', delivery: 'inline' },
      { id: 'b', file: 'b.md' },
      { id: 'c', file: 'c.md', delivery: 'bogus' },
    ],
    hiddenIds: [],
  }))
  assert.equal(parsed.skills[0].delivery, 'inline')
  assert.equal(parsed.skills[1].delivery, 'chat')
  assert.equal(parsed.skills[2].delivery, 'chat')
})

test('planSkillSave：草稿的 delivery 落到清单里', () => {
  const draft = {
    id: 'a', name: 'A', summary: '', description: '', needsDoc: false,
    delivery: 'inline' as const, icon: 'pencil' as const,
  }
  const plan = planSkillSave(manifest([]), draft, 'prompt', null)
  assert.equal(plan.manifest.skills[0].delivery, 'inline')
})
