#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use tauri::Manager;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;



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
fn save_file_dialog(app: tauri::AppHandle, file_name: Option<String>, extensions: Option<Vec<String>>) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
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
    match dialog.blocking_save_file()
    {
        Some(path) => Ok(Some(path.into_path().map_err(|e| e.to_string())?.to_string_lossy().to_string())),
        None => Ok(None),
    }
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

#[tauri::command]
fn get_system_fonts() -> Result<Vec<String>, String> {
    let mut cmd = Command::new("powershell");
    cmd.args([
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "[System.Reflection.Assembly]::LoadWithPartialName('System.Drawing') | Out-Null; \
         (New-Object System.Drawing.Text.InstalledFontCollection).Families | \
         ForEach-Object { $_.Name } | Sort-Object"
    ]);
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
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

// ===== 文件选择对话框 =====

#[tauri::command]
fn pick_and_read_file(app: tauri::AppHandle) -> Result<FileReadResult, String> {
    use tauri_plugin_dialog::DialogExt;
    
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

/// 获取 exe 所在目录作为应用根目录
fn get_app_root() -> Result<PathBuf, String> {
    let exe = std::env::current_exe()
        .map_err(|e| format!("Failed to get exe path: {}", e))?;
    Ok(exe.parent().unwrap_or(Path::new(".")).to_path_buf())
}

/// 确保应用根目录下的子目录和默认文件存在
fn ensure_app_structure(root: &Path) -> Result<(), String> {
    // 子目录
    for subdir in &["themes", "templates"] {
        fs::create_dir_all(root.join(subdir))
            .map_err(|e| format!("Failed to create {} dir: {}", subdir, e))?;
    }

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

    // 默认模板
    let tmpl = root.join("templates").join("default.md");
    if !tmpl.exists() {
        fs::write(&tmpl, "# 标题\n\n在这里开始写作...\n")
            .map_err(|e| format!("Failed to create default template: {}", e))?;
    }

    Ok(())
}

const DEFAULT_USER_CSS: &str = r#"/* YiziMarkdown 用户自定义样式 */
/* 此文件中的样式会加载在所有主题之后，优先级最高 */
/* 你可以在这里微调字号、行距、隐藏元素等 */

/* 示例：调整预览区行距 */
/* .editor-content p { line-height: 2.0; } */
"#;

const DEFAULT_KEYBINDINGS: &str = r#"{
  "ctrl+s": "save",
  "ctrl+n": "newFile",
  "ctrl+o": "openFile",
  "ctrl+f": "search",
  "f12": "toggleDevtools"
}"#;

/// 获取应用目录结构路径（供前端调用）
#[tauri::command]
fn get_config_dir() -> Result<serde_json::Value, String> {
    let root = get_app_root()?;
    ensure_app_structure(&root)?;

    serde_json::json!({
        "appDir": root.to_string_lossy(),
        "themesDir": root.join("themes").to_string_lossy(),
        "templatesDir": root.join("templates").to_string_lossy(),
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

#[tauri::command]
fn list_templates() -> Result<Vec<String>, String> {
    let root = get_app_root()?;
    let dir = root.join("templates");
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut templates: Vec<String> = Vec::new();
    let entries = fs::read_dir(&dir)
        .map_err(|e| format!("Failed to read templates dir: {}", e))?;

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.ends_with(".md") || name.ends_with(".markdown") {
            templates.push(name);
        }
    }
    templates.sort();
    Ok(templates)
}

#[tauri::command]
fn read_template(name: String) -> Result<String, String> {
    let root = get_app_root()?;
    let path = root.join("templates").join(&name);
    if !path.exists() {
        return Err(format!("Template not found: {}", name));
    }
    fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read template: {}", e))
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

/// 注册 .md 文件关联到当前 exe（写入 HKCU，不需要管理员权限）
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

    #[cfg(not(target_os = "windows"))]
    {
        return Err("File association is only supported on Windows".to_string());
    }
}

/// 取消 .md 文件关蔻（恢复系统默认）
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

    #[cfg(not(target_os = "windows"))]
    {
        return Err("File association is only supported on Windows".to_string());
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

    #[cfg(not(target_os = "windows"))]
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
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            read_file,
            save_file,
            save_file_dialog,
            read_directory,
            get_system_fonts,
            pick_and_read_file,
            get_config_dir,
            list_themes,
            read_theme_css,
            read_user_css,
            write_user_css,
            read_welcome,
            read_readme,
            read_help,
            get_app_version,
            open_in_app,
            open_url,
            list_templates,
            read_template,
            read_keybindings,
            write_keybindings,
            associate_md_files,
            disassociate_md_files,
            is_md_associated,
            get_cli_open_file, get_file_meta, read_image_base64,
        ])
        .setup(|app| {
            // 启动时确保目录结构完整
            let root = std::env::current_exe()
                .ok()
                .and_then(|p| p.parent().map(|d| d.to_path_buf()))
                .unwrap_or(PathBuf::from("."));
            let _ = ensure_app_structure(&root);

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
