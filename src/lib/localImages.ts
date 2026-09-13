/**
 * 本地图片路径解析（Tauri 环境）。
 * - 绝对路径（盘符或 / 开头）原样返回
 * - 相对路径基于模板目录解析（模板随资源打包在 templates/ 下）
 */
import { invokeTauri } from './tauri'

let cachedTemplatesDir: string | null | undefined

async function getTemplatesDir(): Promise<string | null> {
  if (cachedTemplatesDir !== undefined) return cachedTemplatesDir
  const dirs = await invokeTauri<Record<string, string>>('get_config_dir')
  cachedTemplatesDir = dirs?.templatesDir ?? null
  return cachedTemplatesDir
}

export async function resolveLocalImageSrc(src: string): Promise<string | null> {
  // markdown-it 会把 Windows 路径的反斜杠编码成 %5C（如 D:%5CUsers%5C...），先还原
  let decoded = src
  try {
    decoded = decodeURIComponent(src)
  } catch {
    // 含非法 % 序列时保留原文
  }
  // 兼容 file:///D:/... 形式（浏览器禁止直接加载 file://，需转为本地路径由 Tauri 读取）
  let fileUrl = decoded
  if (decoded.startsWith('file:///')) {
    fileUrl = decoded.slice('file:///'.length)
  } else if (decoded.startsWith('file://')) {
    fileUrl = decoded.slice('file://'.length)
  }
  // 绝对路径（Windows 盘符 / POSIX 根路径）直接使用
  if (/^[A-Za-z]:[\\/]/.test(fileUrl) || fileUrl.startsWith('/')) {
    return fileUrl.replace(/\\/g, '/')
  }
  // 相对路径：基于模板目录拼接（src-tauri/templates → appDir/templates）
  const dir = await getTemplatesDir()
  if (!dir) return null
  return `${dir.replace(/\\/g, '/')}/${fileUrl.replace(/^\.\//, '')}`
}
