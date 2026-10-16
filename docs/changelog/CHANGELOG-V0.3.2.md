# v0.3.2

> 本版主题：**实时模式属性面板 + 主题令牌体系** —— front matter 按 Obsidian 式属性面板渲染（三模式规范显示 + 严格判定 + 属性类型系统）；主题扩展出区域 / 装饰 / 效果三层令牌并新增 `check-themes` 六项门禁；默认主题改为「液态玻璃 Prism」并排列表第一位。另有 HTML 导出大纲侧栏、WebDAV 加载预设、云端面包屑折叠与目录树逐层展开、Tab 拖动排序、字体三通道、引用块与公式渲染修复等。

## 新增功能

### 实时模式：Obsidian 式属性面板

- 文档开头的 YAML front matter 在**实时模式**渲染为可编辑属性面板：每行 = [类型图标] [属性名] [值]，无表格线、hover 当前行出框
- 每行属性名前有**类型下拉**（icon + 名称），7 种类型：自动 / 文本 / 数字 / 复选框 / 日期 / 日期和时间 / 列表；第二列按类型换成对应控件
- **类型按属性名全局记忆**（`settingsStore.frontMatterTypes`，照 Obsidian `types.json` 语义）—— 项目无按路径索引的持久化，按路径存对未命名新文件与云端文档都不可靠；**不把类型写进 Markdown**
- 表头「**编辑源码**」把光标落到第一个属性行，直接编辑原始 YAML；表格**常驻可编辑**（单元格 `stopPropagation` 拦下光标 + `blur` 提交 ⇒ 撤销/重做与输入法都可用）
- 类型菜单挂 **light DOM**（Shadow DOM 拿不到主题对 `[class*="menu"]` 的定制）+ `fixed` 定位 + px 字号；多行两列**全行共享列宽**才对齐

### 元信息三模式规范显示

- **源码模式**：原样零装饰（所见即文件）
- **实时模式**：弱化的「元信息块」（弱化文字色 + 略小字号 + 左侧细线/淡背景，仍可编辑）
- **预览模式**：隐藏（阅读模式主流做法）
- **根因**：`@lezer/markdown` 完全不认识 front matter ⇒ `---` / `title: x` / `---` 被解析成「分隔线 + setext H2」；新增 `src/lib/frontMatter.ts` 作**唯一事实源**（此前 `slides.ts` 与 `markdownRenderer.ts` 各有规则不一致的两份正则）
- **判定走严格三层**（用户拍板，不得放宽）：① `---` 必须在第 1 行第 1 列（无前导空行）；② 存在闭合 `---` / `...`；③ 块内每行 ∈ {空行, `#` 注释, `key: value`, 缩进续行} 且**至少一行键值对**
- `KEY_LINE` 放宽为 `/^[^\s#][^:]*:(?:\s|$)/` + 剥 BOM：挡 `https://x`（冒号后无空白）的同时兼容点号键 / 中文键 / 带空格键 / 开头 BOM 四类真实写法

### 主题令牌体系：区域 + 装饰 + 效果三层

- **区域令牌**：`--toolbar-*` / `--tabbar-*` / `--sidebar-*` / `--statusbar-*` / `--menu-*` / `--dialog-*` / `--overlay-bg`，全部回退到既有基础层 ⇒ 现有主题一行不改
- **装饰层**：`--<region>-deco-*` + `--<region>-sheen-*` + 4 个通用 keyframes ⇒ 主题只给值就能加纹路与流动光影；遵循 `prefers-reduced-motion`
- **效果令牌**：`--radius-xs/sm/md/lg/xl`、`--shadow-1/2/3`、`--dur-*`、`--ease-*`、纹理预设；**代码/语法令牌** `--code-*` 共 28 个（此前 25 种 token 全挤在 3 个颜色上 ⇒ 所有主题代码都是单色的）；**预览排版令牌**经 Tailwind prose 的 `--tw-prose-*` 注入（无特异性之争）
- 修掉四个「假旋钮」：`--editor-text-muted`、`--border-radius`、`--editor-h1/2/3`（删 48 条写死色）、`.settings-modal-container` 硬编码 `Inter`
- 新增护栏 `scripts/check-themes.mjs`（六项检查，接入 `npm run build`）：变量白名单、亮/暗一致性、死声明、命名一致性、反模式计数、双目录漂移
- `liquidglass-prism` 用新令牌重写：529 → 411 行，反模式 14 处 → 0 处

### 字体三通道

- `--font-ui`（软件界面，固定不写入）/ `--font-editor`（源码内容 ← 设置）/ `--font-preview`（预览 + 实时 + 演示内容 ← 设置）三角色互不越权；`--font-mono` 回归纯等宽；`var(--font-sans)` 保持零真实消费
- 新增 `--font-heading` 单一来源：预览与实时标题共用，默认 `var(--font-preview)`，**主题可覆盖优先**（magazine / nature 用衬线）

### HTML 导出左侧大纲侧栏

- 仅 HTML 导出注入（`export-toc.css` 经 `?inline`），PDF / 打印不带 —— 屏幕导航元素不该印到纸面
- 大纲取自**渲染后的** `h1[id]..h6[id]`（与正文同源 ⇒ 锚点必然对得上）；heading 文本过 `esc()` 转义防注入
- **悬浮圆角卡片**：sticky 吸顶、随主题 `--editor-surface` / `--menu-shadow`；`top` 由导出页内小脚本**实测首个标题底部**对齐；`max-height: calc(100vh - var(--toc-top))` 防超长大纲撑出屏幕；窄屏收窄到 140px

### WebDAV 体验增强

- **加载预设**：设置 → 云端存储，服务器地址框聚焦时出现「加载预设」，一键填入坚果云地址（i18n × 15 语言）
- **面包屑折叠**：目录层级深时上级折成「…」，点「…」可下拉跳转隐藏层级（`MAX_CRUMBS = 2`）
- **目录树逐层展开**：点文件夹图标懒加载展开子层级，逐层浅色引导线

### Tab 标签拖动排序

- `editorStore` 新增 `moveTab`；TabBar 用**指针事件**拖拽（Tauri 默认 `dragDropEnabled: true` 会拦掉 HTML5 DnD）
- 插入指示线 + 跟手浮层（透明度经三轮调整）

### 演示模式：默认动画与持久化

- 默认切换动画：水平滑动 → **卡片推换**（并提到动画菜单第一位）
- 动画选择持久化到 `settingsStore.slideAnim`（zustand persist），选过就记住

## Bug 修复

- **引用块「多一个空行」+ 强制引号**（多轮才定案）：留白来自 prose 给 `p` 的 `margin: 1.25em` 在引用块内变成可见空间，叠加主题自己的 margin/padding；引号来自 `blockquote p:first-of-type::before { content: open-quote }`。修法 = prose `blockquote` 七行（`margin: 0.5em 0` + `quotes: 'none'` + 首尾段归零 + `content: none`）+ 16 主题纵向 padding 统一 0.5em；后又发现**主题 `.editor-content.theme-X p` 的 (0,2,1) 与 prose 平局**、运行时注入使主题胜出 ⇒ 两条首尾段落规则迁 `globals.css` 并加 `.prose.editor-content` 前缀（→ (0,3,1) 稳压）
- **实时模式公式块之后的内容不渲染**：`cm-live-blocks.ts` 的多行 `$$…$$` 区间计算两处缺陷 —— 找不到闭合时 `endLine` 兜底推到文档末尾（生成吞掉正文的替换区间）；闭合只认整行 `$$`（`\sqrt{\pi}$$` 挂行尾永远匹配不上）。修法：`endLine` 初值 -1、找不到闭合不生成替换；闭合放宽为「行尾是 `$$`」。附 `tests/liveBlocks.test.ts` 3 条边界用例
- **元信息行 hover 冒出可折叠 H2 胶囊**（源码模式）：同一 lezer 根因 ⇒ `cm-heading-fold.ts` 在 mousemove 与 `refreshIndicators()` 两处跳过 `frontMatterOf` 区间（那个胶囊还能 `toggleFold` 折叠掉元信息）
- **切换视图模式被动下滚**：跨模式「阅读锚点补偿」在顶部误触发（两模式顶部留白不同）⇒ 快照 `atTop`（`scrollTop <= 1`）时整段跳过
- **prism 的 `theme.json` 注册信息丢失**（显示为文件名）：上一轮 `git checkout -- src-tauri/themes/` 整目录回退把同目录非 `.css` 文件一并带走 ⇒ 已补回；回滚纪律升级为「先 `git ls-files <dir>` 列全受控文件」
- **13 个主题引用块修复「看起来没生效」**：Vite 文件监视器（启动于两天前）漏掉 `globals.css` 写入通知 ⇒ HMR 从未推送，用户那次测试无效；重启 dev 进程树后确认服务端包含全部修复

## 主题精简

- **删除旧「液态玻璃」主题**（`liquidglass.css` + `theme.json` 条目 + `.theme-swatch-liquidglass` 死 CSS）
- **默认主题**改为 `liquidglass-prism`（液态玻璃 Prism），并**排列表第一位**：新增 `src/lib/themeOrder.ts`（`DEFAULT_THEME` + `orderThemes()`），工具栏 / 设置面板 / 演示主题菜单三个消费点统一归位
- **persist 升到 v5**：只迁移被删值 `liquidglass` → 默认主题（不迁移则 `read_theme_css` 取不到文件、整块主题空白；用户选过的其它主题不动）
- **⚠️ 删主题必须连带清 `target/**/themes/` 资源拷贝**：`get_app_root()` 返回 exe 所在目录 ⇒ dev 读 `target/debug/themes`，Tauri 资源拷贝「增量化、不删已移除文件」⇒ 只删源文件旧主题仍在列表里（已全盘清理三处，现均 15 个）
- 新增 `tests/themeOrder.test.ts`（顺序归位 + 兜「改了 `DEFAULT_THEME` 却漏建主题文件」的手误）

## 技术改进

### 测试与门禁

- `npm test` = **90 条**（remotePath / slides / slideTiles / frontMatter / liveBlocks / themeOrder，Node 内置 runner 直跑 `.ts`）
- 让 `cm-live-blocks.ts` 可被 `node --test` 加载：1 处相对 import 补 `.ts`、`DecorationSet` 改 `import type`、`npm test` 加 `--experimental-transform-types`（Node strip-only 不支持构造函数参数属性）
- **`check-i18n.mjs` 补第三方向检查「用到但未定义」**：静态 `t('ns.key')` 必须存在（缺失退出码 1 挡构建）；局部包装器裸键（`t('editSource')` → 按本文件 `const t = … properties.` 定义补全前缀）；动态键按「前缀 + 取值来源」显式展开（`i18nKey` → `settings.xxx`；`TYPES` 枚举 → `properties.type{Auto,…}`）；未声明来源的动态前缀告警。当前**静态 388 + 动态 26 全部已定义，缺失 0**（破坏性测试验证过）
- `check-themes` 告警 2 → **1**（删 liquidglass 后其 8 处反模式消失；余 1 为 `--editor-selection` 已知死旋钮）

### 元信息实现机制

- 新增 `src/lib/cm-frontmatter.ts`（`FM_SCAN_LIMIT` / `frontMatterOf` / `frontMatterLines`）+ `src/lib/cm-properties.ts`（属性面板 widget + StateField）
- 面板用 **StateField 不用 ViewPlugin**：跨多行的 `Decoration.replace({block: true})` 由 ViewPlugin 提供会在渲染时抛 `RangeError`；面板**自算区间**、不读 `frontMatterField`（StateField 顺序依赖）
- `markdownRenderer.ts` / `slides.ts` 的两份不一致正则统一委托 `splitFrontMatter`

## 其他

- 版本号 0.3.2（五载体同步：`package.json` / `src-tauri/tauri.conf.json` / `src-tauri/Cargo.toml` / `src-tauri/Cargo.lock` / `package-lock.json`）+ 官网 `website/index.html`（版本徽章 / 下载链接 / 更新记录页签）
- `help.md` / `welcome.md` / `README.md` 同步：主题清单与目录结构改为 Prism 默认、属性面板 / HTML 大纲 / 加载预设 / Tab 拖动等新功能说明；`src-tauri/` 镜像同步；14 个译本的主题清单与目录树同步改默认标记
- 两份 `changelog.md` 同步；`CHANGELOG-V0.3.2.md` 为本文件
