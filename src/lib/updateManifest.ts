/**
 * 在线更新清单（latest.json）的构造逻辑。
 *
 * 清单格式由 tauri-plugin-updater 规定，服务端写错的表现是**客户端静默查不到更新** ——
 * 排查成本很高（Tauri 只在 2xx、签名可校验、且平台键命中时才继续）。
 * 所以把「怎么拼」抽成纯函数由 tests/updateManifest.test.ts 覆盖，
 * scripts/make-manifest.mjs 只负责读文件、调它、写文件。
 *
 * 关于平台键：updater 按 `{os}-{arch}-{installer}` → `{os}-{arch}` 的顺序查找，
 * 其中 `installer` 来自**编译期烙进 exe 的 bundle_type**。本项目的便携版与安装版用的是
 * 同一个 exe（见 scripts/make-portable.ps1），bundle_type 是否被正确烙上并不确定，
 * 因此调用方通常应同时给出 `windows-x86_64-nsis` 与 `windows-x86_64` 两个键、指向同一个
 * 安装包，避免「明明装的是 NSIS 版却查不到更新」。
 * 便携版的排除不靠这里 —— 由界面侧按注册表卸载项判定（见 Rust 的 is_installed_build）。
 */
import { normalizeVersion } from './update.ts'

export interface UpdateArtifactSpec {
  /** 平台键，如 windows-x86_64-nsis / darwin-aarch64 */
  platform: string
  /** 产物下载地址（绝对 URL） */
  url: string
  /** `.sig` 文件的文本内容（不是路径！） */
  signature: string
}

export interface UpdateManifest {
  version: string
  notes: string
  pub_date: string
  platforms: Record<string, { signature: string; url: string }>
}

/**
 * 组装清单对象。
 * 字段顺序固定为 version / notes / pub_date / platforms —— 便于人工 review 生成的 latest.json。
 */
export const buildManifest = (input: {
  version: string
  notes: string
  artifacts: UpdateArtifactSpec[]
  /** 默认取当前时间；显式传入便于复现同一份清单 */
  pubDate?: string | Date
}): UpdateManifest => {
  const version = normalizeVersion(input.version)
  if (!version) throw new Error('latest.json: version 不能为空')

  if (!input.artifacts.length) {
    throw new Error('latest.json: 至少要有一个平台产物（--artifact platform=文件路径）')
  }

  const platforms: Record<string, { signature: string; url: string }> = {}
  for (const artifact of input.artifacts) {
    const { platform } = artifact
    if (!platform) throw new Error('latest.json: 平台键不能为空')
    if (platforms[platform]) {
      throw new Error(`latest.json: 平台键重复：${platform}（同一平台只能写一次）`)
    }
    if (!artifact.url) throw new Error(`latest.json: ${platform} 缺少下载地址`)
    if (!artifact.signature.trim()) {
      throw new Error(`latest.json: ${platform} 的签名为空（.sig 文件是否存在、是否为空？）`)
    }
    platforms[platform] = { signature: artifact.signature.trim(), url: artifact.url }
  }

  const pubDate = input.pubDate
  return {
    version,
    notes: input.notes ?? '',
    pub_date:
      pubDate instanceof Date
        ? pubDate.toISOString()
        : (pubDate ?? new Date().toISOString()),
    platforms,
  }
}
