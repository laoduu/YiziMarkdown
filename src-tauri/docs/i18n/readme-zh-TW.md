# YiziMarkdown


![image](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/index.png)

[简体中文](../../readme.md) | [繁體中文](./readme-zh-TW.md) | [English](./readme-en.md) | [日本語](./readme-ja.md) | [한국어](./readme-ko.md) | [Deutsch](./readme-de.md) | [Français](./readme-fr.md) | [Español](./readme-es.md) | [Português](./readme-pt.md) | [Italiano](./readme-it.md) | [Polski](./readme-pl.md) | [Nederlands](./readme-nl.md) | [Türkçe](./readme-tr.md) | [Svenska](./readme-sv.md) | [Українська](./readme-uk.md) | [Русский](./readme-ru.md)

**官方網站：** https://md.yizigpt.com

YiziMarkdown 是一款以「寫作」為中心的跨平台 Markdown 編輯器。同一份 `.md` 檔案，提供七種呈現方式：`原始碼編輯`、`並排校對`、`即時書寫`、`成品預覽`、`簡報播放`、`成書閱讀`，以及只留下文字、專注寫作的`禪模式`。

- **Windows**：可安裝（NSIS 安裝程式，支援應用程式內一鍵更新），也可下載壓縮包解壓即用
- **macOS**：提供通用二進位安裝包，Intel 與 Apple Silicon 均原生執行
- **Linux**：提供 Debian 系 `deb` 與免安裝 `AppImage`（Ubuntu 22.04+ / Debian 12+，目前僅 amd64）

為什麼要開發一款 Markdown 編輯器？市面上的選擇，不是介面觀感欠佳，就是功能繁雜臃腫，很難找到一款兼顧簡潔美觀與順手好用的工具。於是有了 YiziMarkdown，並堅持三件事：**介面好看**、**功能強悍**、**場景多元**。

於是有了現在的 `YiziMarkdown`，涵蓋 `3 種系統`、`7 種使用模式`、`16 種介面語言`、`15 種明暗雙色主題`、`5 種 AI Skill`、`7 種匯出格式`；此外還內建 AI 助手、雲端儲存等創新功能，以及主題、技能、簡報等開放文件，讓您可以組合出更多與眾不同的使用體驗。

這已經不再是一個簡單的 Markdown 編輯器，而是一款真正能涵蓋您創作、工作、生活多種文件場景的多功能應用。

---

## 七種模式：一份文件，七種呈現

Markdown 的價值不只在「寫」，也在「給誰看、怎麼看」。YiziMarkdown 為同一份文件提供七種呈現方式：前四種是編輯視圖，在原始碼與成品之間來回切換；後三種是獨立場景，把文件變成簡報、書頁，或乾脆只剩正文。

| 模式 | 一句話定位 | 入口 | 適合 |
|------|-----------|------|------|
| 原始碼 | 直接編輯原始 Markdown | `F3` / 視圖按鈕 | 精修結構、批次取代、改 frontmatter |
| 並排 | 左邊寫，右邊即時對照 | `F3` / 視圖按鈕 | 校對排版、對照範本寫作 |
| 即時 | 所見即所得，標記自動隱藏 | `F3` / 視圖按鈕 | 長文創作、專注寫作 |
| 預覽 | 只呈現最終排版 | `F3` / 視圖按鈕 | 檢查成品、通讀全文 |
| 簡報 | 文件直接當投影片播放 | `Ctrl+Alt+P` / 工具列 | 分享、匯報、授課 |
| 閱讀 | 把文件排成一本可翻的書 | `Ctrl+Alt+R` / 工具列 | 長文閱讀、EPUB、沉浸式通讀 |
| 禪 | 撤掉整個介面，只留文字 | `F9` / 工具列 | 深度寫作 |

`F3` 在原始碼 / 並排 / 即時 / 預覽之間循環；簡報、閱讀、禪各有獨立入口，彼此不衝突。

---

## Markdown 四項全能

![四種模式對比](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/4modes.webp)

原始碼、並排、即時、預覽共用同一個編輯器核心與同一套 Markdown 能力，差別只在「資訊密度」：從完全裸露的標記，到完全排好的成品。隨時可以切換，切換時視圖會盡量保持目前位置。

### 原始碼模式：該看到的都看到

- CodeMirror 6 核心：語法突顯、括號配對、自動完成
- 行號、自動換行可獨立開關；適合逐行精修與批次改寫
- YAML frontmatter 原樣顯示，改中繼資料不必猜格式
- 表格、程式碼區塊、公式都以原始碼呈現，結構複雜時最可控

### 並排模式：邊寫邊對

- 左側原始碼、右側預覽，輸入即重新整理
- 捲動同步由大綱驅動，切換視圖時自動定位到目前位置
- 適合校對排版、對照既有文件改結構

### 即時模式：所見即所得

- 輸入時自動隱藏 Markdown 標記，游標離開後又恢復，專注內容本身
- 4 種標記顯現動畫（聚焦 / 閃光 / 輝光 / 漣漪），可在設定中預覽與切換
- YAML front matter 呈現為 Obsidian 式可編輯屬性面板：自動 / 文字 / 數字 / 核取方塊 / 日期 / 日期和時間 / 清單 7 種類型，類型依屬性名稱全域記憶

### 預覽模式：只看成品

- Markdown 即寫即呈現，任務清單核取方塊可直接點選
- 本機路徑圖片、網路圖片、SVG 均自動呈現（jpg / png / gif / webp / svg / bmp）
- frontmatter 自動隱藏，看到的就是最終版式

### 四種視圖共用的能力

- **搜尋取代**：符合項目導覽、全部取代
- **工具列格式化**：粗體、斜體、刪除線、行內程式碼，選取即套用
- **程式碼區塊增強**：highlight.js 語法突顯、語言標籤、複製按鈕、自動換行切換
- **表格選擇器**：8×8 格線點選插入，欄列數一目了然
- **公式與圖表**：KaTeX 行內 `$...$` / 區塊 `$$...$$`，Mermaid 流程圖、時序圖、甘特圖、類別圖、圓餅圖等，配色跟隨主題
- **格式工具列收合**：視窗變窄時自動收起，也可手動展開
- **行號與自動換行**：設定中可開關
- **大綱導覽**：標題層級來自文件結構，與捲動位置連動

---

## 簡報模式：把筆記直接講成投影片

![簡報模式](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/slide.webp)

寫好的筆記不必再匯出到 PPT：切到簡報模式，文件立刻變成全螢幕投影片。分頁、分欄、版式都由 Markdown 結構自動推斷，需要精確控制時再用 HTML 註解指令。

### 內容即投影片

- 不需要任何額外格式：`---`（水平分隔線）分頁
- 頁內單獨成行的 `***` 分欄，最多 4 欄
- 引擎分析整頁結構，自動選擇版式：標題、清單、表格、程式碼、圖片、圖表各有對應版式

### 14 種版式

封面、章節頁、結尾頁、目錄、內容、清單、資料表、路線圖、圖文、圖片、金句、程式碼、圖表（Mermaid）、公式。

- 除「圖文」需用 `<!-- layout: figure -->` 明確指定外，其餘版式均由內容自動推斷
- 內容頁左對齊，標題帶主題色底線
- 金句頁對角大引號：上引號掛左上、下引號掛右下，內容上下置中
- 封面自動讀取 front matter 的 `author` / `date`

### 播放中的排版控制

- HUD 可調：字型（跟隨主題 / 無襯線 / 襯線 / 等寬）、字重、字級、內容區寬高（50%~95%）
- 調整即時生效並持久化，下次播放沿用
- 過長的行內程式碼自動換行，不再被頁面邊緣截斷
- 明確指令：`<!-- layout: xxx -->` 強制版式，`<!-- align: left|center|right -->` 整頁對齊

### 播放與導覽

- 左下角章節名稱 + 頁碼，底部主題色進度條
- `T` 開啟目錄抽屜，`G` 或底部輸入框跳頁
- 滑鼠滾輪翻頁：內容可捲動時先捲內容，到邊界再翻頁
- `F` 全螢幕 / 還原，支援從一般、最大化等任意視窗狀態進入
- 結束後自動還原進入前的視窗狀態；右上角結束按鈕 1.5 秒無操作自動隱藏
- 主題繼承：標題配色隨主題變化，播放中也能切換主題與明暗

---

## 閱讀模式：把文件排成一本可翻的書

![閱讀模式](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/reading.webp)

閱讀模式不是「全螢幕預覽」，而是真的把正文排成固定頁面：有封面、扉頁、目錄、頁碼，有紙張與翻頁的動效。

- 入口：工具列書本按鈕或 `Ctrl+Alt+R`；`Esc` 結束並還原原視圖
- 版面：四邊等邊距的細邊框包住書頁，雙頁相連、中縫只有一條分隔線；書名在左上、章名 / 頁碼在左下、HUD 在右下，位置與簡報模式一致
- 自動產生封面、扉頁、目錄頁：書名取自 front matter `title` 或首個 H1，目錄按標題產生並帶頁碼，過長自動分頁
- 真實分頁：雙頁對開（窄視窗自動單頁），有頁碼與閱讀進度

### 翻頁動畫

4 種可選，設定中切換，預設為水平滑動：

- **水平滑動**（預設）：整頁平移，乾脆俐落
- **3D 翻頁**：書葉從右下角捲起、繞中縫彎折，翻動時紙面抬升、帶受光與落影（單頁模式繞書脊）
- **淡入淡出** / **縮放**：更安靜的過渡

連按不會跳頁；目錄、頁碼、腳註等跳轉不播放動畫。

### 書頁級分頁規則

段落按行拆分、標題不孤行、表格續頁重複表頭、程式碼區塊按行續排、清單按項目續排、整塊圖片等比縮放；正文段落自動首行縮排兩字，續頁不重複縮排。

### 導覽與細節

- 目錄抽屜：`T` 開啟，按標題層級列出並標註頁碼，點擊直達
- `G` 或頁碼輸入框跳到指定頁
- 腳註往返：點擊引用跳到定義頁並突顯，提供「返回引用」按鈕；內部錨點同樣按頁跳轉
- 閱讀 HUD：右下角切換明暗、主題、字型（主題 / 襯線 / 無襯線 / 等寬）、字級與行距，只作用於本次閱讀
- 位置記憶：依文件記住頁碼 / 章節，再次進入自動恢復
- 操作：方向鍵、PageUp / PageDown、空白鍵、滾輪翻頁，點擊頁面左右邊緣也可翻頁

### EPUB

開啟 `.epub` 直接進入閱讀模式：使用應用程式閱讀主題（忽略出版社 CSS），讀取內嵌封面、導覽目錄、圖片、公式、Mermaid SVG、腳註與跨章節連結。DRM 加密與固定版式（漫畫 / 畫冊）暫不支援。

---

## 禪模式：只留下文字

![禪模式](https://github.com/laoduu/YiziMarkdown/raw/main/assets/readme/zen.webp)

`F9` 或工具列的禪模式按鈕進入。工具列、標籤列、側邊欄、AI 面板、狀態列按層次朝螢幕邊緣收合淡出，只留正文；整個過程**不改版面**，正文一個像素都不移動。

- **世界還在**：滑鼠貼住螢幕任一邊（上 / 左 / 右 / 下），對應區域原地淡回；離開約 1.2 秒自動收回
- **常駐開關**：禪模式按鈕不會消失，始終停在原位（周圍一圈極淺的呼吸漣漪），既是「你在禪模式裡」的狀態錨，也是退出通道；`F9` / `Esc` 都能退出
- **只服務寫作**：僅在原始碼 / 即時模式可用；切到並排、預覽，或進入閱讀 / 簡報會自動退出
- **更乾淨的紙面**：隱藏行號與側邊欄直線、極淡暗角、游標靜止 2 秒自動隱藏；縱向捲軸換成極簡細條，隨捲動或靠近右緣出現

---

## 檔案與寫作

### 檔案與多標籤

- **開啟**：支援 `.md` / `.markdown` / `.txt` / `.epub`，EPUB 直接進入閱讀模式
- **單一實例模式**：多檔案開啟自動合併到既有視窗，重複開啟的檔案定位到對應標籤頁
- **Tab 標籤列**：切換、關閉、新建，支援拖曳排序
- **首頁**：最近開啟的檔案清單，含大小與修改時間
- **儲存狀態**：未儲存檔案的呼吸圓點，儲存後 ✅ 確認動畫
- **關閉確認**：未儲存時彈出儲存 / 不儲存 / 取消

### 新建與範本

- 新建空白 Tab 顯示「未命名新檔案」
- 工具列「從範本新建」依範本的 Markdown 結構建立文件；也可在 設定 → 一般 設定預設範本，之後 `Ctrl+N` 自動套用
- 範本存放在使用者目錄，放入 `.md` 即可使用，也可在 設定 → 範本 中新建 / 編輯

### 貼上即 Markdown

從網頁、Word / DOCX、Google Docs、Notion 等來源複製的富文字，貼上時在記憶體中轉換為規範 Markdown（標題 / 清單 / 表格 / 程式碼 / 引用 / 連結）；既有 Markdown 來源與純文字原樣貼上。

### 儲存與匯出

- **儲存 / 自動儲存**：手動儲存 + 可設定間隔（5~180 秒，預設 60 秒）
- **另存新檔**：新建檔案儲存時自動彈出另存新檔對話框
- **匯出**：HTML / Markdown / 純文字 / Word（DOCX）/ PDF / PPTX / EPUB
  - DOCX 使用 Word 原生語意（清單、表格、程式碼區塊、引用、任務清單），表格樣式對齊預覽，圖片支援本機路徑、網路圖片與 HTML `<img>`（可用 `width` 控制寬度）
  - PDF 與預覽還原度一致並自動分頁
  - HTML 附帶左側懸浮大綱卡片，點擊項目直達章節（PDF 不含側欄）
  - PPTX 繼承簡報模式的主題、明暗與版式，輸出可編輯文字、表格、圖片、形狀與原生公式
  - EPUB 由內建外掛提供，匯出前可選章節拆分 / 封面 / 可見目錄 / 閱讀主題 / 文件資訊
- **.md 檔案關聯**：設定中一鍵設為系統預設 Markdown 編輯器（Windows 登錄檔 / macOS LaunchServices）

### 雲端儲存（WebDAV）

- **檔案瀏覽器**：側邊欄「雲端」標籤頁瀏覽伺服器目錄樹，可開啟文件、新建檔案 / 資料夾、重新命名、移動、刪除；深層目錄麵包屑折成「…」可下拉跳轉，資料夾逐層延遲載入
- **儲存到雲端**：本機文件一鍵上傳，正文中以相對路徑引用的圖片一併上傳並保持目錄結構；雲端文件 `Ctrl+S` 直接寫回
- **衝突保護**：儲存前比對 ETag，遠端被其他裝置改過會彈出視窗選擇「覆寫伺服器版本」或「放棄本機修改並重新載入」，絕不靜默覆寫
- **憑證安全**：使用者名稱與密碼存入系統憑證庫（Windows 認證管理員 / macOS 鑰匙圈），不寫入設定檔
- **相容性**：堅果雲、Nextcloud、群暉等標準 WebDAV 服務（建議使用應用程式專用密碼）

---

## 擴充與個人化

### AI 助手（側邊聊天面板）

- **18 家大模型供應商 + 自訂服務**：OpenAI、Anthropic、Gemini、xAI、Mistral、Groq、DeepSeek、通義千問、智譜 GLM、Moonshot Kimi、火山方舟、矽基流動、MiniMax、小米 MiMo、美團 LongCat、OpenRouter、OpenCode Go、Ollama（本機）；「自訂服務」支援 OpenAI 相容 / Anthropic 相容兩種協定，自填 Base URL、模型 ID 與金鑰
- **串流對話**：工具列機器人按鈕開啟右側面板，回覆即時串流輸出，可隨時停止
- **思考過程**：推理模型的 reasoning / thinking 以可收合區塊呈現，預設收起
- **金鑰安全**：API 金鑰存系統鑰匙圈，支援一鍵儲存、清除、驗證；本機端點（llama.cpp / LM Studio / vLLM 等）可留空
- **引用目前文件**：勾選後把目前文件作為上下文，可設定引用上限（64K~512K / 不限）與上下文輪數（0~20，預設 3）
- **結果落地**：複製、插入到游標處，或一鍵建立為新文件

### AI 技能（Skill）

輸入框 ⚡ 按鈕彈出技能選單，選中後技能 tag 插入游標處，提示詞自動注入上下文。`skills/` 目錄放入 `skills.json` + `.md` 提示詞即可自訂。內建「簡報稿提煉」「文件摘要」「潤色改寫」「全文翻譯」「Markdown 格式化」5 個技能。

### 外掛

- **核心能力預設內建**：KaTeX / Mermaid / 腳註 / 任務清單 / TOC 等文件語意功能不受外掛開關影響
- **內建外掛**：EPUB 匯出（預設啟用，可在外掛頁關閉；啟用後工具列匯出選單才出現）
- **外掛標準**：manifest（版本 / API 版本 / 啟用時機 / 權限 / 能力）→ 資格檢查 → 延遲啟用 → 能力註冊 → 停用清理；目前版本只載入編譯進應用程式的內建外掛

### 主題與外觀

- **15 套內建主題**：液態玻璃 Prism（預設）、學術藍、活力橙、科技感、極簡風、雜誌感、自然風、荔枝紅、紫羅蘭、賽博龐克、Facebook、駭客任務、薄荷冰沙、落日熔金、復古打字機，每套均有明暗兩套配色
- **深色 / 亮色模式**：一鍵切換（`F2`）
- **字型自訂**：原始碼與預覽分別設定字型、字級、行高
- **自訂主題**：設定 → 外觀 → 自訂 CSS 中書寫並儲存，即以目前主題為基底產生「自訂主題」，貼上整份新主題或只微調幾個顏色都可以，儲存立即生效
- **主題擴充**：`themes/` 目錄放入 `.css` 並在 `themes/theme.json` 登記參數，重新啟動後自動辨識；權杖體系與規範見 `docs/THEME-DESIGN-SPEC.md`

### 多語言與介面

- **16 種介面語言**：簡體中文（預設）、繁體中文、English、日本語、한국어、Deutsch、Français、Español、Português、Italiano、Polski、Nederlands、Türkçe、Svenska、Українська、Русский
- 設定 → 一般 → 介面語言一鍵切換，即時生效；介面文案、快捷鍵面板、外掛說明隨語言連動
- **首次啟動自動適應**：無安裝程式語言時依系統語言選擇，不在支援清單內則回退 English；語言項目附帶英文 `Language` 標識，中文介面下也能快速定位
- **介面字級**：80%–120%（預設 100%），只縮放介面文字與圖示，面板尺寸與文件內容不受影響
- **設定面板**：一般、外觀、編輯器、即時模式、AI 助手、雲端、外掛、快捷鍵、範本、文件、關於、產品，設定即時預覽

---

## 快捷鍵

| 快捷鍵 | 功能 | 快捷鍵 | 功能 |
|--------|------|--------|------|
| Ctrl+N | 新建檔案 | Ctrl+B | 粗體 |
| Ctrl+O | 開啟檔案 | Ctrl+I | 斜體 |
| Ctrl+S | 儲存檔案 | Ctrl+- | 刪除線 |
| Ctrl+Shift+S | 另存新檔 | Ctrl++ | 行內程式碼 |
| Ctrl+W | 關閉標籤 | Ctrl+1 | 一級標題 |
| Ctrl+H | 匯出 HTML | Ctrl+2 | 二級標題 |
| Ctrl+M | 匯出 Markdown | Ctrl+3 | 三級標題 |
| Ctrl+Z | 復原 | Ctrl+. | 無序清單 |
| Ctrl+Y | 重做 | Ctrl+0 | 有序清單 |
| Ctrl+F | 搜尋 | Ctrl+' | 引用 |
| Ctrl+\ | 切換側邊欄 | Ctrl+K | 連結 |
| F1 | 快捷鍵大全 | Ctrl+` | 程式碼區塊 |
| F2 | 切換深淺模式 | Ctrl+T | 表格 |
| F3 | 循環切換四種編輯視圖 | Ctrl+L | 分隔線 |
| F9 | 禪模式（僅原始碼 / 即時） | Ctrl+Alt+P | 簡報模式 |
| F11 | 切換全螢幕 | Ctrl+Alt+R | 閱讀模式 |
| Ins | 斜線選單 | F12 | 開發人員工具 |

快捷鍵可在 設定 → 快捷鍵 中自訂：36 個 action 的可視化綁定、按鍵錄製、衝突偵測與恢復預設。

---

## 目錄結構

可攜版解壓後：

```
YiziMarkdown/
├── YiziMarkdown.exe        # 主程式
├── readme.md               # 專案說明（本檔案）
├── welcome.md              # 歡迎文件
├── docs/                   # 文件（THEME-DESIGN-SPEC.md 主題設計規範等）
├── user.css                # 使用者自訂樣式
├── keybindings.json        # 快捷鍵設定
├── themes/                 # 主題 CSS 檔案
│   ├── liquidglass-prism.css # 液態玻璃 Prism（預設）
│   ├── academic.css        # 學術藍
│   ├── vibrant.css         # 活力橙
│   ├── tech.css            # 科技感
│   ├── minimal.css         # 極簡風
│   ├── magazine.css        # 雜誌感
│   ├── nature.css          # 自然風
│   ├── lychee.css          # 荔枝紅
│   ├── violet.css          # 紫羅蘭
│   ├── cyberpunk.css       # 賽博龐克
│   ├── facebook.css        # Facebook
│   ├── matrix.css          # 駭客任務
│   ├── mint.css            # 薄荷冰沙
│   ├── sunset.css          # 落日熔金
│   └── typewriter.css      # 復古打字機
├── skills/                 # AI 技能（Skill）
│   ├── skills.json         # 技能清單
│   ├── slides-outline.md   # 簡報稿提煉
│   ├── doc-summary.md      # 文件摘要
│   ├── polish-writing.md   # 潤色改寫
│   ├── translate-fulltext.md # 全文翻譯
│   └── markdown-format.md  # Markdown 格式化
└── templates/              # 內建文件範本（首次啟動同步到使用者目錄）
    ├── default.md          # 預設範本
    └── Slide-Template.md   # 簡報範本
```

> 提示：AI 技能與文件範本的真實儲存位置都在**使用者目錄** —— Windows / macOS 是 `~/Documents/yizimarkdown/skills/` 與 `.../templates/`；Linux 是 XDG 文件目錄下的 `yizimarkdown/`（如 `~/文件/yizimarkdown/`），系統沒有文件目錄時退回 `~/.local/share/yizimarkdown/`。（程式目錄下的同名資料夾是內建資源，首次啟動會同步過去）。自訂內容請放使用者目錄，升級 / 重新安裝不會被覆蓋。

---

## 技術棧

| 層級 | 技術 |
|------|------|
| 桌面框架 | Tauri 2 (Rust) |
| 前端框架 | React 18 + TypeScript |
| 編輯器核心 | CodeMirror 6 |
| 狀態管理 | Zustand (persist) |
| 樣式方案 | Tailwind CSS + CSS 變數 |
| Markdown 呈現 | markdown-it |
| 國際化 | 自研輕量 i18n（16 語言） |
| AI 接入 | Rust 串流代理（OpenAI / Anthropic / Ollama 協定） |
| 建置工具 | Vite |

---

## 開發

### 環境需求

- Node.js 18+
- Rust (stable)
- Tauri CLI（`npm install -g @tauri-apps/cli`）

### 啟動開發伺服器

```bash
cd code
npm install
npm run tauri:dev
```

### Linux 開發態工作列圖示（選用）

elementary / GNOME 這類桌面會依視窗的 `WM_CLASS` 尋找同名 `.desktop` 裡的 `Icon`；開發態沒有安裝程式，也就沒有 `.desktop`，Dock 只會顯示通用圖示（視窗本身的 `_NET_WM_ICON` 已由 Rust 端補上，安裝程式不受影響）。執行一次：

```bash
npm run dev:icon           # 寫入 ~/.local/share/applications/yizimarkdown-dev.desktop
npm run dev:icon:remove    # 撤銷
```

之後重新啟動 dev 視窗，Dock 即顯示應用程式圖示。

### 建置發行版

**Windows**

```bash
npm run tauri:build
```

建置產物：
- 可攜版 exe：`src-tauri/target/release/yizimarkdown.exe`
- NSIS 安裝程式：`src-tauri/target/release/bundle/nsis/`

安裝精靈：首次安裝先選安裝語言（16 種，應用程式全部介面語言 + 巴西葡萄牙語），精靈文案與安裝後首次啟動的語言都跟隨該選擇；升級 / 自動更新不會重設使用者已選的語言。圖示與側邊欄 / 頁首圖在 `src-tauri/installer/`，改品牌色後重新執行 `powershell -ExecutionPolicy Bypass -File scripts/make-installer-art.ps1` 產生。

建置後手動複製 exe 和資源檔到 `public/YiziMarkdown-vX.X.X/` 目錄發佈。

**macOS（通用二進位，同時支援 Intel 與 Apple Silicon）**

```bash
rustup target add aarch64-apple-darwin
npm run tauri:build -- --target universal-apple-darwin
```

建置產物：
- 應用程式包：`src-tauri/target/universal-apple-darwin/release/bundle/macos/YiziMarkdown.app`
- 安裝包：`src-tauri/target/universal-apple-darwin/release/bundle/dmg/YiziMarkdown_<ver>_universal.dmg`

**Linux（deb + AppImage）**

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf
npm run tauri:build -- --bundles deb,appimage
```

建置產物（**目前僅提供 amd64 / x86_64**；ARM 的 `arm64` deb 與 `aarch64` AppImage 暫不發佈）：
- Debian 系安裝包：`src-tauri/target/release/bundle/deb/YiziMarkdown_<ver>_amd64.deb`（約 16 MB，裝到 `/usr/bin`，註冊選單項目、圖示與 `.md` / `.epub` 檔案關聯）
- 通用免安裝版：`src-tauri/target/release/bundle/appimage/YiziMarkdown_<ver>_amd64.AppImage`（約 100 MB，自帶 GTK / WebKit 與 GStreamer 媒體元件，雙擊即用）

注意：**必須在 Ubuntu 22.04 上建置**。24.04 編出的二進位要求 glibc 2.39，Ubuntu 22.04（2.35）/ Debian 12（2.36）會直接啟動失敗；`deb` 的 `libwebkit2gtk-4.1-0` 依賴同樣把下限鎖在 Ubuntu 22.04 / Debian 12（Debian 11 只有 webkit 4.0）。暫不提供 `rpm`：Fedora / openSUSE 的依賴名稱與 Debian 系不同，需要單獨維護。

### 專案結構

```
code/
├── src/                    # 前端原始碼
│   ├── App.tsx             # 主應用程式元件
│   ├── components/         # UI 元件
│   │   ├── Editor.tsx      # CodeMirror 編輯器 + 預覽
│   │   ├── Reader.tsx      # 閱讀模式（分頁 / 翻頁）
│   │   ├── Slideshow.tsx   # 簡報模式
│   │   ├── TabBar.tsx      # Tab 標籤列
│   │   ├── HomePage.tsx    # 首頁（最近檔案）
│   │   ├── Toolbar.tsx     # 工具列
│   │   ├── Sidebar.tsx     # 側邊欄（大綱 + 檔案瀏覽）
│   │   ├── StatusBar.tsx   # 底部狀態列
│   │   └── SettingsModal.tsx # 設定面板
│   ├── stores/             # Zustand 狀態管理
│   ├── lib/                # 工具庫（Markdown 呈現、主題、禪模式等）
│   └── styles/             # 全域樣式
├── src-tauri/              # Rust 後端
│   ├── src/main.rs         # Tauri 指令（檔案讀寫、主題載入、登錄檔等）
│   ├── icons/              # 應用程式圖示
│   ├── themes/             # 主題 CSS（含 theme.json 中繼資料）
│   └── templates/          # 文件範本
├── docs/                   # 文件（changelog / i18n 多語言 readme / THEME-DESIGN-SPEC.md）
└── package.json
```

---

## 版本與更新

Windows 安裝版可在應用程式內一鍵更新；macOS、Linux 與可攜版啟動時檢查 `latest.json`，發現新版在右下角提示並開啟對應版本的下載頁（手動替換，不自動安裝；Linux 的 `deb` 與 `AppImage` 都走這條通道）。

---

## 授權

MIT
