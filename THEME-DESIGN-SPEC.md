# YiziMarkdown 主题设计规范

> **文档性质**：主题（Theme）系统的开发者参考手册。面向「想新增一个主题」「想微调现有主题」「想知道某个旋钮到底管什么」的人。
> **权威来源**：`src/styles/globals.css`（令牌全集）+ `src-tauri/themes/*.css`（主题实现）+ `scripts/check-themes.mjs`（校验门禁）。
> **基线版本**：v0.3.2+（主题令牌体系：区域 / 装饰 / 效果三层；「自定义主题」= 基底主题 + user.css）
> **更新日期**：2026-09-24

---

## 目录

1. [概述：主题是什么](#1-概述主题是什么)
2. [快速开始：最小可用主题](#2-快速开始最小可用主题)
3. [文件与命名规范](#3-文件与命名规范)
4. [加载与生效机制](#4-加载与生效机制)
5. [令牌分层总览](#5-令牌分层总览)
6. [模块参考](#6-模块参考)
   - 6.1 [基础层令牌](#61-基础层令牌base)
   - 6.2 [圆角阶梯](#62-圆角阶梯radius)
   - 6.3 [区域令牌](#63-区域令牌region)
   - 6.4 [装饰层令牌](#64-装饰层令牌deco--sheen)
   - 6.5 [效果令牌](#65-效果令牌effect)
   - 6.6 [代码 / 语法高亮令牌](#66-代码--语法高亮令牌code)
   - 6.7 [预览排版令牌](#67-预览排版令牌prose)
   - 6.8 [字体三通道](#68-字体三通道font)
   - 6.9 [语义色令牌](#69-语义色令牌semantic)
   - 6.10 [结构性装饰：无法令牌化的部分](#610-结构性装饰无法令牌化的部分)
7. [明暗双模式规范](#7-明暗双模式规范)
8. [校验门禁：check-themes 六项检查](#8-校验门禁check-themes-六项检查)
9. [反模式与最佳实践](#9-反模式与最佳实践)
10. [主题元数据 theme.json](#10-主题元数据-themejson)
11. [演示模式的主题继承](#11-演示模式的主题继承)
12. [从零写一个主题：完整示例](#12-从零写一个主题完整示例)
13. [新增主题检查清单](#13-新增主题检查清单)
14. [不走文件：自定义主题（用户侧）](#14-不走文件自定义主题用户侧)
- [附录 A：令牌总表](#附录-a令牌总表)
- [附录 B：相关文件索引](#附录-b相关文件索引)

---

## 1. 概述：主题是什么

### 1.1 定义

一个主题 = **一个 CSS 文件**，内容是一组 CSS 自定义属性（下称「令牌」）的覆盖值，配合少量「无法令牌化的结构性装饰」规则。

主题**不重写组件选择器**，不修改布局，不新增 DOM。它只回答一个问题：**「把这个应用里每一个可见区域，染成什么颜色、配上什么形状、加什么光影？」**

### 1.2 三条铁律

| # | 铁律 | 理由 |
|---|------|------|
| 1 | **只覆盖令牌，不写组件选择器** | 组件选择器（`.toolbar { … }`）会与全局层、运行时注入层争夺特异性，导致 `!important`、层级打架、被 `overflow` 裁切 |
| 2 | **颜色令牌必须亮/暗各声明一次** | 只写一侧，另一模式会静默回落到基础值 —— 表现为「暗色下某个角落还是亮的」 |
| 3 | **令牌名必须存在于 `globals.css` 或主题自身** | CSS 变量名写错**不会报错，只会静默失效**。这是本项目最大的历史坑（17 个主题都定义了 `--editor-h1/2/3`，但长期无人消费 ⇒ 「标题色」旋钮是死的） |

### 1.3 为什么令牌化：一次真实的重构

`liquidglass-prism` 的演进是本规范的最佳注脚：

| 版本 | 做法 | 行数 | 反模式（`!important` / `[class*=` / `z-index`） |
|------|------|------|------|
| 第三版 | 用组件选择器 + 字面量「补足」变量体系的缺失 | 529 | 14 处 |
| 第四版 | **只用令牌**表达 | 411 | 0 处 |

令牌化后，改一处配色只需改一个值，不再需要动几十行选择器。

### 1.4 架构分层

```
┌─────────────────────────────────────────────────────────────┐
│  L4  结构性装饰（选择器层）  .editor-content.theme-x h1 { … } │  ← 无法令牌化的部分
├─────────────────────────────────────────────────────────────┤
│  L3  效果令牌  --shadow-*  --dur-*  --ease-*  --texture-*    │
├─────────────────────────────────────────────────────────────┤
│  L2  装饰层    --<region>-deco-*  --<region>-sheen-*         │
├─────────────────────────────────────────────────────────────┤
│  L1  区域令牌  --toolbar-*  --tabbar-*  --sidebar-*  --menu-* │
│                --dialog-*  --statusbar-*  --overlay-bg        │
├─────────────────────────────────────────────────────────────┤
│  L0  基础层    --editor-*  --sidebar-bg/text  --statusbar-*   │
│                --sel-toolbar-*  --font-*  --radius-*          │
│                --code-*  --h1-color/--link-color/…  --danger… │
└─────────────────────────────────────────────────────────────┘
        所有 L1 令牌默认回退到 L0 ⇒ 老主题一行不改、外观不变
```

**关键设计原则：每一层都回退到下一层。** 区域令牌的默认值是「主题已经覆盖过的基础变量」（如 `--toolbar-bg: var(--editor-surface)`），因此：

- 现有主题**一行不改**，外观逐像素不变；
- 区域令牌**自动跟随主题**（主题改了 `--editor-surface`，工具栏跟着变）；
- 想单独定制某区域时，才覆盖对应的 `--<region>-*`。

---

## 2. 快速开始：最小可用主题

复制以下模板即可得到一个完整、通过全部门禁的主题：

```css
/* 我的主题 (My Theme) — 一句话描述 */
:root.theme-my-theme {
  /* ── 基础层（必需） ── */
  --editor-bg: #ffffff;
  --editor-text: #222222;
  --editor-accent: #7c3aed;
  --editor-border: #e5e7eb;
  --editor-surface: #f9fafb;
  --editor-hover: rgba(0, 0, 0, 0.04);
  --editor-selection-bg: rgba(124, 58, 237, 0.25);
  --editor-cursor: #7c3aed;
  --sidebar-bg: #f5f3ff;
  --sidebar-text: #6b7280;
  --statusbar-bg: #7c3aed;
  --statusbar-text: #ffffff;

  /* ── 形状与排版 ── */
  --border-radius: 10px;
  --font-sans: 'Inter', 'Noto Sans SC', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  --font-size-base: 16px;
  --line-height: 1.8;
  --paragraph-spacing: 1.5em;
}

:root.theme-my-theme.dark {
  /* ── 暗色：颜色令牌必须逐一声明 ── */
  --editor-bg: #14121c;
  --editor-text: #d8d4e4;
  --editor-accent: #a78bfa;
  --editor-border: #2b2738;
  --editor-surface: #1c1926;
  --editor-hover: rgba(255, 255, 255, 0.05);
  --editor-selection-bg: rgba(167, 139, 250, 0.3);
  --editor-cursor: #a78bfa;
  --sidebar-bg: #1a1724;
  --sidebar-text: #8b8698;
  --statusbar-bg: #2a2438;
  --statusbar-text: #c4bfd4;
}

/* ── 结构性装饰（可选）：只有无法令牌化的部分才写选择器 ── */
.editor-content.theme-my-theme h1 {
  font-size: 2em;
  font-weight: 700;
  margin: 1.5em 0 0.5em;
}
```

**注册元数据**（`src-tauri/themes/theme.json`，键 = 文件名去掉 `.css`）：

```json
"my-theme": {
  "name": "我的主题",
  "swatch": ["#ffffff", "#7c3aed"],
  "desc": "一句话中文描述"
}
```

**校验**：

```bash
node scripts/check-themes.mjs          # 只让真 bug 失败
node scripts/check-themes.mjs --strict # 发布前自查，告警也算失败
```

---

## 3. 文件与命名规范

### 3.1 位置

| 路径 | 角色 |
|------|------|
| **`src-tauri/themes/*.css`** | **运行时唯一读取目录**。所有主题 CSS 放这里 |
| `src-tauri/themes/theme.json` | 主题元数据注册表（显示名 / 色板 / 描述） |
| `src/styles/globals.css` | 基准令牌全集 + 组件消费点。**同时是校验器的变量白名单** |
| `src/lib/themeLoader.ts` | 主题样式**唯一注入入口**（含「自定义主题」合成） |
| `src/lib/userCss.ts` | 选择器归一 / 提权（主题文件归属 + 用户 CSS 覆盖） |
| `scripts/check-themes.mjs` | 六项一致性门禁 |

> ⚠️ **`src/assets/themes/` 已于 2026-09-22 删除**，全仓零引用。它曾害过一次 bug：改了那份副本，运行时却从 `src-tauri/` 读取，导致变量未生效。`check-themes.mjs` 第 6 项保留为哨兵 —— 该目录再现即告警。**不要重建副本。**

### 3.2 命名一致性（硬性要求）

```
文件名         my-theme.css
                 ↓ 必须一致
选择器         :root.theme-my-theme        （亮色）
               :root.theme-my-theme.dark   （暗色）
```

由 `check-themes.mjs` 第 4 项校验，**不一致直接构建失败**。

### 3.3 主题清单（共 15 个）

`src-tauri/themes/` 下现有 15 个 CSS 文件。其中 14 个在 `theme.json` 注册，`academic`（学术蓝）是**代码内置的保底预设**（元数据在 `SettingsModal.tsx`，走 i18n，不在 `theme.json`）：

```
academic  cyberpunk  facebook  liquidglass-prism  lychee  magazine
matrix    minimal    mint      nature             sunset  tech
typewriter vibrant   violet
```

**默认主题** = `liquidglass-prism`，由 `src/lib/themeOrder.ts` 的 `DEFAULT_THEME` 常量定义，并在工具栏 / 设置面板 / 演示主题菜单三个消费点统一排到列表**第一位**。

> **开发用测试主题**：仓库里另有一个 `brocade.css`（织锦），是纹路 / 流光能力的**验证样本**（第一个使用 `--<region>-deco-*` / `--<region>-sheen-*` 与 `--texture-grid/dots/paper` 预设的主题），**不注册 `theme.json`、不随版本发布**。想看纹路效果可直接研究它；正式主题请勿模仿它的「测试定位」。

---

## 4. 加载与生效机制

理解加载时序，能解释 90% 的「主题没生效」问题。

### 4.1 注入流程

```
App.tsx
  └─ applyThemeStyles(theme, customCssBase)          ← lib/themeLoader.ts（唯一注入入口）
       ├─ tauri.invoke('read_theme_css', { name })   ← Rust 侧从 exe 旁 themes/ 读文件
       │    └─ retargetThemeCss(css, theme)          ← 选择器归一到当前生效主题名
       │    └─ 写入 <style id="yizimarkdown-theme-css">
       ├─ [theme === 'custom' 时] 读 user.css
       │    └─ normalizeUserCss(css, 'custom')       ← 归一 + 提权（见 §4.5）
       │    └─ 写入 <style id="yizimarkdown-user-css">
       └─ document.documentElement.classList.add('theme-<name>')
            └─ :root.theme-<name> { … } 命中 ⇒ 令牌生效
  └─ 明暗：document.documentElement.classList.toggle('dark')
       └─ :root.theme-<name>.dark { … } 命中
```

### 4.2 「自定义主题」= 基底主题 + user.css

设置 → 外观 → 自定义 CSS 保存后，会生成一个合成主题（id = `custom`）：

- **基底主题**（`settingsStore.customCssBase`）= 保存时的当前主题，提供完整外观；
- **user.css** 是覆盖层 —— 既可以粘贴整份新主题，也可以只改几个变量；
- 保存后「自定义主题」自动出现在主题列表**首位**并选中；**激活态与观感永远一致**。
- user.css **只在**「自定义主题」下生效（其他主题不叠加它）—— 这是刻意设计：否则「菜单里选的是 A、看到的却是被 user.css 覆盖后的 B」，用户会分不清自己选了什么。
- 清空 user.css 并保存 ⇒ 条目消失，回落到基底主题。
- 演示模式同样支持：HUD 主题菜单出现「自定义主题」（user.css 非空时），基底变量块 + user.css 变量块合并注入。

### 4.3 关键时序坑

- **主题 CSS 是异步注入的**。组件在 `mount` 时用 `getComputedStyle` 读到的可能是**注入前**的值。需要读取主题色的逻辑（如主题色光标生成）必须等待注入完成。
- **主题切换带过渡**：切换瞬间 `<html>` 会挂 `.theme-transition`，其 `* { transition: background-color/color/border-color }` 让换肤平滑。注意它是**全局通配**，会短暂影响所有元素的颜色过渡。
- **dev 模式读的是 `target/debug/themes/`**（`get_app_root()` 返回 exe 所在目录）。Tauri 资源拷贝是**增量、不删已移除文件**的 ⇒ **删主题时必须连带清理 `target/**/themes/` 的资源拷贝**，否则旧主题仍在列表里。
- **Vite 文件监视器可能漏掉 `globals.css` 的写入通知** ⇒ HMR 不推送，测试无效。改动 `globals.css` 后若「看起来没生效」，重启 dev 进程树再验证。

### 4.4 JS 运行时注入的变量

以下变量由 JavaScript 在运行时写入，**因此不在 `globals.css` 里声明**（校验器的 `JS_INJECTED` 豁免清单）：

| 令牌 | 注入点 | 来源 |
|------|--------|------|
| `--cursor-arrow` / `--cursor-standard` / `--cursor-bold` | `themeCursor.ts` | 由当前主题 `--editor-cursor` 动态生成（明暗适配描边） |
| `--preview-font-size` / `--preview-line-height` | `App.tsx` | 设置里的预览字号 / 行高 |
| `--font-mono` | `App.tsx` | 编辑器字体设置 |

### 4.5 选择器归一与提权（`lib/userCss.ts`）

应用只给 `<html>` 挂**当前生效主题**的那一个类，因此两套改写缺一不可：

**① 主题文件归属（`retargetThemeCss`）**：主题文件写的是自己的名字（`:root.theme-brocade`），但 `<html>` 上挂的是当前生效主题 ⇒ 所有 `.theme-<x>` 归一到生效主题名。同名归一是无害的空操作。

**② 用户 CSS（`normalizeUserCss`）**，两条规则：

| 用户写法 | 改写结果 | 原理 |
|---|---|---|
| `:root.theme-brocade { … }`（粘贴整份主题） | `:root.theme-custom { … }` | 只归一主题名，**不加前缀**（双主题类永不匹配） |
| `:root { … }` / `.editor-content h1 { … }`（微调） | `:root.theme-custom { … }` / `:root.theme-custom .editor-content h1 { … }` | 追加作用域前缀提权 |

提权不用 `!important`：作用域前缀已能稳定压过主题（变量 (0,2,0) 平手 + 后置 ⇒ 胜；元素 (0,3,1) > 主题 (0,2,1)），且用户自己后面的规则仍能覆盖前面的。`@media` / `@supports` 递归改写；`@keyframes` / `@font-face` / `@page` 原样保留。

> **历史教训**：注入逻辑曾分裂在「启动加载」与「保存」两条路径，保存那条漏了提权 ⇒ 改了 CSS 保存后毫无反应、必须重启。现已统一到 `applyThemeStyles` 单一入口。

### 4.6 明暗无关变量（`MODE_INDEPENDENT` 豁免）

以下变量**只声明一次就是正确的**，不该按「亮/暗各一次」要求（校验器第 2 项会跳过它们）：

- `--font-size-base` / `--line-height` / `--paragraph-spacing`
- `--border-radius` / `--radius-xs|sm|md|lg|xl|full`
- `--sel-toolbar-bg|text|border|hover|accent` —— **用户明确确认的有意设计**：划词工具栏是浮动小面板，暗色下若跟着变暗会显著影响可见性，故刻意沿用亮色值
- 正则匹配：`^--font-`（字体族不分明暗）、`-(deco|sheen)-`（装饰尺寸 / 节奏 / 混合模式不是颜色）

---

## 5. 令牌分层总览

| 层 | 前缀 / 令牌 | 数量 | 角色 | 详见 |
|----|-------------|------|------|------|
| L0 基础 | `--editor-*` | 9 | 编辑器内容区配色骨架 | §6.1 |
| L0 基础 | `--sidebar-bg/text`、`--statusbar-bg/text` | 4 | 侧栏 / 状态栏基础色 | §6.1 |
| L0 基础 | `--sel-toolbar-*` | 5 | 划词助手浮动工具栏（明暗无关） | §6.1 |
| L0 基础 | `--font-*` | 8 | 字体三通道 + 字号 / 行高 | §6.8 |
| L0 基础 | `--radius-*` / `--border-radius` | 6 + 1 | 圆角阶梯 | §6.2 |
| L1 区域 | `--toolbar-*` | 8 | 顶部工具栏 | §6.3 |
| L1 区域 | `--tabbar-*` | 8 | 标签栏 | §6.3 |
| L1 区域 | `--sidebar-*`（补缺） | 5 | 侧边栏 | §6.3 |
| L1 区域 | `--statusbar-border` | 1 | 状态栏描边 | §6.3 |
| L1 区域 | `--menu-*` | 6 | 菜单 / 下拉 | §6.3 |
| L1 区域 | `--dialog-*` | 3 | 弹窗 / 模态 | §6.3 |
| L1 区域 | `--overlay-bg` | 1 | 遮罩 | §6.3 |
| L2 装饰 | `--<region>-deco-*` | 4×4 | 纹路（背景图层） | §6.4 |
| L2 装饰 | `--<region>-sheen-*` | 3×2 | 流光（`::after` 层） | §6.4 |
| L3 效果 | `--shadow-*` / `--dur-*` / `--ease-*` | 3 + 3 + 2 | 阴影 / 动效节奏 | §6.5 |
| L3 效果 | `--texture-*` | 6 | 纹理预设 | §6.5 |
| L0 代码 | `--code-*` | 28 | 语法高亮 + markdown 角色 | §6.6 |
| L0 排版 | `--h1-color` / `--link-color` / … | 12 | 预览排版（经 Tailwind prose 注入） | §6.7 |
| L0 语义 | `--danger` / `--warn` / `--success` / `--on-accent` | 4 | 语义色 | §6.9 |
| L4 结构 | 选择器规则 | — | 渐变文字、多重内阴影等 | §6.10 |

---

## 6. 模块参考

每个模块按统一格式说明：**定义 → 令牌清单 → 设计指引 → 实现效果 → 示例**。

---

### 6.1 基础层令牌（Base）

#### 定义

基础层是整个应用配色的**骨架**，也是主题**必须覆盖**的一层。它定义了编辑器内容区、侧边栏、状态栏、划词工具栏的配色，以及所有 L1 区域令牌的默认回退源。

#### 令牌清单

| 令牌 | 类型 | 默认值（亮） | 默认值（暗） | 说明 |
|------|------|--------------|--------------|------|
| `--editor-bg` | color | `#ffffff` | `#1e1e1e` | 编辑器内容区背景（也是 `body` 背景） |
| `--editor-text` | color | `#333333` | `#d4d4d4` | 正文文字色 |
| `--editor-accent` | color | `#0066cc` | `#569cd6` | 强调色：链接、按钮、焦点环、复选框 |
| `--editor-border` | color | `#e5e5e5` | `#3c3c3c` | 通用描边 |
| `--editor-surface` | color | `#f8f8f8` | `#252526` | 次级表面：卡片、输入框、代码块底 |
| `--editor-hover` | color | `rgba(0,0,0,0.03)` | `rgba(255,255,255,0.05)` | 悬停底色 |
| `--editor-selection` | color | `#0066cc` | `#569cd6` | 选区色（**已知死旋钮**，当前无消费点） |
| `--editor-selection-bg` | color | `rgba(0,102,204,0.35)` | `rgba(86,156,214,0.45)` | 选区背景（实际生效的是这个） |
| `--editor-cursor` | color | `#0066cc` | `#569cd6` | 主题色光标源色（JS 据此生成 I-beam） |
| `--sidebar-bg` | color | `#fafafa` | `#252526` | 侧边栏背景（区域令牌的源头之一） |
| `--sidebar-text` | color | `#666666` | `#858585` | 次级 / 弱化文字（大量用于 muted 场景） |
| `--statusbar-bg` | color | `#f5f5f5` | `#007acc` | 状态栏背景（**接受渐变**，见 §6.3） |
| `--statusbar-text` | color | `#888888` | `#ffffff` | 状态栏文字 |
| `--sel-toolbar-bg` | color | `#ffffff` | — | 划词工具栏背景（**明暗无关**） |
| `--sel-toolbar-text` | color | `#333333` | — | 划词工具栏文字 |
| `--sel-toolbar-border` | color | `#e5e5e5` | — | 划词工具栏描边 |
| `--sel-toolbar-hover` | color | `rgba(0,0,0,0.03)` | — | 划词工具栏悬停 |
| `--sel-toolbar-accent` | color | `#0066cc` | — | 划词工具栏强调色 |

#### 设计指引

- **`--editor-accent` 是主题的灵魂**：它同时驱动链接、按钮、焦点环、复选框、光标、进度条。选一个饱和但不过曝的颜色。
- **`--sidebar-text` 承担「弱化文字」角色**，远不止侧边栏 —— 它被用作 `--toolbar-fg-muted` / `--menu-fg-muted` / 说明文字 / 列表标记色。别把它设得和正文一样重，否则层级全塌。
- **`--editor-surface` 与 `--editor-bg` 要有可辨识的明度差**：前者是「浮起来的卡片」，后者是「地板」。差值太小会让代码块 / 输入框边界消失。
- **`--editor-hover` 用半透明**（`rgba`）：它要叠在各种底色上，纯色会在不同底上显得突兀。

#### 实现效果

覆盖基础层后，**编辑器内容区、侧边栏、状态栏、划词工具栏、所有下拉菜单、弹窗、圆角**会整体换肤 —— 因为 L1 区域令牌全部回退到这里。

#### 示例

```css
:root.theme-example {
  --editor-bg: #fdfcfb;
  --editor-text: #2d2a26;
  --editor-accent: #c2410c;      /* 暖橙强调 */
  --editor-border: #e7e2db;
  --editor-surface: #f5f1ec;
  --editor-hover: rgba(45, 42, 38, 0.04);
  --editor-selection-bg: rgba(194, 65, 12, 0.22);
  --editor-cursor: #c2410c;
  --sidebar-bg: #f7f3ee;
  --sidebar-text: #8a8178;
  --statusbar-bg: #c2410c;
  --statusbar-text: #fff7ed;
}
```

---

### 6.2 圆角阶梯（Radius）

#### 定义

把主题声明的**单一**圆角值 `--border-radius` 展开成一套 `--radius-*` 阶梯，供全应用 UI 消费。

#### 令牌清单

| 令牌 | 默认值（计算式） | 实际值（`--border-radius: 8px`） | 用途 |
|------|------------------|----------------------------------|------|
| `--border-radius` | `8px`（回退值） | `8px` | **主题输入项**：全局圆角半径 |
| `--radius-xs` | `max(0px, calc(var(--radius-md) - 4px))` | `4px` | 小图标按钮、标记 |
| `--radius-sm` | `max(0px, calc(var(--radius-md) - 2px))` | `6px` | 输入框、次要按钮 |
| `--radius-md` | `var(--border-radius, 8px)` | `8px` | 基准：卡片、代码块、面板 |
| `--radius-lg` | `calc(var(--radius-md) + 4px)` | `12px` | 大卡片、弹窗 |
| `--radius-xl` | `calc(var(--radius-md) + 8px)` | `16px` | 弹出层 |
| `--radius-full` | `9999px` | `9999px` | 胶囊 / 圆形 |

#### 设计指引

- **主题只需声明 `--border-radius` 一个值**，阶梯自动展开。
- `max(0px, …)` 是必需的：主题可以声明 `0px`（方正主题），减法会算出负半径而使整条失效。
- 阶梯间距固定为 4px，所以 `--border-radius: 8px` 时与改造前**逐像素一致**。

#### 实现效果

改 `--border-radius` 一个值，**全应用 UI 圆角**（工具栏、标签、菜单、弹窗、输入框、按钮、滚动条）同步变化；`0px` 得到方正硬朗的观感，`14px+` 得到柔和圆润的观感。

#### 示例

```css
:root.theme-sharp { --border-radius: 0px; }    /* 方正 */
:root.theme-soft  { --border-radius: 14px; }   /* 圆润 */
```

---

### 6.3 区域令牌（Region）

#### 定义

每个功能区一套**独立**令牌。核心目的：让主题能把「顶栏」和「内容区」分开配色 —— 改造前它们共用 `--editor-surface` / `--editor-border`，一个变量代表两个区域，主题无法区分。

#### 6.3.1 顶部工具栏 `--toolbar-*`

| 令牌 | 默认值 | 消费点 | 说明 |
|------|--------|--------|------|
| `--toolbar-bg` | `var(--editor-surface)` | `.toolbar` 背景 | 接受渐变 / 图片 |
| `--toolbar-fg` | `var(--editor-text)` | `.toolbar` 文字 | 图标 / 按钮前景 |
| `--toolbar-fg-muted` | `var(--sidebar-text)` | 工具栏次级文字 | |
| `--toolbar-border` | `var(--editor-border)` | 底部描边 | |
| `--toolbar-accent` | `var(--editor-accent)` | 激活按钮 | |
| `--toolbar-hover` | `var(--editor-hover)` | 悬停底色 | |
| `--toolbar-active` | `var(--editor-hover)` | 激活底色 | ○ **待接入**（尚无消费点） |
| `--toolbar-shadow` | `none` | 工具栏投影 | 接受多重阴影（内高光 + 外投影） |

#### 6.3.2 标签栏 `--tabbar-*`

| 令牌 | 默认值 | 消费点 |
|------|--------|--------|
| `--tabbar-bg` | `var(--editor-surface)` | `.tab-bar` 背景 |
| `--tabbar-fg` | `var(--sidebar-text)` | 非激活 tab 文字 |
| `--tabbar-fg-hover` | `var(--editor-text)` | tab 悬停文字 |
| `--tabbar-fg-active` | `var(--editor-accent)` | 激活 tab 文字 |
| `--tabbar-border` | `var(--editor-border)` | 底边 + tab 分隔线 |
| `--tabbar-accent` | `var(--editor-accent)` | 激活 tab 下划线 |
| `--tabbar-hover` | `var(--editor-hover)` | tab 悬停底色 |
| `--tabbar-active-bg` | `var(--editor-bg)` | 激活 tab 底色 |

#### 6.3.3 侧边栏 `--sidebar-*`

`--sidebar-bg` / `--sidebar-text` 来自基础层，区域层只补缺：

| 令牌 | 默认值 | 消费点 |
|------|--------|--------|
| `--sidebar-border` | `var(--editor-border)` | 右侧描边 |
| `--sidebar-hover` | `var(--editor-hover)` | ○ **待接入**（尚无消费点） |
| `--sidebar-accent` | `var(--editor-accent)` | ○ **待接入**（尚无消费点） |
| `--sidebar-shadow` | `none` | 侧栏投影 |
| `--sidebar-blur` | `none` | 毛玻璃：主题给 `blur(16px)` 即可（令牌放完整函数值，便于同时覆盖 `-webkit-` 前缀版） |

#### 6.3.4 状态栏 `--statusbar-*`

`--statusbar-bg` / `--statusbar-text` 来自基础层：

| 令牌 | 默认值 | 消费点 | 说明 |
|------|--------|--------|------|
| `--statusbar-border` | `transparent` | 顶边描边 | |

> ⚠️ **`--statusbar-bg` 用 `background` 简写消费**，因此**接受渐变**（`cyberpunk` 主题就用了 `linear-gradient`）。但若用 `background-color` 消费点则渐变无效 —— 这是历史坑，已修正为简写。

#### 6.3.5 菜单 / 下拉 `--menu-*`

| 令牌 | 默认值 | 消费点 | 说明 |
|------|--------|--------|------|
| `--menu-bg` | `var(--editor-bg)` | 斜杠菜单、属性类型菜单、导出大纲 | 接受半透明 |
| `--menu-fg` | `var(--editor-text)` | ○ **待接入**（菜单文字当前直接读 `--editor-text`） |
| `--menu-fg-muted` | `var(--sidebar-text)` | ○ **待接入** |
| `--menu-border` | `var(--editor-border)` | 菜单描边 |
| `--menu-hover` | `var(--editor-hover)` | 菜单项悬停 |
| `--menu-shadow` | `0 8px 24px rgba(0,0,0,0.16)` | 菜单投影 |

> 改造前菜单**完全没有令牌**，主题只能靠 `[class*="menu"] { … !important }` 硬怼（正是 `liquidglass-prism` 第三版 14 处反模式的来源）。

#### 6.3.6 弹窗 `--dialog-*`

| 令牌 | 默认值 | 消费点 |
|------|--------|--------|
| `--dialog-bg` | `var(--editor-bg)` | 设置面板、关闭确认弹窗 |
| `--dialog-border` | `var(--editor-border)` | 弹窗描边 |
| `--dialog-shadow` | `0 25px 60px rgba(0,0,0,0.25), 0 8px 20px rgba(0,0,0,0.1)` | 弹窗投影 |

#### 6.3.7 遮罩 `--overlay-bg`

| 令牌 | 默认值 | 消费点 |
|------|--------|--------|
| `--overlay-bg` | `rgba(0,0,0,0.35)` | 模态遮罩 |

#### 设计指引

- **区域令牌之间要有「层次差」**：典型做法是 `tabbar-bg` 比 `toolbar-bg` 略沉，`active-bg` 回到 `editor-bg`（形成「标签被选中后与内容区连成一体」的观感）。
- **区域令牌接受任意 `background` 值**（纯色 / 渐变 / 图片），因为它消费在 `background` 简写上。
- **半透明是玻璃质感的关键**：`rgba(255,255,255,0.78)` 这类值配合 `--sidebar-blur` 得到毛玻璃效果。
- **不要为「区分区域」而改布局**：区域令牌只改表现属性（颜色 / 阴影 / 模糊）。改 `position` / `display` / `inset` 会静默破坏基础几何。

#### 实现效果

覆盖区域令牌后，**顶栏、标签栏、侧栏、状态栏、所有菜单、所有弹窗、遮罩**可各自独立配色，实现「顶栏与内容区不同色」「侧栏毛玻璃」「状态栏品牌色」等效果 —— 全部不写一行组件选择器。

#### 示例

```css
:root.theme-glass {
  /* 顶栏实色基底 + 内高光 + 外投影 */
  --toolbar-bg: #f2f7ff;
  --toolbar-shadow: inset 0 1px 0 rgba(255,255,255,0.95), 0 1px 4px rgba(37,99,235,0.10);
  /* 标签栏比顶栏略沉 */
  --tabbar-bg: rgba(228, 240, 255, 0.85);
  --tabbar-active-bg: #eef3fb;
  /* 侧栏毛玻璃 */
  --sidebar-bg: rgba(228, 240, 255, 0.9);
  --sidebar-blur: blur(16px);
  /* 菜单半透明 */
  --menu-bg: rgba(255, 255, 255, 0.97);
  --menu-shadow: 0 8px 28px rgba(37, 99, 235, 0.14), 0 2px 8px rgba(0,0,0,0.06);
  /* 状态栏品牌色 */
  --statusbar-bg: #2563eb;
  --statusbar-text: #ffffff;
}
```

---

### 6.4 装饰层令牌（Deco / Sheen）

#### 定义

让主题**只给值**就能给区域加纹路与流动光影，无需写选择器、无需自带 `@keyframes`、无需抢层级。

- **纹路（deco）** 走区域自身的**背景图层** ⇒ 不新增 DOM、不碰 `z-index`，天然在内容之下。
- **流光（sheen）** 走区域的 **`::after` 层**（`z-index: 1`）⇒ 在内容之上、在 `z-index ≥ 40` 的下拉菜单之下。

#### 支持的区域

纹路支持 **4 个区域**：`toolbar` / `tabbar` / `sidebar` / `statusbar`。
流光支持 **2 个区域**：`toolbar` / `statusbar`（它们有 `position: relative` 与 `::after` 基座）。

#### 令牌清单

**纹路（每个支持区域各 4 个）**：

| 令牌 | 默认值 | 说明 |
|------|--------|------|
| `--<region>-deco-image` | `none` | 纹路图：`var(--texture-diagonal)` 或任意 `gradient` / `url()` |
| `--<region>-deco-size` | `auto` | 纹路尺寸 |
| `--<region>-deco-repeat` | `repeat` | 重复方式 |
| `--<region>-deco-blend` | `normal` | 混合模式 |

**流光（每个支持区域各 3 个）**：

| 令牌 | 默认值 | 说明 |
|------|--------|------|
| `--<region>-sheen-image` | `none` | 流光渐变（建议两端透明的横向 `linear-gradient`） |
| `--<region>-sheen-size` | `200% 100%` | 尺寸；`200%` 配合位移 keyframes 实现「扫过」 |
| `--<region>-sheen-anim` | `none` | 动画：直接引用下列 keyframes |

**通用 keyframes（主题直接引用，无需自带）**：

| keyframes | 效果 | 说明 |
|-----------|------|------|
| `deco-sweep` | 左 → 右 扫过 | `background-position` `200% → -100%` |
| `deco-sweep-back` | 右 → 左 扫过 | 反向 |
| `deco-pulse` | 呼吸明灭 | 只动 `opacity`（0.35 ↔ 1） |
| `deco-drift` | 缓慢漂移 | `background-position` `0 → 50%` |

> 方向说明：`background-size: 200%` 时 `background-position` 百分比按 `(容器宽 - 图宽)` 计算 ⇒ `200%` 完全在左屏外，`-100%` 完全在右屏外。

#### 设计指引

- **流光渐变两端必须透明**（`rgba(..., 0)`），否则扫过时会看到硬边。
- **节奏要慢**：`14s ease-in-out infinite` 是经过验证的舒适值；快于 6s 会显得躁动。
- **纹路用 `currentColor` 派生**：`--texture-*` 预设内部用 `currentColor` ⇒ 自动跟随所在区域的文字色，主题不必为每种色再写一遍。
- **无障碍已内置**：`prefers-reduced-motion: reduce` 时所有 `::after` 动画自动静止（令牌保留，只是不动）。

#### 实现效果

```css
/* 一行 = 给侧栏加斜纹 */
--sidebar-deco-image: var(--texture-diagonal);
/* 一行 = 给状态栏加流动光带 */
--statusbar-sheen-image: linear-gradient(90deg,
    rgba(34,211,238,0) 0%, rgba(34,211,238,0.40) 22%,
    rgba(59,130,246,0.46) 46%, rgba(37,99,235,0) 100%);
--statusbar-sheen-anim: deco-sweep 14s ease-in-out infinite;
```

得到「冰蓝光带在状态栏上缓慢往复流动」的效果（`liquidglass-prism` 的招牌视觉）。

> **已验证通路**：纹路 / 流光能力已经真实渲染验证（计算样式 + 像素差分，验证样本为开发用测试主题 `brocade`，见 §3.3）。纹路是**纯 CSS 渐变**（`background-image` 接受渐变，不需要图片资源）。

---

### 6.5 效果令牌（Effect）

#### 定义

统一阴影、动效节奏、纹理预设，让主题能整体调节「软硬感」与「快慢感」。

#### 令牌清单

**阴影**：

| 令牌 | 默认值 | 当前状态 |
|------|--------|----------|
| `--shadow-1` | `0 1px 3px rgba(0,0,0,0.08)` | 已声明，**待接入**（尚无 UI 消费点） |
| `--shadow-2` | `0 8px 24px rgba(0,0,0,0.16)` | 已声明，**待接入** |
| `--shadow-3` | `0 25px 60px rgba(0,0,0,0.25), 0 8px 20px rgba(0,0,0,0.1)` | 已声明，**待接入** |

**动效节奏**：

| 令牌 | 默认值 | 当前状态 |
|------|--------|----------|
| `--dur-fast` | `0.15s` | 已声明，**待接入** |
| `--dur-normal` | `0.25s` | 已声明，**待接入** |
| `--dur-slow` | `0.4s` | 已声明，**待接入** |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | 已声明，**待接入** |
| `--ease-out` | `ease-out` | 已声明，**待接入** |

**纹理预设**（供 deco 令牌引用；测试主题 `brocade` 已实际引用 grid / dots / paper 三种）：

| 令牌 | 效果 | 已被引用 |
|------|------|:----:|
| `--texture-none` | 无 | — |
| `--texture-diagonal` | 135° 斜线 | —（brocade 用了自写的加粗版） |
| `--texture-grid` | 网格 | ✓ brocade 标签栏 |
| `--texture-dots` | 圆点 | ✓ brocade 侧栏 |
| `--texture-paper` | 细横纹（纸感） | ✓ brocade 状态栏 |
| `--texture-shine` | 100° 高光斜带 | — |

#### 设计指引

- **阴影 / 动效令牌是「保留词汇」**：规范已定义、主题可以声明，但 UI 尚未全面接入。声明它们**不会报错、也不会生效**，目前主要价值是为后续统一改造预留接口。**当前主题不必依赖它们**，需要阴影时直接用 `--<region>-shadow` / `--menu-shadow` / `--dialog-shadow`。
- **纹理预设立即可用**：通过 `--<region>-deco-image: var(--texture-xxx)` 引用。

#### 实现效果

```css
--sidebar-deco-image: var(--texture-dots);
--sidebar-deco-size: 12px 12px;
--statusbar-deco-image: var(--texture-paper);
```

---

### 6.6 代码 / 语法高亮令牌（Code）

#### 定义

统一「预览区代码块」与「实时编辑模式代码」的配色。此前 **25 种 token 全挤在 3 个颜色上** ⇒ 所有主题的代码都是单色的。

令牌分两类，默认值取法不同：

- **语法 token**（`keyword` / `string` / …）默认取 **highlight.js github 主题**的调色板 ⇒ 预览区代码块零变化；实时编辑的代码从「强调色单色」升级为真正的语法配色。
- **markdown 角色 token**（`heading` / `link` / …）默认保持原来的强调色 / 正文色 ⇒ 实时编辑正文视图零变化。

#### 令牌清单

**语法 token（13）**：

| 令牌 | 默认值 | 对应语法 |
|------|--------|----------|
| `--code-keyword` | `#d73a49` | 关键字 `if` / `return` |
| `--code-type` | `#d73a49` | 类型名 |
| `--code-string` | `#032f62` | 字符串 |
| `--code-number` | `#005cc5` | 数字 |
| `--code-constant` | `#005cc5` | 常量 |
| `--code-builtin` | `#e36209` | 内建函数 |
| `--code-function` | `#6f42c1` | 函数名 |
| `--code-tag` | `#22863a` | HTML / XML 标签 |
| `--code-comment` | `#6a737d` | 注释 |
| `--code-variable` | `#005cc5` | 变量 / 属性名 |
| `--code-attr` | `#005cc5` | 属性 |
| `--code-operator` | `#005cc5` | 运算符 |
| `--code-punct` | `var(--editor-text)` | 标点 / 括号 |

**markdown 角色 token（15）**：

| 令牌 | 默认值 | 说明 |
|------|--------|------|
| `--code-heading` | `var(--editor-accent)` | 标题色 |
| `--code-link` | `var(--editor-accent)` | 链接色 |
| `--code-strong` | `var(--editor-text)` | 粗体 |
| `--code-emphasis` | `var(--editor-text)` | 斜体 |
| `--code-inline-fg` | `var(--editor-accent)` | 行内代码前景 |
| `--code-quote-fg` | `var(--sidebar-text)` | 引用文字 |
| `--code-quote-bar` | `var(--editor-accent)` | 引用左侧条 |
| `--code-quote-bg` | `var(--editor-surface)` | 引用底色 |
| `--code-inline-bg` | `color-mix(in srgb, var(--editor-text) 10%, var(--editor-surface))` | 行内代码底 |
| `--code-block-bg` | `color-mix(in srgb, var(--editor-text) 5%, var(--editor-surface))` | 代码块底 |
| `--code-selection-bg` | `rgba(0,0,0,0.1)` | 代码选区 |
| `--code-active-line` | `rgba(0,0,0,0.03)` | 当前行高亮 |
| `--code-search-match` | `rgba(255,213,0,0.3)` | 搜索命中 |
| `--code-search-match-border` | `rgba(255,213,0,0.6)` | 搜索命中描边 |
| `--code-search-active` | `rgba(255,150,0,0.4)` | 当前命中 |

> 暗色模式下 `--code-selection-bg` / `--code-active-line` 已在 `.dark` 中改为更亮的白色半透明（原本是组件里按 `isDark` 分支写死的）。

#### 设计指引

- **主题覆盖这一套，预览与实时编辑的代码配色会同时跟着变**。
- **建一条「色链」**：不要 13 个 token 各给一个随机色。`liquidglass-prism` 用「青 → 天蓝 → 蓝 → 深蓝」的冰蓝色链，既满足语法区分，又保持主题一致性。
- **`--code-comment` 要明显弱化**（低饱和 / 中明度），它是代码里最该退后的东西。

#### 实现效果

```css
:root.theme-x {
  --code-keyword: #0e7490;
  --code-string:  #1d4ed8;
  --code-number:  #7c3aed;
  --code-function:#2563eb;
  --code-comment: #94a3b8;
}
```

代码块从单色变为有层次的语法着色。

---

### 6.7 预览排版令牌（Prose）

#### 定义

预览区排版的颜色此前由 Tailwind prose 的 `--tw-prose-*` 变量驱动，而那些变量**直接指向基础层** ⇒ 主题想细分就得写 `.editor-content.theme-x h1 { … }`。

这一层在中间插入令牌：**prose 变量改指向这些令牌**（见 `tailwind.config.ts`）⇒ 主题只给值就能定制预览外观。

#### 令牌清单

| 令牌 | 默认值 | 对应 prose 变量 |
|------|--------|-----------------|
| `--h1-color` | `var(--editor-h1, var(--editor-text))` | `--tw-prose-headings` |
| `--link-color` | `var(--editor-accent)` | `--tw-prose-links` |
| `--strong-color` | `var(--editor-text)` | `--tw-prose-bold` |
| `--quote-fg` | `var(--editor-text)` | `--tw-prose-quotes` |
| `--quote-bar` | `var(--editor-accent)` | `--tw-prose-quote-borders` |
| `--quote-bg` | `transparent` | （引用块背景） |
| `--inline-code-fg` | `var(--editor-text)` | `--tw-prose-code` |
| `--inline-code-bg` | `var(--editor-surface)` | （行内代码背景） |
| `--code-pre-bg` | `var(--editor-surface)` | `--tw-prose-pre-bg` |
| `--hr-color` | `var(--editor-border)` | `--tw-prose-hr` |
| `--table-border` | `var(--editor-border)` | `--tw-prose-th-borders` / `td` |
| `--table-head-bg` | `var(--editor-surface)` | （表头背景） |

#### 关于 `--editor-h1 / --editor-h2 / --editor-h3`

这三个变量**曾是假旋钮**：17 个主题都声明了，但全仓只有 `slideshow.css` 消费。v0.3.2 已把它们接进真实消费点：

| 变量 | 消费点 |
|------|--------|
| `--editor-h1` | `--h1-color`（预览 + 实时标题色）；`slideshow.css` h1 |
| `--editor-h2` | `slideshow.css` h2 |
| `--editor-h3` | `slideshow.css` h3 |

因此主题声明它们**现在会生效**（至少作用于 h1 预览与幻灯片标题）。

#### 设计指引

- **`--quote-bg` 接受渐变**（消费在 `background` 简写上），可做「玻璃引用块」。
- **表头与表体要有区分**：`--table-head-bg` 用强调色的极低透明度（如 `rgba(37,99,235,0.07)`）比用灰色更协调。
- 这些令牌**无需**写选择器即可生效 —— 这是与 §6.10 的分界线。

---

### 6.8 字体三通道（Font）

#### 定义

把字体拆成**三个互不越权**的角色，外加一个标题来源。

| 角色 | 令牌 | 来源 | 说明 |
|------|------|------|------|
| 软件界面 | `--font-ui` | 主题（默认主题字体栈） | 设置面板、侧边栏、tab、状态栏、菜单。**不受用户字体设置影响** |
| 源码内容 | `--font-editor` | 设置「编辑器字体」 | 源码模式的可编辑内容 |
| 预览内容 | `--font-preview` | 设置「预览字体」 | 预览 / 实时 / 演示模式内容 |
| 标题 | `--font-heading` | 主题可覆盖，默认 `var(--font-preview)` | 预览与实时**共用同一来源** |

其他字体令牌：

| 令牌 | 默认值 | 说明 |
|------|--------|------|
| `--font-sans` | 主题字体栈 | 内容字体**回退源**（`--font-editor` / `--font-preview` 的默认值） |
| `--font-mono` | `'JetBrains Mono', …` | 等宽：代码、行内代码。**纯等宽**，不含界面字体 |
| `--font-serif` | `'Playfair Display', Georgia, serif` | 衬线，供标题字体引用 |
| `--font-size-base` | `16px` | 正文字号（明暗无关） |
| `--line-height` | `1.8` | 行高（明暗无关） |
| `--paragraph-spacing` | `1.5em` | 段落间距（由主题自身的 `p { margin }` 消费） |

#### 设计指引

- **主题覆盖 `--font-ui` 可获得界面风格差异**（如衬线界面）；`--font-sans` 主要作为内容字体回退源。
- **想给标题换字体**（如杂志 / 自然风用衬线）：声明 `--font-heading: var(--font-serif)`。**主题优先**于 `--font-preview`。
- **`--font-mono` 保持纯等宽**：不要混入界面字体，否则代码对齐会乱。

#### 实现效果

```css
:root.theme-magazine {
  --font-serif: 'Playfair Display', Georgia, serif;
  --font-heading: var(--font-serif);   /* 标题走衬线 */
}
```

`magazine` / `nature` 即用此法获得衬线标题。

---

### 6.9 语义色令牌（Semantic）

#### 定义

此前 `danger` / `warn` / `success` 是散落在组件里的 Tailwind 调色板类（约 20 处）。

| 令牌 | 默认值 | 说明 |
|------|--------|------|
| `--danger` | `#dc2626` | 错误 / 删除（也用于 diff 的删除行） |
| `--warn` | `#f59e0b` | 警告 |
| `--success` | `#10b981` | 成功（也用于 diff 的新增行） |
| `--on-accent` | `#ffffff` | **强调色之上的文字色**：主题强调色偏亮时应改为深色 |

#### 设计指引

- **`--on-accent` 常被忽略**：若主题的 `--editor-accent` 是浅色（如柠檬黄），`--on-accent` 必须设为深色，否则按钮文字不可读。
- 语义色**应当跨主题保持一致的可辨识性**（红=危险），不要为了主题和谐而改成同色系 —— 那会让告警失去意义。

---

### 6.10 结构性装饰：无法令牌化的部分

#### 定义

有些视觉无法用「给一个值」表达，只能写选择器。**这是 L4 层，是唯一的例外通道**，必须克制使用。

#### 典型场景

| 场景 | 为什么无法令牌化 | 例子 |
|------|------------------|------|
| 渐变文字 | `background-clip: text` + `-webkit-text-fill-color: transparent` 需要组合声明 | `liquidglass-prism` 的 h1 |
| 多重内阴影 / 双层玻璃 | 需要多条 `inset` 阴影叠加 | 引用块、代码块 |
| 伪元素光带 | 需要 `::before` / `::after` 内容 | 引用块顶部高光折线 |
| 复杂布局微调 | 涉及 `padding` / `margin` / `position` | 正文卡片留白 |
| 字体排版细节 | `letter-spacing` / `font-weight` 组合 | 标题字重 |

#### 写法规范

```css
/* ✅ 正确：作用域限定在 .editor-content.theme-<name> 或 .theme-<name> */
.editor-content.theme-my-theme h1 { /* … */ }
.theme-my-theme pre { /* … */ }
.dark .editor-content.theme-my-theme h1 { /* … 暗色变体 */ }

/* ❌ 错误：未加作用域 ⇒ 会污染其它主题、甚至幻灯片 */
h1 { /* … */ }
```

> **历史教训**：`lychee` / `violet` 的标题规则曾写成未加作用域的 `.theme-lychee h1 { font-size: 2em }`，而幻灯片根节点恰好带 `theme-lychee` 类 ⇒ 字号错误地覆盖了演示版式。**必须限定 `.editor-content.theme-x`**。

#### 设计指引

- **能用令牌就不用选择器**：先查 §6.1–6.9 有没有对应令牌。
- **颜色一律走令牌**：`liquidglass-prism` 第四版的原则是「颜色一律走令牌，只有结构性装饰留选择器」。
- **明暗变体要成对**：`.dark .editor-content.theme-x …` 与亮色版成对出现。

---

## 7. 明暗双模式规范

### 7.1 双块结构

每个主题必须有两个变量块：

```css
:root.theme-<name> { /* 亮色 */ }
:root.theme-<name>.dark { /* 暗色 */ }
```

### 7.2 配对规则（校验器第 2 项）

**颜色令牌必须在亮、暗各声明一次** ⇒ 该令牌在文件中的**总出现次数为偶数**。出现奇数次 ⇒ 告警「另一种模式会回落到基础值」。

| 情形 | 后果 |
|------|------|
| 只写亮色，漏写暗色 | 暗色下该区域回落到 `globals.css` 的 `.dark` 默认值（通常是 VS Code 深灰）—— 表现为「暗色下某个角落还是蓝的 / 还是亮的」 |
| 只写暗色，漏写亮色 | 亮色下回落到 `:root` 默认值 |

**豁免（明暗无关，只写一次即正确）**：见 §4.6 的 `MODE_INDEPENDENT` 清单与正则 `^--font-`、`-(deco|sheen)-`。

### 7.3 暗色设计指引

- **暗色不是「亮色反相」**：直接反相会得到刺眼的对比。暗色背景宜用**低饱和深色**（`#14121c`、`#0a0f1e`），文字用**降饱和的浅色**（`#d8d4e4`、`#cfd9ec`）而非纯白。
- **暗色下强调色要提亮**：`#2563eb` 在暗底上偏闷，暗色版应提到 `#7ab3ff` 一类。
- **深度线索必须按明暗换向**：暗色下「黑投影」读不出来（黑底上的黑阴影不可见）。暗色的深度感应改用**主题变量派生的亮辉光**，例如 `color-mix(in srgb, var(--editor-text) 22%, transparent)`。
- **`--statusbar-bg` 在暗色下不要沿用亮色的品牌蓝**：`globals.css` 的 `.dark` 回退是 `#007acc`，若主题不覆盖，所有暗色状态栏都会是同一个固定蓝。

---

## 8. 校验门禁：check-themes 六项检查

`scripts/check-themes.mjs` 把「靠肉眼发现」变成「构建时失败」。

```bash
node scripts/check-themes.mjs           # 默认：只让真 bug（1、4）失败
node scripts/check-themes.mjs --strict  # 发布前自查：告警也算失败
node scripts/check-themes.mjs --quiet   # 只输出失败与统计
```

| # | 检查 | 级别 | 含义 |
|---|------|------|------|
| 1 | **变量白名单** | **失败** | `var(--x)` 里的 `x` 必须存在于 `globals.css` / 主题自身 / `JS_INJECTED` 清单 ⇒ 抓拼写错误 |
| 2 | **亮/暗一致性** | 告警 | 每个颜色令牌在亮暗块各声明一次（总次数为偶数） |
| 3 | **死声明** | 告警 | 主题定义了但全仓无人消费的变量 ⇒ 「这个旋钮是假的」 |
| 4 | **命名一致性** | **失败** | 文件名必须与 `:root.theme-<name>` 选择器一致 |
| 5 | **反模式计数** | 告警 | `!important` / `[class*=]` / 直接写 `z-index` |
| 6 | **双目录漂移** | 告警 | `src/assets/themes/` 再现即告警（该目录已删除） |

**退出码**：真 bug（1、4）恒为失败；告警默认只提示，加 `--strict` 才失败。语义与 `check-i18n.mjs` 一致：**历史遗留问题不该阻塞构建，但也不该被忽略**。

### 8.1 为什么需要「死声明」检查

CSS 变量名写错**不报错、只静默失效**。历史踩坑：17 个主题都定义了 `--editor-h1/2/3`，但全仓只有 `slideshow.css` 消费 ⇒ 「标题色」旋钮长期是死的。第 3 项就是为这类问题设的。

> 检查器**必须先剥掉注释**再扫反模式 —— 否则「文档里提到 `!important`」都会被算成反模式（真实踩过）。

---

## 9. 反模式与最佳实践

### 9.1 反模式清单（校验器第 5 项会告警）

| 反模式 | 为什么禁止 | 正确做法 |
|--------|-----------|----------|
| `!important` | 说明「变量体系表达力不足」，且会与运行时注入层打架 | 用区域令牌替代 |
| `[class*="menu"]` 等属性子串选择器 | 脆弱的类名耦合，一改类名就失效 | 用 `--menu-*` 令牌 |
| 直接写 `z-index` | 抢层级会与下拉菜单冲突、被 `overflow` 裁切 | 装饰走 `--<region>-deco-*` / `--<region>-sheen-*` |
| 未加作用域的选择器 | 污染其它主题、甚至幻灯片 | 限定 `.editor-content.theme-<name>` |
| 硬编码颜色（本可用令牌处） | 换肤时不跟随 | 用令牌或 `color-mix` 派生 |
| 覆盖布局定位属性（`position` / `display` / `inset` / `height`） | 会**静默破坏**基础几何 | 只改表现属性（`transform` / `opacity` / `background` / `box-shadow`） |

> **深度案例**：在变体 / 主题段写 `.ys-deck.ys-anim-cube { position: relative }`（(0,2,0) 压过 (0,1,0)）⇒ deck 落回正常流、高度塌成 0 ⇒ 内容被顶到顶部并溢出。**一般化结论：变体 / 主题段只能改「表现」属性，改「布局定位」属性会静默破坏基础几何。**

### 9.2 最佳实践

1. **从模板起步**（§2），先保证过门禁，再逐步加装饰。
2. **建色链而非堆颜色**：强调色、代码语法、流光都用同一色域内的明度 / 色相阶梯。
3. **用 `color-mix` 派生**：`color-mix(in srgb, var(--editor-text) 10%, var(--editor-surface))` 比写死灰色更能跟随主题。
4. **先查令牌再写选择器**：能令牌化的一律令牌化。
5. **改动后必跑**：`node scripts/check-themes.mjs --strict`。
6. **视觉类需求「数据全 PASS ≠ 用户认可」**：动手前先复述理解。

---

## 10. 主题元数据 theme.json

### 10.1 位置与结构

`src-tauri/themes/theme.json`，键 = 文件名去掉 `.css`：

```json
{
  "my-theme": {
    "name": "我的主题",
    "swatch": ["#ffffff", "#7c3aed"],
    "desc": "一句话中文描述"
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | 中文显示名（设置面板 / 工具栏展示） |
| `swatch` | `[string, string]` | 两个 hex：`[背景色, 强调色]`。用于设置面板的主题色块预览 |
| `desc` | string | 一句话中文描述 |

### 10.2 设计指引

- **`swatch` 决定主题在设置面板里的「第一眼」**：第一个色取主题的 `--editor-bg`（亮色），第二个取 `--editor-accent`。
- **必须与主题文件同名**：`theme.json` 的键、CSS 文件名、`:root.theme-<name>` 三者一致。
- **`academic` 是例外**：它是代码内置的保底预设，元数据在 `SettingsModal.tsx`（走 i18n），**不在 `theme.json`**。
- **「自定义主题」不在 `theme.json`**：它是合成主题（id = `custom`，基底 + user.css），显示名走 i18n `settings.customTheme`，色板借用基底主题的 swatch。

### 10.3 ⚠️ 删主题的连带清理

删除主题时必须同时清理：

1. `src-tauri/themes/<name>.css`
2. `theme.json` 中的条目
3. `target/**/themes/` 下的资源拷贝（dev 模式读这里，Tauri 资源拷贝**增量、不删已移除文件**）
4. `settingsStore` 的 persist 迁移（若用户可能选过该主题，需把被删值迁移到默认主题 —— 否则 `read_theme_css` 取不到文件、**整块主题空白**）
5. 任何 `.theme-swatch-<name>` 死 CSS

> 回滚纪律：`git checkout -- <dir>` 会**整目录回退**，把同目录的非 `.css` 文件（如 `theme.json`）一并带走。回滚前先 `git ls-files <dir>` 列全受控文件。

---

## 11. 演示模式的主题继承

幻灯片**自动继承应用当前主题与明暗**，无需配置。机制：

```
Slideshow.tsx 改写选择器
  :root.theme-*        →  .yizi-slideshow.theme-*
  :root.theme-*.dark   →  .yizi-slideshow.theme-*.dark
```

### 11.1 继承的是「变量」而非「元素规则」

| 继承 | 不继承 |
|------|--------|
| 主题 CSS 变量（`--editor-bg/text/accent/surface/border/…`、`--font-*`、`--editor-h1/2/3`） | `.editor-content.theme-* <el>` 的**元素级排版规则**（左对齐 / 小字号） |

**原因**：若把元素规则也改写过去，编辑器的「左对齐 / 小字号」会覆盖演示版式的「居中 / 大字号」，导致「标题没居中」。幻灯片的**字号 / 对齐 / 居中由 `slideshow.css` 全权控制**。

### 11.2 设计指引

- 主题作者只需保证**变量正确**，幻灯片即自动跟随换肤。
- **标题颜色**通过 `--editor-h1/h2/h3` 继承（对应各主题 h1/h2/h3 配色，深色另有取值）。
- **不要在主题里写幻灯片选择器**：版式扩展编辑 `src/styles/slideshow.css` 的 `.ys-layout-<类型>` 规则。
- **「自定义主题」同样生效**：HUD 主题菜单里会出现「自定义主题」（user.css 非空时）；其变量 = 基底主题变量块 + user.css 变量块（归一到 `custom` 后合并），元素规则照旧丢弃。

---

## 12. 从零写一个主题：完整示例

以下是一个**功能完整、含区域 + 装饰 + 效果**的主题，可作为进阶模板：

```css
/* ═══════════════════════════════════════════════════════════
   墨玉 (Ink Jade) — 深青绿 + 纸感纹理 + 状态栏流光
   ═══════════════════════════════════════════════════════════ */

/* ── 亮色 ── */
:root.theme-ink-jade {
  /* 基础层 */
  --editor-bg: #f4f8f7;
  --editor-text: #1c2b28;
  --editor-accent: #0f766e;
  --editor-border: #cfe0dc;
  --editor-surface: #eaf2f0;
  --editor-hover: rgba(28, 43, 40, 0.04);
  --editor-selection-bg: rgba(15, 118, 110, 0.22);
  --editor-cursor: #0f766e;
  --editor-h1: #115e59;
  --editor-h2: #0f766e;
  --editor-h3: #0f766e;
  --sidebar-bg: #edf4f2;
  --sidebar-text: #5f7a74;
  --statusbar-bg: #0f766e;
  --statusbar-text: #ecfdf5;

  /* 区域令牌 */
  --toolbar-bg: #f0f6f4;
  --toolbar-fg: #1c2b28;
  --toolbar-fg-muted: #5f7a74;
  --toolbar-border: #d5e5e1;
  --toolbar-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 1px 4px rgba(15, 118, 110, 0.08);

  --tabbar-bg: #e6f0ee;
  --tabbar-active-bg: #f4f8f7;

  --sidebar-border: #d5e5e1;
  --sidebar-blur: none;

  --menu-bg: rgba(255, 255, 255, 0.98);
  --menu-border: #d5e5e1;
  --menu-shadow: 0 8px 26px rgba(15, 118, 110, 0.12), 0 2px 8px rgba(0, 0, 0, 0.05);

  --dialog-bg: #f7fbfa;
  --dialog-border: #d5e5e1;
  --overlay-bg: rgba(10, 30, 27, 0.35);

  /* 装饰层：侧栏纸感细纹 + 状态栏流光 */
  --sidebar-deco-image: var(--texture-paper);
  --sidebar-deco-size: auto;
  --sidebar-deco-repeat: repeat;
  --statusbar-sheen-image: linear-gradient(90deg,
      rgba(45, 212, 191, 0) 0%, rgba(45, 212, 191, 0.42) 40%,
      rgba(20, 184, 166, 0.46) 60%, rgba(15, 118, 110, 0) 100%);
  --statusbar-sheen-size: 200% 100%;
  --statusbar-sheen-anim: deco-sweep 14s ease-in-out infinite;

  /* 效果 / 形状 / 排版 */
  --border-radius: 10px;
  --paragraph-spacing: 1.5em;
  --link-color: #0f766e;
  --quote-bar: #14b8a6;
  --quote-fg: #3f5a55;
  --quote-bg: linear-gradient(160deg, rgba(240, 250, 248, 0.95), rgba(230, 245, 242, 0.8));
  --table-head-bg: rgba(15, 118, 110, 0.07);
  --hr-color: rgba(15, 118, 110, 0.2);

  /* 代码色链（青绿系） */
  --code-keyword: #0e7490;
  --code-string:  #0f766e;
  --code-number:  #7c3aed;
  --code-function:#115e59;
  --code-comment: #94a3b8;

  /* 字体 */
  --font-sans: 'Inter', 'Noto Sans SC', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  --font-size-base: 16px;
  --line-height: 1.8;
}

/* ── 暗色 ── */
:root.theme-ink-jade.dark {
  --editor-bg: #0d1614;
  --editor-text: #cfe3df;
  --editor-accent: #2dd4bf;
  --editor-border: #23403a;
  --editor-surface: #13201d;
  --editor-hover: rgba(255, 255, 255, 0.05);
  --editor-selection-bg: rgba(45, 212, 191, 0.24);
  --editor-cursor: #2dd4bf;
  --editor-h1: #5eead4;
  --editor-h2: #2dd4bf;
  --editor-h3: #2dd4bf;
  --sidebar-bg: #111c1a;
  --sidebar-text: #5f7a74;
  --statusbar-bg: #13201d;
  --statusbar-text: #8fb5ae;

  --toolbar-bg: #111c1a;
  --toolbar-fg: #cfe3df;
  --toolbar-fg-muted: #5f7a74;
  --toolbar-border: #1d332e;
  --toolbar-shadow: inset 0 1px 0 rgba(45, 212, 191, 0.08), 0 1px 3px rgba(0, 0, 0, 0.4);

  --tabbar-bg: #0f1917;
  --tabbar-active-bg: #13201d;

  --sidebar-border: #1d332e;

  --menu-bg: #16241f;
  --menu-border: #23403a;
  --menu-shadow: 0 8px 26px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.25);

  --dialog-bg: #121e1b;
  --dialog-border: #23403a;
  --overlay-bg: rgba(0, 0, 0, 0.55);

  --statusbar-sheen-image: linear-gradient(90deg,
      rgba(94, 234, 212, 0) 0%, rgba(94, 234, 212, 0.4) 40%,
      rgba(45, 212, 191, 0.45) 60%, rgba(20, 184, 166, 0) 100%);

  --quote-bar: #2dd4bf;
  --quote-fg: #8fb5ae;
  --quote-bg: linear-gradient(160deg, #16241f, #0f1917);
  --table-head-bg: rgba(45, 212, 191, 0.08);
  --hr-color: rgba(45, 212, 191, 0.16);
  --link-color: #2dd4bf;

  --code-keyword: #5eead4;
  --code-string:  #2dd4bf;
  --code-number:  #c4b5fd;
  --code-function:#5eead4;
  --code-comment: #64748b;
}

/* ── 结构性装饰（仅无法令牌化者） ── */
.editor-content.theme-ink-jade h1 {
  font-size: 2em;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 1.5em 0 0.5em;
  padding-bottom: 0.3em;
  border-bottom: 2px solid var(--hr-color);
}
.editor-content.theme-ink-jade h2 { font-size: 1.5em; font-weight: 600; margin: 1.3em 0 0.4em; }
.editor-content.theme-ink-jade h3 { font-size: 1.25em; font-weight: 600; margin: 1.2em 0 0.3em; }
.editor-content.theme-ink-jade p  { margin: 0 0 var(--paragraph-spacing); }
```

**注册 + 校验**：

```jsonc
// src-tauri/themes/theme.json
"ink-jade": { "name": "墨玉", "swatch": ["#f4f8f7", "#0f766e"], "desc": "深青绿纸感，状态栏流光" }
```

```bash
node scripts/check-themes.mjs --strict
```

> **不想新建文件？** 把上面整份 CSS 粘到 设置 → 外观 → 自定义 CSS 并保存，即生成「自定义主题」（基底 = 保存时的主题 + 这份 CSS），立即生效 —— 见 §4.2。

---

## 13. 新增主题检查清单

- [ ] 文件放在 `src-tauri/themes/<name>.css`（**不要**放 `src/assets/themes/`）
- [ ] 文件名 == `:root.theme-<name>` == `theme.json` 键，三者一致
- [ ] 亮色块与暗色块**都**存在
- [ ] 所有**颜色令牌**亮暗各声明一次（偶数次）
- [ ] 未使用 `!important` / `[class*=]` / 裸 `z-index`
- [ ] 未写未加作用域的选择器（必须 `.editor-content.theme-<name>` 或 `.theme-<name>`）
- [ ] 未覆盖布局定位属性（`position` / `display` / `inset` / `height`）
- [ ] `theme.json` 条目已添加（`name` / `swatch` / `desc`）
- [ ] `swatch` 取自 `--editor-bg` + `--editor-accent`
- [ ] 若强调色偏亮，已设 `--on-accent`
- [ ] `node scripts/check-themes.mjs --strict` **零失败、零告警**
- [ ] dev 模式下确认主题 CSS 已注入（`<style id="yizimarkdown-theme-css">`）
- [ ] 明暗两侧都**目视**检查过（顶栏 / 标签栏 / 侧栏 / 状态栏 / 菜单 / 弹窗 / 代码块）

---

## 14. 不走文件：自定义主题（用户侧）

用户无需碰文件系统即可获得新主题 —— 设置 → 外观 → 自定义 CSS：

| 用法 | 写法 | 结果 |
|---|---|---|
| **粘贴整份主题** | 直接粘任何主题文件的全文（`:root.theme-x` / `.editor-content.theme-x h1` 均可） | 选择器自动归一到 `theme-custom`，立即呈现该主题观感 |
| **微调当前主题** | `:root { --editor-accent: #e11d48; }` 等裸选择器 | 自动提权（`:root.theme-custom` 前缀），稳定压过基底主题 |
| **清空** | 删光内容保存 | 「自定义主题」条目消失，回落基底主题 |

机制细节见 §4.2 / §4.5。对主题作者而言，这也是**最快的主题预览方式**：写好 CSS 粘进去看效果，满意了再落成正式主题文件。

---

## 附录 A：令牌总表

> 快速检索用。**类型**：`C`=颜色（需亮暗配对）、`S`=尺寸 / 形状、`F`=字体、`V`=任意值。
> **状态**：`●`=已接入消费点、`○`=已声明待接入（声明不报错但暂不生效）。

### A.1 基础层

| 令牌 | 类型 | 默认（亮） | 状态 |
|------|:----:|-----------|:----:|
| `--editor-bg` | C | `#ffffff` | ● |
| `--editor-text` | C | `#333333` | ● |
| `--editor-accent` | C | `#0066cc` | ● |
| `--editor-border` | C | `#e5e5e5` | ● |
| `--editor-surface` | C | `#f8f8f8` | ● |
| `--editor-hover` | C | `rgba(0,0,0,0.03)` | ● |
| `--editor-selection` | C | `#0066cc` | ○ 死旋钮 |
| `--editor-selection-bg` | C | `rgba(0,102,204,0.35)` | ● |
| `--editor-cursor` | C | `#0066cc` | ● |
| `--editor-h1` / `--editor-h2` / `--editor-h3` | C | （无，回退正文） | ● |
| `--sidebar-bg` | C | `#fafafa` | ● |
| `--sidebar-text` | C | `#666666` | ● |
| `--statusbar-bg` | V | `#f5f5f5` | ● 接受渐变 |
| `--statusbar-text` | C | `#888888` | ● |
| `--sel-toolbar-bg` | C | `#ffffff` | ● 明暗无关 |
| `--sel-toolbar-text` | C | `#333333` | ● 明暗无关 |
| `--sel-toolbar-border` | C | `#e5e5e5` | ● 明暗无关 |
| `--sel-toolbar-hover` | C | `rgba(0,0,0,0.03)` | ● 明暗无关 |
| `--sel-toolbar-accent` | C | `#0066cc` | ● 明暗无关 |

### A.2 圆角

| 令牌 | 类型 | 默认 | 状态 |
|------|:----:|------|:----:|
| `--border-radius` | S | `8px`（回退） | ● 主题输入 |
| `--radius-xs` | S | `md-4px` | ● |
| `--radius-sm` | S | `md-2px` | ● |
| `--radius-md` | S | `var(--border-radius, 8px)` | ● |
| `--radius-lg` | S | `md+4px` | ● |
| `--radius-xl` | S | `md+8px` | ● |
| `--radius-full` | S | `9999px` | ● |

### A.3 区域令牌

> `○` 标记的是**已声明但尚无消费点**的令牌（`--toolbar-active` / `--sidebar-hover` / `--sidebar-accent` / `--menu-fg` / `--menu-fg-muted`）。声明它们不报错、也暂不生效；当前主题可忽略。

| 区域 | 令牌 | 默认 | 状态 |
|------|------|------|:----:|
| toolbar | `--toolbar-bg` / `-fg` / `-fg-muted` / `-border` / `-accent` / `-hover` / `-shadow` | 回退基础层 | ● |
| toolbar | `--toolbar-active` | 回退基础层 | ○ 待接入 |
| tabbar | `--tabbar-bg` / `-fg` / `-fg-hover` / `-fg-active` / `-border` / `-accent` / `-hover` / `-active-bg` | 回退基础层 | ● |
| sidebar | `--sidebar-border` / `-shadow` / `-blur` | 回退基础层 | ● |
| sidebar | `--sidebar-hover` / `--sidebar-accent` | 回退基础层 | ○ 待接入 |
| statusbar | `--statusbar-border` | `transparent` | ● |
| menu | `--menu-bg` / `-border` / `-hover` / `-shadow` | 回退基础层 | ● |
| menu | `--menu-fg` / `--menu-fg-muted` | 回退基础层 | ○ 待接入 |
| dialog | `--dialog-bg` / `-border` / `-shadow` | 回退基础层 | ● |
| overlay | `--overlay-bg` | `rgba(0,0,0,0.35)` | ● |

### A.4 装饰层

> 消费点齐全（四个区域的 deco + 两个区域的 sheen），已实际启用并经渲染验证（计算样式 + 像素差分；启用者为测试主题 brocade，见 §3.3）。

| 区域 | 令牌 | 默认 | 状态 |
|------|------|------|:----:|
| toolbar | `--toolbar-deco-image` / `-size` / `-repeat` / `-blend` | `none` / `auto` / `repeat` / `normal` | ● 已验证 |
| toolbar | `--toolbar-sheen-image` / `-size` / `-anim` | `none` / `200% 100%` / `none` | ● prism 已用 |
| tabbar | `--tabbar-deco-image` / `-size` / `-repeat` / `-blend` | 同上 | ● 已验证 |
| sidebar | `--sidebar-deco-image` / `-size` / `-repeat` / `-blend` | 同上 | ● 已验证 |
| statusbar | `--statusbar-deco-image` / `-size` / `-repeat` / `-blend` | 同上 | ● 已验证 |
| statusbar | `--statusbar-sheen-image` / `-size` / `-anim` | 同上 | ● prism 已用 |
| — | keyframes `deco-sweep` / `deco-sweep-back` / `deco-pulse` / `deco-drift` | — | ● 已验证 |

### A.5 效果令牌

| 令牌 | 类型 | 默认 | 状态 |
|------|:----:|------|:----:|
| `--shadow-1` / `--shadow-2` / `--shadow-3` | V | 三级阴影 | ○ 待接入 |
| `--dur-fast` / `--dur-normal` / `--dur-slow` | S | `0.15s` / `0.25s` / `0.4s` | ○ 待接入 |
| `--ease-standard` / `--ease-out` | V | 缓动函数 | ○ 待接入 |
| `--texture-none` / `-diagonal` / `-grid` / `-dots` / `-paper` / `-shine` | V | 纹理预设 | ● grid/dots/paper 已验证（brocade） |

### A.6 代码 / 语法令牌

| 令牌 | 默认 | 状态 |
|------|------|:----:|
| `--code-keyword` | `#d73a49` | ● |
| `--code-type` | `#d73a49` | ● |
| `--code-string` | `#032f62` | ● |
| `--code-number` | `#005cc5` | ● |
| `--code-constant` | `#005cc5` | ● |
| `--code-builtin` | `#e36209` | ● |
| `--code-function` | `#6f42c1` | ● |
| `--code-tag` | `#22863a` | ● |
| `--code-comment` | `#6a737d` | ● |
| `--code-variable` | `#005cc5` | ● |
| `--code-attr` | `#005cc5` | ● |
| `--code-operator` | `#005cc5` | ● |
| `--code-punct` | `var(--editor-text)` | ● |
| `--code-heading` | `var(--editor-accent)` | ● |
| `--code-link` | `var(--editor-accent)` | ● |
| `--code-strong` | `var(--editor-text)` | ● |
| `--code-emphasis` | `var(--editor-text)` | ● |
| `--code-inline-fg` | `var(--editor-accent)` | ● |
| `--code-quote-fg` | `var(--sidebar-text)` | ● |
| `--code-quote-bar` | `var(--editor-accent)` | ● |
| `--code-quote-bg` | `var(--editor-surface)` | ● |
| `--code-inline-bg` | `color-mix(…)` | ● |
| `--code-block-bg` | `color-mix(…)` | ● |
| `--code-selection-bg` | `rgba(0,0,0,0.1)` | ● |
| `--code-active-line` | `rgba(0,0,0,0.03)` | ● |
| `--code-search-match` | `rgba(255,213,0,0.3)` | ● |
| `--code-search-match-border` | `rgba(255,213,0,0.6)` | ● |
| `--code-search-active` | `rgba(255,150,0,0.4)` | ● |

### A.7 预览排版令牌

| 令牌 | 默认 | 状态 |
|------|------|:----:|
| `--h1-color` | `var(--editor-h1, var(--editor-text))` | ● |
| `--link-color` | `var(--editor-accent)` | ● |
| `--strong-color` | `var(--editor-text)` | ● |
| `--quote-fg` | `var(--editor-text)` | ● |
| `--quote-bar` | `var(--editor-accent)` | ● |
| `--quote-bg` | `transparent` | ● 接受渐变 |
| `--inline-code-fg` | `var(--editor-text)` | ● |
| `--inline-code-bg` | `var(--editor-surface)` | ● |
| `--code-pre-bg` | `var(--editor-surface)` | ● |
| `--hr-color` | `var(--editor-border)` | ● |
| `--table-border` | `var(--editor-border)` | ● |
| `--table-head-bg` | `var(--editor-surface)` | ● |

### A.8 字体与语义色

| 令牌 | 类型 | 默认 | 状态 |
|------|:----:|------|:----:|
| `--font-ui` | F | 主题界面字体栈 | ● |
| `--font-editor` | F | `var(--font-sans)` | ● |
| `--font-preview` | F | `var(--font-sans)` | ● |
| `--font-heading` | F | `var(--font-preview)` | ● |
| `--font-sans` | F | 主题字体栈 | ● 回退源 |
| `--font-mono` | F | `'JetBrains Mono', …` | ● |
| `--font-serif` | F | `'Playfair Display', …` | ● |
| `--font-size-base` | S | `16px` | ● 明暗无关 |
| `--line-height` | S | `1.8` | ● 明暗无关 |
| `--paragraph-spacing` | S | `1.5em` | ● 明暗无关 |
| `--danger` | C | `#dc2626` | ● |
| `--warn` | C | `#f59e0b` | ● |
| `--success` | C | `#10b981` | ● |
| `--on-accent` | C | `#ffffff` | ● |

### A.9 JS 运行时注入（不在 globals.css 声明）

| 令牌 | 注入点 |
|------|--------|
| `--cursor-arrow` / `--cursor-standard` / `--cursor-bold` | `themeCursor.ts` |
| `--preview-font-size` / `--preview-line-height` | `App.tsx` |
| `--font-mono` | `App.tsx` |

---

## 附录 B：相关文件索引

| 文件 | 角色 |
|------|------|
| `src-tauri/themes/*.css` | 15 个正式主题实现（运行时唯一读取目录；另有测试主题 `brocade.css`，见 §3.3） |
| `src-tauri/themes/theme.json` | 主题元数据注册表（14 条；`academic` 除外） |
| `src/styles/globals.css` | 基准令牌全集 + 组件消费点 + 装饰 keyframes |
| `src/styles/hljs-theme.css` | 代码高亮 → `--code-*` 的消费点 |
| `src/styles/export-toc.css` | HTML 导出大纲侧栏（消费 `--menu-*` / `--radius-*`） |
| `src/styles/slideshow.css` | 幻灯片版式（全权控制字号 / 对齐 / 居中） |
| `tailwind.config.ts` | prose `--tw-prose-*` → 预览排版令牌的桥接 |
| `src/lib/themeOrder.ts` | `DEFAULT_THEME` + 列表归位 |
| `src/lib/themeLoader.ts` | 主题样式唯一注入入口（含「自定义主题」合成） |
| `src/lib/userCss.ts` | 选择器归一 / 提权（`normalizeUserCss` / `retargetThemeCss`） |
| `src/lib/themeCursor.ts` | 主题色光标生成（注入 `--cursor-*`） |
| `scripts/check-themes.mjs` | 六项一致性门禁 |
| `src/components/SettingsModal.tsx` | 主题列表 UI（含「自定义主题」条目）+ `academic` 内置元数据 |
| `src/components/Slideshow.tsx` | 主题选择器改写（`:root.theme-*` → `.yizi-slideshow.theme-*`）+ custom 支持 |
| `tests/userCss.test.ts` | 归一 / 提权的 16 条单测 |
| `docs/slideshow-style-mapping.md` | 演示模式：Markdown → 版式对照 |

---

*本文档描述 v0.3.2+ 的主题系统。新增令牌或改变分层时，请同步更新本文件与 `scripts/check-themes.mjs`。*


