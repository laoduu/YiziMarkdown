/**
 * 阅读模式翻页动画（v0.4.3）。
 *
 * 阅读模式只有一条"书卷翻页"的 3D 弯折书叶动画（components/Reader.tsx 里的
 * `reader-leaf`）。这里把它变成可选集合：除了默认的 3D 翻页，再共用演示模式
 * 的三条柔和型入场动画（水平滑动 / 淡入淡出 / 轻微缩放）。
 *
 * 为什么单独抽一个模块：settingsStore 要持久化这个字段，Reader.tsx 要渲染菜单，
 * 两处必须共用同一份 id 与 i18n 键，避免菜单加了选项、存档却不认识。
 *
 * 动画语义（与演示模式对齐）：
 *   - slide 水平滑动：新跨页从翻页方向滑入（默认）
 *   - flip  书卷翻页：书叶绕中缝弯折翻动
 *   - fade  淡入淡出：新跨页原地淡入，旧页留在下面被覆盖
 *   - zoom  轻微缩放：新跨页从 1.05 倍缩放落定，同时淡入
 */

export type ReaderAnim = 'flip' | 'slide' | 'fade' | 'zoom'

/** 默认动画：水平滑动（方向与翻页一致，最不容易看错前进/后退） */
export const DEFAULT_READER_ANIM: ReaderAnim = 'slide'

/** 菜单顺序：默认项在最前，其余按「柔和型」由动到静排列 */
export const READER_ANIMS: readonly ReaderAnim[] = ['slide', 'flip', 'fade', 'zoom']

/** 动画 id → i18n 键。slide/fade/zoom 直接复用演示模式已有的译名（水平滑动/淡入淡出/轻微缩放）。 */
export const READER_ANIM_I18N: Record<ReaderAnim, string> = {
  flip: 'reader.animFlip',
  slide: 'slideshow.animSlide',
  fade: 'slideshow.animFade',
  zoom: 'slideshow.animZoom',
}

/** 非 3D 动画的时长（毫秒）；必须与 reader.css 的 .reader-motion animation 时长一致 */
export const READER_MOTION_MS = 460

export function isReaderAnim(value: unknown): value is ReaderAnim {
  return typeof value === 'string' && (READER_ANIMS as readonly string[]).includes(value)
}
