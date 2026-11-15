/**
 * 划词助手配置纯逻辑单测。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_SELECTION_ACTIONS,
  buildSelectionToolbarItems,
  hasSelectionAction,
  moveSelectionAction,
  normalizeSelectionActions,
} from '../src/lib/selectionActions.ts'
import type { Skill } from '../src/lib/skillsManifest.ts'

const skills: Skill[] = [
  { id: 'slides-outline', name: '演示稿', summary: '', description: '', file: 'slides.md' },
  { id: 'doc-summary', name: '摘要', summary: '', description: '', file: 'summary.md' },
]

const labels = { copy: '复制', paste: '粘贴', chat: '添加到对话' }

test('默认配置保持旧版 6 个按钮', () => {
  assert.deepEqual(
    DEFAULT_SELECTION_ACTIONS.map((a) => a.type),
    ['skill', 'skill', 'skill', 'skill', 'copy', 'chat'],
  )
  assert.equal(hasSelectionAction(DEFAULT_SELECTION_ACTIONS, 'skill', 'slides-outline'), true)
  assert.equal(hasSelectionAction(DEFAULT_SELECTION_ACTIONS, 'paste'), false)
})

test('normalizeSelectionActions 保留空数组，非法配置回落默认', () => {
  assert.deepEqual(normalizeSelectionActions([]), [])
  assert.equal(normalizeSelectionActions('bad').length, DEFAULT_SELECTION_ACTIONS.length)
  assert.equal(normalizeSelectionActions(undefined).length, DEFAULT_SELECTION_ACTIONS.length)
})

test('normalizeSelectionActions 清理非法项、去重并补 ID', () => {
  const out = normalizeSelectionActions([
    { type: 'skill' },                                   // 缺 skillId
    { type: 'nope' },                                     // 非法类型
    { type: 'skill', skillId: 'a' },                      // 补 ID
    { type: 'skill', skillId: 'a', label: '  自定义  ' },  // 重复，丢弃
    { type: 'copy', id: 'copy-1', label: '  复制一下 ' },   // 保留 ID / 去空格
    { type: 'paste', id: 'paste-1' },
  ])
  assert.equal(out.length, 3)
  assert.equal(out[0].id, 'sel-skill-a')
  assert.equal(out[1].id, 'copy-1')
  assert.equal(out[1].label, '复制一下')
  assert.equal(out[2].type, 'paste')
})

test('hasSelectionAction 区分技能和系统功能', () => {
  const actions = [{ id: '1', type: 'skill' as const, skillId: 'a' }]
  assert.equal(hasSelectionAction(actions, 'skill', 'a'), true)
  assert.equal(hasSelectionAction(actions, 'skill', 'b'), false)
  assert.equal(hasSelectionAction(actions, 'copy'), false)
})

test('moveSelectionAction 只在边界内移动', () => {
  const actions = [
    { id: 'a', type: 'copy' as const },
    { id: 'b', type: 'paste' as const },
    { id: 'c', type: 'chat' as const },
  ]
  assert.deepEqual(moveSelectionAction(actions, 'b', -1).map((a) => a.id), ['b', 'a', 'c'])
  assert.deepEqual(moveSelectionAction(actions, 'b', 1).map((a) => a.id), ['a', 'c', 'b'])
  assert.deepEqual(moveSelectionAction(actions, 'a', -1).map((a) => a.id), ['a', 'b', 'c'])
  assert.deepEqual(moveSelectionAction(actions, 'c', 1).map((a) => a.id), ['a', 'b', 'c'])
  assert.deepEqual(moveSelectionAction(actions, 'missing', 1).map((a) => a.id), ['a', 'b', 'c'])
})

test('buildSelectionToolbarItems 解析技能、系统名称与缺失技能', () => {
  const items = buildSelectionToolbarItems(
    [
      { id: '1', type: 'skill', skillId: 'doc-summary' },
      { id: '2', type: 'skill', skillId: 'deleted', label: '旧技能' },
      { id: '3', type: 'copy' },
      { id: '4', type: 'chat', label: '对话' },
    ],
    skills,
    labels,
  )
  assert.equal(items[0].label, '摘要')
  assert.equal(items[0].iconName, 'file-text')
  assert.equal(items[1].label, '旧技能')
  assert.equal(items[1].missingSkill, true)
  assert.equal(items[2].label, '复制')
  assert.equal(items[3].label, '对话', '自定义名称优先于系统默认名')
})
