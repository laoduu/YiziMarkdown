/**
 * markdownMarkerNbsp.ts — 修掉「块标记后面跟着 NBSP」这个输入法坑。
 *
 * 背景（真实 bug）：搜狗等中文输入法在候选状态下按下空格时，落进文档的常常是
 * **U+00A0（NBSP，不换行空格）**，而不是 ASCII 空格。于是用户看到的是
 * `## 标题`，但文档里实际是 `##\u00A0标题`。
 *
 * CommonMark 规定 ATX 标题的 `#` 之后必须是 **空格或制表符**；NBSP 不算空白，
 * 所以整行退化成普通文本 —— 预览、并排、实时渲染全部"不认这个标题"，
 * 与肉眼所见完全矛盾（用户会怀疑字符被污染）。
 * 列表 `-` / 引用 `>` / 有序列表 `1.` 同理。
 *
 * 处理口径：
 *   · **只在行首块标记之后**替换（`#`、`-`、`*`、`+`、`>`、`1.`、`1)`），
 *     正文中间的 NBSP 一律不动（它在排版上可能是有意为之）；
 *   · 一个 NBSP 换成一个 ASCII 空格，**长度不变** ⇒ 替换后光标/选区偏移不变；
 *   · 围栏代码块（``` / ~~~）内部不处理（那是代码内容，不能改）。
 *
 * **刻意不处理 U+3000（全角空格）**：
 *   全角空格是用户主动输入、有排版语义的字符（中文段首缩进、全角模式的空格），
 *   与"输入法误提交的 NBSP"性质完全不同。`##\u3000标题` 在 CommonMark 下本来就不是标题，
 *   保持原样、按语法如实渲染才是对的 —— 不能替用户把全角空格改写成半角。
 *   同理也不做全角标点（`＃`、`－`）的转半角：那属于改用户的源文本。
 */

/** 行首块标记 + 紧随的一串 NBSP */
const MARKER_NBSP = /^(#{1,6}|[-*+]|\d+[.)]|>)(\u00a0+)/

/**
 * 任务 checkbox 的 NBSP：Linux 输入法会把 `]` 后的空格写成 U+00A0。
 *
 * `markdown-it-task-lists` 只认字面量 `[ ] `（ASCII 空格），而实时模式用 JS `\s`
 * （包含 NBSP）又能识别，于是出现「Linux 实时模式正常、Windows 预览失效」。
 * 这里把任务标记里的 NBSP 也算出来，渲染前归一化、编辑器打开旧文档时也会自动修正。
 *
 * 捕获：前缀（缩进 + 列表标记 + `[`）、括号内字符、`]`、`]` 后的 NBSP。
 */
const TASK_NBSP_AFTER = /^(\s*(?:[-*+]|\d+[.)])\s+\[)(\u00a0|[ xX])(\])(\u00a0+)/
/** 括号内是 NBSP、`]` 后是普通空白或行尾的任务项 */
const TASK_NBSP_INSIDE = /^(\s*(?:[-*+]|\d+[.)])\s+\[)(\u00a0)(\])(?:\s|$)/

/** 围栏代码块起始行（0~3 个缩进，``` 或 ~~~） */
const FENCE = /^\s{0,3}(```|~~~)/

/** 返回需要被替换成 ASCII 空格的 NBSP 字符偏移（升序；不会重复） */
export function findMarkerNbspOffsets(text: string): number[] {
  const out = new Set<number>()
  let lineStart = 0
  let inFence = false

  for (let i = 0; i <= text.length; i++) {
    if (i !== text.length && text[i] !== '\n') continue
    const line = text.slice(lineStart, i)
    if (FENCE.test(line)) {
      inFence = !inFence
    } else if (!inFence) {
      const m = MARKER_NBSP.exec(line)
      if (m) {
        const markerLen = m[1].length
        const nbLen = m[2].length
        for (let k = 0; k < nbLen; k++) out.add(lineStart + markerLen + k)
      }
      collectTaskNbsp(line, lineStart, out)
    }
    lineStart = i + 1
  }
  return [...out].sort((a, b) => a - b)
}

/** 收集任务 checkbox 里的 NBSP：括号内一个 + `]` 后连续多个。 */
function collectTaskNbsp(line: string, lineStart: number, out: Set<number>): void {
  const after = TASK_NBSP_AFTER.exec(line)
  if (after) {
    const insideOffset = lineStart + after[1].length
    if (after[2] === '\u00a0') out.add(insideOffset)
    const afterOffset = insideOffset + after[2].length + after[3].length
    for (let k = 0; k < after[4].length; k++) out.add(afterOffset + k)
  }

  // `[ ]` 后是普通空白，但括号内本身是 NBSP：- [\u00a0] 任务
  const inside = TASK_NBSP_INSIDE.exec(line)
  if (inside) out.add(lineStart + inside[1].length)
}

/** 把行首块标记后的 NBSP 规范化成 ASCII 空格（长度不变） */
export function normalizeMarkdownMarkers(text: string): string {
  const offsets = findMarkerNbspOffsets(text)
  if (!offsets.length) return text
  const chars = text.split('')
  for (const i of offsets) chars[i] = ' '
  return chars.join('')
}
