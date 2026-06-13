// Type declarations for @tauri-apps/api
declare module '@tauri-apps/api/tauri' {
  export function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>
}

declare module '@tauri-apps/api' {
  export function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>
}
