# v0.2.5

## 新增功能

### DOCX 导出字体降级机制

- **字体替代名清单（`word/fontTable.xml`）**：导出的 docx 现在附带 `word/fontTable.xml`，为所用字体声明 `w:altName` 替代名链——正文 `Microsoft YaHei, PingFang SC, Noto Sans SC, Segoe UI, Arial`；等宽 `Cascadia Mono, Consolas, Courier New, DejaVu Sans Mono`；列表项目符号 `Wingdings, Segoe UI Symbol, Arial Unicode MS`
- **随字体类型自适应**：按字体名判定中日韩字体写 `w:charset`（86=GB2312 / 00=ANSI / 02=Symbol），并按角色写 `w:family`（swiss / modern / decorative）与 `w:pitch`（variable / fixed）；子元素顺序遵循 ECMA-376 `CT_Font`（altName → charset → family → pitch）
- **装有该字体时行为不变**：`w:altName` 仅在主名称找不到时被读取，因此已安装 MiSans 的机器导出结果与之前完全一致

## Bug 修复

- **文件对话框主线程死锁（macOS 实测）**：`save_file_dialog` / `pick_and_read_file` / `pick_image_file` 原为同步 Tauri 命令（运行在主线程），其内部 `blocking_save_file` / `blocking_pick_file` 会阻塞主线程 → macOS 上保存面板弹出即冻结、全应用转圈无法保存（**另存为 / 导出 DOCX / 导出 PDF / 插入图片 / 打开文件全部受影响**）→ 改为 async 命令 + `tauri::async_runtime::spawn_blocking`，对话框移出主线程
- **DOCX 字体名提取错误**：原实现取 CSS font-family 栈中「第一个**带引号**的族」而非第一个族（`system-ui, 'MiSans'` 会错取成 MiSans；`Inter, 'Microsoft YaHei'` 会错取成微软雅黑）→ 改为引号感知切分后取第一个族
- **DOCX 把 CSS 关键字当字体名**：`system-ui` / `-apple-system` / `sans-serif` / `serif` / `monospace` 等被原样写进 `w:rFonts`，会被阅读器当作「缺失字体」触发替换 → 映射为具体字体（`Microsoft YaHei` / `SimSun` / `Consolas`）
- **DOCX 代码块与标题的脚本字体缺失**：CodeBlock 样式与行内代码 run 未声明 `w:eastAsia`、标题未声明 `w:cs` → 补齐（默认配置下为 no-op，仅当源码字体与预览字体不同才生效）

## 踩坑记录

### 1. `w:altName` 在 WPS 下不被采纳

按 ISO/IEC 29500-1 为缺字体声明 `w:altName` 替代名链后，**WPS 打开仍提示「没有字体」并要求手动替换**，未降级为微软雅黑。规范原文用的是 "should"（建议），**不保证实现一定会做** → 该机制只对部分阅读器有效；WPS（国内主力环境）要真正解决需靠「字体内嵌」，本次未做（体积 / 字形子集化 / 字体授权待定）。

### 2. 本机装了字体就无法验证降级路径

主名称命中时 `altName` 根本不会被读取，因此在「已安装该字体」的开发机上永远测不出降级是否生效。**必须另造一份使用不存在字体名的探针 docx** 才能触发替换路径 → 已固化为 `#[ignore]` 测试 `write_font_fallback_probe`（产出 `target/font-fallback-probe.docx`）。**教训：规范里存在的机制 ≠ 实现会使用，投入前应先让用户用一个探针实测。**

### 3. 同步 Tauri 命令里调用 blocking 对话框 = 主线程死锁

同步命令运行在主线程，`blocking_save_file` / `blocking_pick_file` 内部 `recv()` 阻塞主线程 → macOS 保存面板弹出即冻结、全应用转圈。**修复模式：async 命令 + `tauri::async_runtime::spawn_blocking`**。（与 v0.2.4 的 `export_pdf` 主线程死锁同源——同步命令里做阻塞等待。）

### 4. CSS 通用族不是字体名

`system-ui` / `-apple-system` / `BlinkMacSystemFont` / `sans-serif` / `serif` / `monospace` 是 CSS 关键字而非字体名，原样写入 `w:rFonts` 会被当作缺失字体 → 必须先映射为具体字体名。

## 技术改进

- 手写 OOXML 部件由 6 个增至 7 个：新增 `word/fontTable.xml`，并在 `[Content_Types].xml` 增加 Override、在 `word/_rels/document.xml.rels` 增加 `fontTable` 关系（`rIdFontTable`）
- fontTable 以字体名为键：等宽字体与正文同名时跳过重复条目
- 字体栈解析新增 `split_font_stack()`（引号感知按逗号切分）与 `css_generic_to_font()`（关键字映射表），空栈兜底 `Microsoft YaHei`
- 单测扩至 **27 项**（新增 5 项：`first_family` 用例表、fontTable 内容与 `CT_Font` 顺序、同名去重、部件与 rels 接线、CSS 关键字不得进入 OOXML 且 `w:eastAsia` 已补齐）+ 1 个手动探针测试

## 其他

- **官网**：macOS 下载链接更新至 v0.2.4（补上对话框死锁修复后的产物）