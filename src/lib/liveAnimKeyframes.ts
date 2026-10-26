/**
 * 实时模式四种「点击显示源码」文字动画的**唯一事实源**。
 *
 * 消费方（两处，改这里即全局生效）：
 *   1. `cm-live-render.ts` —— liveEditTheme 注入 `.cm-md-anim-*` 与 `@keyframes live-txt-*`，
 *      这是真实动画：Decoration.line 类加在光标所在行，光标进入行（源码标记出现）时播放
 *   2. `SettingsModal.tsx` —— 设置-实时模式的「动画预览」（AnimationDemo）注入**同一套**
 *      @keyframes，保证预览演的就是真实效果
 *
 * ⚠️ 历史教训：v0.1.4 起预览曾手写另一套 demo-* keyframes（blur 3px / brightness 1.6 …），
 * 与真实参数（2px / 1.5 …）逐渐漂移，导致四个方案在小字预览里趋同、且与卡片上的
 * CSS 说明文案自相矛盾。现在两边都从这份数据生成，不允许再出现第二份拷贝。
 *
 * 卡片上的 CSS 说明文案（i18n 各语言的 anim*Css 键）也描述这套参数，改动时请一并核对。
 */

export interface LiveAnimSpec {
  /** 设置项 key；同时是类名后缀：真实 cm-md-anim-{key} / 预览 demo-anim-{key} */
  key: 'blur' | 'flash' | 'glow' | 'ripple'
  /** @keyframes 名（真实与预览共用同名定义，同文档内内容一致、无冲突） */
  name: string
  /** 动画时长 */
  duration: string
  /** 各时间点的 filter 值（这是动画唯一的可变属性） */
  frames: Record<string, string>
}

/** 四种方案的动画参数 —— 与 i18n 的 anim*Css 说明文案保持一致 */
export const LIVE_ANIMATIONS: LiveAnimSpec[] = [
  {
    key: 'blur',
    name: 'live-txt-blur',
    duration: '0.45s',
    frames: { '0%': 'blur(2px)', '100%': 'blur(0)' },
  },
  {
    key: 'flash',
    name: 'live-txt-flash',
    duration: '0.5s',
    frames: { '0%': 'brightness(1)', '30%': 'brightness(1.5)', '100%': 'brightness(1)' },
  },
  {
    key: 'glow',
    name: 'live-txt-glow',
    duration: '0.55s',
    frames: {
      '0%': 'blur(2px) brightness(0.9)',
      '30%': 'blur(0.5px) brightness(1.5)',
      '100%': 'blur(0) brightness(1)',
    },
  },
  {
    key: 'ripple',
    name: 'live-txt-ripple',
    duration: '0.7s',
    frames: {
      '0%': 'blur(2.5px) brightness(0.85)',
      '20%': 'blur(1px) brightness(1.6)',
      '50%': 'blur(0) brightness(1.25)',
      '100%': 'blur(0) brightness(1)',
    },
  },
]

/** 生成 CodeMirror baseTheme 条目：.cm-md-anim-{key} + @keyframes live-txt-* */
export function liveAnimThemeEntries(): Record<string, object> {
  const out: Record<string, object> = {}
  for (const a of LIVE_ANIMATIONS) {
    out[`.cm-md-anim-${a.key}`] = { animation: `${a.name} ${a.duration} ease forwards` }
    const kf: Record<string, Record<string, string>> = {}
    for (const [point, filter] of Object.entries(a.frames)) kf[point] = { filter }
    out[`@keyframes ${a.name}`] = kf
  }
  return out
}

/** 生成设置面板预览用的 CSS 文本：与真实动画同一套 @keyframes */
export function liveAnimPreviewCss(): string {
  const rules: string[] = []
  for (const a of LIVE_ANIMATIONS) {
    rules.push(`.demo-anim-${a.key} { animation: ${a.name} ${a.duration} ease forwards; }`)
    const frames = Object.entries(a.frames)
      .map(([point, filter]) => `${point} { filter: ${filter}; }`)
      .join(' ')
    rules.push(`@keyframes ${a.name} { ${frames} }`)
  }
  return rules.join('\n        ')
}
