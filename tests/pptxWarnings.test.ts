/**
 * pptxWarnings.test.ts — 导出告警的 i18n 回归。
 *
 * 为什么单独测：`PptxWarning.messageKey` 是**运行时动态字符串**（`t(w.messageKey)`），
 * `scripts/check-i18n.mjs` 的「用到但未定义」只能扫静态 `t('…')`，扫不到它。
 * 一旦 key 拼错，用户看到的就是 `pptxExport.warnXxx` 原文；所以这里从源码里
 * 抽出所有 `messageKey` 字面量，逐个语言核对是否真的定义了。
 */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'

const LIB_FILES = ['src/lib/pptxScene.ts', 'src/lib/pptxFrame.ts', 'src/lib/pptxExport.ts']
const LANG_FILES = readdirSync('src/i18n')
  .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
  .map((f) => `src/i18n/${f}`)

function usedKeys(): string[] {
  const keys = new Set<string>()
  for (const file of LIB_FILES) {
    const src = readFileSync(file, 'utf8')
    for (const m of src.matchAll(/messageKey:\s*'([^']+)'/g)) keys.add(m[1])
  }
  return Array.from(keys).sort()
}

test('PPTX 告警：源码用到的每个 messageKey 都在 15 种语言里有定义', () => {
  const keys = usedKeys()
  assert.ok(keys.length >= 10, `只找到 ${keys.length} 个 messageKey，抽取逻辑可能失效`)
  for (const key of keys) {
    assert.match(key, /^pptxExport\.warn/, key)
    const field = key.slice('pptxExport.'.length)
    for (const file of LANG_FILES) {
      const src = readFileSync(file, 'utf8')
      assert.ok(src.includes(`${field}:`), `${file} 缺少 ${key}`)
    }
  }
})

test('PPTX 告警：英文定义占位符与调用点参数一致', () => {
  const en = readFileSync('src/i18n/en.ts', 'utf8')
  // 逐个 key 检查英文文案是否含调用点传入的参数名，防止 `{px}` 写成 `{p}` 后静默不替换。
  const expected: Record<string, string[]> = {
    'pptxExport.warnImageNotEmbedded': ['src'],
    'pptxExport.warnImageRemote': ['src'],
    'pptxExport.warnImageLocal': ['src'],
    'pptxExport.warnMathFallback': ['tex'],
    'pptxExport.warnMathError': ['error', 'tex'],
    'pptxExport.warnMermaidRender': ['error'],
    'pptxExport.warnMermaidRaster': ['error'],
    'pptxExport.warnOverflowPx': ['px'],
    'pptxExport.warnOverflowSummary': ['n'],
    'pptxExport.warnShrinkPage': ['percent'],
    'pptxExport.warnCodeShrink': ['percent'],
    'pptxExport.warnPluginFailed': ['error'],
  }
  for (const [key, args] of Object.entries(expected)) {
    const field = key.slice('pptxExport.'.length)
    const line = en.split(/\r?\n/).find((l) => l.trim().startsWith(`${field}:`))
    assert.ok(line, `en 缺少 ${key}`)
    for (const arg of args) assert.ok(line.includes(`{${arg}}`), `${key} 缺少占位符 {${arg}}`)
  }
})
