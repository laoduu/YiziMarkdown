# YiziMarkdown 开发日志

## v0.0.26

**格式化按钮优化**

- 粗体、斜体、删除线、行内代码：正确包裹已选中文字（对称包裹模式）
- 标题、列表、引用等前缀类格式：已选中文字上添加前缀，多行选区每行加前缀
- 链接/图片：选中文字自动填入显示文本，光标定位到 URL 占位符

**本地图片渲染**

- Rust 新增 read_image_base64 命令，读取本地图片文件返回 data URL
- 预览面板自动检测本地路径图片（含盘符如 C:\），转为 base64 渲染
- 网络图片（http/https）不受影响，正常渲染

**文件保存状态体验**

- 未修改文件：Tab 无圆点，关闭无需确认
- 已修改未保存：主题色圆点 + 呼吸缩放动画（1.8s 循环）
- 保存后：圆点变为 ✅ 图标 + 弹出动画，1.5s 后恢复为无圆点
- 未保存关闭确认：弹出「保存 / 不保存 / 取消」三按钮弹窗
- Ctrl+W 同样触发关闭确认流程

**性能优化**

- 预览渲染防抖 150ms：打字时不再每键触发 markdown-it 全量渲染
- 大纲缓存：滚动时不再每帧重新解析整篇文档的标题结构
- persist 防抖 2s：打字时不再每键写入 localStorage
- activeTab 选择器稳定化：autoSave useEffect 不再因渲染引用变化反复触发
- CodeMirror HighlightStyle 去重：66 条规则精简为 42 条

## v0.0.25

**多文件 Tab 系统**

- 重构 editorStore 为多文件架构：FileTab interface（id/name/filePath/content/isSaved/viewMode）
- 新增 TabBar 组件：首页 Tab + 文件 Tabs + 新建按钮 + 视图模式切换
- 新增首页组件：品牌标题 + 最近打开文件列表（含文件大小和修改时间）+ 空状态
- 视图模式按钮移至 Tab 栏右侧，仅在有活跃文件时显示
- 关闭 Tab 自动切换到相邻 Tab，全部关闭回到首页
- Rust 端新增 get_file_meta 命令（返回文件 size + modified 时间戳）

**三种启动场景**

- 初次打开（无 persist 数据）：自动打开 welcome.md，预览模式
- 非初次打开：恢复 persist 数据（tabs/activeTabId），无活跃 Tab 时显示首页
- 双击 .md 文件打开：通过 CLI 参数直接打开文件，预览模式

**设置面板优化**

- 栏头「偏好设置」字号缩小为正常栏头大小（13px）
- 自动保存滑块 1 秒 / 10 秒文字间距修复（label 在滑块下方独立显示）
- 外观面板：主题选择即时预览即时生效，去掉「保存」按钮，仅保留「恢复默认」
- 编辑器面板：字号和行高拆分为源代码模式和预览模式独立设置
- 编辑器面板：字体也按模式分开设定
- 显示行号修复：使用 CodeMirror Compartment 动态切换 lineNumbers 扩展
- 出厂默认：字体 20px、行高 2.0
- 关于页面：readme 渲染字体调大 + 支持滚动

**新建文件保存流程**

- 新建文件（无路径）按 Ctrl+S 自动弹出「另存为」对话框
- 保存后自动更新 Tab 名称为实际文件名

**其他修复**

- 移除 Editor.tsx 内部视图模式切换按钮（与 TabBar 重复）
- Sidebar 大纲高亮改为响应式订阅（zustand selector 替代 getState 一次性读取）

## v0.0.24

**双击 .md 文件正确打开**

- 修复：双击关联的 .md 文件时，程序仍打开上次编辑文件的 bug
- Rust 端解析命令行参数（std::env::args），通过 AppState 传递给前端
- 前端启动时优先检查 CLI 传入的文件路径，覆盖 persist 恢复逻辑

**设置面板：保存 / 恢复默认**

- 通用、外观、编辑器三个面板改为临时状态模式
- 点击「保存」才批量写入，「恢复默认」重置为出厂预设

**设置弹窗样式优化**

- 头部高度压缩，内容区字体缩小，Section 间距收紧

**图标更新**

- 全新应用图标：上半蓝色 + 白色 Yizi，下半橙色 + 白色 Markdown

**.md 文件关联**

- HKCU 注册表写入，一键设为默认 Markdown 编辑器
- Rust 端三个命令：associate_md_files / disassociate_md_files / is_md_associated

**侧栏默认显示大纲**

**打包防白板规则建立**

**修复**

- App.tsx 泛型类型错误、Sidebar.tsx 未使用 import、markdownRenderer.ts 未使用 import

---

## v0.0.23

**主题扩展**

- 新增学术蓝、活力橙主题，重写科技感主题，主题总数扩展到 6

**UI 优化**

- 导出菜单加宽，新增另存为功能，新增 Toast 提示，搜索增强

**大纲驱动滚动同步（hub-and-spoke 架构）**

- 源代码 scroll spy → 预览 scroll spy → 并排联动（5 次迭代最终方案：lastSyncSourceRef + useEffect 单向同步 + isSyncingRef 防循环）

**Sidebar 重构**

- 大纲 ID 生成统一使用 computeOutlineItems

---

## v0.0.22

**面板架构重构** — flex 比例 + pointer-events 控制显隐，解决切换视图时滚动位置丢失

## v0.0.21

**编辑器内核升级** — CodeMirror 6 升级到 6.43.1，新增 lineBlockAtHeight API

## v0.0.20

**状态持久化** — Zustand persist 中间件，跨会话恢复编辑器状态

## v0.0.19

**模板系统** — templates/ 目录 + 设置面板模板管理

## v0.0.18

**设置面板完善** — 系统字体选择器，编辑/预览分别设置字体字号行高

## v0.0.17

**快捷键和 CSS 自定义** — keybindings.json + user.css 双层样式系统

## v0.0.16

**主题系统** — 极简风/杂志感/科技感/自然风四套主题 + 深色模式

## v0.0.15

**深色模式** — 亮暗双主题切换

## v0.0.14

**基础导出** — HTML/Markdown/纯文本三种格式

## v0.0.13

**侧栏文件浏览** — 目录浏览、文件夹展开、点击打开

## v0.0.13 之前

- 基础编辑和预览、打开保存新建、搜索替换、自动保存、便携版目录结构
