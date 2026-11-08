# YiziMarkdown


![image](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/index.png)

[简体中文](./readme.md) | [繁體中文](./docs/i18n/readme-zh-TW.md) | [English](./docs/i18n/readme-en.md) | [日本語](./docs/i18n/readme-ja.md) | [한국어](./docs/i18n/readme-ko.md) | [Deutsch](./docs/i18n/readme-de.md) | [Français](./docs/i18n/readme-fr.md) | [Español](./docs/i18n/readme-es.md) | [Português](./docs/i18n/readme-pt.md) | [Italiano](./docs/i18n/readme-it.md) | [Polski](./docs/i18n/readme-pl.md) | [Nederlands](./docs/i18n/readme-nl.md) | [Türkçe](./docs/i18n/readme-tr.md) | [Svenska](./docs/i18n/readme-sv.md) | [Українська](./docs/i18n/readme-uk.md) | [Русский](./docs/i18n/readme-ru.md)

**官方网站：** https://md.yizigpt.com

YiziMarkdown 是一款以「写作」为中心的跨平台 Markdown 编辑器。同一份 `.md` 文件，提供七种呈现方式：`源码编辑`、`并排校对`、`实时书写`、`成品预览`、`幻灯片演示`、`成书阅读`，以及只留下文字、专注写作的`禅模式`。

- **Windows**：可安装（NSIS 安装包，支持应用内一键更新），也可下载便携版压缩包解压即用
- **macOS**：提供通用二进制安装包，Intel 与 Apple Silicon 均原生运行
- **Linux**：提供 Debian 系 `deb` 与免安装 `AppImage`（Ubuntu 22.04+ / Debian 12+，当前仅 amd64）

为什么开发一款 Markdown 编辑器？市面上的选择，要么观感欠佳，要么功能繁杂臃肿，很难找到一款兼顾简洁美观与上手舒畅的工具。于是便有了 YiziMarkdown，并坚持三件事：**界面好看**，**功能彪悍**，**场景多元**。

于是就有了现在的`YiziMarkdown`，涵盖`3种系统覆盖`、`7种使用模式`、`16种界面语言`、`15种明暗双色主题`、`5种AI Skill`、`7种导出格式`，而且，内置AI助手、云端存储等 创新功能，以及主题、技能、演示等开放文档，您可以构建出更多与众不同的使用体验。

这已经不再是一个简单的markdown编辑器，而是一款真正能覆盖您创作、工作、生活多种文档场景的多功能应用。

---

## 七种模式：一份文档，七种呈现

Markdown 的价值不只在「写」，也在「给谁看、怎么看」。YiziMarkdown 为同一份文档提供了七种呈现方式：前四种是编辑视图，在源码与成品之间来回切换；后三种是独立场景，把文档变成幻灯片、书页，或干脆只剩正文。

| 模式 | 一句话定位 | 入口 | 适合 |
|------|-----------|------|------|
| 源码 | 直接编辑原始 Markdown | `F3` / 视图按钮 | 精修结构、批量替换、改 frontmatter |
| 并排 | 左边写，右边即时对照 | `F3` / 视图按钮 | 校对排版、对照模板写作 |
| 实时 | 所见即所得，标记自动隐藏 | `F3` / 视图按钮 | 即时结构化创作 |
| 预览 | 只呈现最终排版 | `F3` / 视图按钮 | 检查成品、通读全文 |
| 演示 | 文档直接当幻灯片放 | `Ctrl+Alt+P` / 工具栏 | 分享、汇报、讲课 |
| 阅读 | 把文档排成一本可翻的书 | `Ctrl+Alt+R` / 工具栏 | 长文阅读、EPUB、沉浸式通读 |
| 禅 | 撤掉整个界面，只留文字 | `F9` / 工具栏 | 禅定模式 ，深度写作 |

`F3` 在源码 / 并排 / 实时 / 预览之间循环；演示、阅读、禅各有独立入口，彼此不冲突。

---

## Markdown 四项全能

![四种模式对比](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/4modes.webp)

源码、并排、实时、预览共享同一个编辑器内核与同一套 Markdown 能力，区别只在「信息密度」：从完全裸露的标记，到完全排好的成品。随时可以切换，切换时视图会尽量保持当前位置。

### 源码模式：该看到的都看到

- CodeMirror 6 内核：语法高亮、括号匹配、自动补全
- 行号、自动换行可独立开关；适合逐行精修与批量改写
- YAML frontmatter 原样显示，改元数据不必猜格式
- 表格、代码块、公式都以源码形式呈现，结构复杂时最可控

### 并排模式：边写边对

- 左侧源码、右侧预览，输入即刷新
- 滚动同步由大纲驱动，切换视图时自动定位到当前位置
- 适合校对排版、对照既有文档改结构

### 实时模式：所见即所得

- 输入时自动隐藏 Markdown 标记，光标离开后又恢复，专注内容本身
- 原创4 种标记显现动画（聚焦 / 闪光 / 辉光 / 涟漪），可在设置中预览与切换
- YAML front matter 渲染成 Obsidian 式可编辑属性面板：自动 / 文本 / 数字 / 复选框 / 日期 / 日期和时间 / 列表 7 种类型，类型按属性名全局记忆

### 预览模式：只看成品

- Markdown 即写即渲染，任务列表 checkbox 可直接点选
- 本地路径图片、网络图片、SVG 均自动渲染（jpg / png / gif / webp / svg / bmp）
- frontmatter 自动隐藏，看到的就是最终版式

### 四种视图共享的能力

- **搜索替换**：匹配项导航、全部替换
- **工具栏格式化**：粗体、斜体、删除线、行内代码，选中即裹
- **代码块增强**：highlight.js 语法高亮、语言标签、复制按钮、自动换行切换
- **表格选择器**：8×8 网格点选插入，行列数一目了然，增删行列，右键多功能菜单一应俱全
- **公式与图表**：KaTeX 行内 `$...$` / 块级 `$$...$$`，Mermaid 流程图、时序图、甘特图、类图、饼图等，配色跟随主题
- **格式工具栏折叠**：窗口变窄时自动收起，也可手动展开
- **行号与自动换行**：设置中可开关
- **大纲导航**：标题层级来自文档结构，与滚动位置联动

---

## 演示模式：把笔记一键转成幻灯片

![演示模式](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/slide.webp)

写好的笔记不必再导出到 PPT：使用内置 AI助手skill，一键提炼为精简演示版，切到演示模式，文档立刻变成全屏幻灯片。分页、分栏、版式都由 Markdown 结构自动推断，需要精确控制时再用 HTML 注释指令。

### 内容即幻灯片

- 不需要任何额外格式：`---`（水平分割线）分页
- 页内单独成行的 `***` 分栏，最多 4 栏
- 引擎分析整页结构，自动选择版式：标题、列表、表格、代码、图片、图表各有对应版式

### 14 种版式

封面、章节页、结尾页、目录、内容、列表、数据表、路线图、图文、图片、金句、代码、图表（Mermaid）、公式。

- 除「图文」需用 `<!-- layout: figure -->` 显式指定外，其余版式均由内容自动推断
- 内容页左对齐，标题带主题色下划线
- 金句页对角大引号：上引号挂左上、下引号挂右下，内容上下居中
- 封面自动读取 front matter 的 `author` / `date`

### 放映中的排版控制

- HUD 可调：字体（跟随主题 / 无衬线 / 衬线 / 等宽）、字重、字号、内容区宽高（50%~95%）
- 调整实时生效并持久化，下次放映沿用
- 过长的行内代码自动折行，不再被页面边缘截断
- 显式指令：`<!-- layout: xxx -->` 强制版式，`<!-- align: left|center|right -->` 整页对齐

### 放映与导航

- 左下角章节名 + 页码，底部主题色进度条
- `T` 打开目录抽屉，`G` 或底部输入框跳页
- 鼠标滚轮翻页：内容可滚动时先滚内容，到边界再翻页
- `F` 全屏 / 还原，支持从普通、最大化等任意窗口状态进入
- 退出后自动还原进入前的窗口状态；右上角退出按钮 1.5 秒无操作自动隐藏
- 主题继承：标题配色随主题变化，放映中也能切换主题与明暗

---

## 阅读模式：把文档排成一本可翻的书

![阅读模式](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/reading.webp)

阅读模式不是「全屏预览」，而是真的把正文排成固定页面：有封面、扉页、目录、页码，有纸张与翻页的动效。

- 入口：工具栏书本按钮或 `Ctrl+Alt+R`；`Esc` 退出并恢复原视图
- 版面：四边等边距的细边框包住书页，双页相连、中缝只有一条分隔线；书名在左上、章名 / 页码在左下、HUD 在右下，位置与演示模式一致
- 自动生成封面、扉页、目录页：书名取自 front matter `title` 或首个 H1，目录按标题生成并带页码，过长自动分页
- 真实分页：双页对开（窄窗口自动单页），有页码与阅读进度

### 翻页动画

4 种可选，设置中切换，默认为水平滑动：

- **水平滑动**（默认）：整页平移，干脆利落
- **3D 翻页**：书叶从右下角卷起、绕中缝弯折，翻动时纸面抬起、带受光与落影（单页模式绕书脊）
- **淡入淡出** / **缩放**：更安静的过渡

连按不会跳页；目录、页码、脚注等跳转不播动画。

### 书页级分页规则

段落按行拆分、标题不孤行、表格续页重复表头、代码块按行续排、列表按条目续排、整块图片等比缩放；正文段落自动段首缩进两字，续页不重复缩进。

### 导航与细节

- 目录抽屉：`T` 打开，按标题层级列出并标注页码，点击直达
- `G` 或页码输入框跳到指定页
- 脚注往返：点击引用跳到定义页并高亮，提供「返回引用」按钮；内部锚点同样按页跳转
- 阅读 HUD：右下角切换明暗、主题、字体（主题 / 衬线 / 无衬线 / 等宽）、字号与行距，只作用于本次阅读
- 位置记忆：按文档记住页码 / 章节，再次进入自动恢复
- 操作：方向键、PageUp / PageDown、空格、滚轮翻页，点击页面左右边缘也可翻页

### EPUB

打开 `.epub` 直接进入阅读模式：使用应用阅读主题（忽略出版社 CSS），读取内嵌封面、导航目录、图片、公式、Mermaid SVG、脚注与跨章节链接。DRM 加密与固定版式（漫画 / 画册）暂不支持。

---

## 禅模式：只留下文字

![禅模式](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/zen.webp)

`F9` 或工具栏的禅模式按钮进入。工具栏、标签栏、侧栏、AI 面板、状态栏按层次朝屏幕边缘收折淡出，只留正文；整个过程**不改布局**，正文一个像素都不移动。

- **世界还在**：鼠标贴住屏幕任一边（上 / 左 / 右 / 下），对应区域原地淡回；离开约 1.2 秒自动收回
- **常驻开关**：禅模式按钮不会消失，始终停在原位（周围一圈极浅的呼吸涟漪），既是「你在禅模式里」的状态锚，也是退出通道；`F9` / `Esc` 都能退出
- **只服务写作**：仅在源码 / 实时模式可用；切到并排、预览，或进入阅读 / 演示会自动退出
- **更干净的纸面**：隐藏行号与侧栏竖线、极淡暗角、指针静止 2 秒自动隐藏；纵向滚动条换成极简细条，随滚动或靠近右缘出现

---

## 文件与写作

### 文件与多标签

- **打开**：支持 `.md` / `.markdown` / `.txt` / `.epub`，EPUB 直接进入阅读模式
- **单实例模式**：多文件打开自动合并到已有窗口，重复打开的文件定位到对应标签页
- **Tab 标签栏**：切换、关闭、新建，支持拖动排序
- **首页**：最近打开的文件列表，含大小与修改时间
- **保存状态**：未保存文件的呼吸圆点，保存后 ✅ 确认动画
- **关闭确认**：未保存时弹出保存 / 不保存 / 取消

### 新建与模板

- 新建空白 Tab 显示「未命名新文件」
- 工具栏「从模板新建」按模板的 Markdown 结构创建文档；也可在 设置 → 通用 设定默认模板，之后 `Ctrl+N` 自动套用
- 模板存放在用户目录，放入 `.md` 即可使用，也可在 设置 → 模板 中新建 / 编辑

### 粘贴即 Markdown

从网页、Word / DOCX、Google Docs、Notion 等来源复制的富文本，粘贴时在内存中转换为规范 Markdown（标题 / 列表 / 表格 / 代码 / 引用 / 链接）；已有 Markdown 源与纯文本原样粘贴。

### 保存与导出

- **保存 / 自动保存**：手动保存 + 可配置间隔（5~180 秒，默认 60 秒）
- **另存为**：新建文件保存时自动弹出另存为对话框
- **导出**：HTML / Markdown / 纯文本 / Word（DOCX）/ PDF / PPTX / EPUB
  - DOCX 使用 Word 原生语义（列表、表格、代码块、引用、任务列表），表格样式对齐预览，图片支持本地路径、网络图片与 HTML `<img>`（可用 `width` 控制宽度）
  - PDF 与预览还原度一致并自动分页
  - HTML 附带左侧悬浮大纲卡片，点击条目直达章节（PDF 不含侧栏）
  - PPTX 继承演示模式的主题、明暗与版式，输出可编辑文本、表格、图片、形状与原生公式
  - EPUB 由内置插件提供，导出前可选章节拆分 / 封面 / 可见目录 / 阅读主题 / 文档信息
- **.md 文件关联**：设置中一键设为系统默认 Markdown 编辑器（Windows 注册表 / macOS LaunchServices）

### 云端存储（WebDAV）

- **文件浏览器**：侧边栏「云端」标签页浏览服务器目录树，可打开文档、新建文件 / 文件夹、重命名、移动、删除；深层目录面包屑折成「…」可下拉跳转，文件夹逐层懒加载
- **保存到云端**：本地文档一键上传，正文中相对引用的图片一并上传并保持目录结构；云端文档 `Ctrl+S` 直接写回
- **冲突保护**：保存前比对 ETag，远程被其他设备改过会弹窗选择「覆盖服务器版本」或「放弃本地修改并重新加载」，绝不静默覆盖
- **凭据安全**：用户名与密码存入系统凭据库（Windows 凭据管理器 / macOS 钥匙串），不写入配置文件
- **兼容性**：坚果云、Nextcloud、群晖等标准 WebDAV 服务（建议使用应用专用密码）

---

## 扩展与个性化

### AI 助手（侧边聊天面板）

- **18 家大模型供应商 + 自定义服务**：OpenAI、Anthropic、Gemini、xAI、Mistral、Groq、DeepSeek、通义千问、智谱 GLM、Moonshot Kimi、火山方舟、硅基流动、MiniMax、小米 MiMo、美团 LongCat、OpenRouter、OpenCode Go、Ollama（本地）；「自定义服务」支持 OpenAI 兼容 / Anthropic 兼容两种协议，自填 Base URL、模型 ID 与密钥
- **流式对话**：工具栏机器人按钮打开右侧面板，回复实时流式输出，可随时停止
- **思考过程**：推理模型的 reasoning / thinking 以可折叠区块展示，默认收起
- **密钥安全**：API 密钥存系统钥匙串，支持一键保存、清除、验证；本地端点（llama.cpp / LM Studio / vLLM 等）可留空
- **引用当前文档**：勾选后把当前文档作为上下文，可配置引用上限（64K~512K / 不限）与上下文轮数（0~20，默认 3）
- **结果落盘**：复制、插入到光标处，或一键创建为新文档

### AI 技能（Skill）

输入框 ⚡ 按钮弹出技能菜单，选中后技能 tag 插入光标处，提示词自动注入上下文。`skills/` 目录放入 `skills.json` + `.md` 提示词即可自定义。内置「演示稿提炼」「文档摘要」「润色改写」「全文翻译」「Markdown 格式化」5 个技能。

### 插件

- **核心能力默认内置**：KaTeX / Mermaid / 脚注 / 任务列表 / TOC 等文档语义功能不受插件开关影响
- **内置插件**：EPUB 导出（默认启用，可在插件页关闭；启用后工具栏导出菜单才出现）
- **插件标准**：manifest（版本 / API 版本 / 激活时机 / 权限 / 能力）→ 资格检查 → 懒激活 → 能力注册 → 停用清理；当前版本只加载编译进应用的内置插件

### 主题与外观

- **15 套内置主题**：液态玻璃 Prism（默认）、学术蓝、活力橙、科技感、极简风、杂志感、自然风、荔枝红、紫罗兰、赛博朋克、Facebook、黑客帝国、薄荷冰沙、落日熔金、复古打字机，每套均有亮暗两套配色
- **深色 / 亮色模式**：一键切换（`F2`）
- **字体自定义**：源码与预览分别设置字体、字号、行高
- **自定义主题**：设置 → 外观 → 自定义 CSS 中书写并保存，即以当前主题为基底生成「自定义主题」，粘贴整份新主题或只微调几个颜色都可以，保存立即生效
- **主题扩展**：`themes/` 目录放入 `.css` 并在 `themes/theme.json` 登记参数，重启后自动识别；令牌体系与规范见 `docs/THEME-DESIGN-SPEC.md`

### 多语言与界面

- **16 种界面语言**：简体中文（默认）、繁體中文、English、日本語、한국어、Deutsch、Français、Español、Português、Italiano、Polski、Nederlands、Türkçe、Svenska、Українська、Русский
- 设置 → 通用 → 界面语言一键切换，即时生效；界面文案、快捷键面板、插件说明随语言联动
- **首次启动自适应**：无安装器语言时按系统语言选择，不在支持列表内回退 English；语言项附带英文 `Language` 标识，中文界面下也能快速定位
- **界面字号**：80%–120%（默认 100%），只缩放界面文字与图标，面板尺寸与文档内容不受影响
- **设置面板**：通用、外观、编辑器、实时模式、AI 助手、云端、插件、快捷键、模板、文档、关于、产品，设置即时预览

---

## 快捷键

| 快捷键 | 功能 | 快捷键 | 功能 |
|--------|------|--------|------|
| Ctrl+N | 新建文件 | Ctrl+B | 粗体 |
| Ctrl+O | 打开文件 | Ctrl+I | 斜体 |
| Ctrl+S | 保存文件 | Ctrl+- | 删除线 |
| Ctrl+Shift+S | 另存为 | Ctrl++ | 行内代码 |
| Ctrl+W | 关闭标签 | Ctrl+1 | 一级标题 |
| Ctrl+H | 导出 HTML | Ctrl+2 | 二级标题 |
| Ctrl+M | 导出 Markdown | Ctrl+3 | 三级标题 |
| Ctrl+Z | 撤销 | Ctrl+. | 无序列表 |
| Ctrl+Y | 重做 | Ctrl+0 | 有序列表 |
| Ctrl+F | 搜索 | Ctrl+' | 引用 |
| Ctrl+\ | 切换侧边栏 | Ctrl+K | 链接 |
| F1 | 快捷键大全 | Ctrl+` | 代码块 |
| F2 | 切换深浅模式 | Ctrl+T | 表格 |
| F3 | 循环切换四种编辑视图 | Ctrl+L | 分割线 |
| F9 | 禅模式（仅源码 / 实时） | Ctrl+Alt+P | 演示模式（幻灯片） |
| F11 | 切换全屏 | Ctrl+Alt+R | 阅读模式 |
| Ins | 斜杠菜单 | F12 | 开发者工具 |

快捷键可在 设置 → 快捷键 中自定义：36 个 action 的可视化绑定、按键录制、冲突检测与恢复默认。

---

## 目录结构

便携版解压后：

```
YiziMarkdown/
├── YiziMarkdown.exe        # 主程序
├── readme.md               # 项目说明（本文件）
├── welcome.md              # 欢迎文档
├── docs/                   # 文档（THEME-DESIGN-SPEC.md 主题设计规范等）
├── user.css                # 用户自定义样式
├── keybindings.json        # 快捷键配置
├── themes/                 # 主题 CSS 文件
│   ├── liquidglass-prism.css # 液态玻璃 Prism（默认）
│   ├── academic.css        # 学术蓝
│   ├── vibrant.css         # 活力橙
│   ├── tech.css            # 科技感
│   ├── minimal.css         # 极简风
│   ├── magazine.css        # 杂志感
│   ├── nature.css          # 自然风
│   ├── lychee.css          # 荔枝红
│   ├── violet.css          # 紫罗兰
│   ├── cyberpunk.css       # 赛博朋克
│   ├── facebook.css        # Facebook
│   ├── matrix.css          # 黑客帝国
│   ├── mint.css            # 薄荷冰沙
│   ├── sunset.css          # 落日熔金
│   └── typewriter.css      # 复古打字机
├── skills/                 # AI 技能（Skill）
│   ├── skills.json         # 技能清单
│   ├── slides-outline.md   # 演示稿提炼
│   ├── doc-summary.md      # 文档摘要
│   ├── polish-writing.md   # 润色改写
│   ├── translate-fulltext.md # 全文翻译
│   └── markdown-format.md  # Markdown 格式化
└── templates/              # 内置文档模板（首次启动同步到用户目录）
    ├── default.md          # 默认模板
    └── Slide-Template.md   # 演示模板
```

> 提示：AI 技能与文档模板的真实存储位置都在**用户目录** —— Windows / macOS 是 `~/Documents/yizimarkdown/skills/` 与 `.../templates/`；Linux 是 XDG 文档目录下的 `yizimarkdown/`（如 `~/文档/yizimarkdown/`），系统没有文档目录时兜底 `~/.local/share/yizimarkdown/`。（程序目录下的同名文件夹是内置资源，首次启动会同步过去）。自定义内容请放用户目录，升级 / 重装不会被覆盖。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Tauri 2 (Rust) |
| 前端框架 | React 18 + TypeScript |
| 编辑器内核 | CodeMirror 6 |
| 状态管理 | Zustand (persist) |
| 样式方案 | Tailwind CSS + CSS 变量 |
| Markdown 渲染 | markdown-it |
| 国际化 | 自研轻量 i18n（16 语言） |
| AI 接入 | Rust 流式代理（OpenAI / Anthropic / Ollama 协议） |
| 构建工具 | Vite |

---

## 开发

### 环境要求

- Node.js 18+
- Rust (stable)
- Tauri CLI（`npm install -g @tauri-apps/cli`）

### 启动开发服务器

```bash
cd code
npm install
npm run tauri:dev
```

### Linux 开发态任务栏图标（可选）

elementary / GNOME 这类桌面按窗口的 `WM_CLASS` 查找同名 `.desktop` 里的 `Icon`；开发态没有安装包，也就没有 `.desktop`，Dock 只会显示通用图标（窗口本身的 `_NET_WM_ICON` 已由 Rust 侧补上，安装包不受影响）。执行一次：

```bash
npm run dev:icon           # 写入 ~/.local/share/applications/yizimarkdown-dev.desktop
npm run dev:icon:remove    # 撤销
```

之后重启 dev 窗口，Dock 即显示应用图标。

### 构建发布版

**Windows**

```bash
npm run tauri:build
```

构建产物：
- 便携版 exe：`src-tauri/target/release/yizimarkdown.exe`
- NSIS 安装包：`src-tauri/target/release/bundle/nsis/`

安装向导：首次安装先选安装语言（16 种，应用全部界面语言 + 巴西葡语），向导文案与装好后首次启动的语言都跟随该选择；升级 / 自动更新不会重置用户已选的语言。图标与侧栏 / 页眉图在 `src-tauri/installer/`，改品牌色后重跑 `powershell -ExecutionPolicy Bypass -File scripts/make-installer-art.ps1` 生成。

构建后手动复制 exe 和资源文件到 `public/YiziMarkdown-vX.X.X/` 目录分发。

**macOS（通用二进制，同时支持 Intel 与 Apple Silicon）**

```bash
rustup target add aarch64-apple-darwin
npm run tauri:build -- --target universal-apple-darwin
```

构建产物：
- 应用包：`src-tauri/target/universal-apple-darwin/release/bundle/macos/YiziMarkdown.app`
- 安装包：`src-tauri/target/universal-apple-darwin/release/bundle/dmg/YiziMarkdown_<ver>_universal.dmg`

**Linux（deb + AppImage）**

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf
npm run tauri:build -- --bundles deb,appimage
```

构建产物（**当前仅提供 amd64 / x86_64**；ARM 的 `arm64` deb 与 `aarch64` AppImage 暂不发布）：
- Debian 系安装包：`src-tauri/target/release/bundle/deb/YiziMarkdown_<ver>_amd64.deb`（约 16 MB，装到 `/usr/bin`，注册菜单项、图标与 `.md` / `.epub` 文件关联）
- 通用免安装版：`src-tauri/target/release/bundle/appimage/YiziMarkdown_<ver>_amd64.AppImage`（约 150 MB，自带 GTK / WebKit 与 GStreamer 媒体组件，双击即用）

注意：**必须在 Ubuntu 22.04 上构建**。24.04 编出的二进制要求 glibc 2.39，Ubuntu 22.04（2.35）/ Debian 12（2.36）会直接启动失败；`deb` 的 `libwebkit2gtk-4.1-0` 依赖同样把下限锁在 Ubuntu 22.04 / Debian 12（Debian 11 只有 webkit 4.0）。暂不提供 `rpm`：Fedora / openSUSE 的依赖名与 Debian 系不同，需要单独维护。

### 项目结构

```
code/
├── src/                    # 前端源码
│   ├── App.tsx             # 主应用组件
│   ├── components/         # UI 组件
│   │   ├── Editor.tsx      # CodeMirror 编辑器 + 预览
│   │   ├── Reader.tsx      # 阅读模式（分页 / 翻页）
│   │   ├── Slideshow.tsx   # 演示模式
│   │   ├── TabBar.tsx      # Tab 标签栏
│   │   ├── HomePage.tsx    # 首页（最近文件）
│   │   ├── Toolbar.tsx     # 工具栏
│   │   ├── Sidebar.tsx     # 侧栏（大纲 + 文件浏览）
│   │   ├── StatusBar.tsx   # 底部状态栏
│   │   └── SettingsModal.tsx # 设置面板
│   ├── stores/             # Zustand 状态管理
│   ├── lib/                # 工具库（markdown 渲染、主题、禅模式等）
│   └── styles/             # 全局样式
├── src-tauri/              # Rust 后端
│   ├── src/main.rs         # Tauri 命令（文件读写、主题加载、注册表等）
│   ├── icons/              # 应用图标
│   ├── themes/             # 主题 CSS（含 theme.json 元数据）
│   └── templates/          # 文档模板
├── docs/                   # 文档（changelog / i18n 多语言 readme / THEME-DESIGN-SPEC.md）
└── package.json
```

---

## 版本与更新

Windows 安装版可在应用内一键更新；macOS、Linux 与便携版启动时检查 `latest.json`，发现新版在右下角提示并打开对应版本的下载页（手动替换，不自动安装；Linux 的 `deb` 与 `AppImage` 都走这条通道）。

---

## 许可

MIT
