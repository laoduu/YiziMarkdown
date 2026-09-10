# YiziMarkdown

![image](https://github.com/laoduu/YiziMarkdown/raw/main/docs/index.png)

[简体中文](../readme.md) | [繁體中文](./readme-zh-TW.md) | [English](./readme-en.md) | [日本語](./readme-ja.md) | [한국어](./readme-ko.md) | [Deutsch](./readme-de.md) | [Français](./readme-fr.md) | [Español](./readme-es.md) | [Português](./readme-pt.md) | [Italiano](./readme-it.md) | [Polski](./readme-pl.md) | [Nederlands](./readme-nl.md) | [Türkçe](./readme-tr.md) | [Svenska](./readme-sv.md) | [Українська](./readme-uk.md)

**官方網站：** https://md.yizigpt.com

一款簡潔精緻的跨平台 `Markdown` 編輯器，支援 Windows 便攜版與 macOS 版本。免安裝，解壓即用，兼顧顏值與實用。Windows 可安裝，也可下載壓縮包解壓即用；macOS 提供通用二進位安裝包，Intel 與 Apple Silicon 均原生運行。

為什麼要開發一款 `Markdown` 編輯器？

市面上不少 `Markdown` 編輯器，要么介面觀感欠佳，要么功能繁雜臃腫，很難找到一款兼顧簡潔美觀、上手順手的編輯工具。

於是便有了 YiziMarkdown。

我們為所見即所得模式，創造了一種極為優雅的體驗；同時支援類 PPT 快捷演示能力，寫好的筆記文件可以快速切換演示模式，方便做分享匯報。試過才知道。

---

## 功能特性

### 多語言介面

- **15 種介面語言**：簡體中文（預設）、繁體中文、English、日本語、한국어、Deutsch、Français、Español、Português、Italiano、Polski、Nederlands、Türkçe、Svenska、Українська
- 設定 → 通用 → 介面語言一鍵切換，即時生效；全部介面文案、快捷鍵面板、插件說明隨語言聯動

### AI 助手（側邊聊天面板）

- **17 家大模型供應商 + 自訂服務**：OpenAI、Anthropic、Gemini、xAI、Mistral、Groq、DeepSeek、通義千問、智譜 GLM、Moonshot Kimi、火山方舟、矽基流動、MiniMax、OpenRouter、OpenCode Go、Ollama（本地）；「自訂服務」支援 OpenAI 相容 / Anthropic 相容兩種協議，自填 Base URL、模型 ID 與密鑰，可接任意第三方服務
- **AI 技能（Skill）**：輸入框 ⚡ 按鈕彈出技能選單，選中後技能 tag 插入游標處，提示詞自動注入上下文；`skills/` 目錄放入 `skills.json` + `.md` 提示詞即可自訂技能。內建「演示稿提煉」「文件摘要」「潤色改寫」3 個技能
- **串流對話**：工具列機器人按鈕打開右側 AI 面板，回覆即時串流輸出，可隨時停止
- **思考過程展示**：推理模型的思考內容（reasoning/thinking）以可折疊區塊展示，預設收起，不影響正文閱讀
- **密鑰安全**：API 密鑰存系統鑰匙圈（OS keychain），支援一鍵儲存、清除、驗證；本地端點（llama.cpp / LM Studio / vLLM 等）密鑰可留空
- **引用目前文件**：勾選後把目前文件作為上下文發送給 AI，可配置引用上限（64K~512K/不限）和上下文輪數（0~20輪，預設3輪）
- **結果落盤**：回覆可複製、插入到文件游標處、或一鍵建立為新文件

### 編輯與預覽

- **原始碼編輯**：CodeMirror 6 核心，語法高亮、括號匹配、自動補全
- **即時模式（WYSIWYG）**：所見即所得編輯，輸入時自動隱藏 Markdown 標記，專注內容創作
- **即時模式動畫**：4種標記顯現動畫方案（聚焦/閃光/輝光/漣漪），設定中可預覽切換
- **即時預覽**：Markdown 即寫即渲染，支援任務列表 checkbox 互動
- **五種視圖模式**：原始碼 / 並排 / 即時（所見即所得） / 預覽 / 演示（全屏幻燈片），一鍵切換
- **大綱驅動滾動同步**：並排模式下左右面板雙向聯動，切換視圖時自動定位到目前位置
- **搜尋替換**：支援匹配項導航、全部替換
- **工具列快捷格式**：粗體、斜體、刪除線、行內代碼，選中文字即裹即用
- **本地圖片渲染**：預覽模式自動渲染本地路徑圖片（jpg/png/gif/webp/svg/bmp）
- **行號 / 自動換行**：均可在設定中開關
- **代碼塊增強**：語法高亮（highlight.js）、語言標籤、複製按鈕、自動換行切換
- **格式工具列折疊**：視窗寬度不足時自動折疊，支援手動展開/收起
- **Frontmatter 過濾**：預覽/並排/即時模式自動過濾 YAML frontmatter

### 數學公式與圖表

- **KaTeX 公式**：內建 KaTeX 插件，行內 `$...$` 和區塊 `$$...$$` LaTeX 公式即時渲染
- **Mermaid 圖表**：內建 Mermaid 插件，流程圖、時序圖、甘特圖、類圖、圓餅圖等自動渲染為視覺化圖表，支援多種主題配置
- **表格行列選擇器**：工具列表格按鈕打開 8×8 網格，滑鼠點選即插入對應行列數的表格

### 演示模式（幻燈片）

- **純 Markdown 驅動**：不需要任何額外格式，`---`（水平分割線）分頁，引擎分析整頁結構自動選擇版式
- **14 種自動版式**：封面、章節頁、結尾頁、目錄、內容、列表、資料表、路線圖、圖文、圖片、金句、代碼、圖表（mermaid）、公式
- **內容頁左對齊 + 強調底線**：標題左上對齊帶主題色底線，正文左對齊，閱讀舒適
- **金句頁對角大引號**：上引號掛左上角、下引號掛右下角，內容上下居中
- **顯式指令**：`<!-- layout: xxx -->` 強制版式、`<!-- align: left|center|right -->` 整頁對齊（HTML 註解，渲染不可見）
- **封面 meta**：front matter 提供 `author`/`date`，封面自動顯示
- **頁腳與進度**：左下角章節名 + 頁碼，底部主題色進度條
- **滑鼠滾輪翻頁**：內容可滾動時先滾內容，到邊界再翻頁
- **主題繼承**：標題顏色隨主題精確變化（15 個主題均支援），演示內可切換主題/明暗
- **全屏切換**：F 鍵全屏/還原，支援從任意視窗狀態（普通/最大化）可靠進入
- **退出按鈕**：滑鼠活動時右上角顯示半透明退出按鈕，1.5 秒無操作自動隱藏
- **視窗狀態還原**：退出演示時自動還原到進入前的視窗狀態（全屏/最大化/普通）

### 插件系統

- 插件化架構，內建 KaTeX 和 Mermaid 兩個核心插件
- 設定面板「插件」頁支援啟停控制和插件配置
- 插件按需動態載入，未啟用不佔用資源

### 多文件管理

- **單實例模式**：多文件打開不再啟動多個視窗，自動合併到已有實例，重複打開的文件自動定位到對應標籤頁
- **Tab 標籤欄**：頂部管理多個打開的文件，切換、關閉、新建
- **首頁**：最近打開的文件列表，含文件大小和修改時間
- **儲存狀態指示**：未儲存文件呼吸圓點動畫，儲存後 ✅ 確認動畫
- **關閉確認**：未儲存文件關閉時彈出儲存 / 不儲存 / 取消確認

### 文件操作

- **打開**：支援 .md / .markdown / .txt
- **新建**：新建空白 Tab，顯示「未命名新文件」
- **從範本新建**：工具列「從範本新建」下拉選單，按所選範本的 Markdown 結構建立新文件；也可在 設定 → 通用 設定預設範本，之後 `Ctrl+N` 自動套用
- **儲存 / 自動儲存**：手動儲存 + 可配置間隔的自動儲存（5~180 秒，預設 60 秒）
- **另存新檔**：新文件儲存時自動彈出另存新檔對話框
- **匯出**：HTML / Markdown / 純文字三種格式
- **.md 文件關聯**：設定中一鍵設為系統預設 Markdown 編輯器，雙擊 .md 直接打開（Windows 登錄檔 / macOS LaunchServices）

### 外觀定製

- **十五套內建主題**：學術藍（預設）、活力橙、科技感、極簡風、雜誌感、自然風、液態玻璃、荔枝紅、紫羅蘭、賽博朋克、Facebook、駭客帝國、薄荷冰沙、落日熔金、復古打字機，每套均有亮暗兩套配色
- **深色 / 亮色模式**：每套主題均有亮暗兩套配色
- **字體定製**：原始碼和預覽模式分別設定字體、字號、行高
- **自訂 CSS**：`user.css` 覆蓋在所有主題之後，優先級最高
- **主題擴展**：`themes/` 目錄放入 `.css` 檔案，並在 `themes/theme.json` 中添加主題參數，重啟後自動識別

### 其他

- **文件範本**：`templates/` 目錄放入 `.md` 檔案，新建時可選擇
- **快捷鍵系統**：視覺化快捷鍵配置面板，支援 30 個 action 的自訂綁定、按鍵錄製、衝突檢測和恢復預設
- **設定面板**：通用、外觀、編輯器、即時模式、AI、插件、快捷鍵、範本、關於等多個標籤頁，設定即時預覽

---

## 快捷鍵

| 快捷鍵 | 功能 |
|--------|------|
| Ctrl+N | 新建文件 |
| Ctrl+O | 打開文件 |
| Ctrl+S | 儲存文件 |
| Ctrl+Shift+S | 另存新檔 |
| Ctrl+W | 關閉標籤 |
| Ctrl+H | 匯出 HTML |
| Ctrl+M | 匯出 Markdown |
| Ctrl+Z | 復原 |
| Ctrl+Y | 重做 |
| Ctrl+F | 搜尋 |
| Ctrl+\ | 切換側邊欄 |
| Ctrl+B | 粗體 |
| Ctrl+I | 斜體 |
| Ctrl+- | 刪除線 |
| Ctrl++ | 行內代碼 |
| Ctrl+1 | 一級標題 |
| Ctrl+2 | 二級標題 |
| Ctrl+3 | 三級標題 |
| Ctrl+. | 無序列表 |
| Ctrl+0 | 有序列表 |
| Ctrl+' | 引用 |
| Ctrl+K | 連結 |
| Ctrl+` | 代碼塊 |
| Ctrl+T | 表格 |
| Ctrl+L | 分割線 |
| F1 | 快捷鍵大全 |
| F2 | 切換深淺模式 |
| F3 | 循環切換視圖 |
| Ctrl+Alt+P | 演示模式（幻燈片） |
| Ins | 斜線選單 |
| F12 | 開發者工具 |

快捷鍵可在 設定 → 快捷鍵 中自訂，支援視覺化配置和衝突檢測。

---

## 便攜版目錄結構

```
YiziMarkdown/
├── YiziMarkdown.exe        # 主程式
├── readme.md               # 專案說明（本文件）
├── welcome.md              # 歡迎文件
├── changelog.md            # 開發日誌
├── user.css                # 使用者自訂樣式
├── keybindings.json        # 快捷鍵配置
├── themes/                 # 主題 CSS 檔案
│   ├── academic.css        # 學術藍（預設）
│   ├── vibrant.css         # 活力橙
│   ├── tech.css            # 科技感
│   ├── minimal.css         # 極簡風
│   ├── magazine.css        # 雜誌感
│   ├── nature.css          # 自然風
│   ├── liquidglass.css     # 液態玻璃
│   ├── lychee.css          # 荔枝紅
│   ├── violet.css          # 紫羅蘭
│   ├── cyberpunk.css       # 賽博朋克
│   ├── facebook.css        # Facebook
│   ├── matrix.css          # 駭客帝國
│   ├── mint.css            # 薄荷冰沙
│   ├── sunset.css          # 落日熔金
│   └── typewriter.css      # 復古打字機
├── skills/                 # AI 技能（Skill）
│   ├── skills.json         # 技能清單
│   ├── slides-outline.md   # 演示稿提煉
│   ├── doc-summary.md      # 文件摘要
│   └── polish-writing.md   # 潤色改寫
└── templates/              # 文件範本
    └── default.md          # 預設範本
```

---

## 技術棧

| 層級 | 技術 |
|------|------|
| 桌面框架 | Tauri 2 (Rust) |
| 前端框架 | React 18 + TypeScript |
| 編輯器核心 | CodeMirror 6 |
| 狀態管理 | Zustand (persist) |
| 樣式方案 | Tailwind CSS + CSS 變數 |
| Markdown 渲染 | markdown-it |
| 國際化 | 自研輕量 i18n（15 語言） |
| AI 接入 | Rust 串流代理（OpenAI/Anthropic/Ollama 協議） |
| 建置工具 | Vite |

---

## 開發

### 環境要求

- Node.js 18+
- Rust (stable)
- Tauri CLI (`npm install -g @tauri-apps/cli`)

### 啟動開發伺服器

```bash
cd code
npm install
npm run tauri:dev
```

### 建置發行版

**Windows**

```bash
npm run tauri:build
```

建置產物：
- 便攜版 exe：`src-tauri/target/release/yizimarkdown.exe`
- MSI 安裝包：`src-tauri/target/release/bundle/msi/`
- NSIS 安裝包：`src-tauri/target/release/bundle/nsis/`

建置後手動複製 exe 和資源檔案到 `public/YiziMarkdown-vX.X.X/` 目錄分發。

**macOS（通用二進位，同時支援 Intel 與 Apple Silicon）**

```bash
rustup target add aarch64-apple-darwin
npm run tauri:build -- --target universal-apple-darwin
```

建置產物：
- 應用包：`src-tauri/target/universal-apple-darwin/release/bundle/macos/YiziMarkdown.app`
- 安裝包：`src-tauri/target/universal-apple-darwin/release/bundle/dmg/YiziMarkdown_0.2.2_universal.dmg`

### 專案結構

```
code/
├── src/                    # 前端原始碼
│   ├── App.tsx             # 主應用組件
│   ├── components/         # UI 組件
│   │   ├── Editor.tsx      # CodeMirror 編輯器 + 預覽
│   │   ├── TabBar.tsx      # Tab 標籤欄
│   │   ├── HomePage.tsx    # 首頁（最近文件）
│   │   ├── Toolbar.tsx     # 工具列
│   │   ├── Sidebar.tsx     # 側欄（大綱 + 文件瀏覽）
│   │   ├── StatusBar.tsx   # 底部狀態列
│   │   └── SettingsModal.tsx # 設定面板
│   ├── stores/             # Zustand 狀態管理
│   ├── lib/                # 工具庫（markdown 渲染、標題 ID）
│   └── styles/             # 全局樣式
├── src-tauri/              # Rust 後端
│   ├── src/main.rs         # Tauri 命令（檔案讀寫、主題載入、登錄檔等）
│   ├── icons/              # 應用圖示
│   ├── themes/             # 主題 CSS
│   └── templates/          # 文件範本
└── package.json
```

---

## 許可

MIT