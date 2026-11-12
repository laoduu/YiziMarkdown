//! Linux 文件关联（XDG MIME）。
//!
//! 为什么安装包带了 `MimeType` 还不够：
//!   · `.desktop` 只声明「我能打开这个类型」，**默认用谁**由 `mimeapps.list` 决定；
//!   · 开发态的 `yizimarkdown-dev.desktop`（`npm run dev:icon` 写入）也声明过
//!     `text/markdown` / `application/epub+zip`，会占住默认处理器。装完 deb 后
//!     双击文件仍启动 dev 版本，正是这个原因。
//!
//! 本模块用 `xdg-mime` 写入默认处理器，并区分 dev / 正式版的 desktop 文件 ID：
//!   · dev（debug 构建）  → `yizimarkdown-dev.desktop`
//!   · 正式版（release）  → `YiziMarkdown.desktop`（deb 安装后位于 /usr/share/applications）
//!   · AppImage 集成形态  → 在 applications 目录里按 `StartupWMClass=yizimarkdown` 查找
//!
//! 查询状态只看 `mimeapps.list` 里的**显式**默认，不走 `xdg-mime query default`：
//! 后者在没有显式默认时会回落到 `mimeinfo.cache` / InitialPreference 里挑一个，
//! 导致「取消关联」之后仍报「已设为默认」，复选框永远关不掉。
//!
//! 取消关联只改用户级 `mimeapps.list`（含 `<桌面>-mimeapps.list` 覆盖文件），
//! 删掉本应用作为默认处理器的记录；不删除 `.desktop` 文件本身。

use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::Command;

pub const MD_MIMES: &[&str] = &["text/markdown"];
pub const EPUB_MIMES: &[&str] = &["application/epub+zip"];

const RELEASE_ID: &str = "YiziMarkdown.desktop";
const DEV_ID: &str = "yizimarkdown-dev.desktop";
/// 正式版窗口类名（与 productName、安装包 .desktop 保持一致）
const RELEASE_WM_CLASS: &str = "yizimarkdown";
const MIMEAPPS: &str = "mimeapps.list";

fn config_home() -> Option<PathBuf> {
    env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
        .or_else(|| env::var_os("HOME").map(|home| PathBuf::from(home).join(".config")))
}

fn data_home() -> Option<PathBuf> {
    env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
        .or_else(|| env::var_os("HOME").map(|home| PathBuf::from(home).join(".local/share")))
}

fn config_dirs() -> Vec<PathBuf> {
    match env::var("XDG_CONFIG_DIRS") {
        Ok(list) if !list.trim().is_empty() => list
            .split(':')
            .filter(|s| !s.is_empty())
            .map(PathBuf::from)
            .collect(),
        _ => vec![PathBuf::from("/etc/xdg")],
    }
}

fn data_dirs() -> Vec<PathBuf> {
    match env::var("XDG_DATA_DIRS") {
        Ok(list) if !list.trim().is_empty() => list
            .split(':')
            .filter(|s| !s.is_empty())
            .map(PathBuf::from)
            .collect(),
        _ => vec![
            PathBuf::from("/usr/local/share"),
            PathBuf::from("/usr/share"),
        ],
    }
}

fn applications_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(home) = data_home() {
        dirs.push(home.join("applications"));
    }
    for dir in data_dirs() {
        dirs.push(dir.join("applications"));
    }
    dirs
}

/// 桌面环境专用文件名前缀（`XDG_CURRENT_DESKTOP=Pantheon` → `pantheon-`），
/// 与 xdg-mime 的查找逻辑一致；这些文件优先级高于普通 `mimeapps.list`。
fn desktop_prefixes() -> Vec<String> {
    env::var("XDG_CURRENT_DESKTOP")
        .unwrap_or_default()
        .split(':')
        .filter(|s| !s.is_empty())
        .map(|s| format!("{}-", s.to_lowercase()))
        .collect()
}

/// 按 XDG 规范顺序返回所有可能声明默认处理器的 mimeapps 文件。
fn mimeapps_files() -> Vec<PathBuf> {
    let prefixes = desktop_prefixes();
    let mut files = Vec::new();
    let push_dir = |dir: &PathBuf, files: &mut Vec<PathBuf>| {
        for prefix in &prefixes {
            files.push(dir.join(format!("{}{}", prefix, MIMEAPPS)));
        }
        files.push(dir.join(MIMEAPPS));
    };

    if let Some(dir) = config_home() {
        push_dir(&dir, &mut files);
    }
    for dir in config_dirs() {
        push_dir(&dir, &mut files);
    }
    for dir in applications_dirs() {
        push_dir(&dir, &mut files);
    }
    files
}

fn desktop_file_exists(id: &str) -> bool {
    applications_dirs().iter().any(|dir| dir.join(id).is_file())
}

/// AppImage / 手动集成等非标准文件名：按窗口类名或 `Exec` 指向的 AppImage 找条目。
fn find_integrated_desktop_id() -> Option<String> {
    let appimage = env::var("APPIMAGE").ok().filter(|s| !s.is_empty());
    for dir in applications_dirs() {
        let entries = match fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("desktop") {
                continue;
            }
            let name = match path.file_name().and_then(|n| n.to_str()) {
                Some(n) => n,
                None => continue,
            };
            // dev 条目永远不作为正式版的关联目标
            if name == DEV_ID {
                continue;
            }
            let Ok(content) = fs::read_to_string(&path) else {
                continue;
            };
            let mut wm_class_match = false;
            let mut exec_match = false;
            for line in content.lines() {
                let line = line.trim();
                if let Some(value) = line.strip_prefix("StartupWMClass=") {
                    wm_class_match = value.trim() == RELEASE_WM_CLASS;
                }
                if let Some(value) = line.strip_prefix("Exec=") {
                    if let Some(appimage) = appimage.as_deref() {
                        exec_match = value.contains(appimage);
                    }
                }
            }
            if wm_class_match || exec_match {
                return Some(name.to_string());
            }
        }
    }
    None
}

/// 当前进程应当注册为默认处理器的 desktop 文件 ID。
pub fn desktop_id() -> Result<String, String> {
    if cfg!(debug_assertions) {
        if desktop_file_exists(DEV_ID) {
            return Ok(DEV_ID.to_string());
        }
        return Err(format!(
            "开发态还没有桌面条目：请先运行 npm run dev:icon（期望 {}）",
            DEV_ID
        ));
    }

    // 正式版优先认标准文件名（deb 打包结果），其次找 AppImage / 手动集成条目
    if desktop_file_exists(RELEASE_ID) {
        return Ok(RELEASE_ID.to_string());
    }
    if let Some(id) = find_integrated_desktop_id() {
        return Ok(id);
    }
    Err(format!(
        "没有找到已安装的桌面条目 {}：请先安装 deb，或把 AppImage 集成到系统后再试",
        RELEASE_ID
    ))
}

/// 读取某个 mimeapps 文件里指定 MIME 的 `[Default Applications]` 列表。
fn read_default_list(path: &PathBuf, mime: &str) -> Option<Vec<String>> {
    let text = fs::read_to_string(path).ok()?;
    let mut section = String::new();
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            section = trimmed[1..trimmed.len() - 1].to_string();
            continue;
        }
        if section != "Default Applications" {
            continue;
        }
        if let Some((key, value)) = trimmed.split_once('=') {
            if key.trim() != mime {
                continue;
            }
            let list: Vec<String> = value
                .split(';')
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty())
                .collect();
            if !list.is_empty() {
                return Some(list);
            }
        }
    }
    None
}

/// 当前**显式**配置的默认处理器（按 XDG 文件优先级，取第一个仍然存在的应用）。
/// 没有任何显式配置时返回 None —— 不猜测系统启发式会选谁。
fn explicit_default(mime: &str) -> Option<String> {
    for file in mimeapps_files() {
        let Some(list) = read_default_list(&file, mime) else {
            continue;
        };
        for id in list {
            if desktop_file_exists(&id) {
                return Some(id);
            }
        }
        // 该条目的处理器都已卸载：继续查找下一个配置文件
    }
    None
}

pub fn is_default(mimes: &[&str]) -> bool {
    let Ok(id) = desktop_id() else {
        return false;
    };
    mimes
        .iter()
        .all(|mime| explicit_default(mime).as_deref() == Some(id.as_str()))
}

pub fn set_default(yes: bool, mimes: &[&str]) -> Result<(), String> {
    let id = desktop_id()?;
    if yes {
        let mut command = Command::new("xdg-mime");
        command.arg("default").arg(&id);
        for mime in mimes {
            command.arg(mime);
        }
        let output = command
            .output()
            .map_err(|e| format!("调用 xdg-mime 失败（请安装 xdg-utils）：{}", e))?;
        if !output.status.success() {
            return Err(format!(
                "xdg-mime default 失败：{}",
                String::from_utf8_lossy(&output.stderr).trim()
            ));
        }
        return Ok(());
    }

    remove_default(&id, mimes)
}

/// 取消关联时要编辑的文件：只动用户可写的 mimeapps（普通 + 桌面专用 + 旧版位置）。
fn user_mimeapps_files() -> Vec<PathBuf> {
    let mut files = Vec::new();
    if let Some(dir) = config_home() {
        if let Ok(entries) = fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .is_some_and(|n| n.ends_with(MIMEAPPS))
                {
                    files.push(path);
                }
            }
        }
    }
    // 老版本 xdg-mime 可能写这里
    if let Some(home) = data_home() {
        let path = home.join("applications").join(MIMEAPPS);
        if path.exists() {
            files.push(path);
        }
    }
    files
}

fn remove_default(id: &str, mimes: &[&str]) -> Result<(), String> {
    for path in user_mimeapps_files() {
        let text = fs::read_to_string(&path)
            .map_err(|e| format!("读取 {} 失败：{}", path.display(), e))?;
        let (next, changed) = remove_id_from_mimeapps(&text, id, mimes);
        if changed {
            fs::write(&path, next)
                .map_err(|e| format!("写入 {} 失败：{}", path.display(), e))?;
        }
    }
    Ok(())
}

/// 从 `mimeapps.list` 文本中移除本应用：
///   · `[Default Applications]`：删掉该 desktop id，列表空了就整行删除；
///   · `[Added Associations]`：同样移除，避免应用继续出现在「打开方式」里。
/// 只动这两个段落里与目标 MIME 有关的键，其它内容逐行原样保留。
fn remove_id_from_mimeapps(text: &str, id: &str, mimes: &[&str]) -> (String, bool) {
    let mut output: Vec<String> = Vec::new();
    let mut section = String::new();
    let mut changed = false;

    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            section = trimmed[1..trimmed.len() - 1].to_string();
            output.push(line.to_string());
            continue;
        }

        if section == "Default Applications" || section == "Added Associations" {
            if let Some((key, value)) = line.split_once('=') {
                let key = key.trim();
                if mimes.contains(&key) && value.split(';').any(|v| v.trim() == id) {
                    let kept: Vec<&str> = value
                        .split(';')
                        .map(|v| v.trim())
                        .filter(|v| !v.is_empty() && *v != id)
                        .collect();
                    changed = true;
                    if kept.is_empty() {
                        continue; // 只剩本应用 → 整行删掉，回落到系统默认
                    }
                    let trailing = if value.trim_end().ends_with(';') { ";" } else { "" };
                    output.push(format!("{}={}{}", key, kept.join(";"), trailing));
                    continue;
                }
            }
        }
        output.push(line.to_string());
    }

    if !changed {
        return (text.to_string(), false);
    }
    let mut result = output.join("\n");
    if text.ends_with('\n') || !text.is_empty() {
        result.push('\n');
    }
    (result, true)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "\
[Added Associations]
text/markdown=YiziMarkdown.desktop;yizimarkdown-dev.desktop;SoloMD.desktop;
image/png=some-viewer.desktop;

[Default Applications]
text/markdown=YiziMarkdown.desktop
application/epub+zip=YiziMarkdown.desktop
video/mp4=some-player.desktop
";

    #[test]
    fn removes_only_target_mime_and_id() {
        let (next, changed) = remove_id_from_mimeapps(
            SAMPLE,
            "YiziMarkdown.desktop",
            &["text/markdown", "application/epub+zip"],
        );
        assert!(changed);
        // 其它处理器保留；dev 条目保留（它属于开发态，不由正式版删除）
        assert!(next.contains("text/markdown=yizimarkdown-dev.desktop;SoloMD.desktop;"));
        assert!(next.contains("image/png=some-viewer.desktop"));
        assert!(next.contains("video/mp4=some-player.desktop"));
        // 两个目标 MIME 的默认处理器已移除（整行删除）
        assert!(!next.contains("text/markdown=YiziMarkdown.desktop"));
        assert!(!next.contains("application/epub+zip=YiziMarkdown.desktop"));
        assert!(next.contains("[Default Applications]"));
    }

    #[test]
    fn keeps_other_defaults_in_same_line_order() {
        let text = "[Default Applications]\ntext/markdown=Other.desktop\n";
        let (next, changed) =
            remove_id_from_mimeapps(text, "YiziMarkdown.desktop", &["text/markdown"]);
        assert!(!changed);
        assert_eq!(next, text);
    }

    #[test]
    fn no_trailing_newline_preserved_when_unchanged() {
        let text = "[Default Applications]\nvideo/mp4=player.desktop";
        let (next, changed) =
            remove_id_from_mimeapps(text, "YiziMarkdown.desktop", &["text/markdown"]);
        assert!(!changed);
        assert_eq!(next, text);
    }

    #[test]
    fn matches_mime_key_exactly() {
        let text = "[Default Applications]\napplication/epub+zip=YiziMarkdown.desktop\n";
        let (next, changed) =
            remove_id_from_mimeapps(text, "YiziMarkdown.desktop", &["text/markdown"]);
        assert!(!changed);
        assert_eq!(next, text);
    }

    #[test]
    fn reads_default_list_from_section() {
        let dir = std::env::temp_dir().join(format!("yizimd-mimeapps-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join(MIMEAPPS);
        fs::write(&path, SAMPLE).unwrap();

        assert_eq!(
            read_default_list(&path, "text/markdown"),
            Some(vec!["YiziMarkdown.desktop".to_string()])
        );
        assert_eq!(
            read_default_list(&path, "application/epub+zip"),
            Some(vec!["YiziMarkdown.desktop".to_string()])
        );
        // Added Associations 不算默认处理器
        assert_eq!(
            read_default_list(&path, "video/mp4"),
            Some(vec!["some-player.desktop".to_string()])
        );
        assert_eq!(read_default_list(&path, "image/png"), None);
        let _ = fs::remove_dir_all(&dir);
    }
}
