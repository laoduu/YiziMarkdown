/**
 * tableCells.ts — 实时模式表格单元格的纯逻辑
 *
 * 只放不依赖 DOM 的计算：键盘跳格目标、行内标记的包裹/去包裹。
 * 目的是让 `cm-live-blocks.ts` 里的 widget 逻辑保持薄，并能在 node --test 下直接验证
 * （tests/tableCells.test.ts）。DOM 相关部分（聚焦、光标、选区）仍在 widget 内。
 */

export interface CellTarget {
  r: number
  c: number
  /** true 表示目标行还不存在，调用方需要先追加一行 */
  addRow?: boolean
}

/**
 * Tab / Shift+Tab 的目标单元格。
 *
 * 末行末格再按 Tab → 返回 `{ r: rowCount, c: 0, addRow: true }`（新增一行，停在行首）。
 * 首行首格再按 Shift+Tab → null（停在原地）。
 */
export function tabTarget(
  r: number,
  c: number,
  rowCount: number,
  colCount: number,
  dir: 1 | -1,
): CellTarget | null {
  if (colCount <= 0) return null
  if (dir > 0) {
    if (c + 1 < colCount) return { r, c: c + 1 }
    if (r + 1 < rowCount) return { r: r + 1, c: 0 }
    return { r: rowCount, c: 0, addRow: true }
  }
  if (c - 1 >= 0) return { r, c: c - 1 }
  if (r - 1 >= 0) return { r: r - 1, c: colCount - 1 }
  return null
}

/**
 * Enter 的目标单元格：同列的下一行；已在最后一行则新增一行。
 * 与 Obsidian / Word 一致，连续 Enter 可以快速增行。
 */
export function enterTarget(r: number, c: number, rowCount: number): CellTarget {
  if (r + 1 < rowCount) return { r: r + 1, c }
  return { r: rowCount, c, addRow: true }
}

/**
 * 方向键的目标单元格（不做边界判定，越界返回 null）。
 * 是否「该切格」由 widget 侧根据光标是否位于文本边界决定：
 * 无条件切格会让单元格内的光标无法移动。
 */
export function arrowTarget(
  r: number,
  c: number,
  rowCount: number,
  colCount: number,
  key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight',
): CellTarget | null {
  switch (key) {
    case 'ArrowUp': return r > 0 ? { r: r - 1, c } : null
    case 'ArrowDown': return r + 1 < rowCount ? { r: r + 1, c } : null
    case 'ArrowLeft': return c > 0 ? { r, c: c - 1 } : null
    case 'ArrowRight': return c + 1 < colCount ? { r, c: c + 1 } : null
    default: return null
  }
}

// 包裹/去包裹的规则与正文编辑器共用，实现见 inlineWrap.ts。
// 这里继续导出，保持表格侧调用点与测试的导入路径不变。
export { toggleWrap, type WrapResult } from './inlineWrap.ts'

