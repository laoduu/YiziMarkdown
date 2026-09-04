//! AI 代理：流式聊天补全 + 密钥管理（v0.2.0 侧边 AI 聊天面板）。
//!
//! 三种 wire format：
//!   - "openai"     — OpenAI Chat Completions（DeepSeek / Qwen / GLM / Kimi / 豆包 / xAI / Groq 等兼容）
//!   - "anthropic"  — Anthropic Messages API
//!   - "ollama"     — 本地 Ollama（无需密钥）
//!
//! `ai_chat` 返回 request_id 后立即异步流式请求，通过事件向前端推送：
//!   - `yizi://ai-chunk` — 增量文本
//!   - `yizi://ai-done`  — 完整结束
//!   - `yizi://ai-error` — 失败（含用户取消 "cancelled"）
//! 取消是协作式的：每解析一个 chunk 检查一次取消标志。

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use futures_util::StreamExt;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter};

use crate::ai_keystore;

// ---------------------------------------------------------------------------
// Provider helpers
// ---------------------------------------------------------------------------

/// `local` → `ollama`；其余原样返回。
fn resolve_provider(id: &str) -> &str {
    match id {
        "local" => "ollama",
        other => other,
    }
}

/// 无需密钥的本地运行时。
fn is_keyless_provider(provider: &str) -> bool {
    matches!(resolve_provider(provider), "ollama")
}

fn wire_format(format: &str) -> String {
    match resolve_provider(format) {
        "openai-compat" => "openai".to_string(),
        other => other.to_string(),
    }
}

/// 只有确实有密钥时才附加 `Authorization: Bearer …`。
fn with_optional_bearer(rb: reqwest::RequestBuilder, key: &str) -> reqwest::RequestBuilder {
    if key.trim().is_empty() {
        rb
    } else {
        rb.bearer_auth(key)
    }
}

/// 规范化 OpenAI 兼容 base URL：无 scheme 补 http/https、无路径补 /v1。
fn normalize_openai_base(raw: &str) -> Option<String> {
    let trimmed = raw.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return None;
    }
    let has_scheme = trimmed.contains("://");
    let after_scheme = if has_scheme {
        trimmed.splitn(2, "://").nth(1).unwrap_or("")
    } else {
        trimmed
    };
    let host = after_scheme.split('/').next().unwrap_or("");
    let host_only = host.rsplit('@').next().unwrap_or(host);
    let hostname = if let Some(rest) = host_only.strip_prefix('[') {
        rest.split(']').next().unwrap_or("")
    } else {
        host_only.split(':').next().unwrap_or("")
    };
    let looks_local = hostname == "localhost"
        || hostname.ends_with(".local")
        || hostname.parse::<std::net::IpAddr>().is_ok();
    let with_scheme = if has_scheme {
        trimmed.to_string()
    } else if looks_local || host_only.contains(':') {
        format!("http://{trimmed}")
    } else {
        format!("https://{trimmed}")
    };
    let path = with_scheme
        .splitn(2, "://")
        .nth(1)
        .and_then(|rest| rest.split_once('/'))
        .map(|(_, p)| p.trim_matches('/').to_string())
        .unwrap_or_default();
    if path.is_empty() {
        Some(format!("{}/v1", with_scheme.trim_end_matches('/')))
    } else {
        Some(with_scheme.trim_end_matches('/').to_string())
    }
}

/// 各 provider 的默认 base URL（与前端 ai-providers.ts 保持一致）。
/// base_url 为空时按 provider 取默认，避免一律回退到 OpenAI 端点。
fn default_base_url(provider: &str, format: &str) -> String {
    match (resolve_provider(provider), format) {
        ("openai", "openai") => "https://api.openai.com/v1".to_string(),
        ("anthropic", "anthropic") => "https://api.anthropic.com".to_string(),
        ("gemini", _) => "https://generativelanguage.googleapis.com/v1beta/openai".to_string(),
        ("xai", _) => "https://api.x.ai/v1".to_string(),
        ("mistral", _) => "https://api.mistral.ai/v1".to_string(),
        ("groq", _) => "https://api.groq.com/openai/v1".to_string(),
        ("deepseek", _) => "https://api.deepseek.com/v1".to_string(),
        ("qwen", _) => "https://dashscope.aliyuncs.com/compatible-mode/v1".to_string(),
        ("glm", _) => "https://open.bigmodel.cn/api/paas/v4".to_string(),
        ("kimi", _) => "https://api.moonshot.cn/v1".to_string(),
        ("volcengine", _) => "https://ark.cn-beijing.volces.com/api/v3".to_string(),
        ("siliconflow", _) => "https://api.siliconflow.cn/v1".to_string(),
        ("minimax", _) => "https://api.minimax.io/v1".to_string(),
        ("openrouter", _) => "https://openrouter.ai/api/v1".to_string(),
        ("opencode-go", _) => "https://opencode.ai/zen/go/v1".to_string(),
        ("ollama", _) => "http://localhost:11434".to_string(),
        ("openai-compat", _) => "http://localhost:8080/v1".to_string(),
        _ => match format {
            "anthropic" => "https://api.anthropic.com".to_string(),
            "ollama" => "http://localhost:11434".to_string(),
            _ => "https://api.openai.com/v1".to_string(),
        },
    }
}

fn openai_base(provider: &str, base_url: Option<&str>) -> String {
    base_url
        .and_then(normalize_openai_base)
        .unwrap_or_else(|| default_base_url(provider, "openai"))
}

fn truncate(s: &str, n: usize) -> String {
    if s.chars().count() <= n {
        s.to_string()
    } else {
        let mut out: String = s.chars().take(n).collect();
        out.push('…');
        out
    }
}

/// 脱敏密钥指纹：`sk-a1b2…z9x8`（前4后4，中间省略）。空 key 返回 "<empty>"。
fn key_fingerprint(key: &str) -> String {
    if key.is_empty() {
        return "<empty>".to_string();
    }
    let chars: Vec<char> = key.chars().collect();
    if chars.len() <= 8 {
        return key.chars().map(|_| '*').collect();
    }
    let head: String = chars[..4].iter().collect();
    let tail: String = chars[chars.len() - 4..].iter().collect();
    format!("{head}…{tail}")
}

// ---------------------------------------------------------------------------
// Request / event types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ChatRequest {
    pub provider: String,
    #[serde(default)]
    pub api_format: Option<String>,
    pub model: String,
    pub messages: Vec<ChatMessage>,
    #[serde(default)]
    pub base_url: Option<String>,
    /// 调用方预先生成的 request_id，用于在调用前就绑定事件监听，
    /// 避免快速失败（如 ollama 模型不存在）时事件在监听器注册前发出而丢失。
    #[serde(default)]
    pub request_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct ChunkEvent {
    request_id: String,
    chunk: String,
}

#[derive(Debug, Clone, Serialize)]
struct DoneEvent {
    request_id: String,
    full_text: String,
}

#[derive(Debug, Clone, Serialize)]
struct ErrorEvent {
    request_id: String,
    error: String,
}

// ---------------------------------------------------------------------------
// Cancellation registry
// ---------------------------------------------------------------------------

static CANCEL_FLAGS: Lazy<Mutex<HashMap<String, Arc<AtomicBool>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

static REQ_COUNTER: AtomicU64 = AtomicU64::new(0);

fn make_request_id() -> String {
    let n = REQ_COUNTER.fetch_add(1, Ordering::Relaxed);
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("req-{ts}-{n}")
}

fn register_cancel_flag(id: &str) -> Arc<AtomicBool> {
    let flag = Arc::new(AtomicBool::new(false));
    if let Ok(mut map) = CANCEL_FLAGS.lock() {
        map.insert(id.to_string(), flag.clone());
    }
    flag
}

fn drop_cancel_flag(id: &str) {
    if let Ok(mut map) = CANCEL_FLAGS.lock() {
        map.remove(id);
    }
}

// ---------------------------------------------------------------------------
// Key commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn ai_set_key(provider: String, key: String) -> Result<(), String> {
    ai_keystore::set_key(&provider, &key)
}

#[tauri::command]
pub fn ai_has_key(provider: String) -> Result<bool, String> {
    ai_keystore::has_key(&provider)
}

#[tauri::command]
pub fn ai_clear_key(provider: String) -> Result<(), String> {
    ai_keystore::clear_key(&provider)
}

fn read_key(provider: &str) -> Result<String, String> {
    ai_keystore::read_key(provider)
}

/// 验证密钥 + base_url 是否可用。返回 Ok(简短信息) 或 Err(用户可读原因)。
/// 设置页保存后用于显示绿色"已验证 ✓" / 红色"密钥无效"。
#[tauri::command]
pub async fn ai_verify_key(
    provider: String,
    key: Option<String>,
    api_format: Option<String>,
    base_url: Option<String>,
) -> Result<String, String> {
    let format = wire_format(&api_format.unwrap_or_else(|| provider.clone()));
    // 输入框有内容优先用输入；否则回退 keychain（设置页需展示来源，避免用错旧 key）
    let (key_str, key_source) = match key {
        Some(k) if !k.trim().is_empty() => (k.trim().to_string(), "input".to_string()),
        _ if is_keyless_provider(&provider) => (String::new(), "keyless".to_string()),
        _ => (read_key(&provider)?, "keychain".to_string()),
    };
    // 实际发送的密钥指纹（脱敏），用于诊断粘贴错误 / keychain 旧 key
    let fp = key_fingerprint(&key_str);
    let diag = format!(" [key: src={key_source} len={} mask={fp}]", key_str.len());
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;
    match format.as_str() {
        "openai" => {
            let base = openai_base(&provider, base_url.as_deref());
            let url = format!("{base}/models");
            let res = with_optional_bearer(client.get(&url), &key_str)
                .send()
                .await
                .map_err(|e| format!("network: {e}"))?;
            let status = res.status();
            if status.is_success() {
                let body: Value = res.json().await.map_err(|e| e.to_string())?;
                let n = body
                    .get("data")
                    .and_then(|d| d.as_array())
                    .map(|a| a.len())
                    .unwrap_or(0);
                return Ok(format!("OK · {n} models available"));
            }
            let txt = res.text().await.unwrap_or_default();
            Err(format!("HTTP {status}: {}{diag}", truncate(&txt, 200)))
        }
        "anthropic" => {
            let base = base_url
                .as_deref()
                .map(|s| s.trim_end_matches('/').to_string())
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "https://api.anthropic.com".to_string());
            let url = format!("{base}/v1/messages");
            let body = serde_json::json!({
                "model": "claude-haiku-4-5",
                "max_tokens": 1,
                "messages": [{"role":"user","content":"ping"}]
            });
            let res = client
                .post(url)
                .header("x-api-key", &key_str)
                .header("anthropic-version", "2023-06-01")
                .json(&body)
                .send()
                .await
                .map_err(|e| format!("network: {e}"))?;
            let status = res.status();
            if status.is_success() {
                Ok("OK · key accepted".to_string())
            } else {
                let txt = res.text().await.unwrap_or_default();
                Err(format!("HTTP {status}: {}{diag}", truncate(&txt, 200)))
            }
        }
        "ollama" => {
            let base = base_url
                .as_deref()
                .map(|s| s.trim_end_matches('/').to_string())
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "http://localhost:11434".to_string());
            let url = format!("{base}/api/tags");
            let res = client
                .get(&url)
                .send()
                .await
                .map_err(|e| format!("network: {e} (is Ollama running?)"))?;
            if res.status().is_success() {
                let body: Value = res.json().await.map_err(|e| e.to_string())?;
                let n = body
                    .get("models")
                    .and_then(|d| d.as_array())
                    .map(|a| a.len())
                    .unwrap_or(0);
                Ok(format!("OK · {n} local models"))
            } else {
                Err(format!("HTTP {}: ollama not reachable", res.status()))
            }
        }
        other => Err(format!("unknown api_format: {other}")),
    }
}

// ---------------------------------------------------------------------------
// Streaming entrypoint
// ---------------------------------------------------------------------------

/// 发起一次流式聊天补全。返回 request_id；chunk 通过 `yizi://ai-chunk` 推送，
/// 结束通过 `yizi://ai-done`，失败通过 `yizi://ai-error`。
#[tauri::command]
pub async fn ai_chat(app: AppHandle, request: ChatRequest) -> Result<String, String> {
    let request_id = request
        .request_id
        .clone()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(make_request_id);
    let cancel = register_cancel_flag(&request_id);

    let format = wire_format(
        &request
            .api_format
            .clone()
            .unwrap_or_else(|| request.provider.clone()),
    );

    // 本地运行时不要求密钥；其余 provider 必须已保存密钥。
    let api_key = if is_keyless_provider(&request.provider) {
        String::new()
    } else {
        match read_key(&request.provider) {
            Ok(k) => k,
            Err(e) => {
                drop_cancel_flag(&request_id);
                return Err(e);
            }
        }
    };

    let id_for_task = request_id.clone();
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        let result = match format.as_str() {
            "openai" => run_openai(&app_clone, &id_for_task, &request, &api_key, cancel.clone()).await,
            "anthropic" => {
                run_anthropic(&app_clone, &id_for_task, &request, &api_key, cancel.clone()).await
            }
            "ollama" => run_ollama(&app_clone, &id_for_task, &request, cancel.clone()).await,
            other => Err(format!("unknown api_format: {other}")),
        };

        match result {
            Ok(full_text) => {
                let _ = app_clone.emit(
                    "yizi://ai-done",
                    DoneEvent {
                        request_id: id_for_task.clone(),
                        full_text,
                    },
                );
            }
            Err(err) => {
                let _ = app_clone.emit(
                    "yizi://ai-error",
                    ErrorEvent {
                        request_id: id_for_task.clone(),
                        error: err,
                    },
                );
            }
        }
        drop_cancel_flag(&id_for_task);
    });

    Ok(request_id)
}

/// 取消指定 request_id 的流式请求。
#[tauri::command]
pub fn ai_cancel(request_id: String) -> Result<(), String> {
    if let Ok(map) = CANCEL_FLAGS.lock() {
        if let Some(flag) = map.get(&request_id) {
            flag.store(true, Ordering::SeqCst);
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Provider implementations
// ---------------------------------------------------------------------------

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(180))
        .connect_timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| format!("http client init failed: {e}"))
}

fn emit_chunk(app: &AppHandle, request_id: &str, chunk: &str) {
    if chunk.is_empty() {
        return;
    }
    let _ = app.emit(
        "yizi://ai-chunk",
        ChunkEvent {
            request_id: request_id.to_string(),
            chunk: chunk.to_string(),
        },
    );
}

/// SSE 事件边界：\n\n 或 \r\n\r\n。返回边界起始下标。
fn find_event_boundary(buf: &str) -> Option<usize> {
    buf.find("\n\n").or_else(|| buf.find("\r\n\r\n"))
}

/// --- OpenAI Chat Completions（含 DeepSeek/Qwen/GLM/Kimi/豆包等兼容端点） ---
async fn run_openai(
    app: &AppHandle,
    request_id: &str,
    req: &ChatRequest,
    api_key: &str,
    cancel: Arc<AtomicBool>,
) -> Result<String, String> {
    let base = openai_base(&req.provider, req.base_url.as_deref());
    let url = format!("{base}/chat/completions");

    let messages_json: Vec<Value> = req
        .messages
        .iter()
        .map(|m| serde_json::json!({"role": m.role, "content": m.content}))
        .collect();

    let body = serde_json::json!({
        "model": req.model,
        "stream": true,
        "messages": messages_json,
    });

    let client = http_client()?;
    let resp = with_optional_bearer(client.post(&url), api_key)
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("openai request failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let txt = resp.text().await.unwrap_or_default();
        return Err(format!("openai {status}: {txt}"));
    }

    let mut full = String::new();
    let mut buf = String::new();
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        if cancel.load(Ordering::SeqCst) {
            return Err("cancelled".to_string());
        }
        let bytes = chunk.map_err(|e| format!("openai stream error: {e}"))?;
        buf.push_str(&String::from_utf8_lossy(&bytes));
        while let Some(idx) = find_event_boundary(&buf) {
            let event = buf[..idx].to_string();
            let after = if buf[idx..].starts_with("\r\n\r\n") {
                idx + 4
            } else {
                idx + 2
            };
            buf = buf[after..].to_string();

            for line in event.lines() {
                let line = line.trim_start();
                let payload = match line.strip_prefix("data:") {
                    Some(p) => p.trim(),
                    None => continue,
                };
                if payload == "[DONE]" {
                    return Ok(full);
                }
                let json: Value = match serde_json::from_str(payload) {
                    Ok(v) => v,
                    Err(_) => continue,
                };
                if let Some(content) = json
                    .get("choices")
                    .and_then(|c| c.get(0))
                    .and_then(|c| c.get("delta"))
                    .and_then(|d| d.get("content"))
                    .and_then(|s| s.as_str())
                {
                    if !content.is_empty() {
                        full.push_str(content);
                        emit_chunk(app, request_id, content);
                    }
                }
            }
        }
    }
    Ok(full)
}

/// --- Anthropic Messages API ---
async fn run_anthropic(
    app: &AppHandle,
    request_id: &str,
    req: &ChatRequest,
    api_key: &str,
    cancel: Arc<AtomicBool>,
) -> Result<String, String> {
    let base = req
        .base_url
        .as_ref()
        .map(|s| s.trim_end_matches('/').to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "https://api.anthropic.com".to_string());
    let url = format!("{base}/v1/messages");

    // Anthropic 将 system 独立于 messages；抽出所有 system 消息拼接。
    let system_str = req
        .messages
        .iter()
        .filter(|m| m.role == "system")
        .map(|m| m.content.clone())
        .collect::<Vec<_>>()
        .join("\n\n");
    let chat_msgs: Vec<Value> = req
        .messages
        .iter()
        .filter(|m| m.role != "system")
        .map(|m| serde_json::json!({"role": m.role, "content": m.content}))
        .collect();

    let body = serde_json::json!({
        "model": req.model,
        "system": system_str,
        "messages": chat_msgs,
        "stream": true,
        "max_tokens": 4096,
    });

    let client = http_client()?;
    let resp = client
        .post(&url)
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("anthropic request failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let txt = resp.text().await.unwrap_or_default();
        return Err(format!("anthropic {status}: {txt}"));
    }

    let mut full = String::new();
    let mut buf = String::new();
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        if cancel.load(Ordering::SeqCst) {
            return Err("cancelled".to_string());
        }
        let bytes = chunk.map_err(|e| format!("anthropic stream error: {e}"))?;
        buf.push_str(&String::from_utf8_lossy(&bytes));
        while let Some(idx) = find_event_boundary(&buf) {
            let event = buf[..idx].to_string();
            let after = if buf[idx..].starts_with("\r\n\r\n") {
                idx + 4
            } else {
                idx + 2
            };
            buf = buf[after..].to_string();

            for line in event.lines() {
                let line = line.trim_start();
                let payload = match line.strip_prefix("data:") {
                    Some(p) => p.trim(),
                    None => continue,
                };
                let json: Value = match serde_json::from_str(payload) {
                    Ok(v) => v,
                    Err(_) => continue,
                };
                let kind = json.get("type").and_then(|t| t.as_str()).unwrap_or("");
                match kind {
                    "content_block_delta" => {
                        if let Some(text) = json
                            .get("delta")
                            .and_then(|d| d.get("text"))
                            .and_then(|s| s.as_str())
                        {
                            if !text.is_empty() {
                                full.push_str(text);
                                emit_chunk(app, request_id, text);
                            }
                        }
                    }
                    "message_stop" => {
                        return Ok(full);
                    }
                    "error" => {
                        let msg = json
                            .get("error")
                            .and_then(|e| e.get("message"))
                            .and_then(|s| s.as_str())
                            .unwrap_or("anthropic stream error");
                        return Err(msg.to_string());
                    }
                    _ => {}
                }
            }
        }
    }
    Ok(full)
}

/// --- Ollama（本地，无需密钥） ---
async fn run_ollama(
    app: &AppHandle,
    request_id: &str,
    req: &ChatRequest,
    cancel: Arc<AtomicBool>,
) -> Result<String, String> {
    let base = req
        .base_url
        .as_ref()
        .map(|s| s.trim_end_matches('/').to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "http://localhost:11434".to_string());
    let url = format!("{base}/api/chat");

    let messages_json: Vec<Value> = req
        .messages
        .iter()
        .map(|m| serde_json::json!({"role": m.role, "content": m.content}))
        .collect();

    let body = serde_json::json!({
        "model": req.model,
        "stream": true,
        "messages": messages_json,
    });

    let client = http_client()?;
    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("ollama request failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let txt = resp.text().await.unwrap_or_default();
        return Err(format!("ollama {status}: {txt}"));
    }

    let mut full = String::new();
    let mut buf = String::new();
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        if cancel.load(Ordering::SeqCst) {
            return Err("cancelled".to_string());
        }
        let bytes = chunk.map_err(|e| format!("ollama stream error: {e}"))?;
        buf.push_str(&String::from_utf8_lossy(&bytes));
        // Ollama 流式返回逐行 JSON（每行一个完整对象）。
        while let Some(nl) = buf.find('\n') {
            let line = buf[..nl].to_string();
            buf = buf[nl + 1..].to_string();
            if line.trim().is_empty() {
                continue;
            }
            let json: Value = match serde_json::from_str(&line) {
                Ok(v) => v,
                Err(_) => continue,
            };
            if let Some(content) = json
                .get("message")
                .and_then(|m| m.get("content"))
                .and_then(|s| s.as_str())
            {
                if !content.is_empty() {
                    full.push_str(content);
                    emit_chunk(app, request_id, content);
                }
            }
            if json.get("done").and_then(|d| d.as_bool()).unwrap_or(false) {
                return Ok(full);
            }
        }
    }
    Ok(full)
}
