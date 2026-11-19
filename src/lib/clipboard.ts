/**
 * clipboard.ts — 系统剪贴板读写（Tauri 原生优先）
 *
 * 为什么不能只用 `navigator.clipboard`：
 * Tauri 的 WebView2 默认不授予 `clipboard-read` 权限，`navigator.clipboard.readText()`
 * 会抛 NotAllowedError（或直接挂起）。表现就是「用 Ctrl+C 复制后，划词工具条里的
 * 粘贴按钮报“无法读取剪贴板”」。表格右键菜单之所以看起来正常，是因为它有一份
 * 进程内的副本（`lastTableClipboard`），并没有真的读系统剪贴板。
 *
 * 因此：Tauri 环境优先走 clipboard-manager 插件（原生剪贴板），
 * 浏览器开发模式（npm run dev）自动退回 Web API。
 */

type TauriInvoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>

function nativeInvoke(): TauriInvoke | null {
  try {
    const tauri = (window as unknown as { __TAURI_INTERNALS__?: { invoke?: TauriInvoke } }).__TAURI_INTERNALS__
    if (tauri?.invoke) return tauri.invoke.bind(tauri)
  } catch { /* 非 Tauri 环境 */ }
  return null
}

/** 读取系统剪贴板纯文本；返回 null 表示无权限 / 读取失败（与空字符串区分） */
export async function readClipboardText(): Promise<string | null> {
  const invoke = nativeInvoke()
  if (invoke) {
    try {
      const text = await invoke('plugin:clipboard-manager|read_text')
      // 原生读取成功即以此为准：空剪贴板返回 null，不再退回可能挂起的 Web API
      return typeof text === 'string' ? text : null
    } catch (e) {
      console.error('[clipboard] native read failed:', e)
    }
  }
  // 浏览器开发模式：无权限时 readText() 可能一直挂起，加超时避免 UI 卡住
  try {
    const read = navigator.clipboard?.readText?.()
    if (!read) return null
    const text = await Promise.race([
      read,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
    ])
    return typeof text === 'string' ? text : null
  } catch (e) {
    console.error('[clipboard] web read failed:', e)
    return null
  }
}

/** 写入系统剪贴板纯文本；返回是否成功 */
export async function writeClipboardText(text: string): Promise<boolean> {
  const invoke = nativeInvoke()
  if (invoke) {
    try {
      await invoke('plugin:clipboard-manager|write_text', { text })
      return true
    } catch (e) {
      console.error('[clipboard] native write failed:', e)
    }
  }
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch { /* 退回 execCommand */ }
  return execCommandCopy(text)
}

/** 没有剪贴板权限时的最后兜底（老浏览器 / 非安全上下文） */
function execCommandCopy(text: string): boolean {
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    ta.style.pointerEvents = 'none'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}
