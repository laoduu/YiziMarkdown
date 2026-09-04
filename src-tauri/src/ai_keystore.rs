//! AI 密钥存储：OS 原生凭据库（Windows 凭据管理器 / macOS Keychain / Linux libsecret）。
//!
//! 通过 `keyring` crate 实现，密钥绝不落盘为明文、绝不进入 localStorage。
//! 每个 provider 一个独立槽位，便于用户同时保存多家密钥。

const KEYRING_SERVICE: &str = "yizimarkdown";

fn entry(provider: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, &format!("ai-{provider}"))
        .map_err(|e| format!("keychain entry failed: {e}"))
}

/// 保存 provider 的 API 密钥。
pub fn set_key(provider: &str, key: &str) -> Result<(), String> {
    let e = entry(provider)?;
    e.set_password(key)
        .map_err(|e| format!("failed to store key: {e}"))
}

/// 该 provider 是否已保存密钥。
pub fn has_key(provider: &str) -> Result<bool, String> {
    let e = entry(provider)?;
    match e.get_password() {
        Ok(_) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(e) => Err(format!("keychain read failed: {e}")),
    }
}

/// 删除 provider 的密钥。未设置时静默成功。
pub fn clear_key(provider: &str) -> Result<(), String> {
    let e = entry(provider)?;
    match e.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("keychain delete failed: {e}")),
    }
}

/// 读取 provider 的 API 密钥。未设置时返回用户可读的错误信息。
pub fn read_key(provider: &str) -> Result<String, String> {
    let e = entry(provider)?;
    match e.get_password() {
        Ok(k) => Ok(k),
        Err(keyring::Error::NoEntry) => Err(format!("no API key set for provider '{provider}'")),
        Err(e) => Err(format!("keychain read failed: {e}")),
    }
}
