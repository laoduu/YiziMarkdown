/**
 * [toc] 目录块的边框/背景显示开关。
 *
 * 预览与实时模式各自渲染目录，但两者都调用同一个 helper 注入按钮、
 * 读取同一个 settings.tocFrame 并落到 <html class="toc-frame"> 上，
 * 所以任意一处切换都会同步影响另一处与阅读模式。
 */
import { useSettingsStore } from '../stores/settingsStore.ts'

/** 方框套方框：表示「边框 + 背景」这个视觉区块 */
export const TOC_FRAME_ICON = `
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <rect x="8" y="8" width="8" height="8" rx="1"/>
  </svg>
`

export function toggleTocFrame(): void {
  const store = useSettingsStore.getState()
  store.setField('tocFrame', !store.tocFrame)
}

/** 在目录块右上角挂一个 hover 显示的开关按钮（重复调用不会重复插入） */
export function addTocFrameButton(nav: HTMLElement, title: string): void {
  // 目录重渲染 / 切换语言后可能已有按钮：只同步文案，不重复插入
  const existing = nav.querySelector<HTMLButtonElement>('.toc-frame-btn')
  if (existing) {
    existing.title = title
    return
  }

  const actions = document.createElement('div')
  actions.className = 'code-block-actions toc-frame-actions'

  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'toc-frame-btn'
  btn.title = title
  btn.innerHTML = TOC_FRAME_ICON
  btn.addEventListener('mousedown', (e) => {
    // 目录 widget 自己会监听 mousedown 跳回源码，按钮不能被它抢走
    e.preventDefault()
    e.stopPropagation()
  })
  btn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    toggleTocFrame()
  })

  actions.appendChild(btn)
  nav.appendChild(actions)
}
