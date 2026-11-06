/** 导出完成后打开文件 / 定位到所在目录（系统默认程序）。 */
import { invokeTauriOrThrow } from './tauri'

export async function openExportedFile(path: string): Promise<void> {
  await invokeTauriOrThrow('open_path', { path })
}

export async function revealExportedFile(path: string): Promise<void> {
  await invokeTauriOrThrow('reveal_in_explorer', { path })
}
