# YiziMarkdown 开发日志

## v0.4.0

> **未发布**（截至 2026-10-26）：`package.json` / `package-lock.json` / `Cargo.toml` / `Cargo.lock` / `tauri.conf.json` 已升到 `0.4.0`，但**未打包、未打 tag**。用户向说明见 `docs/changelog/CHANGELOG-V0.4.0.md`。
>
> 原计划的 `0.3.7` 从未打包、未打 tag、未发过 release，其全部改动（实时模式列表逐行切换、嵌套列表输入法、界面文案多语言与硬编码门禁）已并入本节，不再单独保留 `## v0.3.7` 小节，`docs/changelog/CHANGELOG-V0.3.7.md` 同步并入 `CHANGELOG-V0.4.0.md`。

### 全屏与窗口状态整治：单一状态源 + 操作矩阵实测（2026-10-26）

用户报了 4 个全屏问题：全屏中拖动标题栏后窗口变得很大不还原、全屏中点最大化后底部出现黑带、最大化后进全屏退出不再回到最大化、全屏按钮图标状态不切换；另加一个 Esc 后窗口按钮残留绿色焦点框。

**根因**：窗口状态有 3 个互不同步的来源——DOM `document.fullscreenElement`、原生 `is_fullscreen` / `is_maximized`、`fullscreen.ts` 的模块级 `toggleSavedMaximized` 标记——彼此只靠 `WindowControls` 的 500ms 轮询勉强对齐。任何一条退出路径只要不经过 `toggleFullscreen`（Esc、演示卸载、原生事件），状态就分叉：

- **全屏中拖标题栏**：全屏态没有禁用拖动，`startDragging` 把 1920×1080 的全屏窗口整体拖到 (180,81)，大半个窗口出屏，退出全屏才恢复（实测 A2）
- **全屏中点最大化**：该钮直接 `toggleMaximize`，窗口变成原生最大化 `-8,-8,1928,1040`，底部露出 40px 任务栏/黑带（实测 A4）
- **最大化 → 全屏 → 退出**：Esc 退出不走 `toggleFullscreen`，`toggleSavedMaximized` 无人消费，窗口停在进入前被取消掉的最大化状态（实测 A7：退化回 1216×809）
- **图标状态不切换**：`WindowControls` 自带轮询 + 本地 state，与 DOM 事件各自为政

**修法（四层，职责单一）**：

1. **新增 `src/stores/windowStateStore.ts`** —— 窗口状态唯一数据源：`fullscreen`（DOM ∪ 原生取并集）、`maximized`、`preFullscreen` 进入前快照。`fullscreenchange` 事件即时刷新 + 500ms 轮询兜底（原生最大化变化没有 DOM 事件）；**「全屏 → 非全屏」转移钩子**消费快照统一还原——按钮 / Esc / 演示卸载等所有退出路径共享同一还原逻辑，快照先置 null 再异步还原（幂等，不会二次消费）
2. **`fullscreen.ts` 去模块状态** —— 删掉 `toggleSavedMaximized`；`enterFullscreen` 进入前（取消最大化之前）调 store 拍快照；`toggleFullscreen` 简化为纯进出，不再自带还原逻辑
3. **全屏态 UI 守卫** —— `Toolbar`：标题栏拖动、空白处双击、右键菜单「最大化」项在全屏中一律禁用/隐藏；`WindowControls`：改读 store（删组件内轮询与本地 state）；**Windows 全屏中隐藏最大化按钮位**（此时它与全屏钮都是「退出全屏」图标，两个相同图标并排无意义；mac 保留中键，mac 中键本身就是原生全屏切换）
4. **`Slideshow.tsx` 复用共享快照** —— 删掉自管的 `savedWindowState` 存/恢复（18 行），演示退出与手动全屏退出行为完全一致

**焦点框**：全局 `:focus-visible` 规则给窗口按钮也画了 2px 焦点框，点击触发 Esc（如退全屏）后焦点落在按钮上、按 modality 切换显示出来。修法：`btn` 通用样式与关闭钮加 `focus-visible:outline-none`（沿用 `slideshow.css` 的先例），全局规则保留，不影响键盘可达性。

**验证方式**（WebView2 调试端口开不了：wry 总是 `set_additional_browser_arguments` 覆盖 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` env，浏览器进程命令行里只有 wry 默认参数）：改用 **Win32 几何 + UIA 定位按钮 + SendInput + 截图** 在真实 dev 窗口上跑操作矩阵。UIA 细节：WebView2 按钮 `GetClickablePoint()` 抛 `NoClickablePointException`，用 `BoundingRectangle` 中心；按钮 Name 即 `title` 属性（`最小化/最大化/进入全屏/退出全屏/关闭/还原`）。修复前后各跑一轮对比：

| # | 操作 | 修复前 | 修复后 |
|---|------|--------|--------|
| A1 | F11 进/退全屏 | ✅ | ✅ |
| A2 | 全屏 → 拖标题栏 | ❌ 1920×1080 窗口被拖出屏外 | ✅ 拖动禁用，窗口不动 |
| A4 | 全屏 → 点最大化钮 | ❌ 原生最大化 + 底部 40px 黑带 | ✅ 钮隐藏；退出全屏还原原几何，无黑带 |
| A7 | 最大化 → 全屏 → Esc | ❌ 退化回 1216×809 | ✅ 回到最大化 |
| A12 | 还原 → Esc | ❌ 按钮残留绿色焦点框 | ✅ 无焦点框 |

`tsc` / `npm run build` / `npm test`（350 项）全过。

### 编辑区两处交互修复：滚动条悬停光标、宽度手柄避开滚动条（2026-10-26）

**滚动条悬停光标**：`.cm-editor-container[data-cursor]` 的容器级 I-beam 光标被 `.cm-scroller`（滚动条的命中元素）继承，hover 滚动条时光标仍是 I-beam。修法：`.cm-scroller` 显式回落 `var(--cursor-arrow, default)`；`.cm-content` 有自己的光标规则（更具体），正文区域不受影响。

**宽度手柄命中条盖住滚动条**：小窗口下正文列顶到面板边缘时，右边缘正好落在纵向滚动条上，以边缘为中心（±`STRIP_HALF` 8px）的命中条把滚动条整段盖住、点不到。修法：`ContentWidthHandles` 新增 `getScrollEl` prop（源码/实时 = `.cm-scroller`，预览 = 面板本体），实测滚动条占位宽（`offsetWidth - clientWidth`），把命中条往内推到「滚动条外沿 + 半宽 + 最小间距 6px」之外；横向滚动条同理抬高条的底端。宽窗口下正文列离边缘远，行为不变。

### 演示模式一键导出 PPTX（2026-10-25）

把演示模式导出成**原生可编辑**的 PowerPoint：文本、表格、图片、形状、列表圆点、原生 OMML 公式都是独立对象，只有 Mermaid 图表是位图（与 DOCX 导出同源，resvg 栅格化）。

**为什么不是截图**：整页 PNG 在 PPT 里不可编辑、不可选、不可换主题，与「演示即文档」的定位冲突；而 DOM 已经在演示里排好版，量出来就是坐标。

**架构（四层，职责单一）**：

1. `src/lib/slideDeck.ts` —— 从 `Slideshow.tsx` 抽出的**唯一**解析/渲染来源：`parseDeck` / `buildSlideHtml` / 主题作用域化 / 章节切分。演示与导出共用，避免两套排版漂移
2. `src/lib/pptxFrame.ts` —— 隐藏 iframe **1280×720 真实视口**复刻演示（`vw/vh` 只有这样才是 16:9 全屏的解析基准）；等样式/字体/图片就绪，Mermaid → PNG、本地图片 → data URL
3. `src/lib/pptxScene.ts` —— DOM 测量 → 场景图（inch 坐标 + 富文本 run + 形状/图片/表格/公式节点）；圆点与序号是**手绘形状**，几何/颜色/字号从伪元素 computed style 读
4. `src/lib/pptxBuild.ts` + JSZip 后处理 —— PptxGenJS 生成原生 PPTX，再补 OMML（`a14:m` + `mc:AlternateContent`）、`latin|ea` 字体拆分、渐变下划线（`gradFill`）、多余 `<a:pPr>` 清理、`xml:space="preserve"`

**换算**：13.333×7.5in，1px = 1/96in = 0.75pt；正文基准 26.88px → 20.16pt；`defineLayout` 用 `width: 40/3` 得到精确 12192000×6858000 EMU。

**入口**：工具栏导出菜单 + 演示 HUD 两处，共用一个 `PptxExportDialog`（弹窗打开时挂起演示的键盘/滚轮翻页，避免误翻页）；基准固定 1280×720，不跟随窗口。
**告警本地化**：`PptxWarning` 用结构化 `messageKey` + `messageArgs`（`pptxExport.warn*`，15 种语言），弹窗按当前界面语言渲染；`tests/pptxWarnings.test.ts` 从源码抽取所有 key 逐个语言核对，避免动态 key 拼错后把 `pptxExport.warnXxx` 原文抛给用户。

**验证**：临时端到端环境（headless Edge + 桩 Tauri 命令，见 `e2e-pptx/`，验证后删除）真实跑 `exportPptx`，导出 9 页样例（浅色 / 暗色 + 自动压缩各一份），LibreOffice → PDF → PNG 逐页目检：封面、章节页、列表页、表格、代码块、分栏卡片、Mermaid、图片、页脚、渐变下划线全部通过；52 个 XML part 全部良构。`npm test` 全部通过（新增 `pptxBuild` 9 项 + `pptxTheme` 8 项）；`npm run build` 通过。

**验证阶段揪出的 5 个真 bug**（都已修 + 加回归测试）：

1. **颜色解析**：Chrome 对普通颜色的 computed value 一律是逗号分隔的 `rgb(245, 248, 255)`，早先按空白切通道 → 解析失败 → `flattenColor` 静默返回 `000000` → 整个 deck 黑底黑字、整页空白。现已分别处理逗号 / 空格 / 斜杠三种语法，并对 `oklch()` 等用 canvas 兜底归一
2. **暗色表格行条纹**：`flattenColor(color, bg)` 的 `bg` 常常是本模块刚产出的 `0D1117`（无 `#`），`parseColor` 不认 → 退回白底 → 暗色主题里的半透明叠色全变成浅色。现在 6/8 位无 `#` hex 也能解析
3. **Mermaid 整块丢失**：栅格化后 `.mermaid` 里只有一个 `<img>`，既没有块级子元素也没有文本，`collectInline` 会跳过 `IMG`；现对「单图片容器」直接输出图片节点，并加了「既无图也无文字必须告警」的兜底。同时给 Mermaid 的 `<img>` 打 `data-ys-mermaid`，避免把主题给图片加的阴影/圆角照搬到 SVG 上
4. **圆角单位**：PptxGenJS 的 `rectRadius` 收的是**英寸**（内部再除一次短边得到 `adj`），早先传的是点 → 12px 圆角被放大成短边一半，代码块变胶囊形。现在按 `radiusPt / 72` 传入并封顶短边一半
5. **公式在 PowerPoint 里空白**：`mc:AlternateContent` 早先写在 `<a:p>` 段落内部，而 PowerPoint 自己的公式只把信封写在**形状层**；同时 OMML 缺失/为空时仍会生成空的 `<a14:m>`，PowerPoint 选中 Choice 后就是一块空白。现在按 PowerPoint 的写法把整个 `<p:sp>` 包进 `mc:AlternateContent`（Fallback 是同形状的 TeX 文本版），并在 OMML 没有可见文字时直接回退 `$TeX$`，绝不再产出空公式

**已知取舍**：表格单元格只保留纯文本（`\n` 分隔段落，不支持单元格内图片）；行内图片（与文字混排）不导出；`[toc]` 不生成超链接；超密内容在 warn 模式下会裁到页面外（改选自动压缩即可）。

### 实时模式修复：列表逐行、嵌套输入法、文案多语言（2026-10-25，原 0.3.7 计划内容）

> 这几组改动原计划作为 `0.3.7` 发布，但 `0.3.7` 从未打包、未打 tag、未发过 release；本版直接以 `0.4.0` 发布，以下内容全部并入，不再单独保留 0.3.7 日志。

#### 多级嵌套列表中中文输入法无法上屏（2026-10-25）

用户报：实时模式下在**多级嵌套**的有序 / 无序 / 任务列表里打中文，拼音字母（如 `nihao`）直接变成普通英文，候选词上不了屏；平级列表与普通段落正常。

**根因**：嵌套列表的外层 `BulletList` / `OrderedList` 与子列表节点会把同一行各扫一遍，同一行的 `- ` 被套上**两层** `cm-md-hiding-span`：

```html
<span class="cm-md-hiding-span"><span class="cm-md-hiding-span">- </span></span>
```

0.3.6 点进列表时整块显示源码、没有隐藏 span，所以没暴露；0.4.0 改成逐行后，**正在编辑的那一行也带隐藏 span**。重复的嵌套 span 让 CodeMirror 在每次输入时重排这层 DOM，输入法正在合成的文本节点被替换，合成被取消，拼音就留成了普通字母。

**修法**：

- 新增 `seenListLines`，与 `seenTaskLines` 同理按行去重：外层节点扫过的行，内层节点不再重复加装饰。嵌套行现在只有一个圆点类、一个隐藏 span
- `liveRenderPlugin.update` 在 `view.composing` 为真时直接返回，不在输入法合成期间重建装饰；`compositionend` 后的那次正常 update 再刷新

验证：多级嵌套（有序 → 无序 → 任务 → 有序任务）下微软拼音可正常上屏；`npm test` 329 项全过；`npm run build` 通过。

#### 实时模式列表逐行切换源码（2026-10-25）

用户报：实时模式下点击任务列表 / 无序列表 / 有序列表的任意一行，**整个列表一起变成源码**（`- `、`- [ ]` 全露，所有 checkbox 消失），期望只切换被点的那一行。

**根因**：`cm-live-render.ts` 用节点级 `caretTouches` 判断「光标是否在块内」。lezer 把整个列表解析成**一个** `BulletList` / `OrderedList` 节点，所以光标落在任意一行时该布尔值对整个列表都为真，列表里每一行都不再添加隐藏装饰。嵌套列表还被 `seenTaskLines` 去重放大：外层节点判定后，内层跟着整块不隐藏。

**修法**：新增 `liveSyntax.planListLine(lineText, caretOnLine)`，把无序 / 任务 / 有序任务的记号区间与 checkbox 位置收成纯函数，渲染层按**行号**调用：

- 记号隐藏与光标无关，始终添加；光标行由既有的 `.cm-md-caret-line .cm-md-hiding-span` 还原源码（与引用块、脚注、行内标记同一模型）
- checkbox widget 只在**光标不在该行**时插入；光标在本行显示 `- [ ]` / `[ ]`
- 光标行的列表圆点伪元素让位（`.cm-md-caret-line.cm-md-bullet-item::before { content: none }`），避免出现「• - 文本」
- 嵌套列表的行装饰按行去重（新增 `seenListLines`）：外层与子级列表节点不再重复给同一行加圆点类 / 隐藏 span，父子列表逐行判断互不影响
- 输入法合成期间（`view.composing`）不重建装饰，避免合成中的文本节点被替换

范围：无序列表、任务列表、有序任务列表与嵌套项。普通有序列表的编号本来就属于源码、始终可见，行为不变；引用块、脚注、围栏代码块、表格 / 公式 / Mermaid 等原子块均未改动。

验证：`tests/liveSyntax.test.ts` 新增 3 组用例（缩进、任务 checkbox 逐行开关、有序任务保留编号）；`npm test` 全过；`npm run build` 通过。

#### 实时模式文案接入多语言，补上硬编码门禁（2026-10-25）

0.3.6 发版时 `check-i18n --strict` 是通过的，但它只校验两件事：各语言键是否齐、`t()` 用到的键是否已定义。**它查不到「压根没走 `t()`」的中文字面量**。`cm-live-blocks.ts` 此前完全没有接入 i18n，0.3.6 新增的表格右键菜单、行列手柄、加行加列提示因此只有中文 —— 切换到英日韩等语言后仍是中文。

**① 表格右键菜单（25 项）**：剪切 / 复制 / 粘贴、文本格式子菜单（左 / 中 / 右对齐）、在上方 / 下方插入行、在左侧 / 右侧插入列、上移 / 下移该行、左移 / 右移该列、按此列升序 / 降序排序、清空选中的单元格、删除选中的行 / 列 / 单元格，以及行首 / 列首手柄与边缘「+」的提示。菜单在**每次打开时读取当前语言**，切换语言后无需重开文档。

**② 实时模式其他文案**：代码块「切换换行 / 复制代码 / 复制失败」按钮、`[toc]` 空状态「（当前文档没有标题）」；预览层代码块按钮标题与图片加载失败占位文字一并接入。

**③ 新增 `tableMenu` / `live` 命名空间**：`en.ts` 从 632 键增至 662 键，15 种语言全部补齐、零缺失。

**④ 为什么之前没暴露**：`src/i18n/index.ts` 的相对导入补上 `.ts` 扩展名 —— 否则 `node --test` 加载 `cm-live-blocks.ts` 时无法解析 i18n 模块（类型剥离不做扩展名补全），这条通路一直没被测试覆盖。

**⑤ 新增构建门禁**：`check-i18n` 增加第 4 项检查，扫描直接写进 `title` / `textContent` / `placeholder` / `aria-label` 的中文字面量，发现即失败。以后「键齐了但界面还是中文」会在 `npm run build` 阶段被拦住。

验证：`node scripts/check-i18n.mjs --strict` 662 键齐全、硬编码扫描通过；`npm test` 326 项全过；`npm run build` 通过。

> 同批推送还包含官网 0.3.6 内容更新（`cdc8d3c`：下载链接、更新记录面板、文档页适用版本），以及本次 i18n 修复提交（`623b0fc`）；官网仍以当前正式版 0.3.6 为准，不随 0.4.0 升版。

## v0.3.6

> 已发布（2026-10-25，`v0.3.6` = `53f6b25`）。用户向说明见 `docs/changelog/CHANGELOG-V0.3.6.md`。
>
> 本节覆盖 `v0.3.5`（`9af7392`）之后的全部应用侧提交：`45b9af9`（预览 / 实时 / 演示 / 导出九项修复 + 升版）与 `ba8db4b`（实时模式语法、表格交互与滚动）。同一区间的三个官网提交 —— `e665246`（演示语法 / 主题规范 / 技能规范三个频道）、`806ad26`（首页帮助中心锚点）、`ca57619`（主题规范令牌分层表折行）—— 已记在下面的 v0.3.5 节；`89103a0` 是 0.3.5 发布记录本身。两者不重复。

### 0.3.6 九项修复：预览 / 实时 / 演示 / 导出（2026-10-24，`45b9af9`）

来源是用户 10-22 记录的 8 条与 10-24 记录的 1 条，逐条修并补回归（`npm test` 267 → 295）。

**① 演示模式任务列表多画一个圆点，嵌套项挤在同一行**

演示页正文不在 `.editor-content` 里，预览那套 `.task-list-item` 重置没生效，`.ys-slide ul > li::before` 又给每个任务项画了一个圆点；任务项自身是 flex 容器，嵌套的 `ul/ol` 没拿到 `flex: 1 0 100%`，于是挤在勾选框右侧。现在 `.ys-slide` 下补一套与预览同构的规则：任务项 `::before` 取 `content: none`、嵌套列表独占整行，勾选框用主题强调色。

**② 预览「行高」设置对段落不起作用**

`--preview-line-height` 只写在容器上，`p` 与 `.task-list-item` 仍在吃主题里的固定行高。两处改为跟随该变量；任务项同时把 `gap: 0.5em` 拆成 `column-gap: 0.5em` / `row-gap: 0.15em`，避免多行任务文本被行间距拉开。

**③ 打开「编辑器设置」就卡住：系统字体全量枚举 + 全量渲染**

macOS 的 `system_profiler SPFontsDataType -json` 要枚举每个字体文件，动辄数秒；读回来上千项一次性挂 DOM，每个按钮还带 `font-family` 预览，面板直接僵住。改成**用户点「加载本地字体」才读取**，结果写 `localStorage`（键 `yizimarkdown.localFonts.v1`，读回时做类型校验），下次进入直接用缓存；列表每次只渲染 80 项 + 「显示更多」，搜索时重置分页。macOS 侧字体枚举优先走 `osascript` + JXA 调 `NSFontManager.availableFontFamilies`（几十毫秒），失败再回退 `system_profiler`。

**④ 大纲点击后高亮停在上一节，要点两次**

跳转把目标标题滚到视口中央，而 scroll spy 按「视口 1/3 处」判定当前标题 —— 跳转产生的滚动事件会把高亮改回目标的上一条。修法：`navigateToLine` 里先直接 `setActiveHeadingId(id)`，再设 700ms 抑制窗口（`spySuppressUntilRef`），窗口内编辑器 / 预览 / 并排三处滚动监听直接返回；用户主动滚轮 / 按下 / 触摸 / 按键会立刻把窗口清零，不拖住正常浏览。

**⑤ Mermaid 图导出 Word 后「有框无字」**

预览用 `htmlLabels: true`，节点文字装在 `<foreignObject>` 里；Rust 侧 resvg 不支持 foreignObject，复用预览 SVG 就只剩线条。新增 `renderMermaidSvgForExport()`：导出时用 `htmlLabels: false` 单独渲染一份纯文本标签的 SVG，再交给 Rust 转 PNG/SVG 嵌入。预览本身不调用它，外观不变；渲染失败 / 插件未启用时**保留原代码块**，不静默丢内容。

**⑥ `[toc]` / `[[toc]]` 只有预览能用**

新建 `src/lib/toc.ts`：markdown-it 插件把独立成段的占位行换成 `<nav class="markdown-toc">`，标题 id 复用渲染器的 `generateHeadingId`（含重复标题计数），所以预览 / PDF / HTML 导出的锚点都能跳，代码块里的 `[toc]` 原样保留。DOCX 走另一条路 —— Rust 只吃 Markdown，`docxPrepare.ts` 把占位行换成按标题层级缩进的项目符号列表（以最浅级别为基准，没有 H1 的文档不会整体缩进）。演示模式更特殊：每页独立渲染，页内根本看不到整册标题，所以改成「整册页面清单」，链接带 `data-slide`，由 Slideshow 的点击委托翻页，而不是页内锚点。

**⑦ 勾选任务后源码没变 / 改错行**

预览里的勾选框此前拿 `li.textContent` 去原文里全等匹配：行内公式被 KaTeX 渲染后文本已变、行内 HTML 带标签、重复文案、嵌套列表都会匹配失败或命中错行。改成渲染时给 `<li>` 带 `data-source-line`，点击后按 1-based 行号精确改那一行的 `[ ]` ↔ `[x]`（`taskList.ts` 纯函数，支持缩进、`*` / `+`、`1. [ ]` 等写法）。预览与实时模式都可点。

**⑧ 设置里没有文档入口**

新增「文档」分类（`BookOpen` 图标），四项直连官网：帮助中心、演示语法、主题设计规范、技能规范。15 个语言词典补齐文案，`check-i18n --strict` 通过。

**⑨ 工具栏「有序列表」给所有选中行都加 `1.`**

预览能把全 `1.` 顺序渲染，源码模式却原样显示。新增 `listFormat.ts` 的 `numberOrderedLines()`：多行选区按 1、2、3 连续编号，跳过空行、保留原缩进、已有编号整体重排（重复点击不会叠编号）。

**验证**：`npx tsc --noEmit` 无输出；`check-i18n --strict` 与其余 `check:*` 通过；`npm test` **295 passed**（新增 `docxPrepare` / `listFormat` / `taskList` / `toc` 四组）；`cargo test` **119 passed**；`vite build` 通过。版本号同步升到 `0.3.6`。

### 实时模式语法补齐：行内 HTML / 图片 / 注释 / 脚注 / 公式（2026-10-25，`ba8db4b`）

验收清单落在仓库根的 `live-syntax-test.md`，P0 / P1 逐项可勾。P2（`==高亮==`、`^上标^`、`~下标~`、`:emoji:`、定义列表、callout、wikilink、标题属性）按约定**本轮不做**，仍然显示源码。

**行内层**：行内 HTML 按白名单渲染（`sub/sup/u/ins/del/s/mark/kbd/small/b/strong/i/em/code/var/samp/cite/q/abbr/big` 等），`style` 只保留视觉相关属性、危险值丢弃；`<br>` 真的换行；`<a>` 只保留链接样式（点击落到编辑光标，不跳转）；`<img>` 行内显示。HTML 实体（命名 / 十六进制 / 十进制）与反斜杠转义按 Markdown 语义还原。

**图片**：行内 `![](…)`、引用式 `![alt][label]`、折叠式 `![alt][]` 都能渲染；`title` 带引号 / 括号的 URL、失败回退都有覆盖；独立成行的图片才升级为块级 widget，段落中「文字 + 图片」仍保持行内。

**链接与注释**：引用式链接解析 `[text][label]` 与定义行，定义行收成 chip（不占正文）；行内 `<!-- … -->` 与多行 HTML 注释 / 演示指令块都收成 chip，点击显形源码。

**脚注**：编号按定义顺序生成，定义块支持多行、多段续行；引用与定义共用一套 `analyzeFootnotes()` 分析结果，光标所在行仍显示原始语法可编辑。

**任务与围栏**：有序列表任务项（`1. [ ]`）与嵌套任务列表都识别；围栏代码块变为可编辑 widget —— 点击正文显形源码、带语言标签与复制按钮。

**公式**：块级公式与「整行只有一个行内公式」的行都会保留其余语法（不把整行吞成公式源码）；表格单元格内的内联排版一并走同一套行内渲染。

**`[toc]`**：实时模式新增 `TocWidget`，与预览同一观感；点条目滚动到标题、点空白回到源码。

实现上把可复用的解析逻辑沉到新文件 `src/lib/liveSyntax.ts`（849 行纯函数）：HTML 标签 / 实体 / 内联样式消毒、表格行与对齐、脚注分析、图片与引用定义、标题收集、行内公式切分、`TOC_LINE_RE` 等，UI 层只负责组装 decoration / widget。

### 实时表格：拖选、行列手柄、右键菜单、TSV 剪贴板（2026-10-25，`ba8db4b`）

表格 widget 从「能改单元格」扩到接近 Obsidian 的交互：

- **拖选**：鼠标按下拖过单元格形成矩形选区，`Ctrl+C` 按 TSV 复制（可直接粘进 Excel / 网页表格），`Ctrl+V` 按 TSV 回填，选区支持整行 / 整列 / 多格
- **行列手柄**：悬浮行首 / 列首出现 handle，点击选中整行 / 整列；表格边缘的 `+` 直接追加行 / 列
- **右键菜单**：剪切 / 复制 / 粘贴；文本格式（左 / 中 / 右对齐）；插入（上方 / 下方行、左侧 / 右侧列）；移动（上 / 下 / 左 / 右）；按此列升序 / 降序排序；清空选中单元格；删除选中的行 / 列 / 单元格 —— 菜单按选区形态动态出现，靠近窗口边缘会自动翻转
- **源码改写**：所有结构改写（插入 / 删除 / 移动 / 对齐 / 排序 / 追加）下沉到 `liveSyntax.ts` 的纯函数，补 20 项回归断言；`\|` 转义保持原样，不会被拆成新列

剪贴板优先走系统 `navigator.clipboard`，不可用时回退到进程内缓冲，避免「读不到剪贴板就整块失效」。

### 拖选底色「慢一拍」与写回后滚回顶部（2026-10-25，`ba8db4b`）

**底色慢一拍**：`table tr:hover > th/td` 的特异性是 (0,1,3)，高于 `td.cell-selected` 的 (0,1,1)，鼠标所在行的 hover 底色盖住了选中底色 —— 纵向拖选时必须先越过整行、进入下一行才看到变色。改成 `table tr:hover > td:not(.cell-selected)`，并给选中规则同级的 `table tr > td.cell-selected`；拖选期间（`.table-wrap.is-selecting`）把 hover 染色直接置透明。

**滚回顶部**：整张表是 `Decoration.replace` 的 widget，任何改写都会重建整块 DOM；此时焦点若在被移除的单元格 / 菜单按钮上，WebView2 会把 `.cm-scroller` 甩回顶部。新增 `withStableViewport()`：改写前记录 `scrollTop` 与 `window.scrollY`，改写后连续两帧校正（CM 的重新测量发生在 rAF 里），容差 2px，避免长文档里删一行就迷路。

### 预览图片排版、破图回退与表格长代码（2026-10-25，`ba8db4b`）

- **行内图片被强制独占一行**：Tailwind Preflight 给所有 `img` 设了 `display: block`。`.editor-content img` 改回 `display: inline`，并加 `vertical-align: middle`、`margin: 0 0.25em`；主题文件里有 `.editor-content.theme-x img { margin: 1em 0 }`（特异性 0,2,1，运行时后插入 `<head>`），所以用**叠一层的** `.editor-content.editor-content p img`（0,2,2）压住，保证每个主题下行内图都贴文字基线
- **图片独占段落仍要占整行**：CSS 的 `:only-child` 不数文本节点，「文字 + 图片 + 文字」也会被误判。改由 `Editor.tsx` 显式判断段落里有没有文字，只有纯图片段落才打 `p.img-para`，走块级排版
- **破图撑高行距、顶开表格列宽**：图片加载失败时浏览器破图标会撑高行盒。现在统一绑定 `error` 回退（并补查 `complete && naturalWidth === 0` 的缓存命中断言），把 `<img>` 换成 `.img-broken` 行内 span，显示 alt 文本（没有 alt 就显示「图片加载失败」），`title` 留原路径
- **SVG data URI 被当成非法链接**：markdown-it 默认只允许 gif / png / jpeg / webp 的 data URI，SVG 会退回源码文本、裸露在正文里并撑破容器。`validateLink` 只额外放行 `data:image/svg+xml`，其余 `data:` 仍拒绝；测试同时断言 `javascript:` 链接仍被拦截
- **表格里的长代码 / data URI 把列撑宽**：单元格内 `code` 改为 `white-space: pre-wrap; word-break: break-word`

### 大纲解析：跳过围栏、front matter、HTML 注释与缩进代码块（2026-10-25，`ba8db4b`）

`computeOutlineItems()` 原先是逐行正则，于是代码围栏里的 `# 注释`、开头的 `---` 元信息、HTML 注释块、四空格缩进的代码行都会被当成标题；重复标题的计数也被污染，导致大纲条目和锚点错位。改成状态机：跟踪围栏字符与长度（**更长的围栏不会被内部短反引号提前闭合**）、front matter、HTML 注释、缩进代码块；保留真实源码行号与唯一 id。新增 5 条回归（围栏内 `#`、围栏长度、front matter / 注释、缩进代码、代码块后标题的行号与 id）。

### 0.3.6 测试与门禁（2026-10-25）

`npm test` 从 **295 → 326**：`liveSyntax` 20 条、`imageData` 6 条、`outline` 5 条，共 31 条新增。`npx tsc --noEmit` 无输出，`npm run build`（含 `check-version` / `check-tauri-versions` / `check-i18n --strict` / `check-themes` / `check-docs` / `check-docs-site`）通过。另新增人工验收清单 `live-syntax-test.md`，覆盖实时模式 P0 / P1 的全部语法点与已知边界（P2 未实现项也列在里面，避免误判为回归）。

## v0.3.5

> 已发布（2026-10-21，`v0.3.5` = `9af7392`）。用户向说明见 `docs/changelog/CHANGELOG-V0.3.5.md`。

### 0.3.5 正式发布：CI 自动打包与在线更新链路核验（2026-10-21）

**① CI 一次通过，两条腿都成功**

推 `main`（`9af7392`）→ 打 `v0.3.5` 轻量标签 → `release.yml` 触发（run `39629095261`）。`Test & gates`（`npm test` 267 / `npm run build` / `check-updater`）✓；Windows 腿 10m54s ✓；macOS 腿（universal dmg）✓。没有踩到签名私钥、口令交互、产物名拼接之类的坑 —— 那几条在 beta 已验过。

**② 草稿里的 6 个资产逐项验过**

| 资产 | 实测 |
|---|---|
| `YiziMarkdown_0.3.5_x64-setup.exe` | 9,927,658 B；`FileVersion` = `0.3.5`（`ProductVersion` 同） |
| `..._x64-setup.exe.sig` | 424 B（非空） |
| `latest.json` | 5,088 B，见下 |
| `..._x64-portable.zip` | 12,772,910 B；解包根目录 `YiziMarkdown-0.3.5/`，包内 exe 同样是 `0.3.5`；`docs/` 17 个文件、**不含 `docs/changelog/`**、含 `THEME-DESIGN-SPEC.md` 与 `help.md`、**不含开发日志 `changelog.md`**；`themes/` 17 个文件、`user.css` 在 |
| `..._source.zip` | 7,227,523 B；394 条目，`git archive` 自 tag，**无 `node_modules` / `target`**；含 `src/lib/exportHtml.ts`、`tests/exportHtml.test.ts`、`docs/changelog/CHANGELOG-V0.3.5.md`；`tauri.conf.json` = `0.3.5` |
| `..._universal.dmg` | 28,522,064 B（macOS 腿产出） |

**③ 清单（latest.json）四项关键点**

- `version` = `0.3.5`，`notes` 与 `docs/changelog/CHANGELOG-V0.3.5.md` **逐字一致**（1683 字符；Release 正文也同源，三者不看长度看内容）
- 两个平台键 `windows-x86_64-nsis` / `windows-x86_64` **都指向同一个安装包**，URL 是 **tag 固定地址** `releases/download/v0.3.5/...`（不是 `latest/download/...`）
- `signature` 解 base64 后是完整 minisign 签名；**key id `dc8fce87f0e47235` 与 `tauri.conf.json` 里 pubkey 的 key id 完全一致**，trusted comment 里的文件名 = `YiziMarkdown_0.3.5_x64-setup.exe`
- 上传顺序正确：`latest.json` 排在便携版/源码包**之后**（工作流最后一步），客户端拿到清单时产物已就位

**④ Publish 之后按客户端视角复核**

- `gh release edit v0.3.5 --draft=false --latest` → Release 列表里 `v0.3.5` 成为 **Latest**
- `https://github.com/laoduu/YiziMarkdown/releases/latest/download/latest.json`（带/不带 cache-bust 各一次）→ **200，`version=0.3.5`**，`notes` 开头 `# v0.3.5`，两个平台键齐全
- 清单里的 tag 固定 URL 全部 **200**：setup 9,927,658 B / `.sig` 424 B / dmg 28,522,064 B（`release-assets.githubusercontent.com`）

**⑤ 遗留风险（与本次发布无关，但用户会遇到）**

- **用户自定义的 `user.css` / `keybindings.json` 可能被随包资源覆盖**：这两份是 bundle 资源，更新时安装器按"内容/时间戳差异"覆盖（beta 实测没被改写，是因为测试机没改过它们）。自定义过的用户升级前建议先备份
- GitHub Releases 不能给 `latest.json` 设 `Cache-Control`，CDN 可能有**短暂的旧清单**（几分钟）；客户端多检查一次即恢复

### 官网新增三个文档频道：演示语法 / 主题规范 / 技能规范（文档二级标签栏）

**需求**：把「主题设计规范」「Skill 设计规范」「演示模式语法」各做成官网频道，沿用帮助中心样式（左大纲 + 右正文）。原始想法是四个都进顶部导航。

**先算宽度，否掉「全塞顶部」**：现有 9 项 + GitHub 按钮在 1200px 容器里已占约 980px；再加三项约 330px ⇒ 约 1310px 溢出。汉堡菜单要到 `max-width:900px` 才出现，所以 900–1250px（最常见的笔记本宽度）会挤在一起；而且顶部已有「演示模式」「主题」两个首页锚点，再加同名频道会让人分不清去向。

**方案**：顶部导航保持 9 项不动，「帮助中心」作为文档入口；文档区加一条固定在导航下方（`top:64px`）的二级标签栏：

`帮助中心 | 演示语法 | 主题规范 | 技能规范`

以后再加频道只是多一个标签，不再挤压导航。首页三个对应区块、帮助中心三个对应小节末尾都加了交叉入口。

**实现**：

- `scripts/docs-site.config.mjs`：四个标签 + 三个页面的元信息（标题、副标题、SEO、图标序列、要跳过的章节）
- `scripts/build-docs-pages.mjs`：用项目已有的 `markdown-it` 把三份源文件渲染成 `help-section`（H2）/ `help-sub`（H3）两层，生成与帮助中心一致的骨架；生成物写入 `website/{slideshow-syntax,theme-spec,skill-spec}.html`
- 生成结果：演示语法 12 章 / 2 节 / 33 KB，主题规范 16 章 / 44 节 / 137 KB，技能规范 7 章 / 5 节 / 21 KB
- `scripts/check-docs-site.mjs`：校验源文件哈希（写入页面 `<meta name="docs-hash">`）、同页锚点是否都有目标、四个页面是否都挂了标签栏 —— **接进 `npm run build`**，源 Markdown 改了却没重新生成时门禁直接失败
- 锚点用 GitHub 风格 slug（保留中文、去标点、空格转 `-`），所以源文档里的 `#61-基础层令牌base` 一类锚点仍能对上；主题规范的「目录」章跳过（侧栏本来就会生成）
- 源文档的 `---` 在网页里不再渲染成 `<hr>`：章节之间已有边框、小节之间已有间距，重复画线反而多出空段
- 表格统一包 `help-table-wrap` 并加 `docs-table` 类：规范表格首列常是整句说明，不能沿用帮助中心「首列不换行」的规则
- `help.js` 增加 `data-icon` 支持（生成页的 section 自带图标名），`site-chrome.js` 增加标签栏、页脚四个文档入口、文档页统一高亮
- 补 `website/sitemap.xml`（5 个 URL）与 `robots.txt`（指向 sitemap）

**验证**：`npm run build` 全门禁通过（含新增的 `check-docs-site`）；1440px 与 390px 两档实拍检查——标签栏高 45px、移动端汉堡正常、`document.scrollWidth === innerWidth`（无横向溢出）、侧栏吸顶位置 132px；三个生成页的同页锚点 0 缺失。

**注意**：官网仍是手工部署，本次只改了仓库里的 `website/`。以后改 `docs/THEME-DESIGN-SPEC.md` 或 `src-tauri/skill-guide.md`，需要跑一次 `npm run docs:site` 再提交生成物。

### 官网文档锚点定位修正（首页 → 帮助中心）

**现象**：从首页各模块点「完整说明」跳到 `help.html#slideshow` 等位置时，落点偏高——真正的小节标题往往在视口下方，还要再滚一段。

**根因**：

1. 帮助中心的 23 张截图都没写 `width/height`，又用了 `loading="lazy"`。浏览器先按「图片高度 0」算锚点位置并滚过去，图片随后加载把目标整体往下推。实测 `#slideshow` 最终停在 `top=944px`（视口 900），比目标偏高约 820px。
2. 全站 `html { scroll-behavior: smooth }`，跨页带 hash 进入时会从页首一路动画到目标，加载过程中的中间态看起来也像「没定位准」。

**修复**：

- 给 `help.html` 全部 23 张图补 `width/height`（WebP 原始像素），`.theme-shot img` 补 `height:auto`：加载前后占位一致，实测渲染宽高比与原始比例误差 < 0.005。
- `help.css` 把 `scroll-margin-top:124px` 提升到 `.help-content [id]`，section、小节 div、小标题都能对齐到导航(64) + 标签栏(44) + 15px 间距。
- `site-chrome.js`：文档页带 hash 首次进入时临时关掉 smooth，落位后恢复；页内点目录仍然平滑。
- `help.css` / `help.js` / `site-chrome.js` 带 `?v=` 版本号，避免部署后命中旧缓存。

**验证**：从首页实际点击 6 个入口（edit / slideshow / ai / appearance / shortcuts / faq），1440 与 390 两档全部落在 `top=124px, gap=15px`；侧栏小节目录同样对齐。

### 官网主题规范：令牌分层总览表格折行修正

**现象**（用户反馈）：「5. 令牌分层总览」第一列只有「L0 基础」「L3 效果」这类短标签，却被挤成两行；同一张表「数量」列的 `3 + 3 + 2` 也被拆成 `3 + 3 +` / `2`。

**根因**：生成页为了让规范表格里的整句首列能正常换行，统一给 `td:first-child` 设了 `white-space: normal`。这个表第一列最短，浏览器按自动布局把列宽压到最小内容宽度，于是正好在「L0」和「基础」之间断开。

**修复**（`scripts/build-docs-pages.mjs` + `help.css`）：

- 生成时统计每张表首列的最大文本长度：不超过 12 个字符（层级、字段名、令牌前缀这类短标签）就加 `docs-table--nowrap-first`，首列不折行；整句说明的首列（超过 12 字）保持可换行。
- 数字 / 算式单元格（`6 + 1`、`3 + 3 + 2` 等）自动加 `docs-cell-num`，数量列也不折行。
- `help.css` 版本号提升到 `?v=6`，`help.html` 与三个生成页同步。

**验证**：主题规范页共 15 张短标签表、36 个数字单元格生效；「5. 令牌分层总览」首列与 `3 + 3 + 2` 均为单行，表格仍在容器内（816px，无横向滚动）；390px 下表格在自身容器内横向滚动，页面 `scrollWidth === innerWidth`。`check-docs-site` 与 `npm run build` 均通过。

### 导出 Word：项目符号变方框（根因＝Unicode 码位 + 强制 Symbol 字体）

**现象**（用户反馈）：导出的 docx 里无序列表项目符号变方框 / 错误字符，选中符号时字体栏显示 `Symbol`。

**根因**：`numbering_xml()` 的 bullet 层级把 **Unicode 码位**（`U+2022` / `U+25E6` / `U+25AA`）写进 `w:lvlText`，同时又用 `<w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol"/></w:rPr>` **强制 Symbol 字体**。实测本机 `C:\Windows\Fonts\symbol.ttf` 的 cmap 只有两段：

| 子表 | 覆盖区间 | `U+2022` | `U+25E6` | `U+25AA` | `U+F0B7` |
|---|---|---|---|---|---|
| `(1,0)` 传统 Symbol 编码 | `0x00-0xFE` | ✗ | ✗ | ✗ | ✗ |
| `(3,0)` Microsoft 私有区 | `0xF020-0xF0FE` | ✗ | ✗ | ✗ | ✓ |

→ 三个码位在 Symbol 里**一个都没有字形**。Word 自己生成 Symbol 项目符号时写的是 PUA `U+F0B7`（内部 F0xx→0xxx 的私有映射），我们写的是 Unicode 码位，于是取不到字形。一级看起来"正常"，其实是 Word 逐字回退到别的字体画出来的。

**为什么一直没被发现**：`CHANGELOG-V0.2.4` 里已写明「列表符号需 Word 查看，docx-preview 不支持 numbering」——这条路径**从未在真实 Word / 渲染器里验证过**，属于"没测到"，不是"没问题"。

**顺带发现的第二个缺陷**：`font_table_xml()` 给 Symbol 挂的替代名链 `Wingdings, Segoe UI Symbol, Arial Unicode MS` ——① 主名 `Symbol` 在 Windows / macOS 都存在，按 ISO/IEC 29500 只有主名找不到才读 `altName` ⇒ **在主流平台上是死代码**；② 万一在缺 Symbol 的环境触发，排第一的 `Wingdings` 同样没有 `U+2022`（实测 MISSING），而真正含全部三个字符的 `Segoe UI Symbol` 排第二 ⇒ **顺序反了，必然方框**。

**改法（方案 A）**：项目符号只写 Unicode 码位、**不指定字体**（继承正文字体 + 允许 Word 逐字回退）。

- `src-tauri/src/docx_export.rs:1617` `bullet_lvls` 改用转义码位；bullet 层级模板删掉整段 `<w:rPr>`
- 删除 `font_table_xml()` 里的 Symbol 条目及其替代名链（原 173-178 行，已随改法失效）
- 回归断言：新增 `bullets_use_unicode_without_forced_symbol_font`（`src-tauri/src/docx_export.rs:2344`）——三级 bullet 齐备、码位正确、`numbering.xml` 内不得出现 `Symbol`、bullet 层级不得写 `w:rPr`；`font_table_declares_alt_names_for_substitution`（`:2272`）改为反向断言（不得残留 `Symbol` / `Wingdings`）

**同版追加**：二级/三级符号由 `◦ U+25E6` / `▪ U+25AA` 换成 `○ U+25CB` / `■ U+25A0`。前者在 **MiSans 与宋体里没有字形**（cmap 实测 MISSING），只能靠 Word 逐字回退 ⇒ 不同机器上外观不一致；后两者在 MiSans / 微软雅黑 / 宋体里**都有**。一级 `• U+2022` 不变。

**后续被推翻（同版）**：`○ U+25CB` / `■ U+25A0` 虽然「有字形」，但**尺寸是 `•` 的 2.5 倍**（WPF 逐字形墨迹实测：MiSans `•` 29.0 / `○` 72.4 / `■` 70.0），用户看到的是「层级越低、符号越大」。最终方案改回小码位 `◦ U+25E6` / `▪ U+25AA` 并**显式指定微软雅黑**（该字体里 `◦` 27.5 / `▪` 24.5，与 `•` 同尺寸），跨平台靠 fontTable 的替代名链兜底 —— 详见下文「第一轮实机验收」一节。

**验收**：`cargo test docx_export` → 50 passed / 3 ignored ✓（含全部新增回归用例；0.3.5 收尾时总数见下文「导出 Word 全面对齐预览」一节的 81 passed）。

**人工验收探针**：新增 `write_bullet_probe`（`#[ignore]`，`src-tauri/src/docx_export.rs:2446`），产出 `target/bullet-probe-{misans,yahei,inter}.docx` 三份（Inter 为纯拉丁字体，是最差情况——符号只能靠 Word 逐字回退）。跑法：

```
cargo test write_bullet_probe -- --ignored --nocapture
```

已实跑生成三份文件；`numbering.xml` 里 bullet 层级确认无 `w:rPr`、码位为 `• ○ ■`，`document.xml` 中三级 `ilvl=0/1/2` ✓（注：这是当时的记录；本节之后 P1 又改成**每个列表各自一个 `w:num` 实例**，项目符号层级仍用 `ilvl=0/1/2` 表达，但不再共用一个 `numId`，与本条项目符号字形无关）。

**人工验收：已通过**（2026-10-20，真实 Word 打开三份样本）：逐级选中项目符号 —— 字形正确为 `• ○ ■`、**字体栏不再显示 `Symbol`**、无方框 ✓。本条闭环。

### 导出 Word：全面对齐预览（字号/行高/配色/内容完整性）

用户要求「尽最大努力让导出格式准确，而且和用户设定的预览字号准确匹配」。上一节只修了项目符号，本次把导出器**逐条对着预览 CSS 复核**一遍，按 P0→P4 修完。

**P0 内容丢失 / 不可读**

| 现象 | 根因 | 改法 |
|---|---|---|
| 元信息块（YAML front matter）漏成正文第一段 | 渲染器是白名单，`Event::Start(Tag::MetadataBlock(_))` 落进 catch-all 被忽略 ⇒ 块内文本当普通段落输出 | 新增分支整块消费丢弃（与预览/HTML/PDF 一致，两者都不显示元信息） |
| `$…$` / `$$…$$` 公式**整段消失**，块级公式还留一个空段落 | 未处理 `Event::InlineMath` / `Event::DisplayMath`；且 `$$…$$` 被解析器包在 `Paragraph` 里 | Rust 侧没有 TeX 引擎 ⇒ **保留 TeX 源码**：行内用等宽 run 输出 `$…$`，块级用居中段落输出 `$$…$$`（`display_math_paragraph()`，`:781`）。**（下一节已改为 Word 原生公式 OMML，此处的 TeX 源码降级为转换失败时的兜底）** |
| 脚注引用消失、定义文字外泄成正文段落 | 未处理 `FootnoteReference` / `FootnoteDefinition` | 输出**真正的 Word 脚注**：新增 `word/footnotes.xml`（含 `separator`/`continuationSeparator` 两个必需分隔符）、内容类型 Override、document.xml 关系、`FootnoteText`/`FootnoteReference` 样式；定义内部产生的链接/图片关系搬到 `word/_rels/footnotes.xml.rels`。用 `scan_footnotes()`（`:1673`）预扫描，只有「有定义**且**有引用」的才转脚注——未被引用的定义按普通段落输出（否则内容凭空消失），没有定义的引用按原文输出 |
| 工具条 `<sup>`/`<sub>` 丢格式；手写 `^x^` 把整段拆成 4 段 | `is_inline_start()` 不含 `Tag::Superscript`/`Subscript` ⇒ 被当成块级边界；行内 HTML 未映射 | 行内 HTML 走 `apply_html_inline_tag()`（`:365`）映射到 `w:vertAlign`/`w:u`/`w:highlight`/`w:b`/`w:i`/`w:strike` 与 `<br>`；`is_inline_start` 仍补上两者作兜底。后来复核预览发现 `^x^`/`~x~` **预览本来就不支持**（字面显示），于是索性关掉这两个拓展语法（见 P4），只让 `<sup>`/`<sub>` 生效 |
| `---` 分隔线整条消失 | 未处理 `Event::Rule` | 输出空段落 + 下边框（颜色取 `--editor-border`） |
| **暗色主题导出后不可读**：白纸上的荧光字（matrix `#00ff41`）+ 近黑底色 | `--editor-text`/`--editor-surface` 是给深色页面配的，docx 页面恒为白底 | 新增前端 `src/lib/docxPalette.ts`：暗色主题改用白底等效色，强调色**保留色相**压到白底可读亮度（WCAG 相对亮度 ≤ 0.3 ≈ 3:1）；顺带把 `rgba()`/`#rgb` 归一成 `#rrggbb`（Rust 侧只解析十六进制） |

**P1 列表编号**

- 此前**所有有序列表共用 `numId=1`**（无序 `numId=2`）⇒ 第二个有序列表接着上一个继续编号、`3. 第三项` 的起始值被忽略。现在**每个列表（含嵌套）各自分配一个新 `w:num`**（`numbering_xml(lists)` `:1617`），有序列表一律写 `<w:lvlOverride><w:startOverride>`（起始值 1 也写，否则共享同一 `abstractNum` 的多个实例在 Word 里会接着上一个继续数）
- **嵌套列表**：第一版让嵌套层复用最近同类型祖先的实例、用 `ilvl` 表达层级，理由是 `%1.%2.` 这种多级编号需要父子同属一个实例 —— 但预览里每个 `<ol>` 都是独立计数器（浏览器 UA 样式各级都是 `decimal`），复用的结果是 Word 显示 `1.1.`、与预览的 `1.` 不符。现在嵌套列表**也各自一个实例 + `ilvl=0`**（各级都从 `1.` 开始），缩进改由段落 `w:ind` 手写：`left = 720 × 总嵌套深度`、`hanging = 360`（不再依赖编号层级里的缩进，任务项与普通项因此对齐同一列）
- 项目符号的**层级差异**（• / ○ / ■）仍然靠 `ilvl` 表达，取值 = 祖先里「项目符号列表」的个数（对应 UA 的 `ul`(disc) / `ul ul`(circle) / `ul ul ul`(square)），有序列表不参与计数
- 任务列表项同时写 `numPr` + `☑` ⇒ Word 里是「项目符号 + 勾选框」**双重标记**。现在任务项**不写 `numPr`**，缩进手写成编号列表的文本位置（`left = 720 × 嵌套深度`、`hanging = 360`），只剩 ☑/☐

**P2 字号/行高（本次用户的核心诉求）**

- 此前 `DocxTheme` 只有颜色/字体，**字号行高根本没传**，导出固定「正文 11pt / 行高 1.5 / 单元格 240」——与预览的 20px / 2.0 完全不是一回事
- 新增 `Metrics`（`:43`）：`pt = px × 0.75`、`w:sz` = 半磅 = `px × 1.5`、行距 `w:line = 240 × lineHeight / 1.2`（`lineRule="auto"`，**不能用 `exact`**，否则行内图片会被裁掉）、1em = `body_pt × 20` twips
- 前端 `App.tsx:995` 传 `fontSizePx: previewFontSize, lineHeight: previewLineHeight`（预览容器 `Editor.tsx:501` 用的就是这两个设置——字号取「预览字号」、行高取「预览行高」；未设置时退回 CSS 缺省 16px / 1.8）。**一处需要知道的取舍**：应用自身的预览 CSS 里 `.editor-content p { line-height: var(--line-height) }`（＝「编辑器行高」）盖住了容器的「预览行高」，而 `li`/`blockquote`/`td`/`pre code` 没有自己的 `line-height`、继承容器的「预览行高」——即预览自己前后不一致。导出取**「预览行高」**这一项（它才是设置面板里那个滑杆的语义），并统一套用到正文/列表/引用/代码块/单元格；两者默认值相同（2.0），只有用户单独改一个滑杆时才会看出差别
- 标题字号改为**按预览的 em 比例**（`globals.css` h1-h3 = 2 / 1.5 / 1.25em，h4-h6 = 1em 仅加粗），不再用一套与预览无关的固定磅值（旧值 h6 10pt 比正文 11pt 还小）；段前 1.5em / 段后 0.5em / 标题行高 1.3、正文段后 1em、列表项 0.3em、代码块 0.9em 全部由字号推导
- 行高逐元素对照预览取：`p`/`li`/`blockquote`/代码块/表格单元格都是用户行高（预览里后三者继承容器值），标题 1.3；`styles_xml` 补 `w:docDefaults`（默认字体/字号/颜色/行距 + `w:lang en-US/zh-CN`）。脚注文字仍用单倍行距（240，Word 惯例，预览里没有对应元素）

**P3 图片**

- WebP：Word / WPS **都不能渲染**，内嵌后是空框；新增 `image` crate（`default-features=false, features=["png","webp"]`，仅 +6 个包）在嵌入前转码为 PNG，失败则告警并保留原图（`webp_to_png()` `:489`）
- 本地图片此前**只按扩展名**判类型 ⇒ `.jfif`、无扩展名的图片被静默丢弃，扩展名写错的图片以错误类型嵌入。现在以**文件头**为准、扩展名仅兜底（`sniff_image_ext()` `:459`），不支持的类型跳过并 `eprintln` 说明（**下一节起 SVG 改为支持**：按内容识别为 SVG，转矢量 + 回退位图）
- `data:` URL 同样按文件头判定（`data:image/svg+xml` 不能冒充 png）

**P4 其他一致性**

- 关闭 `ENABLE_SMART_PUNCTUATION`（预览 `typographer:false`）⇒ `"引号"`/`a--b`/`...` 不再被换掉；关闭 `ENABLE_SUPERSCRIPT`/`ENABLE_SUBSCRIPT` ⇒ `^x^`/`~x~` 与预览一致保持字面（应用自身的上标/下标走 `<sup>`/`<sub>`）。**已知残留**：pulldown 的删除线**同时接受单波浪线**（GFM 只认 `~~x~~`），关掉 SUBSCRIPT 后「前一个字符不是字母数字」的 `~x~` 会落到删除线（如 `空格后的 ~word~`）；无法只关单波浪线（关掉 `STRIKETHROUGH` 会连 `~~删除线~~` 一起失效），故取保住 `~~` 这一侧，已在全格式测试文件与版本说明里列为已知差异。脚注改用 GFM 语义（`remove(ENABLE_OLD_FOOTNOTES)` 会连带清掉 `ENABLE_FOOTNOTES` 位，故再 `insert(ENABLE_FOOTNOTES)` 补回）
- 裸 URL 自动链接（`find_bare_url()` `:401`，对应预览 `linkify:true`）；`[[wikilink]]` 不再写成 `TargetMode=External` 的无效外部链接，按 `[[原文]]` 输出
- 代码块从「每行一个段落」改为**一个段落 + `<w:br/>` 换行**（预览里 `pre` 是单一区块；逐行拆段会在末尾多出空段落、复制时被当成多个段落）
- 表格补 `<w:tblGrid>`（按列数均分正文宽度，缺它时 Word 自行推断列宽、容易宽窄不齐）；单元格行距随正文字号
- 任务字形 ☐/☑ 在 MiSans / 微软雅黑 / 宋体 / Segoe UI 里**都没有字形**（cmap 实测），显式指定 `Segoe UI Symbol` + fontTable 替代名链（`MS Gothic, Apple Symbols, Arial Unicode MS, Noto Sans Symbols 2, DejaVu Sans`）
- `esc()` 归一换行（换行一律用 `<w:br/>`，避免 XML 折叠语义把换行变成不可控空白）

**改动文件**：`src-tauri/src/docx_export.rs`（主体）、`src/App.tsx`（传字号/行高 + 白底配色）、`src/lib/docxPalette.ts` + `tests/docxPalette.test.ts`（新增）、`src-tauri/Cargo.toml`（+`image`）、`docx-export-test.md`（新增：全格式人工验收样本）。

**人工验收样本**：仓库根新增 `docx-export-test.md`，一次性覆盖 front matter、H1–H6、行内格式/转义/特殊字符、公式、分隔线、三级无序/有序/起始值/嵌套/宽松紧凑/任务列表、引用（嵌套 + 内含列表代码）、表格（对齐 + 行内格式 + 管道转义）、代码块（带/不带语言、缩进式、特殊字符、长行）、脚注（含未定义引用与孤立定义）、图片（相对 PNG / 相对 WebP / data URL / 远程 / SVG / HTML img）、行内与块级 HTML、已知差异样例，文末附《对照检查表》与差异汇总（下一节起增补为 27 项，含 SVG 矢量与原生公式两条），供人工在真实 Word / WPS 里逐项比对。

**验证（当时）**：`cargo test` → **81 passed / 0 failed / 6 ignored**（末节的 109 passed 含其后新增项）；`npm test` → **243 passed**；`npx tsc --noEmit` 无输出；`cargo build` ✓；`check-version` / `check-tauri-versions` / `check-tauri-args` / `check-i18n --strict` / `check-themes` 全绿。全格式样本另做包级校验：`docx-export-test.md` 导出后 13 个部件 XML 全部良构（0 错误）、WebP 已转 PNG、SVG 跳过、4 张图片嵌入、脚注 3 条（含孤立定义按段落保留）、有序列表 numId 100–123 各自独立且 `startOverride` 正确（`3.` → 3）。

**已知未做（明确留白）**：定义列表（`Tag::DefinitionList`）、块级 HTML 表格（降级为文本）、SVG 与 EXIF 方向矫正。这些都不属于「预览能看、导出看不到」，故不在本次范围。（其中 **SVG 与 LaTeX 公式已在下一节补做**。）

### 导出 Word：公式转 Word 原生公式、SVG 转矢量

上一节把「公式只留 TeX 源码」「SVG 跳过」列为明确留白。用户问「公式为什么不能转成 docx 支持的可编辑公式？受什么制约？」「svg 为什么不能导出到 docx 里呢？或者转换后导出呢？」——本节把两条都做掉，一起进 0.3.5。

**LaTeX → OMML（Word 原生公式）**

- 选型实测（临时 cargo 探针 `omml-probe`）：
  - **tex2word-math 1.0.6**（MIT，`github.com/yfyang86/rstex2word`，2026-07 发布、下载量数百，源码约 46 KB 且**零外部依赖**）：入口 `to_omath(latex) -> "<m:oMath>…</m:oMath>"`。**18/18 常规公式 + 40/40 边界/畸形输入全部良构、0 panic**；`&` `<` `>` 正确转义并带 `xml:space="preserve"`；覆盖 `\frac \sqrt[3] \sum \int`（含上下限）`\lim \alpha \mathbb \mathcal \vec \hat \bar \text{中文} cases aligned pmatrix align \binom \operatorname`。缺口：`{}^{14}C` 这类前置上标退化、未知宏静默丢弃
  - **deckmint-math 0.1.7 否决**：`aligned`/`cases` 直接失败，且 `\vec` 产出**结构不良的 XML**（`</m:groupChrPr>` 标签不匹配）
  - `mitex-parser` / `latex2mathml` 记在案（后者只到 MathML，而 MathML→OMML 没有可用的成熟 Rust 实现；`MML2OMML.XSL` 不可再分发）
- 做法：**vendor**（`src-tauri/src/omml/{mod,omml,parser,symbols}.rs` + `LICENSE-MIT`），只改两处 `use` 路径（上游按 lib 根写 `crate::parser` / `crate::symbols`）。理由：不在关键路径上依赖一个刚发布、下载量数百的 crate；源码零依赖、体量小，上游停更也不影响构建
- 接线：`Event::InlineMath` → `<m:oMath>`；`Event::DisplayMath` → `<m:oMathPara><m:oMathParaPr><m:jc m:val="centerGroup"/>`；`w:document` 根补 `xmlns:m`；`m:t` 统一补 `xml:space="preserve"`（与 `w:t` 同规则，否则首尾空格被吞）
- **不丢内容**：`omml_of()`（`:566`）用 `catch_unwind` 兜住第三方解析器的 panic，并且**结果里一个 `<m:t` 都没有时也判失败**（整段未知宏会被静默丢掉）→ 退回原来的等宽 TeX 源码。已知限制：公式编号 `\tag` 不支持

**SVG → 矢量 + PNG 回退**

- Word 的矢量路子是 `a:extLst` 里的扩展：`a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}"` → `asvg:svgBlip`（命名空间 `http://schemas.microsoft.com/office/drawing/2016/SVG/main`）指向 SVG 部件；**必须同时给 PNG 回退位图** —— LibreOffice 缺回退图时整张空白（tdf#126084）
- 关系类型怎么定：先查 [MS-ODRAWXML] 规范（2.26 节 `svgBlip` / `CT_SVGBlip`）确认元素与命名空间，但规范里**没有** SVG 专用关系类型；于是直查本机 WPS 的 OOXML 二进制（`kso.dll`）：既有 `{96DAC541…}` + `asvg:svgBlip` + `xmlns:asvg`，又把 `image/svg+xml` 与 `media/image%d.svg` 放进同一张「媒体部件」表，而它的关系类型清单里**只有 `relationships/image`** ⇒ 两个部件都用标准 image 关系类型、靠内容类型区分（`[Content_Types].xml` 必须有 `<Default Extension="svg" ContentType="image/svg+xml"/>`）
- 栅格化：resvg 0.48（纯 Rust：usvg / tiny-skia / fontdb / skrifa / harfrust），**`text` + `system-fonts` 必开**（SVG 内的文字、中文靠系统字体渲染，否则文字静默消失）；字体库用 `OnceLock` 缓存一次（每次遍历系统字体会明显拖慢导出）；倍率取「宽约 1000px」（限制 1–3 倍，4096px 上限）
- 尺寸取 **SVG 固有尺寸**（96dpi：240×120 px → 180×90 pt，与 Word 自己插入时一致），不是放大后的回退位图像素
- 栅格化失败不丢图：只嵌矢量（Word 2016+ / WPS 仍能显示）并在日志里告警

**回归断言**（新增 7 项）

| 断言 | 覆盖 |
|---|---|
| `display_and_inline_math_become_native_omml` | 行内→`m:oMath`、上标→`m:sSup`、积分→`m:nary`、块级→`m:oMathPara` + `m:jc centerGroup`、`xmlns:m` 存在、TeX 源码不残留、文档良构 |
| `math_text_preserves_spaces` | `m:t` 带 `xml:space="preserve"` |
| `unparsable_math_falls_back_to_tex_source` | 未知宏整段转换不出 → 退回源码而不是空白公式 |
| `sniff_svg_recognizes_text_xml_shapes` | BOM / XML 声明 / DOCTYPE / 注释 / 大小写；二进制与普通文本不误判 |
| `svg_rasterizes_vector_and_text_to_png` | 固有尺寸、PNG 可解析、宽高比、失败返回 None；**有/无 `<text>` 两张图字节必须不同**（证明系统字体真的把文字画出来了） |
| `svg_is_embedded_as_vector_with_png_fallback` | `image1.svg` 与 `image1.png` 同时存在、`svgBlip` 结构与 rId 配对、EMU 取固有尺寸（2286000×1143000）、两条 image 关系、`[Content_Types]` 声明 svg、回退图 720×360 |
| `svg_extra_css_units_and_content_detection` / `invalid_svg_is_skipped_without_losing_text` | 扩展名不是 `.svg` 也按内容识别；`2in` 按 96dpi 换算；损坏/残缺 SVG 不 panic 且正文不丢 |

**自动化踩坑（教训）**：为拿「Word 官方产物」做依据，曾用 `New-Object -ComObject Word.Application` 起自动化。事后查明本机 `.docx` 归 **WPS**（`WPS.Docx.6`），`Word.Application` 是 WPS 兼容层提供的：它没有 `OMath.Type` / `BuildUp`（真 Word 有），所以此前「Word 识别 20 个公式」应更正为「**WPS** 识别 20 个公式」；更要紧的是它会在用户正开着的 WPS 实例里建文档/保存，弹出保存提示打扰用户。**决定：不再用 Office/WPS 自动化**；后续规格依据改为「公开规范 + 本机二进制字符串 + 包级校验」，人工验收交给用户。

**验证**：`cargo test` → **109 passed / 0 failed / 6 ignored**（+28，含 vendor 引擎自带用例）；`npm test` → 243 passed；`npx tsc --noEmit` 无输出；`cargo check --all-targets` 零告警。全格式样本重新导出（`target/export-test.docx`，239.8 KB）：17 个部件、6 张图（`image5` / `image6` 各有 `.svg` + `.png`，`svgBlip` → `rIdSvg5` / `rIdSvg6` 成对）、`m:oMath` 18 处、`m:oMathPara` 3 处、TeX 源码残留 0 处、`[Content_Types].xml` 含 svg 声明。

### 导出 Word：第一轮实机验收的 8 条问题（2026-10-21）

用户拿 `docx-export-test.md` 导出后在真实 Word/WPS 里逐节核对，回了 8 条问题（每条给「位置 / 预览里 / Word 里 / 期望 / 附注」，未标优先级 ⇒ 由我们按「内容是否丢失 / 结构是否错误 / 观感」排 P0→P4）。

**P0 换行整体失效（【1】【4】）**

| 现象 | 根因 | 改法 |
|---|---|---|
| 同段内的**软换行**（单个换行）、**硬换行**（行尾两空格、行尾反斜杠）在 Word 里都不换行，仍属一个自然段；代码块、多行引用被**合并成一行** | `const BR: &str = "<w:br/>"` 被直接拼进 `<w:p>` 的内容里。`w:br` 是 **run 级元素**（`CT_R` 的成员），挂在段落层级不是合法段落内容，Word/WPS 会**整段忽略**（XML 仍良构，所以日志和结构校验都看不到） | `BR` 改为 `"<w:r><w:br/></w:r>"`，三处调用（软/硬换行、行内 `<br>`、代码块行间）一次性修好 |

回归断言：`soft_and_hard_breaks_stay_in_run`（三种写法都换行、`\` 不残留、仍是同一段落）+ `assert_br_only_inside_runs()`（`<w:br/>` 计数 == `<w:r><w:br/></w:r>` 计数、不得出现 `</w:r><w:br/>`），并加进 `code_block_is_one_paragraph_with_line_breaks` 与端到端样本用例。**注意**：旧断言只查 `doc.contains("<w:br/>")`，裸写也能过 ⇒ 这类断言必须改成「包裹计数相等」。

**P0 首行缩进/层级错乱（【6】引用）**

- **现象**：三级嵌套引用导出后「没有层级」，且同一引用被看成多个断开的引用块
- **根因**：引用块此前是**逐段落**写 `Quote` 样式的 `w:pBdr` + `w:shd` + `w:ind`。相邻段落的边框在 WPS 里**不会合并**，段间距处露出缺口；嵌套只体现为 `ind left = 300 × 层数`
- **改法**：整块引用（含其内部的段落、列表、嵌套引用）先渲染到临时缓冲，最后整体裹进一个**单元格表格**：`w:tblW pct 5000` + `tblBorders/w:left sz=24`（3pt＝预览 4px，取主题强调色）+ `w:shd fill=--editor-surface` + `w:tblCellMar` 上下 0.5em / 左右 1em（＝预览 `padding: 0.5em 1em`）。嵌套引用就是**父单元格里的内层表格**，层级由单元格外边距自然递进 —— 因此不需要 `w:tblInd`，也不再有任何段落级边框。`Quote` 样式退化为「只保留文字色」，`p_start_ind` 里的引用缩进分支删除；仅当引用是文档最后一个块时补一个零间距空段落（Word 要求表格后至少一个段落）
- 空引用（`>` 单独一行）也要有合法单元格内容（`w:tc` 至少一个块级元素）⇒ 补一个 `Quote` 空段落

回归断言：`quote_is_one_continuous_container_with_nesting` —— 两层引用 = 2 个 `<w:tbl>` / 2 个 `<w:tr>`；嵌套表格的起始位置**在外层表格闭合之前**（真嵌套）；同一单元格里同时含「第一段」「第二段」（连续容器）；`<w:pBdr>` 计数为 0；`Quote` 样式里不得再有 `w:pBdr`/`w:shd` 且有 `w:color 666666`。**并补了 `xml_is_well_formed(&doc)`** —— 正是它抓到了首版 `format!` 的实参错误（`<w:top <w:val="none"/>`，标签名后直接跟 `<`）。

**P1 编号被嵌套列表带跑（【3】）**

- **现象**：`1. 第一章 / 1. 第一节 / 2. 第二节 / 2. 第二章` 里第二章显示成 **3**
- **根因**：P1 已经做到「每个列表各自的 `w:num`」，但**计数器挂在 `w:abstractNum` 上**：所有列表仍指向同一个 abstractNum（有序 0 / 无序 1），只靠 `w:lvlOverride/w:startOverride` 重置。WPS 的实现在「层级切换」时才重置 ⇒ 二级列表（第一节、第二节）把父级计数器推到了 3
- **改法**：**每个列表（顶层与嵌套）独占一个 `w:abstractNum`**（单 `w:lvl`、`ilvl=0`、`w:start` 写在 lvl 内），`w:num` 与 abstractNum **一一对应**，有序列表再额外写 `startOverride`（双保险）。`ListInstance` 增加 `bullet_depth`（字形层级 = 祖先里无序列表数）与 `depth`（`w:ind` 缩进层级 = 总嵌套深度）；`list_stack` 简化为 `Vec<usize>`（`lists` 的下标）
- 项目符号字形同时定稿（承接前两节的反复）：一级 `• U+2022` 跟随正文字体；二/三级 `◦ U+25E6` / `▪ U+25AA` **显式指定 `Microsoft YaHei`**（MiSans / 宋体没有这两个字形），`fontTable.xml` 为雅黑挂替代名链 `Segoe UI Symbol → PingFang SC → Apple Symbols → Arial Unicode MS → DejaVu Sans`；四级及以后循环。`BULLET_LEVELS` / `BULLET_GLYPH_FONT` 常量集中表达

回归断言：`every_list_gets_its_own_abstract_num`（3 个列表 → 3 个 abstractNum、`w:num 100/101/102` 分别指向 `abstractNumId 0/1/2`、`num_ids` 序列必须是 `[100,101,101,100,102]`——证明第一章/第二章**同一实例**而二级是另一实例）；`bullet_glyphs_stay_same_size_and_have_real_glyphs`（三级字形为 `• ◦ ▪`、**断言绝不出现** `○`/`■`、一级层级不得写 `w:rPr`、二三级恰好 2 处雅黑 `w:rFonts`、fontTable 有雅黑条目与替代名链）；`nested_list_under_bold_item_keeps_levels` / `nested_lists_get_own_instance_with_preview_levels` 改为断言 `w:ind 1440` 且**不得出现 `ilvl=1`**。

**P1 脚注字号参差（【8】）**

- **现象**：脚注里的列表项、多段脚注的第二段比脚注正文**大一圈**；行内代码甚至比脚注正文还大
- **根因**：只有脚注「首段」被改写为 `FootnoteText`（带 0.83 倍字号），其余段落沿用 `ListParagraph`（基于 `Normal` = 正文字号），行内代码的 0.9 倍也是按**正文字号**算的
- **改法**：引入脚注字号上下文 —— `Metrics::FOOTNOTE_RATIO = 0.83`、`sz_scale_from(base_sz, scale)`、`footnote_sz()`、`DocxBuilder::in_footnote` + `base_sz()`。脚注内：每个 run 显式写脚注字号（`run_with` 的非等宽分支）、段落级 `w:pPr/w:rPr` 写脚注字号（列表项/第二段），行内代码与 `CodeBlock` = 脚注字号 × 0.9。`styles.xml` 的 `FootnoteText` 用同一个 `footnote_sz()`

回归断言：`footnote_inner_paragraphs_use_footnote_size`（footnotes.xml 里只出现脚注字号 20、不得出现正文字号 24；行内代码必须是 18；≥2 处段落级 `<w:rPr><w:sz 20/></w:rPr>`；document.xml 里不得出现 20）与端到端样本用例（`word/footnotes.xml` 不得含 `w:sz 30`）。

**P2 预览侧：任务项行内元素被挤断 + 内容重复（【5】）**

- **现象**（用户明确说明「这是预览的渲染问题，不是导出问题」）：`- [x] 带 \`行内代码\` 与 **加粗** 的任务` 在预览里内容出现两遍，且 `code`/`strong` 在宽度不足时被「行内硬换行」
- **根因**（Node 里最小复现）：`markdown-it-task-lists@2.1.1` 在 `{label: true, labelAfter: true}` 下会把 **`token.content`（原始 Markdown 文本，含反引号与 `**`）** 再塞进一个额外 `<label for=…>`，而已渲染的行内节点仍在原处 ⇒ 内容两份；同时 `.task-list-item { display: flex }` 让「已渲染内容」与「追加的 label」各成一个 flex 项，宽度不足时被**逐个挤压**
- **改法**：`markdownRenderer.ts` 改为 `labelAfter: false`（`<label>` 包住勾选框与内容，只产生一个子项）；`globals.css` 给 `.task-list-item > label` 加 `min-width: 0` 并注释说明为什么必须是单个 flex 项。`labelAfter: false` 下 `li.textContent` 不变 ⇒ `Editor.tsx` 的勾选回写逻辑不受影响

回归断言（新增 `tests/taskList.test.ts`，已加入 `npm test` 列表）：行内内容只出现一次（计数 1）且不得泄漏 `` `行内代码` `` / `**加粗**` 原始文本；`<li class="task-list-item…"><label><input …>` 结构成立、不得出现 `</strong>…<label` 这种「追加式第二 label」；纯文本任务项仍是可点击 label；非任务项不得出现 `<label>`。

**P3 【2】字形尺寸**：见上文 bullet 三条（`•` `◦` `▪`，同尺寸 + 显式字体 + 替代名链）。

**P4 【7】语法高亮（已按用户决定实现）**：`代码块被合并成一行` 属 P0 的 `<w:br/>` 问题，已修。着色方案由用户选定「前端预着色、逐 token 与预览一致」，实现如下：

- **不在 Rust 侧另写分词器**：预览的着色 = highlight.js 的 token 划分 + 主题 `--code-*` 颜色，任何独立实现都必然有出入。改为前端**直接读预览 DOM**（`.editor-content pre.hljs > code`，该面板在 `Editor.tsx` 里「永远挂载」，各视图模式都在）：
  - 键：`<code class="language-rust">` 的 `language-*`（与 Rust 侧取围栏 info 第一个词的规则一致；预览的 `data-lang="auto"` 表示无语言 ⇒ 空语言）+ `U+001F` + **规范化代码**（`normalizeCodeText`：CRLF/CR → `\n`、去末尾换行 —— 必须与 Rust 的 `normalize_code()` 同规则，否则查表静默落空）；
  - 值：`[[类路径, 文本], …]`，**类路径是祖先链**（如 `hljs-meta hljs-keyword`）而不是单个类名 —— 主题里有 `.hljs-meta .hljs-keyword` 这类后代选择器，只看最内层会取错色；
  - 样式：每个路径取**真实元素的 computed style**（`color` / `fontWeight ≥ 600` / `fontStyle`），因此换主题、改自定义 CSS、`.hljs-strong` 的粗体都自动跟随；纯文本片段以 `<code>` 自身为宿主（继承 `.hljs` 的正文色）。
- **Rust 侧**：`DocxTheme.code_highlights`（`#[serde(default)]`，形状与前端一致：`styles` + `blocks`），`CodeStyle { color, bold, italic }`、`CodeHighlights`；`code_block_content()` 按片段写 run（等宽 + 0.9em + `w:color`/`w:b`/`w:i`），片段内换行仍走 `BR`（run 级 `<w:br/>`），**段落结构不变**（一个代码块一个段落）；查不到就退回原来的单色等宽（缩进式代码块、预览未渲染、语言不匹配、预览防抖未跟上）。颜色用现有 `css_color_to_hex()` 归一（`rgb(207, 34, 46)` → `CF222E`），读不出颜色时退回正文色，绝不让文字消失。
- **有用的副作用**：mermaid 这类被插件改写成 `<div>` 的围栏不会硬套代码配色（它压根不是 `pre.hljs`）；`pre` 里由 `Editor.tsx` 注入的悬浮按钮/语言标签也不会混进片段（收集从 `<code>` 开始）。
- **暗色主题的白底适配**：页面上按深底配的 token 是亮色（`liquidglass-prism` 暗色变体的 `--code-keyword` 是 `#67e8f9`，亮度 0.63），直接搬到白底 Word 就是「白纸上的荧光字」—— 与 0.3.5 修的「暗色主题导出不可读」同一类问题。现在暗色主题用 `darkenForWhite()`（**保留色相**、压到 WCAG 相对亮度 ≤ 0.3）逐 token 压暗，无着色片段直接用 docx 调色板算出的正文色；**浅色主题原样搬预览颜色**（预览本身就是白底，颜色本就合适）—— 这条界线与 `docxPalette` 一致：只有「底色变了」的暗色主题才需要换算。

回归断言：Rust 侧 `code_block_uses_frontend_highlight_spans_with_colors`（6 片段在换行处拆成 7 个 run、`rgb()`→`CF222E`、加粗/斜体、无类片段兜底色、`doc_text` 拼接等于原代码、`assert_br_only_inside_runs`）、`code_block_falls_back_to_mono_without_highlight_data`（**键含语言** ⇒ 同文本不同语言不串味；`normalize_code` 契约）、`frontend_highlight_payload_deserializes_and_colors_runs`（**JS↔Rust 接线**：把前端产出的 JSON 形状原样反序列化再渲染，字段名/数组形状一改就红）；前端新增 `tests/codeHighlight.test.ts`（7 条，用最小假 DOM 驱动收集函数）：键/规范化规则一致、片段带祖先链、注入的按钮与标签不混入、**片段拼接必须正好等于键里的代码**、取不到预览 DOM 时给空表、**暗色主题把荧光色压到白底可读且保留色相（浅色主题不动）**，以及用**真实渲染器**输出钉住「`pre.hljs > code[class=language-*]` + 围栏内容去缩进」的形状（渲染器改形状时会红，而不是静默丢掉高亮）。

仍未对齐的（写入 `docx-export-test.md` 「已知差异」第 9 条）：**超长代码行的横向滚动** —— Word 段落没有这个概念，导出按页面宽度折行。

**关于验收表头那行「预览 20px + 1.2 倍行高 → 导出 15pt、单倍、段后 15 磅」**：这是**正确换算**，不是没生效 —— 1px = 0.75pt（20px = 15pt = 小三）；Word 的「单倍行距」本身≈1.2 倍字号，所以 CSS 的 1.2 倍行高正好落在 Word 的「单倍」；段后 15 磅＝预览 `p { margin-bottom: 1em }` 的 1em。已写入正式版说明的「其他」一节。

**新增/加强的测试基建**

- `xml_is_well_formed()` 加强：先做「标签内不得再出现 `<`」扫描（quick-xml 默认**不**校验属性语法，`<w:top <w:val="none"/>` 它能读过去却会被 Word 判定损坏），再逐个解析属性；并补元测试 `xml_well_formedness_checker_rejects_broken_attributes` 守住校验器本身
- 新增端到端用例 `acceptance_sample_package_is_well_formed`：把仓库根的 **`docx-export-test.md`（用户逐项验收用的样本）**整份导出，逐部件做 XML 良构 + 「无裸 `<w:br/>`」+「front matter 不泄漏」+「脚注内不得出现正文字号」检查 —— 此前这条路径只有 `#[ignore]` 的人工探针

**验证（本轮结束时）**：`cargo test` → **118 passed / 0 failed / 6 ignored**（共 124 个用例，其中 `docx_export` 模块 67 个、含 4 个人工探针）；`npm test` → **254 passed**（+7，全部来自新增的 `tests/codeHighlight.test.ts`）；`npx tsc --noEmit` 无输出；`cargo check --all-targets` 零告警；6 个 `check:*` 全过。样本重新导出（`target/export-test.docx`，248 KB）→ 17 个部件（其中 9 个 XML/rels）全部用 .NET `XmlDocument.Load` 解析零失败、`<w:br/>` **27 处全部包在 run 内（裸写 0）**、24 个列表 → **24 个 abstractNum**、引用表格 8 个（含嵌套）、段落级 `pBdr` 仅剩 3 处（都是 `---` 分隔线）、`footnotes.xml` 字号只有 25（脚注字号）与 23（脚注内行内代码）、正文段落级字号只有 27；**6 个代码块的查表键全部命中**（含「列表项里缩进的围栏」与「引用里的围栏」），颜色是主题真色（`hljs-keyword` `0E7490`、字符串 `1D4ED8`、数字 `7C3AED` 且**带斜体** —— 该细节只有读 computed style 才能拿到），无语言的块与缩进式代码块按预期保持单色。

**语法高亮的端到端验证（无头浏览器探针）**：`scripts/probe-code-highlight.mjs` —— 往 Vite dev 服务器临时放一个探针页（真实 `renderMarkdown()` 渲染样本 + 复刻 `Editor.tsx` 往 `pre` 注入的按钮/语言标签），用 Chrome 无头 `--dump-dom` 跑完，断言「命中块数 == `pre.hljs` 数」「片段拼接 == 代码」「末尾无换行」「注入内容不混入」「围栏内容与页面读到的文本一致（跨实现契约）」「颜色是真 `rgb()`」「存在空类路径兜底」，产出 `target/highlight-payload.json` 供导出探针使用。实测：6 个 `pre.hljs` 全命中、6 个查表键在 Rust 侧全部命中（含列表里缩进的围栏与引用里的围栏）；再加 `--theme liquidglass-prism --dark` 验暗色主题的白底适配：预览里的亮色 token `#67e8f9`（亮度 0.63）被压成 `#3f8e99`（亮度 ≤ 0.3、色相不变），无着色片段取传入的 `#333333`，断言全过。

### 打包：`docs/` 整树随版分发（此前 THEME-DESIGN-SPEC.md 没进包）+ 开发日志不进安装包

**现象**（用户反馈）：`docs/THEME-DESIGN-SPEC.md`（主题设计规范，71 KB，14 章 + 2 附录）在仓库里，但安装版与便携版的 `docs/` 目录里都没有 —— 用户拿不到这份「关键文件」，官网又在引导「想给主题换一套气质，先看 docs/THEME-DESIGN-SPEC.md」，进了包才说得通。

**根因**：`src-tauri/tauri.conf.json` 的 `bundle.resources` 路径**相对 src-tauri/**，所以真正的打包源是 `src-tauri/docs/`；而它与根 `docs/` 是**两份拷贝**，历史上靠**手工挑一批文件**复制（i18n 多语 readme、index.png、slideshow-style-mapping.md），`THEME-DESIGN-SPEC.md` 就这么漏了。`scripts/make-portable.ps1` 的同步表里只有根目录四份 md，`docs/` 从未纳入 —— 脚本头部那句「手动同步极易漏，漏了就会把旧文档打进安装包」正是这个坑，只是当年没把 `docs/` 一起纳进去。

**反向的一处**：根 `changelog.md`（261 KB 完整技术记录）**被当资源打进了安装包与便携版**，但全仓**零引用**（应用运行时只读 `welcome.md` / `help.md` / `skill-guide.md`；更新说明来自 `latest.json` 的 `notes`）。它只对开发者有意义，进包只增加体积与「两份副本」的维护面。

**改法**：

1. **`docs/` 整树镜像进包**：`docs/THEME-DESIGN-SPEC.md` 补进 `src-tauri/docs/`；`make-portable.ps1` 新增 docs 镜像段（复制缺的 → 覆盖旧的 → 删掉包里多出来的 → 逐文件 MD5 校验），排除 `docs/changelog/`（发布说明只走 GitHub Releases 与官网，不进包）
2. **开发日志不进包**：`bundle.resources` 去掉 `changelog.md`，便携版清单 `$items` 同步去掉，`$bundledPaths`（未提交改动提醒）改成「根三份文档 + docs + src-tauri」；**删除只用于打包的副本 `src-tauri/changelog.md`**（留着就是第三份「改错目录」的坑）
3. **新增门禁 `scripts/check-docs.mjs`**（`npm run check:docs`，已挂进 `npm run build`；而 `tauri build` 的 `beforeBuildCommand` 就是 `npm run build` ⇒ **出安装包之前必然跑到**）：
   - `src-tauri/docs/**` ≡ `docs/**` − `changelog/`（文件集合 + 逐字节；缺失/多余/不同都报错并点名文件）
   - 根文档副本逐字节一致：`help.md` / `welcome.md` / `README.md` → `src-tauri/{help.md,welcome.md,readme.md}`
   - 开发日志不得进包：`bundle.resources` 里不得有 `changelog.md`，`src-tauri/changelog.md` 不得存在
   - 该进包的资源不能缺席：`bundle.resources` 必须含 `docs` / `help.md` / `welcome.md` / `readme.md`（镜像了却没进 resources ＝ 白同步）
4. **文档口径同步**：`help.md`（程序目录说明 + 自定义主题一节新增指向 `docs/THEME-DESIGN-SPEC.md` 的引导）、`README.md` 与 14 份 `docs/i18n/readme-*.md` 的目录树里 `changelog.md` → `docs/`，`website/help.html` 同改（`docs/i18n` 那 14 份按语种各写一句本地化注释，保持各语言目录树结构一致）

**为什么不只补这一个文件**：漏文件的机制是「两份拷贝 + 手工挑子集」——只补一份文件，下一个新文档还会漏。镜像语义把「仓库里有什么文档」与「包里有什么文档」交给同一条规则（`docs/` 减去 `changelog/`）决定，门禁保证它不被绕过；对偶的 `check-themes.mjs` 守的正是同一类坑（`src/assets/themes/` 副本）。

**验证**：

- `node scripts/check-docs.mjs` → `docs/` 17 个文件与包内副本一致（排除 `docs/changelog/`）、根文档副本 3/3 一致、开发日志未进包 ✓
- **反向逐条验证**（每改一处跑一次，全部 exit 1 且报错点名文件）：删 `src-tauri/docs/THEME-DESIGN-SPEC.md` → 「docs/ 有 1 个文件没进包：THEME-DESIGN-SPEC.md」；改一字节 `src-tauri/docs/slideshow-style-mapping.md` → 「内容不同」；`copy changelog.md src-tauri/changelog.md` → 「开发日志不进包」；改一字节 `src-tauri/help.md` → 副本漂移；新增 `src-tauri/docs/stale.md` → 「陈旧副本」；临时删掉 resources 里的 `"docs"` → 「缺少 docs」；每次复原后回到 exit 0
- **镜像语义实跑**：故意造三种漂移（删 `THEME-DESIGN-SPEC.md` / 改过 `slideshow-style-mapping.md` / 多出 `stale.md`）后 `pwsh scripts/make-portable.ps1 -SkipZip`：日志 `同步 docs/ -> src-tauri/docs/（17 个文件，排除 changelog；删除多余 stale.md）`，随后按预期停在 exe 版本校验（0.3.4 vs 0.3.5，需重新 `npm run tauri:build`），复检 exit 0 —— 同步段确实把三种漂移都修回来了
- **既有漂移顺带修掉**：`src-tauri/readme.md` 与根 `README.md` 在主题清单两行的对齐空格上不一致（打包时会被覆盖，但仓库里两份不同）；现已同步
- `npm run build` 全链（含 `check:docs`、`tsc`、`vite build`）通过

**留的尾巴**：`src-tauri/skills/` 与 `src-tauri/keybindings.json` 也是「根副本 → 包内副本」，但没纳入本门禁 —— `keybindings.json` 应用运行时会写（开发态就可能变），不是纯镜像；`skills/` 与本次改动无关。两者都不是文档，要守得各自定规则。

### 正文列宽度：边缘拖拽手柄（源码 / 实时 / 预览共用一个全局宽度）

**需求**（用户提出）：正文列左右边缘各有一个**默认完全不可见**的调宽手柄 —— 鼠标移到边缘才浮现一条主题色短竖线（上下两端渐变透明），按住左右拖改变正文列宽度；源码 / 实时 / 预览**共用同一个值**；窗口变窄时正文仍按原有自适应逻辑收窄，不做成固定宽度。

**改法**：

1. **设置项**（`src/stores/settingsStore.ts`）：新增 `contentMaxWidth`（默认 900），导出 `CONTENT_WIDTH_MIN / MAX / DEFAULT`（400 / 1600 / 900）给手柄与迁移共用；persist 版本 12 → 13，迁移用 `clampNumber` 收敛手改 localStorage 的越界值
2. **CSS 变量**（`src/App.tsx`）：在已有的字体变量 effect 里写 `--content-max-width`，三种模式共用这一个变量
3. **消费端**（`src/components/Editor.tsx`）：`.cm-content` 的 `max-width` 改为 `var(--content-max-width, 900px)`（源码 + 实时都走 CodeMirror）；预览 `.editor-content` 用**内联** `max-width: var(...)` —— 各主题文件里有 `.editor-content.theme-x { max-width: 800px }`（特异性 0,2,0），内联样式压过它且不需要 `!important`。打印规则补 `!important`，避免内联样式让打印不再满页宽
4. **手柄**（新文件 `src/components/ContentWidthHandles.tsx`）：16px 隐形命中条 + 88px 短竖线（`linear-gradient(to bottom, transparent, var(--editor-accent), transparent)`），竖线跟随光标上下移动；拖动时锁光标 / 禁选中文字；双击复位默认；并排（split）模式不渲染

**三个绕不过去的坑**：

- **位置不能纯 CSS 算**。看着正文列是 `margin: 0 auto` 的居中列，边缘位置 = `(面板宽 − maxWidth) / 2` 就够了 —— 但 CodeMirror 的 `.cm-scroller` 是 `display: flex`，行号 gutters 占着左侧空间，`.cm-content` 只在**剩余空间**里居中，实测中心比面板中心偏右 **10.5px**（gutter 21px 的一半）；预览面板的纵向滚动条同样会带来 8px 偏移。纯 CSS 推算会整体错位，所以改成实测 `getBoundingClientRect()`：源码 / 实时 118.5px、预览 8px 两种模式都精确贴边
- **重测时机比想象中难**。写变量的 `App` 是 **useEffect（passive）**，而子组件的 `useLayoutEffect` 先跑 —— 两者之间必然差一帧；`ResizeObserver` 也是按帧回调（本次无头验证环境里干脆一次都不触发，连普通 div 改宽都不回调）。最终加了一个 `MutationObserver` 直接盯 `<html>` 的 `style` 属性：谁改了 `--content-max-width`（拖动、双击复位、设置面板、存档迁移恢复）立刻重测，不依赖帧调度
- **拖动不能每帧写 store**。`App.tsx` 用的是无 selector 的 `useSettingsStore()`（订阅全部状态），`setField` 会让整棵树重渲染，每帧一次必卡。改成拖动期直接 `style.setProperty('--content-max-width')` + 实测重算，**松开鼠标才落库**持久化。顺带一个有用的性质：写变量后立刻读 `getBoundingClientRect()` 会强制同步布局，所以线与正文列在同一帧就能跟上光标

**宽度算法**：拖动用「光标位移 × 2」而不是「光标到列中心距离」—— 正文列居中、两侧对称外扩，光标移 1px 意味着两侧各外扩 1px。用增量写法可以让被抓的那一侧边缘精确跟随光标，也避免按下时光标没完全压在边缘上造成的起始跳变。实际宽度仍是 `min(设置, 可用宽度)`，所以窄窗口下手柄会贴到面板边缘（实测：设置 1100、面板 1116 − 21px gutter ⇒ 正文 1095，右手柄 `right: 0px` 贴边）。

**验证**：

- `npx tsc --noEmit` 无输出；`npm test` → **254 passed**；`npx vite build` 通过
- **无头 Edge + CDP 真实鼠标事件驱动**（点击 / 悬浮 / 拖拽 / 双击 / 切模式全部走 `Input.dispatchMouseEvent`）：
  - 源码：拖左边缘 −60px → 900 → **1020**，两条手柄中心 318.5 / 1338.5 与 `.cm-content` 左右边完全重合；落库 `"contentMaxWidth":1020`
  - 双击复位 → 900，手柄同步回到 378.5 / 1278.5（这一条正是发现「重测差一帧」的场景，加 `MutationObserver` 后才稳定）
  - 预览：`.editor-content` 268–1368（1100），手柄中心 268 / 1368 精确重合，线色 `rgb(0, 102, 204)` 取自主题 accent，悬浮时 opacity 0 → 1
  - 并排：`.cursor-col-resize` 数量 0（手柄不渲染）
- 截图确认竖线是主题色、两端透明、贴正文列边缘且不压文字

**已知取舍**：

- **默认 900px 会让部分主题的预览宽度变化**。源码模式改动前就是 900，不变；但预览模式下十几个主题原本自带 `max-width: 800px / 700px`，统一到全局值后会跟随 900 —— 这是「三处共用一个宽度」的必然结果（没有哪个默认值能同时等于 900 和 800），代码注释里写明了
- **并排模式不显示手柄**：两列各有各的居中列，一个相对整行的手柄对不齐两处
- 导出 / 打印不受影响：导出走独立构建的 HTML，本来就在 `extraCss` 里写 `max-width: none !important`

### 正文列宽度手柄：只显示被拖一侧 + 悬浮提示（2026-10-21）

**需求**（用户提出，三条）：① 拖动某一侧时**另一侧的竖线不能露出来**；② 悬浮到边缘、竖线出现时给出「按住拖动调整宽度」的提示；③ 提示放在竖线**外侧**。

**改法**（`src/components/ContentWidthHandles.tsx`）：

1. **只显示被拖一侧**：此前两侧的竖线都由同一个「指针在附近」状态驱动，一按下去两条线一起亮。现在多一个 `dragSide: 'left' | 'right' | null` —— `pointerdown` 记下被抓的是哪一侧，拖动期间只有那一侧渲染竖线与提示，`pointerup/pointercancel` 清空
2. **提示文案进 i18n**：新增 `editor.widthHandleHint`（15 个语言词典），`npm run build` 里的 `check-i18n --strict` 通过（623 个键）
3. **提示放外侧、放不下时翻到内侧**：提示绝对定位在竖线的外侧。编辑器容器是 `overflow: hidden`，窗口窄时外侧可能只剩几十像素，直接定位会被裁成半截 —— 所以渲染后用 `offsetWidth` **实测**提示宽度，外侧空间 < 提示宽度 + 24px 就翻到内侧（`is-flipped`），两侧都不会被裁

**验证**：`npx tsc --noEmit` 无输出；`npm test` → **267 passed**（新增 `tests/exportHtml.test.ts` 13 条，见下节）；`npm run build` 通过；悬浮截图确认右侧手柄的提示在竖线外侧、文字不截断。

### 导出 PDF：对齐预览的排版，纸面统一白纸（2026-10-21）

**需求**（用户提出，分三轮追加）：这一版主线是「导出文档的格式还原」，Word 差不多了，**PDF 还没适配** —— ① PDF 必须按预览设定的**字体与字号**排版；② 逐项检查各种 Markdown 格式能否还原。③ 第一轮要求「按明暗色区分，暗色主题导出继承暗色」；实机看过导出结果后改为：**PDF 背景不好看，不要背景了** —— 亮色主题也不铺主题底色，**暗色主题同样按亮色纸面导出**；但**字体、字号、公式、图表、有序/无序列表、代码块等排版还原仍按新方案**。④ 再追加：主题在预览里有**页面背景与页面边框**的（液态玻璃 Prism、Facebook 这类「卡片式」正文），导出 PDF 时**统一去掉背景和页面边框**。

**最终效果**：PDF = **白纸 + 版心**。字体/字号/行高/列宽跟随设置里的「预览字体 / 预览字号 / 预览行高」，公式、列表、代码块、表格、脚注、图片照预览还原；暗色主题按主题自己的亮色配色导出（深色字、强调色保留色相），没有深色纸面、也没有卡片外框。

**五个根因**（第 1/2/3/5 条在前端或构建期，第 4 条在 Rust 侧）：

1. **预览排版带不走**。预览的字体 / 字号 / 行高 / 列宽是**内联**在 `.editor-content` 元素上的（`style={{fontFamily: 'var(--font-preview)', …}}`），而导出只取了 `contentEl.innerHTML` —— 内联样式不在 `innerHTML` 里。于是导出的 PDF 与 HTML 一律回落到主题 CSS 的默认字体字号，设置面板里的「预览字号」完全不起作用
2. **设置变量也带不走**。`App.tsx` 把 `--font-preview` / `--preview-font-size` / `--preview-line-height` / `--content-max-width` 写在 **`<html>` 的内联 style** 上（`document.documentElement.style.setProperty`）。导出 HTML 里没有这些变量，上面第 1 条就算搬了内联样式，`var(--preview-font-size)` 也解析不出值
3. **纸面背景两头都不对**。`extraCss` 里原本写死 `body{background:#fff}` —— 浅色主题没问题，暗色主题就变成「白底 + 亮色正文」，几乎不可读；而把背景交还给主题（第一轮的做法）又变成整页深色，纸面上并不好看。根子在于「主题暗色变量」和「白纸」本来就不兼容：要么铺满暗底，要么白底配亮字。最终方案不是换色，而是**打印时不带 `dark` 类**，让主题自己落到亮色配色上（见「改法」），同一份 CSS 既给出深色字、又给出亮色系的局部底色
4. **WebView2 `PrintToPdf` 的默认参数与预览不符**：Letter 纸张、**不打印背景色**、带页眉页脚（URL/日期）。不印背景会让代码块/表头/引用这些**局部底色**全部消失（暗色主题下这些底色原本就是深色，去掉后连文字都可能看不清）
5. **KaTeX 字体在导出窗口里 404**。`katex.min.css?inline` 里的字体是相对路径（`./KaTeX_*.woff2`），导出窗口走自定义协议 `yiziexport://`、独立 HTML 文件旁边也没有 `assets/` —— 公式退化成回退字体（分数线、根号、字距全走样）

**改法**：

- **组装逻辑抽成纯函数** `src/lib/exportHtml.ts`（`buildExportHtml`），`App.tsx` 只负责把「预览现场」读出来：正文 `innerHTML` + 正文元素的 `class`/内联 `style` + `<html>` 的内联 style + 主题/用户/KaTeX/基础 CSS + 大纲条目。好处是可单元测试（见 `tests/exportHtml.test.ts`），这类「漏搬一个输入」的缺陷在 UI 上看不出来
- **属性值转义**：内联样式里可能带引号（`--font-preview: MiSans, "Microsoft YaHei"`），拼进 `style="…"` 必须转 `&quot;`，否则属性被截断
- **打印样式**（`PRINT_CSS`）：
  - **纸面一律白底**：`html,body{background:#fff!important}`，撤掉主题底色铺满纸面的规则（第一轮曾用 `html{background-color:var(--editor-bg)}` 让整张纸跟主题，实测暗色 PDF 是一整页深色，用户否决）
  - **页面背景与页面边框统一去掉**：有些主题（液态玻璃 Prism、Facebook）把 `.editor-content` 做成卡片 —— 渐变底 + 圆角 + `box-shadow` 描边/投影。打印时对容器 `background:none` / `border:none` / `box-shadow:none` / `outline:none` / `border-radius:0`（均 `!important`，压过主题的 `.editor-content.theme-x` 特异性），纸上只剩版心文字；**局部**元素（代码块、表头、引用）不动。全量扫过 16 个内置主题，只有这两个给正文容器加了页面级背景/边框，但这条规则对**自定义主题**一样生效
  - **打印不带 `dark` 类**：`buildExportHtml` 在 `print` 时把 `themeClass` 算成 `theme-x`（去掉 `dark`）。主题文件里亮色变量是 `:root.theme-x`、暗色是 `:root.theme-x.dark`，去掉 `dark` 就**自动落到该主题自己的亮色配色**，不需要另做一套「白底等效色」换算 —— 暗色主题导出的 PDF 因此是白纸 + 深色字，代码块/表头的局部底色也是亮色系。独立 HTML 导出仍按预览带 `dark`
  - `@page{size:A4;margin:18mm}`；`print-color-adjust:exact` 保证**局部**底色（代码块、表头、引用）照实印出来
  - `.code-block-actions/.code-block-lang` 等预览悬浮控件 `display:none`（编辑辅助，不该上纸）
  - 代码块 `white-space: pre-wrap` + `overflow: visible`：纸上没有横向滚动条，不折行就会被**裁掉右半截**
  - 分页保护：标题 `break-after: avoid`，`pre/table/blockquote/figure/img/.katex-display` `break-inside: avoid`，`thead{display:table-header-group}`（长表格每页重复表头），`orphans/widows: 3`
- **Rust `PrintSettings`**（`src-tauri/src/pdf_export.rs`）：`ICoreWebView2_2::Environment()` → `ICoreWebView2Environment6::CreatePrintSettings()`，然后 `SetShouldPrintBackgrounds(true)` / `SetShouldPrintHeaderAndFooter(false)` / A4（210×297mm，单位英寸）/ 四边 18mm / `SetScaleFactor(1.0)`。纸张与页边距与 CSS `@page` 取同一组数值，谁生效都不会出现两套版心
- **KaTeX 字体构建期内联**（`vite.config.ts` 新增 `inlineKatexFonts()`）：只处理 `?inline` 的那份 CSS，把 `url(…woff2)` 换成 `data:font/woff2;base64,…`（20 个字体共 254 KB，woff/ttf 是给老浏览器的回退，不搬）。应用自身的 KaTeX 样式不受影响

**验证**：

- `npm run build` 通过，日志 `[inline-katex-fonts] 20 个 woff2 已内联`；产物 `dist/assets/index-*.js` 里 20 处 `data:font/woff2;base64,`
- Rust 重新编译通过（`Finished dev profile`），tauri dev 自动重启
- `npm test` → **267 passed**（新增 13 条导出断言：`<html>` 变量与正文内联样式落位、引号转义、打印强制白底、打印去掉 `dark` 类、页面背景/边框清零、`@page` A4/18mm、分页规则、悬浮控件隐藏、PDF 不出大纲、HTML 导出带大纲）
- **无头 Edge 打印实测**（同一份 `buildExportHtml` 输出 + 真实主题 CSS + 真实 markdown 渲染，`docx-export-test.md` 全量用例），三轮都测了：
  - 页面 `595 × 842 pt` = **A4**；浅色 / 暗色各 14 页（卡片式主题 17 页）
  - 第一轮：暗色主题**整页深色**、亮色正文（技术上成立，但用户认为纸面上不好看 → 否决）
  - 第二轮：**暗色主题导出与浅色一样是白纸**，正文为深色字、标题强调色保留原色相，代码块/表头/引用的局部底色为亮色系（`print-color-adjust:exact` 生效）；字体、字号、行高与传进去的预览设置一致
  - 第三轮补测 **液态玻璃 Prism / Facebook**（浅色 + 暗色四份）：页面纯白、正文**不再有卡片底色/描边/投影**，只剩文字；液态玻璃的渐变标题（`background-clip:text`）仍正常显示，块引用/代码块等**局部**样式保留
  - KaTeX 公式正常（积分号、分式、上下标、`f(x)=…` 多行对齐），字体已内联
  - 表格跨页时表头重复；代码块长行折行不裁切；任务列表勾选框、脚注区、引用块、行内代码/上下标/高亮、远程图片均正常
  - 浅色主题与暗色主题的排版一致，只换配色

**已知边界**：

- **代码块不折行的长行会被折行**（预览可以横向滚动）：纸面没有滚动条，折行是唯一不丢内容的选择 —— 这一点与预览「长行可横向滚动」不同，属于必然差异
- **相对路径图片**依赖预览已经把 `src` 换成 data URL（`Editor.tsx` 的本地图片解析 effect）。导出瞬间预览还没渲染完（150 ms 防抖）或图片解析失败时，PDF 里会是断图 —— 与 Word 导出同一套限制
- **mermaid 等插件内容**由插件在预览 DOM 里渲染成 SVG 后随 `innerHTML` 带出（本轮未单独做图形级验收）
- **自定义主题要按「亮/暗两套变量」的约定写**：PDF 去 `dark` 类后直接使用 `:root.theme-x` 那一套，所以深色配色必须写在 `.dark` 块里；如果把深色配色直接写在 `:root.theme-x`（没有 `.dark` 变体），白纸上就会印出原本给深色屏幕配的浅色字 —— 这与 Word 导出不同（Word 会做「白底等效色」换算，PDF 不做，只做 `dark` 有无）

## v0.3.4

> 本节为**未开发完成的备忘**，仅记录待办，发布前需整理成正式版本说明。

### 0.3.4 发布 + 在线更新实测通过（批次 4-丁，2026-10-18 实测）

**① 0.3.4 走 CI 发布，资产与清单逐项核过**

6 个资产（NSIS `setup.exe` + `.sig` + `latest.json` + 便携版 + 源码包 + dmg），**没有任何 MSI** ✓。匿名（不带 token）拉取端点、签名、安装包全部 HTTP 200 ✓；清单两个平台键都是 **tag 固定 URL**（`releases/download/v0.3.4/...`，不是 `latest/download/...`）✓；清单里的签名与 Release 上的 `.sig` **逐字一致** ✓（不一致的表现是用户端"签名校验失败"）；Release 正文 == 清单 notes == `docs/changelog/CHANGELOG-V0.3.4.md`（三者 3216 字符完全相同）✓。

**草稿不是 Latest**：CI 产出的是草稿，必须先人工 Publish，否则 `/releases/latest/download/latest.json` 一直指向上一个 Latest（4-丙里写下的这条规矩，本次由实测确认）。

**② 本机清理：MSI 0.3.3 与 NSIS 0.3.1 遗留的"双记录"**

用户用系统卸载器卸掉 MSI 0.3.3 后，剩下 HKCU 的 NSIS 0.3.1 记录 + `D:\Program Files\YiziMarkdown` 残留。清理前发现一件要命的事：那个目录的 `themes/` 里有 **36 个 css 从没随任何版本发布过**（把全历史 `src-tauri/themes` 的文件名单抽出来比对确认），它们**是用户自己的主题** —— 因为 `list_themes()` / `read_theme_css()` 读的是 `get_app_root()`（exe 所在目录），往那儿放 css 就会生效。所以流程是**先备份再删**：

- 备份 `%USERPROFILE%\Documents\yizimarkdown-0.3.1-backup\`（40 文件，逐项字节对账）+ 注册表键 `.reg` 导出
- 备份后：删键、删残留目录、删指向已消失 exe 的开始菜单快捷方式
- **保留** `%LOCALAPPDATA%\com.yizimarkdown.editor\EBWebView`（标签页自动恢复与会话设置的载体）

**③ 安装形态实测判定为 `nsis` ⇒ 自动更新放行**

判据两条同时成立：注册表卸载项的 `InstallLocation` 与运行中 exe 所在目录一致 ✓。

**④ 0.3.5-beta.1 实测：0.3.4 应用内一键更新全链路通过（用户确认"很丝滑"）**

beta 的发布方式做到**不碰 main**：提版提交放在临时分支 `beta-0.3.5`，**只推 tag** `v0.3.5-beta.1`（远端 main 全程停在 `f68a118`）；CI 构建草稿 → 人工 Publish（`prerelease: false`）→ 占住 Latest。

- 清单核对：`version=0.3.5-beta.1`、两个平台键都是 tag 固定 URL、签名与 `.sig` 逐字一致、notes 与 `CHANGELOG-V0.3.5-beta.1.md` 相同 ✓
- **产物名带预发布后缀**（`YiziMarkdown_0.3.5-beta.1_x64-setup.exe`）—— CI 里"用 glob 取实际产物名、不拼字符串"的决定，被这一版证明是必要的
- 实测链路：状态栏「有新版本」→ 更新说明（与应用内文案同源）→ 下载约 8 MB → 签名校验 → **被动模式安装**（无向导、不问目录）→ **自动重开** → 版本号变 `0.3.5-beta.1` ✓
- 更新后复核：**原地更新**（目录没变）、exe `FileVersion` 已变、**用户自加的 36 个主题全部留存**、`user.css` / `keybindings.json` **未被重写**（mtime 仍是首次安装时间；二者内容与随包资源逐字节相同，说明安装器是"按内容差异覆盖"）、EBWebView 完好（标签页与设置没丢）
- ⚠️ **新发现的隐患**：`user.css` / `keybindings.json` 是**随包资源**，一旦用户自定义过，更新时会被随包版本覆盖（本例因为没自定义过才看不出来）。列入遗留
- 收尾：删除 beta Release（`--cleanup-tag`）、删除临时分支、版本号回退 `0.3.4`；`/releases/latest` 落回 `v0.3.4` ✓

**⑤ 三条开发期经验（都不是产品缺陷，但会浪费很多时间）**

- **dev 版与安装版不能同时开**：同一个 identifier ⇒ 同一个 WebView2 配置目录，后启动的那个拿不到用户数据目录而失败（本次表现就是 dev 客户端 exit code 1）
- 安装/更新时会**关闭同名进程**（都叫 `yizimarkdown.exe`）—— dev 客户端会被安装器顺手收走，不是它崩了
- 验端点的坑：GitHub 的 Release 资产响应是 `Content-Type: application/octet-stream`，PowerShell 下 `Invoke-WebRequest` 的 `.Content` 是**字节数组**，必须先 `[Text.Encoding]::UTF8.GetString()` 解码再解析，否则会得到"版本为空"的假象（一度误判成 CDN 缓存）

### 分发改用 GitHub Releases：端点落定、CI 补上 latest.json、MSI 彻底退场（批次 4-丙，2026-10-18 实施）

**① 端点从 TOS 换成 GitHub —— 这是「发出去就改不了」的那一类配置**

`plugins.updater.endpoints` 原本是占位地址 `https://REPLACE-BUCKET.tos-cn-beijing.volces.com/updates/latest.json`，现改为：

```
https://github.com/laoduu/YiziMarkdown/releases/latest/download/latest.json
```

选 `/releases/latest/...` 而不是固定 tag：客户端**只维护一个 URL**，由下一个版本的发布自动顶替。代价是「必须把 Release **Publish** 成非草稿、非预发布」—— GitHub 的 `latest` 会跳过草稿与预发布，退回上一个 Latest。这条写进了 `release.yml` 头部注释。

`scripts/check-updater.mjs` 会挡住占位地址（`REPLACE|PLACEHOLDER|example.com|YOUR-`）与非 https，且**故意不并入 `npm run build`**（本地构建不需要真端点，天天红着的门禁会被无视），由 release.yml 在昂贵的 Rust 构建之前调用。改完实测：`✓ 在线更新配置就绪（pubkey / endpoints / installMode）`。

**② CI 缺的正是 latest.json —— 没有它，应用内更新在这台机器上永远「没有新版本」**

`release.yml` 原先只构建并上传 NSIS 安装包与 `.sig`（注释里还写着「与安装包一起上传火山 TOS 供 latest.json 引用」），但**没有任何一步生成或上传 latest.json**。补上一步，放在便携版/源码包之后 —— 即整份 Release 的**最后**：

```bash
setup=$(ls src-tauri/target/release/bundle/nsis/*-setup.exe)   # 用 glob 取实际产物名
node --experimental-transform-types scripts/make-manifest.mjs \
  --version "${GITHUB_REF_NAME#v}" \
  --notes "docs/changelog/CHANGELOG-V${GITHUB_REF_NAME#v}.md" \
  --base-url "https://github.com/${GITHUB_REPOSITORY}/releases/download/${GITHUB_REF_NAME}" \
  --artifact "windows-x86_64-nsis=${setup}" --artifact "windows-x86_64=${setup}" \
  --out .release_tmp/latest.json
gh release upload "$GITHUB_REF_NAME" .release_tmp/latest.json --clobber
```

三个要点都是踩过才知道的：**产物名用 glob 取**（版本号带 `-beta.1` 时拼字符串极易对不上）；**base-url 必须是 tag 固定 URL**，不能用 `/releases/latest/download/<file>`（否则旧版本客户端会拿到新清单、下到与自身对不上的产物）；**清单最后上传**（客户端一拿到清单就去下产物，清单先到会撞 404）。另外加了 `${setup}.sig` 存在性检查：缺签名直接 `::error::` 失败，而不是静默产出一个「永远没有更新」的版本。

**③ MSI 从 v0.3.4 起彻底不发 Release —— 核对结果：CI 规则已经改到位**

`release.yml` 的 Windows 腿已是 `--bundles nsis`，头部资产注释也写明「v0.3.4 起不再发布 MSI」，本次只把资产清单更新到最新一版（5 个＋一份 `.sig`）。本地 `npm run tauri:build` 仍会产出 MSI（`bundle.targets: "all"` 无法按平台区分），这是既知待办，不影响发布。

顺手清掉文档里「MSI 还能下载」的残留口径：`docs/changelog/CHANGELOG-V0.3.4.md`（原文一边写「MSI 请手动下载」、一边写「不再提供 MSI」，自相矛盾）、`help.md` + `src-tauri/help.md` 各两处。

**④ 页签改名后的口径清理**

「关于」→「版本与更新」之后，仓库里还有一批把该页签称作「关于」的**注释与帮助文案**：`help.md`（两处，随包进应用）、`App.tsx`、`StatusBar.tsx`（两处）、`updateStore.ts`（两处）、`settingsStore.ts`、`SettingsModal.tsx`、`check-version.mjs`、`upload-tos.mjs`。**技术日志里的历史条目一律不动** —— 那是当时决策的现场记录，改它等于篡改记录。

**⑤ 已知限制：GitHub Releases 不能给 latest.json 设响应头**

按 TOS 方案定的规矩是「清单 `Cache-Control: no-cache`、产物 `max-age=31536000, immutable`」。GitHub Release 资产由平台托管，**设不了响应头**，客户端与 CDN 可能缓存旧清单若干分钟。所以「发布 → 立刻验证」之间要留出这个窗口；真要精确控制缓存，得回到对象存储那条路（`.tos/config.json` 与 `scripts/upload-tos.mjs` 已保留可用）。

### 设置面板三处改动：更新说明不再内滚、「关于」→「版本与更新」、新增「其他产品」（批次 4-乙，2026-10-18 实施）

界面与文案为主，但过程中踩到两个真问题：**主题的卡片装饰会随 `.editor-content` 一起进设置面板**，以及**按字符串切片批量改 15 个语言文件时的行尾接缝**。

**1）更新说明的内滚动条是「主题卡片 + 内联限高」叠出来的**

说明区一直写着 `maxHeight: 200, overflowY: 'auto'`，长说明就出现**第二根滚动条**（面板本身已有一根）。去掉限高交给外层 `.settings-content-scroll` 统一滚 —— 滚动能力一点没少，只是不再「面板里滚一段、里面还套一段」。

那圈看着很重的边框也不来自我们的 CSS：默认主题把 `.editor-content.theme-x` 画成一张玻璃卡（`box-shadow: 0 0 0 1px rgba(120,152,205,0.4)` + 3 层阴影 + 18px 圆角）。说明块借这个类是为了**跟主题一致的排版**（标题/链接/列表色），于是卡片装饰也一起借来了；现在只留排版，卡片换成一根 token 淡边（`color-mix(in srgb, var(--editor-border) 50%, transparent)`）。

覆盖它的选择器必须**四层类名**：主题 CSS 注入在 `head` 末尾，亮色版 `.editor-content.theme-x` 是 (0,2,0)、暗色版 `.dark .editor-content.theme-x` 是 (0,3,0)，写一层 `.update-notes` 会被「后注入者胜」压回去；`.settings-modal-container .settings-content-scroll .update-notes.editor-content` 是 (0,4,0)，亮暗都稳。**没有用 `[class*=]`** —— `check-themes.mjs` 把属性选择器列为反模式，用了会让发布前自查（`--strict`）变红。

**2）dev 下这段说明根本不渲染，只能靠临时补丁「按出」一个更新来验收**

`getUpdateBlocker()` 在 dev 下返回 `dev`，卡片只渲染「开发版不能自动更新」，说明区永远不出现。所以加过一段标了 `TEMP-PREVIEW-STYLE` 的临时补丁：同时按掉 blocker 与「update 为空」两个条件，用 `docs/changelog/CHANGELOG-V0.3.4.md?raw` 当假说明。它不联网、点「立即更新」也不动文件（store 里的 `update` 仍是 null）。**用户看过样式后已删除**（`grep TEMP-PREVIEW-STYLE` 为空），正式包不带它。

**3）批量补 15 种语言时，切片插入点带出了 `\r\r\n` 与裸 `\n`**

「其他产品」要 15 个语言文件各加 7 个键（`settings.products`、5 个产品简介、`settings.authorHome`），并把 `settings.about` 的值改成「版本与更新」。手改 15 个文件必漏，所以写一次性脚本按**命名空间收尾行**定位插入。

插入点实现踩了行尾：切片 `seg` 本身带着上一行结尾的 `\r`，我又补了一个 `\r\n` → 接缝成了 `\r\r\n`；收尾处只补 `\n` → 成了裸 LF。`git diff` 因此显示每文件 1279 行变动，看着像把整份字典重排了一遍。**教训：按字符串切片插入，先想清楚切片端点有没有吃掉 `\r`。** 修好后 `\r\n` 接 `\r\n`，`git diff --ignore-cr-at-eol` 回到每文件 42 行新增（本次 7 行），各语言只剩 1 处**既有**裸 LF（`core.autocrlf=true` 会在提交时归一，仓库内容不受影响）。

**4）「其他产品」的数据来源与打包**

清单/图标/官网全部取自作者自己维护的 YiziVoice 仓库（`src/components/hub/AboutPanel.tsx` 的 `PRODUCTS` + 该仓库 `public/*.png`）：YiziVoice、YiziShare、YiziStudio、一路狂标、荔书，外加作者主页 `https://www.1ziai.com/`（YiziMarkdown 自己**不在**列表里）。5 个图标拷进 `src/assets/products/` 一起打包（约 150KB），不引外链、不在运行时下载，离线可见；卡片右侧标出域名，点之前就知道会跳到哪。

名字与官网属于品牌信息**不翻译**，只有简介走 i18n（15 种语言齐全，`check-i18n --strict` 0 缺失、461 静态键全部有定义）。门禁：`tsc --noEmit` 0、`check-i18n --strict` 0、`check-themes` 0 失败、`check-tauri-args` 18/18；dev 里已逐屏核对（页签名、5 个图标、域名、作者主页）。

**用户面向的版本说明同步改了两处**：`docs/changelog/CHANGELOG-V0.3.4.md` 里「关于」的引用改为「版本与更新」（该文件同时是 GitHub Release 正文与应用内更新说明），并新增「设置：其他产品」小节。

**5）作者主页的头像是下载后打包的，不是外链**

`https://www.1ziai.com/media/logo/logo-235c7fcd.svg`（935×1215 竖版插画、573 条 path、115KB）下载进 `src/assets/products/1ziai.svg`。核对过里面**没有** `<image>` / `xlink:href` / `url()` / `<script>` / 外链字体 → 在 `<img>` 里能独立渲染，不需要网络。图标位用 `object-fit: contain` + 一层主题底色（`--editor-hover`），竖版放进 36px 方块里显示为约 23×30，不会裁掉头部。构建产物已确认：`dist/assets/1ziai-*.svg`，115370 字节。

**验证方式的一个更正**：这一轮本想用合成鼠标点击去点开设置面板，实测**点不动** —— 连点宽按钮「设置」齿轮和左侧「文件」页签都毫无反应，说明当前会话注入的鼠标事件到不了应用窗口（之前几次「点开了」其实是用户自己在点）。顺带发现截图脚本拿窗口矩形原点当客户区原点，而 Tauri 无边框窗口的窗口矩形含约 8px 的 DWM 隐形边框，真实客户区原点要用 `ClientToScreen(0,0)`（实测偏 +8,+1）；脚本已改。后续实机验证（更新按钮）由用户手点，不依赖合成输入。

**收尾（用户已逐屏确认）**：状态栏那条提示的 tooltip（`statusbar.about`）**按用户决定保持「关于 YiziMarkdown」不变**，本次只改页签名；「其他产品」页的成品外观（5 个产品图标 + 作者主页 + 域名行）也确认通过 —— 作者主页最终用的是站点自己的 logo（`media/logo/logo-235c7fcd.svg`，下载后打包），不是占位图标。

### 发版管线打通：npm↔Rust 版本错配、签名环境的两个坑（批次 4-甲，2026-10-18 实施）

TOS 桶还没到手，但**发版链路上能先撞的坑都可以先撞一遍**：这轮把「构建 → 签名 → 上传脚本」逐段验到可复现，撞出来的两个问题都属于**本地门禁全绿、只有真正打包才现形**的类型。

**坑 1：npm 侧与 Rust 侧的 Tauri 版本已经飘开，`tauri build` 第一步就退出（在已提交状态里就已存在）**

```
Found version mismatched Tauri packages.
  tauri (v2.11.2) : @tauri-apps/api (v2.12.4)
  tauri-plugin-updater (v2.12.0) : @tauri-apps/plugin-updater (v2.14.0)
```

`package.json` 里写的是 `"^2"` 这类范围 —— 一次普通 `npm install` 就把 JS 侧抬到 2.14，而 Rust 侧由 `Cargo.lock` 钉在 2.12；CLI 要求两侧 major.minor 一致，于是**打包直接失败**。`npm run build`（tsc / i18n / themes 全是前端检查）完全看不出来，CI 的 `release.yml` 同样会炸。

- 处理：npm 侧改为**精确版本**并降到与 Rust 同 major.minor（`@tauri-apps/api` 2.11.1 / `@tauri-apps/plugin-updater` 2.12.0 / `@tauri-apps/cli` 2.11.2）。方向选「降 npm」而不是「升 Rust」：Rust 这套是路由 B 实测过的行为，升它会换进一段没人验过的更新器代码。
- 防守：新增 `scripts/check-tauri-versions.mjs`（读 `Cargo.lock` + `package-lock.json`，复刻 CLI 的判定规则、**只比 major.minor**），接进 `npm run build` 的链尾；另给一个 `npm run check:tauri-versions`。

**坑 2：签名要的是「私钥内容」不是路径；空口令也必须显式给**

- bundler 只认 `TAURI_SIGNING_PRIVATE_KEY`（**内容**）。`TAURI_SIGNING_PRIVATE_KEY_PATH` 只对 `tauri signer` 子命令有效；只给 PATH 时打包**成功**，只在最后报 `A public key has been found, but no private key`，产物**没有 `.sig`** —— 而没带 `.sig` 的包传上去，客户端会永远「查不到更新」。
- 私钥本身无口令，但 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 不给时 CLI 会走**交互式口令询问**（本地实测卡住 180s）。CI 没有 TTY，同理 = 不报错的等待 ⇒ `release.yml` 补 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ""`，并改掉原来「绝不能设」那句注释。
- 验证：`Finished 1 updater signature at: YiziMarkdown_0.3.4_x64-setup.exe.sig`（exe 8,221,230 字节 / sig 424 字节），exit=0。

**签名自检：唯一「错了就不可远程修复」的一环，做进上传脚本**

`tauri signer` 只有 sign / generate、**没有 verify**，所以 `upload-tos.mjs` 自己用 `tauri.conf.json` 里烧进去的 pubkey 验本次产物的 `.sig`。格式要点：两侧都是「文本文件的 base64」（外层解一次取文本、取第 2 行再解一次取二进制）；rsign 用 `ED` = 对消息的 **BLAKE2b-512 预哈希**做 ed25519（`Ed` 才是直接签消息），两种都试。实测：真 8.2MB 产物通过；把第 5000 字节改掉立刻被拒并 exit=1（自检有没有牙也验了）。

**`scripts/upload-tos.mjs` + `.tos/config.json`（桶分发端）**

`.tos/` 已进 `.gitignore`（里面放 AK/SK，绝不入库）。脚本的几个决定：

| 做法 | 为什么 |
|---|---|
| 产物先传、`latest.json` **最后**传，且 `Cache-Control: no-cache` | 顺序反了、或清单被 CDN 缓存住 ⇒ 客户端抱着旧清单一直「已是最新」，**且无法远程修复** |
| 产物名带版本 ⇒ `max-age=31536000, immutable` | 同版本产物永不变，吃满缓存 |
| 对象打 `public-read`，传完用**匿名** HEAD/GET 复验（长度 / `version` / 平台键） | updater 是匿名拉取；「桶不给公共读」的表现正是「永远查不到更新」，本地怎么试都正常 |
| 默认拒绝覆盖同版本产物（`forbidOverwrite`） | 防手抖重发同一版 |
| `npm run tos:endpoint` 打印端点 | 端点要写进 `tauri.conf.json` 且**发出去就改不了**，让它只从配置派生一次 |

**顺带查证（读源码与产物，不靠印象）**

- 生成的 `installer.nsi` 里有 `MULTIUSER_INSTALLMODE_FUNCTION RestorePreviousInstallLocation`，被动模式跳过目录选择页 ⇒ 更新**落在原目录**；模板还写明 *"In update mode, always proceeds without uninstalling"* ⇒ 不会出现第二份、也不会卸载重装。
- 构建日志有 `Patching … with bundle type information: nsis` ⇒ 清单里 `windows-x86_64-nsis` 键**一定命中**（双键只是保险）。
- Rust 侧 `base64::engine::general_purpose::STANDARD.decode()` **不 trim** —— 签名串带 `\n` 会把正确签名判成失败；而 `updateManifest.ts` 是 `signature: artifact.signature.trim()`（且拒空）⇒ `make:manifest` 与上传脚本都安全。
- `capabilities/default.json` 含 `updater:default`，且没有 dev 专用 capability ⇒ 发布版权限与开发版一致。
- 插件 2.12.0 的 `restart_after_install` **默认 true**（`updater.rs:197`）⇒「装完自动重开」不靠我们实现。

**仍未完成（等桶）**：端点写进 `tauri.conf.json` → `check:updater` 过 → 构建**真端点**的 0.3.4（占位端点那份冒烟产物已删，避免误装）→ 0.3.5-beta.1 入桶 → 真机点「立即更新」实测。

### 本地缓存的「自救出口」：状态栏 ⚠ 可点开清理（2026-10-18 实施）

批次 3-乙把配额满从「静默丢数据」变成了「报警」，但**只报警不给出口**等于只做了一半：普通用户没有开发者工具，撞上配额满只能看着 ⚠ 干着急（本轮用户就是这样撞上的，靠手工删 localStorage 键才恢复）。本批次补上出口。

**交互**：状态栏那个红色 ⚠ 变成按钮 → 打开「清理本地缓存」弹窗（`Dialog`），里面有当前占用（`{chars}` 字符 / 上限约 `{limit}`）与两个动作：

| 动作 | 做什么 | 为什么安全/危险 |
|---|---|---|
| 清理已保存文件的缓存 | 删掉「磁盘上已有权威副本」标签页的正文键 | 文件本身不受影响；未保存的正文（唯一副本）**一个不动** |
| 清空全部缓存 | 清单 + 全部正文键一起删 | 未保存内容的本地副本会消失 ⇒ 二次确认（复用 `common.confirm`/`common.cancel`） |

**存储层新增三个方法**（挂在 `createEditorStorage()` 返回的**同一个实例**上，`EditorStorage` 接口）：

- `usage()`：`measureStorage()` 统计整个来源的键数/字符数（把 `describeStorageUse` 的统计逻辑抽成数值版，诊断日志与弹窗共用一份口径）。**注意统计的是整个 localStorage**：别的键（如测试残留的 `filler`）同样吃配额，弹窗只清理本应用的键，所以文案说的是「本地存储已用」而非「应用缓存」。
- `dropRecoverableContent()`：只清 `isRecoverableFromDisk()` 的正文键。
- `clearAll()`：清清单 + 全部正文键（`known` 一并清空 ⇒ 下一次写入按新策略重建，未保存的正文会重新落盘）。

**三个必须记住的坑**：

1. **清完必须进入降级（`degraded = true`）**，否则下一次按键立刻把空间填回去：`planEditorStorage` 对「`known` 里没有的正文」判定为「正文变了」而重写，用户会觉得「清理没用」。这是本批次最容易漏的一条，已单测覆盖。
2. **清单里不认识的正文键一律不动**。清单写入失败时会留下这种「看起来像孤儿」的键，而它可能正是一篇未保存内容的唯一副本 —— 宁可少清一个键，也不能误删救不回来的正文。真正的孤儿键由写入路径自己回收（`planEditorStorage` 的 `deletes`）。
3. **`useEditorStore` 里的存储层实例必须是模块级单例**（`export const editorStorage = createEditorStorage()`）。它内部记着「磁盘上已有哪些正文键」（`known`）与 `degraded`；界面若另建一个实例去删键，这个内存映射就成了「清单说在、键已不在」的假象。为此把原来内联在 `persist({ storage: … })` 里的一次性调用提了出来。

**清理成功后**：撤掉状态栏常驻警示，并调用新增的 `resetEditorStorageWarning()` 复位「每级只报一次」—— 不复位的话，用户清理完再撞上配额满就永远收不到提示了。**一个键都没删掉时保留警示**（占用来自本应用之外的数据，问题还在，提示不该消失）。`resetEditorStorageWarning()` 与单测用的 `resetEditorStorageWarningsForTests()` 的区别是前者**保留订阅者**。

**界面**：`StatusBar` 的 ⚠ 由 `<div>` 改为 `<button>`（复用 `.statusbar-item`），悬停提示追加「清理本地缓存」；`App.tsx` 持有弹窗状态（`usage` / `reason` 在打开时捕获 —— 清理成功后状态栏文案会被撤掉，弹窗里仍要能说明来由 / `result` / `confirmingAll`）。i18n 新增 8 个键 × 15 语言（`app.storageCleanup*` / `app.storageUsage`）。

### 在线更新界面：状态栏提示 + 「关于」卡片（批次 3-甲，2026-10-18 实施）

**分层**（判断逻辑一律不进组件，组件只画）：

| 文件 | 职责 |
|---|---|
| `lib/update.ts` | 纯判断：版本比较、要不要提示、进度比例、体积格式化。有单测（`tests/update.test.ts`） |
| `lib/updateClient.ts` | 薄胶水：环境 / 安装形态探测、检查、下载安装。直接调插件与后端命令，不测 |
| `stores/updateStore.ts` | 状态机：`idle / checking / latest / available / skipped / downloading / installed / error` |
| `StatusBar.tsx` / `SettingsModal.tsx` | 状态栏一行提示；「关于」里的更新卡片 |

**环境闸门收在一处**（`getUpdateBlocker`）—— 散在界面里迟早出现「这个入口拦住了、那个没拦住」，
后果是把 MSI 用户装出**第二份程序**。六种「不能自动更新」的原因，任何一步拿不到答案都按保守处理：

- `dev`（开发模式：热更新的是源码，装包没有意义）、`not-tauri`
- `not-windows`（清单里没有 darwin 键，macOS 走 dmg 手动更新）
- `msi`（NSIS 安装包会装出第二份 ⇒ 给出「手动安装新版」的引导）
- `portable`（没有安装位置，覆盖不了自己）
- `unknown`（探测不出安装形态 ⇒ 宁可不更新）

探测链：`import.meta.env.DEV` → `__TAURI_INTERNALS__.invoke` → `get_platform` → `get_install_kind`（注册表）。
界面按探测结果换文案（`settings.updateBlocker*` 五条，映射表而非拼字符串 —— 拼的键漏一个就会把
`settings.updateBlockerXxx` 直接显示给用户）。

**打扰策略**：自动检查的失败与「已是最新」**全部静默**，只有「有新版本且没被跳过」才留下痕迹 ——
状态栏版本号右侧一行提示，点击打开「关于」（安装动作不在状态栏里做）。手动检查失败把原因留在卡片上
并可重试。启动检查延迟 3 秒，错开恢复标签页 / 加载主题 / 插件；若用户在这 3 秒内已打开「关于」
（卡片挂载时会查一次），启动检查直接跳过，不重复问网络。

**实现中发现并修掉的真问题**：`Update` 在 Rust 侧是资源，必须 `close()`。最初 `skip()` 里顺手把它
释放了 ⇒ 用户「跳过此版本」后再点「立即更新」只会拿到 `installUpdate: 没有待安装的更新`。
改为：只在 `checkForUpdate()` 开始时释放**上一次**的（反复检查不累积资源），跳过**不**释放
（用户随时可能改主意）。

**安装前清自动保存（上一轮定的口径，这里落地）**：给自动保存 effect 的依赖加上
`updateBusy`（下载 / 安装中）并在开头 `return` —— React 在依赖变化时先跑清理函数，
待执行的 `autoSaveTimerRef` 自然被清掉，不需要让更新模块反向去够 `App.tsx` 的 ref。
手动 `Ctrl+S` 仍然允许（明确意图；且安装器替换的是程序文件，不碰用户文档）。

**「装完谁把应用拉起来」查证过**（不是猜的）：读 `tauri-plugin-updater-2.12.0` 的 Rust 源码与
JS 类型定义 —— `downloadAndInstall(options)` 的 `restartAfterInstall` **默认为 true**，
为真时安装器参数里才会带 `nsis_restart_after_install_args()`；也就是说**安装器自己会把应用重新拉起**，
不需要我们做「重启」按钮。我们仍**显式传** `restartAfterInstall: true`（不依赖默认值，
将来插件改默认值时行为不会悄悄变），文案也从「装完请重新打开」改成「会自动关闭并重新打开」。

**两个界面细节**：① 总大小未知时不画假的进度条（只显示「已下载 X」），停着不动的 0% 只会让人以为卡死；
② 更新说明直接用 `renderMarkdown()` 渲染 `docs/changelog/CHANGELOG-V*.md`，与 GitHub Release 同源。

**上一轮留下的开放问题就此结案**（持久化降级到 `lost` 时，更新提示要不要更硬）：**不加拦截、不加摩擦，
只把文案改诚实**。卡片原来那句「编辑内容已实时保存」在 `lost` 状态是**假的**，改为按
`getLastEditorStorageWarning()` 的等级切换成「安装前请先按 Ctrl+S」。理由：① 该状态的常驻警示就在
状态栏上、离更新提示一行远，toast 也明确要求 Ctrl+S；② 硬退出与正常关窗在数据上等价（上一轮已证），
拦一道保护不了任何东西；③ 安装过程只动程序文件 —— 真正会丢内容的动作是「关掉应用」，那条路已经警示过了。

**i18n 两个坑**（都是本次踩到的）：① `scripts/check-i18n.mjs` 的 `parseDict` 只认**两层**
（命名空间缩进 2 空格 + 键缩进 4 空格），写成嵌套对象（`settings.update.title`）会让所有键报成
「用到但未定义」；本项目约定是**扁平点号键**（`settings.updateTitle`）。② `t(cond ? 'a' : 'b')`
里**两个键都不会被识别**（正则只匹配 `t('字面量')`），会落进 `--unused` 的「死键」名单 ——
写成 `cond ? t('a') : t('b')` 才看得见。

**门禁与文档**：新增 23 个键 × 15 语言（含五条 blocker 文案与 `statusbar.updateAvailable`），
用一次性脚本插入、未入库。`check-i18n --strict` 静态 450 / 动态 26、0 缺失；
`tsc` 干净；`npm test` 230 通过 / 0 失败；`npm run build` 通过。
`docs/changelog/CHANGELOG-V0.3.4.md` 补「在线更新」小节（用户向，含「0.3.4 是第一个带在线更新的版本、
一键更新从 0.3.5 起生效」这句必须说清的话）；`help.md` 补「通用设置 → 在线更新」与一条 FAQ，
**两份副本（根目录与 `src-tauri/`）已同步为 byte-identical**（`make-portable.ps1` 的头注释写明
打包读的是 `src-tauri/` 那份，手动同步极易漏）。

**仍未完成**：批次 4（TOS 桶 + `latest.json` 上传）。`tauri.conf.json` 的 `endpoints` 还是占位，
`npm run check:updater` 会因此失败 —— 该检查只在 `release.yml` 的 test 里跑，不进 `npm run build`，
所以本地门禁全绿而发版会被拦住，这正是设计意图。

### 本地假清单实测：三处修正（2026-10-18 实施）

**为什么值得单独记一笔**：TOS 桶还没到手，但更新的**全部软件路径**（除「装成功」那一步）都能在本地验完 ——
只靠 `make:manifest` 造的假清单 + 一个本地 http 服务。这一步最大的价值不是「确认能用」，而是**把只在真实运行时
才会暴露的问题逼出来**：下面三条在开发模式下都属于「看起来没问题」。

**测法**：`.release_tmp/latest.json`（版本谎报 0.3.5、签名是假的、`windows-x86_64-nsis` 与
`windows-x86_64` 两个键都给）由 `npm run make:manifest` 生成，临时 node 静态服务（带请求日志）监听
`127.0.0.1:8899`；开发模式临时放行环境闸门（`getUpdateBlocker` 的 dev 分支改为 `return null`）
+ `tauri.conf.json` 的 `endpoints` 指向本地。**debug 构建对 `http://` 只告警不拦**
（`tauri-plugin-updater` 的 `validate_endpoints` 只在 `#[cfg(not(debug_assertions))]` 下报错），
所以不需要 `dangerousInsecureTransportProtocol`。两处临时改动测完即还原（`endpoints` 回到占位）。

| # | 现象 | 根因 | 处理 |
|---|---|---|---|
| 1 | 「关于」卡片明明写着「发现新版本 v0.3.5」，状态栏那行提示**完全不显示** | 提示用 `--editor-accent` 当文字色，而**16 个主题里 11 个的 `--statusbar-bg` 与 `--editor-accent` 是同一个颜色**（实测 `liquidglass-prism` 两边都是 `#2563eb`）⇒ 同色写同色底，等于隐形 | `StatusBar.tsx` 新增 `chipStyle()`：状态栏芯片的**文字一律用 `--statusbar-text`**（主题保证它与底色有对比），强调改用 `color-mix` 出来的半透明底衬。⚠ 缓存警示同款修法（`--danger` 撞底色的风险同理：`lychee` 的状态栏底色本来就是红的） |
| 2 | 点「立即更新」下载/校验失败后，卡片写「**检查更新**失败」 | 检查失败与下载安装失败共用 `status: 'error'`，卡片分不清阶段 —— 用户会以为是自己网络的问题，跑去重试检查 | 状态机加 `errorPhase: 'check' \| 'install'`：查不到 →「检查更新失败」+「检查更新」；装不上 →「更新失败」+「重试」（更新信息还在，原地重装即可）。i18n 加 2 键 × 15 语言 |
| 3 | 安装形态探测在「双记录」机器上会误判成 `nsis` | 先判 NSIS、后判 MSI，而同一台机器可能**同时**留着旧 NSIS 卸载项与后来 MSI 覆盖装的卸载项，两者 `InstallLocation` 指向同一目录（开发机实测：HKLM 是 MSI 0.3.3、HKCU 是 NSIS 0.3.1 遗留）⇒ 双记录时先判 NSIS 就会让 MSI 用户被装出第二份 | `detect_windows_install_kind()` **改为一律先判 MSI**。反向误判（真 NSIS 被判成 `msi`）只是少提示一次更新、要求手动安装，代价比装出第二份小得多 |

**顺带验到的行为**（请求日志 + 逐屏截图，不靠印象）：

- 启动后 **3 秒**才请求清单（`STARTUP_UPDATE_DELAY_MS` 生效）；打开「关于」**不重复请求**（`status !== 'idle'` 直接跳过）。
- 点状态栏提示 → 打开「偏好设置 → 关于」；点「跳过此版本」→ 状态栏提示消失、卡片显示「已跳过 v0.3.5」，整页重载后仍然如此。
- 「启动时自动检查更新」关掉后重载 → 日志**没有任何清单请求**；重新打开后重载 → 3 秒后恢复请求（对照组）。
- 假签名的 8MB 产物**下载完成后卡在校验阶段** ⇒ 安装器没有被执行（顺带证明「先验签、后安装」这个安全前提）。

**没验到的**：装成功 + 自动重启那一段 —— 要真签名产物并真装一份，按路线 C 留到批次 4 之后。
**副作用已清**：测试期间被记下的「已跳过 v0.3.5」已复位（否则 0.3.5 真发布时不会提示）。

### 既定分工：`changelog.md` 记过程，`docs/changelog/` 记结果（2026-10-18 定）

> 原「发布流水线产出的正文需手工替换」（2026-10-09 记）由本次分工**消解**：
> 采下面第 2 案，`docs/changelog/CHANGELOG-V*.md` 自身改为用户向简短定位。

**两份 changelog 读者不同，不要互相替代：**

| 文件 | 读者 | 内容 |
|---|---|---|
| `changelog.md`（根） | 开发者 / agent | **完整技术记录**：根因、方案取舍、被否的方案与原因、实现细节、测试与门禁数据、踩过的坑 —— 为下一个改动的人服务 |
| `docs/changelog/CHANGELOG-V<ver>.md` | **用户** | **简短用户向**：只讲用户能感知的变化，按 新增功能 / 优化 / 修复 三个维度罗列，弱化技术表述 |

- **风格基准**：GitHub Release 正文 / tag 说明的写法 —— 一句话一条，简短直白；
  不写根因、不写实现、不出现内部文件与函数名。**自查标准：用户看完能否知道
  「这个版本让我多做了什么 / 少受了什么罪」**
- **同一份文件两处复用**（这正是它必须用户向的原因）：
  1. `.github/workflows/release.yml` → GitHub Release 正文（**不再需要手工替换**）
  2. `scripts/make-manifest.mjs --notes` → 写进 `latest.json` 的 `notes`，
     **直接显示在应用内更新弹窗**（v0.3.4 起首次生效）
- **命名沿用现有**：`docs/changelog/CHANGELOG-V<ver>.md`（大写 `CHANGELOG` + `V`）——
  上述两个消费点都按此路径拼字符串，改名要同时改两处（Linux CI 区分大小写，别只改本地）
- **维度取舍**：三个维度按需出现，没有内容的直接不写；若整版都是用户无感的内部重构，
  就写一句「本版以内部改进为主，界面无变化」
- **迁移状态**：
  - `V0.1.7 ~ V0.3.3` 保持现状（**技术版**），**不做回填**。2026-10-18 实测核查推翻了
    「精简它们很安全」这个初始判断：逐版本比对行数后发现**8 个版本的 `docs/changelog/`
    比根 `changelog.md` 的对应小节还长**（0.2.3 差 103 行 / 0.3.0 差 68 行 / 0.3.1 差 60 行 /
    0.2.1 与 0.2.4 各差 23 行 / 0.3.3 差 18 行 / 0.1.10 差 4 行 / 0.1.9 差 1 行）。
    内容是同一版本的两种写法：根里把「踩坑记录」压缩成一句话一条，这些文件里则展开成
    `现象 / 根因 / 解决方案 / 教训` —— **事实根里有，展开的细节只在这些文件里**
  - 而它们的**唯一消费者是按 tag 发布的那个版本**（`release.yml` 读 `CHANGELOG-V${ver}.md`、
    `make-manifest.mjs` 读 `--notes`），历史文件**没有任何自动化读取者**。
    回填只有「目录口径统一」一个收益，却要付出真实的细节损失 —— 不划算，故不做
  - 用户向正文**已在 GitHub Release 上**长期可查（那也是用户实际读到的位置）；
    另注 `v0.1.10` **没有对应的 GitHub Release**（tag 列表从 v0.1.9 跳到 v0.2.1），无从回填
  - **`V0.3.4` 起按新标准写**。它又是第一个带在线更新的版本，
    这份文件会**首次出现在应用内更新弹窗里**，用户向定位必须贯彻

### 在线更新（方案定稿）+ 废弃 MSI 线（2026-10-18）

**① 方案定稿**

- **形态**：Tauri 官方 `tauri-plugin-updater` + 火山 TOS 上的静态 `latest.json`；整包下载
  （Windows NSIS 实测 7.6MB）→ 签名校验 → 一键静默安装 → 自动重启
- **「逐文件增量」被否**：前端 8.5MB 被编进 20.8MB 的 exe，UI/逻辑任何改动都会改变 exe；
  exe 同级的散资源（themes/templates/skills/docs 等）总共只有 ~0.8MB，且本来就在安装包内。
  逐文件增量省不下东西；真正能压下载量的只有二进制差分，而它**会破坏 macOS 的 app 签名** ——
  高风险低收益，不做
- **覆盖范围**：只做 **Windows NSIS 安装版**。便携版与安装版用的是同一个 exe，
  且便携版无法走官方 updater ⇒ 便携版用户在界面侧被识别（注册表卸载项）后**静默不检查**，
  并在「检查更新」处给出「便携版请手动下载新版」的诚实说明
- **更新说明**：复用 `docs/changelog/CHANGELOG-V*.md`，由 `scripts/make-manifest.mjs` 写进 `notes`
- **平台键两个都给**：`windows-x86_64-nsis` 与 `windows-x86_64` 指向同一个安装包。
  updater 按 `{os}-{arch}-{installer}` → `{os}-{arch}` 查找，而 installer 来自**编译期烙进 exe 的
  bundle_type**；便携版与安装版同源，这个值是否可靠不能确定，所以两个键都写、不赌它
- **⚠️ 发布顺序**：已发布版本是 **0.3.3**，0.3.4 尚未发布 ⇒ **0.3.4 就是第一个带 updater 的版本**
  （当前工作版顺势带上即可）；用户手动装过 0.3.4 之后，**0.3.5 起才真正自动更新**。
  在 0.3.4 之前的版本里补 updater 是无效的——它们已经发出去了
- **签名密钥**：`tauri signer generate` 生成；公钥进 `tauri.conf.json`、私钥进 CI secret
  **并离线备份**。私钥丢失 = 已安装用户**永久**无法更新，只能手动重装

**② 废弃 MSI 线**（Windows 用户只需要一种安装包，MSI 一直多余；为在线更新也只留 NSIS 一条路）

- `.github/workflows/release.yml`：`--bundles nsis,msi` → `--bundles nsis`，资产注释 5 个 → 4 个
- README（根 `README.md` + `src-tauri/readme.md` + 14 语言 × 2 份副本，共 30 个文件）的
  「构建产物」列表删掉 MSI 一行
- **待办**：本地 `npm run tauri:build` 仍会产出 MSI —— `bundle.targets: "all"` 无法按平台区分，
  动它会连带 macOS 的 dmg。要一并停掉需新增 `tauri.windows.conf.json` 写
  `{"bundle":{"targets":["nsis"]}}`，并同步上述 30 个文档。本次「谨慎起见」只动了 CI

**③ 批次 1 已落地**（不依赖密钥的部分）

- **`scripts/check-version.mjs`**：package.json / tauri.conf.json / Cargo.toml 三处版本号一致性门禁，
  已接进 `npm run build`。不查的后果非常隐蔽 —— 界面显示的版本读 Cargo.toml，
  而 updater 比较版本读 tauri.conf.json，不一致就会出现「提示有新版，更新完版本号却没变」
- `src/lib/update.ts` + `tests/update.test.ts`：版本比较（含预发布与 v 前缀）、是否提示、
  跳过指定版本、下载进度（总大小未知返回 null，界面画不确定态而不是假装 0%）、大小格式化
- `src/lib/updateManifest.ts` + `tests/updateManifest.test.ts`：`latest.json` 构造与校验
  （版本号去 v、平台键去重、签名/地址非空 —— 宁可构建期报错，也不要发出一份客户端读不懂的清单）
- `scripts/make-manifest.mjs`：读 `.sig` 内容（不是路径）+ 更新说明 → 生成 `latest.json`
  （`npm run make:manifest`；签名缺失、产物缺失、版本号与 tauri.conf.json 不一致都会明确提示）
- 单测 184 → 210

**④ 批次 2 已落地：插件与配置接入**（2026-10-18 实施）

- `src-tauri/Cargo.toml` 加 `tauri-plugin-updater`；`main.rs` 注册
  `tauri_plugin_updater::Builder::new().build()`
- `tauri.conf.json` 的 `plugins.updater`：真实 pubkey + `endpoints`（**暂为占位地址，待 TOS 桶地址**）
  + `windows.installMode: "passive"`；`capabilities/default.json` 加 `updater:default`
- ⚠️ **pubkey 的格式是个坑**：`tauri signer generate` 产出的 `.pub` 文件内容**本身就是 base64**
  （单行 152 字节、无尾换行）。插件侧是「base64 解码 → minisign 公钥文本 → `PublicKey::decode`」，
  所以配置里要填的是**文件内容原样**，绝不能再 base64 一次 —— 双重编码解出来不是 minisign 文本，
  而公钥会被编进 exe，发出去就改不了
- ⚠️ **`pubkey` 在插件配置里是必需字段**（`Config` 的 `pubkey: String` 没有 `#[serde(default)]`）：
  一旦注册该插件而配置里没有 pubkey，应用会**启动失败**。所以「注册插件」与「填 pubkey」必须同批完成
- **不做 `tauri-plugin-process`**（推翻原计划）：`updater.rs::updater_parameters()` 给 NSIS 传的是
  `/P /UPDATE /R /ARGS …`（`restart_after_install` 默认 true），**装完安装器自己会重启应用**，
  前端不需要调 `relaunch()`。少一个依赖、少一条权限
- ⚠️ **`on_before_exit` 不能当「未保存内容」守卫**（推翻原计划）：类型是 `Arc<dyn Fn()>`，
  **不能取消安装**；而且插件的 `updater_builder()` 已用 `cleanup_before_exit()` 占了它，
  `UpdaterBuilder::on_before_exit` 是 **replace** 语义，用了还会顶掉 Tauri 自己的清理。
  守卫必须放在**前端**、且在调用安装之前。另注意 Windows 上安装走 `std::process::exit(0)`，
  没有任何优雅退出
- **`createUpdaterArtifacts` 只在发版时打开**：新增 `src-tauri/tauri.updater.conf.json`，
  CI 用 `--config src-tauri/tauri.updater.conf.json` 合并。若写进 `tauri.conf.json`，构建会强制要求
  签名私钥，连带把本地 `npm run tauri:build` 也卡死（已实测 `--config` 同时支持内联 JSON 与文件）
- **新命令 `get_install_kind`**（取代原计划的布尔 `is_installed_build`）：返回
  `nsis` / `msi` / `portable`。判据是「注册表里有卸载项 **且当前 exe 确实跑在那个安装目录里**」——
  实机核查发现本机同时存在 **HKCU 的 NSIS 0.3.1** 与 **HKLM 的 MSI 0.3.3**，只认 HKCU 一把键会判错
- ⚠️ **MSI 安装版必须单独识别**（原计划只区分「安装版 / 便携版」）：NSIS 安装包按用户级装到
  `%LOCALAPPDATA%`，而 MSI 的 `InstallLocation` 是 `D:\Program Files\…`；若对 MSI 版放行，
  用户会被**装成第二份**而不是被更新
- ✅ **但 NSIS 安装器自己会处理旧 MSI**（读 Tauri 的 `installer.nsi` 模板确认）：安装器枚举
  `HKLM\…\Uninstall`，按 `DisplayName` + `Publisher`（实机值 = `YiziMarkdown` + `yizimarkdown`，正好命中）
  找到 WiX 安装项、且 `UninstallString` 含 `msiexec` 时，**先卸载旧 MSI 再装**（模板 L190–215）。
  所以**不需要**让老用户先手动卸载；界面与发行说明可以照实写「安装时会自动卸载旧版」
- **安装目录**：NSIS 默认按 `currentUser` 装到 `%LOCALAPPDATA%\YiziMarkdown`，但会
  `RestorePreviousInstallLocation` 复用旧的 NSIS 安装目录（模板 L509–528）。只有「此前只装过 MSI」
  的机器会落到 `%LOCALAPPDATA%`，属正常迁移
- **`scripts/check-updater.mjs`**：发版前门禁，校验 pubkey（解 base64 后必须是两行 minisign 公钥、
  第二行 56 字符）、endpoints（非占位、https）、installMode。**故意不并进 `npm run build`**
  —— 本地构建不需要真实 endpoint，天天红着的门禁只会被无视；它由 `release.yml` 的 `test` 作业调用，
  在昂贵的 Rust 构建之前挡住
- **验证**：新增 Rust 测试 `updater_config_is_loadable_and_pubkey_is_minisign` —— 把
  `tauri.conf.json` 的 `plugins.updater` 交给**插件自己的 `Config`** 反序列化（能过即说明运行期不会因
  缺字段而启动失败），再校验 pubkey 解 base64 后的 minisign 结构。Rust 58 passed / JS 210 pass，
  `npm run build` 通过
- **待办**：① `endpoints` 仍是占位地址，需 TOS 桶真实地址；② `requireSignedVersion` **暂不开启**
  —— 它要求签名里带版本号，而我们的签名产物还没实际见过。等首个 `.sig` 出来、确认 tauri-cli 2.11.2
  确实记录了版本号之后再开，否则会变成「永远拒绝更新」，同样不可远程修复

### 持久化两处老问题：写入放大 + 配额静默失败（2026-10-18 实施）

**两个问题是同一个根因**：`editorStore` 的 `partialize` 把**所有**标签页正文拼成一份 JSON，
而 zustand 默认持久化每次 `set` 都把它整串 `JSON.stringify` + 整串写入。于是：

1. **写入放大**：每敲一个字符都要把所有打开文档重新序列化并整串落盘，成本随
   「打开的文档数 × 文档大小」线性增长，而真正变化的只有那一个字符。
2. **配额静默失败**：localStorage 有配额（WebView2 按来源计量）。超限时 `setItem` 抛
   `QuotaExceededError`；`createJSONStorage` 的 `setItem` 里**没有任何 try/catch**，
   zustand 4.5.7 的 `persistImpl` 还会把它**同步抛回调用 `set` 的地方**（CodeMirror 的
   updateListener ⇒ 每个字符抛一次）。抛也好吞也好，**界面毫无提示**：持久化事实上停了，
   用户继续打字，重启后才发现内容没了。

**方案：给 `editorStore` 换一个自定义 `PersistStorage`（新增 `src/lib/editorStorage.ts`）**

- **正文按标签页拆键**：`yizimarkdown-editor` 只放清单（标签页元信息 + 活动页 + 最近文件），
  正文各自放 `yizimarkdown-editor:doc:<tabId>`。
- **只写正文真正变化的那个**：`planEditorStorage` 拿「已知内容键 → 正文」做 `===` 比较。
  未变化的标签页其正文是**同一个字符串引用**（展开对象保留原引用），比较是 O(1) ——
  不能为了判断"变没变"反而把所有正文读一遍比一遍，那等于没修。
- **配额失败按「内容的可替代性」降级**（`level: degraded | lost`）：先放弃磁盘上**已有权威副本**的
  正文（已保存文件的内容、云端文档的本地镜像 —— 镜像在 config 目录，是持久目录，见
  `remote_cache.rs:99`），保住真正不可再生的部分（未保存 / 未命名文档），再重试一次。
  `isRecoverableFromDisk()` 是这条判据的唯一出处。
- **绝不允许「键里没有、清单里也没有」**：正文要么在独立键里、要么内嵌进清单兜底（写入失败时），
  读取时**内嵌优先**（内嵌的一定更新）。**为什么必须这么严**：标签页若「显示为空、却标记已保存」，
  用户顺手一个 Ctrl+S 就把磁盘上的文件截断成 0 字节 —— 修「静默丢数据」绝不能引入「静默毁文件」。
- **旧数据自动迁移**：清单里内嵌的正文在 `getItem` 时就地迁到独立键；写不进去就先留在清单里，
  下次再迁。迁移失败不能反而把正文弄丢。
- **界面必须看得见**：降级/失败经 `onEditorStorageWarning` 报到状态栏（常驻警示标记，悬停给全文）
  并弹一次 toast。**只在「首次降级」与「升级为 lost」各报一次** —— 配额满时每个字符都会写失败，
  每次都报会把界面刷爆，反而让用户学会无视它。另有 `getLastEditorStorageWarning()` 供界面补报
  「订阅之前就已降级」（启动期那次写入就可能失败，那时界面还没挂载，纯事件会丢掉这条）。
- **正文没缓存的标签页**（只会在降级后出现）：`merge` 把它们收进 `pendingContentLoads`（**不持久化**），
  界面从磁盘恢复。恢复期间**不挂编辑器**（编辑器有焦点时外部同步会跳过 dispatch，让空内容先进
  CodeMirror，恢复回来的正文就和视图对不上了）、**禁止保存与自动保存**（内容是占位空串）。
  恢复失败或超时（10s：网络盘/已拔出的移动盘可能长时间不返回）就移除该标签页并说明；
  磁盘上只剩旧版本的（未保存的修改真丢了）改成载入磁盘版本并**明确告知**，不装作什么都没发生。

**被否的方案**（记下免得下次重走）：

- **干脆不缓存「已保存文件」的正文**（稳态占用最小，连配额压力都没有）：会改变所有人的恢复语义 ——
  重启后每个干净标签页都要读一次盘，网络盘/已拔出移动盘会卡住甚至失败；而这些标签页今天靠缓存
  瞬间恢复。降级是少数派路径，不能拿多数派路径去换它。
- **事前估容量**（如 `navigator.storage.estimate()`）：它量的是 Cache/IndexedDB 配额，不是
  localStorage 的，估不准反而会得出错误的"够用"结论。
- **把降级状态持久化**（下次启动直接进降级模式）：没有可靠的解除条件，会永久停在降级。改为进程内
  状态 —— 每次启动重新尝试，最多每会话报一次。

**测试与门禁（第一轮）**：新增 `tests/editorStorage.test.ts`（17 例）。其中配额这条少数派路径用带配额的假存储
**真跑**：断言「可省正文被放弃、未保存正文照旧落盘」「腾不出空间时正文退回内嵌清单并升级为 lost」
「降级只报一次、升级严重程度才再报」。`npm test` 227 通过 / 0 失败；`npm run build` 通过。

**顺带定下（批次 3 用）**：更新前的「未保存内容守卫」**不做**阻断式弹窗。证据：
(1) 正文是**每次按键同步**落 localStorage 的（`Editor.tsx` 的 updateListener → `App.tsx`
→ `updateContent`；那个 150ms debounce 只作用于预览渲染）；(2) 全仓**零** `beforeunload`/`pagehide`
监听，而 Windows 安装走 `std::process::exit(0)` ⇒ 硬退出与正常关窗在数据上**等价**，弹窗保护不了任何东西。
改为：更新卡片里一行说明「编辑会自动恢复」，且**安装前清掉待执行的 `autoSaveTimerRef`**。
**注意联动**：若持久化已降级到 `lost`，重启有可能真的丢未保存内容 —— 那种情况下更新提示要不要更硬，
留给批次 3 决定。

**实测复验（用户手动跑配额路径，2026-10-18，第二轮）**：把 localStorage 用一次性键填满后再打字，
发现**每个字符都在控制台报一条「清单写入失败」**，界面上却没有任何提示。暴露出三个新问题，都已修：

1. **清单写失败只记录、不报警**（第一轮的设计）。而清单比单份正文大 ⇒ 配额快满时会出现
   「正文挤得下、清单挤不下」这种组合：正文键照旧写成功（于是不触发降级），清单却每次按键都失败，
   用户侧完全静默 —— 正是这轮要消灭的那种失败模式。
   ⇒ **正文键与清单键任一写失败都走同一套**：降级 + 放弃可省正文腾空间 + 重试一次 + 报一次警。
   清单写失败同样是配额满的信号，没理由区别对待。
2. **失败日志逐字符刷屏**：`console.error` 每个字符一条（打二十个字符就是二十条堆栈），真正的现场
   被淹掉。⇒ 清单写失败只记**第一次**（恢复后允许再记一次）；报警本身早就是「每级一次」。
   首次降级时另打**一条**诊断：`当前占用 N 个键 / M 字符，已放弃 K 个可省正文键`。
3. **内嵌兜底没有体积上限**：把一大段正文塞进清单，等于把刚修掉的写入放大又请回来（清单每次按键都要
   重写）。⇒ 内嵌只对 `INLINE_CONTENT_LIMIT`（4KB）以内的正文生效，超出的只报警（`lost`）。

**WebView2 实测配额**：二分法测 `localStorage.setItem('filler', 'x'.repeat(lo))` 的最大
`lo ≈ 5,238,000` 字符 —— 即 Chromium 的 10MB 按 **UTF-16 码元 2 字节**计（10MB / 2 ≈ 5,242,880
字符，差额被应用自身数据占掉）。此前只写「约 5–10MB」，现在有准确数字。

**测试与门禁（第二轮）**：`tests/editorStorage.test.ts` 增至 20 例，新增「清单写失败同样按配额耗尽
处理」「清单写失败不再逐字符刷日志（断言 `console.error` / `console.warn` 各只调一次）」
「内嵌兜底有体积上限」。假存储加了 `failFor` 钩子，用来复现「正文挤得下、清单挤不下」。
`npm test` 230 通过 / 0 失败。

### 提词备注：同屏可见改为可控 + 模板改动曾被覆盖（2026-10-18 实施）

**① 演讲者备注的定位问题**（用户反馈：不像 PPT 有副屏演示者视图，我们是**同屏显示**，单屏投影时观众必然看得到）：

- **A. 诚实定位**：改名「**提词备注**」（×15 语言；英文等简化为普通 `Notes`，
  不再用 `Speaker Notes` 这类暗示副屏的词），`help.md` 与模板明确写出「与幻灯片同屏、观众可见」
  及适用场景（第二块屏幕 / 平板放另一份文档、背对观众时自看）
- **B. 单屏可控**：面板默认**收在屏幕左缘之外**（`translateX(-110%)` + 淡出），
  两种展开方式 —— 鼠标移到左缘 24px 热区（`.ys-notes-edge`，**纯 CSS `:hover` + 兄弟选择器**，不占 JS 监听）、
  或按 `S` 锁定常显（`.ys-pinned`）。再按 `S` / 点「关闭」/ 按 `Esc` = 收回
- 讲到不想让观众看的内容时一按就藏；不碰左缘时观众完全看不到
- `Esc` 分支新增「先收起锁定的备注，再退出演示」，与「Esc 先关浮层」的既有约定一致

**② 模板改动曾被覆盖，已恢复**：

- 现象：`src-tauri/templates/Slide-Template-new.md` 的分栏区间改写丢失，退回旧版
- 根因：**有一个应用实例持有该文件的旧内容**，auto-save 周期性回写 ——
  日志里 5 次 `Info File src-tauri\templates\Slide-Template-new.md changed. Rebuilding application...`
  全部对应它，**这同时也是那次「窗口频繁自动重启」的真正原因**（写入触发 tauri dev 重建 → 杀窗口）
- 教训：dev 期间不要在客户端里打开 `src-tauri/` 下的内置资源，否则同时触发「重启循环」与「覆盖编辑」
- 已逐条重做并用真实管线复验：34 页版式、4 个分栏页的栏内容、实体转义残留 0、渲染问题 0

**③ AI 技能文档补齐新语法**：`skills/slides-outline.md`（含 `src-tauri/skills/` 副本）
此前教 AI 的是旧的「`***` 依次分栏」，已改为圈定写法（N 栏 = N+1 条），
并明确「说明性文字一律放栏外」；同时保留最简写法（N−1 条）作为无栏外文案时的等价写法。

### 分栏区间：`***` 同时是栏区边界与栏分隔（2026-10-17 实施）

**动机**：`splitColumns` 只机械地按 `***` 切，说明性文案全被塞进栏里 —— 引言落进第 1 栏顶部、
脚注变成最后一栏末尾的一行孤字（模板第 21~24 页实测）。而「带引言的分栏页」恰恰是分栏最常见的形态。

**新语法**（纯 Markdown，不引入任何新记号 —— 注释指令与 `:::` 围栏都会增加使用成本）：

```
引言（栏外）
***
左栏
***
右栏
***
落款（栏外）
```

`***` 同时承担**栏区边界**与**栏分隔**两种身份，类比表格的 `|`：既是左右外框，也是内线，靠位置决定。
⇒ **N 栏写 N+1 条**，首尾两条圈住栏区，栏区之外是页级文案。

- **退化规则**（不是兼容垫片，是语义逼出来的）：条数 ≤2 时圈定读法退化成
  「空栏区」（1 条：首尾是同一条）或「单栏」（2 条：中间没有分隔），作者不可能是那个意思
  ⇒ 这两档按**分隔**读（旧语义：条数 + 1 = 栏数），**存量文档完全不受影响**
- **代价（静默，无法检测）**：写满 4 栏（3 条）会被读成「2 栏 + 栏外文案」。
  这是 1 条规则下唯一真正需要取舍的一档，两种读法都产生有意义结果，语法上无法区分意图
- **`ColumnSplit` 扩展**：`{ intro, parts }` → `{ intro, before, parts, after }`；
  `getSlideHtml` 渲染顺序 = 页标题 + 栏前 + `.ys-cols` + 栏后
- **栏外文案包一层 `.ys-col-aside`**：它是页级内容、落在 `.ys-cols` 之外，
  因此「栏内对齐 / 卡片 / 分隔线」天然碰不到它 —— 跟随版式与页标题，不跟随栏内对齐
  （避免出现「页标题左对齐、引言居中」的新割裂）。刻意不加任何视觉样式，长相由作者的 Markdown 决定
- **围栏感知**：围栏内的 `***` 不参与计数，否则代码块里一条星号就会破坏圈定
- **插入口改造**：工具栏与斜杠菜单的「分栏线」改名「**分栏区间**」（×15 语言），
  插入的不再是 `\n***\n` 而是**三条 `***`**，并把光标落在第一个空档（左栏）——
  填完左栏，下面那个空档自然就是右栏。为此给 `insertMarkdown` 加了 `block` 模式
  （原样插入，光标落在片段里第一个空行），斜杠菜单走同一对常量
  `COLUMN_REGION_SNIPPET` / `COLUMN_REGION_CURSOR`
- **单测 +7 例**（圈定 / 退化 / 围栏不计数 / 空栏 / 插入片段自洽），共 184 例全绿
- 模板 4 个分栏页已改用圈定写法，实测栏内**只剩栏内容**，引言与落款都在栏外

### 演讲者备注：本页无备注时按 S 给出提示（2026-10-17 实施）

**问题**（用户反馈「软件里已经没有演讲者备注了吧」——功能其实一直在，是**可发现性**问题）：

HUD 的「备注」按钮是 `cur?.notes &&` 才渲染的 ⇒ 只有当前页写了备注才出现。
播放一个普通文档时既没有按钮、按 `S` 又毫无反应，据此判断「没有这个功能」非常自然。

- **改法**：按 `S` 而本页无备注时，左下角短暂提示「本页无备注」（2.2s 自动消失，带 180ms 淡入上浮）
- 提示的视觉语言与备注面板一致（同一套 surface / border / radius / shadow），
  但抬到 `bottom: 56px`，不盖住左下角的章节名与页码；`pointer-events: none` 不拦翻页
- 有备注时行为完全不变（开/关面板）；定时器在卸载时清理
- i18n 新增 `slideshow.notesEmpty` × 15 语言，`check-i18n --strict` 全绿

### 指令提取不再误触 + 图片高度自动封顶（2026-10-17 实施）

**修：在文档里「提到」指令会被真的执行**（写模板时踩到，实测四种上下文全中）：

- 旧实现 `extractDirectives` / `extractNotes` 直接在**原始文本**上跑正则，分不清正文与代码块
  ⇒ 只要页面上出现 `<!-- layout: xxx -->` 的字样，它就会被**真的执行 + 从正文剥掉**。
  实测：正文里提到 ⚠️、代码围栏里 ⚠️、行内代码里 ⚠️、表格单元格里 ⚠️ —— 全部误触。
  任何想写「怎么用指令」的用户都会被自己讲的内容坑到，而且是**静默**的（内容变少、版式变错，无报错）
- **修法与 `---` 分页 / `***` 分栏对齐**（它们早就做了 fence 感知）：新增 `fenceMask` 逐行标记围栏内行；
  指令必须**独占一行**（`DIRECTIVE_LINE` 要求 trim 后整行就是这条注释），备注块的起始行同理
- 一条规则同时挡掉正文、表格、行内代码三种误触（它们的行都以别的字符开头）；
  多行 `<!-- notes\n...\n-->` 形态照常支持；备注文本里出现 `-->` 也不会再被提前截断
- 副作用是**行为变更**：指令写在文字末尾（`文字 <!-- layout: quote -->`）不再生效。
  仓库内 help / 模板 / 技能文档本来就全是「独占一行」的写法，实测无一受影响
- 单测 +7 例（误触防护 5 例 + 备注 2 例），共 177 例全绿

**修：图片把同页文字顶出画面**（模板第 13 页实测发现）：

- 图片是 `width:auto + max-width:100%`，浏览器按**宽度**等比缩放 ⇒ 原图接近方形或偏高时，
  缩到内容区宽度就会吃满整屏，把同页标题/正文顶出可视区（`.ys-slide` 是 `overflow:auto`，
  内容还在，只是没滚动就看不见 ⇒ 观感就是"被挤出去了"）
- 新增高度封顶 = **内容区高度的 78%**（`calc(var(--ys-fill-h, 0.84) * 78vh)`），留 22% 给同页其它内容
- **并入两处写死的旧值**：`.ys-layout-image img` 的 `76vh` 与 `.ys-layout-figure > :first-child img` 的 `64vh`
  —— 它们是「内容填充高度」旋钮加入**之前**写的，不跟旋钮走，而且图片页后面跟文字时照样会挤出画面。
  现在高度上限只有 `.ys-slide p > img:only-child` 一个来源，跟着旋钮一起变
- **修上一轮的死规则**：`.ys-slide > img` 一次都没命中 —— markdown-it 会把单独成行的图片包进 `<p>`
  （实测 DOM 是 `<p><img></p>`），img 从来不是 `.ys-slide` 的直接子元素。
  正确选择器是 `p > img:only-child`（`:only-child` 保证段落里夹文字的行内图片不受影响）；
  顺带把栏内**右对齐**时的图片位置也接上了，避免「文字贴右、图片悬在中间」
- 模板里为绕开指令误触而写的 `&lt;!-- ... --&gt;` 实体转义**全部改回自然写法**，
  并在「四种显式指令」页把「指令必须独占一行」写成了明文规则

### 图片排版重做 + figure 退出自动推断 + 演示模板重写（2026-10-17 实施）

**三个相关问题一起收**：图文并排是被引擎「猜」出来的、图片默认被拉满整行、以及 figure 版式的叠印 bug。

- **图片默认居中**（`.ys-slide > img` 新增）：
  根因是 `.ys-slide > *` 把所有直接子块钉成 `width:100%`，图片跟着被拉满整行 ⇒ 只能左贴。
  现在单独成块的图片收缩回原生尺寸，靠 `.ys-slide` 的 `align-items:center` 落到中线。
  「单独一张图」「标题 + 一张图」「图片 + 说明文字」三种写法都居中。
- **`figure`（图文页 / 左图右文）移出自动推断**（`LAYOUT_RULES` 删一条）：
  并排是「想要才要」的版式，不该由引擎猜 —— 想并排用 `***` 分栏（还能指定几栏、栏内对齐与卡片）。
  **`figure` 仍作为 `<!-- layout: figure -->` 的合法取值保留**（`LAYOUT_KINDS` / CSS 一处未删），
  所以 i18n 的 `helpLayouts` 与存量文档都不受影响；自动路径由 14 种变 **13 种**。
- **修：图文页右侧多段文字叠印**（v0.3.4 模板第 13 页实测发现）：
  `.ys-layout-figure > *:not(:first-child)` 原本写的是 `grid-column:2; grid-row:1`，
  于是右栏第 2 个及以后的块与第 1 个**占同一栅格格子**、完全叠在一起。
  改为只钉列不钉行 —— 自动布局会把它们依次放进第 2 列的第 1/2/3… 行。
  同时 `gap` 改成两值 `0.7em 2.5vw`：行距按段落节奏，列距仍是图文栏距
  （否则多段之间会被拉开 2.5vw 那么宽）。
  全文件只有 figure 这一处显式写 `grid-row`，**其它版式不受影响**。
- **`Slide-Template.md` 重写为 34 页的「演示模式完全指南」并改名 `Slide-Template-new.md`**：
  - 既是使用说明也是示范：每页末尾标出「这一页为什么会是这个版式」，结构就是版式
  - 覆盖 13 种自动版式的真实示例页 + 两张对照表、分栏四页、四种指令、备注、片段、front matter、HUD 与排版面板、12 种动画、常见误区
  - 改名原因：内置模板同步是 `copy_missing`（不覆盖已有文件），老用户升级拿不到新内容 —— 换个文件名才能让存量用户也看到。旧文件保留，可自行删除
  - 用真实管线逐页校验过：`splitSlides → extractNotes → extractDirectives → splitColumns → detectLayout` + 模拟 `getSlideHtml`，34 页版式、对照表里的页码引用、分栏容器、图片路径全部核对一致
  - 修掉旧模板的一个 bug：结尾页写的是 `# 谢谢观看`，而结尾页判定是**整串相等** ⇒ 它一直回落成封面页，从来不是结尾页。新模板用精确的 `# 谢谢`
- **`help.md` 修正两处与实现不符的描述**：
  - 片段逐步显示：原文写「单页开启 / 关闭：`<!-- fragments: on -->` 或 `off`」。
    实际页级 `on` 只是「该页允许分段」，而默认就是允许 ⇒ 单独写它**不会生效**，
    真正的开关在 deck 级（front matter 或 HUD）。页级能做的只有「关」。
  - 自动版式表：移除图文页行、14 种改 13 种，补「图片默认居中」与「想并排用 `***` 分栏」
- **已知问题（待定）**：指令提取（`extractDirectives` / `extractNotes`）不区分正文、代码块、行内代码与表格 ——
  文档里只要**提到** `<!-- layout: xxx -->` 的字样，它就会被真的执行并从正文剥掉。
  `splitSlides` / `splitColumns` 都已是 fence 感知，唯独指令提取没对齐这个约定。模板侧先用 HTML 实体转义绕开。

### 演示分栏：栏内对齐 + 分栏样式（分隔线/卡片）（2026-10-17 实施）

**修的问题**：分栏是等宽栅格 ⇒ 第 2 栏的左边线**恒等于屏幕中心 + gap/2**，与「内容填充宽度」无关
（代数上 W 被完全消掉）。栏内容少、又左对齐贴着这条不动的线时，用户拖滑杆只看到左栏在飘，
会觉得「右边没反应」—— 右栏其实也在变宽，只是感知不到。

- **HUD「演示排版」新增两个旋钮**（持久化，`settingsStore` v11 迁移补默认值）：
  - **栏内对齐** `left` / `center` / `right`（默认 left）：栏**内**的标题、正文、列表、引用、图片、代码块一并对齐
    —— **页标题不参与**：它是页面层级，继续跟所属版式走（内容页左对齐、封面/章节页居中）
  - **分栏样式** `card`（**默认**）/ `line` / `none`：`card` = 每栏一张**等高**主题卡片；`line` = 栏间中缝细线
- **对齐治「栏内怎么排」，卡片治「栏在哪里」**：卡片外框随填充宽度两侧同时伸缩，
  把看不见的栏宽变化变成看得见的框 —— 这是感知问题的主药方
- **新增 `src/lib/slideColumns.ts`**（纯函数、零依赖，可 `node --test`）：
  `resolveColAlign` 负责「**页级 `<!-- align -->` 覆盖 HUD 全局默认**」的合成，
  CSS 只认 `.ys-slide.ys-col-align-*` 一个来源，不必跟既有的 `.ys-align-*` 争夺优先级；
  单测 `tests/slideColumns.test.ts`（+7 例，共 170 例全绿）
- **CSS 两段新增**（`slideshow.css`，均只作用于 `.ys-has-cols` 页的**栏内**，页标题 / 非分栏页零影响）：
  - 栏内的标题/列表/引用在基础排版里被写死为 `text-align:left`（`.ys-slide h1` / `ul` / `blockquote`）
    ⇒ 用 `:is()` 抬特异性一并翻过来，否则选了「居中」只会看到正文段落居中
  - 中/右对齐给栏的直接子块加 `width:fit-content` + `margin:auto`：
    只写 `text-align` 对图片/代码块/表格这些**块盒**无效（`.ys-cols > .ys-col > *` 已把 width 钉成 100%）；
    对文本则无损 —— 需要折行的段落 max-content > 栏宽仍取栏宽，折行位置不变
  - 右对齐时列表内边距与项目符号一起翻到右侧（比页级 `.ys-align-right` 更彻底：
    它只改 `ul` 的 padding，`li` 仍留 1.5em 左内边距，右对齐后左边空一截）
  - **页标题（`intro`）刻意不参与栏对齐** —— 它是页面层级（`.ys-slide` 的直接子元素、在 `.ys-cols` 之外），
    继续跟所属版式走；让页标题跟着栏内走会打散「一屏一个标题」的层级
  - 卡片复用主题既有令牌（`--editor-surface` / `--editor-border` / `--editor-accent` / `--radius-lg` / `--shadow-1`）
    + `color-mix` ⇒ 明暗与主题自动跟随；内边距用 `em`，随「字号」旋钮一起缩放；
    卡片开启时 `.ys-cols` 由 `align-items:start` 转 `stretch`（等高，对比才有参照）
  - 分隔线画在栏间 gap 正中（`left:-1.2vw`），不改栏宽与间距；`position:relative` **只在该样式下加** ——
    它会改变栏内绝对定位后代的包含块，默认样式必须一个属性都不动
- **默认值的取舍**（刻意不对称）：
  - 对齐默认 `left`：无对应规则 ⇒ 逐像素零变化
  - 样式默认 **`card`**：会产出 `ys-col-style-card` —— **有意的默认观感升级**（卡片是这组旋钮的价值所在，
    默认藏起来等于没做）。存量用户升级后分栏页会直接看到卡片，v11 迁移即按此补默认值；显式选「无」才退回旧观感
- i18n：新增 8 键 × 15 语言（`slideshow.colAlign*` / `colStyle*`），`check-i18n --strict` 全绿
- 文档同步：`help.md`（+`src-tauri/help.md` 副本）、`welcome.md`、`docs/slideshow-style-mapping.md`

### 「*** 分栏」插入入口（2026-10-17 实施）

- 补上 v0.3.3 加 `***` 分栏时遗漏的插入入口（当时只能插 `---`）：
  - **斜杠菜单**：新增「分栏线」项（`slashmenu.columnBreak` + 关键词，文案 ×15 语言），与「分割线」并列；图标 Columns2
  - **工具栏**：「分割线」旁新增「分栏线」按钮（`toolbar.columnBreak`），同样插入 `\n***\n`
- 两处入口均插入单独成行的 `***`；`---` = 分页、`***` = 分栏的语义分工不变
- 工具栏两按钮 hover 文案为双行（原生 `title` 支持 `\n` 换行，×15 语言）：
  分割线 =「演示模式下控制分页」，分栏线 =「演示模式下分栏，预览模式下等同于分割线」

### 格式工具栏收折策略重构 + 动画（2026-10-17 实施）

- **修的 bug**：旧实现里 resize 直接覆盖收折状态 ⇒ 用户主动收折后，窗口放大/最大化/全屏会被「自动展开」顶开
- **阈值 900 → 1320**：playwright 实测全量展开需 ≈1310px（brand 109 + 文件按钮区 + 格式条 533 + 右组 +
  窗口控件 144 + 间距/内边距），低于必然拥挤 —— 口径是「放得下才展开」，收折发生在拥挤之前
- **修的历史遗留 · 压缩不均匀**（playwright @1000px 实测定位）：
  - 5 个下拉宿主 div（模板/导出/代码/表格/公式）`min-width:auto` 兜底在 28px，
    裸按钮却能压到 16px ⇒ 收窄时只有部分 icon 收窄、「最右边几个 icon 间距不参与」。
    修法：宿主加 `flex min-w-0`，下限与裸按钮一致（全部 16px）
  - `.fmt-strip` 刻意不加 `flex-shrink:0`：压缩带（窄窗手动展开）里格式条整体参与 flex 压缩，
    1fr 轨道跟随被压窄的容器、内部按钮等比收窄，而非右侧被硬裁切。
    修后 @1000px 实测：所有按钮统一 19px，完全均匀
- **品牌名参与收窄**：压缩带（格式条展开 && 物理窄窗）时 YiziMarkdown ⇄ **YiziMD** ——
  两段文本同叠一个网格单元，长名走 0fr↔1fr 轨道收放（首四字母 Yizi 重叠，「Markdown 缩为 MD」），
  短名交叉淡入；空间不紧张的场合（收折态、宽窗）恒显全名
- **两态策略**（`isFormatCollapsed = widthCollapsed || formatManuallyCollapsed`）：
  - `widthCollapsed`：宽度自动策略，只随窗口 resize 变化
  - `formatManuallyCollapsed`：用户主动收折，**持久化**（settingsStore v10），无视宽窄保持收起，直到用户主动展开
  - 主动展开 = 两者同清，当下展开；宽度策略自**下次 resize** 重新接管（避免窄窗下展开被立刻压回）
- **动画**（简洁低调优雅，细节见 `globals.css` 格式工具栏节）：
  - 宽度揭幕：`grid-template-columns` 0fr↔1fr 过渡，收/开同为 260ms（收折 = 展开的逆向，同一节奏）
  - 内容行：展开时迟 70ms 渐显（宽度先行给空间）；收起时迟 30ms 淡出、宽度后合拢（镜像）；`visibility`
    延迟隐藏防隐形可聚焦按钮
  - 级联：展开按 `--i` 自左向右依次浮现（+5px 微移，像从收折按钮里「流」出来）；收折按 `--ri`
    自右向左依次退回 —— 同一动画逆向播放；应用启动不播
  - 收折按钮雪佛龙：双图标叠放交叉淡换 + 90° 微旋，方向切换不硬切
  - 静止态一律 `transform: none`（动画结束即回归）—— 保住内容区 `position:fixed` 下拉菜单的定位
  - `prefers-reduced-motion: reduce` 全部关停

### 菜单回归修复 + 公式菜单 hover 化 + 上标按钮（2026-10-17 实施）

- **修回归 · 代码块/公式/表格菜单「打不开」**（hover/点击均无反应）：
  级联动画 `animation-fill-mode: both` 结束后，Chrome 把 transform 计算值保留为**单位矩阵**
  （`matrix(1,0,0,1,0,0)`，而非 `none`）⇒ 为内部 `position:fixed` 菜单制造包含块，
  菜单坐标从「视口」变成「相对宿主」（playwright 实测弹到 1076，应为 538）⇒ 视觉上等于没反应。
  修法：fill-mode 改 **`backwards`** —— 结束后回归自然样式（transform 真正归 none），
  延迟期间的 from 态照常保留，动画观感不变
- **菜单定位弃 ref、改 `e.currentTarget`**：收折/展开重挂载（`key={animSeq}`）后 ref 可能失联
  （实测公式菜单落到 (0,0) 初始位）；currentTarget 永远是事件路径上的活节点，三个菜单宿主统一
- **公式菜单 hover 化**：与代码块/表格同一模式 —— 悬停打开、移入菜单保活、100ms 宽限延迟关闭；
  删除点击模式专用的 `fixed inset-0` 全屏遮罩（hover 模式不需要，且它会挡住相邻按钮的 hover）
- **新增 · 上标按钮**：删除线右侧（lucide `Superscript` 图标，tooltip ×15 语言 `toolbar.superscript`）。
  `insertMarkdown` 新增 **`tag` 模式** —— 按 `><` 边界拆标签对：无选中插入 `<sup></sup>`、
  光标落在标签中间；有选中包裹选中内容并保持选中（playwright 实测两路径均通过）

### 脚注（学术引用）支持（2026-10-17 实施）

- **术语**：即「论文上标引用 + 文末参考文献 + 点击互跳」，Markdown 生态标准名**脚注（Footnote）**；
  「交叉引用」是 Word 的更大概念（含图表/章节号引用），此处采用标准脚注语法 `[^n]`
- **渲染**：`markdown-it-footnote` 挂入 `markdownRenderer.ts` 基础链（taskLists 之后）——
  预览/演示/导出 HTML 全场景生效。`[^n]` 渲染为上标链接（点击跳文末定义），定义进
  `section.footnotes` 带 ↩ 返回链；重复引用同号；无定义的悬空引用保持字面不渲染区块
- **插入流**（论文写作式）：`EditorRef.insertFootnote()` —— 正文光标/选区末尾插 `[^n]`（选中文本保留），
  文末确保 `[^n]: ` 定义行，**光标直达定义行尾**直接写文献条目；编号取现有 `[^n]` 最大值 +1；
  光标在文档尾随空白区时引用贴正文末、定义吸掉尾随空白紧跟正文（避免 CM 重叠变更）
- **入口 ×2**：工具栏「脚注」按钮（上标右侧，TextQuote 图标 —— 初版用 BookMarked，
  书签语义+笔画偏密与周围线型图标不搭，换 TextQuote「引号+文本行」直接读作「引用」）+ 斜杠菜单「脚注」
  （关键词：引用/参考文献，×15 语言 `toolbar.footnote` + `slashmenu.footnote(+Keywords)`）
- **测试**：新增 `tests/footnote.test.ts` ×8（锚点互指、按出现顺序编号、同号复用、
  悬空引用不动、front matter 隔离）
- **演示模式语义**：脚注定义跟随所在幻灯片页渲染；引用与定义分在不同页时，跳转仅页内有效
- 顺手修：`markdownRenderer.ts` 的 `./headingId` 导入补 `.ts` 扩展名（node 测试解析器要求）

### 脚注悬浮预览 + live 模式渲染（2026-10-17 实施）

- **live 模式脚注渲染**：lezer-markdown 的 GFM 扩展集不含 footnote ⇒ `[^n]` 不产生树节点、
  装饰迭代看不见它。修法：树迭代之外**按行正则扫描**（与任务列表同款手法）——
  行内 `[^n]` 隐藏 `[^`/`]` 记号、编号加 `cm-md-footnote-ref` 上标样式；定义行 `[^n]: `
  隐藏记号 + `cm-md-footnote-def` 弱化样式。遵守 caret-reveal 模型：光标所在行还原原始语法
  （playwright 实测：光标移到引用行 → 引用变回 `[^1]` 可编辑、定义行同时渲染）
- **预览悬浮预览（维基百科式）**：hover 上标 → 浮窗显示文末定义（免跳转），点击仍走锚点跳转。
  实现于 PreviewPane：委托 mouseover/mouseout，取材直接克隆文末定义 `<li>`
  （去返回链、去 id）注入；fixed 定位 + 近视口底边自动上翻 + 右缘钳制；
  宽限 120ms（移入浮窗保活），滚动（window capture）/内容重渲染即刻收起
- **修悬浮窗不关闭**：mouseout 挂宽限定时器后，任何 mouseover（含非脚注目标）都会清掉它
  ⇒ 浮窗永不收。修法：只有进入脚注锚点才取消定时器（playwright 实测开/关均正常）
- 动画只用 opacity —— place-above 的 `translateY(-100%)` 定位不能被 keyframes 的 transform 覆盖

### 脚注样式全面对齐（2026-10-17 实施）

用户反馈三连：live 上标没渲染/该有下划线/脚注没序号，预览脚注区块与正文同大。定位与修法：

- **live 上标 widget 化**：行内 `[^n]` 不再用 mark 装饰拼装，改为 `Decoration.replace` + widget
  直接渲染与预览同款的 **`[1]`**（带方括号、上标、链接色、无下划线）
- **编号规则对齐**：markdown-it-footnote 按「引用**首次出现顺序**」重编号（字面标签 [^abc] 也渲染为 [1]）。
  live 增加同款全文映射（逐行扫 + 代码围栏感知 + 定义行自身标记不计数）⇒ 两模式永远同号
- **live 定义行**：`[^n]: ` 记号替换为序号 widget「n.」（蓝色、行首槽位），字号 0.92em、opacity 0.9
- **预览**：上标链接 hover 不再加下划线（上标本身已是「上移+缩小+加粗」高亮，下划线误读为强调）；
  文末区块 `section.footnotes` 0.85em / line-height 1.55（原与正文同 20px/40px），
  列表内边距收紧 1.6em、条目间距 0.3em，返回链同样去下划线
- 视觉交叉验证（vision 模型，含高倍裁剪复核）：两模式引用均为蓝色上标 [1]、定义均为「序号+文本」，
  预览区块显著小于正文且行距紧凑
- 排查教训：live 装饰「未生效」的两次误报 —— 一次是忘了按 F3 切进 live（split 下本无 live 装饰），
  一次是 caret-reveal 光标所在行本就显示原始语法；验装饰前先确认模式与光标位置

### live 模式行内 HTML + 脚注区视觉收尾 + 光标定位修复（2026-10-17 实施）

- **行内 HTML 配对标签渲染**：live 此前不渲染 `<sup>2</sup>` 等行内 HTML（lezer 有 HTMLTag 节点但无处理）。
  按行正则配对（白名单：sup/sub/u/mark/kbd/small/del/ins/b/strong/i/em/s/strike）——
  光标不在行上时隐藏开/闭记号、内容按语义加装饰类（`.cm-md-html-*`）；白名单外标签保持原文。
  行内代码区间跳过（与预览的 html 行为一致）
- **脚注区分隔线**：全文预扫定位**第一个定义行**，其上加顶部边框线（对齐预览 footnotes-sep）
- **定义行字号/行距对齐预览**：0.85em / line-height 1.55（原 0.92em/默认行高）
- **修光标定位漂移**（用户报「点第一行/第二行定位有问题」，确认与分割线有关，两个成因）：
  1. 分割线用 `margin-top` ⇒ 行盒之外的间隙不属于任何行，点进间隙时 CM posAtCoords 只能就近吸附；
     改用 **`padding-top`**（属于行盒，点击必命中本行）
  2. 定义行小字号只在「光标不在该行」时套用 ⇒ 光标进出定义区行高 44↔26px 跳变、下方内容位移；
     改为行类/分隔线**恒定套用**（caret-reveal 只管显示原始语法，字号不再随光标变化）⇒ 高度稳定
- 视觉交叉验证（3 模型 + DOM 快照）：`<sup>2</sup>` 渲染为上标 2、`[^1]` 渲染为上标 [1]、
  定义行「1. + 分割线 + 小字号」恒定保留；点击三行均精准落位（0/1/2）

### 脚注规格三模式统一（2026-10-17 实施）

- **脚注区规格基准 = live 定义行**（0.85em / line-height 1.55），预览与演示对齐到同一组数字
- **修预览行距仍偏大的根因**：`.footnote-item p` 的 line-height 被 prose 段落规则显式顶成 2.0×
  （显式规则击败继承），条目行盒 34px。修法：p 上**显式** line-height 1.55 + li 外距清零 ⇒
  条目 26px，与 live（26.35px 行盒）一致
- **演示模式**（slideshow.css）：`.ys-slide` 脚注区同款规格（0.85em/1.55、li 清零、分割线收紧、
  返回链去下划线）—— p 行高同样需要显式声明（`.ys-slide p` 规则同样会击败继承）
- **插入流补齐**：`insertFootnoteAtView` 的文末间隔改为条件式 —— 文末已是定义行 → 单换行
  （脚注区成块、条目间不空行）；否则空一行与正文分隔
- 实测三模式：live 17px/26.35px、预览 17px/26.35px（条目 26px）、演示 22.8px/35.4px（0.85em 比例同）

### 修脚注行距「客户端高、浏览器正常」——脚注规则特异性压不过主题（2026-10-17 实施）

- **现象**：同样的文档，浏览器（localhost:1420）预览紧凑，Tauri 客户端里**有内容**的脚注条目
  （含 `<p>`）行距很大，**空条目**（无 `<p>`）正常
- **根因链**（三层叠加，此前每次只修一层）：
  1. `markdown-it-footnote` 把每个条目包进 `<p>`；空定义**没有 `<p>`** —— 这就是「有内容的高、空的正常」的分界
  2. 主题 CSS（head 末尾注入）用 `.editor-content.theme-x p` (0,2,1) 给**每段**加
     `paragraph-spacing` —— 与旧脚注规则 `.editor-content .footnote-item p` (0,2,1) **同特异性**，
     后到者胜 ⇒ 脚注 p 被顶出大行距
  3. 浏览器无 Tauri invoke ⇒ 主题 CSS **根本不加载** ⇒ 只有 globals.css ⇒ 旧规则生效
     —— 所以「浏览器紧凑、客户端高」，并非 HMR/缓存问题
- **修法**：脚注规则全部再加一层类抬到 **(0,3,1)**（`.footnotes-list .footnote-item p` 等），
  稳压主题；上标引用 `.footnote-ref a` 同步抬到 `p .footnote-ref a` (0,2,2)
- **验证**：在浏览器手动注入 `.editor-content.theme-x p`（margin 1.8em / line-height 1.9）
  模拟 Tauri 主题环境 —— 脚注条目稳定 26px；`tsc` + 162 测试全过
- 教训：`!important`/同特异性后到者胜 —— 主题注入永远在 head 末尾，**基础排版规则必须比主题多一层类**

### 修格式工具栏收折无动画——过渡被 `.theme-transition *` 覆盖（2026-10-17 实施）

- **现象**：展开有「向右渐显」动画，收折却是「瞬间没了」，没有镜像的向左渐隐
- **根因**（两层，playwright 逐帧采样定位）：
  1. **过渡被覆盖**：`.theme-transition *`（0,1,0，源顺序靠后）给所有后代统一设
     `transition: background-color...`，覆盖了 `.fmt-strip`(0,1,0) 的
     `grid-template-columns` 过渡 ⇒ 收折宽度瞬间跳到 0，`overflow:hidden` 把正在渐隐的按钮裁没。
     而 `.fmt-strip.open`(0,2,0) 特异性更高没被覆盖，所以「展开有过渡、收折没有」的精确不对称
  2. **内容行出生即隐形**：收折会 `key={animSeq}` 重挂载内容行，新元素直接吃基础态 `opacity:0`，
     级联渐隐全被父级透明度埋掉
- **修法**：
  - 基础态规则提特异性到 **`.toolbar .fmt-strip`(0,2,0)**，压过 `.theme-transition *`
  - 收折用基础态 transition 加 **300ms 延迟**（展开仍用 `.open` 的 260ms 无延迟）——
    收折时宽度在级联期间保持全宽，按钮才能被看见向左渐隐，播完再收宽
  - 内容行收起态显式 `opacity:1` 起步 + 子项 `fmt-btn-out` 用 `forwards`（停在 opacity:0 不弹回），
    340ms 后整体隐藏恢复不可聚焦
- **验证**（playwright 逐帧采样）：收折时宽度 0→330ms 稳在全宽、330→590ms 平滑收窄；
  150ms 时子项跑 `fmt-btn-out` 反向级联（延迟 0.22/0.21/0.2s）、透明度 0.8 渐隐 —— 向左渐隐完整可见
- 教训：给「基础态/默认态」加过渡时，务必确认没有更靠后的通配符规则（`.x *`）覆盖它 ——
  同特异性下源顺序靠后者胜

### 修 live 模式插入图片不渲染（2026-10-17 实施）

- **主因 · 插入不带换行**：图片确认后走 insertMarkdown 默认模式原样插在光标处 →
  图片落在文本行内，而 live 的块级图片 widget 只认「整行纯图片」（IMAGE_RE）⇒ 原文显示；
  且光标停在图片行尾，caret-reveal 把独立成行的图片也显示为源码 ⇒ 双重「没渲染」
- **修法**：图片插入改为 `\n![alt](src)\n` 包裹（与 mermaid/表格的插入惯例一致）——
  图片独立成行 + 光标落到下一行 ⇒ **插入后立即渲染**，无需点击别处
- **次因 · 本地路径未解析**：live 的 ImageWidget 直接 `img.src = 原文`，本地路径（`E:\..`、相对路径）
  被 WebView 当相对 URL 解析必然 404（预览有 resolveLocalImageSrc + read_image_base64 转 dataURL，
  live 缺失）。修法：widget toDOM 补同款解析（baseDir 取当前文档目录；云端文档走本地镜像同款）；
  网络/data/blob 地址直接用原 src；解析失败回落 onerror 占位
- **二次修复 · onerror 竞态**（首版补解析后仍不生效的真实原因）：首版实现先 `img.src = 原始本地路径`
  再异步解析 —— 无效路径让 WebView 立即 404 触发 `onerror`，占位逻辑 `textContent=…` 把 `<img>`
  从 DOM 里销毁，随后异步 dataURL 赋 src 已无对象。mock 瞬间返回能抢赢、真实 Tauri IPC
  几十毫秒必输（headless 测试因此假通过）。修法：**本地路径解析成功后才第一次赋 src**，
  解析失败才走占位；网络/data/blob 仍直接赋。慢速 mock（200ms 延迟）实测：解析期间无占位、完成后 dataURL 渲染 ✓
- 导入链补 `.ts` 扩展名（editorStore→remotePath、localImages→tauri）保持 node --test 可加载
- 已知限制：正文行内手写的 `![x](y)`（非独立成行）live 仍显示原文 —— 块级 widget 不覆盖行内
  场景（cm-live-blocks 既有注释：inline replace 在混合 decoration 场景不可靠），为与预览的
  已知差异，后续需要时做行内图片 widget

### 右键菜单体系（2026-10-16 实施）

- 全应用屏蔽 webview 原生右键；**编辑器内容与所有输入框豁免**（复制/粘贴依赖原生菜单，WebView2 无法用 JS 可靠复刻粘贴）
- 各功能区自定义菜单：
  - 侧栏「文件」：空白处 = 新建文件（自动补 `.md`）/ 新建文件夹 / 刷新（**只刷新目录树、保持展开态**，替代原「整界面刷新」）；
    行上 = 打开 / 重命名 / 在资源管理器中显示 / 删除（**移入回收站**；正在编辑的文件拒绝改名/删除，防 tab 路径失效）
  - 侧栏「云端」：空白处 = 新建文件（If-None-Match，已存在报冲突不覆盖）/ 新建文件夹 / 刷新；行菜单迁移共享组件
  - 文件 tab：关闭 / 关闭其他 / 关闭右侧 / 关闭全部（未保存的逐个弹确认）；tab 栏空白 = 新建文件
  - 顶栏：最小化 / 最大化|还原（**macOS 无此项**）/ 全屏切换 / 关闭
- 新增 Rust 命令：`create_directory` / `rename_path` / `delete_to_trash`（trash crate，走系统回收站）/
  `reveal_in_explorer`（Windows 资源管理器定位选中 / macOS Finder 显示）
- 共享组件 `ContextMenu`（zustand store + 全局 Host 渲染一次）；外点关闭走 **capture 阶段**
  （内容区既有 `onMouseDown` stopPropagation 不再拦住关闭）
- i18n 15 语言同步（sidebar ×7 / tabbar ×4 / window ×2）

### 全屏逻辑修复（2026-10-16 实施）

- **修复「最大化状态下进全屏是假全屏」**（实测：任务栏变黑但窗口底部不顶满）：
  `toggleFullscreen` 进入前先取消最大化（与 `enterFullscreen` 对齐——WebView2 的 HTML5 fullscreen
  从最大化窗口触发只能小窗全屏）
- 退出全屏后**恢复进入前的最大化状态**；演示模式恢复改 set 语义（`plugin:window|maximize`），
  防止与 toggle 的恢复互相取消
- 右上角新增**全屏按钮**（顺序：最小化 / 最大化 / 全屏 / 关闭——全屏紧邻关闭左侧；间距收紧 w-9）；
  macOS 中键**如实标注「进入/退出全屏」**（其实现即原生全屏切换），右键菜单 mac 隐藏「最大化」项
- **修复双击顶栏空白切换最大化从未生效**（mousedown 立即启动 OS 拖动循环吞掉双击第二击
  → 改为位移超 4px 才启动拖动，与 TabBar 拖拽同款手法）
- 新增 **F11** 切换全屏快捷键（keybindings 体系，可在设置-快捷键自定义）

### 同日批次其他（2026-10-16）

- 代码块悬浮控件重构：右上角「换行 / 复制」（Typora 风格，悬停显现，去掉常驻背景条）+ `editor.copied` 词条
- 文档标题派生 `docTitle.ts`（含 `tests/docTitle.test.ts`，测试 9 文件 / 154 pass）
- 「保存到云端」对话框组件化为 `CloudSaveDialog.tsx`，记住上次成功保存的目录（`webdavSaveLastDir`，persist v9）
- 云端目录树行结构统一为本地同款「三角展开 + 名称进入」（点三角就地展开、点名称进目录）

## v0.3.3

> 本版主题：**自定义 CSS 升级为「自定义主题」** —— 保存即生成、自动选中、立即生效；
> 激活态与观感永远一致。另有实时模式点击定位错位修复（根因：block widget 的 CSS margin
> 不进 CodeMirror 高度图）、保存前自动清洗、清除按钮二次确认、主题设计规范文档等。

### 追加（2026-09-24）：自定义 CSS 升级为「自定义主题」

**背景（为什么重构）**：原「自定义 CSS」的设计意图是「以更高优先级注入」，但实测
**注入后毫无反应**。诊断出两层根因：

1. **保存路径与加载路径是两套实现**：`App.tsx` 启动加载会做 `:root` → `:root.theme-x`
   特异性提升，而 `SettingsModal` 保存时注入的是**原始文本**（少了这一步）⇒
   `:root { --x }` 的 (0,1,0) 被主题 `:root.theme-x { --x }` 的 (0,2,0) 压过，
   必须重启（走加载路径）才生效——提示语「保存并重启后生效」掩盖的正是这个 bug
2. **「最高优先级」从未真正落地**：「排在最后」只能赢**同特异性**的平局；主题普遍用
   更高特异性的选择器（变量 `:root.theme-<name>` (0,2,0)、元素
   `.editor-content.theme-<name> <el>` (0,2,1)），用户写最自然的 `:root{}` / 
   `.editor-content h1{}`（(0,1,0) / (0,1,1)）必然输

**产品语义重构（用户拍板）**：自定义 CSS 不再是「全局补丁」，而是**定义「自定义主题」**：

- **自定义主题 = 基底主题 + user.css**：基底 = 保存时的当前主题（`settingsStore.customCssBase`）。
  「在织锦上只改一个强调色」得到的是「织锦 + 新色」而不是「默认底 + 新色」
- **保存即生成并自动选中**：主题列表首位出现「自定义主题」；激活态与观感从此永远一致
- **user.css 只在自定义主题下生效**（其它主题不叠加）——这是修掉「选了 A 看到 B」恍惚感的关键
- **清空回落**：清空并保存 ⇒ 条目消失，回落基底主题
- **三个消费点对齐**（全部「user.css 非空才显示」）：设置面板列表（首位）/
  右上角调色板菜单（末条 + 分隔线）/ 演示 HUD 菜单（首条）

**实现要点**：

- **选择器归一 + 提权**（`src/lib/userCss.ts`）：粘贴整份主题时 `:root.theme-brocade` 归一为
  `:root.theme-custom`（只归一不加前缀——双主题类永不匹配，这是首轮实现踩的坑）；微调时
  裸选择器追加 `:root.theme-custom` 前缀提权。**不用 `!important`**：作用域前缀已能稳定胜出，
  且用户自己后面的规则仍能覆盖前面的。`@media`/`@supports` 递归改写；
  `@keyframes`/`@font-face`/`@page` 原样保留（块内容不是选择器）
- **单一注入入口**（`src/lib/themeLoader.ts` 的 `applyThemeStyles`）：启动加载与保存共用，
  杜绝「两条路径各写一份、保存那条漏提权」的历史重演
- **保存前自动清洗**（`sanitizeUserCss`）：剥离行首行号（真实踩坑：从聊天窗口复制主题带着
  行号，裸数字让 CSS 解析在第一处断掉、其后全部静默失效）与零宽字符。行号剥离带防误伤
  门槛（>50% 非空行命中才动手；纯数字行保留；`12:` 时间戳形态不匹配）；清洗结果回写文本框
- **清除按钮 + 二次确认**：复用关闭未保存 tab 的弹窗样式（`tab-close-dialog`）
- **右上角菜单即时性**：Toolbar 的 `hasUserCss` 原本只在挂载时读一次，设置面板里的保存/清除
  它感知不到 ⇒ 改为每次打开主题菜单时重读（同模板菜单「打开即刷新」先例）
- **演示模式**：HUD 主题菜单同样出现「自定义主题」；变量 = 基底变量块 + user.css 变量块
  （归一后合并），元素规则照旧丢弃
- persist v5 → **v6**（新增 `customCssBase`，存量存档补默认值）
- 测试：`tests/userCss.test.ts` 24 条（归一 / 提权 / 清洗），`npm test` 90 → **114 条**

### 修复（2026-09-24）：实时模式点击定位错位一行

**症状**：实时模式点击内容时焦点大概率落到下一行（点第一行、激活第二行），引用、代码块、
图片等块级元素尤其明显；源码模式正常。

**主根因：block widget 的 CSS `margin` 不进 CodeMirror 高度图**（源码级定位）：

- CM6 高度测量只取 `getBoundingClientRect().height`（**不含 margin**，
  `@codemirror/view` 的 `measureVisibleLineHeights`）；其 margin 补偿（`spaceAbove`）只在嵌套
  `BlockWrapperTile` 内部递归时计算，顶层块 widget 恒为 0
- `cm-live-blocks.ts` 给所有块 widget 宿主设了 `margin: 0.6em 0`（±19px）⇒ heightMap 与视觉
  **逐 widget 累积偏移** ⇒ `posAtCoords` 按 heightMap 命中 ⇒ 点击视觉第 N 行、焦点在第 N+1 行
- 未测量区域按 `estimatedHeight`（默认 -1 → 1 行高）估算，图片实际 200–400px ⇒
  刚滚动到新区域时偏差最大——解释「大概率」而非恒定
- 引用行本身无 widget（走 lineClass 装饰），但上方有图片/代码块时累积偏移传导——
  解释「引用也错位」

**次根因**：点击 widget 下半部走 `posAtCoords` 对非 Text block 的 `PosAssoc(block.to, -1)` 分支，
被替换行 DOM 不存在时 `inlineDOMNearPos` 的 `before` 落到上一行 ⇒ 光标重映射到上一行。

**修法**：

1. `.cm-live-block` / `.cm-live-block--properties` 的 margin 改为等值 padding
   （padding 在 rect 内 ⇒ 间距进入高度图）；properties 用 `calc()` 保持原占位
2. block replace 范围注册进 `EditorView.atomicRanges` ⇒ 点击 widget 中间时光标确定推到
   范围边界，不再走重映射路径

**A/B 实测**（Playwright + 真实 dev server + 真实扩展链路，21 采样点）：margin 版复现
**14 处错位（全部 +1 行，与用户报告完全一致）**；padding 版 **21/21 全过**。
用户验收：「测试了，点击定位准了，很好」。

### 追加（2026-09-24）：主题设计规范文档 + 织锦测试主题

- **`docs/THEME-DESIGN-SPEC.md`**（14 章 + 2 附录）：令牌分层总览、每模块的
  定义/清单/指引/效果/示例、check-themes 六项门禁、反模式清单、明暗双模式规范、
  新增主题检查清单；附录 A 令牌总表标注状态（`●` 已接入 / `○` 已声明待接入）
- **织锦（`brocade.css`）**：纹路 / 流光能力的**开发用测试主题**——第一个使用
  `--<region>-deco-*`（四区域纹路）与 `--<region>-sheen-*`（工具栏/状态栏流光）的主题，
  `--texture-grid/dots/paper` 预设的首次真实引用。**不注册 `theme.json`、不随版本发布**
  （用户明确：测试主题，不作为正式主题发布）；经真实渲染验证（计算样式 + 像素差分）
- README / help.md 及镜像同步「自定义主题」说明；主题清单保持 15 个口径

### 追加（2026-10-09）：演示模式三项 —— 行内代码折行修复 + HUD 排版旋钮 + `***` 分栏

**来源**：用户 issue #5（标题「过长的行内代码会被截断」）—— 正文同时提出了
「演示模式字体/字形/大小/边距自定义」与「moonslide 式分栏」两项诉求。

**① Bug 修复：演示模式行内代码被截断**

- **根因**：`.ys-slide code` 只声明了颜色/内边距/字号/字体，**没有任何折行属性**。
  `"{:=^20}".format("python")` 这类无断点 token 会形成一个不可断的行盒，在
  `.ys-slide{overflow:auto}` + `.yizi-slideshow{overflow:hidden}` 下表现为「被截断」
- **为什么预览能折行、演示不能**：主题里写的是
  `.editor-content.theme-<id> code { word-break: break-all; overflow-wrap: break-word;
  box-decoration-break: clone }`，而演示根节点带 `theme-<id>` 却**不带 `editor-content`**
  ⇒ 该规则永不命中。修法：把这套属性补到 `.ys-slide code` 上（取值与预览侧逐字一致）
- **必须的复位**：`.ys-slide code` 的选择器更宽，会连带命中 `pre` 内的 code；
  `.ys-slide pre code` 显式复位 `white-space: pre` / `word-break: normal` /
  `box-decoration-break: slice`，否则长代码行会折行、缩进与行号全部错位
- 长 URL 等无断点**纯文本**同样加了 `overflow-wrap: break-word`（同根因）；
  `.ys-slide pre` 加 `max-width: 100%` 使分栏内也能正常横向滚动
- `.ys-title`（左上角文档名）被单行省略号截断 ⇒ 补 `title` 属性，悬停可看完整值

**② 新增：演示 HUD 排版与内容区（字体 / 字重 / 字号 / 内容填充宽度 / 高度）**

- HUD 新增 `Aa` 图标，面板内可实时调整：字体（跟随主题/无衬线/衬线/等宽）、
  字重（300–700）、字号（70%–160%）、**内容填充宽度/高度（50%–95%）**，带「恢复默认」
- **内容填充宽度/高度 = 内容区占整屏的比例**，它是内容区大小的**唯一**依据。
  用户反馈「只调整页边距是不改变视觉效果的」——根因是各版式写死了行宽上限：
  宽窗口上内容宽度被 rem 上限钉住，页边距怎么调都看不出来。修法：把 **9 处**
  行宽上限（`.ys-slide > *` 66rem、内容页 `p/li` 58rem、目录 `ol` 56rem、
  列表页 `ol/ul` 54rem、路线图 `ul` 50rem、封面副文 42rem、引用 `> *` 56rem、
  代码 `> *` / 图表 `> *` 72rem）**全部改为 100%**，并把 **4 处**写死的
  `padding-top: 10vh` 改为按填充高度换算 ⇒ 拉动滑杆一定能看到变化
- **默认值不产出任何行内变量** ⇒ 没调过的演示与本次改动前**逐像素一致**：
  默认 82%×84% 恰好等于原来的 `9vw` / `8vh` 页边距；4 处 `padding-top` 换算后默认仍为 10vh；
  `.ys-layout-quote` 的多余留白（左右 +2vw、下方 +6vh）也原样保留
- 变量写成 `.yizi-slideshow` 根节点的**行内 style**（而非 `documentElement`）：
  作用域限定在演示子树、退出演示自动失效、不污染预览/编辑器。默认值声明在 `globals.css` 的 `--ys-*`
- 字体存 **id 而非字体栈**：字体栈将来改名不会让存量存档失效
- **键盘守卫**：面板里的下拉框/滑杆需要方向键，不能被翻页快捷键抢走（`Esc` 仍关闭面板）；
  滚轮悬停在面板/菜单上不再误翻页（顺带修掉 `.ys-theme-menu` 的既有问题）
- persist **v7 → v8**：「页边距缩放」被「内容填充宽度/高度」取代 —— `slidePadScale` 已无消费点，
  migrate 里显式 `delete`（否则会被 persist 反复写回存档）；新键收敛到 50~95。
  `clampNumber` 只接受数字与数字字符串，`null`/`''`/布尔一律视为「未设置」
  —— `Number(null) === 0` 会把缺失的存档静默归零
- **连带修掉滚轮翻页的一个坑**：内边距也计入 `scrollHeight`，而填充高度会把上下内边距做得很大
  （50% ⇒ 上下各 25vh）。于是「内容已完整显示」时 `scrollHeight` 仍大于 `clientHeight`，
  滚轮判定为「可滚动」⇒ 只滚那段**空白内边距**而不翻页（用户实测发现）。修法：
  可滚动量改为 `max(0, scrollHeight - paddingBottom - clientHeight)`（扣掉底部内边距，
  即按「内容底部对齐视口底部」判断），并把向下滚动夹在该上界内，不再滚进空白

**③ 新增：`***` 分栏**

- 页内用**单独成行的 `***`**（标准 Markdown 主题分割线）分栏；与 `---` = 分页并列，
  二者都是标准分割线，语义分开，**零新语法**
- **不做任何结构推断**（如「同级小标题自动分栏」）：真实文档里同级标题常常只是层级，
  误判率高且用户无法关闭；显式标记比智能猜测更可预测
- `splitColumns()` 与 `splitSlides()` 对称：fence 感知（围栏内的 `***` 是内容）、
  逐字匹配（前导空格不触发）；空栏丢弃；**返回长度 1 = 未分栏**
- **页标题不参与分栏**：页内**第一个标题块**（`#`~`######`）由 `splitColumns()` 抽成
  `intro`，作为整页标题渲染在分栏之上。用户反馈：标题若落进第 1 栏，会表现为
  「左栏带标题、右栏内容顶端高于标题」的错位。页标题**不包 div**、直接作为
  `.ys-slide` 的直接子元素 ⇒ 各版式的 `h2` 规则与 `> :first-child` 装饰仍能命中它，
  标题样式与不分栏时完全一致。想给每栏各写标题 ⇒ 把页标题写最前，再在页标题之后 `***`
- 栏首尾的**空行**会被裁掉（不动行首缩进 —— 缩进的代码块/嵌套列表是合法内容）
- 最多 4 栏，超出时后续内容**并入最后一栏**并 `console.warn`（内容不丢）
- `columns` 是 `Slide` 的**独立字段**，不新增 `SlideKind` ⇒ 与 14 种版式正交，
  `LAYOUT_KINDS.length === 14` 的口径不变
- `BlockType` 新增 `'columns'` 且**独占一块不参与合并**：否则 `scanBlocks` 会把跨栏的
  两个同类型块（如两个列表）合并成一个，版式推断结果随之改变
- 版式推断用「各栏重拼回去」的源，`columns === 1` 时与改动前逐字节一致
- 片段逐步显示扩展到栏内列表项（分栏页多包一层 `.ys-cols > .ys-col`，
  选择器抽成 `FRAGMENT_ITEM_SELECTOR` 常量防止两处漏改）
- `.ys-slide.ys-has-cols` 让页面容器退回单列 flex，避免与 `figure` 版的
  `display:grid`（45/55 栅格）冲突导致栏容器被塞进右半边
- **取舍**：`***` 不再渲染为字面 `<hr>`（需要页内分隔线请用 `___` 或 `- - -`）
- **修掉既有文档 bug**：`docs/slideshow-style-mapping.md` 此前把 `<!-- layout: two-col -->`
  当示例，而 `two-col` 并不在 `LAYOUT_KINDS` 里（只会 warn 并回落）—— 已改为合法值

**文档与校验**

- `help.md` / `src-tauri/help.md`（两份逐字节同步）：演示模式新增「分栏」「排版与页边距（HUD）」两节
- `README.md` / `src-tauri/readme.md`、`website/help.html`（`data-kw` 补 分栏/字体/字号/字重/页边距）
- 新增 `src/lib/slideTypography.ts` + `tests/slideTypography.test.ts`；`tests/slides.test.ts` 扩展
  `splitColumns` / `scanBlocks` / `detectLayout` 用例（测试总数 131 → 131+15）
- i18n：15 个语言文件各 +11 键（`check-i18n --strict` 通过，占位符一致）
- check-themes 无需改动：`--ys-*` 已在 `globals.css` 声明，而该脚本只校验**主题文件**里引用的变量

## v0.3.2

> 本版主题：**实时模式属性面板 + 主题令牌体系** —— front matter 按 Obsidian 式属性面板渲染
> （三模式规范显示 + 严格判定 + 属性类型系统）；主题扩展出区域 / 装饰 / 效果三层令牌并新增
> `check-themes` 六项门禁；默认主题改为「液态玻璃 Prism」并排列表第一位。
> 另有 HTML 导出大纲侧栏、WebDAV 加载预设、云端面包屑折叠与目录树逐层展开、Tab 拖动排序、
> 字体三通道、引用块与公式渲染修复等。

### 追加（2026-09-22）：WebDAV 设置面板「加载预设」 + 云端目录树增强

- **加载预设**：设置 → 云端存储，服务器地址框聚焦时出现「加载预设」按钮，
  一键填入坚果云地址 `https://dav.jianguoyun.com/dav/`（i18n 新增 `settings.cloudLoadPreset` × 15 语言）
- **面包屑折叠**：云端目录层级深时上级折成「…」并消除横向滚动，点「…」可下拉跳转隐藏层级
  （`MAX_CRUMBS = 2` + `min-w-0` 收缩）
- **目录树逐层展开**：点文件夹图标懒加载展开子层级（不再整页跳转），逐层浅色引导线

### 追加（2026-09-22）：Tab 标签拖动排序

- `editorStore` 新增 `moveTab`；TabBar 用**指针事件**拖拽而非 HTML5 DnD
  （Tauri 默认 `dragDropEnabled: true` 会把拖拽事件拦给原生文件拖放）
- 插入指示线 + 跟手浮层（透明度经三轮调整：太实像错误提示、太虚看不见）

### 追加（2026-09-22）：切换视图模式时不再被动下滚

- **根因**：跨模式「阅读锚点补偿」把旧视口 1/3 处那行在新模式里也摆到 1/3 处，
  但两模式**顶部留白不同**（预览有 margin/padding，源码有元信息行 + CM padding）⇒ 明明在顶部却被滚走
- **修法**：快照时记 `atTop`（`scrollTop <= 1`），顶部时整段跳过补偿
  （位置本身即语义时，补偿必须让位）。用户验收：「非常好，改的很好」

### 追加（2026-09-23）：HTML 导出新增左侧大纲侧栏

- **仅 HTML 导出注入**（`src/styles/export-toc.css` 经 `?inline` 内联），PDF / 打印不带 ——
  屏幕导航元素不该印到纸面
- 大纲取自**渲染后的** `h1[id]..h6[id]`（与正文同源 ⇒ 锚点必然对得上，无需重跑 Markdown）；
  heading 文本过 `esc()` 转义，防文档内 HTML 在导出文件里执行
- **悬浮圆角卡片**：sticky 吸顶、背景/阴影读 `--editor-surface` / `--menu-shadow`（随主题）；
  `top` 由导出页内小脚本**实测首个标题底部**对齐（各主题留白/字号不同，写死必偏）；
  `max-height: calc(100vh - var(--toc-top))` 兜底超长大纲，不撑出屏幕下边缘
- 窄屏（≤720px）媒体查询把侧栏收窄到 140px，不抢正文宽度

### 追加（2026-09-22）：默认动画改为「卡片推换」+ 动画选择持久化

- **默认切换动画**：水平滑动 → **卡片推换**（`cube`）。同时把「卡片推换」提到动画菜单**第一位**，其余顺序不变（菜单顺序 = 默认 → 柔和型 → 强烈型）
- **动画选择持久化**：原先 `anim` 是 `Slideshow` 组件内的 `useState`，每次进入演示模式都退回默认值；现改为 `settingsStore.slideAnim`（zustand persist → `localStorage` 的 `yizimarkdown-settings`），选过就记住
- `SlideAnim` 类型从 `Slideshow.tsx` 移到 `src/lib/slideTiles.ts`（动画注册表所在模块）：持久化字段在 store 里也要用它，避免在 store 里退化成 `string`
- 无 persist 版本号变更：新字段由 zustand persist 的默认浅合并从初始值补齐，存量存档不受影响


### 追加（2026-09-22）：主题体系扩展 —— 区域 + 装饰 + 效果三层令牌

**背景（为什么要做）**：`liquidglass-prism` 主题（529 行）一个新变量都没引入，全靠
`.theme-x .toolbar` / `.sidebar` / `.statusbar` 选择器 + 字面量硬怼，甚至要用
`[class*="menu"]` + `z-index: 99999 !important` 才够得着下拉菜单。根因是**顶部工具栏没有自己的变量**：
`.toolbar` 与编辑器内容区共用 `--editor-surface`，主题只能借用 `--sel-toolbar-bg`（本意是划词工具栏）。

**三层令牌（全部纯增量 + fallback 链 ⇒ 现有 16 个主题一行不改、视觉逐像素不变）**

- **区域令牌**：`--toolbar-*` / `--tabbar-*` / `--sidebar-*` / `--statusbar-*` / `--menu-*` /
  `--dialog-*` / `--overlay-bg`，值全部回退到既有基础层。菜单/弹窗/遮罩此前**完全没有令牌**
- **装饰层**：`--<region>-deco-image/size/repeat/blend`（走区域自身背景图层，天然在内容之下）
  + `--<region>-sheen-image/size/anim`（走区域 `::after`，z-index:1，在下拉菜单 z-50 之下）。
  配 4 个通用 keyframes（`deco-sweep` / `deco-sweep-back` / `deco-pulse` / `deco-drift`）⇒
  主题**只给值就能加纹路与流动光影**，不必写选择器、不必自带动画、不必抢层级。
  刻意**不用 `isolation: isolate`**：那会把区域的层叠上下文封起来，区域内的下拉菜单就压不过编辑器内容了。
  装饰动画遵循 `prefers-reduced-motion`（系统开启"减少动效"时静止）
- **效果令牌**：`--radius-xs/sm/md/lg/xl`（`--radius-md` 接 `--border-radius`，兑现各主题注释里
  "全局圆角半径"的承诺）、`--shadow-1/2/3`、`--dur-*`、`--ease-*`，以及纹理预设
  `--texture-diagonal/grid/dots/paper/shine`（用 `currentColor` 派生，自动跟随区域文字色）
- **代码 / 语法令牌**：`--code-*` 共 28 个。此前实时编辑与源码模式的 **25 种 token 全挤在
  `--editor-accent` / `--editor-text` / `--editor-border` 三个颜色上 ⇒ 所有主题的代码都是单色的**。
  同时用 `src/styles/hljs-theme.css` 取代全局引入的 `highlight.js/styles/github.css`
  （后者把预览代码块颜色写死成 GitHub 浅色主题，完全不受主题影响）。
  默认值取法刻意分开：语法 token 用 GitHub 调色板（预览代码块零变化）、markdown 角色 token
  保持强调色（实时编辑正文零变化）⇒ 两套配色首次统一且各自都不回退
- **预览排版令牌**：`--h1-color` / `--quote-*` / `--inline-code-*` / `--table-*` / `--hr-color` /
  `--link-color`，经 Tailwind prose 的 `--tw-prose-*` 注入 —— **没有特异性之争**，prose 本来就靠变量驱动

**修掉的"假旋钮"（定义了但全仓无人消费）**

- `--editor-text-muted`：`Toolbar.tsx` 引用了它但全局从未定义 ⇒ 颜色静默回落为继承值
- `--border-radius`：16 个主题都声明"全局圆角半径"，但 UI 层零消费（工具栏/弹窗/菜单全用写死 px）
- `--editor-h1/2/3`：16 个主题都声明，但全仓只有 `slideshow.css` 消费 —— 预览区标题色被各主题自己的
  `h1 { color: … }` 规则接管。逐主题审计（`h1` 规则里是否写死颜色）：**3 个主题（magazine / minimal / tech）
  规则不设颜色，变量本来就已经生效**；**11 个主题写死的颜色恰好等于其声明的 `--editor-h1`**
  ⇒ 删掉这行冗余写死值是零视觉变化、变量随之生效；2 个玻璃主题（liquidglass / liquidglass-prism）
  的 h1 走渐变文字填充（`-webkit-text-fill-color: transparent` + `background-clip: text`），
  没有 `color:`，单个颜色变量对它们本就不适用
- `.settings-modal-container` 写死 `'Inter'` 字体栈，绕过 `--font-sans`

**新增护栏 `scripts/check-themes.mjs`（已接入 `npm run build`）**

CSS 变量写错名字不报错、只静默失效 —— 这是主题作者最大的坑（`--editor-h1/2/3` 就是实例）。
六项检查：变量白名单（拼错即失败）、亮/暗一致性、死声明、命名一致性、反模式计数、双目录漂移。
三处假阳性防护（都是实际踩出来的）：字体/圆角/装饰几何类变量不参与亮暗一致性检查；
主题文件自身算消费点；**扫描反模式前先剥掉注释**（否则文档里提到 `!important` 会被算成反模式）。

**liquidglass-prism 用新令牌重写**：529 → 411 行，**反模式 14 处 → 0 处**。
工具栏/侧栏/状态栏/菜单的选择器硬怼全部消失，改为给令牌值；剩下的是预览排版的结构性装饰
（渐变文字、多重内阴影、伪元素光带）与令牌声明，这些无法用单个值表达。

**未做（有意）**：`--editor-selection`（选中文字色）**没有接线** —— 实测暗色主题下接上后
选中文字对比度从 7.65:1 掉到 3.05:1（低于 WCAG AA 4.5:1）。问题在令牌语义本身
（它与 `--editor-selection-bg` 同色相），需先重新定义语义再接线。

**跟进（同日）：接线三处遗留项**

- **`--editor-h1/2/3` 接线**：逐主题审计后发现 16 个主题里 3 个（magazine / minimal / tech）的 h1 规则
  本来就不设颜色（变量早已生效），11 个把颜色写死在规则里。删除其中 **48 条**「写死值恰好等于同模式
  声明值」的声明（亮色 33 + 暗色 15）：
  - 亮色全部零变化（值逐字符相同）
  - 5 个主题（cyberpunk / facebook / lychee / mint / violet）暗色也零变化
  - 3 个主题（academic / nature / vibrant）**没有暗色标题规则**，亮色值泄漏进暗色模式 —— 例如
    academic 暗色 h1 是 `#002FA7` 深藏蓝叠在 `#0d1117` 近黑底上（对比度约 1.4:1，几乎不可见）。
    删掉后走变量、取到主题声明的暗色值 `#5a7ce3` ⇒ **修好了**
  - 3 个主题（matrix / sunset / typewriter）各有两套暗色 h 规则，层叠顺序无法静态判定 ⇒ **只删亮色**
  - 迁移脚本的两条判据都是踩坑后才加的（值必须同模式相同；同级同模式存在多条规则一律跳过）：
    第一版没考虑"后一条覆盖前一条"，把 matrix 暗色 h2、sunset 暗色 h3 意外改掉了；同时删声明时
    吞掉了闭合花括号前的换行，造成缩进损伤
- **字体：`--font-mono` 不再被编辑器字体覆盖**：`App.tsx` 原先把用户选的编辑器字体（默认 MiSans，
  **比例字体**）写进 `--font-mono`，而该变量语义是"等宽编程字体"（globals.css 注释与各主题都按此声明）。
  已移除该写入 —— 编辑器正文字体本来就由 CodeMirror 主题直接应用（不经 CSS 变量），故编辑器显示不受影响。
  连带 Tailwind 的 `font-*` 工具类改为指向 `var(--font-sans/mono/serif)`（原先硬编码 DengXian 等，
  与变量完全脱钩）。实际影响面 **20 处**（`var(--font-mono)` 12 处 + `font-mono` 工具类 8 处），
  效果是代码与等宽输入框从比例字体变成真等宽。
  **更正**：此前口头估计的"90 处"是错的 —— 那个数字把 `--font-sans` 这类**声明**也算进了 `font-sans` 匹配
- **`liquidglass` 主题试点令牌化**：工具栏与侧栏的 `.theme-liquidglass .toolbar` / `.sidebar` 选择器硬怼
  改为给区域令牌值（新增 `--sidebar-shadow` / `--sidebar-blur` 并接进 `.sidebar`）。菜单那段
  （`[class*="menu"]` + `!important`）**刻意保留**：菜单表面写在各组件的 Tailwind 类里，没有集中
  CSS 规则可挂，需先把那些组件改读 `--menu-*` 才能安全删除 —— 先删会让该主题的下拉菜单丢玻璃样式

**修复（同日）：字体三角色解耦 —— 修掉上一轮「字体拆分」引入的回归**

上一轮把编辑器字体从 `--font-mono` 里摘出来时判断错了，造成两个问题：

- **源码字体设置失效**：`Editor.tsx` 里编辑器字体写的是 `var(--font-mono, ${fontFamily})` ——
  设置值只是**回退值**，而 `--font-mono` 一旦有定义（globals.css `:root` 里本来就有），
  那个回退永远用不到。删掉 App.tsx 写 `--font-mono` 那行后，编辑器被冻结在 CSS 声明的等宽栈上，
  改设置无效。当时的错误假设是"编辑器字体由 CodeMirror 主题直接应用、不经 CSS 变量"。
- **预览字体越权改界面**：`--font-sans` 被写入「预览字体」，而 `body { font-family: var(--font-sans) }`
  ⇒ 全应用界面文案跟着内容字体变。另外上一轮 P0 把 `.settings-modal-container` 的硬编码 `'Inter'`
  改成了 `var(--font-sans)`，让设置面板也一起吃到了这个泄漏（**这一处是本轮引入的**）。

**改法：拆成三个互不越权的角色**（`globals.css` 里逐个注释了用途）

| 变量 | 作用域 | 来源 |
| --- | --- | --- |
| `--font-ui` | 软件界面：设置面板 / 侧边栏 / tab / 状态栏 / 菜单 | **固定**，不由用户字体设置写入；主题可覆盖以获得风格差异 |
| `--font-editor` | 源码模式「可编辑的源码内容」 | 设置里的「编辑器字体」 |
| `--font-preview` | 预览 / 实时 / 演示模式「内容」 | 设置里的「预览字体」 |

- `body` / `.settings-modal-container` / `.selection-toolbar` 改读 `--font-ui`
- 预览面板与 `slideshow.css` 改读 `--font-preview`
- CodeMirror 主题按模式取变量：`var(--font-${实时 ? 'preview' : 'editor'}, …)`
  ⇒ 实时模式的内容字体跟随预览字体，源码模式跟随编辑器字体
- 结果：`var(--font-sans)` 现在**零真实消费**（只作为两个默认回退），预览字体不可能再泄漏到界面；
  `--font-mono` 回归"纯等宽"语义，不再被用户字体覆盖

**补充（同日）：实时模式的标题字体与预览对齐**

实时模式的定位是「可编辑的预览」，但它的标题此前只继承正文字体 —— 主题为设计指定的标题字体
（magazine / nature 用 `var(--font-serif)`）只在预览里生效，于是实时与预览观感不一致。

- 新增 `--font-heading` 令牌作为**单一来源**，预览与实时共用：默认 `var(--font-preview)`
  （即用户设置的预览字体），主题可在变量块里覆盖 ⇒ **主题优先**；没设主题的就回退到内容字体
- `cm-live-render.ts` 的 `.cm-md-h1..h6` 补上 `fontFamily: var(--font-heading)`
- magazine / nature 的 h1/h2/h3 规则由 `var(--font-serif)` 改为 `var(--font-heading)`，
  并在变量块里声明 `--font-heading: var(--font-serif)` ⇒ 两处共用同一来源
  （magazine 的 `th` 表头字体仍用 `--font-serif`，属另一处设计，未动）
- 分工明确为：用户设置管「正文字体」，主题管「标题字体」—— 后者优先


### 追加（2026-09-22）：元信息块（front matter）在三个模式下的规范显示

**根因：三个症状同源。** `@lezer/markdown`（CodeMirror 的 Markdown 解析器）**不认识 YAML front matter**
（包内搜不到任何 frontmatter / yaml 代码）。于是文档开头的 `---` / `title: …` / `---` 被按 CommonMark
解析成「第 1 行 = 分隔线」+「第 2~3 行 = setext 二级标题」（CommonMark 规定"文本行 + 紧跟 `---` 下划线"
就是 H2）。这一个事实同时解释：

- **源码模式"第二个 `---` 下面多一根下划线"**：`defaultHighlightStyle` 对 heading 标签就是
  `text-decoration: underline` + 粗体，而 setext 标题节点**跨越两行** ⇒ 下划线画在 `---` 那行下面
- **实时模式"顶部一根分割线 + 第一行变成 H2"**：第 1 行被渲染成 `<hr>`、`title:` 行被套上 `.cm-md-h2`
- 预览模式走的是另一条路：内联正则把整块删掉，所以什么都不显示

**为什么不写 lezer 块解析器**（看起来最"正统"）：块解析器的 `parse` 一旦调用 `cx.nextLine()` 消费了行，
就**不能再返回 false**（内置解析器全都遵守这条）。而"文档以 `---` 开头、却没有闭合 `---`"（就是普通
分隔线）是最常见的情况之一 —— 那时必须能退回原状。故改用 `StateField`：它拿得到全文，能安全判定。

**改动**

- 新增 `src/lib/frontMatter.ts` 作为**唯一事实源**：`splitFrontMatter(src) → { meta, body, range }`
  （额外给出字符偏移，供 CodeMirror 使用）。此前 `slides.ts` 与 `markdownRenderer.ts` **各有一份规则
  不一致的正则**（一个允许前导空行、一个不允许；对结尾换行的处理也不同）⇒ 同一份文档在演示模式与
  预览模式下可能给出不同判断。两者现在都委托给它，公开 API 与既有测试不变
- 新增 `src/lib/cm-frontmatter.ts`：`frontMatterField`（区间）+ `frontMatterLines`（给区间内每行套类），
  挂在**基础扩展**里 ⇒ 源码与实时模式同时生效
- `cm-live-render.ts` 的装饰构建在元信息区间内**整块跳过**（`enter` 返回 false 连子节点一起跳）
  ⇒ 分隔线与 H2 一起消失
- 样式（`globals.css`）做成"属性面板"观感：弱化文字色 + 0.92em + 淡背景 + 左侧强调色细线。两处刻意为之：
  ① 选择器**重复写一遍类名**提升特异性 —— CodeMirror 主题样式是运行时注入 `<head>` 的，与 globals.css
  的先后顺序不可控，单类会被它的 `.cm-line` padding 吃掉；② 下划线**必须命中 span** —— highlight 的
  下划线作用在生成的 `<span>` 上，而后代自己的 `text-decoration` 不会被祖先的 `none` 取消
- 新增 `tests/frontMatter.test.ts`（8 条），重点盯"不能误判"的边界：**没有闭合 `---` 时必须当正文**
  （否则整篇会被吞掉）、CRLF、只有元信息、前导空行、非键值行；`npm test` 纳入该文件，62 → **70 条**

**三模式的最终分工**：源码 = 原样（只去掉了错误的"标题"观感）；实时 = 弱化的元信息面板（仍可编辑）；
预览 = 隐藏（解析改为结构化，与另两个模式共用同一份实现）


### 追加（2026-09-22）：元信息判定改严格档 + 实时模式属性面板

**修掉的误判（用户实测）**：原规则 `/^\s*---…/` 有两处过宽 —— `^\s*` 允许前导空行；
对块内内容**不做任何校验** ⇒ 只要出现第二个 `---`，中间所有内容（哪怕整章正文）都被当元信息。
反例：
```md
---
第一段正文
---
第二段正文
```
⇒ 整块被套上元信息样式。**测试盲区**：原用例只覆盖了"没有闭合 `---`"，没覆盖这个更常见的反例。

**严格判定规则**（`src/lib/frontMatter.ts`）

```
是元信息 ⟺ 三条同时成立：
1. 第 1 行第 1 列就是 ---（不允许前导空行；与 Jekyll / Hugo / Obsidian 一致）
2. 存在闭合行 --- 或 ...
3. 块内每行 ∈ { 空行, # 注释, key: value, 缩进续行 }，且至少有一行 key: value
```

- 为什么不是"每行都必须 `key: value`"：合法 YAML 的列表与嵌套（`tags:` 换行缩进 `- a`）会被**误杀**
- 为什么"至少一行键值对"必需：`# 第一章` 在 YAML 里**就是注释**，光靠"注释行合法"挡不住散文
- key 必须是 ASCII 标识符 ⇒ 顺带把中文散文（`注意: 正文`）挡在门外
- 已知固有歧义（与 Obsidian 相同，不特殊处理）：`Note: this is prose` 本身就是合法 YAML 映射，只能当元信息

**新增 `parseProperties()`**：逐条给出属性名/值 + 字符偏移（键、值、整行），属性面板写回要用。

**实时模式属性面板**（`src/lib/cm-properties.ts`，仅实时模式挂载）

照抄项目已有的 `EditableTableWidget` 模式：Shadow DOM 隔离事件、原生控件、事件全部 `stopPropagation`、
**提交走 `view.dispatch` ⇒ 撤销/重做自动可用**、不 `preventDefault` beforeinput ⇒ **输入法可用**。

- 表格：第一列属性名（可改，类型跟随改名）+ 类型下拉，第二列按类型换控件，行尾删除，底部「+ 添加属性」
- 类型：自动（按值推断）/ 文本 / 数字 / 复选框 / 日期 / 日期和时间 / 列表
- **「常驻」与「编辑源码」靠同一个光标守卫共存**：点表格内部的事件被 `stopPropagation` 拦下
  ⇒ CM 光标不会进入块内 ⇒ 表格常驻可编辑；点「编辑源码」显式把选区放进块内 ⇒ 表格让位、
  原始 YAML 可编辑。**不需要额外状态**
- 类型按**属性名全局**存（`settingsStore.frontMatterTypes`，与 Obsidian 的 `types.json` 语义一致）。
  刻意不按文件路径索引：项目里没有任何按路径索引的持久化，且未命名新文件与云端文档都没有可靠本地路径

**两处 CodeMirror 约束（读 CM 源码确认，不是猜的）**

1. **跨行替换装饰必须由 StateField 提供，不能是 ViewPlugin**。CM 源码即
   `if (this.disallowBlockEffectsFor[index]) { if (deco.block) throw new RangeError("Block decorations may not be specified via plugins") }`
   —— 第一版写成 ViewPlugin 会**直接抛错**；已改为 StateField（与 `cm-live-blocks.ts` 的 `blockDecorField` 一致）
2. 行装饰与替换装饰**重叠不报错**（CM 源码里没有 "Overlapping" 这个错误）⇒ 不必为源码模式的行装饰加抑制逻辑
3. 属性面板**自己从文档算区间**（`frontMatterOf`），不读 `frontMatterField`：StateField 之间互相读取
   依赖扩展注册顺序，而两者挂在不同 compartment 里，顺序不保证

**i18n**：新增 `properties` 命名空间 12 个键 × 15 语言（走 `scripts/apply-i18n.mjs`），`check-i18n --strict` 缺失 0

**测试**：`tests/frontMatter.test.ts` 扩到 18 条，`npm test` 70 → **78 条**。其中两条旧断言按严格档
**有意改写**（原先断言"允许前导空行""忽略非键值行" —— 那两条宽松行为正是误判来源）

**未做（有意，记为后续）**：文档没有元信息时"创建元信息块"（需往第 1 行插入 `---` 空行 `---`，
涉及光标与撤销语义）；块状 YAML 列表的完整编辑（当前标记为只读，避免写坏结构）

**跟进（同日）：实测后修三个问题 + 属性表按 Obsidian 观感重做**

用户实测 5 项，其中 3 项有问题：

1. **「编辑源码」没反应**：光标守卫是 `sel.to > range.from`，而按钮把**折叠光标**放在 `range.from`（位置 0）
   ⇒ `0 > 0` 为假 ⇒ 判定为"在块外"、属性列表不消失。
   注意**不能**简单改成 `>=`：刚打开文档时光标本来就在 0，那样会一打开就看不到属性列表。
   正解是让按钮**选中整个块**（区间选区），守卫便明确判定为"在块内"
2. **判定规则过严（连带导致演示模式 title/author/date 全丢）**：用探针测 12 个真实样本，发现 4 处误杀 ——
   `publish.date:`（Hugo/Jekyll 常见的点号键）、`标题:`（YAML 允许非 ASCII 键）、`my key:`（plain scalar key 可含空格）、
   开头 BOM（Windows 常见）。放宽为「key 不要求 ASCII，但冒号后必须有空白或行尾」——
   后者专门挡掉 `https://example.com` 这类"看着像键值对其实是 URL"的行（`https:` 后面是 `/`）。
   误判防护仍在：仍需"块内至少一行键值对"，用户原反例依然正确拒掉。
   **已知固有歧义**（与 Obsidian 一致，已在测试里写明）：`注意: 这是正文`（半角冒号 + 空格）本身就是合法 YAML 映射
3. **front matter 的 `title` 从未接线**：`Slideshow.tsx` 只取了 `author`/`date`，左上角 `.ys-title`
   与章节名用的都是 `title` 属性（文档名）。改为 **front matter 的 title 优先，没有才用文档名**

**属性表按 Obsidian 观感重做**（用户反馈"现有属性值是生硬的下拉菜单、且在属性名右侧、属性名一栏极窄"）

- 行布局改为 **`[类型 icon] [属性名] [值]`**：类型 icon 在**行首**，点它弹出菜单（每项 = icon + 名称），
  取代原先摆在属性名右边的原生 `<select>`
- **去掉所有表格线**，改为 hover 时当前行出现圆角框 + 淡背景（与 Obsidian 一致）
- **属性名宽度按内容自适应**（`min-width: 5em; max-width: 45%`），修掉"极窄无法显示完整"
- 类型图标内联自 lucide 的图标节点数据（ISC）。**刻意不用 `lucide-react` 组件**：
  那是 React 组件，在 widget 里渲染要挂 React root，而 React 18 的 `createRoot` 是异步渲染，
  与 CodeMirror 在 `toDOM` 时同步测量 widget 高度的做法冲突（会闪会跳）；内联 SVG 保持纯 DOM，
  与 `EditableTableWidget` 的做法一致
- 保留左侧强调色竖线 + 淡背景（与源码模式的元信息块观感一致）

**顺带**：清掉 `slideshow.css` 里 **7 处幽灵变量** `--editor-text-muted`（从未定义，一直回落成硬编码灰色、
与主题脱钩）—— 与之前修 `Toolbar` 那处同类。全仓现已无残留。

**测试**：`tests/frontMatter.test.ts` 增至 22 条（新增点号键/中文键/BOM/URL 行/全角冒号），`npm test` **83 条**

**再跟进（同日）：类型菜单移到 light DOM + 属性名列对齐**

用户复测后剩两点，根因都不是"调参"，而是**结构性**问题：

1. **类型菜单太宽、且颜色与其它菜单不一致** —— 两个根因：
   - **颜色**：菜单原先渲染在 **Shadow DOM** 里，而主题对菜单的定制写在 **light DOM**
     （如液态玻璃主题的 `[class*="menu"] { … !important }`）。**样式不跨 shadow 边界**
     ⇒ 放在 shadow 里就拿不到主题的菜单外观，自然与其它菜单不一致。
     改为把菜单挂到 `document.body`，类名 `properties-type-menu`（**含 "menu" 以命中主题那类规则**），
     样式基线写在 `globals.css`，主题定制照常覆盖 ⇒ 与其它菜单同源
   - **太宽**：面板继承的是**编辑器字号**（默认 20px），而菜单里用 `em` ⇒ `0.88em ≈ 16px`，
     比应用 UI 菜单的 14px 大一圈。改为**绝对 px**（13px），宽度 `max-content` + `max-width: 200px`
   - 顺带用 `position: fixed` + 出屏翻转（下方/右侧放不下就向上/向左），
     避开 `.cm-scroller` 的 `overflow` 裁剪 —— 之前担心的"编辑器底部菜单被切掉"一并解决
2. **值列没左对齐**：属性名列原先**逐行按自身内容**定宽（`flex: 0 0 auto`），行与行宽度不同 ⇒
   值列起点参差。改为**取所有属性名里最宽的那个**（按显示列宽算，CJK 算 2 列）作为**共用的 `size`**，
   既对齐又不会为短名留出过多空白

**另一个交互坑（自测发现）**：「点外面关闭」原先用 **capture 阶段**监听，会在图标自身的 click 处理器
**之前**先关掉菜单 ⇒ 再点同一个图标会"关了又开"（切换失效）。改为 **bubble 阶段**
（图标与菜单项都已 `stopPropagation`，document 监听不会误触发），并加上"点另一个图标直接切换"
（`openFor` 记录菜单归属）。widget 被销毁时通过 `WidgetType.destroy` 收走挂在 body 上的菜单，避免残留。

**修复（同日）：切换视图模式时被被动下滚一段**

**现象**：明明已在页面最顶部，切换源码/并排/实时/预览后会自动下滚一点 —— 元信息显示不全，
液态玻璃 Prism 专门为预览设计的顶部留白也被吃掉。

**根因**：跨模式切换的「阅读锚点补偿」——它把"旧模式视口 1/3 处的那一行"当作锚点，
在新模式里把该行也摆到 1/3 处。但**两种模式的顶部留白并不相同**：预览有 `.editor-content` 的
`margin: 1.5em + padding: 2em`，而源码/实时里元信息还占着几行；且两边取锚点的判据也不同
（预览按"元素 bottom 越过 1/3 线"，编辑器按 `lineBlockAtHeight`）。于是同一 source line 在两边的 y 不同
⇒ 补偿时被被动下滚，正好把元信息与预览顶部留白顶出视野。

**修法**：记录「旧模式是否本来就在顶部」（`scrollTop <= 1`），**在顶部时完全不做补偿** ——
新模式本身就从顶部开始（CodeMirror 视图实例跨模式复用、scrollTop 保留；预览面板重新挂载也是 0）。

**顺带排除一个猜测**：怀疑是"大纲与页面对齐"导致的滚动，**不成立** —— `activeHeadingId` 只用于
大纲项高亮（`Sidebar.tsx:379`），不驱动任何滚动；其余 `scrollIntoView` 都在搜索跳转、
大纲点击（`navigateToLine`）与 `insertMarkdown` 里，均为用户触发，不在切模式路径上。

**修复（同日）：引用块渲染 —— 上下留白统一 + 去掉强加的引号**

**问题**：引用块在预览/并排右侧有两个毛病 —— (a) 下方多出一段边距，看起来像"引用里多了个空行"；
(b) 内容被强制加上首尾引号。

**根因**：
- 引号来自 Tailwind prose 的 `blockquote p:first-of-type::before { content: open-quote }`（及 last-of-type 的 close-quote）
- "多出的空行"来自两层叠加：prose 给 `p` 的 `margin: 1.25em` 在引用块内部变成**可见**的上下留白；
  各主题又各自写了 `margin: 1em 0` + 纵向 `padding 0.5~1em` ⇒ 合计 1.5~2em（就是那"一行"）

**改法**（统一为"半行左右"）：
- prose 基线（`tailwind.config.ts`）：`margin: 0.5em 0`、首尾段落外边距归零、`quotes: none` + 两条 `content: none`
  —— 引号用两道保险：`quotes: none` 让 `open-quote` 关键字不产生内容（不依赖特异性），
  `content: none` 直接改掉那两条伪元素规则
- 16 个主题：`margin` 纵向统一 0.5em、`padding` 纵向统一 0.5em（横向保留各自设计 1em/1.2em/1.5em）
  ⇒ 纵向合计 **1em ≈ 半行**（line-height 默认 2.0）

**⚠️ 过程中的事故（如实记录）**：批量改主题文件时我用了 PowerShell，而
`Get-Content -Raw` 会按系统 ANSI 解码 UTF-8 文件 ⇒ **16 个主题文件的中文注释全部变成乱码**
（含未跟踪的 prism）。这正是本 changelog 早先记过的坑（"PowerShell `Set-Content` 破坏 UTF-8 编码"），
我重复踩了一次。恢复过程：

- **受版本控制的 15 个文件**：`git checkout` 完美还原 ✓，再用 **Node 脚本**重新施加本会话的主题改动
  （标题色 48 条、`--font-heading`、引用块间距、liquidglass 区域令牌）
- **prism（未跟踪、无 git 副本）**：从 `src-tauri/target/debug/themes/` 的副本恢复结构
  → 逆转编码（UTF-8 当 GBK 读的逆运算，恢复代码与大部分注释）
  → **逐行**修补残留受损字符。逆转**有损**（47 处不可逆，主要是注释里 `═` 与换行），所以只能逐行修
- 中途还犯了第二个错：用 `[\s\S]*?` 做**跨文件**正则替换横幅，结果从文件头一路匹配到预览区横幅，
  **把中间的令牌块整段删掉**（文件从 14692 字符掉到 7401）⇒ 从备份恢复后改为逐行处理
- 最终状态：**全仓主题文件 0 乱码**、prism 变量声明数与备份一致（118 个）、`check-themes` 0 失败

**教训（写进流程）**：改这些文件**一律用 Node 脚本或编辑工具**（显式 UTF-8），
不用 PowerShell 的 `Get-Content`/`-replace`/`WriteAllText` 链路；批量替换**不做跨行/跨文件正则**。

**跟进（同日）：引用块"多一个空行"没修干净 —— 真因是各主题自己的 `p` 规则**

用户复测：13 个主题仍多一个空行（学术蓝/赛博朋克/Facebook/液态玻璃/杂志感/黑客帝国/极简风/
薄荷冰沙/自然风/落日熔金/科技感/复古打字机/活力橙），只有 prism、荔枝红、紫罗兰修好了。

**我上一轮的判断不完整**：我以为改 `tailwind.config.ts` 的 prose 覆盖就够了，但真正压住它的是**各主题自己**的
段落规则 —— `.editor-content.theme-x p { margin: 0 0 var(--paragraph-spacing) }`，特异性 **(0,2,1)**，
与 prose 生成的 `p:last-of-type{margin-bottom:0}` **同级**；而主题 CSS 是**运行时注入、排在后面**
⇒ **主题赢**，于是首尾段落的 `--paragraph-spacing`（1.5em）在引用块内部变成"多出来的一行"。
这解释了 13/3 的分布：荔枝红与紫罗兰的规则写作 `.theme-x p`（(0,1,1)），低于 prose 那条 ⇒ 它们被修好了。

**修法**：在 `globals.css` 里加一条**更高特异性**的规则（(0,2,2)）压住所有主题：

```css
.editor-content blockquote p:first-of-type { margin-top: 0; }
.editor-content blockquote p:last-of-type { margin-bottom: 0; }
```

已核对：没有任何主题存在 3 个类的 `p` 规则（即无更高特异性），所以这条在 16 个主题上都能赢。

**顺带修复**：`theme.json` 里 prism 的注册信息在上一轮 `git checkout` 时被一并回退了
（该目录整体还原），导致主题列表显示文件名而不是「液态玻璃 Prism」⇒ 已补回。

**⚠️ 为什么第一次修复"看起来没生效"**：Vite dev server 的文件监视器是 **2026-09-22 13:25** 启动的
（跑了两天），它**漏掉了 `globals.css` 这次写入的通知** —— 结果规则已在磁盘与 `dist/` 里、
HTTP 接口也能拉到，但 **HMR 从未推送给客户端**，客户端仍持有旧 CSS。用户那次的测试**无效**。
已重启 dev 进程树（仅本项目：`tauri dev` + `vite`，不动另一项目的 `next dev`），
重启后确认服务端已包含全部四条修复：`blockquote p:first/last-of-type`、`quotes: none`、区域令牌。

**修复（同日）：实时模式里公式块之后的内容不渲染（用户复测通过）**

**根因**在 `cm-live-blocks.ts` 的**多行 `$$…$$` 区间计算**，两处确凿缺陷：

1. **`endLine = j` 的兜底**：找不到闭合行时 `endLine` 会一路推到**文档最后一行**
   ⇒ `if (endLine > i)` 几乎恒真 ⇒ 生成了「从 `$$` 到文档末尾」的替换区间，
   把公式之后的全部内容一并盖掉
2. **闭合检测过严**：只认「整行恰好是 `$$`」，`\sqrt{\pi}$$`（闭合挂在行尾）这种写法
   **永远匹配不上** ⇒ 必然走上面那条兜底

**改法**：
- `endLine` 初值改为 `-1`，**找不到闭合就直接不生成替换** —— 宁可公式块显示为原始文本，
  也绝不能吞掉正文
- 闭合检测放宽为「**行尾是 `$$`**」，同时认「`$$` 独占一行」与「`…$$` 挂在行尾」两种写法

修复后用户复测：公式正常渲染、其后内容恢复渲染 ✓

**跟进（同日）：元信息行的 H2 折叠徽标（源码模式）**

用户反馈：源码模式下把鼠标移到元信息的 `title: …` 那行会冒出可折叠的 `H2` 胶囊，
而元信息不该有标题。**与前面同一根因** —— `@lezer` 把 `title: x` + 下一行 `---` 当成 setext 二级标题，
于是 `cm-heading-fold.ts` 的 `headingLevelAtLine()` 认成了 2（那个胶囊还会执行 `toggleFold`，
即**能折叠掉元信息**）。已在两个调用点跳过元信息区间：mousemove 判定 + `refreshIndicators()` 批量扫描。

顺带核对了其它标题消费点：实时模式的标题装饰早已用 `frontMatterOf` 跳过；
**大纲面板不受影响** —— 它用正则 `^#{1,6}\s+` 只认 ATX 标题，setext 根本进不去
（所以大纲里从来不会出现 `title:` 这种伪标题）。

**跟进（同日）：主题精简 —— 删除旧的液态玻璃，prism 成为默认并排第一**

- 删除 `src-tauri/themes/liquidglass.css`（含 `theme.json` 条目、`globals.css` 里
  `.theme-swatch-liquidglass` 死 CSS）
- **默认主题**改为 `liquidglass-prism`：`settingsStore.currentTheme` 与「恢复默认」的
  `DEFAULTS_APPEARANCE` 都指向新的 `DEFAULT_THEME` 常量
- **展示顺序**：`list_themes()`（Rust）按文件名排序，prism 排不到最前 ⇒ 新增
  `src/lib/themeOrder.ts` 的 `orderThemes()`，在**三个消费点**统一归位
  （工具栏主题菜单 / 设置面板 / 演示模式主题菜单）
- **persist 升到 v5**：迁移 `currentTheme === 'liquidglass'` → 默认主题 —— 该主题文件已删除，
  不迁移会让 `read_theme_css` 取不到文件、**整块主题空白**。只动这一种被删值，用户选过的其它主题不动
- 新增 `tests/themeOrder.test.ts`（顺序归位 + 兜住"改了 DEFAULT_THEME 却漏建主题文件"的手误）
  ⇒ `npm test` **90 条全过**；`check-themes` 由 2 项告警降至 **1 项**
- **⚠️ 删除主题文件必须连带清掉 `target/**/themes/` 里的副本**：`get_app_root()` 返回的是
  **可执行文件所在目录**（`main.rs:331`），dev 模式即 `target/debug/` ⇒ `list_themes()` 实际读的是
  **资源拷贝**而非 `src-tauri/themes/`。而 Tauri 的资源拷贝是**增量覆盖、不会删除源里已不存在的文件**，
  所以删了源文件，旧主题仍会出现在列表里（已全盘清理 `target/debug` / `target/release` /
  `target/release/bundle/portable` 三处，现均为 15 个）。
  注：这也是 `check-themes` 只扫 `src-tauri/themes/` 而不扫 `target` 的原因 —— 源才是事实源。
  **更正**：此前我说"运行时只读 `src-tauri/themes/`"不准确，dev 下读的是资源拷贝。

**跟进（同日）：`check-i18n.mjs` 补第三个方向的检查 —— "用到但未定义"**

原本只查「各语言之间的键齐不齐」，**查不到「代码用了、字典没有」** —— 而那才是更隐蔽的一类：
界面会直接显示 `settings.foo` 这种原始键名（不崩溃，等于没翻译）。现已补上：

- **静态** `t('ns.key')` → 必须存在于 `en.ts`，缺失即**退出码 1**（挡住构建）
- **静态裸键经局部包装器**：`const t = (k) => translate(lang, \`properties.${k}\`)` 之后的
  `t('editSource')` 不带命名空间 ⇒ **按本文件里定义的包装器补全前缀**再比对。
  （第一版漏了这一环 —— 我用"临时改名破坏测试"才发现新检查没抓到，是被另一条校验兜住的）
- **无命名空间且无包装器的裸键** ⇒ 报错（本项目约定所有键都带 `ns.`）
- **动态键**：模板字面量无法静态求值，按「前缀 + 取值来源」显式展开后比对：
  `i18nKey: 'xxx'` → `settings.xxx`（17 家 AI 供应商 + 插件配置）；
  `cm-properties.ts` 的 `TYPES` 枚举 → `properties.type{Auto,Text,Number,…}`
- **未声明来源的动态键前缀** ⇒ 告警（提醒补一条，否则是新的盲区）

当前：**静态 388 + 动态 26 全部已定义，缺失 0**。已用破坏性测试验证：临时把 `en.ts` 的 `editSource`
改名 → 报出 `静态 properties.editSource` 且退出码 1 → 已还原。

## v0.3.1


> 本版主题：**演示模式（幻灯片）体系重做** —— 版式推断改为注册表驱动、新增片段逐步显示与懒渲染；切换动画从"整页 mask 过渡"升级为**瓷砖转场**（每格持有前后两页的真实 DOM 克隆），动画菜单扩到 12 种。

**演示模式：瓷砖转场（本版核心）**

- 整页（背景 + 内容）切成 N 个单元，每格 = `overflow:hidden` 的窗口 + 一份【整页克隆】负偏移对齐（正面旧页 / 背面新页）⇒ 每格可独立做 2D/3D 变换与独立时序。CSS 无法对单个元素做分区变换，这是唯一解
- 克隆取【活 DOM】（`cloneNode`）而非 HTML 字符串：活 DOM 已含 postRender 产物（mermaid SVG、katex）与已转好的图片 data URL，字符串两者都缺
- 克隆必须滤掉状态类（`ys-active / ys-past / ys-future / ys-leaving`），否则命中隐藏规则、窗口里是空的
- 新增 `src/lib/slideTiles.ts`（纯函数、零依赖）：切割形状（方块 / 竖条 / 六边形）、延迟节奏（随机 / 波 / 行扫）、单格时长、收尾融合、3D 冲量全部配置化，CSS 只负责"怎么动"
- 12 种动画：柔和型 4（水平滑动 / 淡入淡出 / 轻微缩放 / 无动画）+ 强烈型 8（高斯溶解 / 百叶窗格 / 棋盘格子 / 百变立方 / 六角蜂巢 / 爆裂卡片 / 纵深穿梭 / 卡片推换）
- 重做三个：**百叶窗格**（旧版整页 mask 竖叶，背景与容器同色 ⇒ 背景完全隐形）、**高斯溶解**（12 个软边水渍互相吞并，替换原像素溶解）、**卡片推换**（原"立方体"改纯 2D 三阶段，方向语义修正为大众翻页直觉）
- 动画名统一四字（15 语言同步），"无动画"排菜单最后；删除"波浪"（与棋盘格子重复）与"三角"两个变体

**演示模式：版式注册表 / 片段 / 懒渲染**

- 版式推断改为**有序规则表** + 唯一事实源：新增版式 = 注册一条规则 + 一段 CSS；`scanBlocks` v2 供版式推断与片段标记共用
- 片段逐步显示**默认关闭**（优先级：页级注释 > HUD 运行时开关 > front matter；生效版式限 content / content-list / roadmap）；理由：目录页也要用户频繁点击才显示，不够人性
- 懒渲染：元数据全量、HTML 惰性（Map 缓存 + 窗口 `|i-h| ≤ 2`），section key 含窗口态 ⇒ 进出窗口即重挂载，顺带清理 postRender 与片段残留

**官网**

- `index.html` / `help.html` 两页接入百度统计

**本版踩坑（续号 13–20）**

- **`animation-delay` 未到时元素取【基值】**，基值必须等于关键帧 0% —— 一处没对齐就是"起手帧露出新页 / 影 / 被放大"。本版被它咬到四次（阴影层 opacity、爆裂背面、立方体卡片、纵深 0%）
- **`mask-image` 是离散属性**，切换点按【缓动后】的进度算：99% 偏移在 ease-out 下约 150ms 就触发，水渍只存在一瞬就退化成单个大圆。正解是让 mask 终值本身铺满，不做切换
- **`@keyframes` 只写 `to` 时 `from` 取底层值** ⇒ "收尾清 filter"的动画退化成 none→none 空操作，压不住前一条 `forwards`；正解是该属性单独一条动画、不设 `fill`
- **逐格 `filter: drop-shadow` = 每帧 N 次高斯模糊**：88 格让帧率从 60 掉到 34fps
- **正六边形铺砖**必须补出界格（`r`/`c` 从 -1 起），且 `h` 与行距不能取整，否则留空洞或相邻行互相压叠
- **变体类挂在容器自身**时，容器级规则要用 `.ys-deck.ys-anim-*`（无空格），后代写法静默不生效
- **3D 转场里改 `position`** 会让容器高度塌成 0、子页 `inset:0` 全塌（内容被顶到顶部溢出）
- **全屏尺度的 3D 立方体透视收益不足**：五轮迭代均被否决（"还是和横向滑动很像"），拆成"每格一个小立方体"反而成立 —— 单元尺度小，透视相对量才够

**修复**

- 目录页被误分段（片段标记范围过宽）
- 翻页时窗口内 DOM 末页透出闪现（用户报"以最后一页的谢谢观看作为过程动画，可是按顺序根本没到最后一页"）⇒ `ys-leaving` 机制（state 驱动，可见集合恰为 {旧页, 新页}）
- mask 类动画背景不参与（页面背景与容器同色 ⇒ mask 孔洞露出同色背景）
- 六角蜂巢铺砖空洞（奇数行左缘楔形 + 顶部三角未补格）；六角蜂巢的影是矩形 `box-shadow` ⇒ 每格外面勾出方角，整片看起来是一格格方块
- 卡片推换暗色主题下变白刺眼；白色 / 黑色舞台色按用户反馈去掉，回归主题背景色

**测试与门禁**

- 新增 `tests/slides.test.ts`（分页 / 版式推断 / 指令解析，46 条）与 `tests/slideTiles.test.ts`（瓷砖几何与时序，14 条）；`npm test` 改为 `node --test` 三文件
- 瓷砖几何的判据强调"不变量"：方块 / 竖条的**无缝覆盖**、六边形的**恰一覆盖**（射线法逐点判"恰在一个六边形内"—— 正是能抓住空洞 bug 的那条）、延迟模式的单调性
- `check-i18n --strict` 接入 `npm run build`：15 语言零缺失 + 占位符一致才允许构建
- 多语言独立交叉审计：15 语言 × 515 键，缺键 / 多余键 / 空值 / 占位符不符全部为 0

**其他**

- 版本号 0.3.1（五载体同步：`package.json` / `src-tauri/tauri.conf.json` / `src-tauri/Cargo.toml` / `src-tauri/Cargo.lock` / `package-lock.json`）
- `help.md` / `docs/slideshow-style-mapping.md` 更新动画双表格与片段说明；`src-tauri/` 镜像同步
- `skills/slides-outline.md` + `skills/skills.json` v4：AI 提炼策略改为"默认零标记，用户明确要求分段演示才加 front matter"

### 追加（2026-09-21）：切换动画平台分离 + 小格闪烁

**平台分离架构（本次追加的核心）**

- 用户要求**两平台各自独立**：Windows 冻结在最初方案（实测"已经很好了"），macOS 用修复后的方案。做法是把基础 CSS 恢复为最初 Windows 方案（`dd0827d` 原样），文件末尾新增**平台分离层** —— 所有 `.ys-mac` 前缀规则仅 macOS（WKWebView）生效
- 配置层新增 `TileConfig.mac?: Partial<TileConfig>` + `tileConfigFor(cfg, isMac)`：同一变体可让两平台走不同模式 / 格尺寸 / 时序（如棋盘 Windows=flip+192px、macOS=shimmer+96px）
- JS 层按平台决定构件：`needsShade = isMac && anim === 'blinds'`（Windows 的影本来就在 keyframes 里，不需要独立影层）

| 变体 | Windows | macOS |
| --- | --- | --- |
| 棋盘格子 | flip + 192px（原方案，未动） | shimmer + 96px 小格 |
| 六角蜂巢 | shimmer + 112px（与 macOS 统一） | shimmer + 112px |
| 百叶窗格 | flip + 120px 竖条（原方案，未动） | flip + 120px（仅 CSS 层：noshadow + 独立影层） |
| 百变立方 / 爆裂卡片 / 纵深穿梭 | flip 原样 | flip 原样（未改动） |
| 高斯溶解 | `@property` mask 原样 | 淡入降级 |

**小格闪烁（shimmer，新增动画模式）**

- 新增 `TileMode = 'shimmer' | 'flip'`。shimmer 下**每格是一块纯色贴片**（不克隆页面、不做 3D）⇒ 无左右异色、无方块、无克隆开销，旧方案"140 个整页克隆打爆 WebKit tile 缓存"的问题从设计上消失
- **随机同主题异色**：每格随机取 `--editor-surface` 或 `--editor-accent`（约 55% / 45%）；**轻微渐显**：峰值透明度随机 0.14~0.40；**随机延迟错开** ⇒ 网格逐片亮起又消退，整体呈闪烁感
- 新页由**真实页面自身淡入**承担（与旧页交叉溶解），格子只作闪烁层
- 蜂巢两平台统一用此效果（按用户要求同步到 Windows）；棋盘在 macOS 使用

**macOS（WebKit / Safari 15）修复**

- **翻面黑块**：`preserve-3d` 层内用 keyframes 动画 `box-shadow`，WebKit 强制逐帧重绘 face，重绘间隙 `backface-visibility: hidden` 判定失效 ⇒ 背面被画成不透明黑块（亮色主题尤其刺眼；Chromium 无此问题）。macOS 改为 card 只动 `transform` + 影交给独立 shade 层（本体透明、静态 `box-shadow`、随延迟淡入）
- **影全部消失（computed `box-shadow: none`）**：`--ys-flip-shadow` 用 `color-mix()` 派生，而 `color-mix()` 需 Safari 16.2+；旧引擎上该声明无效会让自定义属性变成 **guaranteed-invalid**，导致所有消费点的 `box-shadow` 整条失效。macOS 改静态 `rgba(31, 41, 55, 0.3)`
- **溶解完全失效**：原方案用 `@property --ys-blob` 驱动 12 层 mask 动画，`@property` 需 Safari 16.4+（macOS 13.3+）⇒ 旧系统属性注册失败、mask 恒为初始值。macOS 降级为整页淡入
- **"只见内容动、不见方块"**：face 背景与页面背景同色 ⇒ 给 tile 铺 `--editor-surface` 作实体底座
- **蜂巢"叠出正方形"**：tile 是【矩形】窗口，铺色后 card 缩小时露出矩形块 ⇒ macOS 的 hex tile 改透明，六边形轮廓由 `clip-path` 保证
- **亮色下百叶窗叶片翻转变黑**：`preserve-3d` 的 card 是独立合成层，WebKit 在重绘间隙可能让 `backface-visibility` 判定失效、或背面纹理尚未光栅化完成就被 GPU 采样 —— card 自身无背景时露出的就是未初始化的黑色纹理。macOS 给 card 铺主题背景色作保险丝（Windows 走原方案不受影响）。此修复此前存在，在把基础 CSS 恢复为 dd0827d 原版时被一并清掉，本次恢复

**本次追加踩坑（续号 21–26）**

- **同类挂同一元素 ⇒ 必须复合选择器**：`.ys-mac` 与 `.ys-anim-*` 都在 `.ys-deck` 上，但覆盖被写成后代形式 `.ys-mac .ys-anim-hex ...` ⇒ 同元素永不匹配，全部 macOS 覆盖成为死代码（连续八轮"修复"从未进入渲染）。**规则：同元素多类一律 `.a.b`（无空格）**
- **CSS 自定义属性没有"双声明回退"**：无效值（如旧引擎不认的 `color-mix()`）会让变量本身 guaranteed-invalid，`var()` 的整条属性失效。**正解是整条替换变量值**
- **平台隔离铁律**：用户要求"两平台各自独立"时，任何修复都必须落在 `.ys-mac` 门控内；写进基础规则就等于改了另一个平台（本版曾把棋盘 shimmer / 百叶窗回退 / 溶解降级全写进基础规则，Windows 一并被改，被用户发现并指出）
- **不要让用户盲测**：macOS 12 上 Playwright WebKit 不可用，但**系统 WKWebView 就是应用真实引擎** —— 用 `swiftc` + `WKSnapshotConfiguration` 离屏快照最小复现页，页面内 `window.__runDiag()` 由 Swift 侧 `evaluateJavaScript` 调用回传 `getComputedStyle`，一轮即定位"覆盖未生效 / 影为 none"；配合像素扫描器检测**水平直边**（尖顶六边形铺砖不应有水平边）量化验证：修复前 tile 行边界跳变 42–45%，修复后 ≤3.6%
- **复现页要内联整份 CSS**：正则抽取规则会因注释里的花括号错位而丢规则（丢的正是关键的 `.ys-mac` 覆盖），一度误判复现失真
- **影的可见性由绘制层级决定**：影挂 card 之外的平层会被相邻格 face 遮挡 + 合成层排序压制；挂 face 自身溢出部分仍被相邻 face 盖住、且 hex 的 `clip-path` 会裁掉自身 `box-shadow`；放大 shade 本体则会在 face 缩小时大面积露出。**影色本体绝不能比 face 更大或错位**

**测试**

- 62 条（`node --test` 四文件）；新增平台矩阵与 `tileConfigFor` 覆盖合并语义两条判据
- 单元数上限按模式分档：shimmer（每格一个纯色贴片）≤600，flip（每格 2 份整页克隆）≤160

## v0.3.0

> 注：**v0.2.5 曾提交代码但从未发布**（无安装包、官网也未更新），其改动实际是随 v0.3.0 一起发布的，故已并入本条目，不单独成篇。

**WebDAV 云端存储（新功能）**

- **侧边栏新增「云端」标签页**：浏览服务器目录树（懒加载、面包屑、刷新），支持新建文件夹 / 重命名 / 删除（二次确认，删文件夹明确提示内容一并删除）
- **打开云端文档**：正文 + 文档中相对引用的图片一并镜像到本地缓存；缺图只提示数量，不阻断打开
- **保存到云端**：本地文档输入路径上传（相对引用的图片一并上传、**保持目录结构不改写 Markdown**）；已是云端文档则默认填它自己的远程路径，回车存回原处，也可改路径另存
- **Ctrl+S 写回云端**：云端文档的保存与自动保存都走「先写本地镜像、再 PUT 服务器」，**两步都成功才标记已保存**
- **冲突检测**：打开时记 ETag，保存带 `If-Match`；远程被改过则弹窗让用户选「覆盖服务器版本」或「放弃本地修改并重新加载」，**绝不静默覆盖**
- **云端目录自动刷新**：保存到云端后若正浏览该目录，自动重拉列表（事件解耦，不把列表状态提升为全局）
- **凭据存系统凭据库**（Windows 凭据管理器 / macOS 钥匙串）：不落配置文件、不进 localStorage、**不经过前端 IPC 边界**；设置页有「测试连接」并给出可操作的中文失败原因

**架构：本地缓存镜像 + 显式远程身份**

- 远程文档落地到 `~/Documents/yizimarkdown/webdav/<host>-<hash>/` 镜像，`FileTab.filePath` 指向镜像文件，另挂 `remote: { path, etag }` 作远程身份 → 自动保存判据、DOCX 导出的图片基准目录、侧边栏文件树、状态栏**全部零改动复用**
- 镜像是**可丢弃的派生物**（打开时总是重新 GET，服务器为真相），远程身份才是持久化的那一份
- 对比「纯内存 + filePath=null」：后者要在自动保存门控、导出、目录推导、保存分支四处加远程分支，还会与「未命名文档」去重冲突，且 DOCX 导出静默丢图
- 新增 `src-tauri/src/webdav.rs`（协议层）+ `src-tauri/src/remote_cache.rs`（镜像路径运算 + 相对引用解析 + 图片双向同步 + 打开/保存编排），12 个命令全为 `async`
- `quick-xml` / `percent-encoding` 由传递依赖提升为直接依赖，**未引入新 crate 树**
- `ai_keystore` 的 `entry()` 泛化为通用账号名，AI 密钥与 WebDAV 凭据共用一套 `*_secret` 实现

**文件对话框死锁修复（macOS 实测）**

- **同步命令 + blocking 对话框 = 主线程死锁**：`save_file_dialog` / `pick_and_read_file` / `pick_image_file` 是同步 Tauri 命令（运行在主线程），其内部 `blocking_save_file` / `blocking_pick_file` 会 `recv()` 阻塞主线程 → macOS 上保存面板一弹出就冻结、全应用转圈无法保存，**另存为 / 导出 DOCX / 导出 PDF / 插入图片 / 打开文件全部受影响**；改为 **async 命令 + `tauri::async_runtime::spawn_blocking`**，让对话框跑在阻塞线程池
- 与 v0.2.4 的 `export_pdf` 主线程死锁**同源**（同步命令里做阻塞等待），属同一类错误

**DOCX 导出字体降级机制**

- **新增 `word/fontTable.xml`**：为所用字体声明 `w:altName` 替代名链——正文 `Microsoft YaHei → PingFang SC → Noto Sans SC → Segoe UI → Arial`；等宽 `Cascadia Mono → Consolas → Courier New → DejaVu Sans Mono`；项目符号 `Wingdings → Segoe UI Symbol → Arial Unicode MS`；并按 `is_cjk_family()` 写 `w:charset`（86/00/02）、`w:family`、`w:pitch`，子元素顺序遵循 ECMA-376 `CT_Font`
- **接线**：`[Content_Types].xml` 加 Override + `document.xml.rels` 加 `rIdFontTable` + 打包 `word/fontTable.xml`（部件数 6 → 7）
- **`first_family()` 重写**：修两个缺陷——原实现取 CSS 栈里「第一个**带引号**的族」而非第一个族（`system-ui, 'MiSans'` 错取成 MiSans、`Inter, 'Microsoft YaHei'` 错取成微软雅黑）；且会把 `system-ui` / `sans-serif` 这类**非字体名**原样写进 `w:rFonts` → 新增引号感知切分 `split_font_stack()` + 关键字映射 `css_generic_to_font()`（→ `Microsoft YaHei` / `SimSun` / `Consolas`），空栈兜底 `Microsoft YaHei`
- **补齐脚本字体属性**：CodeBlock 样式与 `run()`/`code_run()` 的 mono 分支补 `w:eastAsia`，标题补 `w:cs`（默认 body==mono==MiSans 时是 no-op）
- **装有该字体时输出不变**：`w:altName` 只在主名称找不到时被读取 → 已装 MiSans 的机器导出结果与之前一致（已验证：样本 docx 里 `w:rFonts` 只出现 MiSans / Consolas，无任何替换名）

**踩坑记录（重点）**

1. **Tauri 参数名 camelCase ↔ snake_case 对不上只在运行时炸**：Rust 的 `remote_path` 要求前端传 `remotePath`，写成 `path` 时 **TS 拦不住**（invoke 参数无类型）、**Rust 单测也拦不住**（直接调函数、不过 IPC 边界），只在用户点「保存到云端」时抛 `missing required key` → 新增 `scripts/check-tauri-args.mjs` 静态比对两侧参数名并接入 build。**跨语言边界的契约要么有静态检查，要么就会在用户手里炸**
2. **WebDAV 不会隐式创建目录**：PUT 到不存在的目录返回 409 → 上传图片到 `images/`、或另存到多层新路径时直接失败 → 上传前逐级 MKCOL（已存在 405 视为成功）。**这个 bug 是接真实服务器（wsgidav）跑集成测试才发现的 —— 单测永远测不到，因为那是服务端行为**
3. **服务器返回的 href 带结尾斜杠**：集合 URL 必须以 `/` 结尾，故目录路径是 `/Notes/`，而 `parentPath()` 算出的是 `/Notes` —— **语义相同但字符串不相等**，直接比较会让自动刷新静默失效 → 新增 `normalizeRemotePath()` 统一用于路径比较
4. **朴素拼接路径产生双斜杠**：`` `${dir}/${name}` `` 在 dir 带尾斜杠时得到 `/Notes//doc.md`；服务器会折叠空段，文件落在 `/Notes/doc.md`，于是 tab 记的远程身份与云端列表不一致 → 去重失败、**重复开 tab**。**这是「路径未规范化」第二次咬人**，因此补了带回归测试的路径工具模块
5. **quick-xml 把 XML 实体作为独立事件**：`a&amp;b.md` 是 `Text("a")` + `GeneralRef("amp")` + `Text("b.md")` 三个事件，逐段**赋值**只剩最后一段（解析成 `b.md`）→ 必须**累积**并单独解析实体
6. **PROPFIND 属性可能跨 propstat 拆分**：Apache mod_dav 会把命中/未命中的属性拆到 200 与 404 两个 `<propstat>`，只读第一个会丢 `<resourcetype>` → **把目录误判成文件**；正确做法是按 `<response>` 合并、不关心 propstat 边界
7. **保存 ≠ 关闭**：实现「另存到云端」时套用「新建 tab + 关掉原 tab」，当目标就是该文档自己的远程路径时新建逻辑命中同一个 tab、紧接着被关掉 → 保存成功、文档消失（用户直接指出「保存操作不代表用户想关闭」）→ 改为**就地更新** tab。**把「转换身份」实现成「关掉再新建」是错的，即使最终状态看起来一样 —— 用户可见副作用（文档消失、滚动位置与撤销历史丢失）完全不同**
8. **静态检查脚本自己也会有 bug**：i18n 检查器最初只认单引号值，把 `en.ts` 里用双引号写的 `discard: "Don't Save"` 误判成「英文缺失」，差点去修一个不存在的 bug。**工具的输出也要先验证再行动 —— 尤其当它说某处有问题时，先读一眼原文**
9. **`w:altName` 在 WPS 下不被采纳**：按 ISO/IEC 29500-1 声明替代名链后，**WPS 打开仍提示「没有字体」并要求手动替换**，没有降级为微软雅黑——规范原文用的是 "should"（建议）而非强制 → **教训：规范里存在某机制 ≠ 实现会使用；投入前必须先让用户用探针实测**。WPS（国内主力环境）真正需要的是「字体内嵌」，本次未做（体积 / 字形子集化 / 字体授权待定）
10. **本机装了字体就测不出降级**：主名称命中时 `altName` 不会被读取 → 降级路径在开发机上永远不触发 → 必须另造一份**使用不存在字体名**的探针 docx（已固化为 `#[ignore]` 测试 `write_font_fallback_probe`，产出 `target/font-fallback-probe.docx`）
11. **同步命令里调 blocking 对话框 = 主线程死锁**（macOS 实测）：保存面板弹出即冻结、全应用转圈；`blocking_save_file` / `blocking_pick_file` 内部 `recv()` 阻塞主线程 → async 命令 + `spawn_blocking`
12. **CSS 通用族不是字体名**：`system-ui` / `-apple-system` / `BlinkMacSystemFont` / `sans-serif` / `serif` / `monospace` 原样进 `w:rFonts` 会被当成缺失字体 → 必须先映射为具体字体名

**Bug 修复**

- **重复打开同一云端文档会多开 tab**：按规范化路径去重（见踩坑 3、4）
- **保存到云端后文档被关闭**：改为就地转换 tab（见踩坑 7）
- **「保存到原处」被误报「文件已存在」**：原来一律用 `If-None-Match: *`（新建语义），对已存在文件会被判 412 → 按目标是否等于当前远程路径区分更新（`If-Match`，带冲突检测）与新建
- **在云端列表点开已打开且未保存的文档会丢编辑**：原无条件用服务器内容覆盖 → 现在只有本地无未保存修改时才覆盖，冲突弹窗的「放弃本地修改并重新加载」才强制覆盖
- **自动保存失败却显示「已保存」**：原自动保存用吞错误的调用且不 await 就无条件 `markAsSaved()` → 离线或 401 时显示已保存但实际没写成功。三处保存入口（Ctrl+S / 自动保存 / 另存为）收敛到同一实现，失败一律保持未保存并提示
- **另存为写盘失败被静默吞掉**：改用会抛错的调用并提示原因
- **文件大小提示文案错误**：云端文件悬停显示「N 项」配字节数，改为 `1.2 MB`
- **文件对话框主线程死锁（macOS 实测）**：`save_file_dialog` / `pick_and_read_file` / `pick_image_file` 原为同步命令，其内部 blocking 对话框调用会阻塞主线程 → 保存面板弹出即冻结，**另存为 / 导出 DOCX / 导出 PDF / 插入图片 / 打开文件全部受影响**；改为 async + `spawn_blocking`（见踩坑 11）
- **DOCX 字体名提取错误**：原实现取 CSS font-family 栈中「第一个**带引号**的族」而非第一个族（`system-ui, 'MiSans'` 会错取成 MiSans；`Inter, 'Microsoft YaHei'` 会错取成微软雅黑）→ 改为引号感知切分后取第一个族
- **DOCX 把 CSS 关键字当字体名**：`system-ui` / `-apple-system` / `sans-serif` / `serif` / `monospace` 等被原样写进 `w:rFonts`，会被阅读器当作「缺失字体」触发替换 → 映射为具体字体（`Microsoft YaHei` / `SimSun` / `Consolas`）
- **DOCX 代码块与标题的脚本字体缺失**：CodeBlock 样式与行内代码 run 未声明 `w:eastAsia`、标题未声明 `w:cs` → 补齐（默认配置下为 no-op，仅当源码字体与预览字体不同才生效）

**安全边界**

- **绝不上传用户本地文件**：图片只同步「相对路径」；绝对路径（`/…`、盘符）、`file://`、`data:`、`http(s)://` 一律跳过
- **路径穿越防护**：`..` 越出根目录一律拒绝，且本地与远程两侧允许层数**完全对称**（以远程文档目录层级为准）
- 远程文件名落地本地做**可逆**转义（Windows 非法字符、保留设备名、结尾点/空格），并用测试证明不同远程路径不会撞到同一个本地文件

**技术改进 / 测试**

- Rust 单测 **57 项通过**（新增 webdav 17 + remote_cache 14），dev 构建零警告
- 新增 `#[ignore]` 真实服务器集成测试：MKCOL → PUT → PROPFIND → GET → **过期 ETag 断言 412** → MOVE → DELETE；用 `wsgidav` 验证，覆盖匿名与 Basic 认证，并验证错误密码时的可读提示
- 前端新增 `tests/remotePath.test.ts`（**12 项**，`npm test`），含两条针对重复 tab bug 的回归测试
- 新增 `scripts/check-tauri-args.mjs`（18 个调用）与 `scripts/check-i18n.mjs`（498 键 × 15 语言，含**占位符一致性硬校验**），两者均接入 `npm run build`
- 测试放在 `tests/` 而非 `src/`：Vite 监视 `src/` 并对其中的文件变更触发页面重载，测试文件放里面会无谓打断热更新
- 15 种语言同步新增 62 个云端字符串；**顺带补齐历史欠账**（11 种语言各 11 键 + 西语另 15 键），15 种语言现已 **100% 完整**，`npm run check:i18n:strict` 零缺失并接入构建卡口；清掉 8 个已无引用的死键
- 手写 OOXML 部件 6 → 7（新增 `word/fontTable.xml`）：`content_types()` 加 Override、`doc_rels` 加 `fontTable` 关系；fontTable 以字体名为键，等宽与正文同名时跳过重复条目
- 单测从 27 项扩到 **57 项**（新增 webdav 17 + remote_cache 14 + 路径工具 12 项前端单测）；dev 构建零警告
- 新增 `scripts/make-portable.ps1` 组装便携版：**打包读的是 `src-tauri/` 下的文档副本**（`bundle.resources` 路径相对 `src-tauri/`），脚本先同步根目录文档并校验哈希，再校验 exe 版本号与 `tauri.conf.json` 一致，避免把旧文档或旧 exe 打进安装包

**其他**

- 官网：新增 WebDAV 功能卡片，hero 徽标 / JSON-LD / 三个下载链接一并升到 v0.3.0，更新日志面板补上 v0.3.0（v0.2.5 从未发布，其内容并入 v0.3.0 条目）；help.html 新增云端章节与 3 条 FAQ，设置分类由 8 个更正为 9 个
- 文档：根 README + 15 个本地化 README 新增云端章节；help.md 新增完整云端章节 + 5 条 FAQ；welcome.md 新增云端引导
- 与本次无关的既有缺陷（建议单独立项）：PDF 导出的 HTML 构建函数只依赖主题与明暗两个依赖项、且从预览 DOM 取内容，故 PDF 导出本就忽略图片的 data URL 替换

## v0.2.4

**光标可见性优化**

- **主题色 I-beam 光标**：编辑区鼠标竖线跟随当前主题色（动态 SVG，明暗适配描边），提供「纤细（原生样式）/ 加粗（高可见度）」两档
- **块状插入光标**：加粗档下插入光标为主题色半透明块，输入位置一目了然
- **点击涟漪反馈**：编辑区点击扩散 1px 细线三圈涟漪（默认开启）
- **全站主题色箭头**：非编辑区基础光标改为主题色箭头，文本输入/链接/按钮语义不变
- **设置项**：设置 → 编辑器 → 光标（样式选择 + 涟漪开关）

**导出 DOCX / PDF / HTML**

- **DOCX**：Rust 后端生成（pulldown-cmark → 手写 OOXML），Word 原生语义（标题/列表/表格/代码块/引用/任务列表），主题色跟随；本地图片按路径嵌入、网络图片（png/jpg/gif/bmp/webp）自动下载嵌入、按原图比例排版
- **PDF**：WebView2 `PrintToPdf` 静默打印，隐藏窗口 + 自定义协议加载纯文档 HTML，与预览还原度一致，支持多页分页
- **HTML**：导出为自包含文档，内联主题/KaTeX/用户 CSS，与预览显示一致
- **本地图片渲染修复**：markdown-it 将 Windows 路径反斜杠编码为 `%5C` 导致本地图不显示 → 解析入口还原编码

**标题折叠（Obsidian 风格）**

- **H 层级标签替代三角符号**：折叠指示器改为 `H1`–`H6` 层级标签（药丸形），悬停标题行显示，点击折叠，折叠后常显并以主题色高亮
- **滚动锁定**：折叠标签绝对定位浮层跟随标题滚动（scrollDOM 监听 + rAF 节流重定位），滚出视口跟随滚走、滚回自动恢复

**窗口边框跟随主题（Windows 11）**

- 无边框窗口被 Windows DWM 画的 1px 强调色外框（本机默认 `#0078D4`，系统强调色而非应用代码）改为跟随当前主题背景色：`DwmSetWindowAttribute` + `DWMWA_BORDER_COLOR`，主题/明暗切换同步；Win10 自动忽略

**DOCX 排版还原度增强**

- **嵌套列表修复**：`- 外层` + `  - 内层` 不再塌陷成同一段落，嵌套列表独立成段、层级正确（行内渲染曾吞掉块级起始）
- **多级列表**：numbering 扩到三级（有序 `1. / 1.2. / 1.2.3.`，无序 `• / ◦ / ▪`），`ilvl` 随嵌套深度
- **bullet 字体回退**：无序符号加 Symbol 字体（Word/pandoc 标准），避免字体缺失时显示方框
- **加粗/斜体**：补充 `<w:bCs/>` / `<w:iCs/>` complex-script 变体

**设置面板整体优化**

- **全即时生效**：通用/编辑器移除「保存」按钮，所有设置改动即生效并自动持久化（zustand persist）；AI 面板 model/baseUrl/prompt 由 onBlur 改为即时保存；「恢复默认」即时生效；快捷键面板保留保存式（写 keybindings.json + 冲突校验）
- **布局统一**：各设置页左列固定 160px、右侧控件（下拉/滑条/输入框）等宽对齐（将 AI 页的固定列布局泛化为全面板规则）
- **配置目录双项显示**：通用设置显示「程序运行位置」与「用户配置存储位置」（`~/Documents/yizimarkdown/`，新增 Rust `get_user_config_dir`）
- **涟漪反馈默认勾选**：persist 升至 v3 对存量存档强制默认开启；修复「恢复默认」后涟漪被取消的问题（DEFAULTS_EDITOR 漏改）

**图标可识别性优化**

- **新建文档 / 从模板新建分工**：新建 `FilePlus2`、从模板新建 `LayoutTemplate`，不再混淆
- **导出主按钮**：`FileUp` → `Download`（导出语义清晰）
- **导出菜单格式徽标**：5 种格式改为无衬线大字字母（H / M / T / W / P，SVG text 19px@24 视口、weight 800、currentColor 跟随主题），小尺寸可读性优先
- **TXT 文案**：「导出为纯文本」→「导出 TXT 纯文本」（15 语言）

**本地图片**

- **支持 `file:///D:\...` 形式**：图片解析入口兼容 file:/// 前缀路径（浏览器禁止直接加载，转为 Tauri 读取）

**DOCX 列表与表格还原（用户实测反馈驱动）**

- **列表项加粗开头修复**：无序/有序列表项以 `**加粗小标题**` 开头时整项内容丢失（只剩一个空项目符号）——紧凑列表项没有 `Paragraph` 包裹，`Tag::Item` 分发把内联起始标签当块级事件消费后丢弃，事件流错位后 `End(Strong)` 又被误当 `End(Item)` 提前终止；改为子事件先分类（EndItem/Para/Inline/Block/Other）再分发，内联起始交行内渲染
- **松散列表续段修复**：列表项第 2 段起退回 `Normal` 样式（丢失列表缩进）、后续列表项丢编号——`render_inlines` 的 level=0 不消费配对 `End(Paragraph)`，外层把 `End(Paragraph)` 误当 `End(Item)`/`End(List)`；改为「谁消费 Start 谁消费配对 End」，Item/List/BlockQuote 只认自己的闭合标签
- **续段与空项**：续段用 `ListParagraph` + `w:ind left=(ilvl+1)*720` 对齐文本；空列表项保留编号/项目符号
- **表格对齐预览样式**：整表 100% 宽、网格线用主题 `--editor-border`（原硬编码灰 `BFBFBF`）、表头行主题 `--editor-surface` 底色 + 加粗 + 跨页重复（`w:tblHeader`）、单元格紧凑间距（覆盖 Normal 的段后距/行距）+ 顶对齐、支持 GFM 列对齐（`:--:` → `w:jc`）

**DOCX 图片增强**

- **HTML `<img>` 标签支持**：块级 `<img src="...">` 与行内嵌在段落里的 `<img>` 都能嵌入（此前行内 HTML 被直接丢弃、块级被当纯文本把标签打进文档）；图片与文字混排的 HTML 块会保留文字，不丢内容
- **`width` 属性生效**：`width="600"` / `600px` / `300pt` / `50%` 决定导出宽度；按预览语义**忽略 `height`**（预览 CSS 的 `height:auto` 会覆盖 HTML 高度属性），因此始终保留宽高比、不会拉变形
- **网络图修复**：不再依赖 URL 扩展名（无扩展名/带缩放参数的图床 URL 此前被直接跳过）、支持引用式 `![a][id]`、按响应内容魔数判定类型（避免把 403/404 的 HTML 当图片嵌入）、带浏览器 UA 规避 403、失败写日志不再静默丢图

**文档模板持久化**

- **模板迁移到用户目录**：模板从安装目录迁至 `~/Documents/yizimarkdown/templates/`（与 v0.2.3 技能同理），卸载/重装/升级都不丢，也不再受安装目录无写权限限制
- **启动自动同步**：内置模板在首次启动或应用版本变化时同步到用户目录，**只补缺失、绝不覆盖**用户已有/已改的模板；用 `templates.json` 记录已同步版本，用户删掉的内置模板不会被反复塞回
- **模板面板改写**：设置 → 模板 的新建/编辑改走新增的 `write_template` 命令写入用户目录（此前直接拼安装目录路径）
- **菜单即时刷新**：工具栏「从模板新建」在每次打开菜单时重新读取列表，设置里新建模板后无需重启即可使用

**踩坑记录（重点）**

1. **`invokeTauri` 静默吞错**：命令 Err 被吞导致"假成功" toast → 导出改用 `invokeTauriOrThrow` 如实报错
2. **同步命令 + `recv_timeout` 主线程死锁**：`export_pdf` 同步命令阻塞主线程 30s、UI 冻结 → 改 async 命令 + tokio oneshot + timeout
3. **wry 不支持 data URL 导航**：`WebviewWindowBuilder` 加载 data URL 页面永不加载 → 改用 tauri 自定义协议
4. **PrintToPdf 提交后立即关窗**：打印被取消、回调永不触发 → 回调内关窗 + 超时兜底
5. **`html,body{overflow:hidden}` 锁死打印视口**：PDF 只出一页 / HTML 无法滚动 → 导出样式解除锁定
6. **serde camelCase/snake_case 不匹配**：`monoFont` vs `mono_font` → `#[serde(rename_all = "camelCase")]`
7. **`PrintToPdf` 在 `ICoreWebView2_7`**：版本化接口需 `cast`；tokio `oneshot::Sender` 不可 Clone → `Arc<Mutex<Option<_>>>`
8. **CM6 `update()` 中同步调用 `coordsAtPos` 导致插件崩溃**：折叠指示器定位在 update 事务里测坐标 → `CodeMirror plugin crashed` 插件被禁用、标签滚动冻住 → 全部定位延迟到 `requestAnimationFrame`
9. **DOCX 嵌套列表塌陷**：行内渲染吞掉块级起始，内层项与外层项并成一段 → peek 边界检测 + level 区分 End 归属，docx-preview 真实渲染验证
10. **1px 系统边框是 Windows 强调色**：无边框窗口被 DWM 画 1px 强调色边框（AccentColor=#0078D4），与应用无关 → DWMWA_BORDER_COLOR 染色跟随主题
11. **设置面板保存式/即时式混存**：通用/编辑器要「保存」、外观/实时即时、AI 用 onBlur，且 persist 已自动持久化、「保存」冗余 → 全面板改即时生效，仅保留有副作用的操作（快捷键/API Key/CSS/模板）
12. **设置布局左列不定宽**：`max-width:55%` 只限上限，右列控件宽度随 label 长短变化 → 固定左列 160px（泛化 AI 页规则），Playwright 实测各页控件等宽
13. **SVG text 字母小字号发糊**：字母徽标手绘 path 几何不标准、text 字号过小发糊 → 改用无衬线字体大字（19px@24、weight 800、明确字体族）
14. **涟漪「恢复默认」漏改**：store 默认值已改 true，但 DEFAULTS_EDITOR 仍 false，点恢复默认后涟漪被取消 → 同步为 true + persist v3 强制存量开启
15. **配置目录语义错误**：显示的是程序运行目录（appDir），用户配置实际存于 `~/Documents/yizimarkdown/` → 新增 `get_user_config_dir` 并双项显示
16. **紧凑列表项没有 `Paragraph` 包裹**：`- **加粗小标题** 正常文本` 的行内事件直挂在 `Item` 之下，`Tag::Item` 分发却把 `Start(Strong)` 当块级事件消费后丢弃（`render_block_event` 对内联标签无匹配臂）→ 加粗内容消失、事件流错位、`End(Strong)` 被误当 `End(Item)`、整项内容被吞掉 → 子事件先分类再分发，内联起始不消费
17. **`render_inlines` 的 level=0 不消费配对 `End` 反噬外层**：消费 `Start(Paragraph)` 后 `End(Paragraph)` 残留，外层误把它当 `End(Item)`/`End(List)` → 松散列表续段退成 `Normal`、后续列表项丢编号 → 「谁消费 Start 谁消费配对 End」+ 闭合标签精确匹配（`End(TagEnd::Item)`）
18. **网络图被扩展名白名单拦在门外**：`download_md_images` 先按 URL 扩展名判断是否下载，而大量图床/CDN 的 URL 无扩展名或带缩放参数（实测 unsplash `?w=800` 返回 `image/jpeg`）→ 根本不发请求、导出无图 → 改为解析器采集 URL + 按响应内容魔数判定类型 + 浏览器 UA + 状态码校验
19. **行内 HTML 图片被静默丢弃**：`render_inlines` 没有 `Event::InlineHtml` 分支（行内 `<img>` 直接消失），块级 `Event::Html` 则把标签当纯文本写进文档 → 两处都接上图片渲染，并按预览语义处理 `width`
20. **CSS 颜色 ≠ OOXML 颜色**：OOXML 只接受 6 位 hex，而主题变量格式不一（`rgba()`、`#rgb`、**不带 `#` 的裸 hex**）→ 颜色归一化最初只认带 `#` 的形式，导致 `border`/`surface` 整套静默回退默认灰（被单测抓到）
21. **文档模板写在安装目录**：设置 → 模板 的新建/编辑直接把路径拼成 `${appDir}\templates\...` 写安装目录 → 卸载/重装即丢失，装在 Program Files 时还可能无写权限 → 迁到用户文档目录 + 新增 `write_template` 命令
22. **常驻组件的文件列表会过期**：`Toolbar` 常驻挂载，模板列表只在挂载时读一次 → 设置里新建模板后菜单要重启才显示 → 改为「打开菜单时重新读取」

**技术改进**

- `themeCursor.ts` 统一生成三档主题色光标，MutationObserver 监听主题 CSS 异步注入重算
- 新增 Rust 依赖：`pulldown-cmark`、`zip`、`webview2-com`、`windows-core`（安装包增量约 1MB）
- `DocxTheme` 新增 `border` / `surface` 主题字段（前端传 `--editor-border` / `--editor-surface`）+ `css_color_to_hex` 把 `#rgb` / 裸 hex / `rgb()` / `rgba()`（alpha 按白底合成）统一成 OOXML 6 位 hex
- 远程图改为两段式：「解析器采集图片 URL → 下载为 `RemoteImages` 映射 → 生成器按 `dest_url` 查表嵌入」，一套逻辑覆盖行内式/引用式/HTML 标签三种写法，且与生成器解析结果逐字一致
- 模板同步：`copy_missing` 递归复制（含模板内 `images/` 相对图片目录）+ `templates.json` 版本门控；`get_dev_project_root()` 统一 dev 资源定位（兼容 `target/debug/deps` 的测试二进制），skills 的 3 处 dev fallback 一并复用
- 单测扩到 22 项：表格保真（边框色/表头底色/跨页重复/列对齐/紧凑间距）、HTML 图片（块级/行内/混排）、`width` 尺寸与宽高比、颜色归一化、模板同步端到端（播种/不覆盖/升级不覆盖/路径穿越）
- 手写 PNG/JPEG/GIF/BMP/WebP 头部尺寸解析，零新依赖，DOCX 图片按比例嵌入
- 单测：DOCX 生成、serde 契约、图片头解析、本地图端到端嵌入、嵌套列表层级
- 折叠滚动锁定与 DOCX 排版用 Playwright + Edge / docx-preview 真实浏览器验证（加粗 fontWeight 700、嵌套拆段）

## v0.2.3

**划词助手 + AI 深度集成**

- **划词浮动工具栏**：源码编辑器和预览模式中选中文本后，选区上方显示浮动操作栏（左对齐），提供 6 个操作按钮（演示稿、摘要、改写、翻译、复制、添加到 AI 对话）
- **CM6 扩展**：CodeMirror 6 ViewPlugin 监听选区变化，锚点锁定避免拖拽时工具栏跟随移动；`requestAnimationFrame` 延迟读取坐标避免 `readMeasured` 崩溃
- **预览模式支持**：通过 `selectionchange` 事件委托，在 preview 和 split 模式下也能触发划词工具栏
- **划词 + 技能联动**：从划词工具栏触发技能时，输入区同时显示文本胶囊（📄）和技能胶囊（⚡），AI 只处理选中文本而非全文；`fromSelection` 模式跳过全文注入，用户消息标注"请直接对以下选中文本执行操作"
- **文本胶囊 hover 预览**：hover 文本胶囊时显示完整内容预览卡片（`position: fixed`，最大 200 字 + 省略号），用 `Map<string, string>` + 唯一 CSS class ID 存储完整文本
- **多 AI 供应商**：新增小米 MiMo（`mimo`，默认模型 `mimo-v2.5`）和美团 LongCat（`longcat`，默认模型 `LongCat-2.0`），i18n 覆盖全部 15 种语言
- **技能存储迁移**：技能文件迁移至 `~/Documents/yizimarkdown/skills/`，启动时自动同步内置技能；新增 `skill-guide.md` 定制指南，AI 面板底部"管理技能"按钮直接打开
- **AI 面板状态持久化**：`aiPanelOpen` 和 `aiPendingAction` 持久化到 settings store

**划词工具栏主题适配**

- **专属 CSS 变量**：每个主题定义 `--sel-toolbar-bg` / `--sel-toolbar-text` / `--sel-toolbar-border` / `--sel-toolbar-hover` / `--sel-toolbar-accent`，暗色模式不覆盖，工具栏始终亮色
- **两套主题文件同步**：`src/assets/themes/` 和 `src-tauri/themes/` 同步更新
- **顶部工具栏恢复主题适配**：`.toolbar` 背景改用 `--editor-surface`，正确跟随明暗切换

**踩坑记录（重点）**

1. **contentEditable 剥离 `data-*` 属性**：`dataset.fullText` 被浏览器静默移除 → 改用 `Map<string, string>` + CSS class ID
2. **contentEditable DOM 重建致 WeakMap 引用失效**：`appendChild` 进 contentEditable 后浏览器重建 DOM 树，原始元素引用不再匹配 → 改用字符串 key 的 Map
3. **CM6 `coordsAtPos` update 阶段崩溃**：`readMeasured` 不能在 update 事务中调用 → `requestAnimationFrame` 延迟
4. **Portal 脱离主题容器**：`createPortal` 到 `document.body` 后暗色模式覆盖 CSS 变量 → 主题专属 `--toolbar-*` 变量，暗色模式不覆盖
5. **两套主题文件不同步**：`src/assets/themes/` vs `src-tauri/themes/` 运行时只加载后者 → 必须同步修改
6. **foldGutter 挤压标题文字**：`foldGutter()` 永久占据 gutter 空间 → 改用绝对定位 ViewPlugin
7. **Decoration.widget 挤压标题文字**：widget 在内容流中占空间 → 改用 `position: absolute` 脱离文档流
8. **`--toolbar-*` 变量名冲突**：划词工具栏和顶部工具栏共用 `--toolbar-*` 变量，暗色模式下顶部工具栏也被锁定亮色 → 划词工具栏改用 `--sel-toolbar-*` 专属变量
9. **PowerShell `Set-Content` 破坏 UTF-8 编码**：批量重命名 CSS 变量时 `Set-Content` 默认用系统 ANSI 编码写回，中文注释变乱码 → 改用 `[System.IO.File]::WriteAllBytes` + `Encoding.UTF8`

**标题折叠（Obsidian 风格）**

- **hover 三角图标**：鼠标 hover 到标题行时，标题左侧出现 `▸` 折叠图标，移开隐藏；已折叠标题常显 `▾` 图标
- **绝对定位浮层**：`coordsAtPos` 计算标题文字实际位置，定位在标题左侧，不插入内容区，不挤压标题文字
- **折叠范围**：从当前标题到下一个同级或更高级标题；快捷键 `Ctrl+Shift+[` / `Ctrl+Shift+]`
- **新增 `cm-heading-fold.ts`**：自定义 ViewPlugin，用绝对定位 `div` 替代 `Decoration.widget`，避免 DOM 拆入内容区

**实时模式分割线修复**

- **修复 `---` 分割线**：`cm-live-render.ts` 新增 `HorizontalRule` 节点处理，隐藏原文 + `border-top` 水平线样式

## v0.2.2

**工具栏交互重构**

- **悬浮菜单全面改造**：导出菜单、表格选格器、代码块菜单、模板菜单由点击展开改为鼠标悬浮展开（100ms 延迟防抖），移除全屏遮罩层，交互更流畅
- **格式工具栏折叠**：窗口宽度 < 900px 时自动折叠格式工具栏；新增展开/收起按钮（ChevronsLeft/ChevronsRight 图标），支持手动切换；`expandFormat`/`collapseFormat` 翻译覆盖全部 15 种语言

**链接/图片对话框**

- **通用对话框组件**：新增 `Dialog.tsx` 模态容器，统一背景遮罩、居中弹窗、ESC 关闭
- **链接插入对话框**：`LinkModal.tsx`，工具栏链接按钮改为打开对话框（输入 URL + 文本）
- **图片插入对话框**：`ImageModal.tsx`，支持网络 URL 和本地文件两种方式；本地文件通过 Tauri 原生文件选择器（`pick_image_file` 命令），非 Tauri 环境自动降级为浏览器 `<input type="file">`
- **对话框 i18n**：`dialog.*` 命名空间（标题、按钮、占位符、提示文字）翻译覆盖全部 15 种语言

**AI 功能增强**

- **上下文轮数配置**：设置 → AI → 上下文轮数（0/1/2/3/5/10/20，默认 3），控制引用文档时发送的历史对话轮数；翻译覆盖全部 15 种语言
- **供应商名称 i18n**：`ProviderConfig` 新增 `i18nKey` 字段，设置面板和聊天面板均显示本地化供应商名称；17 个 `provider*` 翻译键覆盖全部 15 种语言
- **供应商配置缓存**：切换供应商时自动保存当前配置（模型、Base URL、协议格式），切回时自动恢复，避免重复填写
- **聊天提示 i18n**：输入框下方提示文字 `Enter 发送 · Shift+Enter 换行` 改为 `t('ai.hint')` 调用，翻译覆盖全部 15 种语言

**代码块增强**

- **语法高亮**：集成 highlight.js，预览/并排/实时模式下代码块自动语法着色
- **代码块头部**：左上角显示语言标签，右上角新增复制按钮和自动换行切换按钮
- **复制到剪贴板**：一键复制代码块内容
- **代码块内光标定位**：插入代码块后光标自动定位到代码区域内（第 4 个字符处）

**演示模式改进**

- **退出按钮**：鼠标活动时右上角显示半透明退出按钮（含 X 图标 + 文字），1.5 秒无操作自动隐藏
- **窗口状态还原**：进入演示前记录窗口状态（全屏/最大化），退出时自动还原到之前的窗口状态
- **Frontmatter 过滤**：预览/并排/实时模式下自动过滤 YAML frontmatter（`---...---`），不再显示原始 YAML 内容

**主题与样式优化**

- **Liquid Glass 主题增强**：玻璃效果透明度提升（背景 40%→60%，边框 12%→25%），新增内发光和阴影层次；菜单不透明度提升至 96%（不再半透明）；工具栏移除 `backdrop-filter` 避免下拉菜单被遮挡
- **标签栏分隔线**：非首个标签左侧添加 1px 分隔线，视觉区分相邻标签
- **AI 聊天面板可调宽度**：拖拽左边缘调整宽度（默认 380px，最小 280px，最大 min(600px, 40% 窗口宽度)），宽度设置持久化

**AI 技能列表 UX**

- **悬浮介绍面板**：技能菜单中 hover 技能名称时，右侧弹出固定定位的详细介绍面板（不再替换摘要行）
- **颜色区分**：技能名称使用 `sidebar-text`（次要色），摘要和描述使用 `editor-text`（主色），层次更清晰

**AI 消息结构修复**

- **修复 AI 上下文注入顺序**：技能提示词和文档上下文 system 消息从「对话历史之前」移到「对话历史之后、当前用户消息之前」，确保 AI 按时间顺序理解对话；技能用户消息增加技能名称标注（`【已选择技能：xxx - 摘要】`）
- **修复已安装版本技能加载失败**：`tauri.conf.json` 资源映射由 glob `skills/*` 改为目录 `skills`，确保打包后技能文件完整；Rust 后端新增 dev-mode 路径回退
- **修复 AI 思考内容不显示流式效果**：思考区块在流式传输期间自动展开，内容后显示脉冲光标；正文区光标在流式传输期间始终显示（不再仅在空内容时显示）
- **修复 AI 思考内容自动滚动**：思考区块流式传输期间移除内部 `max-h` 限制，由聊天容器统一滚动，确保持续自动滚到底部；思考内容命名统一为「深度思考」（15 种语言）
- **Frontmatter 前导空行容错**：`---` 前允许空白行，Frontmatter 解析和预览过滤不再因空行失效
- **发送后清空技能标签**：消息发送后自动移除输入区的技能 tag 并重置技能状态

**其他修复与优化**

- **应用图标更新**：`app-icon.png` 替换为最新版设计
- **README 恢复**：从 GitHub 仓库重新拉取完整 README.md
- **文档 i18n 补全**：`toolbar.codeBlock` 翻译覆盖全部 15 种语言

## v0.2.1

**多语言国际化（i18n）**

- **15 种界面语言**：简体中文（默认）、繁體中文、English、日本語、한국어、Deutsch、Français、Español、Português、Italiano、Polski、Nederlands、Türkçe、Svenska、Українська
- **轻量 i18n 引擎**（无第三方库）：`src/i18n/` 语言字典 + `useI18n()` hook，缺失词条自动回退英文
- **语言切换**：设置 → 通用 → 界面语言，即时生效，`<html lang>` 同步更新
- **全组件改造**：工具栏、标签栏、状态栏、侧边栏、设置面板（全部 9 页）、编辑器、斜杠菜单、演示模式、快捷键面板、插件等 27 个文件的中文硬编码全部替换为 `t()` 调用
- **快捷键系统 i18n**：action 改为 labelKey/categoryKey，快捷键大全与设置页随语言切换
- **插件 i18n**：KaTeX / Mermaid 插件的名称、描述、配置项均支持多语言

**AI 大模型接入（侧边 AI 聊天面板）**

- **Rust 流式代理**：新增 `ai_proxy.rs` / `ai_keystore.rs`，支持 OpenAI Chat Completions / Anthropic Messages / Ollama 三种 wire format 流式 SSE 输出，事件驱动推送（chunk / done / error），支持协作式取消
- **密钥安全存储**：API 密钥存 OS keychain（Windows 凭据管理器 / macOS Keychain / Linux libsecret），绝不落盘 localStorage
- **17 家供应商目录**：OpenAI、Anthropic、Gemini、xAI、Mistral、Groq、DeepSeek、通义千问、智谱 GLM、Moonshot Kimi、火山方舟、硅基流动、MiniMax、OpenRouter、OpenCode Go、Ollama（本地）、OpenAI 兼容端点，各自默认模型与端点
- **AI 设置面板**：设置 → AI，可选供应商 / 模型 / Base URL 覆盖 / 系统提示词，密钥保存、清除、一键验证（带脱敏指纹诊断）
- **侧边 AI 聊天面板**：工具栏机器人按钮开关，与左侧栏对称的右侧面板；流式回复、停止生成、清空对话、复制、插入到文档光标处、创建新文档
- **引用当前文档**：勾选后把当前文档内容作为上下文发送给 AI，支持文档引用上限配置（64K~512K/不限，默认 200K，模型窗口再大也不怕）
- **修复 AI 调用链路**：Tauri 2 命令参数 camelCase 适配；供应商默认端点映射（DeepSeek 等不再误连 OpenAI）；密钥粘贴引号清理；流式监听器生命周期（done/error 到达才注销）

**其他优化**

- **自动保存间隔**：1~10 秒 → 5~180 秒，默认 60 秒；旧配置自动迁移
- **「源代码模式」更名为「源码」**：15 种语言同步
- **AI 面板层级**：改为 app-body 内右侧布局面板，不再遮挡工具栏与视图模式按钮

**v0.2.1 补充 · AI 增强与修复**

- **自定义服务接入**：AI 设置合并为「自定义服务」入口，协议二选一（OpenAI 兼容 Chat Completions / Anthropic 兼容 Messages API），自填 Base URL、模型 ID、API 密钥；本地端点（llama.cpp / LM Studio / vLLM 等）密钥可留空；旧「OpenAI 兼容」本地条目与别名自动迁移
- **思考过程展示**：提取推理模型的思考内容（OpenAI 系 `reasoning_content`/`reasoning`、Anthropic `thinking_delta`、Ollama `reasoning_content`），AI 面板以可折叠「思考过程」区块展示，默认收起、不影响正文
- **AI 设置面板优化**：控件宽度统一对齐、标签与输入框上沿对齐；API 密钥输入独占一行全宽 + 等宽字体 + 显示/隐藏切换；「模型」更名为「模型 ID」
- **AI 助手头部**：服务商 + 模型 ID 紧跟标题左对齐显示，自定义服务简写为「自定义服务」
- **修复 AI 长回复截断**：前端 10 秒兜底误杀长流，改为与后端 180s HTTP 超时对齐；done 事件始终以完整文本覆盖，自愈个别 chunk 丢失
- **修复中文回复乱码**：流式分块按 UTF-8 字符边界安全解码，跨网络块切碎的多字节字符不再产生 � 缺字
- **修复自定义服务密钥被跳过**：验证与发送回退 OS keychain（有则用、无则 keyless），此前保存密钥后验证仍报 401 missing_api_key
- **修复 Anthropic 兼容验证**：同时发送 `x-api-key` 与 `Authorization: Bearer`（兼容只认 Bearer 的网关）；验证请求改用用户填写的模型 ID（不再硬编码）
- **修复赛博朋克主题状态栏**：`background-color` 不接受渐变导致主题色丢失、文字不可见，改用 `background`
- **修复验证错误撑宽设置页**：长错误文本（JSON/URL）强制换行
- **依赖与构建**：npm audit fix 修复 2 个高危漏洞（browserslist）；移除 package.json UTF-8 BOM 修复 Vite 构建失败

**v0.2.1 补充 · AI 技能系统（Skill）**

- **技能系统框架**：新增 `skills/` 目录（`skills.json` 清单 + 各技能 `.md` 提示词），运行目录自动创建；后端新增 `list_skills` / `read_skill_file` 命令（含路径穿越防护），`tauri.conf.json` 打包 `skills/*` 资源；用户把技能文件放入 `skills/` 目录即可扩展新技能，无需改代码
- **技能选择交互**：AI 面板输入框上方新增 ⚡ 闪电按钮，点击弹出技能菜单（名称 + 一句话简介，hover 展开详细介绍）；选中技能后以胶囊 tag **插入输入框光标处**，与文字混排、可像普通文字一样退格删除；hover 时 ⚡ 原位淡出、❌ 原位淡入，点击取消技能
- **技能上下文注入**：发送时技能提示词作为独立 system 消息注入，引导大模型按技能执行；`needsDoc: true` 的技能自动勾选并锁定「引用当前文档」，删除技能后自动恢复勾选
- **内置 3 个技能**：演示稿提炼（提炼为演示模式文稿）、文档摘要、润色改写
- **演示稿提炼技能细化**：按演示模式真实渲染规则（`src/lib/slides.ts`）逐条写明 14 种版式的触发结构与指令语法，AI 输出的演示稿每页可被引擎正确识别版式
- **输入框激活态**：主题色光点沿 1px 边框环绕流动（conic-gradient + `@property` 动画），仅线框变色、背景不变、无双层框
- **技能相关样式**：技能菜单字体与行距优化、技能 tag 字号与正文一致

**v0.2.1 补充 · 其他修复**

- **修复 CRLF 行尾文档大纲无法提取**：标题正则 `.` 不匹配 `\r`（JS 行终止符），CRLF 文档（Windows 常见）的所有标题匹配失败、大纲显示「文档没有标题」；提取前剥离行尾 `\r` 修复。此问题自 V0.1.0 起存在，LF 文档不受影响，本次定位修复

## v0.1.10

**幻灯片版式系统升级（整页结构 → 14 种自动版式）**

在 v0.1.9 的纯 Markdown 演示模式基础上，将版式推断从「只看首块」升级为「分析整页块结构」，补齐 PPT 常见版式，观感全面接近专业幻灯片。

- **整页结构推断**：不再只看页面第一块，而是分析整页的标题层级、块类型与组合方式，自动选择最合适的版式
- **14 种自动版式**：
  - `cover` 封面页（`#` 标题 + 副标题段落，居中大标题 + 渐变下划线）
  - `section` 章节过渡页（`##` 单独成页，大号序号 + 居中标题）
  - `thanks` 结尾页（`# 谢谢/Thanks/Q&A`，居中收尾）
  - `agenda` 目录页（`## 目录` + 有序列表，大号数字双列网格）
  - `content` 内容页（标题左上 + 强调下划线，正文左对齐）
  - `content-list` 列表页、`table` 数据表页（表头主题色 + 斑马纹）、`roadmap` 路线图页（大号勾选框）
  - `figure` 图文页（左图右文双栏）、`image` 图片页、`quote` 金句页、`code` 代码页、`chart` 图表页、`formula` 公式页
- **金句页重设计**：去掉左侧竖线；内容上下居中；大引号改为对角装饰——上引号定位在文案左上角外侧、下引号定位在右下角外侧（6em、35% 透明度）
- **封面 meta**：front matter 提供 `author`/`date` 时，封面页底部自动显示「作者 · 日期」
- **显式指令**：`<!-- layout: xxx -->` 强制指定版式、`<!-- align: left|center|right -->` 整页对齐，覆盖自动推断（HTML 注释，渲染不可见）
- **装饰层**：左下角章节名 + 页码页脚，底部主题色进度条随翻页增长
- **鼠标滚轮翻页**：内容可滚动时先滚动内容，滚到上/下边界再翻页；翻页后短暂锁定防惯性连翻
- **文档更新**：`docs/slideshow-style-mapping.md` 重写为整页结构对照表，`Slide-Template.md` 模板覆盖全部新版式

**应用图标更新 + 演示模板图片资源修复**

- **主程序图标更新**：`icon.png` 替换为最新版，重新生成 `icon.ico` / `icon.icns`（exe、安装包同步生效；文件关联图标 `md-icon.ico` 保持不变）
- **演示模板更新**：`Slide-Template.md` 内容置换为 `slideshow-test.md`（版式推断测试示例，覆盖封面/目录/章节/内容/列表/表格/路线图/图文/引用/代码/图表/公式/显式指令等全部版式）
- **模板图片相对路径**：示例图片迁入 `templates/images/`，模板改为相对路径引用，可移植到任意机器
- **新增 `src/lib/localImages.ts`**：演示模式与编辑器预览的本地图片统一解析，支持相对路径（基于模板目录）、绝对路径（含盘符/`/`）
- **修复打包丢图**：资源映射由 `templates/*` 改为目录形式 `templates`，递归打包 `templates/images/` 子目录，安装包内图片完整
- **模板图标同步**：模板引用的 `app-icon.png` 换成新图标（256×256 缩小版）

## v0.1.9

**演示模式（幻灯片）**

将任意 Markdown 文档按 `---` 分页渲染成**应用内全屏幻灯片**，模拟 PPT 播放，无需导出。参考 solomd 演讲模式的分页思路，围绕 Yizimarkdown 自身产品风格自研轻量引擎。

- **进入演示**：工具栏「放映」按钮、标签栏「演示」按钮、快捷键 `Ctrl+Alt+P`，三种方式均可
- **分页语法**：`---`（单独成行）分页，代码围栏内不切分，front matter 自动忽略
- **纯 Markdown 驱动**：不需要任何额外格式，引擎根据内容结构自动选择版式，用户零学习成本
- **6 种自动版式**：封面（`#` 标题开头）、内容（`##`/段落/列表/表格）、图片、引用、代码、图表（mermaid）
- **居中排版**：块居中、文字居中，列表和引用保持左对齐；标题一律居中，h1/h2/h3 仅字号递减
- **封面强调**：一级标题开头的页面自动放大标题 + 主题色渐变下划线
- **标题位置稳定**：内容页采用固定顶边距对齐，翻页时标题不再上下跳动
- **大气引用页**：大引号（6em，50% 透明度）+ 居中大字 + 左对齐
- **跨平台全屏**：HTML5 Fullscreen 优先 + Tauri window API 降级；最大化窗口可靠进入
- **主题继承**：进入继承当前主题与暗模式，演示内可切换；15 个主题标题颜色精确继承
- **播放交互**：`→/←` 翻页、`F` 全屏、`S` 备注、`?` 帮助、`Esc` 退出；右下角页码 HUD
- **示例与文档**：演示模板 `templates/Slide-Template.md`（纯 Markdown），`help.md` 补充完整幻灯片语法章节

**模板功能完善**

- **「从模板新建」入口**：工具栏「新建」右侧新增「从模板新建」下拉菜单，选择模板即按该模板的 Markdown 结构创建新文档
- **修复默认模板 bug**：此前设置默认模板后，新建文档只会把模板文件名当作内容；现改为正确读取模板内容作为新文档结构
- 设置 → 模板 可新建/编辑/删除模板，设置 → 通用 可设默认模板

**Bug 修复**

- 修复 `tauri dev` 启动崩溃（EBUSY）：Vite 监听 cargo 写入中的 `src-tauri/target` 导致文件锁冲突，`server.watch.ignored` 排除 src-tauri
- 修复幻灯片列表不渲染：Tailwind preflight 重置了 `list-style`，显式还原 `ul/ol` 列表符号
- 修复 `Esc` 退出不彻底：操作系统截获 Esc 退出全屏时无法收到按键，新增全屏状态丢失检测，退出后恢复打开前视图
- 修复切换主题文字色不跟随：主题元素级规则作用域为 `.editor-content`，注入时改写为幻灯片作用域
- 修复荔枝红/紫罗兰 H1/H2 字号不正确：未加作用域的 `.theme-x h1` 泄漏进幻灯片，改为仅注入 `:root.theme-*` 变量
- 修复无序/有序列表内容宽度不一致：统一用 CSS 计数器 + `::before` 自定义标记
- 修复最大化窗口进入全屏底部黑条：先 `unmaximize` 再 HTML5 Fullscreen
- 修复 F 键全屏切换失灵：Tauri `set_fullscreen(false)` 在 borderless 窗口静默失败，改用 HTML5 Fullscreen API

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
