//! 密钥存储：OS 原生凭据库（Windows 凭据管理器 / macOS Keychain / Linux libsecret）。
//!
//! 通过 `keyring` crate 实现，密钥绝不落盘为明文、绝不进入 localStorage。
//! 以「账号名」为槽位，调用方自行决定命名空间：
//!   - AI 供应商：`ai-{provider}`
//!   - WebDAV：`webdav-username` / `webdav-password`

const KEYRING_SERVICE: &str = "yizimarkdown";

/// 打开指定账号的 keychain 条目。
fn entry(account: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, account)
        .map_err(|e| format!("keychain entry failed: {e}"))
}

// ---------------------------------------------------------------------------
// 通用密钥读写（account 为完整账号名）
// ---------------------------------------------------------------------------

/// 保存密钥。未设置过则新建，已存在则覆盖。
pub fn set_secret(account: &str, value: &str) -> Result<(), String> {
    entry(account)?
        .set_password(value)
        .map_err(|e| format!("failed to store secret: {e}"))
}

/// 读取密钥。未设置时返回 `Ok(None)`；真正的 keychain 故障才返回 `Err`。
pub fn read_secret(account: &str) -> Result<Option<String>, String> {
    match entry(account)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("keychain read failed: {e}")),
    }
}

/// 该账号是否已保存密钥。
pub fn has_secret(account: &str) -> Result<bool, String> {
    read_secret(account).map(|v| v.is_some())
}

/// 删除密钥。未设置时静默成功。
pub fn clear_secret(account: &str) -> Result<(), String> {
    match entry(account)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("keychain delete failed: {e}")),
    }
}

// ---------------------------------------------------------------------------
// AI 密钥（账号名 `ai-{provider}`）
// ---------------------------------------------------------------------------

/// 保存 provider 的 API 密钥。
pub fn set_key(provider: &str, key: &str) -> Result<(), String> {
    set_secret(&format!("ai-{provider}"), key)
}

/// 该 provider 是否已保存密钥。
pub fn has_key(provider: &str) -> Result<bool, String> {
    has_secret(&format!("ai-{provider}"))
}

/// 删除 provider 的密钥。未设置时静默成功。
pub fn clear_key(provider: &str) -> Result<(), String> {
    clear_secret(&format!("ai-{provider}"))
}

/// 读取 provider 的 API 密钥。未设置时返回用户可读的错误信息。
pub fn read_key(provider: &str) -> Result<String, String> {
    read_secret(&format!("ai-{provider}"))?
        .ok_or_else(|| format!("no API key set for provider '{provider}'"))
}
