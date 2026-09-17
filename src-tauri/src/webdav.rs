//! WebDAV 客户端（v0.3.0 云端存储）。
//!
//! 认证走 Basic（坚果云 / Nextcloud 均支持，通常配合应用专用密码）。
//! 凭据存 OS keychain，**绝不经过 IPC / localStorage**；服务器地址等非敏感项由前端传入。
//!
//! 关键约定：
//!   - `path` 一律是**相对配置根目录**的绝对路径（以 `/` 开头、内部保持解码后的字符串），
//!     如 `/Notes/笔记.md`；只在拼 URL 的最后一刻按段百分号编码。
//!   - 所有命令均为 `async` —— 网络 I/O 绝不碰主线程（v0.2.5 对话框死锁的教训）。
//!   - 目录 URL 一律带结尾 `/`，避免服务器 301 重定向把 PROPFIND 改成 GET。

use std::time::Duration;

use percent_encoding::{percent_decode_str, utf8_percent_encode, AsciiSet, CONTROLS};
use quick_xml::events::Event;
use quick_xml::Reader;
use once_cell::sync::Lazy;
use reqwest::header::{HeaderMap, HeaderValue, ETAG};
use reqwest::{Method, StatusCode, Url};
use serde::{Deserialize, Serialize};

use crate::ai_keystore;

// ---------------------------------------------------------------------------
// 凭据（OS keychain）
// ---------------------------------------------------------------------------

const ACCOUNT_USERNAME: &str = "webdav-username";
const ACCOUNT_PASSWORD: &str = "webdav-password";

#[tauri::command]
pub fn webdav_set_credentials(username: String, password: String) -> Result<(), String> {
    if username.trim().is_empty() {
        return Err("用户名不能为空".to_string());
    }
    ai_keystore::set_secret(ACCOUNT_USERNAME, username.trim())?;
    ai_keystore::set_secret(ACCOUNT_PASSWORD, &password)
}

#[tauri::command]
pub fn webdav_has_credentials() -> Result<bool, String> {
    Ok(ai_keystore::read_secret(ACCOUNT_USERNAME)?.is_some()
        && ai_keystore::read_secret(ACCOUNT_PASSWORD)?.is_some())
}

/// 回填设置界面用。密码永不回传。
#[tauri::command]
pub fn webdav_get_username() -> Result<Option<String>, String> {
    ai_keystore::read_secret(ACCOUNT_USERNAME)
}

#[tauri::command]
pub fn webdav_clear_credentials() -> Result<(), String> {
    ai_keystore::clear_secret(ACCOUNT_USERNAME)?;
    ai_keystore::clear_secret(ACCOUNT_PASSWORD)
}

// ---------------------------------------------------------------------------
// 数据结构
// ---------------------------------------------------------------------------

/// 列目录返回的一项。`path` 为相对配置根目录的解码后路径。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteEntry {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: Option<String>,
    pub etag: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadOutcome {
    pub content: String,
    pub etag: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveOutcome {
    /// 远程已被他人修改（If-Match 失败，HTTP 412）
    pub conflict: bool,
    pub etag: Option<String>,
}

// ---------------------------------------------------------------------------
// HTTP 客户端
// ---------------------------------------------------------------------------

/// 全局复用连接池 —— 镜像一个文档的图片会连发多次请求。
/// `expect` 是安全的：reqwest 在默认 TLS 后端下构建客户端不会失败。
static CLIENT: Lazy<reqwest::Client> = Lazy::new(|| {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(20))
        .timeout(Duration::from_secs(120))
        .user_agent(concat!("YiziMarkdown/", env!("CARGO_PKG_VERSION")))
        .build()
        .expect("failed to build WebDAV HTTP client")
});

/// 列目录响应体上限：正常远小于此值，防呆用。
const MAX_XML_BYTES: usize = 8 * 1024 * 1024;

/// 构造 WebDAV 方法。http 1.x 没有这些常量，`reqwest` 也不限制自定义方法。
/// 传入的都是静态合法 token，故 `expect` 不可能触发。
fn method(name: &[u8]) -> Method {
    Method::from_bytes(name).expect("static WebDAV method token is valid")
}

// ---------------------------------------------------------------------------
// 路径与 URL
// ---------------------------------------------------------------------------

/// 路径段中需要百分号转义的 ASCII 字符。
/// 保留 RFC 3986 的 unreserved 与 sub-delims（以及 `:` `@`）；
/// 额外转义 `/`（段内分隔符）与 `%`（转义引导符）。
/// 非 ASCII 字节由 `utf8_percent_encode` 无条件编码，故中文/日文等自然正确。
const PATH_SEGMENT: &AsciiSet = &CONTROLS
    .add(b' ')
    .add(b'"')
    .add(b'#')
    .add(b'%')
    .add(b'/')
    .add(b'<')
    .add(b'>')
    .add(b'?')
    .add(b'[')
    .add(b'\\')
    .add(b']')
    .add(b'^')
    .add(b'`')
    .add(b'{')
    .add(b'|')
    .add(b'}')
    .add(b'\x7f');

/// 把 base URL 规范化为 `Url`（必须是 http/https 且能追加路径）。
fn parse_base(base_url: &str) -> Result<Url, String> {
    let trimmed = base_url.trim();
    if trimmed.is_empty() {
        return Err("WebDAV 服务器地址未填写".to_string());
    }
    let url = Url::parse(trimmed).map_err(|e| format!("服务器地址无效「{trimmed}」：{e}"))?;
    match url.scheme() {
        "http" | "https" => {}
        other => return Err(format!("服务器地址必须是 http/https，当前为「{other}」")),
    }
    // http/https 属 WHATWG「特殊 scheme」，`Url::parse` 已强制要求非空主机名，
    // 故此处无需再校验 host。
    Ok(url)
}

/// base URL 的路径前缀（无结尾斜杠），用于把服务器返回的 href 剥回相对路径。
/// 例：`https://dav.jianguoyun.com/dav/` → `/dav`；`https://host/` → ``
fn base_path_prefix(base: &Url) -> String {
    let p = base.path().trim_end_matches('/');
    p.to_string()
}

/// 用 base URL + 相对路径拼出请求 URL。
/// 逐段百分号编码后交给 `Url::parse` —— WHATWG 解析器在 path 状态下放行 `%`，
/// 因此已编码序列不会被二次编码（中文名只编码一次）。
fn build_url(base: &Url, path: &str, is_dir: bool) -> Result<Url, String> {
    let mut s = base.as_str().trim_end_matches('/').to_string();
    for seg in path.split('/').filter(|s| !s.is_empty()) {
        s.push('/');
        s.push_str(&utf8_percent_encode(seg, PATH_SEGMENT).to_string());
    }
    if s.is_empty() {
        s.push('/');
    }
    // 目录 URL 以 '/' 结尾（部分服务器会 301，进而把 PROPFIND 变成 GET）
    if (is_dir || path.ends_with('/')) && !s.ends_with('/') {
        s.push('/');
    }
    Url::parse(&s).map_err(|e| format!("拼接 URL 失败「{s}」：{e}"))
}

/// 服务器返回的 `<href>` → 相对配置根目录的解码后路径。
/// href 可能是绝对 URL（`https://host/dav/Notes/`）也可能是绝对路径（`/dav/Notes/`）。
fn href_to_remote_path(href: &str, base_path: &str) -> String {
    // 先按编码态处理（base_path 是 URL 里的 ASCII 路径，编码态比较才一致），最后再解码
    let raw_path = if href.starts_with("http://") || href.starts_with("https://") {
        Url::parse(href)
            .map(|u| u.path().to_string())
            .unwrap_or_else(|_| href.to_string())
    } else {
        href.to_string()
    };
    let rest = if base_path.is_empty() {
        raw_path.as_str()
    } else {
        raw_path.strip_prefix(base_path).unwrap_or(raw_path.as_str())
    };
    let decoded = percent_decode_str(rest).decode_utf8_lossy().into_owned();
    format!("/{}", decoded.trim_start_matches('/'))
}

/// 归一化比较用：去掉结尾斜杠（根路径保持 `/`）。
fn norm_path(p: &str) -> String {
    let t = p.trim_end_matches('/');
    if t.is_empty() {
        "/".to_string()
    } else {
        t.to_string()
    }
}

fn name_of(path: &str) -> String {
    path.trim_end_matches('/')
        .rsplit('/')
        .next()
        .unwrap_or("")
        .to_string()
}

// ---------------------------------------------------------------------------
// multistatus 解析
// ---------------------------------------------------------------------------

/// PROPFIND 请求体：只要这 4 个属性。
const PROPFIND_BODY: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:"><d:prop>
<d:resourcetype/><d:getcontentlength/><d:getlastmodified/><d:getetag/>
</d:prop></d:propfind>"#;

/// 解析中的一个条目（href 尚未剥离 base 前缀）。
#[derive(Debug, Clone, Default, PartialEq)]
struct RawEntry {
    href: String,
    is_dir: bool,
    size: Option<u64>,
    modified: Option<String>,
    etag: Option<String>,
}

#[derive(Clone, Copy, PartialEq)]
enum Field {
    Href,
    Size,
    Modified,
    Etag,
}

/// 解析 207 Multi-Status 响应体。
///
/// 三个必须遵守的规则：
///   1. **绝不匹配命名空间前缀** —— 服务器会发 `D:` / `d:` / `lp1:` / `ns0:` 或无前缀，
///      一律按 local name 匹配（所有真实客户端都这么做）。
///   2. **合并同一 `<response>` 下的所有 `<propstat>`** —— Apache mod_dav 等会把命中/
///      未命中的属性拆到 200 与 404 两个 propstat，只读第一个会丢掉 `resourcetype`
///      从而把目录误判成文件。本实现不关心 propstat 边界，天然满足。
///   3. **文本要累积、不能覆盖** —— quick-xml 把 `&amp;` 这类实体作为独立的
///      `Event::GeneralRef` 发出，`a&amp;b.md` 会被拆成 Text("a") + GeneralRef("amp") +
///      Text("b.md")。逐段赋值只会留下最后一段（曾经的真实 bug）。
fn parse_multistatus(xml: &str) -> Result<Vec<RawEntry>, String> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut entries: Vec<RawEntry> = Vec::new();
    let mut cur: Option<RawEntry> = None;
    let mut field: Option<Field> = None;
    let mut buf = String::new();
    let mut in_resourcetype = false;
    // 未闭合元素计数：截断的响应会留下非零值，避免把半截目录当成完整列表
    let mut depth: i32 = 0;
    let mut saw_multistatus = false;

    loop {
        match reader.read_event() {
            Ok(Event::Start(e)) => {
                depth += 1;
                let n = e.local_name();
                match n.as_ref() {
                    b"multistatus" => saw_multistatus = true,
                    b"response" => cur = Some(RawEntry::default()),
                    b"resourcetype" => in_resourcetype = true,
                    // `<D:collection></D:collection>` 非自闭合写法
                    b"collection" if in_resourcetype => mark_collection(&mut cur),
                    b"href" => start_field(&mut field, &mut buf, Field::Href),
                    b"getcontentlength" => start_field(&mut field, &mut buf, Field::Size),
                    b"getlastmodified" => start_field(&mut field, &mut buf, Field::Modified),
                    b"getetag" => start_field(&mut field, &mut buf, Field::Etag),
                    _ => {}
                }
            }
            Ok(Event::Empty(e)) => {
                // `<D:collection/>` 自闭合写法
                let n = e.local_name();
                if n.as_ref() == b"collection" && in_resourcetype {
                    mark_collection(&mut cur);
                }
            }
            Ok(Event::Text(t)) => {
                if field.is_some() {
                    let raw = t
                        .decode()
                        .map_err(|e| format!("multistatus 文本解码失败：{e}"))?;
                    buf.push_str(raw.as_ref());
                }
            }
            Ok(Event::GeneralRef(r)) => {
                if field.is_some() {
                    let raw = r
                        .decode()
                        .map_err(|e| format!("multistatus 实体解码失败：{e}"))?;
                    buf.push_str(&resolve_ref(raw.as_ref()));
                }
            }
            Ok(Event::End(e)) => {
                depth -= 1;
                let n = e.local_name();
                match n.as_ref() {
                    b"response" => {
                        if let Some(entry) = cur.take() {
                            entries.push(entry);
                        }
                    }
                    b"resourcetype" => in_resourcetype = false,
                    b"href" | b"getcontentlength" | b"getlastmodified" | b"getetag" => {
                        commit_field(&mut cur, field, &buf);
                        field = None;
                    }
                    _ => {}
                }
            }
            Ok(Event::Eof) => break,
            Ok(_) => {}
            Err(e) => return Err(format!("multistatus XML 解析失败：{e}")),
        }
    }

    // 服务器/代理返回 200 + HTML 错误页是真实场景（登录页、网关拦截）。
    // 不校验的话会被当成"空目录"，掩盖真实故障。
    if !saw_multistatus {
        let snippet: String = xml.trim().chars().take(160).collect();
        return Err(format!(
            "响应不是有效的 WebDAV multistatus（可能被代理或登录页拦截）：{snippet}"
        ));
    }
    if depth != 0 {
        return Err(format!("multistatus 响应不完整（有 {depth} 个元素未闭合）"));
    }
    Ok(entries)
}

fn start_field(field: &mut Option<Field>, buf: &mut String, f: Field) {
    *field = Some(f);
    buf.clear();
}

/// 把累积的文本提交到当前条目的对应字段。
fn commit_field(cur: &mut Option<RawEntry>, field: Option<Field>, buf: &str) {
    let (Some(entry), Some(f)) = (cur.as_mut(), field) else {
        return;
    };
    let text = buf.trim();
    match f {
        Field::Href => entry.href = text.to_string(),
        Field::Size => entry.size = text.parse().ok(),
        Field::Modified if !text.is_empty() => entry.modified = Some(text.to_string()),
        Field::Etag if !text.is_empty() => entry.etag = Some(text.to_string()),
        _ => {}
    }
}

/// 解析实体引用名：5 个预定义实体 + 十进制/十六进制字符引用。
/// WebDAV 不定义自定义实体，未知实体原样保留以免丢字符。
fn resolve_ref(name: &str) -> String {
    match name {
        "amp" => return "&".to_string(),
        "lt" => return "<".to_string(),
        "gt" => return ">".to_string(),
        "quot" => return "\"".to_string(),
        "apos" => return "'".to_string(),
        _ => {}
    }
    let codepoint = name
        .strip_prefix("#x")
        .or_else(|| name.strip_prefix("#X"))
        .and_then(|hex| u32::from_str_radix(hex, 16).ok())
        .or_else(|| name.strip_prefix('#').and_then(|dec| dec.parse().ok()));
    match codepoint.and_then(char::from_u32) {
        Some(c) => c.to_string(),
        None => format!("&{name};"),
    }
}

fn mark_collection(cur: &mut Option<RawEntry>) {
    if let Some(entry) = cur.as_mut() {
        entry.is_dir = true;
    }
}

// ---------------------------------------------------------------------------
// 连接
// ---------------------------------------------------------------------------

pub(crate) struct Conn {
    base: Url,
    base_path: String,
    username: String,
    password: String,
}

impl Conn {
    /// 用显式凭据构造（测试与需要绕开 keychain 的场景）。
    pub(crate) fn new(base_url: &str, username: String, password: String) -> Result<Self, String> {
        let base = parse_base(base_url)?;
        let base_path = base_path_prefix(&base);
        Ok(Self {
            base,
            base_path,
            username,
            password,
        })
    }

    /// 从 keychain 取凭据；缺凭据时给出可操作的中文提示。
    pub(crate) fn from_keychain(base_url: &str) -> Result<Self, String> {
        let username = ai_keystore::read_secret(ACCOUNT_USERNAME)?
            .filter(|u| !u.trim().is_empty())
            .ok_or_else(|| "尚未配置 WebDAV 账号，请先在「设置 → 云端存储」中填写".to_string())?;
        let password = ai_keystore::read_secret(ACCOUNT_PASSWORD)?.unwrap_or_default();
        Self::new(base_url, username, password)
    }

    fn url(&self, path: &str, is_dir: bool) -> Result<Url, String> {
        build_url(&self.base, path, is_dir)
    }

    /// 发一个 WebDAV 请求。返回 (状态码, 响应头, 响应体)。
    async fn dav(
        &self,
        method: Method,
        url: &Url,
        depth: Option<&str>,
        extra: Vec<(&'static str, String)>,
        body: Option<Vec<u8>>,
    ) -> Result<(StatusCode, HeaderMap, Vec<u8>), String> {
        let mut rb = CLIENT
            .request(method.clone(), url.clone())
            .basic_auth(&self.username, Some(&self.password));
        if let Some(d) = depth {
            rb = rb.header("Depth", d);
        }
        for (k, v) in extra {
            rb = rb.header(k, v);
        }
        if let Some(b) = body {
            rb = rb.body(b);
        }

        let resp = rb.send().await.map_err(|e| {
            format!(
                "无法连接服务器（{method} {}）：{e}",
                url.as_str()
            )
        })?;
        let status = resp.status();
        let headers = resp.headers().clone();

        if let Some(len) = resp.content_length() {
            if len as usize > MAX_XML_BYTES {
                return Err(format!("服务器响应过大（{len} 字节），已中止"));
            }
        }
        let bytes = resp
            .bytes()
            .await
            .map_err(|e| format!("读取响应失败：{e}"))?
            .to_vec();
        Ok((status, headers, bytes))
    }

    /// 把失败状态码翻成用户可读的中文原因。
    fn describe(&self, status: StatusCode, method: &Method, path: &str, headers: &HeaderMap, body: &[u8]) -> String {
        let hint = match status.as_u16() {
            401 => {
                // 服务器可能要求 Digest（本客户端只支持 Basic），明确指出以便用户换应用密码
                let www = headers
                    .get("www-authenticate")
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("");
                if www.to_ascii_lowercase().contains("digest") {
                    "认证失败：服务器要求 Digest 认证（暂不支持）。请改用应用专用密码，或改用支持 Basic 的地址"
                        .to_string()
                } else {
                    "认证失败：用户名或密码错误。多数服务（坚果云 / Nextcloud）需使用「应用专用密码」而非登录密码"
                        .to_string()
                }
            }
            403 => "没有权限访问该路径（可能需要应用专用密码，或该目录不可写）".to_string(),
            404 => "路径不存在".to_string(),
            405 => format!("服务器不支持 {method} 方法"),
            409 => "父目录不存在（请先创建上级文件夹）".to_string(),
            412 => "远程文件已被他人修改".to_string(),
            423 => "文件被服务器锁定，请稍后重试".to_string(),
            507 => "服务器存储空间不足".to_string(),
            _ => String::new(),
        };
        let detail = if hint.is_empty() {
            let text = String::from_utf8_lossy(body);
            let snippet: String = text.chars().take(200).collect();
            if snippet.trim().is_empty() {
                String::new()
            } else {
                format!("：{}", snippet.trim())
            }
        } else {
            format!("：{hint}")
        };
        format!("{method} {path} 返回 {status}{detail}")
    }

    /// 2xx 与 207 都算成功。
    fn is_ok(status: StatusCode) -> bool {
        status.is_success() || status.as_u16() == 207
    }

    async fn list(&self, path: &str) -> Result<Vec<RemoteEntry>, String> {
        let url = self.url(path, true)?;
        let pf = method(b"PROPFIND");
        let (status, headers, body) = self
            .dav(
                pf.clone(),
                &url,
                Some("1"),
                vec![("Content-Type", "application/xml; charset=utf-8".to_string())],
                Some(PROPFIND_BODY.as_bytes().to_vec()),
            )
            .await?;
        if !Self::is_ok(status) {
            return Err(self.describe(status, &pf, path, &headers, &body));
        }
        let xml = String::from_utf8_lossy(&body);
        let raws = parse_multistatus(&xml)?;

        let self_norm = norm_path(path);
        let mut out: Vec<RemoteEntry> = Vec::new();
        for raw in raws {
            if raw.href.is_empty() {
                continue;
            }
            let remote = href_to_remote_path(&raw.href, &self.base_path);
            // 跳过目录自身的条目
            if norm_path(&remote) == self_norm {
                continue;
            }
            out.push(RemoteEntry {
                name: name_of(&remote),
                path: remote,
                is_dir: raw.is_dir,
                size: raw.size.unwrap_or(0),
                modified: raw.modified,
                etag: raw.etag,
            });
        }
        // 目录在前，再按名称不区分大小写排序（与本地文件树一致）
        out.sort_by(|a, b| match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        });
        Ok(out)
    }

    pub(crate) async fn read(&self, path: &str) -> Result<ReadOutcome, String> {
        let url = self.url(path, false)?;
        let (status, headers, body) = self.dav(Method::GET, &url, None, vec![], None).await?;
        if !Self::is_ok(status) {
            return Err(self.describe(status, &Method::GET, path, &headers, &body));
        }
        let content = String::from_utf8(body)
            .map_err(|_| format!("{path} 不是有效的 UTF-8 文本文件"))?;
        Ok(ReadOutcome {
            content,
            etag: header_string(&headers, ETAG),
        })
    }

    /// 读取任意二进制内容（图片等），不做 UTF-8 校验。
    pub(crate) async fn read_bytes(&self, path: &str) -> Result<Vec<u8>, String> {
        let url = self.url(path, false)?;
        let (status, headers, body) = self.dav(Method::GET, &url, None, vec![], None).await?;
        if !Self::is_ok(status) {
            return Err(self.describe(status, &Method::GET, path, &headers, &body));
        }
        Ok(body)
    }

    /// 写文件。`expected_etag`：
    ///   - `Some(tag)` —— 更新已有文件，带 `If-Match`；远程被改过则返回 conflict
    ///   - `None` + `create=true` —— 新建，带 `If-None-Match: *`，已存在则冲突
    ///   - `None` + `create=false` —— 无条件覆盖（服务器不提供 ETag 时的降级）
    async fn write(
        &self,
        path: &str,
        content: &str,
        expected_etag: Option<&str>,
        create: bool,
    ) -> Result<SaveOutcome, String> {
        let url = self.url(path, false)?;
        let mut extra: Vec<(&'static str, String)> =
            vec![("Content-Type", "text/markdown; charset=utf-8".to_string())];
        if let Some(tag) = expected_etag {
            extra.push(("If-Match", tag.to_string()));
        } else if create {
            extra.push(("If-None-Match", "*".to_string()));
        }
        let (status, headers, body) = self
            .dav(
                Method::PUT,
                &url,
                None,
                extra,
                Some(content.as_bytes().to_vec()),
            )
            .await?;
        if status == StatusCode::PRECONDITION_FAILED {
            return Ok(SaveOutcome {
                conflict: true,
                etag: None,
            });
        }
        if !Self::is_ok(status) {
            return Err(self.describe(status, &Method::PUT, path, &headers, &body));
        }
        Ok(SaveOutcome {
            conflict: false,
            etag: header_string(&headers, ETAG),
        })
    }

    /// 递归建目录。已存在（405 / 409）视为成功，逐级创建（无递归 MKCOL）。
    pub(crate) async fn mkdir_all(&self, path: &str) -> Result<(), String> {
        let mkcol = method(b"MKCOL");
        let mut acc = String::new();
        for seg in path.split('/').filter(|s| !s.is_empty()) {
            acc.push('/');
            acc.push_str(seg);
            let url = self.url(&acc, true)?;
            let (status, headers, body) = self.dav(mkcol.clone(), &url, None, vec![], None).await?;
            // 405 = 已存在；409 = 父目录还没建好（不应发生，逐级创建保证）
            if Self::is_ok(status) || status == StatusCode::METHOD_NOT_ALLOWED {
                continue;
            }
            return Err(self.describe(status, &mkcol, &acc, &headers, &body));
        }
        Ok(())
    }

    async fn delete(&self, path: &str) -> Result<(), String> {
        let url = self.url(path, false)?;
        let (status, headers, body) = self.dav(Method::DELETE, &url, None, vec![], None).await?;
        // 404 视为已删除，保证幂等
        if Self::is_ok(status) || status == StatusCode::NOT_FOUND {
            return Ok(());
        }
        Err(self.describe(status, &Method::DELETE, path, &headers, &body))
    }

    async fn rename(&self, from: &str, to: &str) -> Result<(), String> {
        let url = self.url(from, false)?;
        let dest = self.url(to, false)?;
        let mv = method(b"MOVE");
        let (status, headers, body) = self
            .dav(
                mv.clone(),
                &url,
                None,
                vec![
                    // Destination 必须是绝对 URL 且已百分号编码
                    ("Destination", dest.as_str().to_string()),
                    ("Overwrite", "F".to_string()),
                ],
                None,
            )
            .await?;
        if Self::is_ok(status) {
            return Ok(());
        }
        if status == StatusCode::PRECONDITION_FAILED {
            return Err(format!("目标已存在：{to}"));
        }
        Err(self.describe(status, &mv, from, &headers, &body))
    }

    /// 上传二进制内容（图片等），无条件覆盖。
    /// 图片不做冲突检测 —— 文本正文的 ETag 才是用户编辑的并发单元。
    pub(crate) async fn write_bytes(&self, path: &str, bytes: Vec<u8>) -> Result<(), String> {
        let url = self.url(path, false)?;
        let ext = path.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
        let mime = match ext.as_str() {
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "gif" => "image/gif",
            "webp" => "image/webp",
            "svg" => "image/svg+xml",
            "bmp" => "image/bmp",
            "ico" => "image/x-icon",
            _ => "application/octet-stream",
        };
        let (status, headers, body) = self
            .dav(
                Method::PUT,
                &url,
                None,
                vec![("Content-Type", mime.to_string())],
                Some(bytes),
            )
            .await?;
        if Self::is_ok(status) {
            return Ok(());
        }
        Err(self.describe(status, &Method::PUT, path, &headers, &body))
    }

    /// Depth: 0 的单条元信息。不存在时返回 Ok(None)。
    pub(crate) async fn stat(&self, path: &str) -> Result<Option<RemoteEntry>, String> {
        let url = self.url(path, false)?;
        let pf = method(b"PROPFIND");
        let (status, headers, body) = self
            .dav(
                pf.clone(),
                &url,
                Some("0"),
                vec![("Content-Type", "application/xml; charset=utf-8".to_string())],
                Some(PROPFIND_BODY.as_bytes().to_vec()),
            )
            .await?;
        if status == StatusCode::NOT_FOUND {
            return Ok(None);
        }
        if !Self::is_ok(status) {
            return Err(self.describe(status, &pf, path, &headers, &body));
        }
        let xml = String::from_utf8_lossy(&body);
        Ok(parse_multistatus(&xml)?
            .into_iter()
            .next()
            .map(|raw| RemoteEntry {
                name: name_of(path),
                path: path.to_string(),
                is_dir: raw.is_dir,
                size: raw.size.unwrap_or(0),
                modified: raw.modified,
                etag: raw.etag,
            }))
    }
}

fn header_string(headers: &HeaderMap, name: reqwest::header::HeaderName) -> Option<String> {
    headers
        .get(name)
        .and_then(|v: &HeaderValue| v.to_str().ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

// ---------------------------------------------------------------------------
// Tauri 命令
// ---------------------------------------------------------------------------

/// 测试连通性 + 认证。成功返回以 `OK` 开头的字符串（前端按 `startsWith('OK')` 判定）。
#[tauri::command]
pub async fn webdav_test_connection(base_url: String) -> Result<String, String> {
    let conn = Conn::from_keychain(&base_url)?;
    let url = conn.url("/", true)?;
    let pf = method(b"PROPFIND");
    let (status, headers, body) = conn
        .dav(
            pf.clone(),
            &url,
            Some("0"),
            vec![("Content-Type", "application/xml; charset=utf-8".to_string())],
            Some(PROPFIND_BODY.as_bytes().to_vec()),
        )
        .await?;
    if Conn::is_ok(status) {
        return Ok(format!("OK · 连接成功（{}）", conn.base.host_str().unwrap_or("")));
    }
    if status == StatusCode::UNAUTHORIZED {
        return Err(conn.describe(status, &pf, "/", &headers, &body));
    }
    if status == StatusCode::NOT_FOUND {
        return Err(format!(
            "服务器返回 404：地址路径可能不正确。WebDAV 根地址通常需要以 /dav/ 结尾（例如坚果云 https://dav.jianguoyun.com/dav/）"
        ));
    }
    Err(conn.describe(status, &pf, "/", &headers, &body))
}

#[tauri::command]
pub async fn webdav_list(base_url: String, path: String) -> Result<Vec<RemoteEntry>, String> {
    Conn::from_keychain(&base_url)?.list(&path).await
}

/// 保存到云端的低层入口（不含图片同步）。高层编排见 `remote_cache::webdav_save`。
pub(crate) async fn save_text(
    base_url: &str,
    path: &str,
    content: &str,
    etag: Option<&str>,
    create: bool,
) -> Result<SaveOutcome, String> {
    Conn::from_keychain(base_url)?
        .write(path, content, etag, create)
        .await
}

#[tauri::command]
pub async fn webdav_mkdir(base_url: String, path: String) -> Result<(), String> {
    Conn::from_keychain(&base_url)?.mkdir_all(&path).await
}

#[tauri::command]
pub async fn webdav_delete(base_url: String, path: String) -> Result<(), String> {
    Conn::from_keychain(&base_url)?.delete(&path).await
}

#[tauri::command]
pub async fn webdav_move(base_url: String, from: String, to: String) -> Result<(), String> {
    Conn::from_keychain(&base_url)?.rename(&from, &to).await
}

// ---------------------------------------------------------------------------
// 测试
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn hrefs(xml: &str) -> Vec<String> {
        parse_multistatus(xml)
            .unwrap()
            .into_iter()
            .map(|e| e.href)
            .collect()
    }

    /// 同一份响应内容、四种命名空间前缀写法，必须解析出完全相同的结果。
    /// 这是本模块最重要的测试：服务器前缀无法预测。
    #[test]
    fn parses_multistatus_across_namespace_prefixes() {
        let bodies = [
            // D: 前缀
            r#"<?xml version="1.0"?><D:multistatus xmlns:D="DAV:">
                 <D:response><D:href>/dav/Notes/</D:href><D:propstat><D:prop>
                   <D:resourcetype><D:collection/></D:resourcetype>
                   <D:getlastmodified>Wed, 01 Jan 2025 00:00:00 GMT</D:getlastmodified>
                 </D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>
                 <D:response><D:href>/dav/Notes/a.md</D:href><D:propstat><D:prop>
                   <D:resourcetype/><D:getcontentlength>1234</D:getcontentlength>
                   <D:getetag>"abc"</D:getetag>
                 </D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>
               </D:multistatus>"#,
            // d: 小写前缀
            r#"<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">
                 <d:response><d:href>/dav/Notes/</d:href><d:propstat><d:prop>
                   <d:resourcetype><d:collection/></d:resourcetype>
                   <d:getlastmodified>Wed, 01 Jan 2025 00:00:00 GMT</d:getlastmodified>
                 </d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
                 <d:response><d:href>/dav/Notes/a.md</d:href><d:propstat><d:prop>
                   <d:resourcetype/><d:getcontentlength>1234</d:getcontentlength>
                   <d:getetag>"abc"</d:getetag>
                 </d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
               </d:multistatus>"#,
            // lp1: 前缀（Apache mod_dav 常见）
            r#"<?xml version="1.0"?><lp1:multistatus xmlns:lp1="DAV:">
                 <lp1:response><lp1:href>/dav/Notes/</lp1:href><lp1:propstat><lp1:prop>
                   <lp1:resourcetype><lp1:collection/></lp1:resourcetype>
                   <lp1:getlastmodified>Wed, 01 Jan 2025 00:00:00 GMT</lp1:getlastmodified>
                 </lp1:prop><lp1:status>HTTP/1.1 200 OK</lp1:status></lp1:propstat></lp1:response>
                 <lp1:response><lp1:href>/dav/Notes/a.md</lp1:href><lp1:propstat><lp1:prop>
                   <lp1:resourcetype/><lp1:getcontentlength>1234</lp1:getcontentlength>
                   <lp1:getetag>"abc"</lp1:getetag>
                 </lp1:prop><lp1:status>HTTP/1.1 200 OK</lp1:status></lp1:propstat></lp1:response>
               </lp1:multistatus>"#,
            // 默认命名空间，无前缀
            r#"<?xml version="1.0"?><multistatus xmlns="DAV:">
                 <response><href>/dav/Notes/</href><propstat><prop>
                   <resourcetype><collection/></resourcetype>
                   <getlastmodified>Wed, 01 Jan 2025 00:00:00 GMT</getlastmodified>
                 </prop><status>HTTP/1.1 200 OK</status></propstat></response>
                 <response><href>/dav/Notes/a.md</href><propstat><prop>
                   <resourcetype/><getcontentlength>1234</getcontentlength>
                   <getetag>"abc"</getetag>
                 </prop><status>HTTP/1.1 200 OK</status></propstat></response>
               </multistatus>"#,
        ];

        for xml in bodies {
            let parsed = parse_multistatus(xml).unwrap();
            assert_eq!(parsed.len(), 2, "应解析出 2 条：{xml}");
            assert_eq!(parsed[0].href, "/dav/Notes/");
            assert!(parsed[0].is_dir, "目录未被识别：{xml}");
            assert_eq!(
                parsed[0].modified.as_deref(),
                Some("Wed, 01 Jan 2025 00:00:00 GMT")
            );
            assert_eq!(parsed[1].href, "/dav/Notes/a.md");
            assert!(!parsed[1].is_dir);
            assert_eq!(parsed[1].size, Some(1234));
            assert_eq!(parsed[1].etag.as_deref(), Some("\"abc\""));
        }
    }

    /// 属性被拆到两个 propstat（200 命中 / 404 未命中）时，仍要拿到 resourcetype。
    #[test]
    fn merges_all_propstat_blocks_per_response() {
        let xml = r#"<?xml version="1.0"?><D:multistatus xmlns:D="DAV:">
            <D:response><D:href>/dav/Notes/</D:href>
              <D:propstat><D:prop><D:getcontentlength>0</D:getcontentlength></D:prop>
                <D:status>HTTP/1.1 200 OK</D:status></D:propstat>
              <D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype></D:prop>
                <D:status>HTTP/1.1 200 OK</D:status></D:propstat>
              <D:propstat><D:prop><D:getetag/></D:prop>
                <D:status>HTTP/1.1 404 Not Found</D:status></D:propstat>
            </D:response></D:multistatus>"#;
        let parsed = parse_multistatus(xml).unwrap();
        assert_eq!(parsed.len(), 1);
        assert!(parsed[0].is_dir, "跨 propstat 的 resourcetype 丢失了");
        assert_eq!(parsed[0].etag, None, "缺失的 getetag 应为 None 而非报错");
    }

    /// 自闭合与非自闭合两种 collection 写法都要识别。
    #[test]
    fn detects_collection_both_spellings() {
        let empty = r#"<multistatus xmlns="DAV:"><response><href>/a/</href>
            <propstat><prop><resourcetype><collection/></resourcetype></prop></propstat>
            </response></multistatus>"#;
        let paired = r#"<multistatus xmlns="DAV:"><response><href>/a/</href>
            <propstat><prop><resourcetype><collection></collection></resourcetype></prop></propstat>
            </response></multistatus>"#;
        assert!(parse_multistatus(empty).unwrap()[0].is_dir);
        assert!(parse_multistatus(paired).unwrap()[0].is_dir);
    }

    /// 解析阶段保留 href 的百分号编码（解码统一在 `href_to_remote_path` 做，避免解码两次），
    /// 但 XML 实体必须在此反转义。
    #[test]
    fn keeps_href_encoded_but_unescapes_entities() {
        assert_eq!(hrefs("<multistatus><response><href>/dav/%E7%AC%94%E8%AE%B0/</href></response></multistatus>"),
                   vec!["/dav/%E7%AC%94%E8%AE%B0/".to_string()]);
        // 反转义发生在解析阶段：`&amp;` → `&`
        let parsed = parse_multistatus(
            "<multistatus><response><href>/dav/a&amp;b.md</href></response></multistatus>",
        )
        .unwrap();
        assert_eq!(parsed[0].href, "/dav/a&b.md");
    }

    /// href → 相对路径：绝对 URL 与绝对路径两种形态，含中文与 base 前缀剥离。
    #[test]
    fn strips_base_prefix_from_href() {
        assert_eq!(href_to_remote_path("/dav/Notes/a.md", "/dav"), "/Notes/a.md");
        assert_eq!(href_to_remote_path("/dav/Notes/", "/dav"), "/Notes/");
        assert_eq!(href_to_remote_path("/dav/", "/dav"), "/");
        assert_eq!(
            href_to_remote_path("https://host/dav/Notes/a.md", "/dav"),
            "/Notes/a.md"
        );
        // 中文：先剥前缀（编码态）再解码，只解一次
        assert_eq!(
            href_to_remote_path("/dav/%E7%AC%94%E8%AE%B0/%E6%B5%8B%E8%AF%95.md", "/dav"),
            "/笔记/测试.md"
        );
        // Nextcloud 形态的 base
        assert_eq!(
            href_to_remote_path(
                "https://cloud.example/remote.php/dav/files/me/Notes/a.md",
                "/remote.php/dav/files/me"
            ),
            "/Notes/a.md"
        );
        // base 无路径前缀
        assert_eq!(href_to_remote_path("/Notes/a.md", ""), "/Notes/a.md");
    }

    /// 中文文件名只编码一次（防二次编码把 %E7 变成 %25E7）。
    #[test]
    fn encodes_chinese_path_segments_exactly_once() {
        let base = parse_base("https://dav.jianguoyun.com/dav/").unwrap();
        let url = build_url(&base, "/笔记/测试文档.md", false).unwrap();
        assert_eq!(
            url.as_str(),
            "https://dav.jianguoyun.com/dav/%E7%AC%94%E8%AE%B0/%E6%B5%8B%E8%AF%95%E6%96%87%E6%A1%A3.md"
        );
        assert!(!url.as_str().contains("%25"), "出现了二次编码：{}", url.as_str());
    }

    /// 空格、括号、`&` 等特殊字符要正确转义；目录 URL 补结尾斜杠。
    #[test]
    fn encodes_special_characters_and_dir_slash() {
        let base = parse_base("https://host/dav/").unwrap();
        assert_eq!(
            build_url(&base, "/a b/c(1).md", false).unwrap().as_str(),
            "https://host/dav/a%20b/c(1).md"
        );
        assert_eq!(
            build_url(&base, "/a&b.md", false).unwrap().as_str(),
            "https://host/dav/a&b.md"
        );
        // 目录必须带结尾斜杠
        assert_eq!(
            build_url(&base, "/Notes", true).unwrap().as_str(),
            "https://host/dav/Notes/"
        );
        // 根目录
        assert_eq!(build_url(&base, "/", true).unwrap().as_str(), "https://host/dav/");
    }

    /// base URL 的尾斜杠可有可无，结果必须一致。
    #[test]
    fn base_url_trailing_slash_is_optional() {
        for base in ["https://host/dav", "https://host/dav/"] {
            let b = parse_base(base).unwrap();
            assert_eq!(
                build_url(&b, "/Notes/a.md", false).unwrap().as_str(),
                "https://host/dav/Notes/a.md",
                "base={base}"
            );
        }
    }

    #[test]
    fn rejects_invalid_base_urls() {
        assert!(parse_base("").is_err());
        assert!(parse_base("   ").is_err());
        assert!(parse_base("dav.jianguoyun.com/dav/").is_err(), "缺少 scheme");
        assert!(parse_base("ftp://host/dav/").is_err(), "非 http(s)");
        assert!(parse_base("https://").is_err(), "缺少主机名");
        assert!(parse_base("https://dav.jianguoyun.com/dav/").is_ok());
        // WHATWG 特殊 scheme 会跳过多余斜杠，`https:///dav/` 等价于 `https://dav/`（与浏览器一致）
        assert_eq!(
            parse_base("https:///dav/").unwrap().host_str(),
            Some("dav"),
            "应沿用 WHATWG 的斜杠折叠行为"
        );
    }

    #[test]
    fn normalizes_and_names_paths() {
        assert_eq!(norm_path("/Notes/"), "/Notes");
        assert_eq!(norm_path("/Notes"), "/Notes");
        assert_eq!(norm_path("/"), "/");
        assert_eq!(name_of("/Notes/a.md"), "a.md");
        assert_eq!(name_of("/Notes/"), "Notes");
    }

    /// 空 href 的条目要跳过，不能让 UI 出现无名条目。
    #[test]
    fn skips_entries_with_empty_href() {
        let xml = r#"<multistatus xmlns="DAV:">
            <response><href></href><propstat><prop><resourcetype/></prop></propstat></response>
            <response><href>/dav/a.md</href><propstat><prop><resourcetype/></prop></propstat></response>
        </multistatus>"#;
        let parsed = parse_multistatus(xml).unwrap();
        // 解析阶段保留 2 条，过滤在 list() 中做
        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0].href, "");
        assert_eq!(parsed[1].href, "/dav/a.md");
    }

    /// 畸形 XML 要报错而不是静默返回空列表（否则 UI 会显示"空目录"掩盖真实故障）。
    #[test]
    fn reports_malformed_xml() {
        assert!(parse_multistatus("<multistatus><response><href>/a").is_err());
    }

    /// 真实服务器往返测试（opt-in）。这是唯一能暴露真实服务器怪癖的方式：
    /// 命名空间前缀、Depth 语义、MKCOL 的 405、If-Match 的 412、MOVE 的 Destination 形态。
    ///
    /// 运行方式：
    ///   1) 起一个本地 WebDAV 服务器，例如
    ///      `pip install wsgidav cheroot`
    ///      `wsgidav --host=127.0.0.1 --port=8080 --root=<某个临时目录> --auth=anonymous`
    ///   2) 设置环境变量后运行：
    ///      `YIZI_WEBDAV_TEST_URL=http://127.0.0.1:8080/ YIZI_WEBDAV_TEST_USER=u YIZI_WEBDAV_TEST_PASS=p cargo test -- --ignored webdav`
    #[tokio::test]
    #[ignore = "需要真实 WebDAV 服务器：见上方注释设置 YIZI_WEBDAV_TEST_* 后手动运行"]
    async fn round_trips_against_a_real_server() {
        let (Ok(base), Ok(user), Ok(pass)) = (
            std::env::var("YIZI_WEBDAV_TEST_URL"),
            std::env::var("YIZI_WEBDAV_TEST_USER"),
            std::env::var("YIZI_WEBDAV_TEST_PASS"),
        ) else {
            panic!("需要设置 YIZI_WEBDAV_TEST_URL / _USER / _PASS");
        };
        let conn = Conn::new(&base, user, pass).expect("构造连接");

        let dir = "/yizi-webdav-test";
        let md = format!("{dir}/文档.md");
        let img = format!("{dir}/images/a.png");
        let moved = format!("{dir}/moved.md");

        // 清理可能的上次残留
        let _ = conn.delete(dir).await;

        // 逐级建目录
        conn.mkdir_all(dir).await.expect("MKCOL");
        // 幂等：重复建目录应视为成功（405）
        conn.mkdir_all(dir).await.expect("MKCOL 幂等");
        // 图片所在子目录也要显式创建 —— WebDAV 不会隐式建目录，PUT 到不存在的目录会 409
        // （真实流程由 `remote_cache::upload_images_up` 负责补建）
        conn.mkdir_all(&format!("{dir}/images")).await.expect("MKCOL images");

        // 图片先传，正文后传
        conn.write_bytes(&img, b"PNGDATA".to_vec()).await.expect("PUT 图片");
        let saved = conn.write(&md, "# hello\n", None, true).await.expect("PUT 正文");
        assert!(!saved.conflict, "新建不应冲突");

        // 列目录能看到中文文件名与子目录
        let entries = conn.list(dir).await.expect("PROPFIND");
        let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();
        assert!(names.contains(&"文档.md"), "列表缺少正文：{names:?}");
        let img_dir = entries.iter().find(|e| e.name == "images").expect("列表缺少 images 目录");
        assert!(img_dir.is_dir, "images 应被识别为目录");

        // 内容与二进制一致
        let got = conn.read(&md).await.expect("GET");
        assert_eq!(got.content, "# hello\n");
        assert_eq!(conn.read_bytes(&img).await.expect("GET 图片"), b"PNGDATA");

        // 过期 ETag → 412 冲突（服务器若忽略 If-Match，这里会失败 —— 正是要发现的问题）
        let first_etag = got.etag.clone();
        conn.write(&md, "# v2\n", first_etag.as_deref(), false).await.expect("PUT v2");
        let stale = first_etag.unwrap_or_else(|| "\"definitely-not-the-current-etag\"".to_string());
        let conflict = conn.write(&md, "# v3\n", Some(&stale), false).await.expect("PUT v3");
        assert!(conflict.conflict, "过期 ETag 必须触发冲突，否则会静默覆盖他人修改");

        // MOVE（重命名）
        conn.rename(&md, &moved).await.expect("MOVE");
        assert!(conn.stat(&md).await.expect("stat 原路径").is_none(), "原路径应已不存在");
        assert!(conn.stat(&moved).await.expect("stat 新路径").is_some(), "新路径应存在");

        // DELETE
        conn.delete(dir).await.expect("DELETE");
        assert!(conn.stat(dir).await.expect("stat 已删目录").is_none(), "删除后不应还存在");
    }

    /// 实体引用拆成独立事件，必须累积；十进制/十六进制字符引用也要解析。
    #[test]
    fn accumulates_text_across_entity_events() {
        let xml = r#"<multistatus xmlns="DAV:"><response>
            <href>/dav/a&amp;b.md</href></response></multistatus>"#;
        assert_eq!(parse_multistatus(xml).unwrap()[0].href, "/dav/a&b.md");

        // 同一字段里出现多个实体
        let multi = r#"<multistatus xmlns="DAV:"><response>
            <href>/dav/x&amp;y&amp;z.md</href></response></multistatus>"#;
        assert_eq!(parse_multistatus(multi).unwrap()[0].href, "/dav/x&y&z.md");

        // 字符引用（十进制与十六进制）
        let numeric = r#"<multistatus xmlns="DAV:"><response>
            <href>/dav/a&#38;b&#x26;c.md</href></response></multistatus>"#;
        assert_eq!(parse_multistatus(numeric).unwrap()[0].href, "/dav/a&b&c.md");
    }

    #[test]
    fn resolves_predefined_and_unknown_entities() {
        assert_eq!(resolve_ref("amp"), "&");
        assert_eq!(resolve_ref("lt"), "<");
        assert_eq!(resolve_ref("gt"), ">");
        assert_eq!(resolve_ref("quot"), "\"");
        assert_eq!(resolve_ref("apos"), "'");
        assert_eq!(resolve_ref("#38"), "&");
        assert_eq!(resolve_ref("#x26"), "&");
        // 未知实体原样保留，避免静默丢字符
        assert_eq!(resolve_ref("nbsp"), "&nbsp;");
        // 非法码点不 panic
        assert_eq!(resolve_ref("#xFFFFFFFF"), "&#xFFFFFFFF;");
    }

    /// 200 + HTML 错误页（登录页 / 网关拦截）不能被当成"空目录"。
    #[test]
    fn rejects_non_multistatus_body() {
        let html = "<!DOCTYPE html><html><body>请先登录</body></html>";
        let err = parse_multistatus(html).unwrap_err();
        assert!(err.contains("multistatus"), "错误信息应说明原因：{err}");
        assert!(parse_multistatus("").is_err());
    }

    /// 真正的空目录：只有自身一个条目，过滤后应为空且不报错。
    #[test]
    fn empty_collection_is_not_an_error() {
        let xml = r#"<multistatus xmlns="DAV:"><response><href>/dav/Empty/</href>
            <propstat><prop><resourcetype><collection/></resourcetype></prop></propstat>
            </response></multistatus>"#;
        let parsed = parse_multistatus(xml).unwrap();
        assert_eq!(parsed.len(), 1);
        assert!(parsed[0].is_dir);
    }
}
