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

---

## AI 增强与修复（v0.2.1 补充）

### 新增功能

- **自定义服务接入**：AI 设置合并为「自定义服务」入口，协议二选一（OpenAI 兼容 Chat Completions / Anthropic 兼容 Messages API），自填 Base URL、模型 ID、API 密钥；本地端点（llama.cpp / LM Studio / vLLM 等）密钥可留空；旧「OpenAI 兼容」本地条目与别名自动迁移
- **思考过程展示**：提取推理模型的思考内容（OpenAI 系 `reasoning_content`/`reasoning`、Anthropic `thinking_delta`、Ollama `reasoning_content`），AI 面板以可折叠「思考过程」区块展示，默认收起、不影响正文阅读
- **AI 设置面板优化**：控件宽度统一对齐、标签与输入框上沿对齐；API 密钥输入独占一行全宽 + 等宽字体 + 显示/隐藏切换；「模型」更名为「模型 ID」
- **AI 助手头部**：服务商 + 模型 ID 紧跟标题左对齐显示，自定义服务简写为「自定义服务」

### Bug 修复

- 修复 AI 长回复被截断：前端 10 秒兜底误杀长流，改为与后端 180s HTTP 超时对齐；done 事件始终以完整文本覆盖，自愈个别 chunk 丢失
- 修复中文回复乱码/缺字：流式分块按 UTF-8 字符边界安全解码，跨网络块切碎的多字节字符不再产生 U+FFFD
- 修复自定义服务密钥被跳过：验证与发送回退 OS keychain（有则用、无则 keyless），此前保存密钥后验证仍报 401 missing_api_key
- 修复 Anthropic 兼容验证失败：同时发送 `x-api-key` 与 `Authorization: Bearer`（兼容只认 Bearer 的网关）；验证请求改用用户填写的模型 ID（不再硬编码 claude-haiku-4-5）
- 修复赛博朋克主题底部状态栏不显示主题色：`background-color` 不接受渐变值，改用 `background` 简写
- 修复验证错误信息撑宽设置页：长错误文本（JSON/URL）强制换行，不再横向溢出

### 其他

- npm audit fix 修复 2 个高危漏洞（browserslist）；移除 package.json UTF-8 BOM 修复 Vite 构建失败

---

## AI 技能系统（v0.2.1 补充）

### 新增功能

- **技能系统框架**：`skills/` 目录承载技能（`skills.json` 清单 + 各技能 `.md` 提示词），运行目录自动创建；后端新增 `list_skills` / `read_skill_file` 命令，`tauri.conf.json` 打包 `skills/*` 资源；用户放入技能文件即可扩展，无需改代码
- **技能选择交互**：AI 面板输入框上方 ⚡ 闪电按钮弹出技能菜单（名称 + 简介，hover 展开详细介绍）；选中后技能以胶囊 tag **插入输入框光标处**，与文字混排、可像文字一样退格删除；hover 时 ⚡ 原位淡出、❌ 原位淡入，点击即取消技能
- **技能上下文注入**：技能提示词作为独立 system 消息注入 AI 上下文；`needsDoc: true` 的技能自动勾选并锁定「引用当前文档」，删除技能后恢复勾选
- **内置 3 个技能**：演示稿提炼、文档摘要、润色改写；演示稿提炼技能按演示模式 14 种版式真实渲染规则细化，保证输出的演示稿可被引擎正确识别
- **输入框激活态**：主题色光点沿边框环绕流动（conic-gradient + `@property`），仅线框变色、背景不变、无双层框

### Bug 修复

- 修复技能 tag 先前的展示缺陷：hover 时 ❌ 显示在文案末尾导致文字跳动，改为 ⚡ 图标位原位切换、零位移
- 修复 CRLF 行尾文档大纲无法提取（V0.1.0 遗留）：标题正则 `.` 不匹配 `\r`，CRLF 文档（Windows 常见）全部标题匹配失败、大纲显示「文档没有标题」；提取前剥离行尾 `\r`
