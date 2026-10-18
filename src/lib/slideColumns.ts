/**
 * slideColumns.ts — 演示模式「分栏」的两个 HUD 旋钮：栏内对齐 / 分栏样式（分隔线·卡片）。
 *
 * 为什么单独一个模块（与 lib/slideTypography.ts 同样的理由）：
 * 这些值既要从设置持久化（settingsStore）、又要变成 DOM class（Slideshow.tsx）、
 * 还要能被 `node --test` 直接单测 ⇒ 纯函数 + 零依赖（不 import npm 包、不 import React）。
 *
 * 两个旋钮的语义：
 *   - 栏内对齐：分栏页每一栏**内部**（栏内标题 / 文案 / 列表 / 引用 / 图片 / 代码块）的对齐方式。
 *     作用域只有栏内 —— 页标题（`splitColumns` 抽出的 intro）属于页面层级，**不参与**，
 *     它继续跟着所属版式走（内容页左对齐、封面/章节页居中）。
 *     解决的问题：`.ys-cols` 是等宽栅格 ⇒ 第 2 栏的左边线**恒等于屏幕中心 + gap/2**，
 *     与「内容填充宽度」无关（代数上 W 被完全消掉）。栏内容少时用户只看到左栏在飘，
 *     右栏毫无反馈 —— 对齐 + 卡片共同把「栏在哪里」变成看得见的东西。
 *   - 分栏样式：card（**默认**）/ line（栏间细线）/ none（纯文字，无任何参照）。
 *     卡片是本问题的主药方：卡片外框随填充宽度**两侧同时伸缩**，参照物立起来；
 *     对齐则是「在框里怎么排」。两者互补 —— 正因为它是最该默认打开的那个，
 *     这里破例让默认值产出 class（见下）。
 *
 * 约定（与 slideTypography 一致）：**取到默认值时不产出 class**。
 *   - 对齐默认 left：无对应 CSS 规则 ⇒ 逐像素零变化；
 *   - 样式默认 card：**有意的默认观感升级**，会产出 `ys-col-style-card`。
 *     这是刻意取舍 —— 卡片是这组旋钮的价值所在，默认藏起来等于没做；
 *     只有用户显式选「无」时才退回无参照的旧观感。
 */

/** 栏内对齐：左（默认）/ 中 / 右 */
export type SlideColAlign = 'left' | 'center' | 'right'

export const SLIDE_COL_ALIGNS: SlideColAlign[] = ['left', 'center', 'right']

export const DEFAULT_SLIDE_COL_ALIGN: SlideColAlign = 'left'

/** 分栏样式：卡片（默认）/ 分隔线 / 无 */
export type SlideColStyle = 'none' | 'line' | 'card'

export const SLIDE_COL_STYLES: SlideColStyle[] = ['none', 'line', 'card']

export const DEFAULT_SLIDE_COL_STYLE: SlideColStyle = 'card'

export function isSlideColAlign(v: unknown): v is SlideColAlign {
  return typeof v === 'string' && (SLIDE_COL_ALIGNS as string[]).includes(v)
}

export function isSlideColStyle(v: unknown): v is SlideColStyle {
  return typeof v === 'string' && (SLIDE_COL_STYLES as string[]).includes(v)
}

/**
 * 合成该页生效的栏对齐：**页级 `<!-- align: left|center|right -->` 覆盖 HUD 全局设置**。
 * 作者写在文档里的显式意图 > 播放时的全局偏好；非法 / 缺失的页级值一律回落 HUD
 * （与 extractDirectives 对非法 layout 的"忽略并回落推断"同一处理）。
 */
export function resolveColAlign(hud: SlideColAlign, pageAlign?: string): SlideColAlign {
  return isSlideColAlign(pageAlign) ? pageAlign : (isSlideColAlign(hud) ? hud : DEFAULT_SLIDE_COL_ALIGN)
}

/** 栏内对齐 class（挂在 .ys-slide 上；CSS 见 slideshow.css 的「分栏对齐」段） */
export const colAlignClass = (align: SlideColAlign): string => `ys-col-align-${align}`

/** 分栏样式 class（挂在 .yizi-slideshow 根节点上，整副演示生效）。
 *  仅显式的 'none' 返回空串（用户主动要回无参照的旧观感）。 */
export const colStyleClass = (style: SlideColStyle): string => (style === 'none' ? '' : `ys-col-style-${style}`)
