# v0.1.9

## 新增功能

### 演示模式（幻灯片）

将任意 Markdown 文档按 `---` 分页渲染成**应用内全屏幻灯片**，模拟 PPT 播放。参考 solomd 演讲模式的分页思路，围绕 Yizimarkdown 自身产品风格自研轻量引擎（零新增依赖）。

- **进入演示**：工具栏「放映」、标签栏「演示」、快捷键 `Ctrl+Alt+P` 三种方式
- **分页语法**：`---` 横向主页面、`--` 纵向子页，代码围栏内不切分，front matter 自动忽略
- **自研引擎**：复用 markdown-it + KaTeX + Mermaid 渲染管线，CSS transition + React 状态实现转场/背景/导航
- **跨平台全屏**：Tauri 优先 + HTML5 降级，退出自动恢复，体验一致
- **主题继承**：进入继承当前主题/明暗，演示内可切换；主题元素级配色应用到幻灯片
- **指令系统**：`<!-- key: value -->` 注释指令，内置 `bg` / `layout`（hero/divider/content/image）/ `align` / `class` / `notes`，支持自定义指令
- **front matter 配置**：`slides:` 块配置 `theme` / `defaultLayout` / `splitHorizontal` / `splitVertical` / `directives` / `elementMap`
- **播放交互**：`→/←` 切主页面（跳过子页）、`↓/↑` 进出纵向子页、`F` 全屏、`S` 备注、`?` 帮助、`Esc` 退出、页码 HUD
- **示例与文档**：演示模板 `templates/演示模板.md`、`help.md` 幻灯片语法章节

## Bug 修复

- **`tauri dev` 启动崩溃（EBUSY）** — Vite 监听 cargo 写入中的 `src-tauri/target` 目录触发文件锁冲突，`server.watch.ignored` 排除 src-tauri
- **幻灯片列表不渲染** — Tailwind preflight 重置 `list-style`，显式还原 `ul/ol` 列表符号
- **`Esc` 退出不彻底** — 操作系统截获 Esc 退出全屏时收不到按键，新增全屏状态丢失检测，退出后恢复打开前视图
- **切换主题文字色不跟随** — 主题元素级规则作用域为 `.editor-content`，注入时改写为幻灯片作用域
