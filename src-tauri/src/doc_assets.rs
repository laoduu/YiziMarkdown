//! 文档图片资产：粘贴图片落盘、保存到云端时迁移（v0.4.3）。
//!
//! 目录约定（与 WebDAV 图片同步保持一致）：
//!
//! - **本地文档（含未命名文档）**：一律写到用户目录 `<配置目录>/assets/`
//!   （`~/Documents/yizimarkdown/assets/`），Markdown 写**绝对路径**。
//!   不在文档所在目录创建任何图片文件夹，因此不会侵入代码仓库 / 项目目录；
//!   文件按内容哈希命名、跨文档共享，也不随应用缓存清理而丢失。
//! - **云端文档**：图片统一写到 `<WebDAV 根>/assets/`（默认 `/yizimarkdown/assets/`，
//!   所有云端文档共享同一个图片目录）；本地落到缓存镜像的同名目录，Markdown 按
//!   文档目录深度写 `assets/` 或 `../assets/` 相对引用。本地文档首次「保存到云端」由
//!   `stage_assets_in` 把用户 assets 图片复制进 staging 并重写引用，再随正文上传到
//!   远端 `assets/`，保证云端也是一个统一位置。
//!
//! 文件名为内容哈希（sha256 前 16 位），同一张图重复粘贴天然去重，也不会
//! 因为时间戳产生一堆重复文件。

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use base64::Engine as _;
use percent_encoding::percent_decode_str;
use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::get_user_config_dir;

/// 与 `remote_cache::MAX_IMAGE_BYTES` 对齐：超过这个大小的粘贴图会被拒绝，
/// 否则即便落到本地，云端单图同步也会被跳过（表现为换设备裂图）。
pub(crate) const MAX_PASTED_IMAGE_BYTES: usize = crate::remote_cache::MAX_IMAGE_BYTES;

/// 文档同级的图片子目录名。本地全局资源目录与云端 `<WebDAV 根>/assets/`
/// 统一使用 `assets/`，与用户目录 `~/Documents/yizimarkdown/assets/` 保持同一称呼。
const ASSETS_DIR: &str = "assets";
/// 内部暂存根目录（pending / staging），不面向用户；与文档旁的 assets/ 区分开。
const CACHE_ROOT_DIR: &str = "images";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedImage {
    /// 落盘的绝对路径（正斜杠），供预览 / 调试
    pub absolute_path: String,
    /// 应写进 Markdown 的引用：本地文档为绝对路径，云端文档为 `assets/xxx.png`
    pub markdown_ref: String,
    pub relative: bool,
    pub file_name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StagedAssets {
    pub content: String,
    /// 上传云端时的本地来源目录（`<staging>/assets/xxx.png` 的相对根）
    pub local_dir: Option<String>,
    pub changed: bool,
}

// ---------------------------------------------------------------------------
// 目录与命名
// ---------------------------------------------------------------------------

/// tab id 允许作为目录名：只保留 ASCII 字母数字与 `-` / `_`。
/// tab id 由前端生成（`new-<ts>` 等），这里再兜一层防止路径穿越。
fn sanitize_key(key: &str) -> String {
    let safe: String = key
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    if safe.is_empty() {
        "paste".to_string()
    } else {
        safe
    }
}

pub(crate) fn pending_dir_in(config_dir: &Path, tab_id: &str) -> PathBuf {
    config_dir
        .join(CACHE_ROOT_DIR)
        .join("pending")
        .join(sanitize_key(tab_id))
}

pub(crate) fn staging_dir_in(config_dir: &Path, tab_id: &str) -> PathBuf {
    config_dir
        .join(CACHE_ROOT_DIR)
        .join("staging")
        .join(sanitize_key(tab_id))
}

/// 应用资源目录：`<配置目录>/assets/`（全局共享，哈希命名自动去重）。
pub(crate) fn assets_dir_in(config_dir: &Path) -> PathBuf {
    config_dir.join(ASSETS_DIR)
}

// ---------------------------------------------------------------------------
// 云端统一图片目录：<WebDAV 根>/assets/
// ---------------------------------------------------------------------------

/// 远程路径的所在目录（`/Notes/foo.md` → `/Notes`；根目录为 `""`）。
fn remote_dir_of(path: &str) -> String {
    let trimmed = path.trim_end_matches('/');
    match trimmed.rfind('/') {
        Some(0) | None => String::new(),
        Some(i) => trimmed[..i].to_string(),
    }
}

/// 归一化 WebDAV 根路径：去空白、统一正斜杠、去掉结尾 `/`；根目录返回空串。
fn normalize_remote_root(root: &str) -> String {
    let trimmed = root.trim().replace('\\', "/");
    let without_leading = trimmed.trim_start_matches('/').trim_end_matches('/');
    if without_leading.is_empty() {
        String::new()
    } else {
        format!("/{without_leading}")
    }
}

/// 文档目录相对 WebDAV 根的层级（根下的一级目录返回 `Notes`，根目录返回空串）。
/// 文档不在配置的根目录下时返回 None（退回文档同级 assets，避免写出根目录之外）。
fn doc_dir_rel(remote_doc_dir: &str, remote_root: &str) -> Option<String> {
    let root = normalize_remote_root(remote_root);
    let doc = remote_doc_dir.trim_end_matches('/');
    if root.is_empty() {
        return Some(doc.trim_start_matches('/').to_string());
    }
    if doc == root {
        return Some(String::new());
    }
    doc.strip_prefix(&format!("{root}/")).map(|s| s.to_string())
}

/// 云端文档里引用 `<WebDAV 根>/assets` 的相对前缀：文档越深，`../` 越多。
fn cloud_asset_ref_prefix(doc_dir_rel: &str) -> String {
    let depth = doc_dir_rel.split('/').filter(|s| !s.is_empty()).count();
    format!("{}{ASSETS_DIR}/", "../".repeat(depth))
}

/// `<WebDAV 根>/assets/` 的远程路径（根为 `/` 时是 `/assets/`）。
fn cloud_assets_remote(remote_root: &str) -> String {
    format!("{}/{}", normalize_remote_root(remote_root), ASSETS_DIR)
}

/// `<WebDAV 根>/assets/` 在本地缓存里的绝对目录。
pub(crate) fn cloud_assets_local_in(
    config_dir: &Path,
    base_url: &str,
    remote_root: &str,
) -> Result<PathBuf, String> {
    let cache_root = crate::remote_cache::cache_root_in(config_dir, base_url)?;
    Ok(crate::remote_cache::remote_to_cache_in(
        &cache_root,
        &cloud_assets_remote(remote_root),
    ))
}

/// staging 里的「本地文档目录」：保持与远程目录同层级，使 `../assets/x.png`
/// 能按相对路径解析到 staging 根下的统一 assets/。
fn staging_doc_dir(staging_root: &Path, doc_dir_rel: &str) -> PathBuf {
    let mut out = staging_root.to_path_buf();
    for seg in doc_dir_rel.split('/').filter(|s| !s.is_empty()) {
        out.push(crate::remote_cache::sanitize_segment(seg));
    }
    out
}

fn slash(p: &Path) -> String {
    p.to_string_lossy().replace('\\', "/")
}

fn ext_for_mime(mime: &str) -> Option<&'static str> {
    match mime {
        "image/png" => Some("png"),
        "image/jpeg" => Some("jpg"),
        "image/gif" => Some("gif"),
        "image/webp" => Some("webp"),
        "image/bmp" => Some("bmp"),
        _ => None,
    }
}

/// 内容哈希命名：`image-<sha256 前 16 位>.<ext>`。
fn image_name(bytes: &[u8], mime: &str) -> Result<String, String> {
    let ext = ext_for_mime(mime).ok_or_else(|| "UNSUPPORTED_IMAGE".to_string())?;
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let digest = format!("{:x}", hasher.finalize());
    Ok(format!("image-{}.{}", &digest[..16], ext))
}

/// 校验大小并按文件头识别真实格式（客户端 MIME 不可信）。
fn validate_image(bytes: &[u8]) -> Result<&'static str, String> {
    if bytes.len() > MAX_PASTED_IMAGE_BYTES {
        return Err("IMAGE_TOO_LARGE".to_string());
    }
    crate::sniff_image_mime(bytes).ok_or_else(|| "UNSUPPORTED_IMAGE".to_string())
}

fn write_image(dir: &Path, bytes: &[u8], mime: &str) -> Result<(PathBuf, String), String> {
    fs::create_dir_all(dir)
        .map_err(|e| format!("创建图片目录失败 {}：{e}", dir.display()))?;
    let name = image_name(bytes, mime)?;
    let path = dir.join(&name);
    // 哈希命名 ⇒ 同名必然同内容，已存在时直接复用（去重）
    if !path.exists() {
        fs::write(&path, bytes).map_err(|e| format!("写入图片失败 {}：{e}", path.display()))?;
    }
    Ok((path, name))
}

fn save_image_in(
    config_dir: &Path,
    doc_path: Option<&str>,
    bytes: &[u8],
    mime: &str,
    save_mode: Option<&str>,
    base_url: Option<&str>,
    remote_path: Option<&str>,
    remote_root: Option<&str>,
) -> Result<SavedImage, String> {
    if save_mode == Some("cloud") {
        let (Some(base), Some(remote), Some(root)) = (base_url, remote_path, remote_root) else {
            return Err("CLOUD_ASSET_CONTEXT_REQUIRED".to_string());
        };
        // 云端统一目录：<WebDAV 根>/assets/。文档在根下时按目录层级生成
        // `assets/` 或 `../assets/` 相对引用，保证所有文档共享同一个图片目录。
        if let Some(rel) = doc_dir_rel(&remote_dir_of(remote), root) {
            let assets = cloud_assets_local_in(config_dir, base, root)?;
            let (path, name) = write_image(&assets, bytes, mime)?;
            return Ok(SavedImage {
                absolute_path: slash(&path),
                markdown_ref: format!("{}{name}", cloud_asset_ref_prefix(&rel)),
                relative: true,
                file_name: name,
            });
        }
        // 文档不在配置的 WebDAV 根下：退回文档同级 `assets/`（仍可正常预览 / 上传）。
        if let Some(doc) = doc_path.filter(|s| !s.trim().is_empty()) {
            let doc_dir = Path::new(doc)
                .parent()
                .filter(|p| !p.as_os_str().is_empty())
                .ok_or_else(|| "INVALID_DOC_PATH".to_string())?;
            let (path, name) = write_image(&doc_dir.join(ASSETS_DIR), bytes, mime)?;
            return Ok(SavedImage {
                absolute_path: slash(&path),
                markdown_ref: format!("{ASSETS_DIR}/{name}"),
                relative: true,
                file_name: name,
            });
        }
        return Err("INVALID_DOC_PATH".to_string());
    }

    // 本地文档（含未命名文档）统一落到全局资源目录：Markdown 写绝对路径，
    // 不侵入项目目录，也不依赖文档是否已保存。
    let (path, name) = write_image(&assets_dir_in(config_dir), bytes, mime)?;
    Ok(SavedImage {
        absolute_path: slash(&path),
        markdown_ref: slash(&path),
        relative: false,
        file_name: name,
    })
}

// ---------------------------------------------------------------------------
// 命令：粘贴 / 导入单张图片
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn save_pasted_image(
    doc_path: Option<String>,
    base64: String,
    save_mode: Option<String>,
    base_url: Option<String>,
    remote_path: Option<String>,
    remote_root: Option<String>,
) -> Result<SavedImage, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64.trim())
        .map_err(|_| "INVALID_IMAGE_DATA".to_string())?;
    let mime = validate_image(&bytes)?;
    save_image_in(
        &get_user_config_dir()?,
        doc_path.as_deref(),
        &bytes,
        mime,
        save_mode.as_deref(),
        base_url.as_deref(),
        remote_path.as_deref(),
        remote_root.as_deref(),
    )
}

/// Word / WPS 剪贴板里的图片是临时目录下的 `file://` 路径：读出字节后**复制**进
/// 图片资产目录（本地文档进全局 `assets/`，云端文档进 `<WebDAV 根>/assets/`）。
/// 源临时文件随后会被系统清理，不能只引用原路径。
#[tauri::command]
pub fn import_image_file(
    doc_path: Option<String>,
    path: String,
    save_mode: Option<String>,
    base_url: Option<String>,
    remote_path: Option<String>,
    remote_root: Option<String>,
) -> Result<SavedImage, String> {
    let local = normalize_local_path(&path)?;
    let bytes = fs::read(&local).map_err(|e| format!("读取图片失败：{e}"))?;
    let mime = validate_image(&bytes)?;
    save_image_in(
        &get_user_config_dir()?,
        doc_path.as_deref(),
        &bytes,
        mime,
        save_mode.as_deref(),
        base_url.as_deref(),
        remote_path.as_deref(),
        remote_root.as_deref(),
    )
}

/// `file:///C:/tmp/a.png` / `C:/tmp/a.png` / `file:///Users/x/a.png` → 本地路径。
fn normalize_local_path(raw: &str) -> Result<PathBuf, String> {
    let decoded = percent_decode_str(raw.trim())
        .decode_utf8_lossy()
        .into_owned();
    let s = decoded.trim();
    let lower = s.to_ascii_lowercase();
    let rest = if lower.starts_with("file://") {
        let rest = &s[7..];
        let rest = rest
            .strip_prefix("localhost")
            .or_else(|| rest.strip_prefix("LOCALHOST"))
            .unwrap_or(rest);
        // Windows 的 file:///C:/… 去掉前导斜杠；POSIX 绝对路径保留
        if cfg!(windows) && rest.len() >= 3 && rest.starts_with('/') && rest.as_bytes()[2] == b':' {
            &rest[1..]
        } else {
            rest
        }
    } else {
        s
    };
    if rest.is_empty() {
        return Err("INVALID_IMAGE_PATH".to_string());
    }
    Ok(PathBuf::from(rest))
}

// ---------------------------------------------------------------------------
// 保存时迁移资产
// ---------------------------------------------------------------------------

/// 保存为本地文件（含首次保存）：把 pending 绝对引用迁移到目标 `assets/`，
/// 并把相对引用的图片从旧目录复制到新目录，最后写入正文。
///
/// 返回**重写后的正文** —— 调用方必须用它同步编辑器与 store，否则后续自动保存
/// 会把旧（绝对路径）内容又写回磁盘。
#[tauri::command]
pub fn save_file_with_assets(
    source_path: Option<String>,
    target_path: String,
    content: String,
    pending_key: Option<String>,
) -> Result<String, String> {
    let target = Path::new(&target_path);
    let target_dir = target
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .ok_or_else(|| "INVALID_TARGET_PATH".to_string())?;

    let mut out = content;
    let config = get_user_config_dir()?;
    if let Some(key) = pending_key.as_deref().filter(|k| !k.trim().is_empty()) {
        out = migrate_pending_refs(&pending_dir_in(&config, key), target_dir, &out)?;
    }
    if let Some(src) = source_path.as_deref().filter(|s| !s.trim().is_empty()) {
        let source = Path::new(src);
        // 云端文档的图片引用是相对 <WebDAV 根>/assets/ 的（可能带 `../`）：
        // 另存为本地时把它们复制进用户全局 assets，并改写为绝对路径，
        // 这样「云端 → 本地」后仍然符合本地文档不建 images/ 的约定。
        if source.starts_with(config.join("webdav")) {
            out = migrate_cloud_refs_to_user_assets(&config, source, &out)?;
        } else {
            copy_relative_assets(source, target_dir, &out)?;
        }
    }

    fs::create_dir_all(target_dir)
        .map_err(|e| format!("创建目标目录失败 {}：{e}", target_dir.display()))?;
    fs::write(target, out.as_bytes())
        .map_err(|e| format!("写入文件失败 {}：{e}", target.display()))?;
    Ok(out)
}

/// 把 pending 目录里的绝对引用迁移到目标 `assets/`，引用重写为 `assets/<name>`。
pub(crate) fn migrate_pending_refs(
    pending: &Path,
    target_dir: &Path,
    content: &str,
) -> Result<String, String> {
    if !pending.is_dir() {
        return Ok(content.to_string());
    }
    let images = target_dir.join(ASSETS_DIR);
    let mut out = content.to_string();
    let mut seen: HashSet<String> = HashSet::new();

    for src in crate::collect_image_urls(content) {
        if !seen.insert(src.clone()) {
            continue;
        }
        let Some((path, name)) = asset_ref_path(pending, &src) else {
            continue;
        };
        if !path.is_file() {
            continue;
        }
        fs::create_dir_all(&images)
            .map_err(|e| format!("创建图片目录失败 {}：{e}", images.display()))?;
        let dst = images.join(&name);
        if !dst.exists() {
            fs::copy(&path, &dst).map_err(|e| format!("复制图片失败 {}：{e}", path.display()))?;
        }
        out = replace_image_ref(&out, &src, &format!("{ASSETS_DIR}/{name}"));
    }
    Ok(out)
}

/// 绝对引用是否正好落在给定的应用托管目录里（pending / assets）。
fn asset_ref_path(dir: &Path, src: &str) -> Option<(PathBuf, String)> {
    let lower = src.trim().to_ascii_lowercase();
    if lower.starts_with("http:") || lower.starts_with("https:") || lower.starts_with("data:") {
        return None;
    }
    let decoded = percent_decode_str(src.trim())
        .decode_utf8_lossy()
        .into_owned();
    let path = PathBuf::from(decoded.trim());
    if !path.is_absolute() {
        return None;
    }
    let parent = path.parent()?;
    if !same_path(parent, dir) {
        return None;
    }
    let name = path.file_name()?.to_str()?.to_string();
    Some((path, name))
}

/// `](<abs>)` / `](abs)` → `](rel)`。只处理 Markdown 图片引用，不影响正文其他文字。
fn replace_image_ref(markdown: &str, abs: &str, rel: &str) -> String {
    markdown
        .replace(&format!("](<{abs}>)"), &format!("]({rel})"))
        .replace(&format!("]({abs})"), &format!("]({rel})"))
}

/// 另存为到新目录时，把相对引用的图片一并复制过去（保持相同的相对结构）。
///
/// 只处理不含 `..` 的相对引用：`../assets/x.png` 会落到目标文档目录之外，
/// 无法安全地"复制到新文档旁"，保持原引用不动（用户可自行整理）。
fn copy_relative_assets(
    source_doc: &Path,
    target_dir: &Path,
    content: &str,
) -> Result<(), String> {
    let Some(source_dir) = source_doc.parent() else {
        return Ok(());
    };
    if same_path(source_dir, target_dir) {
        return Ok(());
    }

    let mut seen: HashSet<String> = HashSet::new();
    for src in crate::collect_image_urls(content) {
        if !seen.insert(src.clone()) {
            continue;
        }
        let Some(parts) = safe_relative_parts(&src) else {
            continue;
        };
        let mut from = source_dir.to_path_buf();
        let mut to = target_dir.to_path_buf();
        for part in &parts {
            from.push(part);
            to.push(part);
        }
        if !from.is_file() || to.exists() {
            continue;
        }
        if let Some(parent) = to.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("创建图片目录失败 {}：{e}", parent.display()))?;
        }
        fs::copy(&from, &to)
            .map_err(|e| format!("复制图片失败 {}：{e}", from.display()))?;
    }
    Ok(())
}

/// 云端缓存文档里的相对图片引用（如 `../assets/x.png`）→ 复制进用户全局 assets
/// 并改写为绝对路径。仅用于「云端文档另存为本地」。
fn migrate_cloud_refs_to_user_assets(
    config_dir: &Path,
    source_doc: &Path,
    content: &str,
) -> Result<String, String> {
    let Some(source_dir) = source_doc.parent() else {
        return Ok(content.to_string());
    };
    let assets = assets_dir_in(config_dir);
    let mut out = content.to_string();
    let mut seen: HashSet<String> = HashSet::new();

    for src in crate::collect_image_urls(content) {
        if !seen.insert(src.clone()) {
            continue;
        }
        let Some(rel) = relative_ref_for_migration(&src) else {
            continue;
        };
        let Some(path) = resolve_relative_from(source_dir, &rel) else {
            continue;
        };
        if !path.is_file() {
            continue;
        }
        fs::create_dir_all(&assets)
            .map_err(|e| format!("创建图片目录失败 {}：{e}", assets.display()))?;
        let Some(name) = path.file_name() else {
            continue;
        };
        let dst = assets.join(name);
        if !dst.exists() {
            fs::copy(&path, &dst).map_err(|e| format!("复制图片失败 {}：{e}", path.display()))?;
        }
        let abs = slash(&dst);
        let replacement = if abs.contains(' ') {
            format!("<{abs}>")
        } else {
            abs
        };
        out = replace_image_ref(&out, &src, &replacement);
    }
    Ok(out)
}

/// 迁移用：判断是否为可解析的本地相对引用（允许 `..`，拒绝网络 / data / 绝对路径）。
fn relative_ref_for_migration(src: &str) -> Option<String> {
    let decoded = percent_decode_str(src.trim())
        .decode_utf8_lossy()
        .into_owned();
    let s = decoded.trim();
    if s.is_empty() || s.starts_with('#') {
        return None;
    }
    let lower = s.to_ascii_lowercase();
    if lower.starts_with("http:")
        || lower.starts_with("https:")
        || lower.starts_with("data:")
        || lower.starts_with("file:")
    {
        return None;
    }
    let normalized = s.replace('\\', "/");
    if normalized.starts_with('/') || normalized.len() > 2 && normalized.as_bytes()[1] == b':' {
        return None;
    }
    let rel = normalized.trim_start_matches("./").to_string();
    if rel.is_empty() {
        None
    } else {
        Some(rel)
    }
}

/// 从基准目录词法解析相对路径（允许 `..` 上跳，越界返回 None）。
fn resolve_relative_from(base: &Path, rel: &str) -> Option<PathBuf> {
    let mut out = base.to_path_buf();
    for seg in rel.split('/') {
        match seg {
            "" | "." => continue,
            ".." => {
                if !out.pop() {
                    return None;
                }
            }
            s => out.push(s),
        }
    }
    if out == base {
        return None;
    }
    Some(out)
}/// 可随文档搬迁的相对引用：非网络 / data / 绝对路径，且不含 `..`。
fn safe_relative_parts(src: &str) -> Option<Vec<String>> {
    let s = src.trim();
    let lower = s.to_ascii_lowercase();
    if s.is_empty()
        || s.starts_with('#')
        || lower.starts_with("http:")
        || lower.starts_with("https:")
        || lower.starts_with("data:")
        || lower.starts_with("file:")
    {
        return None;
    }
    let decoded = percent_decode_str(s).decode_utf8_lossy().into_owned();
    let normalized = decoded.replace('\\', "/");
    if normalized.starts_with('/')
        || normalized.len() > 2 && normalized.as_bytes()[1] == b':'
    {
        return None;
    }
    let mut parts: Vec<String> = Vec::new();
    for seg in normalized.split('/') {
        match seg {
            "" | "." => continue,
            ".." => return None,
            other => parts.push(other.to_string()),
        }
    }
    if parts.is_empty() {
        return None;
    }
    Some(parts)
}

fn same_path(a: &Path, b: &Path) -> bool {
    let na = slash(a).trim_end_matches('/').to_lowercase();
    let nb = slash(b).trim_end_matches('/').to_lowercase();
    na == nb
}

// ---------------------------------------------------------------------------
// 保存到云端：暂存图上传前重写
// ---------------------------------------------------------------------------

/// 保存到云端前调用：把本地用户 assets 目录（以及早期版本的 pending 暂存）里的
/// 图片复制到 staging，并按云端统一目录改写引用（如 `../assets/<name>`）。
/// staging 的目录层级与远程文档目录一致，返回的 `local_dir` 直接交给 `webdav_save`
/// 作为图片来源：相对引用会一路解析到 `<WebDAV 根>/assets/`。
#[tauri::command]
pub fn stage_pending_assets(
    tab_id: String,
    content: String,
    remote_path: Option<String>,
    remote_root: Option<String>,
) -> Result<StagedAssets, String> {
    let config = get_user_config_dir()?;
    stage_assets_in(
        &config,
        &tab_id,
        content,
        remote_path.as_deref(),
        remote_root.as_deref(),
    )
}

pub(crate) fn stage_assets_in(
    config_dir: &Path,
    tab_id: &str,
    content: String,
    remote_path: Option<&str>,
    remote_root: Option<&str>,
) -> Result<StagedAssets, String> {
    let pending = pending_dir_in(config_dir, tab_id);
    let assets = assets_dir_in(config_dir);
    let staging = staging_dir_in(config_dir, tab_id);
    // 每次重新暂存：旧 staging 可能残留已删除/改名的图片
    let _ = fs::remove_dir_all(&staging);
    let images = staging.join(ASSETS_DIR);

    // 云端文档统一放 <WebDAV 根>/assets/；正文里的引用按文档目录深度写成
    // `assets/` 或 `../assets/`。文档不在根下时退回同级 assets（仍可上传）。
    let doc_rel = match (remote_path, remote_root) {
        (Some(remote), Some(root)) => doc_dir_rel(&remote_dir_of(remote), root),
        _ => None,
    };
    let (local_dir, ref_prefix) = match &doc_rel {
        Some(rel) => (staging_doc_dir(&staging, rel), cloud_asset_ref_prefix(rel)),
        None => (staging.clone(), format!("{ASSETS_DIR}/")),
    };

    let mut out = content;
    let mut changed = false;
    let mut seen: HashSet<String> = HashSet::new();
    for src in crate::collect_image_urls(&out) {
        if !seen.insert(src.clone()) {
            continue;
        }
        // 两个托管目录都可能是绝对引用来源：早期版本的 pending 暂存、本地用户 assets 目录
        let found = asset_ref_path(&pending, &src).or_else(|| asset_ref_path(&assets, &src));
        let Some((path, name)) = found else {
            continue;
        };
        if !path.is_file() {
            continue;
        }
        fs::create_dir_all(&images)
            .map_err(|e| format!("创建上传暂存目录失败 {}：{e}", images.display()))?;
        let dst = images.join(&name);
        if !dst.exists() {
            fs::copy(&path, &dst).map_err(|e| format!("复制图片失败 {}：{e}", path.display()))?;
        }
        out = replace_image_ref(&out, &src, &format!("{ref_prefix}{name}"));
        changed = true;
    }

    Ok(StagedAssets {
        content: out,
        local_dir: if changed { Some(slash(&local_dir)) } else { None },
        changed,
    })
}

/// 保存成功后清理该 tab 的 pending / staging 目录（失败静默：只是垃圾文件）。
#[tauri::command]
pub fn cleanup_pasted_assets(tab_id: String) -> Result<(), String> {
    let config = get_user_config_dir()?;
    for dir in [
        pending_dir_in(&config, &tab_id),
        staging_dir_in(&config, &tab_id),
    ] {
        let _ = fs::remove_dir_all(&dir);
    }
    Ok(())
}

/// 保存到云端后，把 staging 里的图补进本地缓存镜像中的 `<WebDAV 根>/assets/`。
///
/// 原因：如果个别图片上传失败，正文已经重写成相对路径、staging 也即将清理，
/// 只留在 staging 里的图就再也传不上去了。先把它们复制进缓存镜像
/// （`<cache>/<WebDAV 根>/assets/`），下一次保存会按相对引用重试上传，
/// 预览也不会裂图。已在缓存里的文件不覆盖。
#[tauri::command]
pub fn adopt_staged_assets(
    tab_id: String,
    cache_path: String,
    base_url: Option<String>,
    remote_root: Option<String>,
) -> Result<usize, String> {
    let config = get_user_config_dir()?;
    let staging = staging_dir_in(&config, &tab_id).join(ASSETS_DIR);
    if !staging.is_dir() {
        return Ok(0);
    }
    let target = match (base_url.as_deref(), remote_root.as_deref()) {
        (Some(base), Some(root)) => cloud_assets_local_in(&config, base, root)?,
        _ => Path::new(&cache_path)
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .ok_or_else(|| "INVALID_CACHE_PATH".to_string())?
            .join(ASSETS_DIR),
    };
    adopt_staged_in(&staging, &target)
}

fn adopt_staged_in(staging_images: &Path, target_images: &Path) -> Result<usize, String> {
    fs::create_dir_all(target_images)
        .map_err(|e| format!("创建图片目录失败 {}：{e}", target_images.display()))?;
    let mut copied = 0usize;
    let entries = fs::read_dir(staging_images)
        .map_err(|e| format!("读取暂存图片目录失败 {}：{e}", staging_images.display()))?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(name) = path.file_name() else {
            continue;
        };
        let dst = target_images.join(name);
        if !dst.exists() {
            fs::copy(&path, &dst)
                .map_err(|e| format!("复制图片失败 {}：{e}", path.display()))?;
            copied += 1;
        }
    }
    Ok(copied)
}

// ---------------------------------------------------------------------------
// 测试
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "yizimd-assets-{}-{}-{}",
            name,
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\nPNGDATA";

    #[test]
    fn names_images_by_content_hash_and_extension() {
        let name = image_name(PNG, "image/png").unwrap();
        assert!(name.starts_with("image-") && name.ends_with(".png"));
        assert_eq!(name.matches('-').count(), 1, "文件名只应有一个分隔连字符");
        // 同内容同名（去重）；不同内容不同名
        let name2 = image_name(PNG, "image/png").unwrap();
        assert_eq!(name, name2);
        let mut other = PNG.to_vec();
        other.push(0);
        assert_ne!(name, image_name(&other, "image/png").unwrap());
    }

    #[test]
    fn rejects_too_large_and_unknown_images() {
        let mut big = vec![0u8; MAX_PASTED_IMAGE_BYTES + 1];
        big[..8].copy_from_slice(b"\x89PNG\r\n\x1a\n");
        assert_eq!(validate_image(&big).unwrap_err(), "IMAGE_TOO_LARGE");
        assert_eq!(validate_image(b"not an image").unwrap_err(), "UNSUPPORTED_IMAGE");
    }

    #[test]
    fn sanitizes_tab_id_for_directory_names() {
        assert_eq!(sanitize_key("../evil"), "___evil");
        assert_eq!(sanitize_key("new-123_abc"), "new-123_abc");
        assert_eq!(sanitize_key(""), "paste");
    }

    #[test]
    fn replaces_bracketed_and_plain_refs_only_in_image_syntax() {
        let abs = "C:/Users/me/Documents/yizimarkdown/images/pending/t1/image-abc.png";
        let md = format!(
            "文字 {abs}\n\n![图](<{abs}>)\n\n![图2]({abs})\n"
        );
        let out = replace_image_ref(&md, abs, "assets/image-abc.png");
        assert!(out.starts_with(&format!("文字 {abs}")));
        assert!(!out.contains("](<C:/"));
        assert!(!out.contains("](C:/"));
        assert_eq!(out.matches("](assets/image-abc.png)").count(), 2);
    }

    #[test]
    fn migrates_pending_refs_into_target_assets() {
        let config = temp_dir("config");
        let pending = pending_dir_in(&config, "tab-1");
        fs::create_dir_all(&pending).unwrap();
        let src = pending.join("image-abc.png");
        fs::write(&src, PNG).unwrap();
        let target = temp_dir("target");
        let md = format!("![图](<{}>)", slash(&src));
        let out = migrate_pending_refs(&pending, &target, &md).unwrap();
        assert_eq!(out, "![图](assets/image-abc.png)");
        assert!(target.join("assets/image-abc.png").is_file());
        // 不在该 tab 的 pending 目录：不迁移、不改写
        let other = temp_dir("other-pending");
        let stray = format!("![图]({})", slash(&other.join("image-abc.png")));
        assert_eq!(
            migrate_pending_refs(&pending, &target, &stray).unwrap(),
            stray
        );
    }

    #[test]
    fn copies_relative_assets_when_saving_elsewhere() {
        let source_dir = temp_dir("source");
        let doc = source_dir.join("doc.md");
        fs::write(&doc, "").unwrap();
        fs::create_dir_all(source_dir.join("images")).unwrap();
        fs::write(source_dir.join("images/x.png"), PNG).unwrap();

        let target_dir = temp_dir("target2");
        copy_relative_assets(&doc, &target_dir, "![x](images/x.png)").unwrap();
        assert!(target_dir.join("images/x.png").is_file());
        // 绝对路径与 `..` 一律不复制
        copy_relative_assets(&doc, &target_dir, "![x](C:/tmp/x.png) ![y](../y.png)").unwrap();
        assert!(!target_dir.join("y.png").exists());
    }

    #[test]
    fn stages_pending_and_asset_images_for_cloud_upload() {
        let config = temp_dir("config-stage");
        let pending = pending_dir_in(&config, "tab");
        fs::create_dir_all(&pending).unwrap();
        let pending_img = pending.join("image-aaa.png");
        fs::write(&pending_img, PNG).unwrap();

        let assets = assets_dir_in(&config);
        fs::create_dir_all(&assets).unwrap();
        let asset_img = assets.join("image-bbb.png");
        fs::write(&asset_img, PNG).unwrap();

        let md = format!(
            "![未命名]({})\n\n![资源]({})",
            slash(&pending_img),
            slash(&asset_img)
        );
        let staged = stage_assets_in(
            &config,
            "tab",
            md,
            Some("/yizimarkdown/Notes/doc.md"),
            Some("/yizimarkdown"),
        )
        .unwrap();
        assert!(staged.changed);
        assert_eq!(
            staged.content,
            "![未命名](../assets/image-aaa.png)\n\n![资源](../assets/image-bbb.png)"
        );
        let staging_images = staging_dir_in(&config, "tab").join(ASSETS_DIR);
        assert!(staging_images.join("image-aaa.png").is_file());
        assert!(staging_images.join("image-bbb.png").is_file());
        let local_dir = staged.local_dir.expect("staging local dir");
        assert!(
            Path::new(&local_dir).ends_with("Notes"),
            "staging 目录层级应与远程文档目录一致：{local_dir}"
        );
    }

    #[test]
    fn cloud_document_image_goes_to_shared_assets_under_webdav_root() {
        let config = temp_dir("config-cloud");
        let base_url = "https://dav.example.com/dav/";
        let remote = "/yizimarkdown/Notes/doc.md";
        let root = "/yizimarkdown";
        let first = save_image_in(
            &config,
            Some("C:/cache/yizimarkdown/Notes/doc.md"),
            PNG,
            "image/png",
            Some("cloud"),
            Some(base_url),
            Some(remote),
            Some(root),
        )
        .unwrap();
        assert!(first.relative);
        assert_eq!(first.markdown_ref, format!("../assets/{}", first.file_name));
        assert!(cloud_assets_local_in(&config, base_url, root)
            .unwrap()
            .join(&first.file_name)
            .is_file());

        // 根目录下的文档：不需要 `..`，直接 assets/
        let at_root = save_image_in(
            &config,
            Some("C:/cache/yizimarkdown/doc.md"),
            PNG,
            "image/png",
            Some("cloud"),
            Some(base_url),
            Some("/yizimarkdown/doc.md"),
            Some(root),
        )
        .unwrap();
        assert_eq!(at_root.markdown_ref, format!("assets/{}", at_root.file_name));
    }

    #[test]
    fn saves_into_app_assets_dir_without_touching_project_folder() {
        let config = temp_dir("config-assets");
        let doc_dir = temp_dir("doc-assets");
        let doc = doc_dir.join("note.md");
        fs::write(&doc, "").unwrap();
        let saved = save_image_in(
            &config,
            Some(doc.to_str().unwrap()),
            PNG,
            "image/png",
            Some("assets"),
            None,
            None,
            None,
        )
        .unwrap();

        assert!(!saved.relative);
        assert!(saved.markdown_ref.starts_with(&slash(&assets_dir_in(&config))));
        assert!(assets_dir_in(&config).join(&saved.file_name).is_file());
        assert!(!doc_dir.join("assets").exists(), "本地文档不应创建项目 assets/");
    }

    #[test]
    fn resolves_cloud_root_and_document_depth() {
        assert_eq!(normalize_remote_root("/yizimarkdown/"), "/yizimarkdown");
        assert_eq!(normalize_remote_root("yizimarkdown"), "/yizimarkdown");
        assert_eq!(normalize_remote_root("/"), "");
        assert_eq!(doc_dir_rel("/yizimarkdown", "/yizimarkdown"), Some(String::new()));
        assert_eq!(
            doc_dir_rel("/yizimarkdown/Notes/Sub", "/yizimarkdown"),
            Some("Notes/Sub".to_string())
        );
        assert_eq!(doc_dir_rel("/yizimarkdown/Notes", "/"), Some("yizimarkdown/Notes".to_string()));
        assert_eq!(doc_dir_rel("/other/Notes", "/yizimarkdown"), None);
        assert_eq!(cloud_assets_remote("/yizimarkdown"), "/yizimarkdown/assets");
        assert_eq!(cloud_assets_remote("/"), "/assets");
        assert_eq!(cloud_asset_ref_prefix(""), "assets/");
        assert_eq!(cloud_asset_ref_prefix("Notes"), "../assets/");
        assert_eq!(cloud_asset_ref_prefix("Notes/Sub"), "../../assets/");
    }

    #[test]
    fn unsaved_doc_pastes_into_global_assets_instead_of_pending() {
        let config = temp_dir("config-untitled-assets");
        let saved = save_image_in(
            &config,
            None,
            PNG,
            "image/png",
            Some("assets"),
            None,
            None,
            None,
        )
        .unwrap();

        assert!(!saved.relative);
        assert!(saved.markdown_ref.starts_with(&slash(&assets_dir_in(&config))));
        assert!(assets_dir_in(&config).join(&saved.file_name).is_file());
        assert!(
            !pending_dir_in(&config, "tab").exists(),
            "本地未命名文档不应再写 pending 暂存目录"
        );
    }

    #[test]
    fn cloud_doc_saved_locally_moves_relative_images_into_user_assets() {
        let config = temp_dir("config-cloud-saveas");
        let cache = config
            .join("webdav")
            .join("cache-key")
            .join("yizimarkdown");
        fs::create_dir_all(cache.join("Notes")).unwrap();
        fs::create_dir_all(cache.join("assets")).unwrap();
        fs::write(cache.join("assets/image-abc.png"), PNG).unwrap();
        let source = cache.join("Notes/doc.md");
        fs::write(&source, "").unwrap();

        let out = migrate_cloud_refs_to_user_assets(
            &config,
            &source,
            "![图](../assets/image-abc.png)",
        )
        .unwrap();
        let dst = assets_dir_in(&config).join("image-abc.png");
        assert!(dst.is_file(), "云端相对图应复制进用户 assets");
        assert!(
            out.contains(&format!("]({})", slash(&dst))),
            "正文引用应改写为绝对路径：{out}"
        );
        assert!(!out.contains("../assets/"), "{out}");
    }

    #[test]
    fn save_file_with_assets_writes_content_and_copies_relative_images() {
        let source_dir = temp_dir("saveas-src");
        let source = source_dir.join("doc.md");
        fs::write(&source, "old").unwrap();
        fs::create_dir_all(source_dir.join("images")).unwrap();
        fs::write(source_dir.join("images/x.png"), PNG).unwrap();

        let target_dir = temp_dir("saveas-dst");
        let target = target_dir.join("doc.md");
        let out = save_file_with_assets(
            Some(source.to_string_lossy().to_string()),
            target.to_string_lossy().to_string(),
            "![x](images/x.png)".to_string(),
            None,
        )
        .unwrap();
        assert_eq!(out, "![x](images/x.png)");
        assert_eq!(fs::read_to_string(&target).unwrap(), "![x](images/x.png)");
        assert!(target_dir.join("images/x.png").is_file());
    }

    #[test]
    fn adopts_staged_images_into_cache_without_overwrite() {
        let staging = temp_dir("staging-src");
        fs::write(staging.join("a.png"), PNG).unwrap();
        fs::write(staging.join("b.png"), PNG).unwrap();
        let target = temp_dir("cache-dst");
        assert_eq!(adopt_staged_in(&staging, &target).unwrap(), 2);

        fs::write(target.join("a.png"), b"old").unwrap();
        assert_eq!(adopt_staged_in(&staging, &target).unwrap(), 0);
        assert_eq!(fs::read(target.join("a.png")).unwrap(), b"old");
    }

    #[test]
    fn normalizes_file_urls() {
        if cfg!(windows) {
            assert_eq!(
                normalize_local_path("file:///C:/tmp/a.png").unwrap(),
                PathBuf::from("C:/tmp/a.png")
            );
        }
        assert!(normalize_local_path("file:///tmp/a%20b.png")
            .unwrap()
            .to_string_lossy()
            .ends_with("a b.png"));
    }

    #[test]
    fn rejects_parent_traversal_in_relative_assets() {
        assert!(safe_relative_parts("../assets/x.png").is_none());
        assert!(safe_relative_parts("C:/tmp/x.png").is_none());
        assert!(safe_relative_parts("https://x/y.png").is_none());
        assert_eq!(
            safe_relative_parts("./images/a.png").unwrap(),
            vec!["images".to_string(), "a.png".to_string()]
        );
    }
}
