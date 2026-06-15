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
