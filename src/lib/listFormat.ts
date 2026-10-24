/**
 * 列表格式化的纯函数。
 *
 * 工具栏的「有序列表」此前对所有选中行都加同一个 `1. `。预览能把全 `1.` 顺序渲染，
 * 但源码模式会把编号原样显示出来，用户看到的就是一列 `1.`。
 * 这里把「多行选区 → 连续编号」独立成纯函数，方便测试，也避免再往 Editor 里堆正则。
 */

/** 把选区文本按非空行重新编号为 1. 2. 3.…（保留原有缩进，空行原样保留） */
export function numberOrderedLines(text: string): string {
  let n = 0
  return text
    .split('\n')
    .map((line) => {
      // 空行 / 只有缩进的行不占编号，否则列表会被空行截断后又跳号
      if (!line.trim()) return line
      n += 1
      // 已经有编号的行先剥掉旧编号，避免「1. 2. 3.」点两次变成「1. 1. 2.」
      const body = line.replace(/^(\s*)\d+[.)]\s+/, '$1')
      const indent = /^\s*/.exec(body)?.[0] ?? ''
      return `${indent}${n}. ${body.slice(indent.length)}`
    })
    .join('\n')
}
