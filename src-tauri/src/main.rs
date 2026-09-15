#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use tauri::Manager;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

// AI 聊天（v0.2.0）：密钥存储 + 流式代理
mod ai_keystore;
mod ai_proxy;

// 导出 DOCX / PDF
mod docx_export;
mod pdf_export;

use ai_proxy::{ai_cancel, ai_chat, ai_clear_key, ai_has_key, ai_set_key, ai_verify_key};



// ===== 文件操作命令 =====

#[derive(Debug, Serialize, Deserialize)]
struct FileReadResult {
    content: String,
    path: String,
}

#[tauri::command]
fn read_file(path: String) -> Result<FileReadResult, String> {
    match fs::read_to_string(&path) {
        Ok(content) => Ok(FileReadResult {
            content,
            path: path.clone(),
        }),
        Err(e) => Err(format!("Failed to read file: {}", e)),
    }
}

#[tauri::command]
fn save_file(path: String, content: String) -> Result<(), String> {
    match fs::write(&path, &content) {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Failed to save file: {}", e)),
    }
}

#[tauri::command]
async fn save_file_dialog(app: tauri::AppHandle, file_name: Option<String>, extensions: Option<Vec<String>>) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    // blocking_save_file 绝不能在主线程调用（同步命令跑在主线程，会死锁卡死整个应用，
    // 典型症状：保存面板弹出后冻结、光标转圈无法保存）。必须在阻塞线程池执行。
    tauri::async_runtime::spawn_blocking(move || {
        let dialog = app.dialog().file();
        let dialog = dialog.set_file_name(file_name.unwrap_or_else(|| "untitled.md".to_string()));
        let dialog = if let Some(exts) = extensions {
            if exts.is_empty() {
                dialog
            } else {
                let ext_list: Vec<&str> = exts.iter().map(|s| s.as_str()).collect();
                dialog.add_filter("指定格式", &ext_list)
            }
        } else {
            dialog
                .add_filter("Markdown", &["md", "markdown"])
                .add_filter("Text", &["txt"])
        };
        match dialog.blocking_save_file() {
            Some(path) => Ok(Some(path.into_path().map_err(|e| e.to_string())?.to_string_lossy().to_string())),
            None => Ok(None),
        }
    })
    .await
    .map_err(|e| format!("Dialog task failed: {}", e))?
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DirEntry {
    name: String,
    path: String,
    is_folder: bool,
}

#[tauri::command]
fn read_directory(path: String) -> Result<Vec<DirEntry>, String> {
    let dir_path = Path::new(&path);
    if !dir_path.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }

    let mut entries = Vec::new();
    match fs::read_dir(dir_path) {
        Ok(read_dir) => {
            for entry in read_dir.flatten() {
                let file_type = entry.file_type().ok();
                let is_folder = file_type.as_ref().map(|ft| ft.is_dir()).unwrap_or(false);

                entries.push(DirEntry {
                    name: entry.file_name().to_string_lossy().to_string(),
                    path: entry.path().to_string_lossy().to_string(),
                    is_folder,
                });
            }
            entries.sort_by(|a, b| {
                match (a.is_folder, b.is_folder) {
                    (true, false) => std::cmp::Ordering::Less,
                    (false, true) => std::cmp::Ordering::Greater,
                    _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
                }
            });
            Ok(entries)
        }
        Err(e) => Err(format!("Failed to read directory: {}", e)),
    }
}

// ===== 系统字体 =====

#[cfg(target_os = "windows")]
fn collect_system_fonts() -> Result<Vec<String>, String> {
    let mut cmd = Command::new("powershell");
    cmd.args([
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; \
         [System.Reflection.Assembly]::LoadWithPartialName('System.Drawing') | Out-Null; \
         (New-Object System.Drawing.Text.InstalledFontCollection).Families | \
         ForEach-Object { $_.Name } | Sort-Object"
    ]);
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    let output = cmd.output()
        .map_err(|e| format!("Failed to execute PowerShell: {}", e))?;

    if !output.status.success() {
        return Err(format!("PowerShell error: {}", String::from_utf8_lossy(&output.stderr)));
    }

    let fonts: Vec<String> = String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(|line| line.trim().to_string())
        .filter(|line| !line.is_empty())
        .collect();

    Ok(fonts)
}

#[cfg(target_os = "macos")]
fn collect_system_fonts() -> Result<Vec<String>, String> {
    let output = Command::new("system_profiler")
        .args(["SPFontsDataType", "-json"])
        .output()
        .map_err(|e| format!("Failed to execute system_profiler: {}", e))?;

    if !output.status.success() {
        return Err(format!("system_profiler error: {}", String::from_utf8_lossy(&output.stderr)));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed: serde_json::Value = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse fonts: {}", e))?;

    let mut fonts: Vec<String> = Vec::new();
    if let Some(items) = parsed.get("SPFontsDataType").and_then(|v| v.as_array()) {
        for item in items {
            if let Some(name) = item.get("_name").and_then(|v| v.as_str()) {
                fonts.push(name.to_string());
            }
        }
    }
    fonts.sort();
    fonts.dedup();
    Ok(fonts)
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn collect_system_fonts() -> Result<Vec<String>, String> {
    // Linux 等平台：用 fontconfig 的 fc-list
    let output = Command::new("fc-list")
        .arg(": family")
        .output()
        .map_err(|e| format!("Failed to execute fc-list: {}", e))?;

    let mut fonts: Vec<String> = String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(|line| line.split(':').next().unwrap_or("").trim().to_string())
        .filter(|line| !line.is_empty())
        .collect();
    fonts.sort();
    fonts.dedup();
    Ok(fonts)
}

#[tauri::command]
fn get_system_fonts() -> Result<Vec<String>, String> {
    collect_system_fonts()
}

// ===== 文件选择对话框 =====

#[tauri::command]
async fn pick_and_read_file(app: tauri::AppHandle) -> Result<FileReadResult, String> {
    use tauri_plugin_dialog::DialogExt;

    // 同 save_file_dialog：blocking_pick_file 不能在主线程调用
    tauri::async_runtime::spawn_blocking(move || {
        let result = app.dialog()
            .file()
            .add_filter("Markdown", &["md", "markdown", "txt"])
            .blocking_pick_file()
            .ok_or_else(|| "User cancelled".to_string())?;

        let file_path = result.into_path()
            .map_err(|e| format!("Invalid file path: {}", e))?
            .to_string_lossy()
            .to_string();
        let content = fs::read_to_string(&file_path)
            .map_err(|e| format!("Failed to read file: {}", e))?;

        Ok(FileReadResult { content, path: file_path })
    })
    .await
    .map_err(|e| format!("Dialog task failed: {}", e))?
}

#[tauri::command]
async fn pick_image_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    // 同 save_file_dialog：blocking_pick_file 不能在主线程调用
    tauri::async_runtime::spawn_blocking(move || {
        let result = app.dialog()
            .file()
            .add_filter("Images", &["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"])
            .blocking_pick_file()
            .and_then(|p| p.into_path().ok())
            .map(|p| p.to_string_lossy().to_string());

        Ok(result)
    })
    .await
    .map_err(|e| format!("Dialog task failed: {}", e))?
}

/// 注册 .md 文件关联的默认图标（仅写 HKCU，无需管理员权限）
/// Tauri MSI 不会自动设置自定义文件图标，需要手动写入 DefaultIcon
#[cfg(target_os = "windows")]
fn register_md_file_icon() {
    use winreg::enums::*;
    use winreg::RegKey;

    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .unwrap_or_default();
    let icon_path = exe_dir.join("md-icon.ico");
    let icon_value = if icon_path.exists() {
        format!("{},0", icon_path.display())
    } else {
        return;
    };

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);

    // 写入 ProgId DefaultIcon
    if let Ok(defaulticon_key) = hkcu.create_subkey(r"Software\Classes\YiziMarkdown.md\DefaultIcon").map(|(k, _)| k) {
        let _ = defaulticon_key.set_value("", &icon_value.as_str());
    }

    // 写入 ProgId Description
    if let Ok(progid_key) = hkcu.create_subkey(r"Software\Classes\YiziMarkdown.md").map(|(k, _)| k) {
        let _ = progid_key.set_value("", &"Markdown File");
    }

    // 写入 shell\open\command
    let exe_path = std::env::current_exe().unwrap_or_default();
    let command = format!("\u{0022}{}\u{0022} \u{0022}%1\u{0022}", exe_path.display());
    if let Ok(cmd_key) = hkcu.create_subkey(r"Software\Classes\YiziMarkdown.md\shell\open\command").map(|(k, _)| k) {
        let _ = cmd_key.set_value("", &command.as_str());
    }

    // 写入 .md 扩展名关联到 ProgId
    if let Ok(ext_key) = hkcu.create_subkey(r"Software\Classes\.md").map(|(k, _)| k) {
        let _ = ext_key.set_value("", &"YiziMarkdown.md");
    }

    // 通知 Shell 刷新
    unsafe {
        extern "system" {
            fn SHChangeNotify(wEventId: u32, uFlags: u32, dwItem1: *const std::ffi::c_void, dwItem2: *const std::ffi::c_void);
        }
        SHChangeNotify(0x08000000, 0, std::ptr::null(), std::ptr::null());
    }
}

// ===== 应用目录（exe 同级）=====

/// 获取应用根目录（exe 同级；macOS bundle 下为 Contents/Resources）
fn get_app_root() -> Result<PathBuf, String> {
    let exe = std::env::current_exe()
        .map_err(|e| format!("Failed to get exe path: {}", e))?;

    // macOS .app bundle：exe 位于 Contents/MacOS，资源位于 Contents/Resources
    #[cfg(target_os = "macos")]
    {
        if let Some(parent) = exe.parent() {
            if parent.file_name().and_then(|n| n.to_str()) == Some("MacOS") {
                if let Some(contents) = parent.parent() {
                    let resources = contents.join("Resources");
                    if resources.is_dir() {
                        return Ok(resources);
                    }
                }
            }
        }
    }

    Ok(exe.parent().unwrap_or(Path::new(".")).to_path_buf())
}

/// 获取用户文档中的配置目录：~/Documents/yizimarkdown/（包含 skills/ 等用户配置）
/// Windows: C:\Users\<user>\Documents\yizimarkdown\
/// macOS:   /Users/<user>/Documents/yizimarkdown\
fn get_user_config_dir() -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    {
        if let Ok(profile) = std::env::var("USERPROFILE") {
            return Ok(PathBuf::from(profile).join("Documents").join("yizimarkdown"));
        }
    }
    #[cfg(target_os = "macos")]
    {
        if let Ok(home) = std::env::var("HOME") {
            return Ok(PathBuf::from(home).join("Documents").join("yizimarkdown"));
        }
    }
    // fallback：应用根目录
    get_app_root()
}

/// 获取用户文档中的 skills 目录：~/Documents/yizimarkdown/skills/
fn get_user_skills_dir() -> Result<PathBuf, String> {
    Ok(get_user_config_dir()?.join("skills"))
}

/// 获取用户文档中的模板目录：~/Documents/yizimarkdown/templates/
/// 与 skills 同理——放在用户文档下，卸载/重装不会丢用户模板
fn get_user_templates_dir() -> Result<PathBuf, String> {
    Ok(get_user_config_dir()?.join("templates"))
}

/// dev 模式（exe 位于 <project>/src-tauri/target/...，含 target/debug/deps 的测试二进制）
/// 下返回项目根目录；安装版返回 None
fn get_dev_project_root() -> Option<PathBuf> {
    let mut cur = get_app_root().ok()?;
    for _ in 0..4 {
        if cur.file_name().and_then(|n| n.to_str()) == Some("target") {
            let src_tauri = cur.parent()?;
            if src_tauri.file_name().and_then(|n| n.to_str()) == Some("src-tauri") {
                return src_tauri.parent().map(Path::to_path_buf);
            }
        }
        cur = cur.parent()?.to_path_buf();
    }
    None
}

/// 内置模板来源目录：dev 用项目里的 src-tauri/templates（exe 旁的 templates 只是空壳），
/// 安装版用应用目录下的 templates（由 tauri 把 templates/ 作为资源打包进来）
fn get_builtin_templates_dir() -> Result<PathBuf, String> {
    if let Some(project) = get_dev_project_root() {
        let dev = project.join("src-tauri").join("templates");
        if dev.is_dir() {
            return Ok(dev);
        }
    }
    Ok(get_app_root()?.join("templates"))
}

/// 确保应用根目录下的子目录和默认文件存在
fn ensure_app_structure(root: &Path) -> Result<(), String> {
    // 子目录（skills / templates 已迁移到用户文档目录，不再在应用目录创建）
    fs::create_dir_all(root.join("themes"))
        .map_err(|e| format!("Failed to create themes dir: {}", e))?;

    // 默认 user.css
    let user_css = root.join("user.css");
    if !user_css.exists() {
        fs::write(&user_css, DEFAULT_USER_CSS)
            .map_err(|e| format!("Failed to create user.css: {}", e))?;
    }

    // 默认 keybindings.json
    let kb = root.join("keybindings.json");
    if !kb.exists() {
        fs::write(&kb, DEFAULT_KEYBINDINGS)
            .map_err(|e| format!("Failed to create keybindings.json: {}", e))?;
    }

    Ok(())
}

/// 将内置技能从应用目录同步到用户文档目录。
/// - 首次运行：全量复制
/// - 版本更新：覆盖内置技能文件，合并 manifest（保留用户自定义技能）
fn sync_builtin_skills() -> Result<(), String> {
    let app_root = get_app_root()?;
    let builtin_dir = app_root.join("skills");
    let user_dir = get_user_skills_dir()?;

    if !builtin_dir.exists() {
        return Ok(()); // 开发模式或资源未解包，跳过
    }

    fs::create_dir_all(&user_dir)
        .map_err(|e| format!("Failed to create user skills dir: {}", e))?;

    let builtin_manifest_path = builtin_dir.join("skills.json");
    if !builtin_manifest_path.exists() {
        return Ok(());
    }

    let builtin_manifest_str = fs::read_to_string(&builtin_manifest_path)
        .map_err(|e| format!("Failed to read builtin skills.json: {}", e))?;
    let builtin_manifest: serde_json::Value = serde_json::from_str(&builtin_manifest_str)
        .map_err(|e| format!("Failed to parse builtin skills.json: {}", e))?;
    let builtin_version = builtin_manifest["version"].as_i64().unwrap_or(0);

    let user_manifest_path = user_dir.join("skills.json");
    if !user_manifest_path.exists() {
        // 首次安装：复制所有内置技能文件 + manifest
        if let Ok(entries) = fs::read_dir(&builtin_dir) {
            for entry in entries.flatten() {
                let file_name = entry.file_name();
                let _ = fs::copy(entry.path(), user_dir.join(&file_name));
            }
        }
        return Ok(());
    }

    // 已有用户目录：比较版本号
    let user_manifest_str = fs::read_to_string(&user_manifest_path)
        .map_err(|e| format!("Failed to read user skills.json: {}", e))?;
    let user_manifest: serde_json::Value = serde_json::from_str(&user_manifest_str)
        .map_err(|e| format!("Failed to parse user skills.json: {}", e))?;
    let user_version = user_manifest["version"].as_i64().unwrap_or(0);

    if builtin_version == user_version {
        return Ok(()); // 版本一致，无需同步
    }

    // 版本不同：覆盖内置技能 .md 文件
    let builtin_skills = builtin_manifest["skills"].as_array();
    if let Some(skills) = builtin_skills {
        for skill in skills {
            if let Some(file) = skill["file"].as_str() {
                let src = builtin_dir.join(file);
                let dst = user_dir.join(file);
                if src.exists() {
                    let _ = fs::copy(&src, &dst);
                }
            }
        }
    }

    // 合并 manifest：内置技能 + 用户自定义技能
    let mut merged_skills: Vec<serde_json::Value> = Vec::new();

    // 先放内置技能（使用新版 manifest）
    if let Some(skills) = builtin_manifest["skills"].as_array() {
        merged_skills.extend(skills.iter().cloned());
    }

    // 追加用户自定义技能（id 不在内置列表中的）
    if let Some(user_skills) = user_manifest["skills"].as_array() {
        let builtin_ids: Vec<String> = merged_skills
            .iter()
            .filter_map(|s| s["id"].as_str().map(|s| s.to_string()))
            .collect();
        for skill in user_skills {
            if let Some(id) = skill["id"].as_str() {
                if !builtin_ids.contains(&id.to_string()) {
                    merged_skills.push(skill.clone());
                }
            }
        }
    }

    let mut merged = builtin_manifest.clone();
    merged["skills"] = serde_json::Value::Array(merged_skills);

    fs::write(
        &user_manifest_path,
        serde_json::to_string_pretty(&merged).unwrap_or_default(),
    )
    .map_err(|e| format!("Failed to write merged skills.json: {}", e))?;

    Ok(())
}

/// 递归复制：只写目标中不存在的文件，绝不覆盖用户已有/已修改的内容
fn copy_missing(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| format!("Failed to create {}: {}", dst.display(), e))?;
    let entries = fs::read_dir(src).map_err(|e| format!("Failed to read {}: {}", src.display(), e))?;
    for entry in entries.flatten() {
        let path = entry.path();
        let target = dst.join(entry.file_name());
        if path.is_dir() {
            copy_missing(&path, &target)?;
        } else if !target.exists() {
            fs::copy(&path, &target)
                .map_err(|e| format!("Failed to copy {}: {}", path.display(), e))?;
        }
    }
    Ok(())
}

/// 将内置模板同步到用户文档目录（~/Documents/yizimarkdown/templates/），
/// 使模板与 skills 一样不受卸载/重装影响。
/// - 仅在「首次运行」或「应用版本变化」时同步（用 templates.json 记录已同步的版本）
/// - 同步只补齐缺失文件，不覆盖用户已有模板（用户改过的内置模板也保留）
/// - 用户主动删除的内置模板，在下一次版本更新前不会被重新塞回
fn sync_builtin_templates() -> Result<(), String> {
    let builtin_dir = get_builtin_templates_dir()?;
    if !builtin_dir.is_dir() {
        return Ok(()); // 资源未解包（如未打包运行），跳过
    }
    let user_dir = get_user_templates_dir()?;
    fs::create_dir_all(&user_dir)
        .map_err(|e| format!("Failed to create user templates dir: {}", e))?;

    let current = env!("CARGO_PKG_VERSION");
    let marker = user_dir.join("templates.json");
    let synced = fs::read_to_string(&marker)
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| v["syncedVersion"].as_str().map(|s| s.to_string()));
    if synced.as_deref() == Some(current) {
        return Ok(()); // 本版本已同步过
    }

    copy_missing(&builtin_dir, &user_dir)?;

    let _ = fs::write(
        &marker,
        serde_json::to_string_pretty(&serde_json::json!({ "syncedVersion": current }))
            .unwrap_or_default(),
    );
    Ok(())
}

const DEFAULT_USER_CSS: &str = r#"/* YiziMarkdown 用户自定义样式 */
/* 此文件中的样式会加载在所有主题之后，优先级最高 */
/* 你可以在这里微调字号、行距、隐藏元素等 */

/* 示例：调整预览区行距 */
/* .editor-content p { line-height: 2.0; } */
"#;

const DEFAULT_KEYBINDINGS: &str = r#"{
  "ctrl+n": "newFile",
  "ctrl+o": "openFile",
  "ctrl+s": "save",
  "ctrl+shift+s": "saveAs",
  "ctrl+w": "closeTab",
  "ctrl+h": "exportHtml",
  "ctrl+m": "exportMd",
  "ctrl+z": "undo",
  "ctrl+y": "redo",
  "ctrl+f": "search",
  "ctrl+\\": "toggleSidebar",
  "ctrl+b": "bold",
  "ctrl+i": "italic",
  "ctrl+-": "strikethrough",
  "ctrl++": "inlineCode",
  "ctrl+1": "heading1",
  "ctrl+2": "heading2",
  "ctrl+3": "heading3",
  "ctrl+.": "unorderedList",
  "ctrl+0": "orderedList",
  "ctrl+'": "blockquote",
  "ctrl+k": "link",
  "ctrl+`": "codeBlock",
  "ctrl+t": "table",
  "ctrl+l": "horizontalRule",
  "f1": "toggleTheme",
  "f2": "viewCycle",
  "f12": "toggleDevtools"
}"#;

/// 获取应用目录结构路径（供前端调用）
#[tauri::command]
fn get_config_dir() -> Result<serde_json::Value, String> {
    let root = get_app_root()?;
    ensure_app_structure(&root)?;

    serde_json::json!({
        "appDir": root.to_string_lossy(),
        "userConfigDir": get_user_config_dir()?.to_string_lossy(),
        "themesDir": root.join("themes").to_string_lossy(),
        // 模板已迁到用户文档目录（模板内的相对图片路径以此为基准）
        "templatesDir": get_user_templates_dir()?.to_string_lossy(),
        "userCssPath": root.join("user.css").to_string_lossy(),
        "keybindingsPath": root.join("keybindings.json").to_string_lossy(),
    })
    .to_string()
    .parse::<serde_json::Value>()
    .map_err(|e| e.to_string())
}

// ===== 主题管理 =====

/// 列出 themes/ 目录下所有 .css 文件
#[tauri::command]
fn list_themes() -> Result<Vec<String>, String> {
    let root = get_app_root()?;
    let themes_dir = root.join("themes");
    if !themes_dir.exists() {
        return Ok(vec![]);
    }

    let mut themes: Vec<String> = Vec::new();
    let entries = fs::read_dir(&themes_dir)
        .map_err(|e| format!("Failed to read themes dir: {}", e))?;

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.ends_with(".css") {
            themes.push(name);
        }
    }
    themes.sort();
    Ok(themes)
}

/// 读取指定主题 CSS 文件内容
#[tauri::command]
fn read_theme_css(name: String) -> Result<String, String> {
    let root = get_app_root()?;
    let path = root.join("themes").join(&name);
    if !path.exists() {
        return Err(format!("Theme not found: {}", name));
    }
    fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read theme: {}", e))
}

/// 读取 themes/theme.json（主题元信息）
#[tauri::command]
fn read_theme_json() -> Result<String, String> {
    let root = get_app_root()?;
    let path = root.join("themes").join("theme.json");
    if !path.exists() {
        return Ok("{}".to_string());
    }
    fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read theme.json: {}", e))
}

/// 写入 themes/theme.json（用户修改主题名称后调用）
#[tauri::command]
fn write_theme_json(content: String) -> Result<(), String> {
    let root = get_app_root()?;
    let path = root.join("themes").join("theme.json");
    fs::write(&path, &content)
        .map_err(|e| format!("Failed to write theme.json: {}", e))
}

// ===== user.css =====

#[tauri::command]
fn read_user_css() -> Result<String, String> {
    let root = get_app_root()?;
    let path = root.join("user.css");
    if !path.exists() {
        return Ok(String::new());
    }
    fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read user.css: {}", e))
}

#[tauri::command]
fn write_user_css(content: String) -> Result<(), String> {
    let root = get_app_root()?;
    fs::write(root.join("user.css"), &content)
        .map_err(|e| format!("Failed to write user.css: {}", e))
}


// ===== welcome.md =====

#[tauri::command]
fn read_welcome() -> Result<String, String> {
    let root = get_app_root()?;
    let path = root.join("welcome.md");
    if !path.exists() {
        return Ok(String::new());
    }
    fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read welcome.md: {}", e))
}

// ===== readme.md =====

#[tauri::command]
fn read_readme() -> Result<String, String> {
    let root = get_app_root()?;
    let path = root.join("readme.md");
    if !path.exists() {
        return Ok(String::new());
    }
    fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read readme.md: {}", e))
}


// ===== help.md =====

#[tauri::command]
fn read_help() -> Result<String, String> {
    let root = get_app_root()?;
    let path = root.join("help.md");
    if !path.exists() {
        return Ok(String::new());
    }
    fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read help.md: {}", e))
}

/// 获取应用版本号
#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// 切换窗口最大化/全屏：macOS 用原生全屏，其他平台用最大化
/// 返回切换后是否处于全屏/最大化状态
#[tauri::command]
fn toggle_window_size(window: tauri::WebviewWindow) -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        let is_fs = window.is_fullscreen().map_err(|e| e.to_string())?;
        window.set_fullscreen(!is_fs).map_err(|e| e.to_string())?;
        return Ok(!is_fs);
    }
    #[cfg(not(target_os = "macos"))]
    {
        let is_max = window.is_maximized().map_err(|e| e.to_string())?;
        if is_max {
            window.unmaximize().map_err(|e| e.to_string())?;
        } else {
            window.maximize().map_err(|e| e.to_string())?;
        }
        return Ok(!is_max);
    }
}

/// 获取当前操作系统平台（windows / macos / linux / other）
#[tauri::command]
fn get_platform() -> String {
    match std::env::consts::OS {
        "windows" => "windows".to_string(),
        "macos" => "macos".to_string(),
        "linux" => "linux".to_string(),
        other => other.to_string(),
    }
}

/// 在新窗口中用 YiziMarkdown 自身打开指定文件
#[tauri::command]
fn open_in_app(file_path: String) -> Result<(), String> {
    let exe = std::env::current_exe()
        .map_err(|e| format!("Failed to get exe path: {}", e))?;
    Command::new(&exe)
        .arg(&file_path)
        .spawn()
        .map_err(|e| format!("Failed to launch: {}", e))?;
    Ok(())
}

/// 在系统默认浏览器中打开 URL
#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    open::that(&url).map_err(|e| format!("Failed to open URL: {}", e))
}

// ===== 模板管理 =====

/// 只接受文件名，防止路径穿越
fn safe_file_name(name: &str) -> Result<String, String> {
    let clean = Path::new(name)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .ok_or_else(|| "Invalid template name".to_string())?;
    if clean.is_empty() || clean.starts_with('.') {
        return Err("Invalid template name".to_string());
    }
    Ok(clean)
}

/// 列出模板：用户文档目录优先（卸载/重装后仍保留），缺失时回退到内置模板目录
#[tauri::command]
fn list_templates() -> Result<Vec<String>, String> {
    let user_dir = get_user_templates_dir()?;
    let dir = if user_dir.is_dir() {
        user_dir
    } else {
        get_builtin_templates_dir()?
    };
    if !dir.is_dir() {
        return Ok(vec![]);
    }

    let mut templates: Vec<String> = fs::read_dir(&dir)
        .map_err(|e| format!("Failed to read templates dir: {}", e))?
        .flatten()
        .map(|e| e.file_name().to_string_lossy().to_string())
        .filter(|n| n.ends_with(".md") || n.ends_with(".markdown"))
        .collect();
    templates.sort();
    Ok(templates)
}

#[tauri::command]
fn read_template(name: String) -> Result<String, String> {
    let clean = safe_file_name(&name)?;
    for dir in [get_user_templates_dir()?, get_builtin_templates_dir()?] {
        let path = dir.join(&clean);
        if path.is_file() {
            return fs::read_to_string(&path)
                .map_err(|e| format!("Failed to read template: {}", e));
        }
    }
    Err(format!("Template not found: {}", clean))
}

/// 新建/编辑模板：一律写入用户文档目录（卸载重装不丢），不再写安装目录
#[tauri::command]
fn write_template(name: String, content: String) -> Result<(), String> {
    let clean = safe_file_name(&name)?;
    let dir = get_user_templates_dir()?;
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create templates dir: {}", e))?;
    fs::write(dir.join(&clean), content).map_err(|e| format!("Failed to write template: {}", e))
}

// ===== AI Skills 技能 =====

/// 读取 skills/skills.json（技能清单），原样返回 JSON 字符串。
/// 优先从用户文档目录读取，dev 模式 fallback 到项目根目录。
#[tauri::command]
fn list_skills() -> Result<String, String> {
    // 主路径：用户文档目录
    if let Ok(user_dir) = get_user_skills_dir() {
        let path = user_dir.join("skills.json");
        if path.exists() {
            return fs::read_to_string(&path)
                .map_err(|e| format!("Failed to read skills.json: {}", e));
        }
    }
    // 开发模式 fallback：技能文件在项目根目录
    if let Some(project_root) = get_dev_project_root() {
        let dev_path = project_root.join("skills").join("skills.json");
        if dev_path.exists() {
            return fs::read_to_string(&dev_path)
                .map_err(|e| format!("Failed to read skills.json: {}", e));
        }
    }
    Ok(r#"{"version":1,"skills":[]}"#.to_string())
}

/// 读取 skills/ 目录下的技能文件（.md 提示词等）。
/// 优先从用户文档目录读取，dev 模式 fallback 到项目根目录。
#[tauri::command]
fn read_skill_file(file_name: String) -> Result<String, String> {
    // 仅允许文件名，防止路径穿越
    let clean = Path::new(&file_name)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .ok_or_else(|| "Invalid skill file name".to_string())?;

    // 主路径：用户文档目录
    if let Ok(user_dir) = get_user_skills_dir() {
        let path = user_dir.join(&clean);
        if path.exists() {
            return fs::read_to_string(&path)
                .map_err(|e| format!("Failed to read skill file: {}", e));
        }
    }
    // 开发模式 fallback：技能文件在项目根目录
    if let Some(project_root) = get_dev_project_root() {
        let dev_path = project_root.join("skills").join(&clean);
        if dev_path.exists() {
            return fs::read_to_string(&dev_path)
                .map_err(|e| format!("Failed to read skill file: {}", e));
        }
    }
    Err(format!("Skill file not found: {}", clean))
}

/// 获取 skill-guide.md 的完整路径（供前端打开说明文档）
#[tauri::command]
fn get_skill_guide_path() -> Result<String, String> {
    let root = get_app_root()?;
    let path = root.join("skill-guide.md");
    if path.exists() {
        return Ok(path.to_string_lossy().to_string());
    }
    // 开发模式 fallback
    if let Some(project_root) = get_dev_project_root() {
        let dev_path = project_root.join("skill-guide.md");
        if dev_path.exists() {
            return Ok(dev_path.to_string_lossy().to_string());
        }
    }
    Err("skill-guide.md not found".to_string())
}

// ===== 快捷键配置 =====

#[tauri::command]
fn read_keybindings() -> Result<String, String> {
    let root = get_app_root()?;
    let path = root.join("keybindings.json");
    if !path.exists() {
        return Ok(DEFAULT_KEYBINDINGS.to_string());
    }
    fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read keybindings: {}", e))
}

#[tauri::command]
fn write_keybindings(content: String) -> Result<(), String> {
    let root = get_app_root()?;
    fs::write(root.join("keybindings.json"), &content)
        .map_err(|e| format!("Failed to write keybindings: {}", e))
}

// ===== 入口 =====


// ===== 文件关联 (.md) =====

/// macOS: 通过 LaunchServices 设置/取消 .md 默认处理器
#[cfg(target_os = "macos")]
mod macos_file_assoc {
    use std::ffi::c_char;

    const APP_BUNDLE_ID: &str = "com.yizimarkdown.editor";
    const MARKDOWN_UTI: &str = "net.daringfireball.markdown";
    const TEXT_EDIT_BUNDLE_ID: &str = "com.apple.TextEdit";
    const KCF_STRING_ENCODING_UTF8: u32 = 0x0800_0100;
    const KLS_ROLES_ALL: u32 = 0xFFFF_FFFF;

    #[link(name = "CoreFoundation", kind = "framework")]
    #[link(name = "CoreServices", kind = "framework")]
    extern "C" {
        fn CFStringCreateWithCString(
            allocator: *const std::ffi::c_void,
            cstr: *const c_char,
            encoding: u32,
        ) -> *const std::ffi::c_void;
        fn CFStringGetLength(cf: *const std::ffi::c_void) -> isize;
        fn CFStringGetCString(
            cf: *const std::ffi::c_void,
            buffer: *mut c_char,
            buffer_size: isize,
            encoding: u32,
        ) -> u8;
        fn CFRelease(cf: *const std::ffi::c_void);
        fn LSSetDefaultRoleHandlerForContentType(
            content_type: *const std::ffi::c_void,
            role: u32,
            handler_bundle_id: *const std::ffi::c_void,
        ) -> i32;
        fn LSCopyDefaultRoleHandlerForContentType(
            content_type: *const std::ffi::c_void,
            role: u32,
        ) -> *const std::ffi::c_void;
    }

    fn cfstring(s: &str) -> Result<*const std::ffi::c_void, String> {
        let cstr = std::ffi::CString::new(s).map_err(|_| "invalid string".to_string())?;
        let ptr = unsafe {
            CFStringCreateWithCString(std::ptr::null(), cstr.as_ptr(), KCF_STRING_ENCODING_UTF8)
        };
        if ptr.is_null() {
            Err("CFStringCreateWithCString failed".to_string())
        } else {
            Ok(ptr)
        }
    }

    fn cfstring_to_string(cf: *const std::ffi::c_void) -> String {
        unsafe {
            let len = CFStringGetLength(cf);
            if len < 0 {
                return String::new();
            }
            let capacity = (len as usize) * 4 + 1;
            let mut buf = vec![0u8; capacity];
            let ok = CFStringGetCString(
                cf,
                buf.as_mut_ptr() as *mut c_char,
                capacity as isize,
                KCF_STRING_ENCODING_UTF8,
            );
            if ok == 0 {
                return String::new();
            }
            let cstr = std::ffi::CStr::from_ptr(buf.as_ptr() as *const c_char);
            cstr.to_string_lossy().into_owned()
        }
    }

    pub fn set_default(yes: bool) -> Result<bool, String> {
        let uti = cfstring(MARKDOWN_UTI)?;
        let handler = cfstring(if yes { APP_BUNDLE_ID } else { TEXT_EDIT_BUNDLE_ID })?;
        let status = unsafe { LSSetDefaultRoleHandlerForContentType(uti, KLS_ROLES_ALL, handler) };
        unsafe {
            CFRelease(uti);
            CFRelease(handler);
        }
        if status == 0 {
            Ok(true)
        } else {
            Err(format!("LSSetDefaultRoleHandlerForContentType failed: {}", status))
        }
    }

    pub fn is_default() -> Result<bool, String> {
        let uti = cfstring(MARKDOWN_UTI)?;
        let handler = unsafe { LSCopyDefaultRoleHandlerForContentType(uti, KLS_ROLES_ALL) };
        unsafe { CFRelease(uti) };
        if handler.is_null() {
            return Ok(false);
        }
        let bundle_id = cfstring_to_string(handler);
        unsafe { CFRelease(handler) };
        Ok(bundle_id == APP_BUNDLE_ID)
    }
}

/// 注册 .md 文件关联到当前 exe（Windows 写注册表 / macOS 用 LaunchServices）
#[tauri::command]
fn associate_md_files() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let exe_path = std::env::current_exe()
            .map_err(|e| format!("Failed to get exe path: {}", e))?;
        let exe_dir = exe_path.parent().unwrap_or(Path::new(".")).to_string_lossy().to_string();

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);

        // 1. 注册自定义类型 "YiziMarkdown.md"
        let (type_key, _) = hkcu.create_subkey(r"Software\Classes\YiziMarkdown.md")
            .map_err(|e| format!("Failed to create type key: {}", e))?;
        type_key.set_value("", &"Markdown File")
            .map_err(|e| format!("Failed to set type default: {}", e))?;
        type_key.set_value("DefaultIcon", &format!(r#"{}\md-icon.ico,0"#, exe_dir))
            .map_err(|e| format!("Failed to set icon: {}", e))?;

        // shell\open\command
        let (cmd_key, _) = type_key.create_subkey(r"shell\open\command")
            .map_err(|e| format!("Failed to create command key: {}", e))?;
        cmd_key.set_value("", &format!(r#""{}" "%1""#, exe_path.to_string_lossy()))
            .map_err(|e| format!("Failed to set command: {}", e))?;

        // 2. 将 .md 扩展名指向自定义类型
        let (ext_key, _) = hkcu.create_subkey(r"Software\Classes\.md")
            .map_err(|e| format!("Failed to create .ext key: {}", e))?;
        ext_key.set_value("", &"YiziMarkdown.md")
            .map_err(|e| format!("Failed to set .md handler: {}", e))?;

        return Ok(true);
    }

    #[cfg(target_os = "macos")]
    {
        return macos_file_assoc::set_default(true);
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        return Err("File association is only supported on Windows and macOS".to_string());
    }
}

/// 取消 .md 文件关联（恢复系统默认）
#[tauri::command]
fn disassociate_md_files() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);

        // 删除自定义类型（递归）
        let _ = hkcu.delete_subkey_all(r"Software\Classes\YiziMarkdown.md");

        // 恢复 .md 扩展名为系统默认（删除 HKCU 中的覆盖即可）
        let _ = hkcu.delete_subkey(r"Software\Classes\.md");

        return Ok(true);
    }

    #[cfg(target_os = "macos")]
    {
        return macos_file_assoc::set_default(false);
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        return Err("File association is only supported on Windows and macOS".to_string());
    }
}

/// 检查当前是否已注册为 .md 默认编辑器
#[tauri::command]
fn is_md_associated() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);

        // 检查 .md 扩展名是否指向 YiziMarkdown.md
        if let Ok(ext_key) = hkcu.open_subkey(r"Software\Classes\.md") {
            if let Ok(handler) = ext_key.get_value::<String, _>("") {
                return Ok(handler == "YiziMarkdown.md");
            }
        }

        return Ok(false);
    }

    #[cfg(target_os = "macos")]
    {
        return macos_file_assoc::is_default();
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        return Ok(false);
    }
}




// ===== 命令行参数 =====

/// 应用启动状态，用于传递命令行打开的文件路径
#[derive(Default, serde::Deserialize)]
struct AppState {
    /// 命令行传入的待打开文件路径
    open_file: Option<String>,
}

/// 解析命令行参数，提取要打开的文件
fn parse_cli_args() -> Option<String> {
    let args: Vec<String> = std::env::args().collect();
    // args[0] 是 exe 路径，args[1] 是第一个参数（文件路径）
    for arg in args.iter().skip(1) {
        let lower = arg.to_lowercase();
        if lower.ends_with(".md") || lower.ends_with(".markdown") || lower.ends_with(".txt") {
            return Some(arg.clone());
        }
    }
    None
}

/// 获取启动时通过命令行传入的文件路径
#[tauri::command]
fn get_cli_open_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let state = app.state::<AppState>();
    Ok(state.open_file.clone())
}


/// 获取文件元信息（大小和修改时间）
#[tauri::command]
fn get_file_meta(path: String) -> Result<serde_json::Value, String> {
    let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    let size = metadata.len();
    let modified = metadata.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64).unwrap_or(0);
    Ok(serde_json::json!({
        "size": size,
        "modified": modified
    }))
}

/// 读取本地图片文件并返回 base64 data URL
#[tauri::command]
fn read_image_base64(path: String) -> Result<String, String> {
    let data = std::fs::read(&path).map_err(|e| e.to_string())?;
    let ext = std::path::Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_lowercase();
    let mime = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        _ => "application/octet-stream",
    };
    use std::io::Write;
    let mut buf = Vec::new();
    {
        let mut encoder = base64::write::EncoderWriter::new(&mut buf, &base64::engine::general_purpose::STANDARD);
        encoder.write_all(&data).map_err(|e| e.to_string())?;
        encoder.finish().map_err(|e| e.to_string())?;
    }
    let b64 = String::from_utf8(buf).map_err(|e| e.to_string())?;
    Ok(format!("data:{};base64,{}", mime, b64))
}

// ===== 导出 DOCX / PDF =====

/// 设置窗口 1px 系统边框颜色（Windows 11 `DWMWA_BORDER_COLOR`），跟随当前主题背景。
/// 非 Windows / 非法颜色 / Win10 及以下：静默忽略。
#[tauri::command]
fn set_window_border_color(window: tauri::WebviewWindow, color: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_BORDER_COLOR};

        let hex = color.trim_start_matches('#');
        if hex.len() != 6 {
            return Ok(());
        }
        let r = u32::from_str_radix(&hex[0..2], 16).map_err(|_| "invalid color")?;
        let g = u32::from_str_radix(&hex[2..4], 16).map_err(|_| "invalid color")?;
        let b = u32::from_str_radix(&hex[4..6], 16).map_err(|_| "invalid color")?;
        // COLORREF 为 0x00BBGGRR（BGR 序）
        let colorref: u32 = (b << 16) | (g << 8) | r;
        let hwnd: HWND = window.hwnd().map_err(|e| e.to_string())?;
        unsafe {
            DwmSetWindowAttribute(
                hwnd,
                DWMWA_BORDER_COLOR,
                &colorref as *const u32 as *const std::ffi::c_void,
                std::mem::size_of::<u32>() as u32,
            )
            .map_err(|e| format!("DwmSetWindowAttribute failed: {}", e))?;
        }
    }
    Ok(())
}

/// 从图片二进制头部识别图片类型（与 docx_export::image_dimensions 支持的格式一致）
fn sniff_image_mime(b: &[u8]) -> Option<&'static str> {
    if b.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if b.starts_with(b"\xFF\xD8\xFF") {
        Some("image/jpeg")
    } else if b.starts_with(b"GIF87a") || b.starts_with(b"GIF89a") {
        Some("image/gif")
    } else if b.starts_with(b"BM") {
        Some("image/bmp")
    } else if b.len() >= 12 && &b[..4] == b"RIFF" && &b[8..12] == b"WEBP" {
        Some("image/webp")
    } else {
        None
    }
}

/// 用 pulldown-cmark 解析出 md 中所有网络图片 URL（去重）。
/// 相比手工扫描原始文本，这里天然覆盖引用式 `![a][id]`（解析后 dest_url 相同）、
/// 括号平衡（如 `File_(1).png`）与转义，且拿到的字符串与生成器解析结果逐字一致。
fn collect_network_image_urls(md: &str) -> Vec<String> {
    use pulldown_cmark::{Event, Options, Parser, Tag};
    let mut urls: Vec<String> = Vec::new();
    for ev in Parser::new_ext(md, Options::all()) {
        // Markdown 语法图片与 HTML 标签图片（<img src="…">）都要收集
        let candidates: Vec<String> = match ev {
            Event::Start(Tag::Image { dest_url, .. }) => vec![dest_url.to_string()],
            Event::Html(h) | Event::InlineHtml(h) => docx_export::extract_img_srcs(&h),
            _ => Vec::new(),
        };
        for url in candidates {
            if (url.starts_with("http://") || url.starts_with("https://")) && !urls.contains(&url) {
                urls.push(url);
            }
        }
    }
    urls
}

/// 下载单张网络图片并编码为 data URL。非图片响应（403/404 的 HTML 错误页等）返回 None。
async fn fetch_image_data_url(client: &reqwest::Client, url: &str) -> Option<String> {
    let resp = client.get(url).send().await.ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let ctype = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_lowercase();
    let bytes = resp.bytes().await.ok()?;
    // 优先文件头魔数：URL 无扩展名或服务端 MIME 不准时仍能正确识别
    let mime = sniff_image_mime(&bytes).map(str::to_string).or_else(|| {
        matches!(
            ctype.as_str(),
            "image/png" | "image/jpeg" | "image/gif" | "image/bmp" | "image/webp"
        )
        .then(|| ctype.clone())
    })?;
    use base64::Engine as _;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Some(format!("data:{};base64,{}", mime, b64))
}

/// 将 md 中的网络图片（http/https）下载为 data URL，供 DOCX 嵌入。
/// **不依赖 URL 扩展名**——大量图床/CDN 的图片 URL 无扩展名或带缩放查询参数；
/// 统一尝试下载，按响应内容判定真实类型，避免把错误页当图片嵌入。
/// 本地路径图保持原样，由 docx 生成器直接读取。
/// 下载 md 中所有网络图片，返回「URL → data URL」映射，供 DOCX 生成器查表嵌入。
/// **不依赖 URL 扩展名**——大量图床/CDN 的图片 URL 无扩展名或带缩放查询参数；
/// 统一尝试下载，按响应内容判定真实类型，避免把 403/404 的错误页当图片嵌入。
async fn download_remote_images(md: &str) -> docx_export::RemoteImages {
    use std::collections::HashMap;
    let urls = collect_network_image_urls(md);
    let mut map: HashMap<String, String> = HashMap::new();
    if urls.is_empty() {
        return map;
    }
    let client = match reqwest::Client::builder()
        // 部分图床/站点拒绝无 UA 的请求；带浏览器 UA 避免 403
        .user_agent(concat!(
            "Mozilla/5.0 (compatible; YiziMarkdown/",
            env!("CARGO_PKG_VERSION"),
            ")"
        ))
        .timeout(std::time::Duration::from_secs(20))
        .build()
    {
        Ok(c) => c,
        Err(_) => return map,
    };
    for url in urls {
        match fetch_image_data_url(&client, &url).await {
            Some(data_url) => {
                map.insert(url, data_url);
            }
            None => eprintln!("[docx_export] 网络图片下载失败或非图片，已跳过: {}", url),
        }
    }
    map
}

/// 生成并写入 .docx（前端已通过 save_file_dialog 选好路径）
#[tauri::command]
async fn export_docx(path: String, md: String, base_dir: Option<String>, theme: docx_export::DocxTheme) -> Result<(), String> {
    // 网络图片预先下载为 data URL 映射；本地图片由生成器按路径读取
    let remote = download_remote_images(&md).await;
    let base = base_dir.map(std::path::PathBuf::from);
    let bytes = docx_export::markdown_to_docx(&md, theme, base, remote)?;
    std::fs::write(&path, &bytes).map_err(|e| format!("Failed to write docx: {}", e))
}

/// 导出 PDF 用的 HTML 共享状态（自定义协议 yiziexport 按请求返回当前内容）
struct ExportHtmlState(pub std::sync::Mutex<String>);

/// 静默导出 .pdf（WebView2 PrintToPdf，Windows）
/// async：窗口创建/打印投递到主线程后立即返回，避免阻塞主线程导致死锁
#[tauri::command]
async fn export_pdf(app: tauri::AppHandle, html: String, path: String) -> Result<(), String> {
    eprintln!("[pdf_export] command start, html len={}", html.len());
    {
        let state = app.state::<ExportHtmlState>();
        *state.0.lock().unwrap() = html;
    }
    let rx = pdf_export::start_export(&app, path)?;
    match tokio::time::timeout(std::time::Duration::from_secs(30), rx).await {
        Ok(Ok(r)) => {
            eprintln!("[pdf_export] command done, ok={}", r.is_ok());
            r
        }
        Ok(Err(_)) => {
            let _ = app.get_webview_window("pdf-export").map(|w| w.close());
            Err("export window closed unexpectedly".to_string())
        }
        Err(_) => {
            eprintln!("[pdf_export] TIMED OUT: on_page_load 未触发或打印回调未到达");
            let _ = app.get_webview_window("pdf-export").map(|w| w.close());
            Err("PDF export timed out".to_string())
        }
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        // PDF 导出：隐藏窗口通过 yiziexport 自定义协议加载内联 HTML（WebView2 不支持直接导航 data: URL）
        .manage(ExportHtmlState(std::sync::Mutex::new(String::new())))
        .register_uri_scheme_protocol("yiziexport", |ctx, _request| {
            let state = ctx.app_handle().state::<ExportHtmlState>();
            let html = state.0.lock().unwrap().clone();
            tauri::http::Response::builder()
                .header(tauri::http::header::CONTENT_TYPE, "text/html; charset=utf-8")
                .body(html.into_bytes())
                .unwrap()
        })
        .invoke_handler(tauri::generate_handler![
            read_file,
            save_file,
            save_file_dialog,
            read_directory,
            get_system_fonts,
            pick_and_read_file,
            pick_image_file,
            get_config_dir,
            list_themes,
            read_theme_css,
            read_theme_json,
            write_theme_json,
            read_user_css,
            write_user_css,
            read_welcome,
            read_readme,
            read_help,
            get_app_version,
            toggle_window_size,
            get_platform,
            open_in_app,
            open_url,
            list_templates,
            read_template,
            write_template,
            list_skills,
            read_skill_file,
            get_skill_guide_path,
            read_keybindings,
            write_keybindings,
            associate_md_files,
            disassociate_md_files,
            is_md_associated,
            get_cli_open_file, get_file_meta, read_image_base64,
            export_docx, export_pdf,
            set_window_border_color,
            ai_set_key,
            ai_has_key,
            ai_clear_key,
            ai_verify_key,
            ai_chat,
            ai_cancel,
        ])
                .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // 从命令行参数中提取文件路径，通过 eval 直接调用前端全局函数
            let file_path = args.iter().skip(1).find(|a| {
                let lower = a.to_lowercase();
                lower.ends_with(".md") || lower.ends_with(".markdown") || lower.ends_with(".txt")
            }).cloned();

            if let Some(path) = file_path {
                // JSON 序列化路径，自动处理所有特殊字符转义
                let json_path = serde_json::to_string(&path).unwrap_or_else(|_| format!("\"{}\"", path));
                let js = format!(
                    r#"window.__singleInstanceOpenFile && window.__singleInstanceOpenFile({})"#,
                    json_path
                );
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.eval(&js);
                }
            }

            // 聚焦已有窗口：用always-on-top技巧强制置顶，再取消
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
                let _ = window.set_always_on_top(true);
                // 延迟取消always-on-top，确保窗口已置顶
                let win_clone = window.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(200));
                    let _ = win_clone.set_always_on_top(false);
                });
            }
        }))        .setup(|app| {
            // 启动时确保目录结构完整
            let root = std::env::current_exe()
                .ok()
                .and_then(|p| p.parent().map(|d| d.to_path_buf()))
                .unwrap_or(PathBuf::from("."));
            let _ = ensure_app_structure(&root);

            // 将内置技能同步到用户文档目录（~/Documents/yizimarkdown/skills/）
            let _ = sync_builtin_skills();

            // 将内置模板同步到用户文档目录（~/Documents/yizimarkdown/templates/）
            let _ = sync_builtin_templates();

            // 注册 .md 文件图标（覆盖MSI安装后缺失DefaultIcon的问题）
            #[cfg(target_os = "windows")]
            register_md_file_icon();

            // 解析命令行参数，传递待打开文件路径给前端
            let open_file = parse_cli_args();
            app.manage(AppState {
                open_file,
            });

            let _window = app.get_webview_window("main").unwrap();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sniffs_supported_image_headers() {
        assert_eq!(sniff_image_mime(b"\x89PNG\r\n\x1a\n\x00\x00"), Some("image/png"));
        assert_eq!(sniff_image_mime(&[0xFFu8, 0xD8, 0xFF, 0xE0]), Some("image/jpeg"));
        assert_eq!(sniff_image_mime(b"GIF89a...."), Some("image/gif"));
        assert_eq!(sniff_image_mime(b"BM\x00\x00"), Some("image/bmp"));
        let mut webp = b"RIFF\x00\x00\x00\x00WEBP".to_vec();
        webp.extend_from_slice(b"VP8 ");
        assert_eq!(sniff_image_mime(&webp), Some("image/webp"));
        // 非图片（403/404 的 HTML 错误页）不得被误识别为图片
        assert_eq!(sniff_image_mime(b"<!DOCTYPE html><html>"), None);
        assert_eq!(sniff_image_mime(b""), None);
    }

    #[test]
    fn sync_builtin_templates_seeds_user_dir_without_overwriting() {
        // 用临时 USERPROFILE 重定向用户目录，避免污染真实的 ~/Documents
        let tmp = std::env::temp_dir().join("yizimd-templates-sync-test");
        let _ = fs::remove_dir_all(&tmp);
        std::env::set_var("USERPROFILE", &tmp);
        std::env::set_var("HOME", &tmp);

        let user_dir = get_user_templates_dir().unwrap();
        assert!(user_dir.starts_with(&tmp), "用户模板目录未指向临时目录: {:?}", user_dir);

        // 首次同步：内置模板被复制到用户文档目录
        sync_builtin_templates().unwrap();
        let seeded = list_templates().unwrap();
        assert!(seeded.contains(&"default.md".to_string()), "内置模板未同步: {:?}", seeded);
        assert!(seeded.contains(&"Slide-Template.md".to_string()), "内置模板未同步: {:?}", seeded);
        // 子目录（模板内的相对图片 images/）也要一并复制，否则模板里的图渲染不出来
        let img_dir = user_dir.join("images");
        assert!(img_dir.is_dir(), "模板 images/ 子目录未复制");
        assert!(
            fs::read_dir(&img_dir).unwrap().flatten().next().is_some(),
            "模板 images/ 为空"
        );

        // 用户改过的内置模板：本版本内不再触碰
        let edited = "我的自定义内容\n";
        write_template("default.md".to_string(), edited.to_string()).unwrap();
        sync_builtin_templates().unwrap();
        assert_eq!(read_template("default.md".to_string()).unwrap(), edited, "用户模板被覆盖");

        // 模拟版本升级强制重新同步：仍不得覆盖用户已有文件
        fs::write(user_dir.join("templates.json"), r#"{"syncedVersion":"0.0.0"}"#).unwrap();
        sync_builtin_templates().unwrap();
        assert_eq!(read_template("default.md".to_string()).unwrap(), edited, "版本升级时覆盖了用户模板");

        // 用户自建模板始终保留
        write_template("mine.md".to_string(), "自定义\n".to_string()).unwrap();
        sync_builtin_templates().unwrap();
        assert_eq!(read_template("mine.md".to_string()).unwrap(), "自定义\n");

        // 路径穿越：`..` 被拒；`../evil.md` 收敛到模板目录内，不得逃逸
        assert!(write_template("..".to_string(), "x".to_string()).is_err());
        write_template("../evil.md".to_string(), "x".to_string()).unwrap();
        assert!(!tmp.join("evil.md").exists(), "路径穿越未被阻断");
        assert!(user_dir.join("evil.md").exists(), "文件名未收敛到模板目录");

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn collects_inline_and_reference_style_network_images() {
        let md = concat!(
            "![a](https://cdn.example/a.png)\n\n",
            "![b][ref]\n\n",
            "[ref]: https://cdn.example/b.webp\n\n",
            "<img src=\"https://cdn.example/c.jpg\">\n\n",
            "![local](D:\\pics\\c.png)\n\n",
            "![dup](https://cdn.example/a.png)\n",
        );
        // 行内式 + 引用式 + HTML 标签都收集；本地路径排除；重复 URL 去重
        assert_eq!(
            collect_network_image_urls(md),
            vec![
                "https://cdn.example/a.png".to_string(),
                "https://cdn.example/b.webp".to_string(),
                "https://cdn.example/c.jpg".to_string(),
            ]
        );
    }

    #[tokio::test]
    #[ignore = "需要网络：真实下载无扩展名图床图片并落盘 docx"]
    async fn export_docx_embeds_network_images() {
        // 覆盖三种形态：无扩展名+缩放参数的行内式 URL、引用式图片、HTML <img> 标签
        let md = concat!(
            "![inline](https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800)\n\n",
            "![ref][pic]\n\n",
            "[pic]: https://raw.githubusercontent.com/github/explore/main/topics/rust/rust.png\n\n",
            "<img src=\"https://www.baidu.com/img/PCtm_d9c8750bed0b3c7d089fa7d55720d6cf.png\" alt=\"html\">\n",
        );
        let dir = std::env::temp_dir().join("yizimd-net-image-test");
        std::fs::create_dir_all(&dir).unwrap();
        let out = dir.join("net-image.docx");
        let _ = std::fs::remove_file(&out);

        export_docx(
            out.to_string_lossy().to_string(),
            md.to_string(),
            None,
            docx_export::DocxTheme {
                accent: "0066CC".into(),
                text: "333333".into(),
                font: "MiSans".into(),
                mono_font: "Consolas".into(),
                border: "D5E2FF".into(),
                surface: "F0F7FF".into(),
            },
        )
        .await
        .expect("export_docx");

        let bytes = std::fs::read(&out).expect("read docx");
        let mut zip = zip::ZipArchive::new(std::io::Cursor::new(&bytes)).expect("valid zip");
        let names: Vec<String> = (0..zip.len())
            .map(|i| zip.by_index(i).unwrap().name().to_string())
            .collect();
        let media = names.iter().filter(|n| n.starts_with("word/media/image")).count();
        assert_eq!(media, 3, "应嵌入 3 张网络图（行内式 + 引用式 + HTML 标签），包内条目: {:?}", names);
        let mut doc = String::new();
        use std::io::Read as _;
        zip.by_name("word/document.xml").unwrap().read_to_string(&mut doc).unwrap();
        assert_eq!(doc.matches("rIdImg").count(), 3, "document.xml 图片引用数不对: {}", doc);
    }
}
