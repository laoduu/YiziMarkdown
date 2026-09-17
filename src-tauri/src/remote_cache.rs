//! 远程文档的本地缓存镜像（v0.3.0 云端存储）。
//!
//! 设计：远程文档落地到本地镜像后，`FileTab.filePath` 指向镜像文件，
//! 于是自动保存判据、DOCX 导出的 baseDir、侧边栏文件树、状态栏全部零改动复用。
//! 镜像是**可丢弃的派生物** —— 打开时总是重新 GET（服务器为真相），
//! 远程身份（`FileTab.remote`）才是持久化的那一份。
//!
//! 本模块的路径运算全部是纯函数（`*_in` 变体接收显式根目录，便于单测且不碰全局环境变量）。

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

use percent_encoding::percent_decode_str;
use serde::Serialize;
use url::Url;

use crate::webdav::Conn;

// ---------------------------------------------------------------------------
// 路径映射：远程 <-> 本地镜像
// ---------------------------------------------------------------------------

/// Windows 文件名非法字符。这些字符在远程合法（Linux/WebDAV 允许），
/// 落到本地必须转义，否则 `fs::write` 直接失败。
const ILLEGAL_IN_NAME: &[u8] = &[b'<', b'>', b':', b'"', b'/', b'\\', b'|', b'?', b'*'];

/// Windows 保留设备名（带扩展名的形式如 `CON.md` 同样非法）。
const RESERVED_NAMES: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM0", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7",
    "COM8", "COM9", "LPT0", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// 单个路径段 → 本地安全的段名。**可逆**（见 `unsanitize_segment`）。
///
/// 转义规则（`%XX` 十六进制，`%` 自身转义为 `%25`）：
///   - 控制字符与 Windows 非法字符
///   - 整段为 `.` / `..`（避免目录穿越语义）
///   - 结尾的点或空格（Windows 会静默丢弃）
///   - 保留设备名（转义首字符，保持可逆）
/// 非 ASCII（中文等）原样保留 —— NTFS 用 UTF-16，中文文件名完全合法。
fn sanitize_segment(seg: &str) -> String {
    let mut out = String::with_capacity(seg.len());
    for c in seg.chars() {
        let escaped = c.is_ascii()
            && ((c as u8) < 0x20 || ILLEGAL_IN_NAME.contains(&(c as u8)) || c == '%');
        if escaped {
            out.push_str(&format!("%{:02X}", c as u8));
        } else {
            out.push(c);
        }
    }
    if out.is_empty() {
        return "%00".to_string();
    }
    if out == "." || out == ".." {
        return out.replace('.', "%2E");
    }
    // 结尾的点/空格会被 Windows 丢掉，转义最后一个字符
    if out.ends_with('.') || out.ends_with(' ') {
        let last = out.pop().unwrap_or(' ');
        out.push_str(&format!("%{:02X}", last as u8));
    }
    // 保留设备名：转义首字符（比加前缀更可逆）
    let stem = out.split('.').next().unwrap_or("").to_ascii_uppercase();
    if RESERVED_NAMES.contains(&stem.as_str()) {
        let first = out.chars().next().unwrap_or('_');
        out = format!("%{:02X}{}", first as u8, &out[first.len_utf8()..]);
    }
    out
}

/// 缓存根目录名：`<host>[-port]-<hash8>`。
///
/// 带 base URL 的短哈希：同一主机上的两个不同根地址（例如两台 Nextcloud 账号）
/// 不会共用缓存，避免把 A 服务器的旧文件当成 B 服务器的内容。
fn cache_dir_name(base_url: &str) -> Result<String, String> {
    let url = Url::parse(base_url.trim())
        .map_err(|e| format!("服务器地址无效「{base_url}」：{e}"))?;
    let host = url.host_str().unwrap_or("server");
    let port = url.port().map(|p| format!("-{p}")).unwrap_or_default();
    let safe: String = format!("{host}{port}")
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let mut hasher = DefaultHasher::new();
    base_url.trim().hash(&mut hasher);
    Ok(format!("{safe}-{:08x}", hasher.finish() as u32))
}

/// 缓存根目录：`<用户配置目录>/webdav/<host>-<hash8>/`
fn cache_root_in(config_dir: &Path, base_url: &str) -> Result<PathBuf, String> {
    Ok(config_dir.join("webdav").join(cache_dir_name(base_url)?))
}

/// 远程路径（`/Notes/foo.md`）→ 本地镜像路径。
fn remote_to_cache_in(root: &Path, remote_path: &str) -> PathBuf {
    let mut p = root.to_path_buf();
    for seg in remote_path.split('/').filter(|s| !s.is_empty()) {
        p.push(sanitize_segment(seg));
    }
    p
}

// ---------------------------------------------------------------------------
// 公开包装（基于真实用户配置目录）
// ---------------------------------------------------------------------------

/// 缓存根目录（会自动创建）。
pub(crate) fn ensure_cache_root(base_url: &str) -> Result<PathBuf, String> {
    let root = cache_root_in(&crate::get_user_config_dir()?, base_url)?;
    std::fs::create_dir_all(&root)
        .map_err(|e| format!("创建云端缓存目录失败 {}：{e}", root.display()))?;
    Ok(root)
}

// ---------------------------------------------------------------------------
// 相对引用解析
// ---------------------------------------------------------------------------

/// 把文档内的相对引用解析成**相对配置根目录**的绝对路径。
/// 例：`doc_dir = "/Notes"`、`rel = "../assets/x.png"` → `Some("/assets/x.png")`。
///
/// 纯词法处理（这些路径在本地并不存在，不能用 `canonicalize`）；
/// 归一化后越过根目录则返回 `None`，绝不逃逸。
fn normalize_relative(doc_dir: &str, rel: &str) -> Option<String> {
    let mut parts: Vec<&str> = doc_dir.split('/').filter(|s| !s.is_empty()).collect();
    for seg in rel.split('/') {
        match seg {
            "" | "." => continue,
            ".." => {
                parts.pop()?;
            }
            s => parts.push(s),
        }
    }
    Some(format!("/{}", parts.join("/")))
}

/// 图片引用的分类结果。
#[derive(Debug, Clone, PartialEq)]
pub(crate) enum ImageRef {
    /// 可上传/下载的相对路径（已统一为正斜杠、去掉 `./`）
    Relative(String),
    /// 无需处理：网络图 / data URL / 绝对本地路径 / 锚点
    Skip,
}

/// 判断一个图片引用是否属于「随文档一起同步的相对资源」。
///
/// 关键安全边界：**绝不把用户本地文件上传到服务器**。
/// 因此绝对路径（POSIX `/…` 或 Windows 盘符）、`file://` 一律跳过。
pub(crate) fn classify_image_ref(src: &str) -> ImageRef {
    let decoded = percent_decode_str(src.trim()).decode_utf8_lossy().into_owned();
    let s = decoded.trim();
    if s.is_empty() || s.starts_with('#') {
        return ImageRef::Skip;
    }
    let lower = s.to_ascii_lowercase();
    if lower.starts_with("http://")
        || lower.starts_with("https://")
        || lower.starts_with("data:")
        || lower.starts_with("file://")
    {
        return ImageRef::Skip;
    }
    let bytes = s.as_bytes();
    let is_windows_absolute = bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':';
    if s.starts_with('/') || is_windows_absolute {
        return ImageRef::Skip;
    }
    // 统一分隔符并去掉开头的 `./`（normalize_relative 也容忍，这里只为让返回值规范）
    let mut rel = s.replace('\\', "/");
    while let Some(rest) = rel.strip_prefix("./") {
        rel = rest.to_string();
    }
    if rel.is_empty() {
        return ImageRef::Skip;
    }
    ImageRef::Relative(rel)
}

/// 文档路径（`/Notes/foo.md`）的所在目录（`/Notes`；根目录为 `""`）。
fn dir_of(path: &str) -> String {
    let trimmed = path.trim_end_matches('/');
    match trimmed.rfind('/') {
        Some(0) | None => String::new(),
        Some(i) => trimmed[..i].to_string(),
    }
}

// ---------------------------------------------------------------------------
// 本地镜像读写
// ---------------------------------------------------------------------------

/// 写入镜像文件（自动创建父目录）。
/// `fs::write` 不会创建父目录，而缓存目录是用户可见、可能被清空的。
fn write_mirror(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("创建缓存目录失败 {}：{e}", parent.display()))?;
    }
    std::fs::write(path, bytes).map_err(|e| format!("写入缓存文件失败 {}：{e}", path.display()))
}

// ---------------------------------------------------------------------------
// 打开远程文档（读路径）
// ---------------------------------------------------------------------------

/// 单张图片上限：超过则跳过，避免一张巨图拖垮打开流程。
const MAX_IMAGE_BYTES: usize = 8 * 1024 * 1024;
/// 单个文档引用的图片总量上限。
const MAX_TOTAL_IMAGE_BYTES: usize = 32 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenOutcome {
    pub content: String,
    pub etag: Option<String>,
    /// 本地镜像路径，前端用它作为 `FileTab.filePath`
    pub cache_path: String,
    pub images_ok: usize,
    pub images_failed: usize,
}

/// 打开远程文档：GET 正文 → 写入镜像 → 下载相对引用的图片到镜像。
///
/// 正文**总是重新 GET**（服务器为真相），绝不复用旧缓存。
/// 图片同样重新下载，保证预览与服务器一致；单张/总量超限则跳过并计入 `images_failed`。
#[tauri::command]
pub async fn webdav_open(base_url: String, remote_path: String) -> Result<OpenOutcome, String> {
    let conn = Conn::from_keychain(&base_url)?;
    let doc = conn.read(&remote_path).await?;

    let root = ensure_cache_root(&base_url)?;
    let cache_path = remote_to_cache_in(&root, &remote_path);
    write_mirror(&cache_path, doc.content.as_bytes())?;

    let (images_ok, images_failed) =
        mirror_images_down(&conn, &root, &dir_of(&remote_path), &doc.content).await;

    Ok(OpenOutcome {
        content: doc.content,
        etag: doc.etag,
        cache_path: cache_path.to_string_lossy().to_string(),
        images_ok,
        images_failed,
    })
}

/// 把 md 中相对引用的图片下载到镜像的对应位置。
///
/// 顺序下载（文档图片通常个位数）；总量上限是硬约束，故不做并发以免超额。
/// 缺图/超限都只计入失败数，**不中断打开** —— 表现与本地缺图一致（图片裂开）。
async fn mirror_images_down(conn: &Conn, root: &Path, doc_dir: &str, md: &str) -> (usize, usize) {
    let mut ok = 0usize;
    let mut failed = 0usize;
    let mut total = 0usize;

    for src in crate::collect_image_urls(md) {
        let ImageRef::Relative(rel) = classify_image_ref(&src) else {
            continue;
        };
        let Some(remote) = normalize_relative(doc_dir, &rel) else {
            // 越过根目录的引用：拒绝，不计入失败（本就不是可同步的资源）
            eprintln!("[webdav] 跳过越出根目录的图片引用: {src}");
            continue;
        };
        let local = remote_to_cache_in(root, &remote);
        match conn.read_bytes(&remote).await {
            Ok(bytes) if bytes.len() > MAX_IMAGE_BYTES => {
                eprintln!("[webdav] 图片超过单张上限，跳过: {remote}");
                failed += 1;
            }
            Ok(bytes) if total + bytes.len() > MAX_TOTAL_IMAGE_BYTES => {
                eprintln!("[webdav] 图片总量超过上限，跳过: {remote}");
                failed += 1;
            }
            Ok(bytes) => {
                total += bytes.len();
                match write_mirror(&local, &bytes) {
                    Ok(()) => ok += 1,
                    Err(e) => {
                        eprintln!("[webdav] {e}");
                        failed += 1;
                    }
                }
            }
            Err(e) => {
                eprintln!("[webdav] 图片下载失败 {remote}: {e}");
                failed += 1;
            }
        }
    }
    (ok, failed)
}

// ---------------------------------------------------------------------------
// 保存到云端（写路径）
// ---------------------------------------------------------------------------

/// 解析本地图片路径。`normalize_relative` 的本地对应物。
///
/// `max_up` 是允许上跳的最大层数 —— 取**远程文档目录的层级**，
/// 这样本地与远程两侧的边界完全对称：远程能到哪一层，本地就允许读到哪一层，
/// 既支持 `../assets/x.png` 这类跨目录引用，又不会顺着 `..` 读到无关目录。
fn resolve_local_file(doc_dir: &Path, rel: &str, max_up: usize) -> Option<PathBuf> {
    let mut stack: Vec<&str> = Vec::new();
    let mut ups: usize = 0;
    for seg in rel.split('/') {
        match seg {
            "" | "." => continue,
            ".." => {
                // 先抵消已累积的段；抵消不掉才真正上跳，并受 max_up 限制
                if stack.pop().is_none() {
                    ups += 1;
                    if ups > max_up {
                        return None;
                    }
                }
            }
            s => stack.push(s),
        }
    }
    if stack.is_empty() {
        return None;
    }
    let mut out = doc_dir.to_path_buf();
    for _ in 0..ups {
        if !out.pop() {
            return None;
        }
    }
    for s in stack {
        out.push(s);
    }
    // 上跳到根之后不能再有内容（out 为空说明越过了文件系统根）
    if out.as_os_str().is_empty() {
        return None;
    }
    Some(out)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudSaveOutcome {
    /// 远程已被他人修改（If-Match 失败）
    pub conflict: bool,
    pub etag: Option<String>,
    pub images_uploaded: usize,
    pub images_failed: usize,
}

/// 保存到云端：先传图片、**最后 PUT 正文**。
///
/// 顺序很关键 —— 先传正文会让服务器在一段时间内存在一个引用了尚未上传图片的文档，
/// 其他设备此刻打开就会看到裂图。
///
/// `local_dir` 是图片的本地来源目录：
///   - 保存已打开的云端文档 → 本地缓存镜像目录
///   - 把本地文档另存到云端 → 该本地文档所在目录
///
/// 图片去重靠「PROPFIND 取远程大小 + 与本地大小比对」：无状态、无需清单文件。
/// 已知取舍：若图片内容变化但字节数恰好相同，会被跳过（极少见，且正文仍会正常保存）。
#[tauri::command]
pub async fn webdav_save(
    base_url: String,
    remote_path: String,
    content: String,
    etag: Option<String>,
    create: bool,
    local_dir: Option<String>,
) -> Result<CloudSaveOutcome, String> {
    let conn = Conn::from_keychain(&base_url)?;
    let remote_doc_dir = dir_of(&remote_path);

    // WebDAV 不会隐式创建目录：PUT 到不存在的目录会返回 409。
    // 「另存到云端」允许用户直接输入多层新路径，所以这里先补齐目录（已存在则 405，视为成功）。
    conn.mkdir_all(&remote_doc_dir)
        .await
        .map_err(|e| format!("创建云端目录失败：{e}"))?;

    // 先写本地镜像：本地缓存目录可能被用户清空，write_mirror 会重建父目录。
    // 失败只告警、不阻断 —— 镜像是可丢弃的派生物，云端那份才是真相。
    match ensure_cache_root(&base_url) {
        Ok(root) => {
            let mirror = remote_to_cache_in(&root, &remote_path);
            if let Err(e) = write_mirror(&mirror, content.as_bytes()) {
                eprintln!("[webdav] 本地镜像写入失败（不影响云端保存）：{e}");
            }
        }
        Err(e) => eprintln!("[webdav] 本地缓存目录不可用（不影响云端保存）：{e}"),
    }

    let (images_uploaded, images_failed) = match local_dir {
        Some(dir) if !dir.trim().is_empty() => {
            upload_images_up(&conn, Path::new(dir.trim()), &remote_doc_dir, &content).await
        }
        _ => (0, 0),
    };

    // 正文最后写：此时引用的图片都已就位
    let outcome = crate::webdav::save_text(
        &base_url,
        &remote_path,
        &content,
        etag.as_deref(),
        create,
    )
    .await?;

    Ok(CloudSaveOutcome {
        conflict: outcome.conflict,
        etag: outcome.etag,
        images_uploaded,
        images_failed,
    })
}

/// 把 md 中相对引用的图片上传到远程文档所在目录，**保持相对结构**（不改写 markdown）。
///
/// 保持相对结构的好处：正文在服务器与本地逐字节一致，PUT 就是直拷；
/// 本地解析相对路径的既有逻辑对缓存镜像直接可用；换服务器地址也不影响可移植性。
async fn upload_images_up(
    conn: &Conn,
    local_dir: &Path,
    remote_doc_dir: &str,
    md: &str,
) -> (usize, usize) {
    let mut uploaded = 0usize;
    let mut failed = 0usize;
    // 允许上跳的层数 = 远程文档目录层级，保证本地与远程两侧边界一致
    let max_up = remote_doc_dir.split('/').filter(|s| !s.is_empty()).count();
    // 已确保存在的远程目录，避免每张图片都重复 MKCOL 同一层级
    let mut ensured: Vec<String> = Vec::new();

    for src in crate::collect_image_urls(md) {
        let ImageRef::Relative(rel) = classify_image_ref(&src) else {
            continue;
        };
        // 本地找不到（含越界被拒）→ 跳过，不算失败：用户可能引用了尚未存在的图片
        let Some(local) = resolve_local_file(local_dir, &rel, max_up) else {
            continue;
        };
        let Ok(bytes) = std::fs::read(&local) else {
            continue;
        };
        let Some(remote) = normalize_relative(remote_doc_dir, &rel) else {
            eprintln!("[webdav] 跳过越出根目录的图片: {src}");
            continue;
        };
        if bytes.len() > MAX_IMAGE_BYTES {
            eprintln!("[webdav] 图片超过单张上限，跳过上传: {remote}");
            failed += 1;
            continue;
        }
        // 图片可能落在尚不存在的子目录（如 doc 目录下的 images/），必须先建目录否则 409
        let parent = dir_of(&remote);
        if !ensured.contains(&parent) {
            if let Err(e) = conn.mkdir_all(&parent).await {
                eprintln!("[webdav] 创建图片目录失败 {parent}: {e}");
                failed += 1;
                continue;
            }
            ensured.push(parent);
        }
        // 远程已存在且大小一致 → 内容几乎必然相同，省掉这次上传
        if let Ok(Some(existing)) = conn.stat(&remote).await {
            if !existing.is_dir && existing.size == bytes.len() as u64 {
                continue;
            }
        }
        match conn.write_bytes(&remote, bytes).await {
            Ok(()) => uploaded += 1,
            Err(e) => {
                eprintln!("[webdav] 图片上传失败 {remote}: {e}");
                failed += 1;
            }
        }
    }
    (uploaded, failed)
}

// ---------------------------------------------------------------------------
// 测试
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// 纯函数测试直接用临时目录，**不修改进程环境变量**
    /// （main.rs 的模板同步测试会重定向 USERPROFILE，并行跑会互相干扰）。
    fn temp_root(tag: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("yizimd-webdav-test-{tag}"));
        let _ = std::fs::remove_dir_all(&p);
        std::fs::create_dir_all(&p).unwrap();
        p
    }

    /// 段名编码的逆运算。**只存在于测试中** —— 生产代码不需要把本地镜像名映射回远程
    /// （远程身份存在 `FileTab.remote` 上）。这里用它来证明编码是单射的：
    /// 若能无损还原，则不同远程名不可能落到同一个本地文件名上。
    fn unsanitize_segment(seg: &str) -> String {
        fn hex_val(b: u8) -> Option<u8> {
            match b {
                b'0'..=b'9' => Some(b - b'0'),
                b'a'..=b'f' => Some(b - b'a' + 10),
                b'A'..=b'F' => Some(b - b'A' + 10),
                _ => None,
            }
        }
        let bytes = seg.as_bytes();
        let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
        let mut i = 0;
        while i < bytes.len() {
            if bytes[i] == b'%' && i + 2 < bytes.len() {
                if let (Some(hi), Some(lo)) = (hex_val(bytes[i + 1]), hex_val(bytes[i + 2])) {
                    out.push(hi * 16 + lo);
                    i += 3;
                    continue;
                }
            }
            out.push(bytes[i]);
            i += 1;
        }
        String::from_utf8_lossy(&out).into_owned()
    }

    #[test]
    fn sanitize_is_reversible_for_windows_illegal_names() {
        let cases = [
            "a:b.md",      // 冒号（Windows 非法）
            "q?mark.md",   // 问号
            "star*.md",    // 星号
            "pipe|.md",    // 竖线
            "quote\".md",  // 引号
            "lt<gt>.md",   // 尖括号
            "back\\slash.md",
            "100%done.md", // % 必须自身转义
            "trailing.",   // 结尾点
            "trailing ",   // 结尾空格
            "..",          // 目录穿越语义
            ".",           // 当前目录语义
            "CON",         // 保留设备名
            "con.md",      // 保留名带扩展名
            "LPT1.txt",    // 保留名
            "笔记:草稿.md", // 中文 + 非法字符混合
        ];
        for name in cases {
            let sanitized = sanitize_segment(name);
            // 注意：`%` 本身是转义引导符，允许出现在结果里；
            // 真正要杜绝的是原始的 Windows 非法字符。
            assert!(
                !sanitized
                    .chars()
                    .any(|c| c.is_ascii() && ILLEGAL_IN_NAME.contains(&(c as u8))),
                "「{name}」转义后仍含非法字符：{sanitized}"
            );
            assert!(
                !sanitized.ends_with('.') && !sanitized.ends_with(' '),
                "「{name}」结尾非法：{sanitized}"
            );
            assert_eq!(unsanitize_segment(&sanitized), name, "「{name}」转义不可逆");
        }
    }

    #[test]
    fn sanitize_keeps_chinese_and_ordinary_names_intact() {
        // 普通名称与中文名不该被改动（保持缓存目录可读）
        for name in ["a.md", "笔记.md", "my notes.md", "a-b_c.d", "图片 (1).png"] {
            assert_eq!(sanitize_segment(name), name, "「{name}」被无谓改动");
        }
    }

    #[test]
    fn sanitize_handles_empty_segment() {
        assert_eq!(sanitize_segment(""), "%00");
        assert_eq!(unsanitize_segment("%00"), "\0");
    }

    #[test]
    fn unsanitize_leaves_stray_percent_alone() {
        // 非法转义序列不得被解码，也不得 panic
        assert_eq!(unsanitize_segment("100%"), "100%");
        assert_eq!(unsanitize_segment("%ZZ"), "%ZZ");
        assert_eq!(unsanitize_segment("%2"), "%2");
        assert_eq!(unsanitize_segment("ok%2Etxt"), "ok.txt");
    }

    #[test]
    fn cache_dir_name_is_host_and_root_scoped() {
        let a = cache_dir_name("https://dav.jianguoyun.com/dav/").unwrap();
        let b = cache_dir_name("https://other.example/dav/").unwrap();
        assert_ne!(a, b, "不同主机不得共用缓存");
        // 同主机不同根地址也要分开
        let c = cache_dir_name("https://dav.jianguoyun.com/dav2/").unwrap();
        assert_ne!(a, c, "同主机不同根地址不得共用缓存");
        // 同一地址必须稳定
        assert_eq!(a, cache_dir_name("https://dav.jianguoyun.com/dav/").unwrap());
        assert!(a.starts_with("dav.jianguoyun.com-"));
        // 端口参与命名
        let with_port = cache_dir_name("http://localhost:8080/dav/").unwrap();
        assert!(with_port.starts_with("localhost-8080-"), "得到 {with_port}");
    }

    #[test]
    fn maps_remote_paths_into_the_mirror() {
        let cfg = temp_root("map");
        let root = cache_root_in(&cfg, "https://dav.jianguoyun.com/dav/").unwrap();
        assert_eq!(
            remote_to_cache_in(&root, "/Notes/foo.md"),
            root.join("Notes").join("foo.md")
        );
        assert_eq!(remote_to_cache_in(&root, "/foo.md"), root.join("foo.md"));
        // 根路径 → 就是根目录本身
        assert_eq!(remote_to_cache_in(&root, "/"), root);
        // 中文与非法字符都要能落盘
        let cn = remote_to_cache_in(&root, "/笔记/草稿:1.md");
        assert!(cn.starts_with(&root));
    }

    /// 不同远程路径必须映射到不同的本地文件，否则镜像会互相覆盖。
    #[test]
    fn distinct_remote_paths_never_collide_in_the_mirror() {
        let cfg = temp_root("collide");
        let root = cache_root_in(&cfg, "https://cloud.example/remote.php/dav/files/me/").unwrap();
        let remotes = [
            "/a.md",
            "/Notes/foo.md",
            "/笔记/测试文档.md",
            "/deep/nested/dir/x.md",
            "/has space/a(1).md",
            "/illegal:name?.md",
            "/a:b.md",
            "/a?b.md",
            "/100%done.md",
            "/trailing.",
            "/CON",
            "/con.md",
        ];
        let mut seen: Vec<PathBuf> = Vec::new();
        for remote in remotes {
            let cache = remote_to_cache_in(&root, remote);
            assert!(
                !seen.contains(&cache),
                "远程路径 {remote} 与已有路径映射到了同一个本地文件 {}",
                cache.display()
            );
            seen.push(cache);
        }
    }

    #[test]
    fn resolves_relative_refs_within_root() {
        assert_eq!(
            normalize_relative("/Notes", "./images/a.png").as_deref(),
            Some("/Notes/images/a.png")
        );
        assert_eq!(
            normalize_relative("/Notes", "images/a.png").as_deref(),
            Some("/Notes/images/a.png")
        );
        // 跨目录引用是合法的，只要不越过根
        assert_eq!(
            normalize_relative("/Notes", "../assets/x.png").as_deref(),
            Some("/assets/x.png")
        );
        // 从 /a/b/c 上跳两级到 /a
        assert_eq!(normalize_relative("/a/b/c", "../../d.png").as_deref(), Some("/a/d.png"));
        // 上跳三级恰好落在根
        assert_eq!(normalize_relative("/a/b/c", "../../../d.png").as_deref(), Some("/d.png"));
        // 越过根目录必须拒绝
        assert_eq!(normalize_relative("/Notes", "../../etc/passwd"), None);
        assert_eq!(normalize_relative("", "../x.png"), None);
        assert_eq!(normalize_relative("/a", "../../../x"), None);
        // 根目录下的文档
        assert_eq!(normalize_relative("", "a.png").as_deref(), Some("/a.png"));
        assert_eq!(normalize_relative("/", "a.png").as_deref(), Some("/a.png"));
        assert_eq!(
            normalize_relative("/Notes", "images/a b.png").as_deref(),
            Some("/Notes/images/a b.png")
        );
    }

    #[test]
    fn classifies_image_refs_and_never_uploads_local_files() {
        // 可同步的相对引用
        assert_eq!(
            classify_image_ref("./images/a.png"),
            ImageRef::Relative("images/a.png".into())
        );
        assert_eq!(
            classify_image_ref("images/a.png"),
            ImageRef::Relative("images/a.png".into())
        );
        assert_eq!(
            classify_image_ref("../assets/x.png"),
            ImageRef::Relative("../assets/x.png".into())
        );
        assert_eq!(
            classify_image_ref("images\\win.png"),
            ImageRef::Relative("images/win.png".into())
        );
        // 带空格的相对路径（pulldown-cmark 已剥掉尖括号）
        assert_eq!(
            classify_image_ref("images/a b.png"),
            ImageRef::Relative("images/a b.png".into())
        );
        // 百分号编码要先解码
        assert_eq!(
            classify_image_ref("images/a%20b.png"),
            ImageRef::Relative("images/a b.png".into())
        );

        // 必须跳过的：网络图 / data URL / 本地绝对路径（绝不外传用户本地文件）
        for skip in [
            "https://cdn.example/a.png",
            "http://cdn.example/a.png",
            "HTTPS://CDN.EXAMPLE/A.PNG",
            "data:image/png;base64,AAAA",
            "file:///D:/pics/a.png",
            "/etc/passwd",
            "D:/pics/a.png",
            "C:\\pics\\a.png",
            "#anchor",
            "",
            "   ",
        ] {
            assert_eq!(classify_image_ref(skip), ImageRef::Skip, "应跳过：{skip}");
        }
    }

    #[test]
    fn computes_document_directory() {
        assert_eq!(dir_of("/Notes/foo.md"), "/Notes");
        assert_eq!(dir_of("/foo.md"), "");
        assert_eq!(dir_of("foo.md"), "");
        assert_eq!(dir_of("/a/b/c.md"), "/a/b");
        assert_eq!(dir_of("/Notes/"), "");
    }

    #[test]
    fn writes_mirror_creating_parent_dirs() {
        let root = temp_root("write");
        let p = remote_to_cache_in(&root, "/Notes/images/a.png");
        write_mirror(&p, b"PNGDATA").unwrap();
        assert_eq!(std::fs::read(&p).unwrap(), b"PNGDATA");
        // 覆盖写不应报错
        write_mirror(&p, b"NEW").unwrap();
        assert_eq!(std::fs::read(&p).unwrap(), b"NEW");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn resolves_local_image_files_within_the_symmetric_boundary() {
        let doc_dir = Path::new("/mirror/Notes");
        // 文档在远程 /Notes 下 → 层级 1 → 允许上跳 1 层
        assert_eq!(
            resolve_local_file(doc_dir, "images/a.png", 1),
            Some(doc_dir.join("images").join("a.png"))
        );
        assert_eq!(
            resolve_local_file(doc_dir, "./images/a.png", 1),
            Some(doc_dir.join("images").join("a.png"))
        );
        // 段内先抵消再上跳
        assert_eq!(
            resolve_local_file(doc_dir, "images/../a.png", 1),
            Some(doc_dir.join("a.png"))
        );
        // 跨目录引用：上跳 1 层，与远程侧 normalize_relative 的结果对称
        assert_eq!(
            resolve_local_file(doc_dir, "../assets/x.png", 1),
            Some(PathBuf::from("/mirror/assets/x.png"))
        );
        // 超出预算必须拒绝 —— 否则会顺着 .. 读到用户其它目录
        assert_eq!(resolve_local_file(doc_dir, "../../etc/passwd", 1), None);
        // 注意："images/.." 会先抵消掉，净上跳只有 1 层，因此是合法的
        // （与远程侧 normalize_relative("/Notes", "images/../../x.png") == "/x.png" 对称）
        assert_eq!(
            resolve_local_file(doc_dir, "images/../../x.png", 1),
            Some(PathBuf::from("/mirror").join("x.png"))
        );
        assert_eq!(resolve_local_file(doc_dir, "", 1), None);
        assert_eq!(resolve_local_file(doc_dir, ".", 1), None);
        // 文档在远程根目录（层级 0）→ 不允许上跳
        assert_eq!(resolve_local_file(Path::new("/mirror"), "../x.png", 0), None);
        assert_eq!(
            resolve_local_file(Path::new("/mirror"), "images/a.png", 0),
            Some(PathBuf::from("/mirror/images/a.png"))
        );
    }

    /// 本地与远程两侧的边界必须一致：远程允许的引用，本地也要能解析到对应文件。
    #[test]
    fn local_and_remote_boundaries_agree() {
        let cases = [
            ("/Notes", 1, "images/a.png", true),
            ("/Notes", 1, "../assets/x.png", true),
            ("/Notes", 1, "../../etc/passwd", false),
            ("/a/b", 2, "../../shared/x.png", true),
            ("/a/b", 2, "../../../x.png", false),
            ("", 0, "a.png", true),
            ("", 0, "../x.png", false),
        ];
        for (remote_dir, depth, rel, allowed) in cases {
            let remote = normalize_relative(remote_dir, rel);
            let local = resolve_local_file(Path::new("/mirror/Notes"), rel, depth);
            assert_eq!(
                remote.is_some(),
                allowed,
                "远程侧判定不符：dir={remote_dir} rel={rel}"
            );
            assert_eq!(
                local.is_some(),
                allowed,
                "本地侧判定与远程不一致：dir={remote_dir} rel={rel}"
            );
        }
    }

    #[test]
    fn upload_and_download_paths_agree() {
        // 同一相对引用，本地与远程应解析到结构一致的位置
        let doc_dir = Path::new("/mirror/Notes");
        let rel = "images/a.png";
        assert_eq!(resolve_local_file(doc_dir, rel, 1), Some(doc_dir.join("images").join("a.png")));
        assert_eq!(normalize_relative("/Notes", rel).as_deref(), Some("/Notes/images/a.png"));
        // 跨目录引用两侧同样一致（本地 /mirror/assets ↔ 远程 /assets）
        let rel2 = "../assets/x.png";
        assert_eq!(
            resolve_local_file(doc_dir, rel2, 1),
            Some(PathBuf::from("/mirror/assets/x.png"))
        );
        assert_eq!(normalize_relative("/Notes", rel2).as_deref(), Some("/assets/x.png"));
    }
}
