# v0.2.1

## 新增功能

### 多语言国际化（i18n）

- **15 种界面语言**：简体中文（默认）、繁體中文、English、日本語、한국어、Deutsch、Français、Español、Português、Italiano、Polski、Nederlands、Türkçe、Svenska、Українська
- **轻量 i18n 引擎**（无第三方库）：`src/i18n/` 语言字典 + `useI18n()` hook，缺失词条自动回退英文
- **语言切换**：设置 → 通用 → 界面语言，即时生效，`<html lang>` 同步更新
- **全组件改造**：工具栏、标签栏、状态栏、侧边栏、设置面板（全部 9 页）、编辑器、斜杠菜单、演示模式、快捷键面板、插件等 27 个文件的中文硬编码全部替换为 `t()` 调用
- **快捷键系统 i18n**：action 改为 labelKey/categoryKey，快捷键大全与设置页随语言切换
- **插件 i18n**：KaTeX / Mermaid 插件的名称、描述、配置项均支持多语言

### AI 大模型接入（侧边 AI 聊天面板）

- **Rust 流式代理**：新增 `ai_proxy.rs` / `ai_keystore.rs`，支持 OpenAI Chat Completions / Anthropic Messages / Ollama 三种 wire format 流式 SSE 输出，事件驱动推送（chunk / done / error），支持协作式取消
- **密钥安全存储**：API 密钥存 OS keychain（Windows 凭据管理器 / macOS Keychain / Linux libsecret），绝不落盘 localStorage
- **17 家供应商目录**：OpenAI、Anthropic、Gemini、xAI、Mistral、Groq、DeepSeek、通义千问、智谱 GLM、Moonshot Kimi、火山方舟、硅基流动、MiniMax、OpenRouter、OpenCode Go、Ollama（本地）、OpenAI 兼容端点，各自默认模型与端点
- **AI 设置面板**：设置 → AI，可选供应商 / 模型 / Base URL 覆盖 / 系统提示词，密钥保存、清除、一键验证（带脱敏指纹诊断）
- **侧边 AI 聊天面板**：工具栏机器人按钮开关，与左侧栏对称的右侧面板；流式回复、停止生成、清空对话、复制、插入到文档光标处、创建新文档
- **引用当前文档**：勾选后把当前文档内容作为上下文发送给 AI，支持文档引用上限配置（64K~512K/不限，默认 200K）

### 其他优化

- **自动保存间隔**：1~10 秒 → 5~180 秒，默认 60 秒；旧配置自动迁移
- **「源代码模式」更名为「源码」**：15 种语言同步
- **AI 面板层级**：改为 app-body 内右侧布局面板，不再遮挡工具栏与视图模式按钮

## Bug 修复

- 修复 Tauri 2 命令参数 camelCase 适配问题（`api_format` → `apiFormat`、`base_url` → `baseUrl`），AI 验证/聊天调用打通
- 修复供应商默认端点：DeepSeek / Qwen / GLM 等按各自默认地址请求，不再一律误连 `api.openai.com`
- 修复密钥粘贴夹带引号/空白导致 401：保存与验证前清理包裹引号与尾随引号
- 修复 AI 聊天收不到流式回复：事件监听器在 done/error 到达后才注销（此前 invoke 一返回即注销）
- 修复 AI 面板层级过高遮挡工具栏与五种视图模式：改为 app-body 内右侧布局面板
- 修复「引用当前文档」复选框在无历史对话时被隐藏：改为始终显示
- 修复设置页长英文提示挤压下拉控件：标签列限宽 + 提示文字换行
