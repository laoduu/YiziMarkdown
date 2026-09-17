# v0.3.0

> **说明**：v0.2.5 曾提交代码但**从未发布**（未打安装包、官网也未更新），其改动实际随本版一起发布，因此已并入本条目，不单独成篇。

## 新增功能

### WebDAV 云端存储

把 WebDAV 服务器（坚果云、Nextcloud、群晖等）接进来，文档可以直接读写到云端。

- **云端文件浏览器**：侧边栏新增「云端」标签页，浏览服务器目录树（懒加载子目录、面包屑导航、刷新）；支持**新建文件夹**、**重命名**、**删除**（删除带二次确认，删除文件夹会明确提示内容一并删除）
- **打开云端文档**：点击即打开，正文与文档中相对引用的图片一并镜像到本地缓存；图片缺失只提示数量，不阻断打开
- **保存到云端**：工具栏新增「保存到云端」按钮
  - 本地文档 → 输入云端路径上传，**含相对路径引用的图片一并上传**（保持目录结构，不改写 Markdown）
  - 已是云端文档 → 默认路径即它当前的远程路径，回车即存回原处；也可改路径另存到别处
  - **保存不会关闭文档**：tab 就地转为云端文档，滚动位置与撤销历史都保留
- **Ctrl+S 直接写回云端**：云端文档的保存、自动保存都走「先写本地镜像、再 PUT 服务器」，两步都成功才标记为已保存
- **冲突检测**：打开时记录服务器 ETag，保存时带 `If-Match`；远程被其他设备改过则返回冲突，弹窗让用户选择「覆盖服务器版本」或「放弃本地修改并重新加载」，**绝不静默覆盖**
- **云端目录自动刷新**：保存到云端后，若正浏览该目录会自动刷新列表，无需手动点刷新

### 凭据安全

- **用户名与密码存入系统凭据库**（Windows 凭据管理器 / macOS 钥匙串），**不写入任何配置文件、不进入 localStorage**，也**不经过前端 IPC 边界**
- 服务器地址、起始目录等非敏感项才存设置
- 设置页提供「测试连接」，失败时给出可操作的中文原因（如「需使用应用专用密码」）

### 多语言

- 15 种语言同步新增 62 个云端相关字符串
- **15 种语言现已 100% 完整**：顺带补齐了 v0.3.0 之前的历史欠账（11 种语言各有 11 个键，西班牙语另有 15 个 `dialog.*` 键），`npm run check:i18n:strict` 现在零缺失，并已接入构建卡口

### DOCX 导出字体降级机制

- **字体替代名清单（`word/fontTable.xml`）**：导出的 docx 附带 `word/fontTable.xml`，为所用字体声明 `w:altName` 替代名链——正文 `Microsoft YaHei, PingFang SC, Noto Sans SC, Segoe UI, Arial`；等宽 `Cascadia Mono, Consolas, Courier New, DejaVu Sans Mono`；列表项目符号 `Wingdings, Segoe UI Symbol, Arial Unicode MS`
- **随字体类型自适应**：按字体名判定中日韩字体写 `w:charset`（86=GB2312 / 00=ANSI / 02=Symbol），并按角色写 `w:family`（swiss / modern / decorative）与 `w:pitch`（variable / fixed）；子元素顺序遵循 ECMA-376 `CT_Font`（altName → charset → family → pitch）
- **装有该字体时行为不变**：`w:altName` 仅在主名称找不到时被读取，因此已安装 MiSans 的机器导出结果与之前完全一致

## Bug 修复

- **重复打开同一个云端文档会多开一个 tab**：目录条目的路径来自服务器返回的 href，天然带结尾斜杠（`/Notes/`），而拼接出的路径不带（`/Notes`）→ 两者被当成不同文件。改为按**规范化路径**去重（折叠重复斜杠、消解 `./..`）
- **保存到云端后文档被关闭**：原实现是「新建 tab + 关掉原 tab」，当目标就是该文档自己的远程路径时，新建逻辑命中同一个 tab，随后被关掉。改为**就地转换 tab**
- **「保存到原处」被误报成「文件已存在」**：原来一律用 `If-None-Match: *`（新建语义），对已存在的文件会被服务器判为 412。现在按目标是否等于当前远程路径区分更新（`If-Match`，带冲突检测）与新建
- **在云端列表点开已打开且未保存的文档会丢失编辑**：原实现无条件用服务器内容覆盖。现在只有本地无未保存修改时才覆盖；冲突弹窗的「放弃本地修改并重新加载」才强制覆盖
- **自动保存失败却显示"已保存"**：原自动保存用吞掉错误的调用且不 await 就无条件标记已保存 → 离线或 401 时会显示已保存但实际没写成功。三处保存入口（Ctrl+S / 自动保存 / 另存为）已收敛到同一实现，失败一律保持未保存并提示
- **另存为写盘失败被静默吞掉**：改用会抛错的调用并提示失败原因
- **文件大小提示文案错误**：云端文件悬停显示的是"N 项"配字节数，改为正确的 `1.2 MB` 形式
- **文件对话框主线程死锁（macOS 实测）**：`save_file_dialog` / `pick_and_read_file` / `pick_image_file` 原为同步 Tauri 命令（运行在主线程），其内部 `blocking_save_file` / `blocking_pick_file` 会阻塞主线程 → macOS 上保存面板弹出即冻结、全应用转圈无法保存（**另存为 / 导出 DOCX / 导出 PDF / 插入图片 / 打开文件全部受影响**）→ 改为 async 命令 + `tauri::async_runtime::spawn_blocking`，对话框移出主线程
- **DOCX 字体名提取错误**：原实现取 CSS font-family 栈中「第一个**带引号**的族」而非第一个族（`system-ui, 'MiSans'` 会错取成 MiSans；`Inter, 'Microsoft YaHei'` 会错取成微软雅黑）→ 改为引号感知切分后取第一个族
- **DOCX 把 CSS 关键字当字体名**：`system-ui` / `-apple-system` / `sans-serif` / `serif` / `monospace` 等被原样写进 `w:rFonts`，会被阅读器当作「缺失字体」触发替换 → 映射为具体字体（`Microsoft YaHei` / `SimSun` / `Consolas`）
- **DOCX 代码块与标题的脚本字体缺失**：CodeBlock 样式与行内代码 run 未声明 `w:eastAsia`、标题未声明 `w:cs` → 补齐（默认配置下为 no-op，仅当源码字体与预览字体不同才生效）

## 踩坑记录

### 1. Tauri 命令参数名：camelCase ↔ snake_case 对不上只在运行时炸

Tauri 要求前端传 camelCase 键来对应 Rust 的 snake_case 参数（`remote_path` ← `remotePath`）。写成 `path` 时**TypeScript 拦不住**（`invoke` 的参数是字符串 + 无类型对象），**Rust 单测也拦不住**（它们直接调 Rust 函数，不经过 IPC 边界），只会在运行时抛 `missing required key remotePath`。这个 bug 是用户实际点「保存到云端」时暴露的。

→ 新增 `scripts/check-tauri-args.mjs`：解析 Rust 的 `#[tauri::command]` 签名（排除 Tauri 自动注入的 `AppHandle`/`WebviewWindow`/`State`）与前端的 `invoke(...)` 调用，比对参数名，并接入 `npm run build`。**教训：跨语言边界的契约要么有静态检查，要么就会在用户手里炸。**

### 2. WebDAV 不会隐式创建目录：PUT 到不存在的目录返回 409

上传图片到文档目录下的 `images/`、或「另存到云端」到一个多层新路径时，PUT 直接失败（409 Conflict）。原实现从不创建父目录。

→ 上传前逐级 MKCOL（已存在返回 405，视为成功），同一次保存内对同一目录只建一次。**这个 bug 是接真实 WebDAV 服务器（wsgidav）跑集成测试时发现的 —— 单元测试永远测不到，因为那是服务端行为。**

### 3. 服务器返回的 href 带结尾斜杠

WebDAV 集合 URL 必须以 `/` 结尾，所以目录条目解析出来的路径是 `/Notes/`；而 `parentPath()` 这类本地计算的结果是 `/Notes`。**两者语义相同但字符串不相等**，直接比较会让「云端目录自动刷新」静默失效。

→ 新增 `normalizeRemotePath()` 用于所有路径比较。**教训：跨系统传递的路径必须先在边界规范化，不能靠"看起来一样"。**

### 4. 朴素字符串拼接路径会产生双斜杠

`` `${dir}/${name}` `` 在 `dir` 带结尾斜杠时得到 `/Notes//doc.md`。服务器会折叠空路径段，文件实际落在 `/Notes/doc.md` —— 于是 tab 上记录的远程身份与云端列表返回的路径不一致，去重失败、重复开 tab。

→ 统一用 `joinPath()` + `canonicalRemotePath()`。**这是同一个「路径未规范化」根因的第二次咬人，所以补了带回归测试的路径工具模块。**

### 5. quick-xml 把 XML 实体作为独立事件发出

`<href>/dav/a&amp;b.md</href>` 不是一段文本，而是 `Text("a")` + `GeneralRef("amp")` + `Text("b.md")` 三个事件。逐段**赋值**只会留下最后一段（解析结果变成 `b.md`），必须**累积**并单独解析实体引用。

### 6. PROPFIND 的属性可能跨 propstat 拆分

Apache mod_dav 等会把「命中的属性」与「未命中的属性」拆到 200 与 404 两个 `<propstat>` 里。只读第一个 `<propstat>` 会丢掉 `<resourcetype>`，从而**把目录误判成文件**。正确做法是不关心 propstat 边界，按 `<response>` 合并。

### 7. 保存 ≠ 关闭

实现「另存到云端」时套用了「新建 tab + 关掉原 tab」的转换思路，结果在「目标就是文档自己的远程路径」这一支上，新建逻辑命中同一个 tab、紧接着被关掉 —— 保存成功、文档消失。用户直接指出「保存操作不代表用户想关闭」。

→ 改为就地更新 tab 的远程身份与镜像路径。**教训：把「转换身份」实现成「关掉再新建」是错的，即使两者最终状态看起来一样 —— 用户可见的副作用（文档消失、滚动位置与撤销历史丢失）完全不同。**

### 8. 静态检查脚本自己也会有 bug

i18n 检查器最初只认单引号的值，于是把 `en.ts` 里用双引号写的 `discard: "Don't Save"` 误判成「英文缺失」，差点去"修复"一个并不存在的 bug。**教训：工具的输出也要先验证再行动 —— 尤其是当它告诉你某处有问题时，先去读一眼原文。**

### 9. `w:altName` 在 WPS 下不被采纳

按 ISO/IEC 29500-1 为缺字体声明 `w:altName` 替代名链后，**WPS 打开仍提示「没有字体」并要求手动替换**，未降级为微软雅黑。规范原文用的是 "should"（建议），**不保证实现一定会做** → 该机制只对部分阅读器有效；WPS（国内主力环境）要真正解决需靠「字体内嵌」，本次未做（体积 / 字形子集化 / 字体授权待定）。

### 10. 本机装了字体就无法验证降级路径

主名称命中时 `altName` 根本不会被读取，因此在「已安装该字体」的开发机上永远测不出降级是否生效。**必须另造一份使用不存在字体名的探针 docx** 才能触发替换路径 → 已固化为 `#[ignore]` 测试 `write_font_fallback_probe`（产出 `target/font-fallback-probe.docx`）。**教训：规范里存在的机制 ≠ 实现会使用，投入前应先让用户用一个探针实测。**

### 11. 同步 Tauri 命令里调用 blocking 对话框 = 主线程死锁

同步命令运行在主线程，`blocking_save_file` / `blocking_pick_file` 内部 `recv()` 阻塞主线程 → macOS 保存面板弹出即冻结、全应用转圈。**修复模式：async 命令 + `tauri::async_runtime::spawn_blocking`**。（与 v0.2.4 的 `export_pdf` 主线程死锁同源——同步命令里做阻塞等待。）

### 12. CSS 通用族不是字体名

`system-ui` / `-apple-system` / `BlinkMacSystemFont` / `sans-serif` / `serif` / `monospace` 是 CSS 关键字而非字体名，原样写入 `w:rFonts` 会被当作缺失字体 → 必须先映射为具体字体名。

## 技术改进

### 架构：本地缓存镜像 + 显式远程身份

远程文档落地到 `~/Documents/yizimarkdown/webdav/<host>-<hash>/` 的本地镜像，`FileTab.filePath` 指向镜像文件，另挂 `remote: { path, etag }` 作为远程身份。这样自动保存判据、DOCX 导出的图片基准目录、侧边栏文件树、状态栏**全部零改动复用**；镜像是可丢弃的派生物（打开时总是重新 GET，服务器为真相），远程身份才是持久化的那一份。

对比方案「纯内存 + filePath=null」：需要在自动保存门控、导出、目录推导、保存分支四处加远程分支，还会与「未命名文档」的去重逻辑冲突，且 DOCX 导出会静默丢图。

### 后端

- 新增 `src-tauri/src/webdav.rs`（协议层：PROPFIND/GET/PUT/MKCOL/MOVE/DELETE + 凭据命令）与 `src-tauri/src/remote_cache.rs`（镜像路径运算 + 相对引用解析 + 图片双向同步 + 打开/保存编排）
- 新增 12 个 Tauri 命令，全部为 `async`（网络 I/O 绝不碰主线程）
- `quick-xml` 与 `percent-encoding` 从传递依赖提升为直接依赖，**未引入新的 crate 树**
- 凭据层泛化：`ai_keystore` 的 `entry()` 改为通用账号名，在其上实现 `set_secret/read_secret/has_secret/clear_secret`，AI 密钥与 WebDAV 凭据共用一套

### 安全边界

- **绝不上传用户本地文件**：图片引用只同步「相对路径」；绝对路径（`/…`、盘符）、`file://`、`data:`、`http(s)://` 一律跳过
- **路径穿越防护**：`..` 越出根目录的引用一律拒绝，本地与远程两侧的允许层数**完全对称**（以远程文档目录层级为准）
- 远程文件名落地本地时做**可逆**转义（Windows 非法字符、保留设备名、结尾点/空格），并用测试证明不同远程路径不会撞到同一个本地文件

### 测试与校验

| 项目 | 数量 | 说明 |
|---|---|---|
| Rust 单测 | **57 项通过** | 新增 webdav 17 + remote_cache 14；dev 构建零警告 |
| Rust 集成测试 | 1 项（`#[ignore]` opt-in） | 真实 WebDAV 服务器往返：MKCOL → PUT → PROPFIND → GET → **过期 ETag 断言 412** → MOVE → DELETE |
| 前端路径单测 | **12 项** | `npm test`，含两条针对重复 tab bug 的回归测试 |
| invoke 参数名校验 | 18 个调用 | `npm run check:invoke`，已接入 build |
| i18n 一致性校验 | 498 键 × 15 语言 | `npm run check:i18n`，含**占位符一致性硬校验** |

- 真实服务器验证用 `wsgidav`（`pip install wsgidav cheroot`），覆盖匿名与 Basic 认证两种模式，并验证了错误密码时的可读错误信息
- 前端测试放在 `tests/` 而非 `src/`：Vite 会监视 `src/` 并对其中的文件变更触发页面重载，测试文件放在里面会无谓打断热更新

### DOCX / OOXML

- 手写 OOXML 部件由 6 个增至 7 个：新增 `word/fontTable.xml`，并在 `[Content_Types].xml` 增加 Override、在 `word/_rels/document.xml.rels` 增加 `fontTable` 关系（`rIdFontTable`）
- fontTable 以字体名为键：等宽字体与正文同名时跳过重复条目
- 字体栈解析新增 `split_font_stack()`（引号感知按逗号切分）与 `css_generic_to_font()`（关键字映射表），空栈兜底 `Microsoft YaHei`

## 其他

- **官网**：`website/index.html` 新增 WebDAV 功能卡片，hero 徽标、JSON-LD 版本、三个下载链接一并升到 v0.3.0；更新日志面板补上 v0.3.0（v0.2.5 从未发布，其内容并入 v0.3.0 条目，不再单列标签页）。`website/help.html` 新增「云端存储」章节与 3 条 FAQ，设置分类说明由 8 个更正为 9 个
- **文档**：根 README 与 15 个本地化 README 均新增云端存储章节；`help.md` 新增完整云端章节 + 5 条 FAQ；`welcome.md` 新增简短云端引导
- **已知历史遗留（已在本版一并处理）**：11 种语言的 11 个键（`settings.academic`、`settings.anim*Css`、`slashmenu.*Keywords`、`slideshow.academic`）与西班牙语另有 15 个 `dialog.*` 键，原为 v0.3.0 之前的欠账；本版已全部补齐，`npm run check:i18n:strict` 零缺失
- **与本次无关的既有缺陷（建议单独立项）**：PDF 导出的 HTML 构建函数只依赖主题与明暗两个依赖项，且从预览 DOM 取内容，因此 PDF 导出本就忽略图片的 data URL 替换
