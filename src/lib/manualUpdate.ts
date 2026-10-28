/**
 * 「手动更新」通道的纯逻辑（macOS / 便携版）。
 *
 * 这两类环境的共同点：**能查版本，但装不了包**。
 *   · macOS：发布清单里只有 Windows 资源（见 scripts/make-manifest.mjs），dmg 由用户手动安装
 *   · Windows 便携版：没有安装目录可覆盖，替换 exe 只能由用户自己做
 *
 * 所以这里只回答两个问题：下载页该指向哪里、更新说明怎么压成一句提示。
 * 真正的网络请求在 Rust 侧（`check_manual_update`，读同一个 latest.json），
 * 状态机在 stores/updateStore.ts，界面在 components/UpdateNotice.tsx。
 */

import { normalizeVersion } from './update.ts'

/** 应用仓库地址（发布页 / tag 链接的唯一来源，改仓库只改这里） */
export const RELEASE_REPO = 'https://github.com/laoduu/YiziMarkdown'

/** 版本号形态：主版本段 + 可选的预发布 / 构建标识（比 semver 宽松，够挡住脏输入即可） */
const VERSION_SHAPE = /^\d+(\.\d+)*([-+][0-9A-Za-z.-]+)?$/

/**
 * 某版本对应的 Release 页。
 *
 * 指向 **tag** 而不是 `/releases/latest`：用户看到的是「vX 有新版」，下载页就该是
 * 这一版，而不是他晚几天打开时已经变成更新的那一版（清单也可能滞后于页面）。
 * 版本号异常时退回 latest —— 打开一个 404 比打开一个次新页面更糟。
 */
export function releasePageUrl(version: string | null | undefined): string {
  const v = normalizeVersion(version ?? '')
  if (!v || !VERSION_SHAPE.test(v)) return `${RELEASE_REPO}/releases/latest`
  return `${RELEASE_REPO}/releases/tag/v${v}`
}

/**
 * 把 Markdown 更新说明压成一句提示卡可用的纯文本。
 *
 * 提示卡只有几行空间，`### 新功能` / `- **导出**提速` 这种原文直接塞进去会满屏符号。
 * 这里只做「去标记」，不渲染 Markdown（渲染器留给了设置里的更新卡片）。
 */
export function notesExcerpt(markdown: string, maxLength = 160): string {
  const plain = String(markdown ?? '')
    .replace(/```[\s\S]*?```/g, ' ') // 代码块整段不要
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // 图片
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // 链接只留文字
    .replace(/^\s{0,3}#{1,6}\s+/gm, '') // 标题符号
    .replace(/^\s*\|.*\|\s*$/gm, ' ') // 表格行（一行塞不进提示卡）
    .replace(/^\s*[-*+]\s+/gm, '') // 项目符号
    .replace(/^\s*\d+\.\s+/gm, '') // 有序列表序号
    .replace(/[*_`~>]/g, '') // 强调 / 行内代码 / 引用标记
    .replace(/\s+/g, ' ')
    .trim()
  // 按码点截断，中文与 emoji 不被劈成半个
  const chars = Array.from(plain)
  return chars.length > maxLength ? `${chars.slice(0, maxLength).join('')}…` : plain
}
