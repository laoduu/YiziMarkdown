# v0.2.3

## 新增功能

### 划词助手（Selection Toolbar）

- **划词浮动工具栏**：在源码编辑器和预览模式中选中文本后，选区上方显示浮动操作栏（左对齐），提供 6 个操作按钮
- **技能快捷触发**：演示稿、摘要、改写、翻译四个按钮直接触发对应 AI 技能，传入选中文本而非全文
- **添加到 AI 对话**：将选中文本作为胶囊插入 AI 聊天输入区，附带完整文本（非截断显示名）
- **文本胶囊 hover 预览**：hover 文本胶囊时显示完整内容预览卡片（最大 200 字 + 省略号）
- **CM6 扩展集成**：CodeMirror 6 ViewPlugin 监听选区变化，锚点锁定避免拖拽时工具栏跟随移动
- **预览模式支持**：通过 `selectionchange` 事件委托，在 preview 和 split 模式下也能触发划词工具栏

### AI 聊天面板增强

- **划词 + 技能联动**：从划词工具栏触发技能时，输入区同时显示文本胶囊（📄）和技能胶囊（⚡），AI 只处理选中文本而非全文
- **智能消息构建**：`fromSelection` 模式下跳过全文注入，在用户消息中明确标注"请直接对以下选中文本执行操作，无需全文"
- **useDoc 勾选框隐藏**：划词触发技能时自动隐藏"引用当前文档"勾选框，避免用户困惑

### 多 AI 供应商扩展

- **小米 MiMo**：新增 `'mimo'` 供应商，OpenAI 兼容格式，默认模型 `mimo-v2.5`
- **美团 LongCat**：新增 `'longcat'` 供应商，OpenAI 兼容格式，默认模型 `LongCat-2.0`（大小写敏感）
- **i18n 覆盖**：两个供应商的 `providerMimo` / `providerLongCat` 标签已添加至全部 15 种语言

### 技能存储迁移

- **用户目录存储**：技能文件从应用目录迁移至 `~/Documents/yizimarkdown/skills/`，支持用户自定义
- **内置技能同步**：启动时自动同步内置技能到用户目录，版本号比较避免覆盖用户修改
- **技能定制指南**：新增 `skill-guide.md` 详细文档，AI 聊天面板底部"管理技能"按钮可直接打开

### AI 面板状态持久化

- **面板开关状态**：`aiPanelOpen` 持久化到 settings store，关闭后重开保持状态
- **待执行动作**：`aiPendingAction` 支持技能触发和文本胶囊两种类型，面板打开后自动执行

## 主题适配

### 划词工具栏主题跟随

- **专属 CSS 变量**：每个主题定义 `--toolbar-bg` / `--toolbar-text` / `--toolbar-border` / `--toolbar-hover` / `--toolbar-accent` 五个变量
- **暗色模式适配**：工具栏变量仅在亮色模式下定义，暗色模式不覆盖，工具栏始终显示亮色配色
- **固定高度**：工具栏 `height: 28px` + `box-sizing: border-box`，不受主题字体/行高影响

## 踩坑记录

### 1. contentEditable 剥离自定义 data 属性

**现象**：通过 `element.dataset.fullText = '...'` 设置的 `data-full-text` 属性，在 contentEditable 容器中被浏览器静默移除，`element.outerHTML` 中完全看不到。

**根因**：contentEditable 容器在内部重建 DOM 树时，会剥离非标准的 `data-*` 属性。`class`、`id`、`contenteditable` 等标准属性不受影响。

**解决方案**：
- ~~`data-full-text` 属性~~ → `Map<string, string>` + 唯一 CSS class ID
- 生成递增 ID（`tc-1`、`tc-2`...），加到 `className` 上
- Map 以 ID 字符串为 key 存完整文本，hover 时从元素 class 列表提取 `tc-*` 前缀查 Map

**教训**：在 contentEditable 容器中，永远不要依赖 `data-*` 属性存储数据。CSS class 是可靠的选择。

### 2. contentEditable 内部 DOM 重建导致 WeakMap 引用失效

**现象**：用 `WeakMap<Element, string>` 存储胶囊完整文本，`appendChild` 插入 contentEditable 容器后，`WeakMap.get()` 返回 `undefined`。

**根因**：contentEditable 的编辑引擎在接收子元素时，会内部克隆/重建 DOM 树。原始 JS 元素引用（WeakMap key）与浏览器重建后的新元素（`closest()` 找到的）不是同一个对象。

**解决方案**：
- ~~`WeakMap<Element, string>`~~ → `Map<string, string>`，用字符串 ID 做 key
- 字符串 key 不依赖对象引用同一性，不受 DOM 重建影响

**教训**：contentEditable 容器内的元素引用不可信。需要存储关联数据时，用字符串 key 的 Map/对象，不要用 WeakMap。

### 3. CM6 `coordsAtPos` 在 update 阶段调用崩溃

**现象**：`Error: Reading the editor layout isn't allowed during an update`

**根因**：`coordsAtPos` 内部调用 `readMeasured`，不能在 CM6 的 update 事务中同步调用。

**解决方案**：用 `requestAnimationFrame` 延迟到更新完成后读取坐标。

### 4. Portal 渲染脱离主题容器

**现象**：划词工具栏用 `createPortal` 渲染到 `document.body`，脱离了 `<html class="theme-xxx">` 的 CSS 变量作用域。

**根因**：CSS 变量从 `<html>` 继承，Portal 渲染到 `<body>` 虽然仍在 `<html>` 内，但暗色模式的 `.dark` 选择器会覆盖变量值。

**解决方案**：
- 每个主题在亮色模式下定义专属 `--toolbar-*` 变量
- 暗色模式选择器中**不覆盖**这些变量
- 工具栏始终读到亮色模式的值

### 5. 两套主题文件不同步

**现象**：`src/assets/themes/` 和 `src-tauri/themes/` 是两套独立的文件，运行时只加载后者。

**根因**：修改了 `src/assets/themes/` 但运行时从 `src-tauri/themes/` 读取，导致 CSS 变量未生效。

**教训**：修改主题文件时必须同时更新两个目录。

### 6. React Strict Mode 下 useEffect 重复执行

**现象**：debug 日志显示 mousemove listener 被 attach 了两次。

**根因**：React 18 Strict Mode 在开发环境下会执行 effect → cleanup → effect，确保 cleanup 正确。

**影响**：对功能无影响（第二次 effect 覆盖第一次），但 debug 日志会重复。

### 7. foldGutter 挤压标题文字

**现象**：`foldGutter()` 在行号栏显示折叠图标，但图标占据 gutter 空间，标题文字被推到右边。

**根因**：`foldGutter()` 是永久性 gutter 元素，与行号共享 gutter 空间。

**解决方案**：
- ~~`foldGutter()`~~ → 自定义 `ViewPlugin` + 绝对定位 `div`
- 用 `coordsAtPos(line.from)` 计算标题文字实际坐标，定位在标题左侧
- 不插入内容区 DOM，不影响标题布局

### 8. Decoration.widget 挤压标题文字

**现象**：`Decoration.widget({ side: -1 })` 插入折叠图标，但图标在内容流中，标题文字被推到右边。

**根因**：`Decoration.widget` 虽然用 `side: -1` 放在行首，但仍然是 inline/flow 元素，占据内容空间。

**解决方案**：
- ~~`Decoration.widget`~~ → 绝对定位 `div`，`position: absolute` 脱离文档流
- 图标浮在标题左侧，不占内容空间

## 技术改进

- **划词工具栏位置**：`position: fixed` + 视口坐标，`z-index: 2147483647`（32 位最大值）
- **左对齐定位**：使用选区起点 `from` 的坐标，工具栏左边与选区左边缘对齐
- **拖拽锁定**：追踪 `anchor`（锚点）变化，锚点不变 = 拖拽中，只更新文字不移动工具栏

### 标题折叠（Obsidian 风格）

- **hover 三角图标**：鼠标 hover 到标题行时，标题左侧出现 `▸` 折叠图标，移开隐藏
- **已折叠常显**：已折叠的标题始终显示 `▾` 图标，提示用户下方有折叠内容
- **绝对定位浮层**：三角图标通过 `coordsAtPos` 计算标题文字实际位置，不插入内容区，不挤压标题文字
- **折叠范围**：从当前标题到下一个同级或更高级标题
- **快捷键**：`Ctrl+Shift+[` 折叠、`Ctrl+Shift+]` 展开
- **新增文件**：`src/lib/cm-heading-fold.ts`（自定义 ViewPlugin）

### 实时模式分割线修复

- **修复 `---` 分割线渲染**：`cm-live-render.ts` 新增 `HorizontalRule` 节点处理，隐藏原文 + 添加 `border-top` 水平线样式
