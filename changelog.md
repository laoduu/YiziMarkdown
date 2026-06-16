# YiziMarkdown 开发日志

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
