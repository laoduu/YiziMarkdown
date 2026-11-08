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

/** 围栏代码块起始行（0~3 个缩进，``` 或 ~~~） */
const FENCE = /^\s{0,3}(```|~~~)/

/** 返回需要被替换成 ASCII 空格的 NBSP 字符偏移（升序；不会有重复） */
export function findMarkerNbspOffsets(text: string): number[] {
  const out: number[] = []
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
        for (let k = 0; k < nbLen; k++) out.push(lineStart + markerLen + k)
      }
    }
    lineStart = i + 1
  }
  return out
}

/** 把行首块标记后的 NBSP 规范化成 ASCII 空格（长度不变） */
export function normalizeMarkdownMarkers(text: string): string {
  const offsets = findMarkerNbspOffsets(text)
  if (!offsets.length) return text
  const chars = text.split('')
  for (const i of offsets) chars[i] = ' '
  return chars.join('')
}
