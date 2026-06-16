import type MarkdownIt from 'markdown-it'
import type { EditorPlugin } from './types'
import { katexPlugin } from './built-in/katex'
import { mermaidPlugin } from './built-in/mermaid'

// ---- 内置插件注册 ----
const builtinPlugins: EditorPlugin[] = [
  katexPlugin,
  mermaidPlugin,
]

// 缓存已加载的插件实例
const loadedPlugins = new Map<string, EditorPlugin>()

// 缓存各插件注入的 CSS <style> 元素 id
const cssElementIds = new Map<string, string>()

/**
 * 获取所有已注册的插件定义（含未启用的）
 */
export function getAllPlugins(): EditorPlugin[] {
  return builtinPlugins
}

/**
 * 根据 id 查找插件定义
 */
export function getPluginById(id: string): EditorPlugin | undefined {
  return builtinPlugins.find(p => p.id === id)
}

/**
 * 动态加载插件（首次启用时调用）
 * 加载成功后自动注入 CSS
 */
export async function loadPlugin(id: string): Promise<boolean> {
  if (loadedPlugins.has(id)) return true

  const plugin = getPluginById(id)
  if (!plugin) return false

  const ok = await plugin.load()
  if (ok) {
    loadedPlugins.set(id, plugin)

    // 自动注入 CSS
    if (plugin.injectCSS) {
      const css = await plugin.injectCSS()
      if (css) {
        const elId = `yizimarkdown-plugin-css-${id}`
        let el = document.getElementById(elId)
        if (!el) { el = document.createElement('style'); el.id = elId; document.head.appendChild(el) }
        el.textContent = css
        cssElementIds.set(id, elId)
      }
    }
  }
  return ok
}

/**
 * 停用插件，清理资源
 */
export async function unloadPlugin(id: string): Promise<void> {
  const plugin = loadedPlugins.get(id)
  if (plugin?.destroy) plugin.destroy()
  loadedPlugins.delete(id)

  // 移除注入的 CSS
  const cssId = cssElementIds.get(id)
  if (cssId) {
    const el = document.getElementById(cssId)
    if (el) el.remove()
    cssElementIds.delete(id)
  }
}

/**
 * 将已启用插件的扩展注入 markdown-it 实例
 */
export function extendMarkdownIt(md: MarkdownIt, enabledIds: string[], pluginConfigs: Record<string, Record<string, unknown>>): void {
  for (const id of enabledIds) {
    const plugin = loadedPlugins.get(id) ?? getPluginById(id)
    if (plugin) {
      plugin.extendMarkdownIt(md, pluginConfigs[id] || {})
    }
  }
}

/**
 * 对渲染后的 HTML 容器执行所有已启用插件的后处理
 */
export async function postRender(container: HTMLElement, enabledIds: string[], pluginConfigs: Record<string, Record<string, unknown>>): Promise<void> {
  for (const id of enabledIds) {
    const plugin = loadedPlugins.get(id) ?? getPluginById(id)
    if (plugin?.postRender) {
      await plugin.postRender(container, pluginConfigs[id] || {})
    }
  }
}
