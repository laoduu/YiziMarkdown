//! 文档图片资产：粘贴图片落盘、未命名文档暂存、保存时迁移（v0.4.3）。
//!
//! 目录约定（与 WebDAV 图片同步保持一致）：
//!
//! - **已保存文档**：图片写到 `<文档目录>/images/`，Markdown 写**相对路径**
//!   `images/xxx.png`。云端同步只认相对引用（`remote_cache::classify_image_ref`
//!   会跳过绝对路径 / `file://`，避免把用户本地任意文件上传到服务器），
//!   所以这里刻意不用绝对路径。
//! - **未保存文档**（没有路径可依附）：先落到
//!   `<配置目录>/images/pending/<tabId>/`，Markdown 暂写绝对路径；
//!   首次「另存为」走 `save_file_with_assets`、「保存到云端」走
//!   `stage_pending_assets`，把图片复制进目标 `images/` 并把引用重写成相对路径。
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

/// 文档旁的图片子目录名。与模板、WebDAV 测试里的既有约定一致。
const IMAGES_DIR: &str = "images";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedImage {
    /// 落盘的绝对路径（正斜杠），供预览 / 调试
    pub absolute_path: String,
    /// 应写进 Markdown 的引用：已保存文档为 `images/xxx.png`，未命名文档为绝对路径
    pub markdown_ref: String,
    pub relative: bool,
    pub file_name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StagedAssets {
    pub content: String,
    /// 上传云端时的本地来源目录（`<staging>/images/xxx.png` 的相对根）
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
        .join(IMAGES_DIR)
        .join("pending")
        .join(sanitize_key(tab_id))
}

pub(crate) fn staging_dir_in(config_dir: &Path, tab_id: &str) -> PathBuf {
    config_dir
        .join(IMAGES_DIR)
        .join("staging")
        .join(sanitize_key(tab_id))
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
    doc_path: Option<&str>,
    tab_id: &str,
    bytes: &[u8],
    mime: &str,
) -> Result<SavedImage, String> {
    if let Some(doc) = doc_path.filter(|s| !s.trim().is_empty()) {
        let doc_dir = Path::new(doc)
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .ok_or_else(|| "INVALID_DOC_PATH".to_string())?;
        let (path, name) = write_image(&doc_dir.join(IMAGES_DIR), bytes, mime)?;
        return Ok(SavedImage {
            absolute_path: slash(&path),
            markdown_ref: format!("{IMAGES_DIR}/{name}"),
            relative: true,
            file_name: name,
        });
    }

    // 未保存文档：暂存到配置目录，Markdown 先写绝对路径，首次保存时迁移
    let dir = pending_dir_in(&get_user_config_dir()?, tab_id);
    let (path, name) = write_image(&dir, bytes, mime)?;
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
    tab_id: String,
    base64: String,
) -> Result<SavedImage, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64.trim())
        .map_err(|_| "INVALID_IMAGE_DATA".to_string())?;
    let mime = validate_image(&bytes)?;
    save_image_in(doc_path.as_deref(), &tab_id, &bytes, mime)
}

/// Word / WPS 剪贴板里的图片是临时目录下的 `file://` 路径：读出字节后**复制**进
/// 文档的 images/（源临时文件随后会被系统清理，不能只引用原路径）。
#[tauri::command]
pub fn import_image_file(
    doc_path: Option<String>,
    tab_id: String,
    path: String,
) -> Result<SavedImage, String> {
    let local = normalize_local_path(&path)?;
    let bytes = fs::read(&local).map_err(|e| format!("读取图片失败：{e}"))?;
    let mime = validate_image(&bytes)?;
    save_image_in(doc_path.as_deref(), &tab_id, &bytes, mime)
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

/// 保存为本地文件（含首次保存）：把 pending 绝对引用迁移到目标 `images/`，
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
    if let Some(key) = pending_key.as_deref().filter(|k| !k.trim().is_empty()) {
        let config = get_user_config_dir()?;
        out = migrate_pending_refs(&pending_dir_in(&config, key), target_dir, &out)?;
    }
    if let Some(src) = source_path.as_deref().filter(|s| !s.trim().is_empty()) {
        copy_relative_assets(Path::new(src), target_dir, &out)?;
    }

    fs::create_dir_all(target_dir)
        .map_err(|e| format!("创建目标目录失败 {}：{e}", target_dir.display()))?;
    fs::write(target, out.as_bytes())
        .map_err(|e| format!("写入文件失败 {}：{e}", target.display()))?;
    Ok(out)
}

/// 把 pending 目录里的绝对引用迁移到目标 `images/`，引用重写为 `images/<name>`。
pub(crate) fn migrate_pending_refs(
    pending: &Path,
    target_dir: &Path,
    content: &str,
) -> Result<String, String> {
    if !pending.is_dir() {
        return Ok(content.to_string());
    }
    let images = target_dir.join(IMAGES_DIR);
    let mut out = content.to_string();
    let mut seen: HashSet<String> = HashSet::new();

    for src in crate::collect_image_urls(content) {
        if !seen.insert(src.clone()) {
            continue;
        }
        let Some((path, name)) = pending_ref_path(pending, &src) else {
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
        out = replace_image_ref(&out, &src, &format!("{IMAGES_DIR}/{name}"));
    }
    Ok(out)
}

/// 绝对引用是否正好落在该 tab 的 pending 目录里。
fn pending_ref_path(pending: &Path, src: &str) -> Option<(PathBuf, String)> {
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
    if !same_path(parent, pending) {
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

/// 可随文档搬迁的相对引用：非网络 / data / 绝对路径，且不含 `..`。
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

/// 未命名文档「保存到云端」时调用：把 pending 图复制到 staging 目录，
/// 引用重写为 `images/<name>`。返回的 `local_dir` 直接交给 `webdav_save`
/// 作为图片上传来源（远端仍保持相对结构）。
#[tauri::command]
pub fn stage_pending_assets(tab_id: String, content: String) -> Result<StagedAssets, String> {
    let config = get_user_config_dir()?;
    let pending = pending_dir_in(&config, &tab_id);
    if !pending.is_dir() {
        return Ok(StagedAssets {
            content,
            local_dir: None,
            changed: false,
        });
    }

    let staging = staging_dir_in(&config, &tab_id);
    // 每次重新暂存：旧 staging 可能残留已删除/改名的图片
    let _ = fs::remove_dir_all(&staging);
    let images = staging.join(IMAGES_DIR);

    let mut out = content;
    let mut changed = false;
    let mut seen: HashSet<String> = HashSet::new();
    for src in crate::collect_image_urls(&out) {
        if !seen.insert(src.clone()) {
            continue;
        }
        let Some((path, name)) = pending_ref_path(&pending, &src) else {
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
        out = replace_image_ref(&out, &src, &format!("{IMAGES_DIR}/{name}"));
        changed = true;
    }

    Ok(StagedAssets {
        content: out,
        local_dir: if changed { Some(slash(&staging)) } else { None },
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

/// 未命名文档保存到云端后，把 staging 里的图补进本地缓存镜像。
///
/// 原因：如果个别图片上传失败，正文已经重写成相对路径、staging 也即将清理，
/// 只留在 staging 里的图就再也传不上去了。先把它们复制进缓存镜像
/// （`<cache>/<远程目录>/images/`），下一次保存会按相对引用重试上传，
/// 预览也不会裂图。已在缓存里的文件不覆盖。
#[tauri::command]
pub fn adopt_staged_assets(tab_id: String, cache_path: String) -> Result<usize, String> {
    let config = get_user_config_dir()?;
    let staging = staging_dir_in(&config, &tab_id).join(IMAGES_DIR);
    if !staging.is_dir() {
        return Ok(0);
    }
    let target = Path::new(&cache_path)
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .ok_or_else(|| "INVALID_CACHE_PATH".to_string())?
        .join(IMAGES_DIR);
    Ok(adopt_staged_in(&staging, &target).map_err(|e| e)?)
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
        let out = replace_image_ref(&md, abs, "images/image-abc.png");
        assert!(out.starts_with(&format!("文字 {abs}")));
        assert!(!out.contains("](<C:/"));
        assert!(!out.contains("](C:/"));
        assert_eq!(out.matches("](images/image-abc.png)").count(), 2);
    }

    #[test]
    fn migrates_pending_refs_into_target_images() {
        let config = temp_dir("config");
        let pending = pending_dir_in(&config, "tab-1");
        fs::create_dir_all(&pending).unwrap();
        let src = pending.join("image-abc.png");
        fs::write(&src, PNG).unwrap();
        let target = temp_dir("target");
        let md = format!("![图](<{}>)", slash(&src));
        let out = migrate_pending_refs(&pending, &target, &md).unwrap();
        assert_eq!(out, "![图](images/image-abc.png)");
        assert!(target.join("images/image-abc.png").is_file());
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
    fn stages_pending_images_for_cloud_upload() {
        let _config = temp_dir("config-stage"); // 命令使用真实配置目录，这里只测纯函数
        let pending = temp_dir("pending-stage");
        let src = pending.join("image-abc.png");
        fs::write(&src, PNG).unwrap();
        let md = format!("![图]({})", slash(&src));
        // 通过 migrate 的等价路径验证 staging 的重写规则
        let staging = temp_dir("staging");
        let out = migrate_pending_refs(&pending, &staging, &md).unwrap();
        assert_eq!(out, "![图](images/image-abc.png)");
        assert!(staging.join("images/image-abc.png").is_file());
    }

    #[test]
    fn writes_images_next_to_document_as_relative_ref() {
        let doc_dir = temp_dir("doc-dir");
        let doc = doc_dir.join("note.md");
        fs::write(&doc, "").unwrap();
        let first = save_image_in(Some(doc.to_str().unwrap()), "tab", PNG, "image/png").unwrap();
        assert!(first.relative);
        assert_eq!(first.markdown_ref, format!("images/{}", first.file_name));
        assert!(doc_dir.join("images").join(&first.file_name).is_file());

        // 同内容重复粘贴：文件名相同、不重复写盘
        let again = save_image_in(Some(doc.to_str().unwrap()), "tab", PNG, "image/png").unwrap();
        assert_eq!(again.file_name, first.file_name);
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
