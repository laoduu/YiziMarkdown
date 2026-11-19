/**
 * SelectionAIIcon — 划词浮栏最左侧的入口图标（四角星芒）。
 *
 * 为什么不用 PNG 应用图标：彩色位图在 16px 下更像 logo，没有「可以点」的暗示；
 * 单色 SVG 跟随 `currentColor`，直接吃工具栏的强调色，也方便做状态动效。
 *
 * 结构上拆成主星 + 小星两个 path，动效因此可以分开做（见 globals.css 的 selection-ai-*）：
 *   1. 浮栏出现：主星弹入，小星延迟点亮（一次性）
 *   2. 静置：小星每 6 秒眨一下
 *   3. 悬停：外层按钮旋转放大（变换挂在根节点，不打断子元素的动画）
 * 未来接 AI 面板时，可给按钮加 `.is-ai-active`，让小星做慢速环绕表示「入口已激活」。
 */
interface SelectionAIIconProps {
  size?: number
  className?: string
}

export default function SelectionAIIcon({ size = 16, className }: SelectionAIIconProps) {
  return (
    <svg
      className={`selection-ai-icon ${className ?? ''}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      {/* 主星：左下的大四角星 */}
      <path
        className="selection-ai-main"
        d="M6.2 4.2 Q7.1 8.6 11.6 9.6 Q7.1 10.6 6.2 15 Q5.3 10.6 0.8 9.6 Q5.3 8.6 6.2 4.2 Z"
      />
      {/* 小星：右上角，负责「眨眼」*/}
      <path
        className="selection-ai-sm"
        d="M12.8 1.6 Q13.2 3.5 15.1 3.9 Q13.2 4.3 12.8 6.2 Q12.4 4.3 10.5 3.9 Q12.4 3.5 12.8 1.6 Z"
      />
    </svg>
  )
}
