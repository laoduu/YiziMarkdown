/**
 * 阅读模式双页对开的「跨页起点」计算（v0.4.3 修页码错位）。
 *
 * 约定：双页模式下跨页起点**永远是偶数索引**（偶数 = 左页，奇数 = 右页）。
 * 因此：
 *   - 总页数为偶数（索引 0…奇数）：最后一页是右页，它属于上一跨页
 *     （[total-2, total-1]），最后可停的起点 = total-2；
 *   - 总页数为奇数：最后一页是左页，可单独占一个跨页（右侧留白），
 *     起点 = total-1（偶数）。
 *
 * 旧实现取 `maxStart = total - 1` 且允许奇数起点，于是总页数为偶数时会
 * 出现一个「最后一页单独占左半、右半留白」的假跨页：BookPage 的左右页码
 * 位置按**索引奇偶**决定（偶数页贴左、奇数页贴右），但跨页起点变成奇数后，
 * 页面实际落在左半屏的却是奇数页 —— 页码跑到中轴；往前翻后起点继续是奇数，
 * 左右两页的页码就一直都挤在中轴。
 */

/** 双页模式下允许的最大跨页起点（一定是偶数）；单页模式就是最后一页。 */
export function spreadMaxStart(total: number, spread: boolean): number {
  if (total <= 0) return 0
  const last = total - 1
  return spread ? last - (last % 2) : last
}

/** 把任意页码夹到合法范围，并在双页模式下对齐到跨页起点（偶数索引）。 */
export function clampStartPage(page: number, total: number, spread: boolean): number {
  if (total <= 0 || !Number.isFinite(page)) return 0
  const maxStart = spreadMaxStart(total, spread)
  let p = Math.max(0, Math.min(Math.floor(page), maxStart))
  if (spread && p % 2 === 1) p -= 1
  return p
}
