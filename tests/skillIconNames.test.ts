/**
 * Skill 图标名称纯逻辑单测。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_SKILL_ICON,
  SKILL_ICON_NAMES,
  isSkillIconName,
  resolveSkillIcon,
} from '../src/lib/skillIconNames.ts'

test('内置技能按 ID 回退到语义图标', () => {
  assert.equal(resolveSkillIcon({ id: 'slides-outline' }), 'presentation')
  assert.equal(resolveSkillIcon({ id: 'doc-summary' }), 'file-text')
  assert.equal(resolveSkillIcon({ id: 'polish-writing' }), 'pencil')
  assert.equal(resolveSkillIcon({ id: 'translate-fulltext' }), 'languages')
  assert.equal(resolveSkillIcon({ id: 'markdown-format' }), 'file-code2')
})

test('未知 / 非法 icon 回退到 ID 语义图标或默认值', () => {
  assert.equal(resolveSkillIcon({ id: 'custom', icon: 'nope' }), DEFAULT_SKILL_ICON)
  assert.equal(resolveSkillIcon({ id: 'custom' }), DEFAULT_SKILL_ICON)
  // 自定义 icon 有效时优先使用
  assert.equal(resolveSkillIcon({ id: 'doc-summary', icon: 'rocket' }), 'rocket')
})

test('isSkillIconName 只接受白名单里的名称', () => {
  assert.equal(isSkillIconName('languages'), true)
  assert.equal(isSkillIconName('nope'), false)
  assert.equal(isSkillIconName(1), false)
  assert.equal(SKILL_ICON_NAMES.length >= 24, true, '图标选择器需要足够多的语义图标')
})
