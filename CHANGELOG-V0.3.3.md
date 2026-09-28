# v0.3.3

> 本版主题：**自定义 CSS 升级为「自定义主题」** —— 在 设置 → 外观 → 自定义 CSS 中书写样式并保存，
> 即生成「自定义主题」（以保存时的主题为基底 + 你的 CSS）并自动选中：既可以粘贴整份新主题，
> 也可以只微调几个颜色，保存后立即生效、无需重启。激活态与观感从此永远一致。
> 另有实时模式点击定位错位修复（根因：block widget 的 CSS margin 不进 CodeMirror 高度图）、
> 保存前自动清洗（行号 / 零宽字符）、清除按钮二次确认、主题设计规范文档等。

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

## Bug 修复

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

### 结构

- 新增 `src/lib/themeLoader.ts`：主题样式**唯一注入入口**（`applyThemeStyles`），
  「自定义主题」= 基底 + user.css 的合成逻辑集中于此；App.tsx 与设置面板共用
- 新增 `src/lib/userCss.ts`：选择器归一（`retargetThemeCss`）/ 提权（`normalizeUserCss`）/
  保存前清洗（`sanitizeUserCss`）三个纯函数，便于单测
- `settingsStore` persist v5 → v6（新增 `customCssBase`）

## 其他

- 版本号 0.3.3（五载体同步：`package.json` / `src-tauri/tauri.conf.json` / `src-tauri/Cargo.toml` /
  `src-tauri/Cargo.lock` / `package-lock.json`）
- 新增 `THEME-DESIGN-SPEC.md`（见上）；README / help.md 及镜像同步「自定义主题」说明
- 仓库内新增开发用测试主题 `brocade.css`（织锦）：纹路 / 流光能力的验证样本，
  **不注册 `theme.json`、不随版本发布**；`--texture-grid/dots/paper` 预设与四个区域的
  `--<region>-deco-*`、两个区域的 `--<region>-sheen-*` 均经其真实渲染验证
  （计算样式 + 像素差分）
