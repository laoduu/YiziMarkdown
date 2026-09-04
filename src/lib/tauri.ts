/**
 * Shared Tauri invoke wrapper.
 * Used by App.tsx, StatusBar.tsx, SettingsModal.tsx, HomePage.tsx
 */
export const invokeTauri = async <T,>(cmd: string, args?: Record<string, unknown>): Promise<T | null> => {
  try {
    const tauri = (window as any).__TAURI_INTERNALS__
    if (tauri?.invoke) {
      return await tauri.invoke(cmd, args) as T
    }
    return null
  } catch (e) {
    console.error(`[invokeTauri] ${cmd} failed:`, e)
    return null
  }
}

/**
 * 需要区分"成功/失败原因"的 Tauri 调用（如 AI 密钥验证）：
 * 失败时抛错，由调用方 try/catch 拿到具体错误文本。
 */
export const invokeTauriOrThrow = async <T,>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
  const tauri = (window as any).__TAURI_INTERNALS__
  if (!tauri?.invoke) {
    throw new Error('Tauri runtime not available')
  }
  return await tauri.invoke(cmd, args) as T
}
