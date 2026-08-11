# YiziMarkdown 开发日志

## v0.1.9

**演示模式（幻灯片）**

将任意 Markdown 文档按 `---` 分页渲染成**应用内全屏幻灯片**，模拟 PPT 播放，无需导出。参考 solomd 演讲模式的分页思路，围绕 Yizimarkdown 自身产品风格自研轻量引擎。

- **进入演示**：工具栏「放映」按钮、标签栏「演示」按钮、快捷键 `Ctrl+Alt+P`，三种方式均可
- **分页语法**：`---`（单独成行）横向主页面分页；`--` 纵向子页；代码围栏内不切分；front matter 自动忽略
- **自研引擎**：零新增依赖，复用 markdown-it + KaTeX + Mermaid 渲染管线，转场/背景/导航用 CSS transition + React 状态实现
- **跨平台全屏**：Tauri window API 优先、HTML5 Fullscreen 降级（Windows/macOS/Linux 体验一致），退出时自动恢复
- **主题继承**：进入时继承当前主题与明暗模式，演示内可切换；主题元素级配色（标题/代码/引用等）应用到幻灯片
- **指令系统**：每页顶部 `<!-- key: value -->` 注释指令，内置 `bg`（颜色/渐变/图片背景）、`layout`（hero/divider/content/image 命名布局）、`align`（内容对齐）、`class`（追加 CSS 类）、`notes`（演讲者备注）；支持自定义指令扩展
- **front matter 配置**：文档顶部 `slides:` 块配置 `theme`（默认主题）、`defaultLayout`（默认布局）、`splitHorizontal/splitVertical`（可改分页符）、`directives`（自定义指令→类）、`elementMap`（markdown 首元素类型→幻灯片元素的映射）
- **播放交互**：`→/←` 只在主页面间切换（跳过子页）、`↓/↑` 进入/退出纵向子页、`F` 全屏、`S` 备注、`?` 帮助、`Esc` 退出；右下角页码 HUD
- **示例与文档**：新增演示模板 `templates/演示模板.md`（含配置与指令示例），`help.md` 补充完整幻灯片语法章节

**Bug 修复**

- 修复 `tauri dev` 启动崩溃（EBUSY）：Vite 监听 cargo 写入中的 `src-tauri/target` 导致文件锁冲突，`server.watch.ignored` 排除 src-tauri
- 修复幻灯片列表不渲染：Tailwind preflight 重置了 `list-style`，显式还原 `ul/ol` 列表符号
- 修复 `Esc` 退出不彻底：操作系统截获 Esc 退出全屏时无法收到按键，新增全屏状态丢失检测，退出后恢复打开前视图
- 修复切换主题文字色不跟随：主题元素级规则作用域为 `.editor-content`，注入时改写为幻灯片作用域

## v0.1.8

**macOS 支持与跨平台适配**

- **macOS 客户端构建**：修复 Windows 专属依赖 `winreg` 在 macOS 上编译失败的问题，将其移入 `[target.'cfg(windows)'.dependencies]`；用 `iconutil` 从 icon.png 生成 `.icns` 并加入 `tauri.conf.json` 打包配置，打通 Tauri 在 macOS 的编译与打包
- **通用二进制（Universal Binary）**：新增 `aarch64-apple-darwin` 目标，以 `--target universal-apple-darwin` 构建，一份安装包同时含 x86_64 与 arm64 双架构，Intel 与 Apple Silicon 均原生运行
- **应用资源目录适配**：macOS `.app` 包中主题/模板等资源位于 `Contents/Resources`，而 exe 位于 `Contents/MacOS`。`get_app_root()` 增加 bundle 识别，正确返回资源目录，修复打包后主题、模板全部缺失的问题
- **全屏逻辑平台适配**：macOS 上 `toggle_maximize` 仅缩放不进入全屏。新增 `toggle_window_size` 命令，macOS 切换原生全屏、其他平台保持最大化；前端按平台轮询 `is_fullscreen`/`is_maximized` 状态
- **默认编辑器平台适配**：macOS 通过 LaunchServices（`LSSetDefaultRoleHandlerForContentType` / `LSCopyDefaultRoleHandlerForContentType`）设置/取消/检查 `.md` 默认处理器，Windows 保留注册表实现
- **系统字体获取跨平台**：`get_system_fonts` 由仅 Windows 的 PowerShell 调用改为分平台实现（Windows PowerShell / macOS system_profiler / Linux fc-list）
- **修复 macOS 启动白屏**：KaTeX 行内公式正则使用 lookbehind 断言 `(?<!\$)`，旧版 WebKit（macOS < 13.3）不支持导致 React 渲染崩溃。经排查该断言在行内渲染路径中冗余（含 `$$` 的行已被跳过），直接移除，行为不变且兼容旧引擎
- **修复 macOS 12 Mermaid 图表渲染失败**：mermaid 依赖 Constructable Stylesheets API（`new CSSStyleSheet()`，需 Safari 16.4+），旧 WebKit 抛 `Illegal constructor`。引入 `construct-style-sheets-polyfill`，仅在原生不支持时生效，不影响的 Windows/新版 macOS 的原生路径

**斜杠菜单输入触发**

- 新增输入 `/` 或 `、` 自动唤起斜杠菜单（此前仅支持 Ins 键唤起）
- 修复触发链路三处根因：
  - **IME 组合态下检测失效**：原 `view.composing` 守卫会在中文输入法（含英文模式）下跳过触发检测，导致中英文输入 `/` 均无反应。改为读取本次交易实际插入文本判断触发字符，中英文均可触发
  - **update 期间派发/读布局崩溃**：CodeMirror 禁止在更新期间调用 `view.dispatch` 与 `coordsAtPos`，原逻辑一触发即抛异常使插件失效。改为 `queueMicrotask` 延迟派发 `showSlashMenu`，坐标用 `requestAnimationFrame` 延迟测量
  - **关闭/定位事件不冒泡**：插件在子节点派发 `CustomEvent` 而 React 在父节点监听，默认不冒泡导致继续输入不关闭、菜单位置停在左上角。为 `slash-menu-close`、`slash-menu-update` 加 `bubbles: true`
- 交互行为：菜单在光标位置弹出；继续输入任意字符（如"我/你"）自动关闭，符合直接输入斜杠文本的使用场景

**HTML 渲染支持（预览模式）**

- 修复文档含大量 HTML 时预览/并排预览仍显示源码的问题：markdown-it 默认 `html: false` 会把 HTML 转义成源码。改为 `html: true`，让预览透传并渲染原始 HTML（表格、行内样式等）

**实时模式 HTML 渲染（所见即所得）**

- 块级 HTML（`<table>`、`<div>` 等，语法树 `HTMLBlock` 节点）在实时模式渲染为真实内容，光标落到块上自动还原源码可编辑
- 单独成行的行内 HTML 元素（如 `<span>…</span>`）同样按块级渲染
- 新增 `htmlBlockLines` 行集合，让 mermaid/公式/图片行扫描跳过块内内容，避免把表格单元格里的文本误判为独立块导致装饰重叠崩溃
- 为 HTML 块内的表格补充与预览一致的边框样式

**超链接外部打开**

- 修复预览中点击超链接在应用内导航（变成"无头浏览器"、用户无法返回）的问题：拦截预览内所有 `<a>` 点击，阻止应用内跳转，统一通过 `open_url` 调用系统默认浏览器打开

## v0.1.7

**实时模式任务列表优化**

- 实时模式任务列表改用 CM6 Widget Decoration，插入真实 `<input type="checkbox">` 替代 `::before` 伪元素，与预览模式视觉效果完全一致
- TaskCheckboxWidget 继承 WidgetType，实现 toDOM/eq/ignoreEvent 完整接口
- checkbox 与文字间距调至 0.5em，与预览模式对齐

**斜杠菜单优化（Ins键）**

- 重写 SlashMenu 为 Notion 风格全 icon 网格，16 个选项统一为图标+标签卡片
- 代码块无作用问题修复，添加 codeBlock case 到 handleSlashMenuSelect
- 菜单宽度从 220px → 320px，图标和文字尺寸调大，内边距优化

**6款全新主题（17→20款）**

差异化风格，涵盖多种设计语言：

- **Kindle电子墨水**：暖灰纸张底色，衬线字体，段落首行缩进2em，三点星分隔线，模拟电子阅读器排版
- **莫兰迪**：意大利静物色彩哲学，标题左侧粗竖色条，整面粉藕色块引用，表格交替色行，虚线链接
- **故宫朱砂**：中式宫廷美学，标题朱砂红双底线，引用块「」装饰，琉璃金链接，金色渐变分隔线
- **Aurora极光**：标题渐变色流动动画，彩虹光带分隔线横向流动，引用块呼吸光晕脉动
- **Vaporwave蒸汽波**：深色透视网格滚动，CRT扫描线分隔线闪烁，链接悬停故障glitch，霓虹脉冲标题
- **Chalkboard黑板粉笔**：深绿黑板底色，粉笔颗粒text-shadow质感，手写体标题，便签纸代码块（旋转+暖黄），波浪线SVG分隔线

**字体设置优化**

- 修复系统字体列表中文乱码：PowerShell 输出添加 UTF-8 编码
- 新增6款推荐互联网字体（需联网，选中后自动从国内CDN加载）：
  - 霞鹜文楷 LXGW WenKai（手写楷体）
  - 思源宋体 Noto Serif SC（Google开源宋体）
  - 思源黑体 Noto Sans SC（Google开源黑体）
  - Lora（优雅英文衬线）
  - Source Han Serif SC（Adobe思源宋体）
  - MiSans 小米字体（现代无衬线）

**其他**

- Tauri 窗口前置技巧（always-on-top）
- 双击标签关闭文档

## v0.1.6

**单实例多标签**

- 集成 tauri-plugin-single-instance，双击 .md 文件或通过文件关联打开时，不再启动新窗口，而是合并到已有实例中以新标签页打开
- 已打开的文件重复打开时，自动切换定位到该标签页，路径匹配做了归一化处理（统一分隔符 + 忽略大小写），避免因路径格式不一致导致匹配失败
- 已有窗口最小化时，自动恢复并聚焦到前台
- Rust 端通过 serde_json 序列化路径后 eval 调用前端全局函数，绕过事件系统的时序问题，确保每次调用都可靠到达前端

**快捷键系统优化**

- F1 改为弹出快捷键大全面板，方便记不住快捷键的用户随时查阅（再次按 F1 关闭）
- F2 改为切换深浅模式（原 F1）
- F3 改为循环切换视图（原 F2）
- 新增 Ins 键触发斜杠菜单，通过自定义 DOM 事件桥接全局 keydown 和 CM6 ViewPlugin
- keybindings.json 默认配置同步更新，设置-快捷键页新增 showShortcuts 和 slashMenu 两个可配置项
- 快捷键大全面板为横宽卡片网格布局（3 列），按分类展示，读取实时配置而非写死，支持 Esc 和点击遮罩关闭

**查找替换修复**

- 修复按 Ctrl+F 时同时弹出 CM6 内置英文搜索面板的问题，过滤掉 searchKeymap 中 Mod-f 的 openSearchPanel 绑定

**液态玻璃主题修复**

- 修复预览模式下长行内代码换行后模糊的问题，添加 word-break: break-all + overflow-wrap: break-word + box-decoration-break: clone
- 修复实时模式下列表中行内代码高亮不按主题色渲染的问题

**其他修复**

- 修复版本号不一致：Cargo.toml 中 0.1.5 → 0.1.6
- 设置-外观页恢复"自定义 CSS"选项

## v0.1.5

**快捷键系统全面重构**

- 快捷键从摆设改为真正生效的配置系统：keybindings.json 后端存储 + 前端运行时反转匹配
- 新增 keybindings.ts 中央模块，管理 action 定义、加载、保存、冲突检测、按键匹配
- App.tsx handleKeyDown 通过 resolveAction(event) 统一匹配，覆盖全部 30 个 action
- 设置页改为可视化配置面板：按分类分组、按键录制、冲突检测、恢复默认，替代旧 JSON 编辑器

**快捷键覆盖扩展**

- action 从 5 个扩充到 30 个，覆盖文件（新建/打开/保存/另存为/关闭/导出 HTML/导出 MD/导出文本）、编辑（撤销/重做/搜索/切换侧边栏）、格式（粗体/斜体/删除线/行内代码/三级标题/无序列表/有序列表/引用/链接/图片/代码块/表格/分割线）、视图（深浅切换/视图循环/开发者工具）
- 默认快捷键方案：Ctrl+B/I/-/+/1/2/3/./0/'/K/`/T/L/H/M 及 F1/F2/F12
- 新增 image 和 exportTxt 两个未绑定 action（留空供用户自定义）

**快捷键录制与冲突检测**

- 按键录制使用 e.code 取物理键名，不受输入法影响
- 录制要求必须带修饰键或功能键才触发，Escape 取消
- 冲突检测：设置重复快捷键时显示琥珀色警告框 + 红色边框，冲突时禁止保存
- 恢复默认功能同步更新 map 和 originalMap，hasChanges 计算正确

**视图与主题优化**

- 视图切换合并为 viewCycle 单键循环：源代码 → 并排 → 实时 → 预览，与页面按钮顺序对齐
- 深浅模式双向切换：同一快捷键在明暗间切换，修复闭包 bug（改用 store 实时值）

**表格行列选择器**

- 工具栏表格按钮改为 8x8 行列网格下拉选择器，点选即插入对应行列的 Markdown 表格

**插件系统**

- 新增插件架构：EditorPlugin 接口 + Registry 注册表，支持 load/destroy/extendMarkdownIt/postRender/injectCSS 完整生命周期
- 插件按需动态加载（import()），未启用不占用资源
- 设置面板左侧菜单新增「插件」分类，支持启停开关 + 配置 UI
- settingsStore 新增 enabledPlugins、pluginConfigs 字段，跟随 persist 持久化

**KaTeX 数学公式**

- 内置 KaTeX 插件，支持行内 `$...$` 和块级 `$$...$$` LaTeX 公式渲染
- CSS 通过 Vite ?url 导入内联注入，避免打包后路径失效
- markdown-it-katex 解析语法 + katex.render 后处理兜底
- 工具栏新增公式按钮（Sigma 图标，选中文字自动包裹 `$`）

**Mermaid 图表**

- 内置 Mermaid 插件，支持流程图、时序图、甘特图等图表渲染
- 自定义 fence 渲染器输出 `div.mermaid`，postRender 调用 mermaid.render() 生成 SVG
- 支持主题配置（默认/深色/森林/中性），设置中即时切换
- 工具栏新增 Mermaid 图表按钮（Workflow 图标）
- 实时模式下通过 CM6 Widget（MermaidWidget）异步渲染 SVG，300ms 防抖

**焦点修复**

- 修复语音输入法无法获取编辑器焦点的问题（e.preventDefault → e.stopPropagation）
- 保留浏览器原生焦点分配机制，仅阻止事件冒泡

**Bug 修复**

- 修复 Mermaid 实时模式不渲染（cm-live-blocks.ts 新增 MermaidWidget）
- 修复刷新/启动后 Mermaid 渲染消失（App 启动时自动加载已启用插件）
- 修复 Mermaid 主题切换不即时生效（移除跳过已渲染逻辑，data-source 存原始代码）
- 修复公式变形严重（KaTeX CSS 多回退加载策略）

**工具栏优化**

- 新增公式、Mermaid 图表入口按钮（表格右侧、分割线左侧）
- 工具栏整体间距收紧：padding 12→8px，按钮 w-8→w-7，组间 gap 1px

**主题管理系统**

- 新增 themes/theme.json 统一管理主题元信息（名称、色板、描述），前端动态读取替代硬编码
- 设置面板主题列表从 theme.json 动态加载，支持内联色板预览、点击编辑主题名称
- Toolbar 主题菜单同步改用 theme.json 动态读取，去除硬编码 nameMap
- Rust 后端新增 read_theme_json / write_theme_json / list_themes / read_theme_css 命令

**主题扩充与优化**

- 从 7 套主题扩展到 14 套：新增液态玻璃、荔枝红、紫罗兰、赛博朋克、Facebook、黑客帝国、薄荷冰沙、落日熔金、复古打字机
- 删除风格重复或不佳的主题：claude、老报纸、小米、星辰紫
- 所有主题文件名去掉 test- 前缀，CSS 内部选择器同步更新
- 为所有主题补充暗色模式覆盖：h1/h2/h3/code/blockquote/strong/a/th/td 元素全部适配

**液态玻璃主题深度重写**

- 全面注入玻璃材质效果：backdrop-filter 毛玻璃模糊、顶部折射高光线（::before 伪元素）
- 行内代码改为玻璃胶囊：半透蓝底 + 蓝色细边 + 内发光阴影
- 代码块改为毛玻璃深板：极淡蓝灰底 + 顶部折射光线 + 外层柔和阴影
- 引用块改为折射玻璃卡片：半透明白底 + 毛玻璃 + 左侧蓝线 + 顶部折射光带
- 表格改为玻璃卡片：毛玻璃面板 + 表头蓝底分隔 + 交替行淡蓝 + 悬浮高亮
- 分隔线改为双线折射：主光线渐变 + ::after 偏移副光线
- 粗体/斜体调整为蓝色系 + 光晕效果，与玻璃风格统一

**纯暗色主题亮色模式重写**

- 黑客帝国：白底绿字终端风格（#f5faf5 + #008a2e），暗色恢复绿色发光
- 落日熔金：暖白底琥珀色（#fef8f0 + #b45309），暗色恢复金色光芒
- 复古打字机：老纸底深褐墨色（#f5f0e8 + #8b6914），暗色恢复暖金字
- 赛博朋克：冷白底霓虹青粉（#f0f4f8 + #0077b6），暗色恢复霓虹发光

**字体系统升级**

- 默认字体栈改为 MiSans 优先方案：MiSans → system-ui → PingFang SC → Segoe UI → Microsoft YaHei → Noto Sans SC
- 有 MiSans 的用户直接命中，没有的用户自动回退到各平台最佳系统字体
- 编辑器和预览模式默认字体同步更新
- 历史用户自动迁移：settingsStore 检测旧字体栈并自动替换为新方案

---

## v0.1.4

**实时编辑模式（WYSIWYG）**

- 新增「实时」视图模式，位于并排和预览之间
- 边写边渲染：标题、粗体、斜体、删除线、行内代码、链接、引用、代码块等格式实时可视化
- 光标进入格式行时自动回显 markdown 标记，方便编辑原始语法
- 表格渲染为真实 HTML `<table>`，点击单元格直接编辑内容，失焦自动写回 markdown 源码
- 图片渲染为真实 `<img>` 元素，光标进入时回退源码
- 基于 CodeMirror 6 ViewPlugin + StateField 架构，参考 SoloMD 实现移植适配
- Tab 栏新增「实时」按钮（Sparkles 图标）

**主题样式优化**

- 行内代码背景对比度提升：使用 `color-mix` 混合文字色增强可见度
- 行内代码文字统一为主题色（`var(--editor-accent)`），6 套主题全部对齐
- 行内代码胶囊圆角增大至 5px
- 新增 lychee 主题、violet 主题

**实时模式动画系统**

- 4种标记显现动画方案：聚焦（模糊对焦）、闪光（亮度脉冲）、辉光（模糊+闪光）、涟漪（多波峰衰减）
- 设置 → 实时模式独立菜单，支持方案卡片选择 + 实时预览演示
- 动画使用GPU加速的filter属性，性能开销可忽略
- 数据属性驱动，切换方案即时生效

**列表渲染**

- 实时模式下无序列表（`-`）自动渲染为圆点样式
- 实时模式下有序列表（`1.`）保留数字序号显示

**修复**

- 修复撤销/重做按钮不生效的问题
- 修复拼写检查开关无效的问题
- 修复实时模式Decoration排序导致白板崩溃的问题
- 修复表格单元格点击全选的问题
- 修复表格编辑写入错误位置的问题
- 修复输入焦点丢失的问题

**优化**

- 移除无效IME workaround（确认Chromium 149 bug无前端解法）
- 移除未使用依赖（marked、html-to-text）
- vite manualChunks拆分，降低主包体积

---

## v0.1.3

### Bug修复

1. **导出按钮主题色修复** — 导出按钮添加 accent 属性
2. **导出菜单不可见** — 下拉菜单改为 fixed 定位
3. **搜索与替换面板关闭按钮无效** — 移除下划线前缀
4. **导出改为系统保存对话框** — 新增 save_file_dialog
5. **新打开文件小圆点误触发动画** — 新增 syncingFromExternalRef 标记
6. **同步滚动精度优化** — 完全重写同步滚动机制
7. **并排模式下大纲点击不滚动** — navigateToLine 新增 split 模式分支

### 样式优化

1. **行内代码背景对比度提升** — color-mix 混合文字色增强对比
2. **行内代码文字统一为主题色** — var(--editor-accent) + 5px 圆角

---

## v0.1.2

**关于页面重设计** — 应用图标 + 产品名 + slogan + 链接列表 + 版权信息
**链接修复（Tauri 2 兼容）** — Rust 端 open crate 实现 open_url 命令
**快捷键设置页统一** — 底部固定栏 FooterBar
**文件关联图标修复** — 独立 md-icon.ico 文件
**版本号单点管理** — tauri.conf.json 作为唯一版本来源
**DevTools 开放** — F12 / Ctrl+Shift+I 打开开发者工具
**帮助文档** — 新增完整 help.md
