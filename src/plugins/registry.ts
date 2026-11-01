import type MarkdownIt from 'markdown-it'
import type { EditorPlugin, PluginExportContext, PluginExportResult } from './types.ts'
import { epubPlugin } from './builtin/epub.ts'

/**
 * 当前只加载编译进应用的内置插件。数学公式 / Mermaid 是核心渲染器，
 * 不在这里注册，也不再由 enabledPlugins 控制。
 *
 * 插件标准（见 types.ts）：
 *   manifest（id/version/apiVersion/minAppVersion/activation/permissions/capabilities）
 *   → 资格检查（enabled + 版本/依赖）
 *   → activate（懒加载重模块）
 *   → markdown / postRender / export 能力
 *   → deactivate（清理 CSS、监听器、缓存）
 *
 * 这里先实现内置插件的完整生命周期；外部插件安装/沙箱不在本版。
 */
const builtinPlugins: EditorPlugin[] = [epubPlugin]

const loadedPlugins = new Map<string, EditorPlugin>()
const cssElementIds = new Map<string, string>()

export function getAllPlugins(): EditorPlugin[] {
  return builtinPlugins
}

export function getPluginById(id: string): EditorPlugin | undefined {
  return builtinPlugins.find((p) => p.id === id)
}

/** 启动阶段只激活声明了 startup 的插件；onCommand 插件等到真正使用时再 activate。 */
export function getStartupPluginIds(enabledIds: string[]): string[] {
  return enabledIds.filter((id) => getPluginById(id)?.manifest.activation.includes('startup'))
}

export function isPluginActive(id: string): boolean {
  return loadedPlugins.has(id)
}

/** 启用插件：校验 manifest 后 load/activate，并注入插件 CSS。 */
export async function loadPlugin(id: string, appVersion = '0.4.1'): Promise<boolean> {
  if (loadedPlugins.has(id)) return true
  const plugin = getPluginById(id)
  if (!plugin) return false
  if (!isCompatible(plugin, appVersion)) {
    console.warn(`[plugin] ${id} requires app >= ${plugin.manifest.minAppVersion}`)
    return false
  }
  try {
    const loaded = plugin.load ? await plugin.load() : true
    if (!loaded) return false
    await plugin.activate?.()
    loadedPlugins.set(id, plugin)
    if (plugin.injectCSS) {
      const css = await plugin.injectCSS()
      if (css) {
        const elId = `yizimarkdown-plugin-css-${id}`
        let el = document.getElementById(elId)
        if (!el) {
          el = document.createElement('style')
          el.id = elId
          document.head.appendChild(el)
        }
        el.textContent = css
        cssElementIds.set(id, elId)
      }
    }
    return true
  } catch (e) {
    console.error(`[plugin] ${id} activate failed:`, e)
    loadedPlugins.delete(id)
    return false
  }
}

export async function unloadPlugin(id: string): Promise<void> {
  const plugin = loadedPlugins.get(id)
  try {
    plugin?.deactivate?.()
    plugin?.destroy?.()
  } finally {
    loadedPlugins.delete(id)
    const cssId = cssElementIds.get(id)
    if (cssId) {
      document.getElementById(cssId)?.remove()
      cssElementIds.delete(id)
    }
  }
}

/** 只有真正有 markdown-it 扩展的插件才需要参与 Markdown 实例重建。 */
export function getMarkdownPluginIds(enabledIds: string[]): string[] {
  return enabledIds.filter((id) => !!getPluginById(id)?.extendMarkdownIt)
}

export function extendMarkdownIt(md: MarkdownIt, enabledIds: string[], pluginConfigs: Record<string, Record<string, unknown>>): void {
  for (const id of enabledIds) {
    const plugin = loadedPlugins.get(id) ?? getPluginById(id)
    plugin?.extendMarkdownIt?.(md, pluginConfigs[id] || {})
  }
}

export async function postRender(container: HTMLElement, enabledIds: string[], pluginConfigs: Record<string, Record<string, unknown>>): Promise<void> {
  for (const id of enabledIds) {
    const plugin = loadedPlugins.get(id) ?? getPluginById(id)
    if (plugin?.postRender) {
      try {
        await plugin.postRender(container, pluginConfigs[id] || {})
      } catch (e) {
        console.error(`[plugin] ${id} postRender failed:`, e)
      }
    }
  }
}

/** 已启用插件提供的导出格式；工具栏据此动态显示菜单项。 */
export function getEnabledExporters(enabledIds: string[]): Array<{ pluginId: string; format: string; labelKey: string; name: string }> {
  const out: Array<{ pluginId: string; format: string; labelKey: string; name: string }> = []
  for (const id of enabledIds) {
    const plugin = getPluginById(id)
    if (!plugin?.exporters) continue
    for (const format of Object.keys(plugin.exporters)) {
      if (!plugin.manifest.capabilities.exportFormats?.includes(format)) continue
      out.push({
        pluginId: id,
        format,
        labelKey: format === 'epub' ? 'toolbar.exportEpub' : `toolbar.export${format}`,
        name: plugin.nameKey || plugin.name,
      })
    }
  }
  return out
}

/** 调用插件的导出能力；必要时先激活插件。 */
export async function exportWithPlugin(id: string, format: string, context: PluginExportContext): Promise<PluginExportResult> {
  const plugin = getPluginById(id)
  if (!plugin?.exporters?.[format]) throw new Error(`plugin ${id} does not provide ${format}`)
  if (!isPluginActive(id)) {
    const ok = await loadPlugin(id)
    if (!ok) throw new Error(`plugin ${id} failed to activate`)
  }
  return plugin.exporters[format](context)
}

function isCompatible(plugin: EditorPlugin, appVersion: string): boolean {
  if (plugin.manifest.apiVersion !== 1) return false
  return compareVersion(appVersion, plugin.manifest.minAppVersion) >= 0
}

function compareVersion(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d !== 0) return d
  }
  return 0
}
