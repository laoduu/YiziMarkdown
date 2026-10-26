//! 主题资产分层：**内置只读 + 用户层可写**。
//!
//! ── 为什么要有这一层 ──
//! 0.4.0 及以前，`themes/*.css` 与 `themes/theme.json` 都是随包资源，直接落在安装目录，
//! 而 `list_themes` / `read_theme_css` / `write_theme_json` 也都读写安装目录。于是：
//!   · 用户改的主题名写进安装目录的 `theme.json` ⇒ 升级被安装器覆盖；
//!   · 用户改过的内置主题 CSS、自建 CSS 同样可能被覆盖或随卸载删除；
//!   · 装到 `C:\Program Files` 时非提权写入直接失败（改名静默无效）。
//!
//! ── 现在的布局 ──
//! ```text
//! <安装目录>/themes/                 内置（只读，随包升级）
//!   builtin.json                     清单：id / file / name / desc / swatch
//!   *.css
//!
//! ~/Documents/yizimarkdown/themes/   用户层（安装器永不触碰）
//!   themes.user.json                 { schema, renames, order, hidden, overrides }
//!   overrides/<id>.css               用户改过的内置主题（同 id 优先于内置）
//!   custom/<id>.css                  用户自建主题
//!   legacy-import/                   仅升级瞬间由 NSIS 预安装钩子写入的一次性备份
//! ```
//!
//! ── 覆盖回避怎么做 ──
//! 内置 CSS **从不复制到用户层**，用户层只放用户自己的东西，所以「同文件覆盖」从根上不存在。
//! 内容比对只用于两件事：
//!   1. 首次迁移（`legacy-import/`）时判断某个内置 CSS 是否被用户改过：与当前内置逐字节相同 ⇒
//!      丢弃（只是随包的旧副本）；不同 ⇒ 复制到 `overrides/` 保留；
//!   2. 已存在的 override 在后续版本里是否有新版内置：`baseSha256` ≠ 当前内置 sha256 ⇒
//!      `hasUpdate = true`，由前端提示用户二选一，**绝不静默覆盖**。
//!
//! 哈希在读取时按当前内置文件现算（不写进 `builtin.json`），避免清单与 CSS 内容漂移。
//!
//! ⚠️ 迁移约束：首次迁移把「与当前内置不同」的旧 CSS 视为用户修改。只有当本次发布的内置
//! CSS 与上一版逐字节一致时才成立。本版本（主题层重构）没有改动任何主题 CSS，满足条件。
//! 将来若同时改主题 CSS 与迁移规则，需要同时更新这里的基准，否则升级用户会被误判为「改过主题」。
//!
//! ── schema 字段 ──
//! `themes.user.json.schema` 只描述**用户层数据格式**，不是应用版本号：应用版本与主题改动
//! 节奏不一致，而「内容变没变」已经由 sha256 回答，版本号反而是噪音。

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

use crate::{get_app_root, get_dev_project_root, get_user_config_dir};

/// 用户层数据格式版本（`themes.user.json.schema`）
pub const USER_THEME_SCHEMA: i64 = 1;
/// 内置清单格式版本（`builtin.json.schema`）
const BUILTIN_SCHEMA: i64 = 1;
/// 合成「自定义主题」（基底主题 + user.css）占用的 id，用户 CSS 文件不能重名
const RESERVED_THEME_IDS: &[&str] = &["custom"];

// ===== 数据结构 =====

#[derive(Debug, Clone, Deserialize)]
struct BuiltinTheme {
    id: String,
    /// CSS 文件名；缺省时按 `<id>.css`
    #[serde(default)]
    file: String,
    name: String,
    #[serde(default)]
    desc: String,
    #[serde(default)]
    swatch: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct BuiltinManifest {
    #[serde(default)]
    schema: i64,
    #[serde(default)]
    themes: Vec<BuiltinTheme>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OverrideInfo {
    /// 用户这份 override 依据的内置版本 sha256（空 = 未知，不提示更新）
    #[serde(default)]
    base_sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct UserThemes {
    #[serde(default)]
    schema: i64,
    /// 改名：内置主题与自建主题都走这一张表（内置名字随版本更新，改名不冲突）
    #[serde(default)]
    renames: BTreeMap<String, String>,
    /// 自定义排序（id 列表；未列出的保持原序）
    #[serde(default)]
    order: Vec<String>,
    /// 隐藏的主题 id
    #[serde(default)]
    hidden: Vec<String>,
    /// override 的基准信息
    #[serde(default)]
    overrides: BTreeMap<String, OverrideInfo>,
}

impl Default for UserThemes {
    fn default() -> Self {
        Self {
            schema: USER_THEME_SCHEMA,
            renames: BTreeMap::new(),
            order: Vec::new(),
            hidden: Vec::new(),
            overrides: BTreeMap::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeEntry {
    pub id: String,
    pub name: String,
    pub desc: String,
    pub swatch: Vec<String>,
    /// `builtin` | `override` | `custom`
    pub source: String,
    /// 内置主题已有更新版本，但用户 override 被保留（见模块头注释）
    pub has_update: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeCatalog {
    pub schema: i64,
    pub themes: Vec<ThemeEntry>,
    pub user_dir: String,
    pub builtin_dir: String,
}

// ===== 路径 =====

/// 内置主题目录：dev 用项目里的 `src-tauri/themes`（exe 旁的 copies 可能是旧资源），
/// 安装版用应用目录下的 `themes`（由 tauri 打包进来）。
pub fn get_builtin_themes_dir() -> Result<PathBuf, String> {
    if let Some(project) = get_dev_project_root() {
        let dev = project.join("src-tauri").join("themes");
        if dev.is_dir() {
            return Ok(dev);
        }
    }
    Ok(get_app_root()?.join("themes"))
}

/// 用户主题层：`~/Documents/yizimarkdown/themes/`
pub fn get_user_themes_dir() -> Result<PathBuf, String> {
    Ok(get_user_config_dir()?.join("themes"))
}

/// 升级时 NSIS 预安装钩子写入的一次性备份目录
pub fn get_legacy_import_dir() -> Result<PathBuf, String> {
    Ok(get_user_themes_dir()?.join("legacy-import"))
}

fn builtin_json_path(builtin: &Path) -> PathBuf {
    builtin.join("builtin.json")
}

fn user_json_path(user: &Path) -> PathBuf {
    user.join("themes.user.json")
}

fn overrides_dir(user: &Path) -> PathBuf {
    user.join("overrides")
}

fn custom_dir(user: &Path) -> PathBuf {
    user.join("custom")
}

// ===== 基础工具 =====

fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let mut out = String::with_capacity(digest.len() * 2);
    for byte in digest {
        out.push_str(&format!("{:02x}", byte));
    }
    out
}

fn theme_file_name(theme: &BuiltinTheme) -> String {
    if theme.file.trim().is_empty() {
        format!("{}.css", theme.id)
    } else {
        theme.file.clone()
    }
}

fn default_swatch() -> Vec<String> {
    vec!["#e8ecf0".to_string(), "#c0c8d4".to_string()]
}

fn is_safe_id(id: &str) -> bool {
    !id.is_empty()
        && !id.contains(['/', '\\', '\0', ':'])
        && !id.starts_with('.')
        && id != ".."
}

fn is_reserved_id(id: &str) -> bool {
    RESERVED_THEME_IDS.contains(&id)
}

/// 接受 `tech` 或 `tech.css`，并挡掉路径穿越
fn normalize_theme_id(name: &str) -> Option<String> {
    let id = name.trim();
    let id = id.strip_suffix(".css").unwrap_or(id).trim();
    if is_safe_id(id) {
        Some(id.to_string())
    } else {
        None
    }
}

fn load_manifest(builtin: &Path) -> Result<BuiltinManifest, String> {
    let path = builtin_json_path(builtin);
    let text = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
    let manifest: BuiltinManifest = serde_json::from_str(&text)
        .map_err(|e| format!("Failed to parse {}: {}", path.display(), e))?;
    if manifest.schema > BUILTIN_SCHEMA {
        return Err(format!(
            "Unsupported builtin theme schema {} (this build supports {})",
            manifest.schema, BUILTIN_SCHEMA
        ));
    }
    Ok(manifest)
}

fn load_user_cfg(path: &Path) -> UserThemes {
    let Ok(text) = fs::read_to_string(path) else {
        return UserThemes::default();
    };
    let mut cfg: UserThemes = serde_json::from_str(&text).unwrap_or_default();
    cfg.schema = USER_THEME_SCHEMA;
    cfg
}

/// 原子写：先写 `.tmp` 再替换，避免写一半断电留下坏 JSON
fn write_user_cfg(path: &Path, cfg: &UserThemes) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create {}: {}", parent.display(), e))?;
    }
    let mut out = cfg.clone();
    out.schema = USER_THEME_SCHEMA;
    let text = serde_json::to_string_pretty(&out).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, text).map_err(|e| format!("Failed to write {}: {}", tmp.display(), e))?;
    if fs::rename(&tmp, path).is_err() {
        // Windows 上目标存在时个别文件系统会拒绝 rename
        let _ = fs::remove_file(path);
        fs::rename(&tmp, path).map_err(|e| format!("Failed to write {}: {}", path.display(), e))?;
    }
    Ok(())
}

fn dir_has_entries(dir: &Path) -> bool {
    fs::read_dir(dir).map(|mut it| it.any(|e| e.is_ok())).unwrap_or(false)
}

// ===== 迁移 =====

/// 把旧版安装目录里的主题信息导入用户层（只在 `themes.user.json` 不存在时执行一次）。
///
/// `src` 有两种来源：
///   · `<user>/legacy-import/`：NSIS 预安装钩子在新文件覆盖前做的备份 —— 可以据此识别
///     「用户改过的内置 CSS」（与当前内置不同）；
///   · `<builtin>/`（dev / 手动升级）：这里就是源目录，只导入清单外的自建 CSS，
///     不把同名文件当成用户修改。
fn import_legacy_renames(src: &Path, manifest: &BuiltinManifest, cfg: &mut UserThemes) -> bool {
    let path = src.join("theme.json");
    let Ok(text) = fs::read_to_string(&path) else {
        return false;
    };
    let Ok(map) = serde_json::from_str::<BTreeMap<String, serde_json::Value>>(&text) else {
        return false;
    };
    let mut changed = false;
    for (id, meta) in map {
        if !is_safe_id(&id) || is_reserved_id(&id) {
            continue;
        }
        let Some(name) = meta.get("name").and_then(|v| v.as_str()) else {
            continue;
        };
        let name = name.trim();
        if name.is_empty() {
            continue;
        }
        let default = manifest
            .themes
            .iter()
            .find(|t| t.id == id)
            .map(|t| t.name.as_str());
        // 与内置名相同 ⇒ 用户没改过，不记 rename（这样内置名以后还能随版本更新）
        if default != Some(name) && !cfg.renames.contains_key(&id) {
            cfg.renames.insert(id, name.to_string());
            changed = true;
        }
    }
    changed
}

fn import_legacy_css(
    src: &Path,
    builtin: &Path,
    user: &Path,
    manifest: &BuiltinManifest,
    trust_modified_builtin: bool,
    cfg: &mut UserThemes,
) -> Result<bool, String> {
    let Ok(entries) = fs::read_dir(src) else {
        return Ok(false);
    };
    let mut changed = false;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(id) = path
            .file_name()
            .and_then(|n| n.to_str())
            .and_then(|n| n.strip_suffix(".css"))
            .map(str::to_string)
        else {
            continue;
        };
        if !is_safe_id(&id) || is_reserved_id(&id) {
            continue;
        }

        let builtin_theme = manifest.themes.iter().find(|t| t.id == id);
        let (target, is_override) = match builtin_theme {
            Some(theme) => {
                // 就地模式（源目录 == 内置目录）：不把源文件当用户修改
                if !trust_modified_builtin {
                    continue;
                }
                let current = fs::read(builtin.join(theme_file_name(theme))).unwrap_or_default();
                let legacy = fs::read(&path).unwrap_or_default();
                if current == legacy {
                    continue; // 只是随包旧副本，丢弃
                }
                (overrides_dir(user).join(format!("{}.css", id)), true)
            }
            None => (custom_dir(user).join(format!("{}.css", id)), false),
        };

        if target.exists() {
            continue; // 用户层已有同 id 文件：绝不覆盖
        }
        fs::create_dir_all(target.parent().unwrap_or(user))
            .map_err(|e| format!("Failed to create theme dir: {}", e))?;
        fs::copy(&path, &target).map_err(|e| {
            format!(
                "Failed to import {} -> {}: {}",
                path.display(),
                target.display(),
                e
            )
        })?;

        if is_override {
            let base = builtin_theme
                .map(|t| {
                    fs::read(builtin.join(theme_file_name(t)))
                        .map(|b| sha256_hex(&b))
                        .unwrap_or_default()
                })
                .unwrap_or_default();
            cfg.overrides.insert(id, OverrideInfo { base_sha256: base });
        }
        changed = true;
    }
    Ok(changed)
}

/// 用户层初始化 + 一次性迁移（幂等：`themes.user.json` 存在时不再导入）。
pub fn sync_theme_layer_at(builtin: &Path, user: &Path) -> Result<(), String> {
    let manifest = load_manifest(builtin)?;
    fs::create_dir_all(custom_dir(user))
        .map_err(|e| format!("Failed to create themes dir: {}", e))?;
    fs::create_dir_all(overrides_dir(user))
        .map_err(|e| format!("Failed to create themes dir: {}", e))?;

    let json_path = user_json_path(user);
    let first_run = !json_path.exists();
    let mut cfg = load_user_cfg(&json_path);
    let mut changed = first_run;

    if first_run {
        let legacy = user.join("legacy-import");
        let (src, trust_modified) = if legacy.is_dir() && dir_has_entries(&legacy) {
            (Some(legacy), true)
        } else if builtin.join("theme.json").is_file() {
            (Some(builtin.to_path_buf()), false)
        } else {
            (None, false)
        };
        if let Some(src) = src {
            if import_legacy_renames(&src, &manifest, &mut cfg) {
                changed = true;
            }
            if import_legacy_css(&src, builtin, user, &manifest, trust_modified, &mut cfg)? {
                changed = true;
            }
        }
    }

    if changed || !json_path.exists() {
        write_user_cfg(&json_path, &cfg)?;
    }
    Ok(())
}

/// 启动/读取目录时调用的入口（安装版路径）。
pub fn sync_theme_layer() -> Result<(), String> {
    let builtin = get_builtin_themes_dir()?;
    let user = get_user_themes_dir()?;
    sync_theme_layer_at(&builtin, &user)
}

/// 用户层是否尚未初始化（`themes.user.json` 不存在）。
///
/// 必须在 `sync_theme_layer()` **之前**调用：那次调用会写出该文件，之后永远是 false。
/// 启动流程用它判断「本次启动是不是首次迁移」，避免把关停已久的安装目录旧副本当用户改动反复导入。
pub fn user_layer_is_new() -> Result<bool, String> {
    Ok(!user_json_path(&get_user_themes_dir()?).exists())
}

// ===== 目录 =====

fn scan_user_custom(user: &Path) -> Vec<String> {
    let Ok(entries) = fs::read_dir(custom_dir(user)) else {
        return Vec::new();
    };
    let mut ids: Vec<String> = entries
        .flatten()
        .filter_map(|e| {
            let path = e.path();
            if !path.is_file() {
                return None;
            }
            path.file_name()
                .and_then(|n| n.to_str())
                .and_then(|n| n.strip_suffix(".css"))
                .filter(|id| is_safe_id(id) && !is_reserved_id(id))
                .map(str::to_string)
        })
        .collect();
    ids.sort();
    ids
}

/// 合并内置清单 + 用户层，得到前端唯一的数据源。
pub fn build_catalog_at(builtin: &Path, user: &Path) -> Result<ThemeCatalog, String> {
    let manifest = load_manifest(builtin)?;
    let cfg = load_user_cfg(&user_json_path(user));
    let hidden: BTreeSet<&str> = cfg.hidden.iter().map(String::as_str).collect();
    let mut entries: Vec<ThemeEntry> = Vec::new();
    let mut known: BTreeSet<String> = BTreeSet::new();

    for theme in &manifest.themes {
        known.insert(theme.id.clone());
        if hidden.contains(theme.id.as_str()) || is_reserved_id(&theme.id) {
            continue;
        }
        let builtin_path = builtin.join(theme_file_name(theme));
        let override_path = overrides_dir(user).join(format!("{}.css", theme.id));
        let custom_path = custom_dir(user).join(format!("{}.css", theme.id));

        let (source, has_update) = if override_path.is_file() {
            let current = fs::read(&builtin_path)
                .map(|b| sha256_hex(&b))
                .unwrap_or_default();
            let base = cfg
                .overrides
                .get(&theme.id)
                .map(|o| o.base_sha256.clone())
                .unwrap_or_default();
            // base 为空 = 来源未知（旧手动 override）：不提示更新，避免误报
            (
                "override".to_string(),
                !base.is_empty() && !current.is_empty() && base != current,
            )
        } else if custom_path.is_file() {
            ("custom".to_string(), false)
        } else {
            ("builtin".to_string(), false)
        };

        entries.push(ThemeEntry {
            id: theme.id.clone(),
            name: cfg
                .renames
                .get(&theme.id)
                .cloned()
                .unwrap_or_else(|| theme.name.clone()),
            desc: theme.desc.clone(),
            swatch: if theme.swatch.is_empty() {
                default_swatch()
            } else {
                theme.swatch.clone()
            },
            source,
            has_update,
        });
    }

    // 清单外的自建主题（`custom/` 里 id 不与内置重名的）
    for id in scan_user_custom(user) {
        if known.contains(&id) || hidden.contains(id.as_str()) {
            continue;
        }
        entries.push(ThemeEntry {
            id: id.clone(),
            name: cfg.renames.get(&id).cloned().unwrap_or_else(|| id.clone()),
            desc: String::new(),
            swatch: default_swatch(),
            source: "custom".to_string(),
            has_update: false,
        });
    }

    // 自定义排序：未列出的保持原序（sort_by_key 是稳定排序）
    if !cfg.order.is_empty() {
        entries.sort_by_key(|e| {
            cfg.order
                .iter()
                .position(|id| id == &e.id)
                .unwrap_or(usize::MAX)
        });
    }

    Ok(ThemeCatalog {
        schema: USER_THEME_SCHEMA,
        themes: entries,
        user_dir: user.to_string_lossy().to_string(),
        builtin_dir: builtin.to_string_lossy().to_string(),
    })
}

fn resolve_theme_css_path(
    builtin: &Path,
    user: &Path,
    manifest: &BuiltinManifest,
    id: &str,
) -> Option<PathBuf> {
    let override_path = overrides_dir(user).join(format!("{}.css", id));
    if override_path.is_file() {
        return Some(override_path);
    }
    let custom_path = custom_dir(user).join(format!("{}.css", id));
    if custom_path.is_file() {
        return Some(custom_path);
    }
    if let Some(theme) = manifest.themes.iter().find(|t| t.id == id) {
        let path = builtin.join(theme_file_name(theme));
        if path.is_file() {
            return Some(path);
        }
    }
    let path = builtin.join(format!("{}.css", id));
    if path.is_file() {
        return Some(path);
    }
    None
}

/// 解析顺序：用户 override → 用户自建 → 内置。
fn read_theme_css_at(builtin: &Path, user: &Path, raw_id: &str) -> Result<String, String> {
    let id = normalize_theme_id(raw_id).ok_or_else(|| format!("Invalid theme name: {}", raw_id))?;
    let manifest = load_manifest(builtin)?;
    let path = resolve_theme_css_path(builtin, user, &manifest, &id)
        .ok_or_else(|| format!("Theme not found: {}", id))?;
    fs::read_to_string(&path).map_err(|e| format!("Failed to read theme: {}", e))
}

fn rename_theme_at(builtin: &Path, user: &Path, id: &str, name: &str) -> Result<(), String> {
    if !is_safe_id(id) || is_reserved_id(id) {
        return Err(format!("Invalid theme id: {}", id));
    }
    let manifest = load_manifest(builtin)?;
    let known = manifest.themes.iter().any(|t| t.id == id);
    let custom_exists = custom_dir(user).join(format!("{}.css", id)).is_file();
    if !known && !custom_exists {
        return Err(format!("Theme not found: {}", id));
    }

    let default_name = manifest
        .themes
        .iter()
        .find(|t| t.id == id)
        .map(|t| t.name.clone())
        .unwrap_or_else(|| id.to_string());

    let json_path = user_json_path(user);
    let mut cfg = load_user_cfg(&json_path);
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed == default_name {
        cfg.renames.remove(id);
    } else {
        cfg.renames.insert(id.to_string(), trimmed.to_string());
    }
    write_user_cfg(&json_path, &cfg)
}

fn resolve_theme_update_at(
    builtin: &Path,
    user: &Path,
    id: &str,
    use_builtin: bool,
) -> Result<(), String> {
    if !is_safe_id(id) || is_reserved_id(id) {
        return Err(format!("Invalid theme id: {}", id));
    }
    let manifest = load_manifest(builtin)?;
    let theme = manifest
        .themes
        .iter()
        .find(|t| t.id == id)
        .ok_or_else(|| format!("Theme not found: {}", id))?;

    let json_path = user_json_path(user);
    let mut cfg = load_user_cfg(&json_path);

    if use_builtin {
        // 用户选择跟随后：删掉用户层同名副本，目录解析自然回落到内置
        let _ = fs::remove_file(overrides_dir(user).join(format!("{}.css", id)));
        let _ = fs::remove_file(custom_dir(user).join(format!("{}.css", id)));
        cfg.overrides.remove(id);
    } else {
        let current = fs::read(builtin.join(theme_file_name(theme)))
            .map(|b| sha256_hex(&b))
            .unwrap_or_default();
        if current.is_empty() {
            return Err(format!("Built-in theme missing: {}", id));
        }
        cfg.overrides.insert(
            id.to_string(),
            OverrideInfo {
                base_sha256: current,
            },
        );
    }
    write_user_cfg(&json_path, &cfg)
}

// ===== Tauri 命令 =====

/// 前端唯一主题数据源：内置清单 + 用户层合并结果（含「有新版本」标记）。
#[tauri::command]
pub fn get_theme_catalog() -> Result<ThemeCatalog, String> {
    let builtin = get_builtin_themes_dir()?;
    let user = get_user_themes_dir()?;
    // 迁移失败不阻塞界面：内置主题仍可读，用户层下次启动会再试
    if let Err(e) = sync_theme_layer_at(&builtin, &user) {
        eprintln!("[themes] sync failed: {}", e);
    }
    build_catalog_at(&builtin, &user)
}

/// 兼容旧调用方：返回 `<id>.css` 列表（顺序与目录一致）。
#[tauri::command]
pub fn list_themes() -> Result<Vec<String>, String> {
    let builtin = get_builtin_themes_dir()?;
    let user = get_user_themes_dir()?;
    let catalog = build_catalog_at(&builtin, &user)?;
    Ok(catalog
        .themes
        .iter()
        .map(|t| format!("{}.css", t.id))
        .collect())
}

#[tauri::command]
pub fn read_theme_css(name: String) -> Result<String, String> {
    let id = normalize_theme_id(&name).ok_or_else(|| format!("Invalid theme name: {}", name))?;
    let builtin = get_builtin_themes_dir()?;
    let user = get_user_themes_dir()?;
    read_theme_css_at(&builtin, &user, &id)
}

/// 兼容旧调用方：把合并目录转成 `{ id: { name, desc, swatch } }`。
#[tauri::command]
pub fn read_theme_json() -> Result<String, String> {
    let catalog = get_theme_catalog()?;
    let mut map = serde_json::Map::new();
    for entry in catalog.themes {
        map.insert(
            entry.id,
            serde_json::json!({
                "name": entry.name,
                "desc": entry.desc,
                "swatch": entry.swatch,
            }),
        );
    }
    Ok(serde_json::Value::Object(map).to_string())
}

/// 改名写入用户层（不再碰安装目录）。
#[tauri::command]
pub fn rename_theme(id: String, name: String) -> Result<(), String> {
    let builtin = get_builtin_themes_dir()?;
    let user = get_user_themes_dir()?;
    rename_theme_at(&builtin, &user, &id, &name)
}

/// 解决「内置主题有新版本」：`use_builtin=true` 用内置新版，`false` 保留用户修改并清掉提示。
#[tauri::command]
pub fn resolve_theme_update(id: String, use_builtin: bool) -> Result<(), String> {
    let builtin = get_builtin_themes_dir()?;
    let user = get_user_themes_dir()?;
    resolve_theme_update_at(&builtin, &user, &id, use_builtin)
}

// ===== 测试 =====

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static SEQ: AtomicUsize = AtomicUsize::new(0);

    struct TempDir(PathBuf);

    impl TempDir {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "yizi-theme-layer-test-{}-{}",
                std::process::id(),
                SEQ.fetch_add(1, Ordering::SeqCst)
            ));
            let _ = fs::remove_dir_all(&path);
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
        fn builtin(&self) -> PathBuf {
            self.0.join("builtin")
        }
        fn user(&self) -> PathBuf {
            self.0.join("user")
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn write(path: &Path, content: &str) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, content).unwrap();
    }

    fn setup_builtin(root: &Path, tech_css: &str, academic_css: &str) {
        write(
            &root.join("builtin.json"),
            r##"{
              "schema": 1,
              "themes": [
                { "id": "academic", "file": "academic.css", "name": "Academic", "desc": "A", "swatch": ["#fff", "#000"] },
                { "id": "tech", "file": "tech.css", "name": "Tech", "desc": "T", "swatch": ["#111", "#222"] }
              ]
            }"##,
        );
        write(&root.join("academic.css"), academic_css);
        write(&root.join("tech.css"), tech_css);
    }

    #[test]
    fn catalog_orders_and_applies_user_layer() {
        let tmp = TempDir::new();
        let (builtin, user) = (tmp.builtin(), tmp.user());
        setup_builtin(&builtin, "tech-body", "academic-body");
        write(&user.join("custom").join("mine.css"), ":root{--x:1}");
        write(&user.join("overrides").join("tech.css"), "tech-user-body");

        let cfg = UserThemes {
            renames: BTreeMap::from([
                ("tech".to_string(), "我的科技".to_string()),
                ("mine".to_string(), "我的主题".to_string()),
            ]),
            order: vec!["mine".to_string(), "tech".to_string()],
            hidden: vec![],
            ..Default::default()
        };
        write_user_cfg(&user_json_path(&user), &cfg).unwrap();

        let catalog = build_catalog_at(&builtin, &user).unwrap();
        assert_eq!(
            catalog.themes.iter().map(|t| t.id.as_str()).collect::<Vec<_>>(),
            vec!["mine", "tech", "academic"]
        );
        let tech = catalog.themes.iter().find(|t| t.id == "tech").unwrap();
        assert_eq!(tech.name, "我的科技");
        assert_eq!(tech.source, "override");
        assert!(!tech.has_update); // base 未知 ⇒ 不误报
        let mine = catalog.themes.iter().find(|t| t.id == "mine").unwrap();
        assert_eq!(mine.name, "我的主题");
        assert_eq!(mine.source, "custom");
    }

    #[test]
    fn hidden_themes_are_filtered() {
        let tmp = TempDir::new();
        let (builtin, user) = (tmp.builtin(), tmp.user());
        setup_builtin(&builtin, "t", "a");
        let cfg = UserThemes {
            hidden: vec!["academic".to_string()],
            ..Default::default()
        };
        write_user_cfg(&user_json_path(&user), &cfg).unwrap();
        let catalog = build_catalog_at(&builtin, &user).unwrap();
        assert_eq!(catalog.themes.len(), 1);
        assert_eq!(catalog.themes[0].id, "tech");
    }

    #[test]
    fn sync_migrates_renames_modified_css_and_custom_theme() {
        let tmp = TempDir::new();
        let (builtin, user) = (tmp.builtin(), tmp.user());
        setup_builtin(&builtin, "tech-v1", "academic-v1");

        // 旧安装目录打包出来的 theme.json（用户把 tech 改名了）
        write(
            &builtin.join("theme.json"),
            r#"{ "tech": { "name": "我的科技" }, "academic": { "name": "Academic" } }"#,
        );

        // NSIS 预安装钩子的备份：tech.css 被用户改过，另有一个自建主题
        let legacy = user.join("legacy-import");
        write(&legacy.join("theme.json"), r#"{ "tech": { "name": "我的科技" } }"#);
        write(&legacy.join("tech.css"), "tech-user-modified");
        write(&legacy.join("academic.css"), "academic-v1"); // 未改过：与内置相同
        write(&legacy.join("mine.css"), ":root{--x:1}");

        sync_theme_layer_at(&builtin, &user).unwrap();

        assert!(user_json_path(&user).is_file());
        let cfg = load_user_cfg(&user_json_path(&user));
        assert_eq!(cfg.renames.get("tech").map(String::as_str), Some("我的科技"));
        assert!(cfg.renames.get("academic").is_none());
        assert_eq!(
            fs::read_to_string(user.join("overrides").join("tech.css")).unwrap(),
            "tech-user-modified"
        );
        assert!(!user.join("overrides").join("academic.css").exists());
        assert_eq!(
            fs::read_to_string(user.join("custom").join("mine.css")).unwrap(),
            ":root{--x:1}"
        );
        // 旧的 override 基准 = 当前内置哈希 ⇒ 无「新版」提示
        assert_eq!(cfg.overrides.get("tech").unwrap().base_sha256, sha256_hex(b"tech-v1"));

        // 第二次运行完全幂等
        sync_theme_layer_at(&builtin, &user).unwrap();
        let cfg2 = load_user_cfg(&user_json_path(&user));
        assert_eq!(cfg2.renames, cfg.renames);
        assert_eq!(cfg2.overrides, cfg.overrides);

        // 内置升级后 ⇒ hasUpdate
        write(&builtin.join("tech.css"), "tech-v2");
        let catalog = build_catalog_at(&builtin, &user).unwrap();
        let tech = catalog.themes.iter().find(|t| t.id == "tech").unwrap();
        assert!(tech.has_update);
    }

    #[test]
    fn sync_does_not_overwrite_existing_user_files() {
        let tmp = TempDir::new();
        let (builtin, user) = (tmp.builtin(), tmp.user());
        setup_builtin(&builtin, "tech-v1", "academic-v1");
        // 已迁移过：themes.user.json 存在
        write_user_cfg(&user_json_path(&user), &UserThemes::default()).unwrap();
        write(&user.join("overrides").join("tech.css"), "mine");
        write(&user.join("custom").join("mine.css"), "mine-custom");

        let legacy = user.join("legacy-import");
        write(&legacy.join("tech.css"), "stale-backup");
        write(&legacy.join("mine.css"), "stale");

        sync_theme_layer_at(&builtin, &user).unwrap();

        assert_eq!(
            fs::read_to_string(user.join("overrides").join("tech.css")).unwrap(),
            "mine"
        );
        assert_eq!(
            fs::read_to_string(user.join("custom").join("mine.css")).unwrap(),
            "mine-custom"
        );
    }

    #[test]
    fn resolve_update_keep_and_adopt() {
        let tmp = TempDir::new();
        let (builtin, user) = (tmp.builtin(), tmp.user());
        setup_builtin(&builtin, "tech-v1", "academic-v1");
        write(&user.join("overrides").join("tech.css"), "user-tech");
        let cfg = UserThemes {
            overrides: BTreeMap::from([(
                "tech".to_string(),
                OverrideInfo {
                    base_sha256: sha256_hex(b"tech-old"),
                },
            )]),
            ..Default::default()
        };
        write_user_cfg(&user_json_path(&user), &cfg).unwrap();

        // 内置更新
        write(&builtin.join("tech.css"), "tech-v2");
        let catalog = build_catalog_at(&builtin, &user).unwrap();
        assert!(catalog.themes.iter().find(|t| t.id == "tech").unwrap().has_update);

        // 保留我的：清掉提示但不动 CSS
        resolve_theme_update_at(&builtin, &user, "tech", false).unwrap();
        let catalog = build_catalog_at(&builtin, &user).unwrap();
        assert!(!catalog.themes.iter().find(|t| t.id == "tech").unwrap().has_update);
        assert_eq!(
            fs::read_to_string(user.join("overrides").join("tech.css")).unwrap(),
            "user-tech"
        );

        // 使用内置新版：删除 override，回落到内置
        resolve_theme_update_at(&builtin, &user, "tech", true).unwrap();
        let catalog = build_catalog_at(&builtin, &user).unwrap();
        let tech = catalog.themes.iter().find(|t| t.id == "tech").unwrap();
        assert_eq!(tech.source, "builtin");
        assert!(!user.join("overrides").join("tech.css").exists());
    }

    #[test]
    fn rename_theme_removes_redundant_alias_and_rejects_paths() {
        let tmp = TempDir::new();
        let (builtin, user) = (tmp.builtin(), tmp.user());
        setup_builtin(&builtin, "t", "a");
        write_user_cfg(&user_json_path(&user), &UserThemes::default()).unwrap();

        rename_theme_at(&builtin, &user, "tech", "  我的科技  ").unwrap();
        assert_eq!(
            load_user_cfg(&user_json_path(&user))
                .renames
                .get("tech")
                .map(String::as_str),
            Some("我的科技")
        );

        // 改回内置名 ⇒ 删除 rename（未来内置改名仍能生效）
        rename_theme_at(&builtin, &user, "tech", "Tech").unwrap();
        assert!(!load_user_cfg(&user_json_path(&user)).renames.contains_key("tech"));

        assert!(rename_theme_at(&builtin, &user, "../evil", "x").is_err());
        assert!(rename_theme_at(&builtin, &user, "tech", "  ").is_ok()); // 空名 = 恢复内置名
    }

    #[test]
    fn css_resolution_prefers_user_layers() {
        let tmp = TempDir::new();
        let (builtin, user) = (tmp.builtin(), tmp.user());
        setup_builtin(&builtin, "tech-v1", "academic-v1");
        write(&user.join("custom").join("mine.css"), "mine-css");
        assert_eq!(read_theme_css_at(&builtin, &user, "tech").unwrap(), "tech-v1");
        assert_eq!(read_theme_css_at(&builtin, &user, "mine").unwrap(), "mine-css");

        write(&user.join("overrides").join("tech.css"), "tech-user");
        assert_eq!(read_theme_css_at(&builtin, &user, "tech").unwrap(), "tech-user");

        // 自建覆盖同名内置（custom/tech.css）也优先于内置
        fs::remove_file(user.join("overrides").join("tech.css")).unwrap();
        write(&user.join("custom").join("tech.css"), "tech-custom");
        assert_eq!(read_theme_css_at(&builtin, &user, "tech").unwrap(), "tech-custom");

        assert!(read_theme_css_at(&builtin, &user, "../tech").is_err());
        assert_eq!(normalize_theme_id("tech.css").as_deref(), Some("tech"));
    }
}
