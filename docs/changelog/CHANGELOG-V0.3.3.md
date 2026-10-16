# v0.3.3

> 本版主题：**自定义 CSS 升级为「自定义主题」** —— 在 设置 → 外观 → 自定义 CSS 中书写样式并保存，
> 即生成「自定义主题」（以保存时的主题为基底 + 你的 CSS）并自动选中：既可以粘贴整份新主题，
> 也可以只微调几个颜色，保存后立即生效、无需重启。激活态与观感从此永远一致。
> 另有实时模式点击定位错位修复（根因：block widget 的 CSS margin 不进 CodeMirror 高度图）、
> 保存前自动清洗（行号 / 零宽字符）、清除按钮二次确认、主题设计规范文档等。
> 追加（2026-10-09）演示模式三项（用户 issue #5）：**行内代码折行修复**、
> **HUD 字体/字重/字号/内容填充宽度·高度旋钮**、**`***` 分栏**（`---` 分页 / `***` 分栏，
> 零新语法；页内第一个标题作为页标题不参与分栏）。

## 新增功能

### 自定义主题（原「自定义 CSS」全面升级）

- **保存即生成「自定义主题」**：在 设置 → 外观 → 自定义 CSS 中书写样式并保存，主题列表首位出现
  「自定义主题」并自动选中。它 = **基底主题**（保存时的当前主题，`settingsStore.customCssBase`）
  \+ 你的 CSS（`user.css` 覆盖层）
- **两种用法都支持**：粘贴整份新主题（选择器里的 `:root.theme-xxx` 自动归一到当前生效主题）；
  或只写微调（裸 `:root { --editor-accent: … }` 自动提权，稳定压过基底主题）
- **激活态与观感永远一致**：user.css 只在「自定义主题」下生效（其它主题不叠加它）——
  否则「菜单里选的是 A、看到的却是被覆盖后的 B」，用户分不清自己选了什么
- **保存后立即生效，无需重启**：注入逻辑统一到 `src/lib/themeLoader.ts` 的 `applyThemeStyles()`
  单一入口（历史上「启动加载」与「保存」两条路径各写一份，保存那条漏了提权 ⇒ 改了 CSS
  保存后毫无反应、必须重启）
- **三个消费点对齐**：设置 → 外观主题列表（首位）、右上角调色板主题菜单（末条 + 分隔线）、
  演示模式 HUD 主题菜单（首条）——全部「user.css 非空才显示」；右上角菜单每次打开时重读
  user.css（与模板菜单「打开即刷新」同一模式），清除后条目即时消失
- **清空回落**：清空自定义 CSS 并保存 ⇒ 「自定义主题」条目消失，回落到基底主题
- **清除按钮 + 二次确认**：「保存 CSS」旁新增「清除」，点击弹确认框（复用关闭未保存 tab 的
  弹窗样式），确认后才删除 —— 误点一下就删光 CSS 太危险
- **保存前自动清洗**：剥离从聊天窗口 / AI 回复 / PDF 复制带来的两类污染——
  ① 行首行号（`12 :root { … }`，裸数字会让 CSS 解析在第一处断掉、其后全部静默失效）；
  ② 零宽字符（ZWSP/ZWNJ/BOM 等，肉眼不可见却让令牌名悄悄失配）。
  行号剥离带防误伤门槛：仅当多数非空行都带行号才整体剥离；清洗结果回写文本框，
  用户看到的就是实际保存的
- **提权不用 `!important`**：选择器加 `:root.theme-custom` 作用域前缀即可稳定压过主题
  （变量 (0,2,0) 平手 + 后置 ⇒ 胜；元素 (0,3,1) > 主题 (0,2,1)），用户自己后面的规则
  仍能覆盖前面的；`@media` / `@supports` 递归改写，`@keyframes` / `@font-face` / `@page` 原样保留
- **演示模式同步支持**：HUD 主题菜单出现「自定义主题」，变量 = 基底主题变量块 + user.css
  变量块（归一后合并），元素规则照旧丢弃（幻灯片版式由 slideshow.css 全权控制）
- persist 升到 **v6**：新增 `customCssBase` 字段，存量存档补默认值

### 主题设计规范文档（`THEME-DESIGN-SPEC.md`）

- 面向「新增主题 / 微调主题 / 查旋钮」的开发者参考手册：14 章 + 2 附录
- 令牌分层总览（基础层 → 区域 → 装饰 → 效果 → 结构性装饰）、每个模块的
  定义 / 令牌清单 / 设计指引 / 实现效果 / 示例
- check-themes 六项门禁说明、反模式清单（含「变体/主题段只能改表现属性，改布局定位属性
  会静默破坏基础几何」等实测教训）、明暗双模式规范、新增主题检查清单
- 附录 A 令牌总表标注每个令牌的状态（`●` 已接入 / `○` 已声明待接入）——
  主题作者不会再被「声明了却不生效」的死旋钮误导

### HUD 排版与内容区

- HUD 新增 `Aa` 图标，面板内实时调整：字体（跟随主题 / 无衬线 / 衬线 / 等宽）、
  字重（300–700）、字号（70%–160%）、**内容填充宽度 / 高度（50%–95%）**，含「恢复默认」
- **内容填充宽度 / 高度 = 内容区占整屏的比例**，是内容区大小的**唯一**依据。
  用户反馈「只调整页边距是不改变视觉效果的」—— 根因是各版式写死的行宽上限：
  宽窗口上内容宽度被 rem 上限钉住，页边距怎么调都看不出来。修法：把 **9 处**行宽上限
  （`.ys-slide > *` 66rem、内容页 `p/li` 58rem、目录 `ol` 56rem、列表页 `ol/ul` 54rem、
  路线图 `ul` 50rem、封面副文 42rem、引用 `> *` 56rem、代码 / 图表 `> *` 72rem）
  **全部改为 100%**，并把 **4 处**写死的 `padding-top: 10vh` 改为按填充高度换算
  ⇒ 拉动滑杆一定能看到变化
- **默认值不产出任何行内变量** ⇒ 没调过的演示与本次改动前**逐像素一致**：
  默认 82% × 84% 恰好等于原来的 `9vw` / `8vh` 页边距；4 处 `padding-top` 换算后默认仍为 10vh；
  `.ys-layout-quote` 的多余留白（左右 +2vw、下方 +6vh）也原样保留
- 变量写在 `.yizi-slideshow` 根节点的**行内 style**（而非 `documentElement`）：作用域限定在演示
  子树、退出演示自动失效、不污染预览 / 编辑器；默认值声明在 `globals.css` 的 `--ys-*`
- 字体存 **id 而非字体栈**：字体栈将来改名不会让存量存档失效
- **键盘守卫**：面板里的下拉框 / 滑杆需要方向键，不能被翻页快捷键抢走（`Esc` 仍关闭面板）；
  滚轮悬停在面板 / 菜单上不再误翻页（顺带修掉 `.ys-theme-menu` 的既有问题）
- persist **v7 → v8**：「页边距缩放」被「内容填充宽度 / 高度」取代 —— `slidePadScale`
  已无消费点，migrate 里显式 `delete`（否则会被 persist 反复写回存档）；新键收敛到 50~95。
  `clampNumber` 只接受数字与数字字符串，`null` / `''` / 布尔一律视为「未设置」
  —— `Number(null) === 0` 会把缺失的存档静默归零
- **连带修掉滚轮翻页的一个坑**：内边距也计入 `scrollHeight`，而填充高度会把上下内边距做得很大
  （50% ⇒ 上下各 25vh）。于是「内容已完整显示」时 `scrollHeight` 仍大于 `clientHeight`，
  滚轮判定为「可滚动」⇒ 只滚那段**空白内边距**而不翻页（用户实测发现）。修法：
  可滚动量改为 `max(0, scrollHeight - paddingBottom - clientHeight)`（扣掉底部内边距，
  即按「内容底部对齐视口底部」判断），并把向下滚动夹在该上界内，不再滚进空白

### `***` 分栏

- 页内用**单独成行的 `***`**（标准 Markdown 主题分割线）分栏；与 `---` = 分页并列，
  二者都是标准分割线，语义分开，**零新语法**
- **不做任何结构推断**（如「同级小标题自动分栏」）：真实文档里同级标题常常只是层级，
  误判率高且用户无法关闭；显式标记比智能猜测更可预测
- `splitColumns()` 与 `splitSlides()` 对称：fence 感知（围栏内的 `***` 是内容）、逐字匹配
  （前导空格不触发）；空栏丢弃；**返回长度 1 = 未分栏**
- **页标题不参与分栏**：页内**第一个标题块**（`#`~`######`）由 `splitColumns()` 抽成 `intro`，
  作为整页标题渲染在分栏之上 —— 否则标题会落进第 1 栏，表现为「左栏带标题、右栏内容顶端
  高于标题」的错位。页标题**不包 div**、直接作为 `.ys-slide` 的直接子元素 ⇒
  各版式的 `h2` 规则与 `> :first-child` 装饰仍能命中它，标题样式与不分栏时一致；
  想给每栏各写标题 ⇒ 把页标题写最前，再在页标题之后开始 `***`
- 栏首尾的**空行**会被裁掉（不动行首缩进 —— 缩进的代码块 / 嵌套列表是合法内容）
- 最多 4 栏，超出时后续内容**并入最后一栏**并 `console.warn`（内容不丢）
- `columns` 是 `Slide` 的**独立字段**，不新增 `SlideKind` ⇒ 与 14 种版式正交，
  `LAYOUT_KINDS.length === 14` 的口径不变
- `BlockType` 新增 `'columns'` 且**独占一块不参与合并**：否则 `scanBlocks` 会把跨栏的两个
  同类型块（如两个列表）合并成一个，版式推断结果随之改变
- 版式推断用「各栏重拼回去」的源，`columns === 1` 时与改动前逐字节一致
- 片段逐步显示扩展到栏内列表项（分栏页多包一层 `.ys-cols > .ys-col`，选择器抽成
  `FRAGMENT_ITEM_SELECTOR` 常量防止两处漏改）
- `.ys-slide.ys-has-cols` 让页面容器退回单列 flex，避免与 `figure` 版的 `display:grid`
  （45/55 栅格）冲突导致栏容器被塞进右半边
- **取舍**：`***` 不再渲染为字面 `<hr>`（需要页内分隔线请用 `___` 或 `- - -`）
- **修掉既有文档 bug**：`docs/slideshow-style-mapping.md` 此前把 `<!-- layout: two-col -->`
  当示例，而 `two-col` 并不在 `LAYOUT_KINDS` 里（只会 warn 并回落）—— 已改为合法值

## Bug 修复

### 演示模式行内代码被截断（issue #5）

- **现象**：演示模式下 `"{:=^20}".format("python")` 这类行内代码被页面边缘截断，不折行
- **根因**：`.ys-slide code` 只声明了颜色 / 内边距 / 字号 / 字体，**没有任何折行属性**。
  无断点的 token 形成一个不可断的行盒，在 `.ys-slide{overflow:auto}` +
  `.yizi-slideshow{overflow:hidden}` 下表现为「被截断」
- **为什么预览能折行、演示不能**：主题写的是
  `.editor-content.theme-<id> code { word-break: break-all; overflow-wrap: break-word;
  box-decoration-break: clone }`，而演示根节点带 `theme-<id>` 却**不带 `editor-content`**
  ⇒ 该规则永不命中。修法：把这套属性补到 `.ys-slide code`（取值与预览侧逐字一致）
- **必须的复位**：`.ys-slide code` 选择器更宽会连带命中 `pre` 内的 code ⇒
  `.ys-slide pre code` 显式复位 `white-space: pre` / `word-break: normal` /
  `box-decoration-break: slice`，否则长代码行折行、缩进与行号全部错位
- 同根因的长 URL 纯文本也加了 `overflow-wrap: break-word`；
  `.ys-slide pre` 加 `max-width: 100%`（分栏内也能正常横向滚动）
- 附带：`.ys-title`（左上角文档名）补 `title` 属性，被省略号截断时悬停可看完整值
- **明确不改**：`.ys-chapter` / `.ys-title` 的单行省略号 —— 它们是无滚动能力的固定位置装饰标签，
  换行会挤占画面，省略号是正确行为

### 实时模式点击定位错位一行（点击第一行、焦点激活在第二行）

- **主根因：block widget 的 CSS `margin` 不进 CodeMirror 高度图**。CM6 的高度测量只取
  `getBoundingClientRect().height`（不含 margin），其 margin 补偿（`spaceAbove`）只在嵌套
  `BlockWrapperTile` 内部生效 ⇒ 顶层块 widget 的上下 margin（原 `0.6em 0` ≈ ±19px）完全游离在
  heightMap 之外，且**逐 widget 累积** ⇒ `posAtCoords` 按 heightMap 命中 ⇒ 点击视觉第 N 行、
  焦点落在第 N+1 行
- 未测量区域按 1 行高估算（图片实际 200–400px）⇒ 刚滚动到新区域时偏差最大 ——
  解释了「大概率」而非恒定；引用行本身无 widget，但上方有图片/代码块时累积偏移传导 ——
  解释了「引用也错位」
- **修法**：`.cm-live-block` 与 `.cm-live-block--properties` 的 margin 改为等值 padding
  （padding 在 rect 内 ⇒ 间距进入高度图）；properties 用 `calc()` 保持原占位不变
- **次根因**：点击 widget 下半部走 `PosAssoc(block.to, -1)` 分支，被替换行 DOM 不存在时
  光标重映射到上一行 ⇒ 修法：把 block replace 范围注册进 `EditorView.atomicRanges`，
  点击 widget 中间时光标确定推到范围边界，不再走重映射路径
- **A/B 实测**（Playwright + 真实扩展链路，21 个采样点：普通行 / 图片 / 代码块 / 引用×2 / 表格
  各 3 个纵向位置）：margin 版复现 **14 处错位（全部 +1 行）**；padding 版 **21/21 全过**

### 其它修复

- **清除自定义 CSS 后右上角菜单条目不消失**：Toolbar 的 `hasUserCss` 只在挂载时读一次，
  设置面板里的保存/清除它感知不到 ⇒ 改为每次打开主题菜单时重读（同模板菜单先例）
- **`--statusbar-bg` 渐变失效隐患**：消费点从 `background-color` 改为 `background` 简写
  （cyberpunk 等主题的渐变状态栏此前会静默回落）

## 技术改进

### 测试与门禁

- `npm test` 90 → **114 条**：新增 `tests/userCss.test.ts` 24 条
  （选择器归一 / 提权 / 清洗，含「粘贴整份主题」「双主题类」「行号剥离防误伤」等回归）
- `check-i18n` 静态键 388 → 392（自定义主题 / 清除确认相关 ×15 语言）
- **（追加）`npm test` 114 → 138 条**：新增 `tests/slideTypography.test.ts` 8 条
  （默认值不产出变量 / 越界收敛 / 脏值回落 / 填充比例百分数→小数）+ `tests/slides.test.ts` 16 条
  （`splitColumns` 围栏感知 / 逐字匹配 / 空栏丢弃 / 上限合并 / **页标题抽取**，
  `scanBlocks` 的 `columns` 块，分栏页版式推断与未分栏页回归）
- **（追加）`check-i18n` 静态键 392 → 404**（演示排版 / 分栏 ×15 语言）

### 结构

- 新增 `src/lib/themeLoader.ts`：主题样式**唯一注入入口**（`applyThemeStyles`），
  「自定义主题」= 基底 + user.css 的合成逻辑集中于此；App.tsx 与设置面板共用
- 新增 `src/lib/userCss.ts`：选择器归一（`retargetThemeCss`）/ 提权（`normalizeUserCss`）/
  保存前清洗（`sanitizeUserCss`）三个纯函数，便于单测
- `settingsStore` persist v5 → v6（新增 `customCssBase`）
- **（追加）新增 `src/lib/slideTypography.ts`**：演示排版旋钮的纯函数模块（零依赖，
  可被 `node --test` 直接加载）—— 值 → CSS 变量的映射集中于此
- **（追加）`settingsStore` persist v6 → v8**（v7 新增 `slideFontFamily` / `slideFontWeight` /
  `slideFontScale` / `slidePadScale`；v8 以 `slideFillWidth` / `slideFillHeight` 取代 `slidePadScale`）
- **（追加）新增 `splitColumns()` / `COLUMN_BREAK` / `MAX_COLUMNS`**（`src/lib/slides.ts`），
  与既有 `splitSlides()` 同构，便于单测

## 其他

- 版本号 0.3.3（五载体同步：`package.json` / `src-tauri/tauri.conf.json` / `src-tauri/Cargo.toml` /
  `src-tauri/Cargo.lock` / `package-lock.json`）
- 新增 `THEME-DESIGN-SPEC.md`（见上）；README / help.md 及镜像同步「自定义主题」说明
- **（追加）文档同步**：`help.md` / `src-tauri/help.md`（两份逐字节相同，必须同步）在演示模式
  新增「分栏」「排版与页边距（HUD）」两节；`README.md` / `src-tauri/readme.md` 与
  `website/help.html`（`data-kw` 补 分栏 / 字体 / 字号 / 字重 / 页边距）同步；`docs/slideshow-style-mapping.md`
  修正非法的 `<!-- layout: two-col -->` 示例并新增分栏小节
- **（追加）版本号仍为 0.3.3**：本次改动并入未发布的 v0.3.3，不新增版本文件
- 仓库内新增开发用测试主题 `brocade.css`（织锦）：纹路 / 流光能力的验证样本，
  **不注册 `theme.json`、不随版本发布**；`--texture-grid/dots/paper` 预设与四个区域的
  `--<region>-deco-*`、两个区域的 `--<region>-sheen-*` 均经其真实渲染验证
  （计算样式 + 像素差分）
