# v0.2.4

## 新增功能

### 光标可见性体系

- **主题色 I-beam 光标**：源码/实时/分屏编辑区的鼠标竖线改为跟随当前主题色（`--editor-cursor`）的动态 SVG 光标，明暗模式自动切换描边色；提供「纤细（原生样式）」和「加粗（高可见度）」两档
- **块状插入光标**：加粗档下插入光标为主题色半透明圆角块（0.6ch），文字透出，输入位置一目了然
- **点击涟漪反馈**：点击编辑区时扩散 1px 细线三圈涟漪（sonar 效果），默认开启
- **全站主题色箭头**：非编辑区的基础光标改为主题色箭头（双色调 + 明暗适配），文本输入区保持 I-beam、链接/按钮保持手型语义
- **设置项**：设置 → 编辑器 → 光标，新增「光标样式」（纤细原生样式/加粗）和「涟漪反馈」开关（默认勾选）

### 导出 DOCX

- **Rust 后端生成**：`pulldown-cmark` 解析 Markdown → 手写 OOXML 打包（`zip`，仅 deflate，安装包增量约 1MB）
- **Word 原生语义**：标题 1-6（主题强调色）、有序/无序列表、真实表格（带边框）、代码块（等宽 + 浅灰底纹）、引用（主题色左边线）、行内粗体/斜体/删除线/代码、链接（主题色下划线）、任务列表（☑/☐）
- **图片嵌入**：本地路径（含 Windows 盘符反斜杠路径）直接读取嵌入；网络图片（png/jpg/gif/bmp/webp）自动下载嵌入；按原图宽高比计算插入尺寸（最大宽 6in），不再拉伸变形
- **主题化**：标题色/正文色/字体由前端从当前主题与设置实时传入，导出与预览风格一致

### 导出 PDF（Windows）

- **WebView2 静默打印**：`ICoreWebView2::PrintToPdf`（Tauri `Webview::print()` 在 Windows 不可用，走 COM）
- **还原度 100%**：隐藏窗口加载「纯文档 HTML」（预览 DOM + 内联主题/KaTeX/用户 CSS），KaTeX 公式、mermaid 图表、图片原样进 PDF
- **多页分页**：解除打印视口高度锁定，长文档正确分页

### 导出 HTML

- **独立完整文档**：导出为自包含 HTML，内联主题样式、KaTeX 样式、用户自定义 CSS，与预览显示标准一致（不再是无样式的裸 HTML）

### 本地图片渲染

- **修复 Windows 路径图片不显示**：markdown-it 会把 `D:\...` 的反斜杠编码为 `%5C`，绝对路径识别失败 → 在图片解析入口还原 URL 编码，预览/PDF/DOCX 全部恢复

### 标题折叠（Obsidian 风格）

- **H 层级标签替代三角符号**：折叠指示器从 `▸/▾` 三角改为 `H1`–`H6` 层级标签（药丸形：细边框 + 圆角），支持 ATX 与 Setext 标题
- **交互**：悬停标题行显示对应层级标签，点击折叠/展开；折叠后标签常显并以主题色高亮（accent 边框 + 底色），悬停不覆盖
- **滚动锁定**：标签为绝对定位浮层，跟随标题滚动（`scrollDOM` 滚动监听 + rAF 节流重定位），滚出视口跟随滚走、滚回自动恢复

### 窗口边框跟随主题背景（Windows 11）

- **1px 系统外框去蓝化**：Windows 11 DWM 给无边框窗口自动画的 1px 强调色边框（本机系统默认蓝 `#0078D4`）改为跟随当前主题背景——`DwmSetWindowAttribute` + `DWMWA_BORDER_COLOR`，主题/明暗切换时前端读取 `--editor-bg` 同步；Win10 及以下自动忽略
- **来源确认**：`#0078D4` 是 Windows 系统强调色（注册表 `HKCU\...\DWM\AccentColor`），非应用硬编码

### 导出 DOCX 排版还原度增强

- **嵌套列表修复**：`- 外层` + `  - 内层` 不再塌陷成同一段落（行内渲染曾吞掉块级起始），嵌套列表为独立段落、层级正确
- **多级列表**：numbering 扩到三级（有序 `1. / 1.2. / 1.2.3.`，无序 `• / ◦ / ▪`），`ilvl` 随嵌套深度计算
- **bullet 字体回退**：无序符号加 Symbol 字体（Word/pandoc 标准做法），避免系统字体缺失 U+2022 时显示为方框
- **加粗/斜体**：补充 complex-script 变体 `<w:bCs/>` / `<w:iCs/>`，各脚本环境均可生效

### 设置面板整体优化

- **全即时生效**：通用/编辑器移除「保存」按钮，所有设置改动即生效并自动持久化（zustand persist）；AI 面板 model/baseUrl/systemPrompt 由 onBlur 改为即时保存；「恢复默认」即时恢复并持久化；快捷键面板保留保存式（写 keybindings.json + 冲突校验）
- **布局统一**：各设置页左列固定 160px、右侧控件（下拉/滑条/输入框）等宽对齐（将 AI 页固定列布局泛化为全面板规则），消除"有的宽有的窄"
- **配置目录双项显示**：显示「程序运行位置」（appDir）与「用户配置存储位置」（`~/Documents/yizimarkdown/`，新增 Rust `get_user_config_dir`）
- **涟漪反馈默认勾选**：persist 升至 v3 对存量存档强制默认开启；修复「恢复默认」后涟漪被取消（DEFAULTS_EDITOR 漏改同步为 true）

### 图标可识别性优化

- **新建文档 / 从模板新建分工**：新建 `FilePlus2`、从模板新建 `LayoutTemplate`，不再混淆
- **导出主按钮**：`FileUp` → `Download`（导出语义清晰）
- **导出菜单格式徽标**：5 种格式改为无衬线大字字母（H / M / T / W / P，SVG text 19px@24 视口、weight 800、currentColor 跟随主题），小尺寸可读性优先
- **TXT 文案**：「导出为纯文本」→「导出 TXT 纯文本」（15 语言）

### 本地图片

- **支持 `file:///D:\...` 形式**：图片解析入口兼容 file:/// 前缀路径（浏览器禁止直接加载本地 file://，转为 Tauri 读取）

### 导出 DOCX 列表与表格还原（修复）

- **列表项加粗开头修复**：无序/有序列表项以 `**加粗小标题**` 开头时整项内容丢失（只剩一个空项目符号）→ 子事件先分类再分发，内联起始标签交行内渲染，不再被当块级事件丢弃
- **松散列表续段修复**：列表项第 2 段起退回 `Normal`（丢失列表缩进）、后续列表项丢编号 → 改为「谁消费 Start 谁消费配对 End」+ 闭合标签精确匹配，续段用 `ListParagraph` + 对齐缩进
- **空列表项**：保留编号/项目符号，不再整个项目消失
- **表格对齐预览样式**：整表 100% 宽、网格线用主题 `--editor-border`（原硬编码灰）、表头行主题 `--editor-surface` 底色 + 加粗 + 跨页重复、单元格紧凑间距 + 顶对齐、支持 GFM 列对齐

### 导出 DOCX 图片增强

- **HTML `<img>` 标签**：块级与行内 `<img src="...">` 均可嵌入（此前行内被直接丢弃、块级被当纯文本）；图片与文字混排时不丢文字
- **`width` 属性生效**：支持无单位 / `px` / `pt` / `%`；按预览语义忽略 `height`（预览 CSS `height:auto` 覆盖高度属性），始终保留宽高比不变形
- **网络图修复**：不再依赖 URL 扩展名（无扩展名/带缩放参数的图床 URL 此前被跳过）、支持引用式图片、按响应内容魔数判定类型、带浏览器 UA、失败留日志不再静默丢图
- **混排与比例**：图片与文字混排的 HTML 块保留文字；超宽图仍受 6in 上限约束

### 文档模板持久化

- **模板迁移到用户目录**：`templates/` 从安装目录迁至 `~/Documents/yizimarkdown/templates/`（与 v0.2.3 技能同理），卸载/重装/升级不丢，且不再受安装目录无写权限限制
- **启动自动同步**：内置模板在首次启动或应用版本变化时同步到用户目录，**只补缺失、绝不覆盖**用户已有/已改的模板；用 `templates.json` 记录已同步版本，用户删掉的内置模板不会被反复塞回
- **模板管理走用户目录**：设置 → 模板 的新建/编辑经新增的 `write_template` 命令写入用户目录
- **菜单即时刷新**：工具栏「从模板新建」每次打开菜单重新读取列表，新建模板后无需重启

## 踩坑记录

1. **`invokeTauri` 静默吞错导致"假成功"**：导出命令返回 Err 被包装器 catch 后返回 `null`，前端无条件弹成功 toast → 导出改用 `invokeTauriOrThrow`，真实错误如实上报
2. **同步命令 + `run_on_main_thread` + `recv_timeout` 主线程死锁**：`export_pdf` 是同步命令（主线程），`run_on_main_thread` 非阻塞投递后 `recv_timeout` 阻塞主线程 30s，排队的闭包永不执行 → 改为 async 命令 + tokio oneshot + `tokio::time::timeout`
3. **WebviewWindowBuilder 不支持 data URL**：wry `with_url` 明确"Data URLs are not supported"，data URL 导航被拒、页面永不加载 → 改用 tauri 自定义协议（`register_uri_scheme_protocol` + `WebviewUrl::CustomProtocol`）加载导出 HTML
4. **PrintToPdf 提交后立即关窗导致打印被取消**：回调永不触发、30s 超时 → 改为在打印完成回调里关窗，超时路径兜底关闭
5. **`globals.css` 的 `html,body{height:100%;overflow:hidden}` 锁死打印视口**：导出 PDF 只出一页 → 打印样式覆盖为 `height:auto;overflow:visible`
6. **serde 字段名 camelCase/snake_case 不匹配**：前端传 `monoFont`，Rust 结构体字段 `mono_font`，反序列化报 `missing field` → `#[serde(rename_all = "camelCase")]` + 单测锁定
7. **markdown-it 把 Windows 路径反斜杠编码为 `%5C`**：`![](D:\Users\...)` → `src="D:%5CUsers%5C..."`，绝对路径正则匹配失败 → 解析入口 `decodeURIComponent`
8. **`PrintToPdf` 在版本化接口 `ICoreWebView2_7` 上**：基础 `ICoreWebView2` 无该方法，需 `cast::<ICoreWebView2_7>()`
9. **tokio `oneshot::Sender` 不支持 `Clone`**（std mpsc 支持）：多条失败路径共享发送端需 `Arc<Mutex<Option<Sender>>>`
10. **WebView2 完成回调在后台线程**：回调内关窗需经 `run_on_main_thread` 或直接调用线程安全的 `Window::close`
11. **CM6 `update()` 中同步调用 `coordsAtPos` 导致插件崩溃**：折叠标签定位在 `update()` 事务里测坐标 → `CodeMirror plugin crashed`，插件被 CM6 禁用、滚动监听失效、标签滚动冻住 → 所有定位（update / geometryChanged / 折叠刷新）延迟到 `requestAnimationFrame`，滚动监听独立 rAF 重定位；用 Playwright + Edge 真实浏览器三阶段验证（视口内跟随 / 滚出跟随 / 滚回恢复）
12. **DOCX 嵌套列表塌陷**：`render_inlines` 遇到块级起始（嵌套 List）无脑递归吞掉内容，内层项与外层项并成同一段落 → 改为 peek 边界检测（块级起始不消费、交给块级渲染）+ level 区分 End 归属（内联 End 内层消费、块级 End 归调用者），并用 docx-preview 真实渲染验证
13. **1px 系统边框是 Windows 强调色**：`decorations:false` 的窗口在 Windows 11 被 DWM 画一圈 1px 强调色边框（本机 AccentColor=`#0078D4`），与应用代码无关、所有主题一致 → 用 `DWMWA_BORDER_COLOR` 染色为主题背景色
14. **设置面板保存式/即时式混存**：通用/编辑器要「保存」、外观/实时即时、AI 用 onBlur，且 zustand persist 已自动持久化、「保存」按钮冗余 → 全面板改即时生效，仅保留有副作用的操作（快捷键/API Key/CSS/模板）
15. **设置布局左列不定宽**：`max-width:55%` 只限上限，右列控件宽度随 label 长短变化 → 固定左列 160px（泛化 AI 页规则），Playwright 实测各页下拉/滑条/输入框等宽
16. **SVG text 字母小字号发糊 / 手绘 path 几何不标准**：字母徽标手绘 path 的 M/W 尖、P 尾巴比例影响识别，text 字号过小发糊 → 改用无衬线字体大字（19px@24 视口、weight 800、明确字体族）
17. **涟漪「恢复默认」漏改**：store 默认值已改 true，但 `DEFAULTS_EDITOR` 仍 false，点恢复默认后涟漪被取消 → 同步为 true + persist v3 强制存量开启
18. **配置目录语义错误**：显示的是程序运行目录（appDir），用户配置实际存于 `~/Documents/yizimarkdown/` → 新增 `get_user_config_dir` 并双项显示
19. **紧凑列表项没有 `Paragraph` 包裹**：`- **加粗小标题** 正常文本` 的行内事件直挂在 `Item` 之下，`Tag::Item` 分发却把 `Start(Strong)` 当块级事件消费后丢弃（块级渲染器对内联标签无匹配臂）→ 加粗内容消失、事件流错位、`End(Strong)` 被误当 `End(Item)`、整项内容被吞掉 → 子事件先分类再分发，内联起始不消费
20. **`render_inlines` 的 level=0 不消费配对 `End` 反噬外层**：消费 `Start(Paragraph)` 后 `End(Paragraph)` 残留，外层误把它当 `End(Item)`/`End(List)` → 松散列表续段退成 `Normal`、后续列表项丢编号 → 「谁消费 Start 谁消费配对 End」+ 闭合标签精确匹配
21. **网络图被扩展名白名单拦在门外**：先按 URL 扩展名决定是否下载，而大量图床/CDN 的 URL 无扩展名或带缩放参数（实测 unsplash `?w=800` 返回 `image/jpeg`）→ 根本不发请求、导出无图 → 改为解析器采集 URL + 魔数判定类型
22. **行内 HTML 图片被静默丢弃**：行内渲染没有 `InlineHtml` 分支（行内 `<img>` 直接消失），块级 `Html` 则把标签当纯文本写进文档 → 两处都接上图片渲染，并按预览语义处理 `width`
23. **CSS 颜色 ≠ OOXML 颜色**：OOXML 只接受 6 位 hex，而主题变量格式不一（`rgba()`、`#rgb`、**不带 `#` 的裸 hex**）→ 颜色归一化最初只认带 `#` 的形式，导致表格边框/表头底色整套静默回退默认灰（被单测抓到）
24. **文档模板写在安装目录**：设置 → 模板 的新建/编辑把路径拼成应用目录 → 卸载/重装即丢失，装在 Program Files 时还可能无写权限 → 迁移到用户文档目录 + 新增 `write_template` 命令
25. **常驻组件的文件列表会过期**：`Toolbar` 常驻挂载，模板列表只在挂载时读一次 → 设置里新建模板后菜单要重启才显示 → 改为「打开菜单时重新读取」

## 技术改进

- **`themeCursor.ts`**：统一生成三档主题色光标（标准/加粗 I-beam + 箭头），`MutationObserver` 监听主题 CSS 异步注入后重算，避免首帧取到默认色
- **新增 Rust 依赖**：`pulldown-cmark`、`zip`（deflate）、`webview2-com`、`windows-core`、`url`、`windows`（安装包增量约 1MB）
- **手写图片头部解析**：PNG/JPEG/GIF/BMP/WebP（VP8/VP8L/VP8X）宽高解析，零新依赖，保证 DOCX 图片按比例嵌入
- **单测覆盖**：DOCX 生成（zip 结构 + 语义断言）、serde camelCase 契约、图片头解析、本地图片端到端嵌入、嵌套列表层级
- **设置持久化迁移**：persist 升至 v3，`mouseSpotlight` 存量强制默认开启；新增 Rust `get_user_config_dir()`（`~/Documents/yizimarkdown/`）供设置面板展示
- **图标组件**：`FormatBadge` 无衬线大字字母徽标（SVG text，currentColor 跟随主题，与 lucide 同参）
- **真实浏览器验证**：Playwright + Edge（channel: msedge）复现折叠滚动问题并验证修复；docx-preview 渲染生成的 docx 断言加粗（fontWeight 700）、斜体、嵌套列表拆段（列表符号需 Word 查看，docx-preview 不支持 numbering）
- **DOCX 主题扩展**：`DocxTheme` 新增 `border` / `surface`（前端传 `--editor-border` / `--editor-surface`）；`css_color_to_hex` 把 `#rgb` / 裸 hex / `rgb()` / `rgba()`（alpha 按白底合成）统一为 OOXML 6 位 hex
- **DOCX 远程图两段式**：pulldown-cmark 采集图片 URL → 下载为 `RemoteImages`（url → data URL）映射 → 生成器按 `dest_url` 查表嵌入，一套逻辑覆盖行内式 / 引用式 / HTML 标签三种写法
- **模板同步机制**：`copy_missing` 递归复制（含模板内 `images/` 相对图片）+ `templates.json` 版本门控；`get_dev_project_root()` 统一 dev 资源定位（兼容 `target/debug/deps` 的测试二进制）
- **单测扩至 22 项**：新增表格保真、HTML 图片（块级/行内/混排）、`width` 尺寸与宽高比、颜色归一化、模板同步端到端（播种 / 不覆盖 / 升级不覆盖 / 路径穿越）
