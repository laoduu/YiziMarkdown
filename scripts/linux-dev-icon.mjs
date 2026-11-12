/**
 * 开发态任务栏图标（Linux）。
 *
 * 为什么需要这个脚本：
 *   · Tauri 只给 Windows 生成默认窗口图标；Linux 的 `_NET_WM_ICON` 由
 *     `src-tauri/src/main.rs` 里的 `set_icon` 补（`#[cfg(target_os = "linux")]`）。
 *   · elementary Dock / GNOME Shell 这类桌面**不是**读窗口的 `_NET_WM_ICON`，而是按
 *     WM_CLASS 去找同名 `.desktop` 里的 `Icon` 字段（匹配 `StartupWMClass`）。
 *     开发态不装包 = 没有 `.desktop` ⇒ 只能回落成通用图标。
 *   · 安装包里自带 `YiziMarkdown.desktop`（见 `src-tauri/tauri.conf.json` 的
 *     `fileAssociations` + `bundle.category`），所以**只有开发态**需要这份补丁。
 *
 * 只写用户目录（`~/.local/share/applications`），不碰系统目录，随时可撤销。
 * `NoDisplay=true`：这份条目只用来给 Dock 提供图标映射，不在应用菜单里出现 ——
 * 菜单里点它只会启动 `target/debug` 的裸二进制（没有 Vite 服务，界面是空的）。
 *
 * 用法：
 *   npm run dev:icon          写入（改完需要重启 dev 窗口，Dock 才会重新匹配）
 *   npm run dev:icon:remove   撤销
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dataHome = process.env.XDG_DATA_HOME || join(process.env.HOME ?? '.', '.local/share')
const appsDir = join(dataHome, 'applications')
const desktopPath = join(appsDir, 'yizimarkdown-dev.desktop')
const bin = join(root, 'src-tauri', 'target', 'debug', 'yizimarkdown')
const icon = join(root, 'src-tauri', 'icons', 'icon.png')

if (process.platform !== 'linux') {
  console.error('linux-dev-icon: 仅 Linux 需要（其他平台由安装包自带的图标资源负责）')
  process.exit(0)
}

if (process.argv.includes('--remove')) {
  rmSync(desktopPath, { force: true })
  console.log(`已移除 ${desktopPath}`)
  process.exit(0)
}

mkdirSync(appsDir, { recursive: true })
writeFileSync(
  desktopPath,
  [
    '[Desktop Entry]',
    'Type=Application',
    'Name=YiziMarkdown (Dev)',
    'Comment=YiziMarkdown dev build (Vite HMR)',
    `Exec=${bin} %f`,
    `Icon=${icon}`,
    // Dock 通过 WM_CLASS ↔ StartupWMClass 找到这个条目（标准键；
    // 老式的 `WMClass` 键不符合 Desktop Entry 规范，desktop-file-validate 会报错，已不用）
    // 开发构建在 main() 里把 GLib 程序名设为 yizimarkdown-dev（WM_CLASS instance），
    // 正式安装包仍是 yizimarkdown —— 两边必须写成各自的类名，否则装完 deb 后
    // 窗口会匹配到这份开发条目，任务栏显示「YiziMarkdown (Dev)」。
    'StartupWMClass=yizimarkdown-dev',
    'Terminal=false',
    'NoDisplay=true',
    'MimeType=text/markdown;application/epub+zip',
    'Categories=Office;',
    '',
  ].join('\n'),
  'utf8',
)

try {
  // 刷新 mimeinfo / 桌面条目缓存；命令不存在时忽略（不是所有发行版都装）
  execFileSync('update-desktop-database', [appsDir], { stdio: 'ignore' })
} catch {
  /* 忽略 */
}

console.log(`已写入 ${desktopPath}`)
console.log('提示：重启 dev 窗口（npm run tauri dev）后 Dock 才会重新匹配图标。')
