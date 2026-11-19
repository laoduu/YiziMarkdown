/**
 * 文档内 AI（划词改写）的纯逻辑：提示词拼装、快捷意图、范围校验、行级 diff。
 *
 * 与右侧 AI 助手区分：
 *   - 右侧助手：对话 + 技能，产出停留在聊天里；
 *   - 这里：对选区直接产出可替换的正文，调用方负责写回编辑器。
 *
 * 本模块不依赖 Tauri / React / DOM，便于 Node 单测。
 */

export type InlineIntentId =
  | 'polish'
  | 'expand'
  | 'shorten'
  | 'translate'
  | 'proofread'
  | 'toList'
  | 'explainCode'
  | 'tidyTable'

export interface ChatPayloadMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** 单次发送的选区上限：超过只发前缀，避免撑爆上下文窗口 */
export const MAX_SELECTION_CHARS = 8000

export function truncateSelection(
  text: string,
  max: number = MAX_SELECTION_CHARS,
): { text: string; truncated: boolean } {
  if (max <= 0 || text.length <= max) return { text, truncated: false }
  return { text: text.slice(0, max), truncated: true }
}

/**
 * 按选区特征挑快捷意图。
 *
 * 顺序即展示顺序；调用方负责把 id 映射成当前语言文案。
 */
export function pickInlineIntents(text: string): InlineIntentId[] {
  const body = text.trim()
  if (!body) return ['polish', 'expand', 'shorten', 'toList']

  const looksLikeCode =
    /(^|\n)\s*(```|~~~)/.test(body) ||
    /(^|\n)( {4}|\t)\S/.test(body) ||
    /(^|\n)\s*(const|let|var|function|class|def|import|export|package|public|private|protected|#include|SELECT|FROM)\b/.test(body)
  if (looksLikeCode) return ['explainCode', 'proofread', 'shorten', 'translate']

  const looksLikeTable = /(^|\n)\s*\|.*\|\s*(\n|$)/.test(body)
  if (looksLikeTable) return ['tidyTable', 'toList', 'shorten', 'translate']

  const cjk = (body.match(/[\u3400-\u9fff]/g) ?? []).length
  const latin = (body.match(/[A-Za-z]/g) ?? []).length
  // 纯英文段落：首选翻译成中文
  if (cjk === 0 && latin > 0) return ['translate', 'polish', 'shorten', 'proofread']

  return ['polish', 'expand', 'shorten', 'proofread']
}

/**
 * 文档内 AI 的系统提示词。
 *
 * 约束必须是硬性的：模型很容易在正文前后加「好的，以下是…」，那会直接被写回文档。
 */
const INLINE_SYSTEM_PROMPT = [
  '你是 YiziMarkdown 的文档内编辑助手，只负责按用户指令改写给定的 Markdown 片段。',
  '硬性要求：',
  '1. 只输出改写后的 Markdown 正文，不要任何解释、前言、结语或「以下是…」。',
  '2. 不要用 ``` 包裹整段结果（片段本身就是代码时除外，保留原有围栏）。',
  '3. 保留原有的标题层级、列表符号、缩进、链接与行内代码；用户未要求时不要改变结构。',
  '4. 用户要求翻译时只输出译文。',
  '5. 用户未指定输出语言时，沿用原文语言。',
].join('\n')

/**
 * 拼装一次改写请求。
 *
 * 原文用 `"""` 包起来，和指令隔开，避免指令里出现 Markdown 时模型分不清边界。
 */
export function buildInlineMessages(
  instruction: string,
  original: string,
): ChatPayloadMessage[] {
  const user = `指令：${instruction.trim()}\n\n待处理内容：\n"""\n${original}\n"""`
  return [
    { role: 'system', content: INLINE_SYSTEM_PROMPT },
    { role: 'user', content: user },
  ]
}

/** 应用前校验：编辑器里这段文字必须仍是当初选中的内容 */
export function isRangeStillValid(original: string, current: string): boolean {
  return original === current
}

export type DiffLineType = 'same' | 'add' | 'del'

export interface DiffLine {
  type: DiffLineType
  text: string
}

/**
 * 行级 LCS diff，用于卡片内「对比原文」。
 *
 * 只处理选区这一小段文本；超过 `maxLines` 时退化成「全删 + 全增」，
 * 避免 O(n×m) 在大段落下吃内存。
 */
export function diffLines(before: string, after: string, maxLines = 400): DiffLine[] {
  const a = before.split('\n')
  const b = after.split('\n')
  if (a.length > maxLines || b.length > maxLines) {
    return [...a.map((text) => ({ type: 'del' as const, text })), ...b.map((text) => ({ type: 'add' as const, text }))]
  }

  const n = a.length
  const m = b.length
  // dp[i][j] = a[i..] 与 b[j..] 的 LCS 长度
  const width = m + 1
  const dp = new Uint32Array((n + 1) * width)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * width + j] = a[i] === b[j]
        ? dp[(i + 1) * width + j + 1] + 1
        : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1])
    }
  }

  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: 'same', text: a[i] })
      i++
      j++
    } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
      out.push({ type: 'del', text: a[i] })
      i++
    } else {
      out.push({ type: 'add', text: b[j] })
      j++
    }
  }
  while (i < n) out.push({ type: 'del', text: a[i++] })
  while (j < m) out.push({ type: 'add', text: b[j++] })
  return out
}
