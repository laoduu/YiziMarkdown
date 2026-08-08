# v0.1.8

## 新增功能

- **斜杠菜单输入触发** — 新增输入 `/` 或 `、` 自动唤起斜杠菜单（此前仅支持 Ins 键唤起），菜单在光标位置弹出；继续输入任意字符（如"我/你"）自动关闭，便于直接输入斜杠文本
- **HTML 渲染支持** — 预览模式（整页与并排右侧）现可渲染文档中的原始 HTML（表格、行内样式等），此前一律显示为源码
- **实时模式 HTML 渲染** — 块级 HTML（如 `<table>`）及单独成行的行内 HTML 元素在所见即所得模式下渲染为真实内容，光标落上即还原源码编辑
- **超链接外部打开** — 预览中点击超链接改为在系统默认浏览器打开，不再应用内导航

## 平台适配（macOS 支持）

- **macOS 客户端构建** — 修复 Windows 专属依赖（winreg）在 macOS 上编译失败的问题，补齐 `.icns` 图标并加入打包配置，打通 Tauri 在 macOS 的编译与打包流程
- **通用二进制（Universal Binary）** — 一份安装包同时包含 Intel（x86_64）与 Apple Silicon（arm64）两种架构，在两类 Mac 上均原生运行，无需 Rosetta
- **macOS 原生全屏** — 最大化按钮在 macOS 上进入原生全屏（Windows 保持最大化），标题栏双击行为同步适配
- **macOS 默认 Markdown 编辑器** — 通过 LaunchServices 将 `.md` 关联为本应用默认编辑器，与 Windows 注册表方式对齐
- **macOS 系统字体获取** — 改用 `system_profiler` 获取系统字体，替代仅 Windows 可用的 PowerShell 调用

## Bug 修复

- **表格/HTML 在预览中显示为源码** — markdown-it 默认关闭 HTML 渲染导致原始 HTML 被转义。现开启 HTML 渲染
- **中文输入法下 `/` 无法唤起斜杠菜单** — 原触发检测在 IME 组合态下被跳过，导致中英文输入 `/` 均无反应。现改为检测本次实际插入文本，中英文均可触发
- **触发斜杠菜单时插件崩溃** — CodeMirror 更新期间禁止调用 dispatch 与读取布局，原逻辑一触发即抛异常。现延迟到更新结束后再派发与测量坐标
- **继续输入菜单不消失 / 菜单位置错误** — 关闭与定位事件未正确冒泡到 React。现补上冒泡，继续输入菜单自动关闭、菜单定位在光标处
- **macOS 启动白屏** — 移除 KaTeX 行内公式正则中的 lookbehind 断言（旧版 WebKit 不支持，导致 React 渲染崩溃）
- **macOS 12 下 Mermaid 图表无法渲染** — mermaid 依赖 Constructable Stylesheets API（需 Safari 16.4+），引入 polyfill 兼容旧版 WebKit
- **打包后主题 / 资源缺失** — macOS `.app` 下主题等资源位于 `Contents/Resources`，应用改为正确识别并读取 bundle 资源目录
