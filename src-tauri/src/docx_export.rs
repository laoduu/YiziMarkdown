//! docx_export.rs — Markdown → DOCX (OOXML) 导出。
//!
//! 用 pulldown-cmark 解析 Markdown，手工生成 OOXML 包（zip）：
//! 标题/列表/表格/代码块/引用/图片全部使用 Word 原生语义，颜色由前端传入的主题变量决定。

use pulldown_cmark::{Alignment, CodeBlockKind, Event, HeadingLevel, LinkType, Options, Parser, Tag, TagEnd};
use base64::Engine as _;
use std::io::Write;
use std::path::Path;

type EventIter<'a> = std::iter::Peekable<Parser<'a>>;

/// 导出主题参数（由前端从当前主题/设置传入，JSON 字段为 camelCase）
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocxTheme {
    /// 强调色（标题/链接颜色），hex 不带 #，如 "0066CC"
    pub accent: String,
    /// 正文颜色
    pub text: String,
    /// 正文字体族（CSS font-family 栈）
    pub font: String,
    /// 等宽字体族
    pub mono_font: String,
    /// 边框色（对应主题 --editor-border），用于表格/分隔线
    #[serde(default)]
    pub border: String,
    /// 表格表头底色（对应主题 --editor-surface）
    #[serde(default)]
    pub surface: String,
    /// 正文字号（CSS px，对应设置的「预览字号」）。缺省 16px（--font-size-base）
    #[serde(default)]
    pub font_size_px: Option<f64>,
    /// 行高倍数（对应设置的「预览行高」，CSS line-height 的无单位值）。缺省 1.75
    #[serde(default)]
    pub line_height: Option<f64>,
    /// 代码块语法高亮（前端从预览 DOM 读出；缺省则单色输出）
    #[serde(default)]
    pub code_highlights: CodeHighlights,
}

/// 代码块里某个「类路径」的样式（由前端按当前主题读 computed style 得到）。
#[derive(Debug, Clone, Default, serde::Deserialize)]
pub struct CodeStyle {
    /// CSS 颜色（`rgb(…)` 或 `#rrggbb`；Rust 侧统一归一成六位十六进制）
    #[serde(default)]
    pub color: String,
    /// 是否加粗（对应 `.hljs-strong`）
    #[serde(default)]
    pub bold: bool,
    /// 是否斜体（对应 `.hljs-emphasis`）
    #[serde(default)]
    pub italic: bool,
}

/// 代码块语法高亮：**复用预览同一份 highlight.js 的分词结果**，不在 Rust 侧另写分词器。
///
/// 预览的着色 = highlight.js 的 token 划分 + 主题的 `--code-*` 颜色，任何独立实现都必然与
/// 预览有出入。因此由前端从预览 DOM（`.editor-content pre.hljs > code`）里读出：
///   - `blocks`：`"<语言>\u{1f}<规范化代码>"` → 着色片段 `[(类路径, 文本)]`；
///   · `styles`：类路径 → 颜色/粗体/斜体（computed style ⇒ 换主题、改自定义 CSS 都会自动跟随）。
///
/// 查不到时按单色等宽输出（缩进式代码块、预览未渲染等都走这条兜底）。
#[derive(Debug, Clone, Default, serde::Deserialize)]
pub struct CodeHighlights {
    #[serde(default)]
    pub styles: std::collections::HashMap<String, CodeStyle>,
    #[serde(default)]
    pub blocks: std::collections::HashMap<String, Vec<(String, String)>>,
}

/// 导出排版的度量值：全部由「正文字号 + 行高」推导，保证 docx 与预览同比例。
///
/// 换算依据：CSS px → 磅 `pt = px × 0.75`；OOXML 字号 `w:sz` 是半磅；OOXML 长度是 twips（1pt = 20）。
#[derive(Debug, Clone, Copy)]
struct Metrics {
    /// 正文字号（磅）
    body_pt: f64,
    /// 正文字号（半磅，`w:sz`）
    body_sz: u32,
    /// 正文行距（`w:line`，lineRule=auto；240 = 单倍）
    line: u32,
}

impl Metrics {
    /// Word 的「单倍行距」≈ 1.2 倍字号（随字体度量浮动）；CSS 的 line-height 是「倍数 × 字号」，
    /// 因此换算成 `w:line` 需要除以 1.2。
    const WORD_SINGLE: f64 = 1.2;

    /// 脚注文字相对正文字号的倍数（Word 惯例：比正文小一号）。
    /// 正文与脚注**共用**这一个常量：`styles.xml` 的 `FootnoteText` 与脚注内各段/各 run 的
    /// 显式字号都由它推导，否则脚注里的列表项会继承 `Normal` 的正文字号（比脚注正文大一圈）。
    const FOOTNOTE_RATIO: f64 = 0.83;

    fn new(font_size_px: Option<f64>, line_height: Option<f64>) -> Self {
        // 缺省值取应用自身的 CSS 缺省：`--font-size-base: 16px` / `--line-height: 1.8`
        let px = font_size_px.unwrap_or(16.0).clamp(4.0, 200.0);
        let body_pt = px * 0.75;
        let body_sz = (px * 1.5).round().max(2.0) as u32;
        let mut m = Metrics { body_pt, body_sz, line: 240 };
        m.line = m.line_of(line_height.unwrap_or(1.8).clamp(1.0, 5.0));
        m
    }

    /// CSS 行高倍数 → `w:line`（`lineRule="auto"`，240 = 单倍）
    fn line_of(&self, lh: f64) -> u32 {
        (240.0 * lh / Self::WORD_SINGLE).round().clamp(240.0, 240.0 * 6.0) as u32
    }

    /// `em`（相对正文字号）→ twips
    fn em_twips(&self, em: f64) -> u32 {
        (em * self.body_pt * 20.0).round().max(0.0) as u32
    }

    /// 相对正文字号的倍数 → 半磅（`w:sz`）
    fn sz_scale(&self, scale: f64) -> u32 {
        Self::sz_scale_from(self.body_sz, scale)
    }

    /// 以给定基准字号（半磅）为 1 倍时的倍数 → 半磅（`w:sz`）。
    /// 脚注内部的一切乘算（代码块 0.9 倍、脚注正文 0.83 倍）都以**脚注字号**为基准，
    /// 否则脚注里的行内代码会比脚注正文还大。
    fn sz_scale_from(base_sz: u32, scale: f64) -> u32 {
        (base_sz as f64 * scale).round().clamp(2.0, 400.0) as u32
    }

    /// 脚注正文字号（半磅）
    fn footnote_sz(&self) -> u32 {
        Self::sz_scale_from(self.body_sz, Self::FOOTNOTE_RATIO)
    }
}

/// 代码文本规范化：**前端与 Rust 必须完全用同一规则**，否则高亮查表键永远对不上。
/// 统一换行为 `\n`（CRLF / 单独 CR 都算换行），并去掉末尾换行 —— 末尾换行只是 Markdown
/// 语法产物，不是代码内容（预览里它也只是 HTML 里的空白）。
fn normalize_code(s: &str) -> String {
    s.replace("\r\n", "\n").replace('\r', "\n").trim_end_matches('\n').to_string()
}

/// 语法高亮查表键：语言 + `U+001F`（正文里不可能出现的控制字符）+ 规范化后的代码。
/// 语言取围栏信息串的**第一个词**（与 markdown-it 传给 `highlight` 的 `langName` 一致、不做大小写变换）。
fn code_key(lang: &str, code: &str) -> String {
    format!("{}{}{}", lang, '\u{1f}', code)
}

/// CSS 颜色 → OOXML 的 6 位十六进制（不带 #）。
/// 支持 #rgb / #rrggbb / rgb() / rgba()（alpha 按白底合成——导出页为白底）；
/// 无法识别时返回 fallback。
fn css_color_to_hex(v: &str, fallback: &str) -> String {
    let s = v.trim();
    if s.is_empty() {
        return fallback.to_string();
    }
    // #rgb / #rrggbb / 裸 rrggbb（调用方既可能带 # 也可能不带）
    let hex = s.strip_prefix('#').unwrap_or(s);
    if hex.len() == 6 && hex.chars().all(|c| c.is_ascii_hexdigit()) {
        return hex.to_uppercase();
    }
    if hex.len() == 3 && hex.chars().all(|c| c.is_ascii_hexdigit()) {
        return hex.chars().flat_map(|c| [c, c]).collect::<String>().to_uppercase();
    }
    let lowered = s.to_ascii_lowercase();
    if lowered.starts_with("rgb(") || lowered.starts_with("rgba(") {
        if let (Some(open), Some(close)) = (s.find('('), s.rfind(')')) {
            let parse_part = |p: &str| -> Option<f64> {
                let p = p.trim();
                if let Some(pct) = p.strip_suffix('%') {
                    pct.parse::<f64>().ok().map(|x| x / 100.0 * 255.0)
                } else {
                    p.parse::<f64>().ok()
                }
            };
            let parts: Vec<f64> = s[open + 1..close]
                .split(|c| c == ',' || c == '/' || c == ' ')
                .filter(|p| !p.trim().is_empty())
                .filter_map(parse_part)
                .collect();
            if parts.len() >= 3 {
                let a = if parts.len() >= 4 { parts[3].clamp(0.0, 1.0) } else { 1.0 };
                let comp = |c: f64| -> u8 { (c.clamp(0.0, 255.0) * a + 255.0 * (1.0 - a)).round().clamp(0.0, 255.0) as u8 };
                return format!("{:02X}{:02X}{:02X}", comp(parts[0]), comp(parts[1]), comp(parts[2]));
            }
        }
    }
    fallback.to_string()
}

fn esc(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            // XML 解析会把 `w:t` 里的换行折成空白，且换行不可能是有意排版（换行一律用 `<w:br/>`），
            // 故归一为空格；`\r` 直接丢弃（防止 CRLF 变成两个空格）
            '\n' => out.push(' '),
            '\r' => {}
            c if (c as u32) < 0x20 && c != '\t' => {}
            c => out.push(c),
        }
    }
    out
}

/// 软换行分隔符（run 内换行）：Word 的 `<w:br/>`。
///
/// **必须包在 `<w:r>` 里**：`w:br` 是 run 级元素（CT_R 的成员），直接挂在 `<w:p>` 下不是合法的
/// 段落内容，Word/WPS 会整段忽略 —— 表现为「软换行、硬换行、代码块行间换行全部消失，文字挤成一行」。
/// 因此这里连同外层 run 一起给出。
const BR: &str = "<w:r><w:br/></w:r>";

/// 项目符号字形字体。`◦ U+25E6` / `▪ U+25AA` 在 MiSans / 宋体里**没有**字形（cmap 实测），
/// 但微软雅黑的这两个码位与它自己的 `•` 同尺寸；配合 fontTable 的 altName 链
/// （Segoe UI Symbol / Apple Symbols / … 都有这两个字形）保证跨平台可用。
const BULLET_GLYPH_FONT: &str = "Microsoft YaHei";

/// 项目符号字形：一级实心圆点 `•`、二级空心圆点 `◦`、三级实心小方块 `▪`，四级及以后循环
/// （对应预览里 `ul` / `ul ul` / `ul ul ul` 的 UA 样式 disc / circle / square）。
///
/// 字形**大小必须视觉一致**：MiSans 里 `• U+2022` 的墨迹只有 0.29em，而 `○ U+25CB` / `■ U+25A0`
/// 是 0.72em —— 用后两者当二/三级符号会「层级越低、符号越大」。实测微软雅黑
/// （再用 `fallback()` 链替换）的 `◦` / `▪` 墨迹为 0.275 / 0.245em，与 `•` 的 0.275em 相当，
/// 因此二/三级改用这两个小码位并显式指定字体；一级沿用正文字体（`•` 各字体都有，不必换字体）。
const BULLET_LEVELS: [(&str, Option<&str>); 3] = [
    ("\u{2022}", None),                      // •  一级：实心圆点
    ("\u{25E6}", Some(BULLET_GLYPH_FONT)),   // ◦  二级：空心圆点
    ("\u{25AA}", Some(BULLET_GLYPH_FONT)),   // ▪  三级：实心小方块
];

/// 任务列表勾选字形。`☐ U+2610` / `☑ U+2611` 在 MiSans / 微软雅黑 / 宋体 / Segoe UI
/// **均无字形**（cmap 实测），只有 Segoe UI Symbol / MS Gothic / Apple Symbols / Arial Unicode MS
/// 这类符号字体才有，因此这一对字形必须显式指定符号字体（配合 fontTable 的 altName 链做跨平台替换）。
const TASK_GLYPH_FONT: &str = "Segoe UI Symbol";

/// 按逗号切分 CSS font-family 栈，尊重单/双引号（引号内的逗号不切分）
fn split_font_stack(stack: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut quote: Option<char> = None;
    for c in stack.chars() {
        match c {
            '\'' | '"' => {
                if quote == Some(c) {
                    quote = None;
                } else if quote.is_none() {
                    quote = Some(c);
                }
                cur.push(c);
            }
            ',' if quote.is_none() => out.push(std::mem::take(&mut cur)),
            _ => cur.push(c),
        }
    }
    out.push(cur);
    out
}

/// CSS 通用族 / 系统关键字 → 具体字体名。
/// 这些字符串**不是字体名**，原样写进 `w:rFonts` 会被 Word 当成缺失字体，必须先映射。
fn css_generic_to_font(name: &str) -> String {
    match name.to_ascii_lowercase().as_str() {
        "system-ui" | "-apple-system" | "blinkmacsystemfont" | "ui-sans-serif" | "sans-serif" => {
            "Microsoft YaHei".to_string()
        }
        "serif" | "ui-serif" => "SimSun".to_string(),
        "monospace" | "ui-monospace" => "Consolas".to_string(),
        _ => name.to_string(),
    }
}

/// 从 CSS font-family 栈提取**第一个族名**（去引号），并把 CSS 关键字映射为具体字体名。
/// `'MiSans', 'Mi Sans', system-ui, …` → `MiSans`；`system-ui, 'MiSans'` → `Microsoft YaHei`
fn first_family(stack: &str) -> String {
    for raw in split_font_stack(stack) {
        let name = raw.trim().trim_matches(|c| c == '\'' || c == '"').trim();
        if !name.is_empty() {
            return css_generic_to_font(name);
        }
    }
    "Microsoft YaHei".to_string()
}

/// 字体名是否属中日韩字体（决定 fontTable 的 `w:charset`：86=GB2312 / 00=ANSI）
fn is_cjk_family(name: &str) -> bool {
    const CJK: &[&str] = &[
        "misans", "yahei", "pingfang", "noto sans sc", "noto sans tc", "source han", "simsun",
        "simhei", "harmonyos", "hiragino", "heiti", "songti", "kaiti",
        "宋体", "微软雅黑", "苹方", "思源",
    ];
    let lower = name.to_ascii_lowercase();
    CJK.iter().any(|k| lower.contains(k))
}

/// 生成 `word/fontTable.xml`：给用到的字体各挂一份**替代名清单**（`w:altName`）。
///
/// 依据 ISO/IEC 29500-1：主名称找不到时，应用**应依次尝试 `altName` 列表（逗号分隔）并取第一个命中的**，
/// 且优先于「按字体度量自动替换」。**装有该字体时本部件完全不被读取 → 输出与改动前一致。**
fn font_table_xml(theme: &DocxTheme) -> String {
    let mut s = String::from(
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><w:fonts xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">",
    );
    let charset = |f: &str| if is_cjk_family(f) { "86" } else { "00" };
    // 正文字体：一条链同时覆盖 Windows / macOS / Linux 与拉丁兜底
    s.push_str(&format!(
        "<w:font w:name=\"{}\"><w:altName w:val=\"Microsoft YaHei, PingFang SC, Noto Sans SC, Segoe UI, Arial\"/><w:charset w:val=\"{}\"/><w:family w:val=\"swiss\"/><w:pitch w:val=\"variable\"/></w:font>",
        esc(&theme.font),
        charset(&theme.font)
    ));
    // 等宽字体（与正文同名则跳过——fontTable 以 name 为键，不可重复）
    if !theme.mono_font.eq_ignore_ascii_case(&theme.font) {
        s.push_str(&format!(
            "<w:font w:name=\"{}\"><w:altName w:val=\"Cascadia Mono, Consolas, Courier New, DejaVu Sans Mono\"/><w:charset w:val=\"{}\"/><w:family w:val=\"modern\"/><w:pitch w:val=\"fixed\"/></w:font>",
            esc(&theme.mono_font),
            charset(&theme.mono_font)
        ));
    }
    // 任务列表勾选字形（☐ U+2610 / ☑ U+2611）在常见中日韩与拉丁字体里**没有字形**
    // （cmap 实测：MiSans / 微软雅黑 / 宋体 / Segoe UI 均无），只有符号字体才有，
    // 因此必须显式指定字体，并用替代名链覆盖 macOS / Linux（找不到主名称时才读取）
    if !theme.font.eq_ignore_ascii_case(TASK_GLYPH_FONT)
        && !theme.mono_font.eq_ignore_ascii_case(TASK_GLYPH_FONT)
    {
        s.push_str(&format!(
            "<w:font w:name=\"{}\"><w:altName w:val=\"MS Gothic, Apple Symbols, Arial Unicode MS, Noto Sans Symbols 2, DejaVu Sans\"/><w:charset w:val=\"00\"/><w:family w:val=\"auto\"/><w:pitch w:val=\"variable\"/></w:font>",
            TASK_GLYPH_FONT
        ));
    }
    // 项目符号二/三级的 `◦ U+25E6` / `▪ U+25AA`（见 `BULLET_LEVELS`）：MiSans / 宋体等
    // 正文字体没有这两个字形，所以显式指定了微软雅黑；不装雅黑的机器（如英文版 Windows、
    // macOS）靠下面的替代名链落到自带这两个字形的符号字体上
    if !theme.font.eq_ignore_ascii_case(BULLET_GLYPH_FONT)
        && !theme.mono_font.eq_ignore_ascii_case(BULLET_GLYPH_FONT)
    {
        s.push_str(&format!(
            "<w:font w:name=\"{}\"><w:altName w:val=\"Segoe UI Symbol, PingFang SC, Apple Symbols, Arial Unicode MS, DejaVu Sans\"/><w:charset w:val=\"{}\"/><w:family w:val=\"auto\"/><w:pitch w:val=\"variable\"/></w:font>",
            BULLET_GLYPH_FONT,
            charset(BULLET_GLYPH_FONT)
        ));
    }
    // 注：曾在此为 numbering.xml 的项目符号挂 Symbol 替代名链。项目符号已改为只写 Unicode
    // 码位、不指定字体（Symbol 对该码位段没有字形），故此条目连同其替代名链一并移除。
    s.push_str("</w:fonts>");
    s
}

/// HTML 实体反转义（覆盖导出关心的常见实体）
fn unescape_html(s: &str) -> String {
    s.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&amp;", "&")
}

/// 从单个标签片段中取属性值（支持 `"…"` / `'…'` / 无引号；
/// 要求属性名前是空白或 `<`，避免误匹配 `data-src`、`xsrc` 等）
fn extract_attr(tag: &str, name: &str) -> Option<String> {
    let b = tag.as_bytes();
    let n = name.len();
    let mut i = 0;
    while i + n <= b.len() {
        let prev_ok = i == 0 || b[i - 1].is_ascii_whitespace() || b[i - 1] == b'<';
        if prev_ok && b[i..i + n].eq_ignore_ascii_case(name.as_bytes()) {
            let mut j = i + n;
            while j < b.len() && b[j].is_ascii_whitespace() {
                j += 1;
            }
            if j < b.len() && b[j] == b'=' {
                j += 1;
                while j < b.len() && b[j].is_ascii_whitespace() {
                    j += 1;
                }
                if j < b.len() && (b[j] == b'"' || b[j] == b'\'') {
                    let q = b[j] as char;
                    let s = j + 1;
                    let end = tag[s..].find(q)?;
                    return Some(unescape_html(&tag[s..s + end]));
                }
                let s = j;
                // 无引号取值：终止于空白或 `>`（不能以 `/` 结尾判断——URL 里含 `/`），
                // 末尾单个 `/` 属于自闭合标签语法，需剥掉
                let end = b[s..]
                    .iter()
                    .position(|c| c.is_ascii_whitespace() || *c == b'>')
                    .map(|e| s + e)
                    .unwrap_or(b.len());
                let raw = tag[s..end].strip_suffix('/').unwrap_or(&tag[s..end]);
                return Some(unescape_html(raw));
            }
        }
        i += 1;
    }
    None
}

/// 去掉 HTML 标签，仅保留标签之间的文本（朴素实现：以 `<`…`>` 为标签边界）
fn html_plain_text(html: &str) -> String {
    let mut out = String::new();
    let mut in_tag = false;
    for c in html.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    out
}

/// 一段 HTML 里的 `<img>` 引用
struct ImgRef {
    src: String,
    width: Option<SizeHint>,
}

/// 从一段 HTML 中提取所有 `<img>`（src + width 提示；标签名大小写不敏感）。
/// 用于让导出的 DOCX 也能嵌入以 HTML 标签书写的图片。
fn extract_imgs(html: &str) -> Vec<ImgRef> {
    let b = html.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i + 4 <= b.len() {
        let is_img = b[i] == b'<'
            && b[i + 1].eq_ignore_ascii_case(&b'i')
            && b[i + 2].eq_ignore_ascii_case(&b'm')
            && b[i + 3].eq_ignore_ascii_case(&b'g')
            && b.get(i + 4).map_or(true, |c| c.is_ascii_whitespace() || *c == b'>' || *c == b'/');
        if is_img {
            let end = html[i..].find('>').map(|e| i + e).unwrap_or(html.len());
            let tag = &html[i..end];
            if let Some(src) = extract_attr(tag, "src") {
                if !src.trim().is_empty() {
                    out.push(ImgRef {
                        src,
                        width: extract_attr(tag, "width").as_deref().and_then(parse_size_hint),
                    });
                }
            }
            i = end + 1;
            continue;
        }
        i += 1;
    }
    out
}

/// 只取 src（供下载侧收集网络图片 URL）
pub(crate) fn extract_img_srcs(html: &str) -> Vec<String> {
    extract_imgs(html).into_iter().map(|i| i.src).collect()
}

/// 行内 HTML 标签 → 文本状态增量。
///
/// 返回 `Some(true)` 表示该标签是换行（`<br>`）、`Some(false)` 表示已按属性处理、
/// `None` 表示不支持（保持原有「忽略未知标签」的行为）。
/// `mono` 单独传入：`<code>`/`<kbd>` 只切换等宽，不改 `InlineState`。
fn apply_html_inline_tag(tag: &str, st: &mut InlineState, mono: &mut bool) -> Option<bool> {
    let inner = tag.trim().trim_start_matches('<').trim_end_matches('>').trim();
    if inner.is_empty() {
        return None;
    }
    let (closing, body) = match inner.strip_prefix('/') {
        Some(rest) => (true, rest),
        None => (false, inner),
    };
    let name = body
        .split(|c: char| c.is_whitespace() || c == '/')
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();
    let on = !closing;
    match name.as_str() {
        "br" => Some(true),
        "sup" => { st.sup = on; Some(false) }
        "sub" => { st.sub = on; Some(false) }
        "u" | "ins" => { st.underline = on; Some(false) }
        "mark" => { st.highlight = on; Some(false) }
        "b" | "strong" => { st.bold = on; Some(false) }
        "i" | "em" => { st.italic = on; Some(false) }
        "s" | "del" | "strike" => { st.strike = on; Some(false) }
        "code" | "kbd" | "samp" | "tt" => { *mono = on; Some(false) }
        _ => None,
    }
}

/// 中文/全角标点与空白都算 URL 的边界（中文里 URL 常直接紧跟正文，没有空格隔开）
fn is_url_boundary(c: char) -> bool {
    !c.is_ascii_alphanumeric() && c != '@' && c != '/' && c != '_' && c != '-'
}

/// 在纯文本中定位首个裸 URL，返回 `(起, 止)` 字节区间（对应预览的 `linkify`）。
/// 只认 `http://` / `https://`；结尾的句读标点不算 URL 的一部分。
fn find_bare_url(s: &str) -> Option<(usize, usize)> {
    const REQUIRED_TAIL: usize = 4; // 协议之后至少要有这么长，避免把 `http://` 本身当链接
    for (i, _) in s.char_indices() {
        let rest = &s[i..];
        let scheme = if rest.starts_with("https://") {
            "https://"
        } else if rest.starts_with("http://") {
            "http://"
        } else {
            continue;
        };
        if !s[..i].chars().next_back().map_or(true, is_url_boundary) {
            continue;
        }
        let mut end = s.len();
        for (j, c) in rest.char_indices() {
            if c.is_whitespace() || matches!(c, '<' | '>' | '"' | '\'') {
                end = i + j;
                break;
            }
        }
        // URL 内部不含中文标点（`https://x。` 的句号属于句子）
        if let Some(k) = rest.find(|c: char| is_cjk_punct(c)) {
            end = end.min(i + k);
        }
        let end = i + rest[..end - i]
            .trim_end_matches(|c: char| matches!(c, '.' | ',' | ';' | ':' | '!' | '?' | ')' | ']' | '}' | '、' | '，' | '。' | '：' | '；' | '！' | '？'))
            .len();
        if end >= i + scheme.len() + REQUIRED_TAIL {
            return Some((i, end));
        }
    }
    None
}

fn is_cjk_punct(c: char) -> bool {
    matches!(c, '、' | '，' | '。' | '：' | '；' | '！' | '？' | '（' | '）' | '《' | '》' | '【' | '】' | '“' | '”' | '‘' | '’')
}

#[derive(Default, Clone, Copy)]
struct InlineState {
    bold: bool,
    italic: bool,
    strike: bool,
    link: bool,
    /// `<u>` / `<ins>`
    underline: bool,
    /// `<mark>`
    highlight: bool,
    /// `<sup>` / `^x^`
    sup: bool,
    /// `<sub>` / `~x~`
    sub: bool,
}

/// 从图片二进制**文件头**判定类型（返回 OOXML 用的扩展名）。
/// 与 `main.rs` 里远程图片的 MIME 探测保持一致：本地图片此前只看扩展名，
/// 无扩展名 / `.jfif` / 扩展名不符的图片会被静默丢弃。
fn sniff_image_ext(data: &[u8]) -> Option<&'static str> {
    if data.len() >= 8 && &data[..8] == b"\x89PNG\r\n\x1a\n" {
        return Some("png");
    }
    if data.len() >= 3 && &data[..3] == b"\xFF\xD8\xFF" {
        return Some("jpeg");
    }
    if data.len() >= 6 && (&data[..6] == b"GIF87a" || &data[..6] == b"GIF89a") {
        return Some("gif");
    }
    if data.len() >= 2 && &data[..2] == b"BM" {
        return Some("bmp");
    }
    if data.len() >= 12 && &data[..4] == b"RIFF" && &data[8..12] == b"WEBP" {
        return Some("webp");
    }
    None
}

/// 扩展名 → OOXML 图片类型（仅当文件头无法识别时的兜底）
fn ext_to_image_kind(ext: &str) -> Option<String> {
    match ext.to_ascii_lowercase().as_str() {
        "jpg" | "jpeg" | "jpe" | "jfif" => Some("jpeg".to_string()),
        "png" | "gif" | "bmp" | "webp" => Some(ext.to_ascii_lowercase()),
        _ => None,
    }
}

/// WebP → PNG。Word / WPS **都不能渲染 webp**（内嵌后文档里是空框），
/// 而预览能正常显示 —— 为不与预览脱节，嵌入前统一转码为 PNG。
fn webp_to_png(data: &[u8]) -> Option<Vec<u8>> {
    use image::ImageEncoder as _;
    let img = image::load_from_memory_with_format(data, image::ImageFormat::WebP).ok()?;
    let rgba = img.to_rgba8();
    let (w, h) = (rgba.width(), rgba.height());
    let mut out: Vec<u8> = Vec::new();
    image::codecs::png::PngEncoder::new(&mut out)
        .write_image(rgba.as_raw(), w, h, image::ExtendedColorType::Rgba8)
        .ok()?;
    Some(out)
}

/// 从内容判定 SVG。SVG 是文本 XML、没有位图魔数，`sniff_image_ext` 天生认不出它。
/// 只容忍开头出现空白/BOM/`<?xml?>`/注释/DOCTYPE，正文里出现 `<svg` 即认定为 SVG。
fn sniff_svg(data: &[u8]) -> bool {
    let head = &data[..data.len().min(4096)];
    // 含 NUL 视为二进制，不是 SVG 文本
    if head.contains(&0) {
        return false;
    }
    let text = String::from_utf8_lossy(head).to_ascii_lowercase();
    let trimmed = text.trim_start_matches('\u{feff}').trim_start();
    trimmed.starts_with('<') && trimmed.contains("<svg")
}

/// resvg/usvg 用的系统字体库。**只加载一次并缓存**：每次渲染都遍历系统字体会显著拖慢导出。
///
/// 必须有系统字体：SVG 里的 `<text>`（尤其是中文）要靠系统字体才能渲染出来，否则文字会丢。
fn system_fontdb() -> std::sync::Arc<resvg::usvg::fontdb::Database> {
    static DB: once_cell::sync::OnceCell<std::sync::Arc<resvg::usvg::fontdb::Database>> =
        once_cell::sync::OnceCell::new();
    DB.get_or_init(|| {
        let mut db = resvg::usvg::fontdb::Database::new();
        db.load_system_fonts();
        std::sync::Arc::new(db)
    })
    .clone()
}

/// 栅格化倍率上限（像素）：回退位图用，超大 SVG 不至于生成巨型 PNG
const SVG_RASTER_MAX_PX: f64 = 4096.0;

/// SVG → PNG 回退位图。返回 `(PNG 字节, SVG 固有宽 px, SVG 固有高 px)`。
///
/// 为什么需要：Word 2016+/365 认识 `asvg:svgBlip`（矢量、可缩放），但旧版 Word / WPS /
/// LibreOffice 只认位图，LibreOffice 在没有回退图时**什么都不显示**（tdf#126084），
/// 因此矢量与回退图必须同时写进包里。
fn svg_to_png(data: &[u8]) -> Option<(Vec<u8>, f64, f64)> {
    let mut opt = resvg::usvg::Options::default();
    opt.fontdb = system_fontdb();
    let tree = resvg::usvg::Tree::from_data(data, &opt).ok()?;
    let size = tree.size();
    let (w, h) = (f64::from(size.width()), f64::from(size.height()));
    if !(w > 0.0 && h > 0.0) {
        return None;
    }
    // 目标：宽约 1000px 的清晰回退图；倍率限制 1~3，再按 4096px 上限收一次（保持宽高比）
    let scale = (1000.0 / w).clamp(1.0, 3.0).min(SVG_RASTER_MAX_PX / w).min(SVG_RASTER_MAX_PX / h);
    let scale = if scale > 0.0 { scale } else { 1.0 };
    let pw = ((w * scale).round() as u32).max(1);
    let ph = ((h * scale).round() as u32).max(1);
    let mut pixmap = resvg::tiny_skia::Pixmap::new(pw, ph)?;
    resvg::render(
        &tree,
        resvg::tiny_skia::Transform::from_scale(scale as f32, scale as f32),
        &mut pixmap.as_mut(),
    );
    // encode_png 内部会做反预乘（tiny-skia 的像素是预乘 alpha）
    let png = pixmap.encode_png().ok()?;
    Some((png, w, h))
}

/// LaTeX → OMML（Word 原生可编辑公式），返回 `<m:oMath>…</m:oMath>`。
///
/// 引擎是 vendor 进来的 `crate::omml`（tex2word-math v1.0.6，MIT，见 `src/omml/`）。
/// **任何异常都退回 None**（解析器 panic、结果里一个字符都没有），调用方随后退回
/// 「等宽 TeX 源码」——公式宁可显示成源码，也绝不静默丢弃。
fn omml_of(tex: &str) -> Option<String> {
    let tex = tex.trim();
    if tex.is_empty() {
        return None;
    }
    // 第三方解析器不在我们的控制内：挡住 panic，导出失败比公式变源码更糟
    let out = std::panic::catch_unwind(|| crate::omml::to_omath(tex)).ok()?;
    let out = preserve_math_spaces(&out);
    // 整段都是未知宏（引擎会静默丢掉）时结果为空白公式，此时退回 TeX 源码更有用
    if !out.contains("<m:t") {
        return None;
    }
    Some(out)
}

/// `m:t` 与 `w:t` 一样默认吞掉首尾空格（OOXML 文本规则），统一补 `xml:space="preserve"`
fn preserve_math_spaces(omml: &str) -> String {
    if !omml.contains("<m:t>") {
        return omml.to_string();
    }
    omml.replace("<m:t>", "<m:t xml:space=\"preserve\">")
}

/// 块级公式：`<m:oMathPara>` 包一层（与 Word 自己写出的结构一致），
/// `m:jc=centerGroup` 让整组公式居中；多行公式（cases/aligned）整组一起居中
fn math_para_xml(omml: &str) -> String {
    format!(
        "<m:oMathPara><m:oMathParaPr><m:jc m:val=\"centerGroup\"/></m:oMathParaPr>{}</m:oMathPara>",
        omml
    )
}

/// 从图片二进制头部解析宽高（PNG/JPEG/GIF/BMP），失败返回 None
fn image_dimensions(ext: &str, data: &[u8]) -> Option<(u32, u32)> {
    match ext {
        "png" => {
            if data.len() >= 24 && &data[..8] == b"\x89PNG\r\n\x1a\n" && &data[12..16] == b"IHDR" {
                let w = u32::from_be_bytes([data[16], data[17], data[18], data[19]]);
                let h = u32::from_be_bytes([data[20], data[21], data[22], data[23]]);
                if w > 0 && h > 0 { Some((w, h)) } else { None }
            } else {
                None
            }
        }
        "gif" => {
            if data.len() >= 10 && (&data[..6] == b"GIF87a" || &data[..6] == b"GIF89a") {
                let w = u16::from_le_bytes([data[6], data[7]]) as u32;
                let h = u16::from_le_bytes([data[8], data[9]]) as u32;
                if w > 0 && h > 0 { Some((w, h)) } else { None }
            } else {
                None
            }
        }
        "bmp" => {
            if data.len() >= 26 && &data[..2] == b"BM" {
                let w = i32::from_le_bytes([data[18], data[19], data[20], data[21]]);
                let h = i32::from_le_bytes([data[22], data[23], data[24], data[25]]);
                if w > 0 && h != 0 { Some((w as u32, h.unsigned_abs())) } else { None }
            } else {
                None
            }
        }
        "webp" => {
            if data.len() >= 12 && &data[..4] == b"RIFF" && &data[8..12] == b"WEBP" {
                let mut i = 12;
                while i + 8 <= data.len() {
                    let fourcc = &data[i..i + 4];
                    let size = u32::from_le_bytes([data[i + 4], data[i + 5], data[i + 6], data[i + 7]]) as usize;
                    let payload = &data[i + 8..];
                    if size + 10 <= data.len() {
                        if fourcc == b"VP8 " && payload.len() >= 10
                            && payload[3] == 0x9D && payload[4] == 0x01 && payload[5] == 0x2A
                        {
                            let w = (u16::from_le_bytes([payload[6], payload[7]]) & 0x3FFF) as u32;
                            let h = (u16::from_le_bytes([payload[8], payload[9]]) & 0x3FFF) as u32;
                            if w > 0 && h > 0 { return Some((w, h)); }
                        } else if fourcc == b"VP8L" && payload.len() >= 5 && payload[0] == 0x2F {
                            let v = u32::from_le_bytes([payload[1], payload[2], payload[3], payload[4]]);
                            let w = (v & 0x3FFF) + 1;
                            let h = ((v >> 14) & 0x3FFF) + 1;
                            return Some((w, h));
                        } else if fourcc == b"VP8X" && payload.len() >= 10 {
                            let w = (payload[4] as u32 | (payload[5] as u32) << 8 | (payload[6] as u32) << 16) + 1;
                            let h = (payload[7] as u32 | (payload[8] as u32) << 8 | (payload[9] as u32) << 16) + 1;
                            return Some((w, h));
                        }
                    }
                    i += 8 + size + (size & 1); // 块按 2 字节对齐
                }
                None
            } else {
                None
            }
        }
        "jpeg" => {
            if data.len() > 4 && data[0] == 0xFF && data[1] == 0xD8 {
                let mut i = 2;
                while i + 9 < data.len() {
                    if data[i] != 0xFF {
                        i += 1;
                        continue;
                    }
                    let marker = data[i + 1];
                    if marker == 0xD8 || marker == 0x01 || (0xD0..=0xD7).contains(&marker) {
                        i += 2;
                        continue;
                    }
                    if i + 3 >= data.len() {
                        break;
                    }
                    let len = u16::from_be_bytes([data[i + 2], data[i + 3]]) as usize;
                    if marker >= 0xC0 && marker <= 0xCF && marker != 0xC4 && marker != 0xC8 && marker != 0xCC {
                        if i + 9 < data.len() {
                            let h = u16::from_be_bytes([data[i + 5], data[i + 6]]) as u32;
                            let w = u16::from_be_bytes([data[i + 7], data[i + 8]]) as u32;
                            if h > 0 && w > 0 { return Some((w, h)); }
                        }
                    }
                    i += 2 + len;
                }
                None
            } else {
                None
            }
        }
        _ => None,
    }
}

/// HTML `<img>` 的 width 属性值（决定导出宽度）
#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) enum SizeHint {
    /// 像素（无单位按 CSS px 处理，96dpi）
    Px(f64),
    /// 磅
    Pt(f64),
    /// 占正文宽度的百分比
    Percent(f64),
}

/// 解析 width 属性值：支持无单位/`px`/`pt`/`%`；其余（em、rem、auto 等）忽略
fn parse_size_hint(v: &str) -> Option<SizeHint> {
    let s = v.trim().to_ascii_lowercase();
    let positive = |x: f64| if x > 0.0 { Some(x) } else { None };
    if let Some(p) = s.strip_suffix('%') {
        return p.trim().parse::<f64>().ok().and_then(positive).map(SizeHint::Percent);
    }
    if let Some(p) = s.strip_suffix("px") {
        return p.trim().parse::<f64>().ok().and_then(positive).map(SizeHint::Px);
    }
    if let Some(p) = s.strip_suffix("pt") {
        return p.trim().parse::<f64>().ok().and_then(positive).map(SizeHint::Pt);
    }
    s.parse::<f64>().ok().and_then(positive).map(SizeHint::Px)
}

/// 计算插入尺寸（EMU）。
/// `width_hint` 来自 HTML 的 width 属性；`None` 时用原图像素（96dpi）并受 6in 上限约束。
/// 高度一律按原图宽高比推算——预览的 `.editor-content img { height:auto }` 会覆盖 HTML 的
/// height 属性，因此高度属性不参与计算，宽高比始终保留、图片不会被拉变形。
fn image_emu(ext: &str, data: &[u8], width_hint: Option<SizeHint>) -> (i64, i64) {
    let natural = image_dimensions(ext, data).map(|(w, h)| (f64::from(w), f64::from(h)));
    image_emu_natural(natural, width_hint)
}

/// 同上，但原图尺寸由调用方给出（SVG 的固有尺寸来自解析结果，不是位图文件头）
fn image_emu_natural(natural: Option<(f64, f64)>, width_hint: Option<SizeHint>) -> (i64, i64) {
    const EMU_PER_PX: i64 = 9525; // 1px @96dpi
    const EMU_PER_PT: i64 = 12700;
    const MAX_W_EMU: i64 = 5_486_400; // 6 英寸（A4 正文可用宽约 6.27in，留余量）

    // 目标宽度：显式 width 优先，否则原图宽度（未知则默认 5in）
    let target_w = match width_hint {
        Some(SizeHint::Px(v)) => (v * EMU_PER_PX as f64) as i64,
        Some(SizeHint::Pt(v)) => (v * EMU_PER_PT as f64) as i64,
        Some(SizeHint::Percent(p)) => (MAX_W_EMU as f64 * p / 100.0) as i64,
        None => natural.map_or(4_572_000, |(w, _)| (w * EMU_PER_PX as f64) as i64),
    };
    let w_emu = target_w.clamp(1, MAX_W_EMU);
    // 高度按原图比例；原图尺寸未知时按 4:3
    let h_emu = match natural {
        Some((w, h)) if w > 0.0 && h > 0.0 => (w_emu as f64 * h / w) as i64,
        _ => (w_emu as f64 * 0.75) as i64,
    };
    (w_emu, h_emu.max(1))
}

struct ImageAsset {
    id: usize,
    ext: String,
    data: Vec<u8>,
    /// SVG 的矢量源字节。`Some` 表示 `data` 是配套的 PNG **回退位图**，
    /// 打包时两份都写（`imageN.svg` + `imageN.png`），阅读器各取所需。
    svg: Option<Vec<u8>>,
}

/// 网络图片映射：原 URL → data URL。
/// 由调用方在导出前下载填充；生成器按解析出的 `dest_url` 精确查表，
/// 因此行内式 `![a](url)` 与引用式 `![a][id]`（解析后 dest_url 相同）都能命中。
pub type RemoteImages = std::collections::HashMap<String, String>;

/// 一个列表的编号实例：**每个列表（顶层与嵌套）都独占一个 `w:num` + `w:abstractNum`**，
/// 从而互不接续编号。
///
/// 为什么不共用 abstractNum：`w:num` 只是 abstractNum 的实例，**计数器挂在 abstractNum 上**，
/// 只有 `startOverride` 这种「层级切换」才重置它。WPS 下共享 abstractNum 的两个有序列表会出现
/// 「第二章变成 3」——第一章的二级列表（第一节、第二节）把计数器推到了 3。每个列表各自一个
/// abstractNum（`w:lvl/w:start` 写在自身）才是真正的实例级独立编号。
struct ListInstance {
    num_id: u32,
    ordered: bool,
    start: u64,
    /// 项目符号层级 = 祖先里无序列表的个数（决定字形 `•` / `◦` / `▪`）
    bullet_depth: u32,
    /// 列表嵌套总深度（决定 `w:ind` 缩进，1 起）
    depth: u32,
}

pub struct DocxBuilder {
    body: String,
    rels: String,
    images: Vec<ImageAsset>,
    next_image_id: usize,
    next_link_id: usize,
    theme: DocxTheme,
    metrics: Metrics,
    base_dir: Option<std::path::PathBuf>,
    remote_images: RemoteImages,
    /// 列表栈：列表实例下标（`lists` 的下标）
    list_stack: Vec<usize>,
    /// 列表实例（生成 numbering.xml 用）
    lists: Vec<ListInstance>,
    next_list_id: u32,
    quote_depth: u32,
    /// 是否正在渲染脚注正文：脚注里的一切字号都以脚注字号为基准（见 `Metrics::FOOTNOTE_RATIO`）
    in_footnote: bool,
    /// 脚注定义：`(id, 正文 XML)`，按 id 升序（生成 footnotes.xml 用）
    footnotes: Vec<(u32, String)>,
    /// 脚注 label → id（引用与定义共用）
    footnote_ids: std::collections::HashMap<String, u32>,
    next_footnote_id: u32,
    /// 文档中**确有定义**的脚注 label（预扫描）：未定义的引用按原文输出，避免生成空引用
    footnote_defined: std::collections::HashSet<String>,
    /// 脚注内部产生的超链接/图片关系（须写在 footnotes.xml.rels 里）
    footnote_rels: String,
    /// 代码块语法高亮（前端用预览同一份 highlight.js 结果算出，见 `CodeHighlights`）
    code_highlights: CodeHighlights,
}

impl DocxBuilder {
    fn new(mut theme: DocxTheme, base_dir: Option<std::path::PathBuf>, remote_images: RemoteImages) -> Self {
        let metrics = Metrics::new(theme.font_size_px, theme.line_height);
        // 高亮数据与主题一起传入，但渲染时按字段独立使用（主题结构里带着纯粹是为了少改一处调用约定）
        let code_highlights = std::mem::take(&mut theme.code_highlights);
        DocxBuilder {
            body: String::new(),
            rels: String::new(),
            images: Vec::new(),
            next_image_id: 0,
            next_link_id: 0,
            theme,
            metrics,
            base_dir,
            remote_images,
            list_stack: Vec::new(),
            lists: Vec::new(),
            // 顶层列表从 100 起分配 numId（1..99 留给潜在的固定实例）
            next_list_id: 100,
            quote_depth: 0,
            in_footnote: false,
            footnotes: Vec::new(),
            footnote_ids: std::collections::HashMap::new(),
            next_footnote_id: 0,
            footnote_defined: std::collections::HashSet::new(),
            footnote_rels: String::new(),
            code_highlights,
        }
    }

    // ---------- 文本/段落辅助 ----------

    /// 当前上下文的正文字号（半磅）：脚注内为脚注字号，否则为文档正文字号。
    /// 脚注里的一切相对倍数（行内代码 0.9em、段落字号）都基于它换算。
    fn base_sz(&self) -> u32 {
        if self.in_footnote { self.metrics.footnote_sz() } else { self.metrics.body_sz }
    }

    /// 基础字号下的 run 上属性（`w:rPr` 内容），供文本 run 与字形 run 复用
    fn run_with(&self, text: &str, st: InlineState, mono: bool, color: Option<&str>, font: Option<&str>) -> String {
        let mut rpr = String::new();
        if st.bold { rpr.push_str("<w:b/><w:bCs/>"); }
        if st.italic { rpr.push_str("<w:i/><w:iCs/>"); }
        if st.strike { rpr.push_str("<w:strike/>"); }
        if st.underline { rpr.push_str("<w:u w:val=\"single\"/>"); }
        if st.highlight { rpr.push_str("<w:highlight w:val=\"yellow\"/>"); }
        // 上/下标互斥（同时出现时上标优先，与浏览器一致的表现）
        if st.sup {
            rpr.push_str("<w:vertAlign w:val=\"superscript\"/>");
        } else if st.sub {
            rpr.push_str("<w:vertAlign w:val=\"subscript\"/>");
        }
        if st.link {
            rpr.push_str(&format!("<w:color w:val=\"{}\"/><w:u w:val=\"single\"/>", esc(&self.theme.accent)));
        }
        if mono {
            let f = esc(&self.theme.mono_font);
            rpr.push_str(&format!("<w:rFonts w:ascii=\"{}\" w:hAnsi=\"{}\" w:eastAsia=\"{}\" w:cs=\"{}\"/>", f, f, f, f));
            // 预览 `.editor-content code { font-size: 0.9em }`；基准字号在脚注里是脚注字号
            let sz = Metrics::sz_scale_from(self.base_sz(), 0.9);
            rpr.push_str(&format!("<w:sz w:val=\"{0}\"/><w:szCs w:val=\"{0}\"/>", sz));
        } else if self.in_footnote {
            // 脚注正文里的普通 run 显式写小字号：脚注段落可能带 `ListParagraph` 等继承
            // `Normal`（正文字号）的样式，只靠 `FootnoteText` 样式继承会被它们盖掉
            let sz = self.base_sz();
            rpr.push_str(&format!("<w:sz w:val=\"{0}\"/><w:szCs w:val=\"{0}\"/>", sz));
        }
        if let Some(f) = font {
            // 显式字体（如任务列表勾选字形）只作用于 ascii/hAnsi/cs —— eastAsia 留给正文字体，
            // 该字形本身是 BMP 符号、不含 CJK 上下文
            let f = esc(f);
            rpr.push_str(&format!("<w:rFonts w:ascii=\"{}\" w:hAnsi=\"{}\" w:cs=\"{}\"/>", f, f, f));
        }
        if let Some(c) = color {
            rpr.push_str(&format!("<w:color w:val=\"{}\"/>", esc(c)));
        }
        format!(
            "<w:r>{}{}</w:r>",
            if rpr.is_empty() { String::new() } else { format!("<w:rPr>{}</w:rPr>", rpr) },
            format!("<w:t xml:space=\"preserve\">{}</w:t>", esc(text))
        )
    }

    fn run(&self, text: &str, st: InlineState, mono: bool, color: Option<&str>) -> String {
        self.run_with(text, st, mono, color, None)
    }

    /// 行内代码：等宽 + 主题 `--editor-surface` 底色（与预览 `.editor-content code` 一致）
    fn code_run(&self, text: &str) -> String {
        let f = esc(&self.theme.mono_font);
        let fill = esc(&self.theme.surface);
        let sz = Metrics::sz_scale_from(self.base_sz(), 0.9);
        format!(
            "<w:r><w:rPr><w:rFonts w:ascii=\"{}\" w:hAnsi=\"{}\" w:eastAsia=\"{}\" w:cs=\"{}\"/><w:sz w:val=\"{}\"/><w:szCs w:val=\"{}\"/><w:shd w:val=\"clear\" w:color=\"auto\" w:fill=\"{}\"/></w:rPr><w:t xml:space=\"preserve\">{}</w:t></w:r>",
            f, f, f, f, sz, sz, fill, esc(text)
        )
    }

    /// 代码块里的**着色片段**：等宽 + 0.9em + 该片段的颜色/粗斜体（来自预览的 computed style）。
    /// 背景不写在 run 上 —— 整个代码块段落的底色由 `CodeBlock` 样式统一绘制。
    fn code_span_run(&self, text: &str, style: Option<&CodeStyle>) -> String {
        let st = match style {
            Some(s) => s,
            None => return self.run(text, InlineState::default(), true, None),
        };
        // 颜色可能读不出来（主题没定义该 token）；此时退回正文色，绝不让文字消失
        let color = css_color_to_hex(&st.color, &self.theme.text);
        let state = InlineState { bold: st.bold, italic: st.italic, ..InlineState::default() };
        self.run(text, state, true, Some(&color))
    }

    /// 代码块正文：优先用前端传来的 highlight.js 着色片段（与预览逐 token 一致），
    /// 查不到就退回单色等宽（缩进式代码块、预览未渲染、语言不匹配等）。
    /// 片段内部的换行同样走 `BR`（run 级 `<w:br/>`），保证「一个代码块 = 一个段落」。
    fn code_block_content(&self, lang: &str, code: &str) -> String {
        let norm = normalize_code(code);
        let mut out = String::new();
        if let Some(spans) = self.code_highlights.blocks.get(&code_key(lang, &norm)) {
            for (chain, text) in spans {
                for (i, seg) in text.split('\n').enumerate() {
                    if i > 0 {
                        out.push_str(BR);
                    }
                    if seg.is_empty() {
                        continue;
                    }
                    out.push_str(&self.code_span_run(seg, self.code_highlights.styles.get(chain)));
                }
            }
            return out;
        }
        for (i, line) in norm.split('\n').enumerate() {
            if i > 0 {
                out.push_str(BR);
            }
            out.push_str(&self.run(line, InlineState::default(), true, None));
        }
        out
    }

    /// 块级公式段落：Word 原生公式（OMML）+ 居中。
    /// 转换失败时退回等宽 TeX 源码（`$$…$$`，去掉内容两端换行），绝不丢公式。
    fn display_math_paragraph(&mut self, tex: &str) {
        let omml = omml_of(tex);
        // 原生公式用 m:jc 居中；退回的 TeX 源码用段落 w:jc 居中
        let jc = if omml.is_none() { "<w:jc w:val=\"center\"/>" } else { "" };
        self.body.push_str(&format!(
            "<w:p><w:pPr><w:pStyle w:val=\"Normal\"/><w:spacing w:before=\"120\" w:after=\"120\"/>{}</w:pPr>",
            jc
        ));
        match omml {
            Some(omml) => self.body.push_str(&math_para_xml(&omml)),
            None => {
                let run = self.run(&format!("$${}$$", tex.trim()), InlineState::default(), true, None);
                self.body.push_str(&run);
            }
        }
        self.body.push_str("</w:p>");
    }

    /// 脚注 label → Word 脚注 id（首次遇到时分配；引用与定义共用同一映射）
    fn footnote_id(&mut self, label: &str) -> u32 {
        if let Some(id) = self.footnote_ids.get(label) {
            return *id;
        }
        self.next_footnote_id += 1;
        let id = self.next_footnote_id;
        self.footnote_ids.insert(label.to_string(), id);
        id
    }

    fn hyperlink_open(&mut self, url: &str) -> String {
        self.next_link_id += 1;
        let rid = format!("rIdLink{}", self.next_link_id);
        self.rels.push_str(&format!(
            "<Relationship Id=\"{}\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink\" Target=\"{}\" TargetMode=\"External\"/>",
            rid, esc(url)
        ));
        format!("<w:hyperlink r:id=\"{}\">", rid)
    }

    fn image_run(&mut self, alt: &str, dest: &str, width_hint: Option<SizeHint>) -> String {
        // 网络图：调用方已预先下载为 data URL，按 dest_url 精确命中（行内式/引用式皆可）
        let dest = self.remote_images.get(dest).map(String::as_str).unwrap_or(dest);
        let (data, ext) = if let Some(rest) = dest.strip_prefix("data:") {
            let (mime, b64) = match rest.split_once(',') {
                Some((m, b)) => (m.to_string(), b.to_string()),
                None => return String::new(),
            };
            let mime_ext = match mime.split(';').next().unwrap_or("") {
                "image/png" => Some("png"),
                "image/jpeg" => Some("jpeg"),
                "image/gif" => Some("gif"),
                "image/bmp" => Some("bmp"),
                "image/webp" => Some("webp"),
                _ => None,
            };
            match base64::engine::general_purpose::STANDARD.decode(b64.trim()) {
                // 同样以内容为准（`data:image/svg+xml` 之类不能按 png 冒充）：
                // 位图看文件头魔数，SVG 是文本、用 `sniff_svg` 单独判定，MIME 仅作最后兜底
                Ok(bytes) => {
                    let kind = sniff_image_ext(&bytes)
                        .map(str::to_string)
                        .or_else(|| if sniff_svg(&bytes) { Some("svg".to_string()) } else { None })
                        .or_else(|| mime_ext.map(str::to_string));
                    match kind {
                        Some(ext) => (bytes, ext),
                        None => {
                            eprintln!("DOCX 导出跳过不支持的图片类型 {}（{}）", dest, mime);
                            return String::new();
                        }
                    }
                }
                Err(_) => return String::new(),
            }
        } else {
            let path = if Path::new(dest).is_absolute() {
                Path::new(dest).to_path_buf()
            } else {
                match &self.base_dir {
                    Some(dir) => dir.join(dest),
                    None => Path::new(dest).to_path_buf(),
                }
            };
            let data = match std::fs::read(&path) {
                Ok(d) => d,
                Err(e) => {
                    eprintln!("DOCX 导出跳过无法读取的图片 {}: {}", path.display(), e);
                    return String::new();
                }
            };
            // 以**文件头**判定类型（扩展名仅作兜底）：此前只认扩展名，导致 `.jfif`、无扩展名
            // 的图片被静默丢弃，扩展名写错的图片则以错误类型嵌入
            let by_ext = || {
                path.extension()
                    .and_then(|e| e.to_str())
                    .and_then(ext_to_image_kind)
            };
            match sniff_image_ext(&data)
                .map(str::to_string)
                .or_else(|| if sniff_svg(&data) { Some("svg".to_string()) } else { None })
                .or_else(by_ext)
            {
                Some(ext) => (data, ext),
                None => {
                    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("(无扩展名)");
                    eprintln!(
                        "DOCX 导出跳过不支持的图片格式 .{}（Word 不支持，预览可显示）: {}",
                        ext,
                        path.display()
                    );
                    return String::new();
                }
            }
        };

        // WebP 在 Word / WPS 里**无法渲染**（内嵌后显示为空框），嵌入前转码为 PNG；
        // 转码失败时保留原图并告警，绝不静默丢图
        let (data, ext) = if ext == "webp" {
            match webp_to_png(&data) {
                Some(png) => (png, "png".to_string()),
                None => {
                    eprintln!("DOCX 导出：webp 转码为 png 失败，Word 中可能无法显示: {}", dest);
                    (data, ext)
                }
            }
        } else {
            (data, ext)
        };

        self.next_image_id += 1;
        let img_id = self.next_image_id;

        // ---- SVG：矢量部件 + PNG 回退位图，两份都写进包里，阅读器各取所需 ----
        // Word 2016+/365 认 `asvg:svgBlip` 拿矢量（放大不糊）；旧版 Word / WPS / LibreOffice
        // 走 `<a:blip r:embed>` 指向的回退位图（LO 没有回退图时会**显示空白**，tdf#126084）。
        // 两个部件都用标准的 image 关系类型：WPS 的 OOXML 层就是这么做的 —— 它的关系类型
        // 清单里没有 SVG 专用类型，靠部件的内容类型 `image/svg+xml` 区分（实测 kso.dll）。
        let cx: i64;
        let cy: i64;
        let blip: String;
        let asset_ext: String;
        let asset_data: Vec<u8>;
        let mut asset_svg: Option<Vec<u8>> = None;
        if ext == "svg" {
            match svg_to_png(&data) {
                Some((png, w, h)) => {
                    let rid_png = format!("rIdImg{}", img_id);
                    let rid_svg = format!("rIdSvg{}", img_id);
                    self.rels.push_str(&format!(
                        "<Relationship Id=\"{}\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/image\" Target=\"media/image{}.png\"/>",
                        rid_png, img_id
                    ));
                    self.rels.push_str(&format!(
                        "<Relationship Id=\"{}\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/image\" Target=\"media/image{}.svg\"/>",
                        rid_svg, img_id
                    ));
                    // 尺寸取 SVG 的**固有尺寸**（96dpi：240×120px 的 SVG → 180×90pt，与 Word 一致），
                    // 不是回退位图的像素尺寸（那张图是放大栅格化的）
                    let (w_emu, h_emu) = image_emu_natural(Some((w, h)), width_hint);
                    cx = w_emu;
                    cy = h_emu;
                    blip = format!(
                        "<a:blip r:embed=\"{}\"><a:extLst><a:ext uri=\"{{96DAC541-7B7A-43D3-8B79-37D633B846F1}}\"><asvg:svgBlip xmlns:asvg=\"http://schemas.microsoft.com/office/drawing/2016/SVG/main\" r:embed=\"{}\"/></a:ext></a:extLst></a:blip>",
                        rid_png, rid_svg
                    );
                    asset_ext = "png".to_string();
                    asset_data = png;
                    asset_svg = Some(data);
                }
                None => {
                    // 栅格化失败：只嵌矢量（Word 2016+/WPS 仍能显示；缺回退图时旧版/LO 可能空白）
                    eprintln!(
                        "DOCX 导出：SVG 栅格化失败，只能嵌入矢量（旧版 Word/WPS/LibreOffice 可能显示为空白）: {}",
                        dest
                    );
                    let rid = format!("rIdImg{}", img_id);
                    self.rels.push_str(&format!(
                        "<Relationship Id=\"{}\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/image\" Target=\"media/image{}.svg\"/>",
                        rid, img_id
                    ));
                    let (w_emu, h_emu) = image_emu_natural(None, width_hint);
                    cx = w_emu;
                    cy = h_emu;
                    blip = format!("<a:blip r:embed=\"{}\"/>", rid);
                    asset_ext = "svg".to_string();
                    asset_data = data;
                }
            }
        } else {
            let rid = format!("rIdImg{}", img_id);
            self.rels.push_str(&format!(
                "<Relationship Id=\"{}\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/image\" Target=\"media/image{}.{}\"/>",
                rid, img_id, ext
            ));
            let (w_emu, h_emu) = image_emu(&ext, &data, width_hint);
            cx = w_emu;
            cy = h_emu;
            blip = format!("<a:blip r:embed=\"{}\"/>", rid);
            asset_ext = ext;
            asset_data = data;
        }
        self.images.push(ImageAsset {
            id: img_id,
            ext: asset_ext,
            data: asset_data,
            svg: asset_svg,
        });
        format!(
            "<w:r><w:drawing><wp:inline distT=\"0\" distB=\"0\" distL=\"0\" distR=\"0\"><wp:extent cx=\"{}\" cy=\"{}\"/><wp:docPr id=\"{}\" name=\"image{}\" descr=\"{}\"/><a:graphic xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\"><a:graphicData uri=\"http://schemas.openxmlformats.org/drawingml/2006/picture\"><pic:pic xmlns:pic=\"http://schemas.openxmlformats.org/drawingml/2006/picture\"><pic:nvPicPr><pic:cNvPr id=\"{}\" name=\"image{}\"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill>{blip}<a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"{}\" cy=\"{}\"/></a:xfrm><a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>",
            cx, cy, img_id, img_id, esc(alt), img_id, img_id, cx, cy
        )
    }

    fn p_start(&mut self, style: &str, num: Option<(u32, u32)>) {
        self.p_start_ind(style, num, None);
    }

    /// `indent` = (left, hanging) twips
    fn p_start_ind(&mut self, style: &str, num: Option<(u32, u32)>, indent: Option<(u32, Option<u32>)>) {
        let mut ppr = String::new();
        if !style.is_empty() {
            ppr.push_str(&format!("<w:pStyle w:val=\"{}\"/>", style));
        }
        if let Some((num_id, ilvl)) = num {
            ppr.push_str(&format!("<w:numPr><w:ilvl w:val=\"{}\"/><w:numId w:val=\"{}\"/></w:numPr>", ilvl, num_id));
        }
        // 引用块的内缩进由**单元格表格**表达（见 `quote_block_xml`）：表格自身带左边框与底色，
        // 嵌套层级靠单元格外边距自然递进，段落不再叠加 `w:ind`，也就不会再画出多条断开的边框。
        if let Some((left, hanging)) = indent {
            match hanging {
                Some(h) => ppr.push_str(&format!("<w:ind w:left=\"{}\" w:hanging=\"{}\"/>", left, h)),
                None => ppr.push_str(&format!("<w:ind w:left=\"{}\"/>", left)),
            }
        }
        // 脚注中的段落写段落级字号（`w:pPr/w:rPr`，须排在 `w:ind` 之后）：
        // 列表项用的是 `ListParagraph`（基于 `Normal` = 正文字号），只靠 `FootnoteText` 样式
        // 继承不到这一段，脚注里的列表/多段脚注的第二段就会比脚注正文大一圈。
        if self.in_footnote {
            let sz = if style == "CodeBlock" { Metrics::sz_scale_from(self.metrics.footnote_sz(), 0.9) } else { self.metrics.footnote_sz() };
            ppr.push_str(&format!("<w:rPr><w:sz w:val=\"{0}\"/><w:szCs w:val=\"{0}\"/></w:rPr>", sz));
        }
        self.body.push_str(&format!("<w:p><w:pPr>{}</w:pPr>", ppr));
    }

    fn p_end(&mut self) {
        self.body.push_str("</w:p>");
    }

    /// 引用块 → 单元格表格（`quote_table` 的内层实现）。
    ///
    /// 预览里的 `blockquote` 是**一个**容器：左边框与底色是连续的，内部多段落、嵌套引用、
    /// 列表都在这一个容器里。逐段落写 `w:pBdr`/`w:shd` 时，每个段落各画一条边框，
    /// 段间距处露出缺口（WPS 不会把相邻段落的边框合并成一条），看起来「被打断成多个引用」。
    ///
    /// 改用单元格表格后：边框与底色由**表格**连续绘制；嵌套层级由单元格外边距自然递进
    /// （每层的内层表格都从父单元格内容区开始，等价于预览里嵌套 blockquote 的 `padding: 1em`），
    /// 因此不需要 `w:tblInd`，也不需要任何段落级边框/底纹。
    fn quote_block_xml(&self, inner: &str) -> String {
        let accent = esc(&self.theme.accent);
        let surface = esc(&self.theme.surface);
        let pad = self.metrics.em_twips(1.0); // 预览 `blockquote { padding: 0 1em }`
        let vpad = self.metrics.em_twips(0.5); // 预览 `blockquote { padding: 0.5em 1em }`
        // 空引用（`>` 单独一行）也要有合法单元格内容（`w:tc` 至少一个块级元素）
        let inner = if inner.trim().is_empty() {
            "<w:p><w:pPr><w:pStyle w:val=\"Quote\"/></w:pPr></w:p>".to_string()
        } else {
            inner.to_string()
        };
        let none = "w:val=\"none\" w:sz=\"0\" w:space=\"0\" w:color=\"auto\"";
        format!(
            "<w:tbl><w:tblPr><w:tblW w:w=\"5000\" w:type=\"pct\"/><w:tblBorders><w:top {none}/>\
             <w:left w:val=\"single\" w:sz=\"24\" w:space=\"0\" w:color=\"{accent}\"/><w:bottom {none}/>\
             <w:right {none}/><w:insideH {none}/><w:insideV {none}/></w:tblBorders>\
             <w:shd w:val=\"clear\" w:color=\"auto\" w:fill=\"{surface}\"/><w:tblLayout w:type=\"autofit\"/>\
             <w:tblCellMar><w:top w:w=\"{vpad}\" w:type=\"dxa\"/><w:left w:w=\"{pad}\" w:type=\"dxa\"/>\
             <w:bottom w:w=\"{vpad}\" w:type=\"dxa\"/><w:right w:w=\"{pad}\" w:type=\"dxa\"/></w:tblCellMar></w:tblPr>\
             <w:tblGrid><w:gridCol w:w=\"9026\"/></w:tblGrid>\
             <w:tr><w:tc><w:tcPr><w:tcW w:w=\"5000\" w:type=\"pct\"/>\
             <w:shd w:val=\"clear\" w:color=\"auto\" w:fill=\"{surface}\"/></w:tcPr>{inner}</w:tc></w:tr></w:tbl>",
            none = none,
            accent = accent,
            surface = surface,
            vpad = vpad,
            pad = pad,
            inner = inner,
        )
    }


    fn para_style(&self) -> &'static str {
        if self.quote_depth > 0 { "Quote" } else { "Normal" }
    }

    /// 任务列表勾选字形（内联 run）
    fn task_glyph(&self, checked: bool) -> String {
        let glyph = if checked { "☑ " } else { "☐ " };
        self.run_with(glyph, InlineState::default(), false, Some(&self.theme.accent), Some(TASK_GLYPH_FONT))
    }

    /// 列表项段落：首段带编号/项目符号；续段仅用 ListParagraph + 与文本对齐的缩进。
    /// `level` 决定是否消费配对闭合标签：调用方已消费 Start(Paragraph) 时传 1（吃掉 End(Paragraph)），
    /// 紧凑列表项的行内内容无包裹标签时传 0。消费 iter 到本段结束为止。
    fn item_paragraph(&mut self, num: Option<(u32, u32)>, depth: u32, checked: Option<bool>, first: bool, level: u32, iter: &mut EventIter) {
        // 缩进一律手写（left = 720×depth、hanging = 360）：编号层级 ilvl 不再等于缩进层级
        // （有序列表恒为 ilvl=0，见 `Event::Start(Tag::List)` 的说明），段落级 `w:ind` 直接生效；
        // 任务项与普通项也因此对齐同一列。
        let left = depth.max(1) * 720;
        if first {
            match checked {
                // 任务项：**不写 numPr**。预览里勾选框取代了项目符号，若同时写 numPr，Word 会
                // 既画项目符号又画勾选框（双重标记）。
                Some(c) => {
                    self.p_start_ind("ListParagraph", None, Some((left, Some(360))));
                    let glyph = self.task_glyph(c);
                    self.body.push_str(&glyph);
                }
                None => self.p_start_ind("ListParagraph", num, Some((left, Some(360)))),
            }
        } else {
            self.p_start_ind("ListParagraph", None, Some((left, None)));
        }
        let inner = self.render_inlines(iter, InlineState::default(), level);
        self.body.push_str(&inner);
        self.p_end();
    }

    /// 空列表项（如 "- "）：只保留编号/项目符号，避免整个项目消失
    fn empty_item_paragraph(&mut self, num: Option<(u32, u32)>, depth: u32, checked: Option<bool>) {
        let left = depth.max(1) * 720;
        if let Some(c) = checked {
            self.p_start_ind("ListParagraph", None, Some((left, Some(360))));
            let glyph = self.task_glyph(c);
            self.body.push_str(&glyph);
        } else {
            self.p_start_ind("ListParagraph", num, Some((left, Some(360))));
        }
        self.p_end();
    }

    /// 表格一行。表头行（thead）加主题底色、跨页重复，单元格文字加粗。
    fn render_table_row(&mut self, iter: &mut EventIter, aligns: &[Alignment], head: bool, surface: &str) {
        if head {
            self.body.push_str("<w:tr><w:trPr><w:tblHeader/></w:trPr>");
        } else {
            self.body.push_str("<w:tr>");
        }
        let mut col = 0usize;
        while let Some(ev) = iter.next() {
            match ev {
                Event::End(TagEnd::TableRow) | Event::End(TagEnd::TableHead) => break,
                Event::Start(Tag::TableCell) => {
                    // GFM 表格的列对齐（|:--|:-:|--:|）
                    let jc = match aligns.get(col).copied().unwrap_or(Alignment::None) {
                        Alignment::Center => "center",
                        Alignment::Right => "right",
                        _ => "left",
                    };
                    col += 1;
                    self.body.push_str("<w:tc><w:tcPr><w:tcW w:w=\"0\" w:type=\"auto\"/>");
                    if head {
                        self.body
                            .push_str(&format!("<w:shd w:val=\"clear\" w:color=\"auto\" w:fill=\"{}\"/>", surface));
                    }
                    self.body.push_str("<w:vAlign w:val=\"top\"/></w:tcPr>");
                    self.render_table_cell(iter, jc, head);
                    self.body.push_str("</w:tc>");
                }
                // 单元格闭合标签已由 render_table_cell 之后发出，此处仅为容错
                Event::End(TagEnd::TableCell) => {}
                _ => {}
            }
        }
        self.body.push_str("</w:tr>");
    }

    /// 单元格内容：段落间距与正文一致（预览单元格继承正文行高）+ 列对齐；表头文字加粗。
    fn render_table_cell(&mut self, iter: &mut EventIter, jc: &str, head: bool) {
        self.body.push_str(&format!(
            "<w:p><w:pPr><w:pStyle w:val=\"Normal\"/><w:spacing w:before=\"0\" w:after=\"0\" w:line=\"{}\" w:lineRule=\"auto\"/><w:jc w:val=\"{}\"/></w:pPr>",
            self.metrics.line,
            jc
        ));
        // GFM 单元格内容为行内事件直挂；容错处理可能出现的 Paragraph 包裹
        let level = if matches!(iter.peek(), Some(Event::Start(Tag::Paragraph))) {
            iter.next();
            1
        } else {
            0
        };
        let st = InlineState { bold: head, ..Default::default() };
        let inner = self.render_inlines(iter, st, level);
        self.body.push_str(&inner);
        self.body.push_str("</w:p>");
    }

    // ---------- 行内渲染（遇到块级边界或本块结束即返回） ----------

    /// 判断是否为行内格式起始标签（其余一律视为块级边界，交给块级渲染）
    fn is_inline_start(tag: &Tag) -> bool {
        // 注：当前选项关掉了 `^x^` / `~x~` 拓展语法（预览不识别，见 markdown_to_docx 的解析选项），
        // 所以 Superscript/Subscript 事件实际不会出现；保留兜底以防选项变化把整段拆碎。
        matches!(
            tag,
            Tag::Emphasis
                | Tag::Strong
                | Tag::Strikethrough
                | Tag::Superscript
                | Tag::Subscript
                | Tag::Link { .. }
                | Tag::Image { .. }
        )
    }

    fn render_inlines(&mut self, iter: &mut EventIter, st: InlineState, level: u32) -> String {
        let mut st = st;
        // 行内 HTML `<code>`/`<kbd>` 等宽标记（本地状态，随标签开合切换）
        let mut mono = false;
        let mut out = String::new();
        loop {
            // 先 peek：块级起始（如嵌套列表/代码块）不消费，留给块级渲染；
            // level>0（内联递归内）遇到 End 归本层消费；level=0（块级调用）遇到 End 不消费，归调用者
            match iter.peek() {
                None => break,
                Some(Event::End(_)) if level > 0 => {
                    iter.next();
                    break;
                }
                Some(Event::End(_)) => break,
                Some(Event::Start(tag)) if !Self::is_inline_start(tag) => break,
                _ => {}
            }
            let ev = iter.next().unwrap();
            match ev {
                Event::Text(t) => {
                    // 预览 `linkify: true` 会把裸 URL 变成链接，导出保持一致（已处在链接内则不重复包裹）
                    if mono || st.link {
                        out.push_str(&self.run(&t, st, mono, None));
                    } else {
                        out.push_str(&self.autolink_runs(&t, st, mono));
                    }
                }
                Event::Code(c) => out.push_str(&self.code_run(&c)),
                Event::FootnoteReference(label) => {
                    if !self.footnote_defined.contains(&*label) {
                        // 没有对应定义：按 Markdown 原文输出，不丢内容
                        out.push_str(&self.run(&format!("[^{}]", label), st, mono, None));
                    } else {
                        let id = self.footnote_id(&label);
                        out.push_str(&format!(
                            "<w:r><w:rPr><w:rStyle w:val=\"FootnoteReference\"/></w:rPr><w:footnoteReference w:id=\"{}\"/></w:r>",
                            id
                        ));
                    }
                }
                // 数学公式：转为 Word 原生可编辑公式（OMML）。
                // 转换失败才退回 TeX 源码（等宽），绝不静默丢内容
                Event::InlineMath(tex) => match omml_of(&tex) {
                    Some(omml) => out.push_str(&omml),
                    None => out.push_str(&self.run(&format!("${}$", tex), InlineState::default(), true, None)),
                },
                Event::DisplayMath(tex) => match omml_of(&tex) {
                    Some(omml) => out.push_str(&math_para_xml(&omml)),
                    None => out.push_str(&self.run(&format!("$${}$$", tex.trim()), InlineState::default(), true, None)),
                },
                Event::SoftBreak | Event::HardBreak => out.push_str(BR),
                Event::InlineHtml(h) => {
                    // 行内 HTML（`<sup>`/`<sub>`/`<u>`/`<mark>`/`<b>`/`<i>`/`<s>`/`<code>`/`<br>` …）
                    // 预览按 HTML 语义渲染，导出映射到对应的 OOXML 字符属性；未知标签维持原样忽略
                    let mut i = 0;
                    while let Some(rel) = h[i..].find('<') {
                        let s = i + rel;
                        let Some(rel_end) = h[s..].find('>') else { break };
                        let e = s + rel_end + 1;
                        if apply_html_inline_tag(&h[s..e], &mut st, &mut mono) == Some(true) {
                            out.push_str(BR);
                        }
                        i = e;
                    }
                    // 行内 HTML 中的图片 <img src="…">
                    for img in extract_imgs(&h) {
                        let run = self.image_run("", &img.src, img.width);
                        out.push_str(&run);
                    }
                }
                Event::Start(tag) => {
                    let mut s2 = st;
                    match tag {
                        Tag::Emphasis => s2.italic = true,
                        Tag::Strong => s2.bold = true,
                        Tag::Strikethrough => s2.strike = true,
                        // `^x^` / `~x~`：与 `<sup>`/`<sub>` 同为上下标
                        Tag::Superscript => s2.sup = true,
                        Tag::Subscript => s2.sub = true,
                        Tag::Link { dest_url, link_type, .. } => {
                            // `[[某页]]`（wikilink）不是 URL：写成外部超链接会生成无效目标，
                            // 因此按 Markdown 原文输出（保留双方括号，便于回贴原文）
                            if matches!(link_type, LinkType::WikiLink { .. }) {
                                out.push_str(&self.run("[[", st, mono, None));
                                out.push_str(&self.render_inlines(iter, st, level + 1));
                                out.push_str(&self.run("]]", st, mono, None));
                                continue;
                            }
                            s2.link = true;
                            let inner = self.render_inlines(iter, s2, level + 1);
                            out.push_str(&self.hyperlink_open(&dest_url.to_string()));
                            out.push_str(&inner);
                            out.push_str("</w:hyperlink>");
                            continue;
                        }
                        Tag::Image { dest_url, .. } => {
                            // alt 文本是 Image 的内联内容，收集后丢弃
                            let mut alt = String::new();
                            let mut depth = 0;
                            loop {
                                match iter.next() {
                                    Some(Event::Text(t)) if depth == 0 => alt.push_str(&t),
                                    Some(Event::Start(_)) => depth += 1,
                                    Some(Event::End(_)) if depth == 0 => break,
                                    Some(Event::End(_)) => depth -= 1,
                                    None => break,
                                    _ => {}
                                }
                            }
                            out.push_str(&self.image_run(&alt, &dest_url.to_string(), None));
                            continue;
                        }
                        _ => {}
                    }
                    out.push_str(&self.render_inlines(iter, s2, level + 1));
                }
                Event::End(_) => break,
                _ => {}
            }
        }
        out
    }

    /// 把一段纯文本按裸 URL 切分，URL 部分输出为外部超链接（其余仍为普通 run）
    fn autolink_runs(&mut self, text: &str, st: InlineState, mono: bool) -> String {
        let mut out = String::new();
        let mut rest = text;
        while let Some((s, e)) = find_bare_url(rest) {
            out.push_str(&self.run(&rest[..s], st, mono, None));
            let url = rest[s..e].to_string();
            let mut s2 = st;
            s2.link = true;
            out.push_str(&self.hyperlink_open(&url));
            out.push_str(&self.run(&url, s2, mono, None));
            out.push_str("</w:hyperlink>");
            rest = &rest[e..];
        }
        out.push_str(&self.run(rest, st, mono, None));
        out
    }

    // ---------- 块级渲染 ----------

    fn render_block_event(&mut self, iter: &mut EventIter, ev: Event) {
        match ev {
            Event::Start(Tag::Heading { level, .. }) => {
                let lv = match level {
                    HeadingLevel::H1 => 1,
                    HeadingLevel::H2 => 2,
                    HeadingLevel::H3 => 3,
                    HeadingLevel::H4 => 4,
                    HeadingLevel::H5 => 5,
                    HeadingLevel::H6 => 6,
                };
                let style = format!("Heading{}", lv);
                self.p_start(&style, None);
                let inner = self.render_inlines(iter, InlineState::default(), 1);
                self.body.push_str(&inner);
                self.p_end();
            }
            Event::Start(Tag::Paragraph) => {
                // `$$…$$` 总是被解析器包在 Paragraph 里 → 块级公式按居中段落输出
                // （若不在此拦截，DisplayMath 会落进行内渲染，公式左对齐且 `$$` 前后换行丢失）
                if matches!(iter.peek(), Some(Event::DisplayMath(_))) {
                    if let Some(Event::DisplayMath(tex)) = iter.next() {
                        self.display_math_paragraph(&tex);
                    }
                    while let Some(ev2) = iter.next() {
                        if matches!(ev2, Event::End(TagEnd::Paragraph)) {
                            break;
                        }
                    }
                } else {
                    self.p_start(self.para_style(), None);
                    let inner = self.render_inlines(iter, InlineState::default(), 1);
                    self.body.push_str(&inner);
                    self.p_end();
                }
            }
            // 引用块：内容先渲染到临时缓冲，最后整体裹进一个单元格表格（连续左边框 + 连续底色，
            // 嵌套层级由单元格外边距递进）—— 见 `quote_block_xml` 的说明
            Event::Start(Tag::BlockQuote(_)) => {
                let saved = std::mem::take(&mut self.body);
                self.quote_depth += 1;
                while let Some(ev2) = iter.next() {
                    match ev2 {
                        Event::End(TagEnd::BlockQuote(_)) => break, // 消费 End(BlockQuote)
                        Event::End(_) => {}                        // 容错：忽略多余闭合标签
                        Event::Start(_) => self.render_block_event(iter, ev2),
                        _ => {}
                    }
                }
                self.quote_depth -= 1;
                let inner = std::mem::replace(&mut self.body, saved);
                self.body.push_str(&self.quote_block_xml(&inner));
                // 表格不能是 body 的最后一个元素（Word 要求其后至少有一个段落）
                if iter.peek().is_none() {
                    self.body.push_str(
                        "<w:p><w:pPr><w:pStyle w:val=\"Normal\"/><w:spacing w:after=\"0\" w:line=\"240\" w:lineRule=\"auto\"/></w:pPr></w:p>",
                    );
                }
            }
            Event::Start(Tag::CodeBlock(kind)) => {
                // 语言标记（围栏块的 info 串第一个词）：前端按「(语言, 代码)」查高亮片段表
                let lang = match &kind {
                    CodeBlockKind::Fenced(info) => info.split_whitespace().next().unwrap_or(""),
                    CodeBlockKind::Indented => "",
                };
                let mut code = String::new();
                while let Some(ev2) = iter.next() {
                    match ev2 {
                        Event::Text(t) => code.push_str(&t),
                        Event::SoftBreak | Event::HardBreak => code.push('\n'),
                        Event::Code(c) => code.push_str(&c),
                        Event::End(_) => break, // 消费 End(CodeBlock)
                        _ => {}
                    }
                }
                // 一个代码块 = 一个段落，块内换行用 `<w:br/>`：预览里 `pre` 是**单一**区块，
                // 逐行拆段会在末尾多出一个空段落，选中/复制时也被当成多个段落
                self.p_start("CodeBlock", None);
                let content = self.code_block_content(lang, &code);
                self.body.push_str(&content);
                self.p_end();
            }
            // YAML/TOML 元信息块（`---` 包裹的 front matter）：解析器已判定为元信息，
            // 预览/HTML/PDF 都不显示，导出同样整块丢弃（此前会漏成正文第一段）
            Event::Start(Tag::MetadataBlock(_)) => {
                while let Some(ev2) = iter.next() {
                    if matches!(ev2, Event::End(TagEnd::MetadataBlock(_))) {
                        break;
                    }
                }
            }
            // 分隔线 `---`：空段落 + 下边框（颜色取主题 --editor-border，与预览 hr 一致）
            Event::Rule => {
                self.body.push_str(&format!(
                    "<w:p><w:pPr><w:pStyle w:val=\"Normal\"/><w:spacing w:before=\"120\" w:after=\"120\"/><w:pBdr><w:bottom w:val=\"single\" w:sz=\"6\" w:space=\"1\" w:color=\"{}\"/></w:pBdr></w:pPr></w:p>",
                    esc(&self.theme.border)
                ));
            }
            // 块级公式 `$$…$$`：Rust 侧没有 TeX 引擎，保留 TeX 源码（居中、等宽），不丢内容
            // （此前 DisplayMath 未被处理，会留下一个空段落）
            Event::DisplayMath(tex) => self.display_math_paragraph(&tex),
            Event::Start(Tag::FootnoteDefinition(label)) => {
                // 只有「有定义**且**有引用」的 label 才转成 Word 脚注；未被引用的定义按普通
                // 段落输出（否则内容会凭空消失）
                if !self.footnote_defined.contains(&*label) {
                    while let Some(ev2) = iter.next() {
                        match ev2 {
                            Event::End(TagEnd::FootnoteDefinition) => break,
                            Event::End(_) => {}
                            Event::Start(_) => self.render_block_event(iter, ev2),
                            _ => {}
                        }
                    }
                } else {
                    let id = self.footnote_id(&label);
                    // 定义内容改写到临时缓冲，随后写进 footnotes.xml（此前会外泄成正文段落）
                    let saved = std::mem::take(&mut self.body);
                    let rels_len = self.rels.len();
                    // 脚注上下文：脚注内的一切字号以脚注字号为基准（列表项/多段脚注的第二段
                    // 若不显式写小字号，会继承 `Normal` 的正文字号）
                    let was_in_footnote = self.in_footnote;
                    self.in_footnote = true;
                    while let Some(ev2) = iter.next() {
                        match ev2 {
                            Event::End(TagEnd::FootnoteDefinition) => break,
                            Event::End(_) => {}
                            Event::Start(_) => self.render_block_event(iter, ev2),
                            _ => {}
                        }
                    }
                    self.in_footnote = was_in_footnote;
                    let mut def_body = std::mem::replace(&mut self.body, saved);
                    // 定义内部的超链接/图片关系必须写进 footnotes.xml.rels（rel 归属该部件）
                    let moved: String = self.rels[rels_len..].to_string();
                    self.rels.truncate(rels_len);
                    self.footnote_rels.push_str(&moved);
                    // 首段沿用脚注样式（小字号、无段后距），脚注序号挂在首段行首
                    def_body = def_body.replacen("<w:pStyle w:val=\"Normal\"/>", "<w:pStyle w:val=\"FootnoteText\"/>", 1);
                    let mark = format!(
                        "<w:r><w:rPr><w:rStyle w:val=\"FootnoteReference\"/></w:rPr><w:footnoteRef/></w:r><w:r><w:t xml:space=\"preserve\"> </w:t></w:r>"
                    );
                    // 序号挂在**首段**行首：注入点必须位于第一个段落内（表格里也有 `</w:pPr>`，
                    // 所以还要保证注入点之前没出现 `<w:tbl`），否则退化为「序号单独一段 + 原内容」
                    let tbl_at = def_body.find("<w:tbl");
                    let with_mark = match def_body.find("</w:pPr>") {
                        Some(i) if tbl_at.map_or(true, |t| t > i) => {
                            format!("{}{}{}", &def_body[..i + 8], mark, &def_body[i + 8..])
                        }
                        _ => format!(
                            "<w:p><w:pPr><w:pStyle w:val=\"FootnoteText\"/></w:pPr>{}</w:p>{}",
                            mark, def_body
                        ),
                    };
                    self.footnotes.push((id, with_mark));
                }
            }
            Event::Start(Tag::List(start)) => {
                // 每个列表（顶层与嵌套）各占一个 `w:num` **且各占一个 `w:abstractNum`**：
                //   · 共享 `w:num` 时第二个有序列表会接着上一个继续编号
                //   · 共享 `w:abstractNum`（仅靠不同 num 实例区分）时，计数器仍在同一个 abstractNum 上，
                //     Word/WPS 只在层级切换（startOverride）时重置 —— 于是「第一章 → 第一节 → 第二节
                //     → 第二章」会让第二章变成 3（被二级列表推高）
                // 所以每个列表自带 abstractNum（`w:lvl/w:start` 写在自身），编号必然实例内独立。
                //   · 编号层级恒为 ilvl=0；层级差异只靠段落 `w:ind` 缩进（与预览一致：
                //     预览里每个 `<ol>` 都是独立的一级编号，共用 ilvl 会渲染成 Word 的 `1.1.`）
                //   · 项目符号字形另靠 `bullet_depth` 表达（对应 UA 样式的 disc/circle/square）
                let ordered = start.is_some();
                let id = self.next_list_id;
                self.next_list_id += 1;
                let depth = self.list_stack.len() as u32 + 1;
                // 项目符号层级 = 祖先里「项目符号列表」的个数（有序列表不参与，同 UA 样式规则）
                let bullet_depth =
                    self.list_stack.iter().filter(|i| !self.lists[**i].ordered).count() as u32;
                let idx = self.lists.len();
                self.lists.push(ListInstance {
                    num_id: id,
                    ordered,
                    start: start.unwrap_or(1),
                    bullet_depth,
                    depth,
                });
                self.list_stack.push(idx);
                while let Some(ev2) = iter.next() {
                    match ev2 {
                        Event::End(TagEnd::List(_)) => break, // 消费 End(List)
                        Event::End(_) => {}                   // 容错：忽略多余闭合标签
                        Event::Start(_) => self.render_block_event(iter, ev2),
                        _ => {}
                    }
                }
                self.list_stack.pop();
            }
            Event::Start(Tag::Item) => {
                // 缩进层级 = 总嵌套深度（与预览每层 `padding-left: 2em` 一致，不分列表类型）；
                // 编号层级恒为 ilvl=0（见上：每个列表独占 abstractNum，实例内独立计数）
                let depth = self.list_stack.len() as u32;
                let num = self.list_stack.last().map(|i| (self.lists[*i].num_id, 0u32));
                let mut checked: Option<bool> = None;
                let mut first = true;

                // 列表项子事件分类。紧凑列表（tight）把行内事件直接挂在 Item 下（无 Paragraph 包裹），
                // 因此“以 **加粗** 开头”的内容必须走 Inline 分支，不能被当作块级事件丢弃。
                enum Next {
                    EndItem,
                    StrayEnd,
                    Para,
                    Inline,
                    Block,
                    Other,
                }

                loop {
                    // 任务列表标记（若有）
                    if let Some(Event::TaskListMarker(c)) = iter.peek() {
                        checked = Some(*c);
                        iter.next();
                        continue;
                    }
                    let next = match iter.peek() {
                        None => break,
                        Some(Event::End(TagEnd::Item)) => Next::EndItem,
                        Some(Event::End(_)) => Next::StrayEnd,
                        Some(Event::Start(Tag::Paragraph)) => Next::Para,
                        Some(Event::Start(tag)) if Self::is_inline_start(tag) => Next::Inline,
                        Some(Event::Start(_)) => Next::Block,
                        Some(_) => Next::Other,
                    };
                    match next {
                        Next::EndItem => {
                            // 空列表项（如 "- "）也要保留编号/项目符号
                            if first {
                                self.empty_item_paragraph(num, depth, checked);
                            }
                            iter.next(); // 消费 End(Item)
                            break;
                        }
                        // 容错：忽略多余闭合标签（不应把 End(Paragraph) 误当 End(Item)）
                        Next::StrayEnd => {
                            iter.next();
                        }
                        Next::Para => {
                            iter.next(); // 消费 Start(Paragraph)
                            self.item_paragraph(num, depth, checked, first, 1, iter);
                            first = false;
                        }
                        // 行内起始标签（Strong/Emphasis/Link/Image/…）或紧凑项的行内内容：
                        // 不消费事件，交给 item_paragraph 统一渲染
                        Next::Inline | Next::Other => {
                            self.item_paragraph(num, depth, checked, first, 0, iter);
                            first = false;
                        }
                        // 其余块级（嵌套列表/代码块/表格/引用/标题）：原样交给块级渲染
                        Next::Block => {
                            let ev2 = iter.next().unwrap();
                            self.render_block_event(iter, ev2);
                        }
                    }
                }
            }
            Event::Start(Tag::Table(alignments)) => {
                let border = esc(&self.theme.border);
                let surface = esc(&self.theme.surface);
                // 对齐预览表格：整表 100% 宽、1px 全网格（--editor-border）、统一单元格内边距
                self.body.push_str(&format!(
                    "<w:tbl><w:tblPr><w:tblW w:w=\"5000\" w:type=\"pct\"/><w:tblLayout w:type=\"autofit\"/>\
                     <w:tblBorders><w:top w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"{b}\"/>\
                     <w:left w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"{b}\"/>\
                     <w:bottom w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"{b}\"/>\
                     <w:right w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"{b}\"/>\
                     <w:insideH w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"{b}\"/>\
                     <w:insideV w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"{b}\"/></w:tblBorders>\
                     <w:tblCellMar><w:top w:w=\"120\" w:type=\"dxa\"/><w:left w:w=\"200\" w:type=\"dxa\"/>\
                     <w:bottom w:w=\"120\" w:type=\"dxa\"/><w:right w:w=\"200\" w:type=\"dxa\"/></w:tblCellMar>\
                     </w:tblPr>",
                    b = border
                ));
                // 列网格：按列数均分正文可用宽度（A4 去 2×2.54cm 页边距 = 9026 twips）。
                // 没有 `w:tblGrid` 时 Word/WPS 需自行推断列宽，多列时容易宽窄不齐。
                let cols = alignments.len().max(1);
                let col_w = 9026 / cols as u32;
                self.body.push_str("<w:tblGrid>");
                for _ in 0..cols {
                    self.body.push_str(&format!("<w:gridCol w:w=\"{}\"/>", col_w));
                }
                self.body.push_str("</w:tblGrid>");
                while let Some(ev2) = iter.next() {
                    match ev2 {
                        Event::End(TagEnd::Table) => break, // 消费 End(Table)
                        Event::Start(Tag::TableHead) => self.render_table_row(iter, &alignments, true, &surface),
                        Event::Start(Tag::TableRow) => self.render_table_row(iter, &alignments, false, &surface),
                        _ => {}
                    }
                }
                self.body.push_str("</w:tbl>");
                // Word 要求表格后跟一个段落
                self.p_start("Normal", None);
                self.p_end();
            }
            Event::Text(t) => {
                self.p_start(self.para_style(), None);
                let run = self.run(&t, InlineState::default(), false, None);
                self.body.push_str(&run);
                self.p_end();
            }
            Event::Html(h) => {
                let imgs = extract_imgs(&h);
                self.p_start(self.para_style(), None);
                if imgs.is_empty() {
                    // 非图片的原始 HTML：保持原行为（按文本输出）
                    let run = self.run(&h, InlineState::default(), false, None);
                    self.body.push_str(&run);
                } else {
                    // HTML 标签书写的图片 <img src="…" width="…">
                    for img in imgs {
                        let run = self.image_run("", &img.src, img.width);
                        self.body.push_str(&run);
                    }
                    // 同一块里除图片外还有文字时保留文字，避免静默丢内容
                    let text = html_plain_text(&h);
                    if !text.trim().is_empty() {
                        let run = self.run(text.trim(), InlineState::default(), false, None);
                        self.body.push_str(&run);
                    }
                }
                self.p_end();
            }
            _ => {}
        }
    }
}

// ===================== OOXML 包生成 =====================

fn content_types(exts: &[String]) -> String {
    let mut s = String::from(
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/>",
    );
    // 同一扩展名只写一条 `Default`（多张同类型图片会重复，重复项虽可容忍但不规范）
    let mut seen: std::collections::HashSet<&str> = std::collections::HashSet::new();
    for ext in exts {
        let mime = match ext.as_str() {
            "png" => "image/png",
            "jpeg" => "image/jpeg",
            "gif" => "image/gif",
            "bmp" => "image/bmp",
            "webp" => "image/webp",
            // SVG 部件（与 PNG 回退图并存）必须在这里声明，否则 Word / WPS 认为部件类型未知
            "svg" => "image/svg+xml",
            _ => continue,
        };
        if !seen.insert(ext.as_str()) {
            continue;
        }
        s.push_str(&format!("<Default Extension=\"{}\" ContentType=\"{}\"/>", ext, mime));
    }
    s.push_str("<Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/><Override PartName=\"/word/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml\"/><Override PartName=\"/word/numbering.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml\"/><Override PartName=\"/word/fontTable.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml\"/><Override PartName=\"/word/footnotes.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml\"/></Types>");
    s
}

fn root_rels() -> String {
    "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/></Relationships>"
        .to_string()
}

fn styles_xml(theme: &DocxTheme, m: &Metrics) -> String {
    let accent = esc(&theme.accent);
    let text = esc(&theme.text);
    let font = esc(&theme.font);
    let mono = esc(&theme.mono_font);
    let surface = esc(&theme.surface);

    let sz = m.body_sz;
    let line = m.line;
    // 预览里的 em 间距换算（1em = 正文字号）
    let after_1em = m.em_twips(1.0); // `p { margin-bottom: 1em }`
    let h_before = m.em_twips(1.5); // `h1..h6 { margin-top: 1.5em }`
    let h_after = m.em_twips(0.5); // `h1..h6 { margin-bottom: 0.5em }`
    let h_line = m.line_of(1.3); // `h1..h6 { line-height: 1.3 }`
    let li_after = m.em_twips(0.3); // `li { margin: 0.3em 0 }`
    let pad = m.em_twips(1.0); // 引用/代码块左右内边距 1em
    let code_sz = m.sz_scale(0.9); // `code { font-size: 0.9em }`
    let fn_sz = m.footnote_sz(); // 脚注文字（与脚注内各段/各 run 共用同一基准，见 Metrics::FOOTNOTE_RATIO）

    let mut s = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><w:styles xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">".to_string();
    // 文档默认值：把字体/字号/行距写进 docDefaults（而不是只靠样式继承），
    // Word 的「正文」样式、新建段落、脚注等都直接取这里的值
    s.push_str(&format!(
        "<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii=\"{font}\" w:hAnsi=\"{font}\" w:eastAsia=\"{font}\" w:cs=\"{font}\"/><w:sz w:val=\"{sz}\"/><w:szCs w:val=\"{sz}\"/><w:color w:val=\"{text}\"/><w:lang w:val=\"en-US\" w:eastAsia=\"zh-CN\"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after=\"{after_1em}\" w:line=\"{line}\" w:lineRule=\"auto\"/></w:pPr></w:pPrDefault></w:docDefaults>"
    ));
    // Normal
    s.push_str(&format!(
        "<w:style w:type=\"paragraph\" w:default=\"1\" w:styleId=\"Normal\"><w:name w:val=\"Normal\"/><w:qFormat/><w:pPr><w:spacing w:after=\"{after_1em}\" w:line=\"{line}\" w:lineRule=\"auto\"/></w:pPr><w:rPr><w:rFonts w:ascii=\"{font}\" w:hAnsi=\"{font}\" w:eastAsia=\"{font}\" w:cs=\"{font}\"/><w:sz w:val=\"{sz}\"/><w:szCs w:val=\"{sz}\"/><w:color w:val=\"{text}\"/></w:rPr></w:style>"
    ));
    // 标题 1-6：字号取预览的 em 比例（`h1 2em / h2 1.5em / h3 1.25em`，h4-h6 与正文同号 —— 
    // 预览的 h4-h6 没有独立字号，仅加粗）；此前是一组与预览无关的固定磅值，
    // 且 H6（10pt）比正文（11pt）还小
    const HEADING_EM: [f64; 6] = [2.0, 1.5, 1.25, 1.0, 1.0, 1.0];
    for (i, em) in HEADING_EM.iter().enumerate() {
        let lv = i + 1;
        let hsz = m.sz_scale(*em);
        s.push_str(&format!(
            "<w:style w:type=\"paragraph\" w:styleId=\"Heading{lv}\"><w:name w:val=\"heading {lv}\"/><w:basedOn w:val=\"Normal\"/><w:next w:val=\"Normal\"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before=\"{h_before}\" w:after=\"{h_after}\" w:line=\"{h_line}\" w:lineRule=\"auto\"/><w:outlineLvl w:val=\"{i}\"/></w:pPr><w:rPr><w:b/><w:rFonts w:ascii=\"{font}\" w:hAnsi=\"{font}\" w:eastAsia=\"{font}\" w:cs=\"{font}\"/><w:sz w:val=\"{hsz}\"/><w:szCs w:val=\"{hsz}\"/><w:color w:val=\"{accent}\"/></w:rPr></w:style>"
        ));
    }
    // 列表段落（预览 `li { margin: 0.3em 0 }`）
    s.push_str(&format!(
        "<w:style w:type=\"paragraph\" w:styleId=\"ListParagraph\"><w:name w:val=\"List Paragraph\"/><w:basedOn w:val=\"Normal\"/><w:qFormat/><w:pPr><w:spacing w:after=\"{li_after}\" w:line=\"{line}\" w:lineRule=\"auto\"/></w:pPr></w:style>"
    ));
    // 代码块：等宽 + 主题 --editor-surface 底色 + 1em 内边距（预览 `pre code { padding: 1em }`）
    // 行距跟随**预览行高**设置（与正文一致；预览里 `pre code` 没有自己的 line-height，
    // 继承的是编辑器内容的行高）
    s.push_str(&format!(
        "<w:style w:type=\"paragraph\" w:styleId=\"CodeBlock\"><w:name w:val=\"Code Block\"/><w:basedOn w:val=\"Normal\"/><w:pPr><w:shd w:val=\"clear\" w:color=\"auto\" w:fill=\"{surface}\"/><w:spacing w:before=\"0\" w:after=\"{after_1em}\" w:line=\"{line}\" w:lineRule=\"auto\"/><w:ind w:left=\"{pad}\" w:right=\"{pad}\"/></w:pPr><w:rPr><w:rFonts w:ascii=\"{mono}\" w:hAnsi=\"{mono}\" w:eastAsia=\"{mono}\" w:cs=\"{mono}\"/><w:sz w:val=\"{code_sz}\"/><w:szCs w:val=\"{code_sz}\"/></w:rPr></w:style>"
    ));
    // 引用：**只保留文字色**。左边框与底色由引用块的单元格表格绘制（见 `quote_block_xml`）——
    // 段落级 `pBdr`/`shd` 在相邻段落间不会合并成连续容器，会被看成「断开的多个引用」。
    s.push_str(&format!(
        "<w:style w:type=\"paragraph\" w:styleId=\"Quote\"><w:name w:val=\"Quote\"/><w:basedOn w:val=\"Normal\"/><w:qFormat/><w:pPr><w:spacing w:before=\"{li_after}\" w:after=\"{li_after}\" w:line=\"{line}\" w:lineRule=\"auto\"/></w:pPr><w:rPr><w:color w:val=\"666666\"/></w:rPr></w:style>"
    ));
    // 脚注：正文引用标记（上标）与脚注文字段落
    s.push_str(
        "<w:style w:type=\"character\" w:styleId=\"FootnoteReference\"><w:name w:val=\"footnote reference\"/><w:rPr><w:vertAlign w:val=\"superscript\"/></w:rPr></w:style>",
    );
    s.push_str(&format!(
        "<w:style w:type=\"paragraph\" w:styleId=\"FootnoteText\"><w:name w:val=\"footnote text\"/><w:basedOn w:val=\"Normal\"/><w:pPr><w:spacing w:after=\"0\" w:line=\"240\" w:lineRule=\"auto\"/></w:pPr><w:rPr><w:sz w:val=\"{fn_sz}\"/><w:szCs w:val=\"{fn_sz}\"/></w:rPr></w:style>"
    ));
    s.push_str("</w:styles>");
    s
}

/// 脚注部件（`word/footnotes.xml`）。
///
/// Word 要求 `w:id="-1"`（separator）与 `w:id="0"`（continuationSeparator）两个分隔符脚注，
/// 正文脚注从 1 开始编号。
fn footnotes_xml(footnotes: &[(u32, String)]) -> String {
    let mut s = String::from(
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><w:footnotes xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\">",
    );
    for (id, ty) in [(-1i32, "separator"), (0, "continuationSeparator")] {
        s.push_str(&format!(
            "<w:footnote w:type=\"{}\" w:id=\"{}\"><w:p><w:pPr><w:spacing w:after=\"0\" w:line=\"240\" w:lineRule=\"auto\"/></w:pPr><w:r><w:{}/></w:r></w:p></w:footnote>",
            ty, id, ty
        ));
    }
    for (id, body) in footnotes {
        s.push_str(&format!("<w:footnote w:id=\"{}\">{}</w:footnote>", id, body));
    }
    s.push_str("</w:footnotes>");
    s
}

fn numbering_xml(lists: &[ListInstance]) -> String {
    let mut s = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><w:numbering xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">");
    // 每个列表（顶层与嵌套）**各占一个 `w:abstractNum`**：
    //   · `w:num` 只是 abstractNum 的实例，计数器挂在 abstractNum 上，只靠 `startOverride`
    //     （层级切换）重置 —— 共享 abstractNum 时「第一章 → 第一节 → 第二节 → 第二章」
    //     会把第二章渲染成 3（被二级列表推高，WPS 实测）
    //   · 每个列表自带 abstractNum 后，编号必然实例内独立；起始值同时写在 `w:lvl/w:start`
    //     与 `w:lvlOverride/w:startOverride`（双保险，兼容对 restart 语义实现不同的阅读器）
    //   · 编号层级恒为 ilvl=0：层级差异只靠段落 `w:ind` 缩进（预览里每个 `<ol>` 都是从 1
    //     开始的一级编号，靠 ilvl 会变成 Word 的 `1.1.` 多级编号）
    for (i, li) in lists.iter().enumerate() {
        let left = li.depth.max(1) * 720;
        let (num_fmt, lvl_text, start, rpr) = if li.ordered {
            ("decimal", "%1.".to_string(), li.start, String::new())
        } else {
            let (glyph, font) = BULLET_LEVELS[(li.bullet_depth as usize) % BULLET_LEVELS.len()];
            // 只对「正文字体缺字形」的码位显式指定字体（见 `BULLET_LEVELS` 的说明）；
            // 一级 `•` 各字体都有字形，交给正文字体以保持字形风格一致
            let rpr = match font {
                Some(f) => format!("<w:rPr><w:rFonts w:ascii=\"{f}\" w:hAnsi=\"{f}\" w:cs=\"{f}\"/></w:rPr>", f = esc(f)),
                None => String::new(),
            };
            ("bullet", glyph.to_string(), 1, rpr)
        };
        s.push_str(&format!(
            "<w:abstractNum w:abstractNumId=\"{}\"><w:multiLevelType w:val=\"singleLevel\"/><w:lvl w:ilvl=\"0\"><w:start w:val=\"{}\"/><w:numFmt w:val=\"{}\"/><w:lvlText w:val=\"{}\"/><w:lvlJc w:val=\"left\"/><w:pPr><w:ind w:left=\"{}\" w:hanging=\"360\"/></w:pPr>{}</w:lvl></w:abstractNum>",
            i, start, num_fmt, lvl_text, left, rpr
        ));
    }
    // 实例与 abstractNum 一一对应
    for (i, li) in lists.iter().enumerate() {
        s.push_str(&format!("<w:num w:numId=\"{}\"><w:abstractNumId w:val=\"{}\"/>", li.num_id, i));
        if li.ordered {
            s.push_str(&format!(
                "<w:lvlOverride w:ilvl=\"0\"><w:startOverride w:val=\"{}\"/></w:lvlOverride>",
                li.start
            ));
        }
        s.push_str("</w:num>");
    }
    s.push_str("</w:numbering>");
    s
}

/// 预扫描脚注：返回（有定义的 label，被引用的 label）。
///
/// 只有「既有定义、又有引用」的 label 才转成 Word 脚注：未被引用的定义若直接丢弃，
/// 内容会凭空消失（预览里它也只是不显示，但导出要保证不丢内容）；没有定义的引用则按原文输出。
fn scan_footnotes(md: &str) -> (std::collections::HashSet<String>, std::collections::HashSet<String>) {
    let mut defined = std::collections::HashSet::new();
    let mut referenced = std::collections::HashSet::new();
    for line in md.lines() {
        let trimmed = line.trim_start();
        let indent = line.len() - trimmed.len();
        // 定义：行首（≤3 空格缩进）`[^label]:`
        let mut def_at_start: Option<usize> = None;
        if indent <= 3 {
            if let Some(rest) = trimmed.strip_prefix("[^") {
                if let Some(end) = rest.find(']') {
                    if rest[end + 1..].starts_with(':') {
                        let label = &rest[..end];
                        if !label.is_empty() {
                            defined.insert(label.to_string());
                            // trimmed 是 line 的后缀，定义起点即缩进字节数
                            def_at_start = Some(indent);
                        }
                    }
                }
            }
        }
        // 引用：行内所有 `[^label]`，排除恰好是行首定义的那一个
        let mut i = 0;
        while let Some(rel) = line[i..].find("[^") {
            let s = i + rel;
            let Some(rel_end) = line[s..].find(']') else { break };
            let e = s + rel_end;
            let label = &line[s + 2..e];
            if !label.is_empty() && def_at_start != Some(s) {
                referenced.insert(label.to_string());
            }
            i = e + 1;
        }
    }
    (defined, referenced)
}

/// 生成 docx 字节流。`remote_images` 为「图片 URL → data URL」映射（由调用方在导出前下载填充），
/// 生成器按 pulldown-cmark 解析出的 `dest_url` 精确查表，行内式与引用式图片统一覆盖；
/// 无网络图时传 `RemoteImages::new()`。
pub fn markdown_to_docx(md: &str, theme: DocxTheme, base_dir: Option<std::path::PathBuf>, remote_images: RemoteImages) -> Result<Vec<u8>, String> {
    let theme = DocxTheme {
        accent: css_color_to_hex(&theme.accent, "0066CC"),
        text: css_color_to_hex(&theme.text, "333333"),
        font: first_family(&theme.font),
        mono_font: first_family(&theme.mono_font),
        border: css_color_to_hex(&theme.border, "BFBFBF"),
        surface: css_color_to_hex(&theme.surface, "F5F5F5"),
        font_size_px: theme.font_size_px,
        line_height: theme.line_height,
        code_highlights: theme.code_highlights,
    };

    let mut builder = DocxBuilder::new(theme, base_dir, remote_images);
    // 脚注：只有「有定义且有引用」的 label 才转 Word 脚注
    let (defined, referenced) = scan_footnotes(md);
    builder.footnote_defined = defined.intersection(&referenced).cloned().collect();

    // 解析选项：与预览保持一致 ——
    //   · 关闭「智能标点」（预览 typographer:false，否则 `"引号"`→“ ”、`a--b`→a–b、`...`→… 会不一致）
    //   · 关闭 `^x^` / `~x~` 扩展语法（预览没有对应插件，显示为字面文本；导出若转换会出现
    //     「预览是 `^2^`、Word 里却变成上标」的不一致。应用自身的上标/下标走 `<sup>`/`<sub>` HTML）
    //   · 脚注改用 GFM 语义（预览用 markdown-it-footnote）
    let mut opts = Options::all();
    opts.remove(Options::ENABLE_SMART_PUNCTUATION);
    opts.remove(Options::ENABLE_SUPERSCRIPT);
    opts.remove(Options::ENABLE_SUBSCRIPT);
    // 注意：ENABLE_OLD_FOOTNOTES 的位包含 ENABLE_FOOTNOTES，移除后必须补回 GFM 脚注位
    opts.remove(Options::ENABLE_OLD_FOOTNOTES);
    opts.insert(Options::ENABLE_FOOTNOTES);
    let mut iter = Parser::new_ext(md, opts).peekable();
    while let Some(ev) = iter.next() {
        builder.render_block_event(&mut iter, ev);
    }

    let body_xml = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" xmlns:m=\"http://schemas.openxmlformats.org/officeDocument/2006/math\" xmlns:wp=\"http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing\"><w:body>{}<w:sectPr><w:pgSz w:w=\"11906\" w:h=\"16838\"/><w:pgMar w:top=\"1440\" w:right=\"1440\" w:bottom=\"1440\" w:left=\"1440\" w:header=\"708\" w:footer=\"708\" w:gutter=\"0\"/></w:sectPr></w:body></w:document>",
        builder.body
    );

    let doc_rels = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rIdStyles\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/><Relationship Id=\"rIdNumbering\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering\" Target=\"numbering.xml\"/><Relationship Id=\"rIdFontTable\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable\" Target=\"fontTable.xml\"/><Relationship Id=\"rIdFootnotes\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes\" Target=\"footnotes.xml\"/>{}</Relationships>",
        builder.rels
    );

    let mut buf: Vec<u8> = Vec::new();
    {
        let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut buf));
        let opts = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        let mut add = |name: &str, content: &[u8]| -> Result<(), String> {
            zip.start_file(name, opts)
                .map_err(|e| format!("zip start_file {}: {}", name, e))?;
            zip.write_all(content).map_err(|e| format!("zip write {}: {}", name, e))?;
            Ok(())
        };
        // SVG 图片会同时带来 `.svg`（矢量）与 `.png`（回退位图）两种部件，两种都要声明
        let exts: Vec<String> = builder
            .images
            .iter()
            .flat_map(|i| {
                if i.svg.is_some() {
                    vec![i.ext.clone(), "svg".to_string()]
                } else {
                    vec![i.ext.clone()]
                }
            })
            .collect();
        add("[Content_Types].xml", content_types(&exts).as_bytes())?;
        add("_rels/.rels", root_rels().as_bytes())?;
        add("word/document.xml", body_xml.as_bytes())?;
        add("word/_rels/document.xml.rels", doc_rels.as_bytes())?;
        add("word/styles.xml", styles_xml(&builder.theme, &builder.metrics).as_bytes())?;
        add("word/numbering.xml", numbering_xml(&builder.lists).as_bytes())?;
        add("word/fontTable.xml", font_table_xml(&builder.theme).as_bytes())?;
        add("word/footnotes.xml", footnotes_xml(&builder.footnotes).as_bytes())?;
        // 脚注内部的超链接/图片关系归属 footnotes.xml（部件内 rel 只在本部件可见）
        if !builder.footnote_rels.is_empty() {
            let rels = format!(
                "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">{}</Relationships>",
                builder.footnote_rels
            );
            add("word/_rels/footnotes.xml.rels", rels.as_bytes())?;
        }
        for img in &builder.images {
            add(&format!("word/media/image{}.{}", img.id, img.ext), &img.data)?;
            // SVG：矢量部件与 PNG 回退位图一起写（`imageN.svg` + `imageN.png`）
            if let Some(svg) = &img.svg {
                add(&format!("word/media/image{}.svg", img.id), svg)?;
            }
        }
        zip.finish().map_err(|e| format!("zip finish: {}", e))?;
    }
    Ok(buf)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    #[test]
    fn generate_basic_docx() {
        let md = "# 标题\n\n正文 **加粗** *斜体* ~~删除~~ `代码` [链接](https://example.com)。\n\n- 项目一\n- 项目二\n\n1. 有序一\n2. 有序二\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```rust\nfn main() {}\n```\n\n> 引用内容\n\n- [x] 完成任务\n";
        let theme = test_theme();
        let bytes = markdown_to_docx(md, theme, None, RemoteImages::new()).expect("generate docx");
        assert!(!bytes.is_empty());

        // 验证 zip 包结构
        let reader = std::io::Cursor::new(&bytes);
        let mut zip = zip::ZipArchive::new(reader).expect("valid zip");
        let names: Vec<String> = (0..zip.len())
            .map(|i| zip.by_index(i).unwrap().name().to_string())
            .collect();
        for required in ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/_rels/document.xml.rels", "word/styles.xml", "word/numbering.xml"] {
            assert!(names.contains(&required.to_string()), "missing {}", required);
        }

        // 检查 document.xml 内容
        let mut doc = String::new();
        zip.by_name("word/document.xml").unwrap().read_to_string(&mut doc).unwrap();
        assert!(doc.contains("Heading1"), "heading style missing");
        assert!(doc.contains("w:hyperlink"), "link missing");
        assert!(doc.contains("<w:tbl>"), "table missing");
        assert!(doc.contains("CodeBlock"), "code block missing");
        assert!(doc.contains("☑"), "task checkbox missing");
        assert!(doc.contains("Quote"), "blockquote missing");

        // 检查 styles.xml 的主题色
        let mut styles = String::new();
        zip.by_name("word/styles.xml").unwrap().read_to_string(&mut styles).unwrap();
        assert!(styles.contains("w:val=\"0066CC\""), "theme accent missing in styles");
    }

    #[test]
    fn theme_deserializes_camel_case() {
        // 前端传 camelCase（monoFont），serde 需正确映射到 mono_font
        let t: DocxTheme = serde_json::from_str(
            r##"{"accent":"#0066CC","text":"#333333","font":"MiSans","monoFont":"Consolas"}"##,
        )
        .unwrap();
        assert_eq!(t.accent, "#0066CC");
        assert_eq!(t.mono_font, "Consolas");
    }

    #[test]
    fn embeds_local_image_with_windows_path() {
        // 临时 1x1 PNG（真实文件，供 image_run 读取）
        let dir = std::env::temp_dir().join("yizimd-docx-test");
        std::fs::create_dir_all(&dir).unwrap();
        let png_path = dir.join("yizishare.png");
        // 1x1 透明 PNG
        let png = [
            0x89u8, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48,
            0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00,
            0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41, 0x54, 0x78,
            0x9C, 0x62, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
            0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
        ];
        std::fs::write(&png_path, &png).unwrap();
        let abs = png_path.to_string_lossy().to_string();

        // 用户真实输入形态：反斜杠绝对路径
        let md = format!("![图]({})", abs.replace('\\', "\\\\"));
        let theme = test_theme();
        let bytes = markdown_to_docx(&md, theme, None, RemoteImages::new()).expect("generate docx");
        let reader = std::io::Cursor::new(&bytes);
        let mut zip = zip::ZipArchive::new(reader).expect("valid zip");
        let names: Vec<String> = (0..zip.len())
            .map(|i| zip.by_index(i).unwrap().name().to_string())
            .collect();
        assert!(
            names.iter().any(|n| n.contains("word/media/image")),
            "no image embedded, parts: {:?}",
            names
        );
        // document.xml 里应引用图片 rId
        let mut doc = String::new();
        zip.by_name("word/document.xml").unwrap().read_to_string(&mut doc).unwrap();
        assert!(doc.contains("rIdImg"), "image reference missing in document.xml");
        // 1x1 PNG → EMU 应为 9525×9525（按比例，未被拉伸成默认 4572000）
        assert!(doc.contains("cx=\"9525\""), "aspect ratio lost: {}", doc);
    }

    #[test]
    fn dump_list_and_bold_xml() {
        let md = "**加粗文字** 与 *斜体* 与 `代码`\n\n- 无序项一\n- 无序项二\n\n1. 有序一\n2. 有序二\n\n- 外层\n  - 内层嵌套\n";
        let theme = test_theme();
        let bytes = markdown_to_docx(md, theme, None, RemoteImages::new()).expect("generate docx");
        let reader = std::io::Cursor::new(&bytes);
        let mut zip = zip::ZipArchive::new(reader).expect("valid zip");
        let mut doc = String::new();
        zip.by_name("word/document.xml").unwrap().read_to_string(&mut doc).unwrap();
        let mut numbering = String::new();
        zip.by_name("word/numbering.xml").unwrap().read_to_string(&mut numbering).unwrap();
        println!("===== document.xml =====");
        println!("{}", doc);
        println!("===== numbering.xml =====");
        println!("{}", numbering);
        assert!(doc.contains("<w:b/>"), "bold tag missing");
        assert!(doc.contains("<w:i/>"), "italic tag missing");
        // 嵌套列表：内层应为独立段落 + 独立编号实例（ilvl 恒为 0，层级靠 w:ind 表达）
        let outer = doc.matches("<w:numPr>").count();
        assert!(outer >= 3, "unordered list items missing: {}", outer);
        assert!(
            doc.contains("<w:ind w:left=\"1440\" w:hanging=\"360\"/>"),
            "嵌套列表缩进丢失: {}", doc
        );
        assert!(
            doc.contains("<w:ilvl w:val=\"0\"/>") && !doc.contains("<w:ilvl w:val=\"1\"/>"),
            "编号层级应恒为 0（层级靠缩进）: {}", doc
        );
        assert!(!doc.contains("外层</w:t></w:r><w:r><w:t xml:space=\"preserve\">内层嵌套"), "nested list collapsed into one paragraph");
        // numbering：每个列表一个单层 abstractNum（本样本共 4 个列表）
        assert_eq!(numbering.matches("<w:abstractNum w:abstractNumId=").count(), 4, "抽象编号数量不对: {}", numbering);
        assert_eq!(numbering.matches("<w:lvl w:ilvl=\"0\">").count(), 4, "numbering 层级数不对: {}", numbering);
        assert!(numbering.contains("w:lvlText w:val=\"%1.\""), "有序列表格式缺失: {}", numbering);
        assert!(!numbering.contains("%1.%2."), "有序列表不应使用 1.1. 多级编号（预览里每级都从 1 开始）: {}", numbering);
    }

    #[test]
    fn parses_image_dimensions_from_headers() {
        // 1x1 透明 PNG（IHDR 宽高在偏移 16/20）
        let png = [
            0x89u8, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48,
            0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00,
            0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41, 0x54, 0x78,
            0x9C, 0x62, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
            0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
        ];
        assert_eq!(image_dimensions("png", &png), Some((1, 1)));
        assert_eq!(image_emu("png", &png, None), (9525, 9525));
        // 未知格式返回 None → 默认尺寸
        assert_eq!(image_dimensions("webp", &png), None);

        // 1x1 WebP（VP8L 无损，w-1/h-1 打包在 14bit 字段）
        let webp: Vec<u8> = [
            0x52, 0x49, 0x46, 0x46, 0x12, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50,
            0x38, 0x4C, 0x05, 0x00, 0x00, 0x00, 0x2F, 0x00, 0x00, 0x00, 0x00, 0x00,
        ]
        .to_vec();
        assert_eq!(image_dimensions("webp", &webp), Some((1, 1)));
        assert_eq!(image_emu("webp", &webp, None), (9525, 9525));
    }

    /// 生成 docx 并取出 word/document.xml
    fn xml_of(md: &str) -> String {
        let theme = test_theme();
        let bytes = markdown_to_docx(md, theme, None, RemoteImages::new()).expect("generate docx");
        let reader = std::io::Cursor::new(&bytes);
        let mut zip = zip::ZipArchive::new(reader).expect("valid zip");
        let mut doc = String::new();
        zip.by_name("word/document.xml").unwrap().read_to_string(&mut doc).unwrap();
        doc
    }

    /// XML 是否结构良好：标签必须正确配对（quick-xml 默认校验结束标签名），
    /// 且文本里不能出现未转义的 `&`/`<`。拼错标签名会让 Word 直接报「文件已损坏」。
    fn xml_is_well_formed(xml: &str) -> bool {
        use quick_xml::events::Event;
        if !xml_tags_have_no_stray_lt(xml) {
            return false;
        }
        let mut reader = quick_xml::Reader::from_str(xml);
        let mut depth: usize = 0;
        loop {
            match reader.read_event() {
                Ok(Event::Eof) => return depth == 0,
                Ok(Event::Start(ref e)) => {
                    // 属性语法必须逐个解析：只统计标签深度会漏掉 `<w:top <w:val="none"/>`
                    // 这类破损写法（quick-xml 只在取属性时报错）
                    if let Err(err) = e.attributes().collect::<Result<Vec<_>, _>>() {
                        eprintln!("XML 属性解析失败: {}", err);
                        return false;
                    }
                    depth += 1;
                }
                Ok(Event::Empty(ref e)) => {
                    if let Err(err) = e.attributes().collect::<Result<Vec<_>, _>>() {
                        eprintln!("XML 属性解析失败: {}", err);
                        return false;
                    }
                }
                Ok(Event::End(_)) => {
                    if depth == 0 {
                        eprintln!("XML 结束标签多于开始标签");
                        return false;
                    }
                    depth -= 1;
                }
                Ok(_) => {}
                Err(e) => {
                    eprintln!("XML 解析失败: {}", e);
                    return false;
                }
            }
        }
    }

    /// 标签内不得再出现 `<`（`<w:top <w:val="none"/>` 这类破损写法 quick-xml 默认不报错，
    /// 但 Word/WPS 会判定文档损坏）。生成器只写转义后的文本，所以这是安全的强校验。
    fn xml_tags_have_no_stray_lt(xml: &str) -> bool {
        let mut i = 0usize;
        while let Some(rel) = xml[i..].find('<') {
            let s = i + rel;
            let Some(close) = xml[s..].find('>') else {
                eprintln!("XML 标签未闭合: {}", &xml[s..xml.len().min(s + 40)]);
                return false;
            };
            let body = &xml[s + 1..s + close];
            if body.contains('<') {
                eprintln!("XML 标签内出现多余 `<`: {}", body);
                return false;
            }
            i = s + close + 1;
        }
        true
    }

    fn unescape_xml(s: &str) -> String {
        s.replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", "\"")
            .replace("&apos;", "'")
            .replace("&amp;", "&")
    }

    /// 按顺序拼接 document.xml 中所有 `<w:t>` 文本（反转义），用于内容完整性校验
    fn doc_text(doc: &str) -> String {
        let mut out = String::new();
        let mut rest = doc;
        while let Some(i) = rest.find("<w:t") {
            let after = &rest[i..];
            let start = match after.find('>') {
                Some(j) => j + 1,
                None => break,
            };
            let content = &after[start..];
            let end = match content.find("</w:t>") {
                Some(j) => j,
                None => break,
            };
            out.push_str(&unescape_xml(&content[..end]));
            rest = &content[end + 6..];
        }
        out
    }

    #[test]
    fn tight_list_item_starting_with_bold_keeps_content() {
        // 回归：紧凑列表项以 **加粗** 开头时，加粗小标题与后续文本都必须保留，且同属一个列表段落
        let doc = xml_of("- **加粗小标题** 正常文本\n");
        assert!(doc.contains("加粗小标题"), "加粗小标题丢失: {}", doc);
        assert!(doc.contains("正常文本"), "后续文本丢失: {}", doc);
        assert!(doc.contains("<w:b/>"), "加粗 run 丢失: {}", doc);
        assert!(doc.contains("<w:numPr>"), "无序列表编号缺失: {}", doc);
        assert_eq!(doc.matches("ListParagraph").count(), 1, "应为单个列表段落: {}", doc);
    }

    #[test]
    fn ordered_list_item_starting_with_bold_keeps_content() {
        let doc = xml_of("1. **小标题**：说明文字\n");
        assert!(doc.contains("小标题"), "加粗小标题丢失: {}", doc);
        assert!(doc.contains("：说明文字"), "后续文本丢失: {}", doc);
        assert!(doc.contains("<w:numPr>"), "有序列表编号缺失: {}", doc);
    }

    #[test]
    fn loose_list_continuation_paragraph_stays_in_list() {
        // 松散列表：列表项的第 2 段应仍是 ListParagraph（带对齐缩进），不能退回 Normal
        let doc = xml_of("- **小标题**\n\n  正常文本\n\n- 第二项\n");
        assert!(doc.contains("小标题") && doc.contains("正常文本"), "内容丢失: {}", doc);
        assert!(doc.contains("<w:ind w:left=\"720\"/>"), "续段缩进缺失: {}", doc);
        assert!(doc.matches("ListParagraph").count() >= 3, "续段未使用 ListParagraph: {}", doc);
    }

    #[test]
    fn list_item_bold_not_at_start_still_works() {
        // 加粗不在开头的情况本应正常，作为防回归
        let doc = xml_of("- 前缀 **加粗** 后缀\n");
        assert!(doc.contains("前缀") && doc.contains("加粗") && doc.contains("后缀"), "内容丢失: {}", doc);
        assert!(doc.contains("<w:b/>"), "加粗 run 丢失: {}", doc);
    }

    #[test]
    fn task_list_item_starting_with_bold_keeps_glyph_and_content() {
        let doc = xml_of("- [x] **完成事项** 说明\n- [ ] **待办** 说明\n");
        assert!(doc.contains("☑") && doc.contains("☐"), "任务字形丢失: {}", doc);
        assert!(doc.contains("完成事项") && doc.contains("待办"), "任务项加粗标题丢失: {}", doc);
        assert!(doc.contains("说明"), "任务项正文丢失: {}", doc);
    }

    #[test]
    fn nested_list_under_bold_item_keeps_levels() {
        let doc = xml_of("- **外层** 说明\n  - 内层项\n");
        assert!(doc.contains("外层") && doc.contains("说明") && doc.contains("内层项"), "内容丢失: {}", doc);
        // 嵌套层级 = 段落缩进 1440（编号层级恒为 ilvl=0，各列表自有实例）
        assert!(doc.contains("<w:ind w:left=\"1440\" w:hanging=\"360\"/>"), "嵌套层级丢失: {}", doc);
        assert!(!doc.contains("<w:ilvl w:val=\"1\"/>"), "编号层级应为 0: {}", doc);
    }

    #[test]
    fn readme_list_bold_leadins_are_preserved() {
        // 端到端：以仓库根 README.md 为样本，所有「- **标题**：…」列表项的加粗开头都必须出现在导出中
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../README.md");
        let md = match std::fs::read_to_string(&path) {
            Ok(s) => s,
            Err(_) => return, // 无 README 时跳过
        };
        let items: Vec<(String, String)> = md
            .lines()
            .filter_map(|l| {
                let t = l.trim_start();
                let rest = t
                    .strip_prefix("- ")
                    .or_else(|| t.strip_prefix("* "))
                    .or_else(|| t.strip_prefix("+ "))?;
                let rest = rest.strip_prefix("**")?;
                let end = rest.find("**")?;
                let label = rest[..end].to_string();
                let body = rest[end + 2..]
                    .trim_start_matches(['：', ':', ' ', '\t'])
                    .to_string();
                Some((label, body))
            })
            .collect();
        assert!(items.len() >= 20, "README 中未找到足够的加粗开头列表项: {}", items.len());

        let text = doc_text(&xml_of(&md));
        let mut missing: Vec<String> = Vec::new();
        for (label, body) in &items {
            // 加粗小标题必须完整保留
            if !text.contains(label.as_str()) {
                missing.push(format!("加粗标题「{}」", label));
            }
            // 紧随其后的纯文本前缀也必须保留（跳过含行内代码/强调的部分）
            let head: String = body
                .chars()
                .take_while(|c| !matches!(c, '`' | '*' | '[' | '_'))
                .collect();
            let head = head.trim();
            if head.chars().count() >= 4 && !text.contains(head) {
                missing.push(format!("正文「{}」", head));
            }
        }
        assert!(
            missing.is_empty(),
            "导出丢失 {} 段列表文本，例如: {:?}",
            missing.len(),
            &missing[..missing.len().min(5)]
        );
    }

    #[test]
    fn table_matches_preview_style() {
        // 列对齐 左/右，表头行 + 一行数据
        let doc = xml_of("| 名称 | 数量 |\n|:-----|-----:|\n| 甲 | 1 |\n");
        // 整表 100% 宽
        assert!(doc.contains("w:tblW w:w=\"5000\" w:type=\"pct\""), "表格宽度未设为整页: {}", doc);
        // 网格线使用主题 --editor-border（D5E2FF），而非硬编码灰
        assert!(doc.contains("w:color=\"D5E2FF\""), "边框未使用主题色: {}", doc);
        assert!(!doc.contains("BFBFBF"), "仍存在硬编码边框色: {}", doc);
        // 表头：底色 = 主题 --editor-surface、跨页重复、文字加粗
        assert!(doc.contains("<w:tblHeader/>"), "表头未设置跨页重复: {}", doc);
        assert!(doc.contains("w:fill=\"F0F7FF\""), "表头底色缺失: {}", doc);
        assert!(doc.contains("<w:b/>"), "表头文字未加粗: {}", doc);
        // 单元格：间距与正文一致（覆盖 Normal 的段后距/行距）+ 顶对齐 + 列对齐
        assert!(doc.contains("<w:spacing w:before=\"0\" w:after=\"0\" w:line=\"360\" w:lineRule=\"auto\"/>"), "单元格间距不正确: {}", doc);
        assert!(doc.contains("<w:vAlign w:val=\"top\"/>"), "单元格未顶对齐: {}", doc);
        assert!(doc.contains("<w:jc w:val=\"right\"/>"), "右对齐列未生效: {}", doc);
        assert_eq!(doc.matches("<w:tc>").count(), 4, "单元格数不对: {}", doc);
        assert_eq!(doc.matches("<w:tr>").count(), 2, "行数不对: {}", doc);
        // 列网格：2 列均分正文宽度（缺 `w:tblGrid` 时 Word 自行推断列宽，容易宽窄不齐）
        assert_eq!(doc.matches("<w:gridCol w:w=\"4513\"/>").count(), 2, "列网格缺失: {}", doc);
    }

    #[test]
    fn css_colors_normalize_for_ooxml() {
        // OOXML 只接受 6 位 hex，主题可能给 #rgb / rgb() / rgba()
        assert_eq!(css_color_to_hex("#d5e2ff", "F"), "D5E2FF");
        assert_eq!(css_color_to_hex("#abc", "F"), "AABBCC");
        assert_eq!(css_color_to_hex("rgb(0, 102, 204)", "F"), "0066CC");
        assert_eq!(css_color_to_hex("rgb(0 102 204 / 1)", "F"), "0066CC");
        // alpha 按白底合成（liquidglass 主题用 rgba 定义边框/表头底色）
        assert_eq!(css_color_to_hex("rgba(140, 165, 210, 0.35)", "F"), "D7E0EF");
        assert_eq!(css_color_to_hex("rgba(255,255,255,0.72)", "F"), "FFFFFF");
        // 无法识别 → 回退
        assert_eq!(css_color_to_hex("", "BFBFBF"), "BFBFBF");
        assert_eq!(css_color_to_hex("inherit", "BFBFBF"), "BFBFBF");
    }

    #[test]
    fn extracts_img_srcs_from_html() {
        assert_eq!(extract_img_srcs(r#"<img src="https://x/a.png" alt="a">"#), vec!["https://x/a.png"]);
        assert_eq!(extract_img_srcs("<IMG SRC='https://x/b.jpg'>"), vec!["https://x/b.jpg"]);
        assert_eq!(extract_img_srcs("<img src=https://x/c.webp>"), vec!["https://x/c.webp"]);
        // 不误取 data-src；实体反转义
        assert_eq!(extract_img_srcs(r#"<img data-src="no.png" src="yes.png"/>"#), vec!["yes.png"]);
        assert_eq!(extract_img_srcs(r#"<img src="a.png?w=1&amp;h=2">"#), vec!["a.png?w=1&h=2"]);
        // 多个图片 / 无图片
        assert_eq!(extract_img_srcs(r#"<img src="1.png"><br><img src="2.png">"#), vec!["1.png", "2.png"]);
        assert!(extract_img_srcs("<p>无图</p>").is_empty());
    }

    #[test]
    fn parses_img_width_hints() {
        assert_eq!(parse_size_hint("600"), Some(SizeHint::Px(600.0)));
        assert_eq!(parse_size_hint(" 600px "), Some(SizeHint::Px(600.0)));
        assert_eq!(parse_size_hint("300PT"), Some(SizeHint::Pt(300.0)));
        assert_eq!(parse_size_hint("50%"), Some(SizeHint::Percent(50.0)));
        // 不支持的单位 / 非正数 → 忽略，退回原图尺寸
        assert_eq!(parse_size_hint("10em"), None);
        assert_eq!(parse_size_hint("auto"), None);
        assert_eq!(parse_size_hint("0"), None);
        assert_eq!(parse_size_hint("-5"), None);
    }

    #[test]
    fn img_width_hint_sizes_and_keeps_aspect_ratio() {
        // 伪造 4×2 的 PNG 头（image_dimensions 只读 IHDR，无需可显示的完整文件）
        let mut png = vec![0x89u8, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        png.extend_from_slice(&[0x00, 0x00, 0x00, 0x0D]);
        png.extend_from_slice(b"IHDR");
        png.extend_from_slice(&4u32.to_be_bytes());
        png.extend_from_slice(&2u32.to_be_bytes());
        assert_eq!(image_dimensions("png", &png), Some((4, 2)));

        // 无 width：按原图像素（4px 宽 → 38100 EMU，高按 4:2）
        assert_eq!(image_emu("png", &png, None), (38_100, 19_050));
        // width="400" → 宽 400px，高按 4:2 同步（宽高比保留）
        assert_eq!(image_emu("png", &png, Some(SizeHint::Px(400.0))), (3_810_000, 1_905_000));
        // width="50%" → 6in 的一半
        assert_eq!(image_emu("png", &png, Some(SizeHint::Percent(50.0))), (2_743_200, 1_371_600));
        // 超宽仍受 6in 上限约束
        assert_eq!(image_emu("png", &png, Some(SizeHint::Px(2000.0))), (5_486_400, 2_743_200));
    }

    #[test]
    fn html_img_width_attribute_reaches_docx() {
        let dir = std::env::temp_dir().join("yizimd-docx-test");
        std::fs::create_dir_all(&dir).unwrap();
        let png_path = dir.join("yizishare-width.png");
        let png = [
            0x89u8, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48,
            0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00,
            0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41, 0x54, 0x78,
            0x9C, 0x62, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
            0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
        ];
        std::fs::write(&png_path, &png).unwrap();
        let abs = png_path.to_string_lossy().to_string();

        // width="300" → 300px = 300×9525 EMU（此前该属性被完全忽略）
        let doc = xml_of(&format!("<img src=\"{}\" width=\"300\">\n", abs));
        assert!(doc.contains("cx=\"2857500\""), "width 属性未生效: {}", doc);
        assert!(doc.contains("cy=\"2857500\""), "1:1 图高度未同步: {}", doc);

        // 无 width → 保持原图尺寸（1px）
        let doc2 = xml_of(&format!("<img src=\"{}\">\n", abs));
        assert!(doc2.contains("cx=\"9525\""), "无 width 时应保持原图尺寸: {}", doc2);

        // Markdown 语法图无尺寸属性，同样按原图
        let doc3 = xml_of(&format!("![a]({})\n", abs));
        assert!(doc3.contains("cx=\"9525\""), "Markdown 图不应受 width 影响: {}", doc3);
    }

    #[test]
    fn html_img_tag_embeds_image() {
        let dir = std::env::temp_dir().join("yizimd-docx-test");
        std::fs::create_dir_all(&dir).unwrap();
        let png_path = dir.join("yizishare-html.png");
        // 1x1 透明 PNG
        let png = [
            0x89u8, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48,
            0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00,
            0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41, 0x54, 0x78,
            0x9C, 0x62, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
            0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
        ];
        std::fs::write(&png_path, &png).unwrap();
        let abs = png_path.to_string_lossy().to_string();

        // 块级 HTML 图片（单独一行）+ 行内 HTML 图片（嵌在段落中）
        let md = format!(
            "<img src=\"{}\" alt=\"块级\">\n\n前文 <img src=\"{}\"> 后文\n",
            abs, abs
        );
        let doc = xml_of(&md);
        assert_eq!(doc.matches("<w:drawing>").count(), 2, "应嵌入 2 张 HTML 图片: {}", doc);
        assert_eq!(doc.matches("rIdImg").count(), 2, "图片引用数不对: {}", doc);
        // 1x1 PNG 应保持 1:1 比例（未被拉伸成默认尺寸）
        assert!(doc.contains("cx=\"9525\""), "比例丢失: {}", doc);

        // 图片与文字混排的 HTML 块：文字不能被丢掉
        let mixed = format!("<div><img src=\"{}\"><p>说明文字</p></div>\n", abs);
        let doc2 = xml_of(&mixed);
        assert_eq!(doc2.matches("<w:drawing>").count(), 1, "混排块图片未嵌入: {}", doc2);
        assert!(doc2.contains("说明文字"), "混排块文字丢失: {}", doc2);
    }

    /// 测试用主题（默认即 MiSans + Consolas，字号/行高取应用的 CSS 缺省 16px / 1.8）
    fn test_theme() -> DocxTheme {
        DocxTheme {
            accent: "0066CC".into(),
            text: "333333".into(),
            font: "MiSans".into(),
            mono_font: "Consolas".into(),
            border: "D5E2FF".into(),
            surface: "F0F7FF".into(),
            font_size_px: Some(16.0),
            line_height: Some(1.8),
            code_highlights: CodeHighlights::default(),
        }
    }

    /// 用指定主题生成 docx 并取出某个部件的内容
    fn docx_part(md: &str, theme: DocxTheme, part: &str) -> String {
        let bytes = markdown_to_docx(md, theme, None, RemoteImages::new()).expect("generate docx");
        let mut zip = zip::ZipArchive::new(std::io::Cursor::new(&bytes)).expect("valid zip");
        let mut s = String::new();
        zip.by_name(part).unwrap().read_to_string(&mut s).unwrap();
        s
    }

    /// 从 `styles.xml` 里取出某个 `w:styleId` 的整段 XML（用于定位单条样式的属性）
    fn style_block<'a>(styles: &'a str, id: &str) -> &'a str {
        let start = styles
            .find(&format!("w:styleId=\"{}\"", id))
            .unwrap_or_else(|| panic!("styles.xml 缺少样式 {}: {}", id, styles));
        let end = start + styles[start..].find("</w:style>").expect("样式未闭合");
        &styles[start..end]
    }

    /// 用指定主题生成 docx 并列出包内所有部件名
    fn docx_parts(md: &str, theme: DocxTheme) -> Vec<String> {
        let bytes = markdown_to_docx(md, theme, None, RemoteImages::new()).expect("generate docx");
        let mut zip = zip::ZipArchive::new(std::io::Cursor::new(&bytes)).expect("valid zip");
        (0..zip.len()).map(|i| zip.by_index(i).unwrap().name().to_string()).collect()
    }

    #[test]
    fn xml_well_formedness_checker_rejects_broken_attributes() {
        // 校验器自身的能力回归：它必须能挡住「标签名后直接跟 `<`」这类只有取属性时才暴露的错误
        assert!(xml_is_well_formed("<a b=\"1\"><c/></a>"));
        assert!(!xml_is_well_formed("<a><top <w:val=\"none\"/></a>"));
        assert!(!xml_is_well_formed("<a></b>"));
    }

    #[test]
    fn first_family_takes_first_family_and_maps_css_keywords() {
        // 默认预览字体栈 → MiSans
        assert_eq!(
            first_family("'MiSans', 'Mi Sans', system-ui, -apple-system, 'PingFang SC', 'Segoe UI', 'Microsoft YaHei', 'Noto Sans SC', sans-serif"),
            "MiSans"
        );
        assert_eq!(first_family("MiSans, sans-serif"), "MiSans");
        // 回归：旧实现取「第一个带引号的族」而非「第一个族」
        assert_eq!(first_family("system-ui, 'MiSans'"), "Microsoft YaHei");
        assert_eq!(first_family("Inter, 'Microsoft YaHei', sans-serif"), "Inter");
        // 双引号 / 引号内空格 / 前后空白
        assert_eq!(first_family("\"Mi Sans\", x"), "Mi Sans");
        assert_eq!(first_family("  Inter  , x"), "Inter");
        // CSS 关键字与通用族必须映射为具体字体名（绝不能原样透传）
        assert_eq!(first_family("sans-serif"), "Microsoft YaHei");
        assert_eq!(first_family("-apple-system, sans-serif"), "Microsoft YaHei");
        assert_eq!(first_family("serif"), "SimSun");
        assert_eq!(first_family("monospace"), "Consolas");
        // 兜底：空串 / 只有逗号
        assert_eq!(first_family(""), "Microsoft YaHei");
        assert_eq!(first_family(", ,"), "Microsoft YaHei");
    }

    #[test]
    fn font_table_declares_alt_names_for_substitution() {
        let ft = font_table_xml(&test_theme());
        assert!(ft.contains("<w:font w:name=\"MiSans\">"), "{}", ft);
        assert!(
            ft.contains("<w:altName w:val=\"Microsoft YaHei, PingFang SC, Noto Sans SC, Segoe UI, Arial\"/>"),
            "正文替代名链缺失: {}", ft
        );
        // MiSans 属中日韩字体 → charset 86
        assert!(ft.contains("<w:charset w:val=\"86\"/>"), "{}", ft);
        // 等宽字体（Consolas 非中日韩 → charset 00）
        assert!(ft.contains("<w:font w:name=\"Consolas\">"), "{}", ft);
        assert!(
            ft.contains("<w:altName w:val=\"Cascadia Mono, Consolas, Courier New, DejaVu Sans Mono\"/>"),
            "等宽替代名链缺失: {}", ft
        );
        assert!(ft.contains("<w:charset w:val=\"00\"/>"), "{}", ft);
        // 回归：项目符号不再使用 Symbol 字体 → 不得再挂 `Symbol` 字体条目/替代名链
        // （`Segoe UI Symbol` 是任务列表勾选字形的字体，属另一回事，见下）
        assert!(!ft.contains("<w:font w:name=\"Symbol\">"), "已弃用的 Symbol 字体条目残留: {}", ft);
        assert!(!ft.contains("Wingdings"), "已弃用的 Wingdings 替代名残留: {}", ft);
        // 任务列表勾选字形（☐/☑）在正文字体里没有字形，必须显式声明符号字体 + 替代名链
        assert!(
            ft.contains("<w:font w:name=\"Segoe UI Symbol\">"),
            "任务列表字形字体缺失: {}", ft
        );
        assert!(
            ft.contains("<w:altName w:val=\"MS Gothic, Apple Symbols, Arial Unicode MS, Noto Sans Symbols 2, DejaVu Sans\"/>"),
            "任务列表字形替代名链缺失: {}", ft
        );

        // 子元素顺序须遵循 ECMA-376 CT_Font：altName → charset → family → pitch
        let rest = &ft[ft.find("<w:font w:name=\"MiSans\">").unwrap()..];
        let body = &rest[..rest.find("</w:font>").unwrap()];
        let pos = |n: &str| body.find(n).unwrap_or_else(|| panic!("{} 缺失于 {}", n, body));
        assert!(
            pos("<w:altName") < pos("<w:charset") && pos("<w:charset") < pos("<w:family") && pos("<w:family") < pos("<w:pitch"),
            "CT_Font 子元素顺序错误: {}", body
        );
    }

    #[test]
    fn font_table_skips_duplicate_when_mono_equals_body() {
        let theme = DocxTheme { mono_font: "MiSans".into(), ..test_theme() };
        let ft = font_table_xml(&theme);
        assert_eq!(
            ft.matches("<w:font w:name=\"MiSans\">").count(),
            1,
            "fontTable 以 name 为键，同名不可重复: {}", ft
        );
    }

    #[test]
    fn docx_includes_font_table_part_and_rel() {
        let names = docx_parts("正文\n", test_theme());
        assert!(names.iter().any(|n| n == "word/fontTable.xml"), "缺少 fontTable 部件: {:?}", names);

        let ct = docx_part("正文\n", test_theme(), "[Content_Types].xml");
        assert!(ct.contains("PartName=\"/word/fontTable.xml\""), "{}", ct);
        assert!(ct.contains("wordprocessingml.fontTable+xml"), "{}", ct);

        let rels = docx_part("正文\n", test_theme(), "word/_rels/document.xml.rels");
        assert!(rels.contains("relationships/fontTable"), "{}", rels);
        assert!(rels.contains("Target=\"fontTable.xml\""), "{}", rels);
    }

    /// 回归：项目符号字形的大小必须**与层级无关**（视觉一致），且字形必须真的有字可用。
    ///
    /// 背景：`Symbol`（`symbol.ttf`）的 cmap 只有两段——`(1,0)` 覆盖 `0x00-0xFE`（传统 Symbol 编码）、
    /// `(3,0)` 覆盖 `0xF020-0xF0FE`（Microsoft 私有区），任何 Unicode 几何符号码位在其中**均无字形**；
    /// 强行指定 `w:rFonts=Symbol` 只会得到方框（Word 自身写的是 PUA `U+F0B7`）。
    ///
    /// 而「只写码位、交给正文字体」也有坑：MiSans 里 `• U+2022` 的墨迹只有 0.29em，
    /// `○ U+25CB` / `■ U+25A0` 却是 0.72em（WPF GlyphTypeface 实测墨迹包围盒）——
    /// 层级越低符号越大，正是用户看到的问题。因此二/三级改用与小圆点同尺寸的
    /// `◦ U+25E6` / `▪ U+25AA`，并只在**正文字体没有该字形**时才显式指定字体。
    #[test]
    fn bullet_glyphs_stay_same_size_and_have_real_glyphs() {
        let numbering = docx_part("- 一级\n  - 二级\n    - 三级\n", test_theme(), "word/numbering.xml");

        // 三个层级各一个 bullet 列表（每列表一个 abstractNum）
        assert_eq!(
            numbering.matches("<w:numFmt w:val=\"bullet\"/>").count(),
            3,
            "bullet 层级数量不符: {}", numbering
        );
        // 字形码位：• U+2022（一级，正文字体自带）→ ◦ U+25E6 / ▪ U+25AA（二/三级，小尺寸码位）
        for ch in ['\u{2022}', '\u{25E6}', '\u{25AA}'] {
            let level = format!("<w:lvlText w:val=\"{}\"/>", ch);
            assert!(numbering.contains(&level), "项目符号 U+{:04X} 缺失: {}", ch as u32, numbering);
        }
        // 回归：绝不再用会「越深越大」的大尺寸码位
        for ch in ['\u{25CB}', '\u{25A0}'] {
            assert!(
                !numbering.contains(&format!("<w:lvlText w:val=\"{}\"/>", ch)),
                "大尺寸符号 U+{:04X} 会使层级越深越大: {}", ch as u32, numbering
            );
        }

        // 回归：不得再出现 Symbol（字体名或 run 属性），否则该码位无字形
        assert!(!numbering.contains("Symbol"), "项目符号仍强制 Symbol: {}", numbering);
        // 一级 `•` 各字体都有字形 → 不写 rPr，继承正文字体的字形风格
        let first = &numbering[..numbering.find("</w:abstractNum>").unwrap()];
        assert!(
            !first.contains("<w:rPr>"),
            "一级项目符号不应换字体: {}", first
        );
        // 二级/三级必须显式指定含字形字体（MiSans / 宋体没有 ◦ / ▪）
        assert_eq!(
            numbering.matches("<w:rPr><w:rFonts w:ascii=\"Microsoft YaHei\"").count(),
            2,
            "二/三级项目符号未指定含字形字体: {}", numbering
        );
        // fontTable 里必须为该字体挂替代名链（macOS / 无雅黑的 Windows 上才有字可用）
        let ft = font_table_xml(&test_theme());
        assert!(ft.contains("<w:font w:name=\"Microsoft YaHei\">"), "字形字体缺 fontTable 条目: {}", ft);
        assert!(
            ft.contains("<w:altName w:val=\"Segoe UI Symbol, PingFang SC, Apple Symbols, Arial Unicode MS, DejaVu Sans\"/>"),
            "字形字体缺替代名链: {}", ft
        );
    }

    /// 回归：每个列表（含嵌套）独占 `w:num` **与** `w:abstractNum`。
    ///
    /// 只独立 `w:num` 不够：计数器挂在 abstractNum 上，WPS 只在 `startOverride` 层级切换时重置，
    /// 共享 abstractNum 会让「第一章 → 第一节 → 第二节 → 第二章」中的第二章渲染成 3。
    #[test]
    fn every_list_gets_its_own_abstract_num() {
        let md = "1. 第一章\n   1. 第一节\n   2. 第二节\n2. 第二章\n\n分隔段落\n\n1. 独立列表\n";
        let numbering = docx_part(md, test_theme(), "word/numbering.xml");
        let docs = xml_of(md);

        // 三个列表 → 三个 abstractNum；实例与 abstractNum 一一对应
        assert_eq!(
            numbering.matches("<w:abstractNum w:abstractNumId=").count(),
            3,
            "abstractNum 数量应为列表数: {}", numbering
        );
        assert!(numbering.contains("<w:num w:numId=\"100\"><w:abstractNumId w:val=\"0\"/>"), "{}", numbering);
        assert!(numbering.contains("<w:num w:numId=\"101\"><w:abstractNumId w:val=\"1\"/>"), "{}", numbering);
        assert!(numbering.contains("<w:num w:numId=\"102\"><w:abstractNumId w:val=\"2\"/>"), "{}", numbering);

        // 【3】的复现路径：第一章/第二章属于**同一个**列表实例（同一 abstractNum），
        // 二级的「第一节/第二节」是**另一个**实例 —— 后者不再推高前者的计数器（此前也是共享
        // abstractNum，WPS 才会把第二章渲染成 3）
        let ids: Vec<u32> = num_ids(&docs);
        assert_eq!(ids, vec![100, 101, 101, 100, 102], "列表实例分配不符（第一章/第二章应同一实例）: {:?}", ids);
        // 一级编号格式恒为 %1.（不得出现 1.1. 多级编号）
        assert!(!numbering.contains("%1.%2."), "出现了多级编号: {}", numbering);
    }

    #[test]
    fn css_keywords_never_reach_ooxml_and_eastasia_is_filled() {
        // 栈首是 CSS 关键字、等宽也是关键字 → 必须落成具体字体名
        let theme = DocxTheme {
            font: "system-ui, 'MiSans', sans-serif".into(),
            mono_font: "monospace".into(),
            ..test_theme()
        };
        let styles = docx_part("正文\n", theme, "word/styles.xml");
        assert!(styles.contains("w:ascii=\"Microsoft YaHei\""), "关键字未映射: {}", styles);
        assert!(
            !styles.contains("system-ui") && !styles.contains("sans-serif"),
            "CSS 关键字被写进 docx: {}", styles
        );
        assert!(
            styles.contains("<w:rFonts w:ascii=\"Consolas\" w:hAnsi=\"Consolas\" w:eastAsia=\"Consolas\" w:cs=\"Consolas\"/>"),
            "CodeBlock 缺 eastAsia: {}", styles
        );

        // 行内代码 run 也要带 eastAsia
        let doc = docx_part("`code`\n", test_theme(), "word/document.xml");
        assert!(doc.contains("w:eastAsia=\"Consolas\""), "行内代码缺 eastAsia: {}", doc);
    }

    /// 手动运行：产出一份「字体故意不存在」的 docx，用于在装有 MiSans 的机器上也能验证降级。
    ///
    /// 因为本机装了 MiSans 时 altName 根本不会被读取（主名称直接命中），所以要验证降级必须用一个
    /// **保证不存在的字体名** 去触发 Word 的替换路径；此文件里的中文若呈现为微软雅黑（而非随机
    /// 替换），即证明 altName 生效。
    ///
    /// `cargo test write_font_fallback_probe -- --ignored --nocapture`
    #[test]
    #[ignore = "手动运行，产出 target/font-fallback-probe.docx 供在 Word 中验证字体降级"]
    fn write_font_fallback_probe() {
        let theme = DocxTheme {
            font: "NoSuchFont-Probe-DoNotInstall".into(),
            mono_font: "NoSuchMono-Probe-DoNotInstall".into(),
            ..test_theme()
        };
        let md = "# 字体降级验证\n\n中文正文与 Latin text 混排。\n\n- **加粗小标题**：正常文本\n- 第二项\n\n> 引用中文内容\n\n| 列 | 值 |\n|---|---|\n| 甲 | 1 |\n\n`inline code 中文`\n\n```rust\nfn main() { println!(\"中文\"); }\n```\n";
        let bytes = markdown_to_docx(md, theme, None, RemoteImages::new()).expect("generate docx");
        let out = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("target/font-fallback-probe.docx");
        std::fs::write(&out, &bytes).expect("write docx");
        println!("已导出: {}", out.display());
        println!("预期：Word 打开后中文为微软雅黑（altName 生效），而不是随机度量替换");
    }

    /// 手动运行：把仓库根 README.md 导出为 docx 供人工在 Word 中核对
    /// cargo test --no-run 之后： cargo test write_readme_docx_for_inspection -- --ignored --nocapture
    #[test]
    #[ignore = "手动运行，产出 target/readme-export.docx 供人工核对"]
    fn write_readme_docx_for_inspection() {
        let manifest = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        let root = manifest.parent().expect("repo root");
        let md = std::fs::read_to_string(root.join("README.md")).expect("read README.md");
        let theme = test_theme();
        let bytes = markdown_to_docx(&md, theme, Some(root.to_path_buf()), RemoteImages::new()).expect("generate docx");
        let out = manifest.join("target/readme-export.docx");
        std::fs::write(&out, &bytes).expect("write docx");
        println!("已导出: {}", out.display());
    }

    #[test]
    fn acceptance_sample_package_is_well_formed() {
        // 用户就是拿 `docx-export-test.md` 导出的 docx 逐项验收的，所以它必须被自动测试覆盖
        // （此前只有人工探针 `write_export_test_docx_for_inspection`）
        let manifest = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        let root = manifest.parent().expect("repo root");
        let Ok(md) = std::fs::read_to_string(root.join("docx-export-test.md")) else { return };
        let theme = DocxTheme { font_size_px: Some(20.0), line_height: Some(2.0), ..test_theme() };
        let bytes = markdown_to_docx(&md, theme, Some(root.to_path_buf()), RemoteImages::new())
            .expect("generate docx");
        let mut zip = zip::ZipArchive::new(std::io::Cursor::new(&bytes)).expect("valid zip");
        let mut checked = 0usize;
        for i in 0..zip.len() {
            let mut f = zip.by_index(i).unwrap();
            let name = f.name().to_string();
            if !(name.ends_with(".xml") || name.ends_with(".rels")) {
                continue;
            }
            let mut s = String::new();
            f.read_to_string(&mut s).unwrap();
            assert!(xml_is_well_formed(&s), "部件 {} 结构不良", name);
            checked += 1;
            if name == "word/document.xml" {
                // 【1】【4】所有换行必须包在 run 里，否则 Word/WPS 整段忽略
                assert_eq!(
                    s.matches("<w:br/>").count(),
                    s.matches("<w:r><w:br/></w:r>").count(),
                    "存在裸 <w:br/>（换行会整段失效）"
                );
                assert!(!s.contains("FRONTMATTER_SHOULD_NOT_APPEAR"), "front matter 泄漏到正文");
            }
            if name == "word/footnotes.xml" {
                // 【8】脚注内不得出现正文字号（20px → sz 30）
                assert!(!s.contains("<w:sz w:val=\"30\"/>"), "脚注里出现正文字号: {}", s);
            }
        }
        assert!(checked >= 6, "部件数量异常: {}", checked);
    }

    /// 手动运行：把仓库根的全格式样本 `docx-export-test.md` 导出为 docx，供人工在 Word 中逐项核对
    /// cargo test write_export_test_docx_for_inspection -- --ignored --nocapture
    ///
    /// 如果 `target/highlight-payload.json` 存在（由 `scripts/probe-code-highlight.mjs` 用真实浏览器
    /// 跑出来的前端高亮产物），就带上它 —— 产物里的代码块才会像从应用里导出那样带语法高亮；
    /// 文件不存在时走单色等宽（`CodeHighlights::default()` 的兜底路径）。
    #[test]
    #[ignore = "手动运行，产出 target/export-test.docx 供人工核对"]
    fn write_export_test_docx_for_inspection() {
        let manifest = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        let root = manifest.parent().expect("repo root");
        let md = std::fs::read_to_string(root.join("docx-export-test.md")).expect("read test md");
        let mut theme = DocxTheme { font_size_px: Some(20.0), line_height: Some(2.0), ..test_theme() };
        let payload_path = manifest.join("target/highlight-payload.json");
        match std::fs::read_to_string(&payload_path) {
            Ok(raw) => {
                theme.code_highlights = serde_json::from_str(&raw).expect("highlight-payload.json 不是合法的高亮表");
                println!(
                    "带上前端真实高亮: {} 个代码块 / {} 条样式",
                    theme.code_highlights.blocks.len(),
                    theme.code_highlights.styles.len()
                );
            }
            Err(_) => println!("未找到 target/highlight-payload.json，代码块按单色导出"),
        }
        let bytes = markdown_to_docx(&md, theme, Some(root.to_path_buf()), RemoteImages::new())
            .expect("generate docx");
        let out = manifest.join("target/export-test.docx");
        std::fs::write(&out, &bytes).expect("write docx");
        println!("已导出: {}", out.display());
    }

    /// 手动运行：产出项目符号验收样本，用**真实 Word** 打开逐级核对字形。
    ///
    /// 背景：`numbering_xml()` 曾把 Unicode 码位（`U+2022`/`U+25E6`/`U+25AA`）配 Symbol 字体，
    /// 而 Symbol 的 cmap 里这三个码位**都没有字形** → 方框。回归断言
    /// （`bullets_use_unicode_without_forced_symbol_font`）只能证明「生成的 XML 里没有 Symbol」，
    /// **证明不了 Word 实际画出什么** —— 字形查找与回退行为只有真 Word 里才看得见，故留此探针。
    ///
    /// 三种正文字体各出一份：MiSans / Microsoft YaHei（字体自带符号的常规情况）、
    /// Inter（纯拉丁字体，最差情况 —— 只能靠 Word 逐字回退）。
    ///
    /// `cargo test write_bullet_probe -- --ignored --nocapture`
    #[test]
    #[ignore = "手动运行，产出 target/bullet-probe-*.docx 供在 Word 中验收项目符号"]
    fn write_bullet_probe() {
        let md = "# 项目符号验收\n\n预期：三级符号依次为 • ○ ■；选中任意一个时字体栏**不应显示 Symbol**，二级/三级不应出现方框或错误字符。\n\n- 一级项目符号\n  - 二级项目符号\n    - 三级项目符号\n- 一级第二项\n  - 二级第二项\n\n1. 有序一级\n   1. 有序二级\n\n- **加粗开头的项**：正文内容\n- 普通项\n";
        for (label, font) in [
            ("misans", "MiSans"),
            ("yahei", "Microsoft YaHei"),
            ("inter", "Inter"),
        ] {
            let theme = DocxTheme { font: font.into(), ..test_theme() };
            let bytes = markdown_to_docx(md, theme, None, RemoteImages::new()).expect("generate docx");
            let out = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join(format!("target/bullet-probe-{}.docx", label));
            std::fs::write(&out, &bytes).expect("write docx");
            println!("已导出: {}  （正文字体 {}）", out.display(), font);
        }
        println!("验收：逐级选中项目符号 —— 字形应为 • ○ ■；字体栏不应是 Symbol；三份都应无方框");
    }

    // ===================== v0.3.5 修复项回归断言 =====================

    #[test]
    fn metrics_defaults_match_app_css_defaults() {
        // 前端未传字号/行高时退回应用自身的 CSS 缺省（--font-size-base 16px / --line-height 1.8）
        let a = Metrics::new(None, None);
        let b = Metrics::new(Some(16.0), Some(1.8));
        assert_eq!((a.body_sz, a.line), (b.body_sz, b.line));
        assert_eq!(a.body_sz, 24, "16px 应为 12pt（24 半磅）");
        assert_eq!(a.line, 360, "1.8 倍行距 = 240×1.8/1.2");
    }

    #[test]
    fn body_font_size_and_line_height_follow_settings() {
        // 用户设置：预览字号 20px、行高 2.0（应用默认设置值）
        let theme = || DocxTheme { font_size_px: Some(20.0), line_height: Some(2.0), ..test_theme() };
        let styles = docx_part("正文\n\n# 标题\n", theme(), "word/styles.xml");
        // 20px → 15pt → 30 半磅；行高 2.0 → 240×2/1.2 = 400
        assert!(styles.contains("<w:sz w:val=\"30\"/>"), "正文字号未跟随设置: {}", styles);
        assert!(styles.contains("w:line=\"400\""), "行距未跟随设置: {}", styles);
        // 段后距 = 1em = 15pt = 300 twips（随字号缩放）
        assert!(styles.contains("w:after=\"300\""), "段后距未按字号换算: {}", styles);
        // 标题按预览的 em 比例：h1 = 2em = 30pt = 60 半磅
        assert!(styles.contains("<w:sz w:val=\"60\"/>"), "h1 字号未按 2em 换算: {}", styles);
        // h3 = 1.25em = 18.75pt → 37.5 → 38 半磅
        assert!(styles.contains("<w:sz w:val=\"38\"/>"), "h3 字号未按 1.25em 换算: {}", styles);
        // 代码块也跟随设置的（预览里 `pre code` 没有自己的 line-height，继承容器值）
        let code_style = style_block(&styles, "CodeBlock");
        assert!(code_style.contains("w:line=\"400\""), "代码块行距未跟随设置: {}", code_style);
        // 表格单元格同理（`th/td` 也没有自己的 line-height）
        let doc = docx_part("| a | b |\n|---|---|\n| 1 | 2 |\n", theme(), "word/document.xml");
        assert!(
            doc.contains("<w:spacing w:before=\"0\" w:after=\"0\" w:line=\"400\" w:lineRule=\"auto\"/>"),
            "单元格行距未跟随设置: {}",
            doc
        );
    }

    #[test]
    fn front_matter_is_not_exported_as_body() {
        // 回归：YAML front matter 此前会漏成正文第一段（预览/HTML/PDF 都不显示）
        let doc = xml_of("---\ntitle: 元信息标题\ntags: [a, b]\n---\n\n正文第一段\n");
        assert!(!doc.contains("元信息标题"), "front matter 泄漏到正文: {}", doc);
        assert!(!doc.contains("tags:"), "front matter 泄漏到正文: {}", doc);
        assert!(doc_text(&doc).contains("正文第一段"), "正文丢失: {}", doc);
    }

    #[test]
    fn display_and_inline_math_become_native_omml() {
        // 回归：`$…$` / `$$…$$` 曾保留 TeX 源码。现在转成 Word 原生可编辑公式（OMML），
        // 内容与 TeX 源码都不应留在正文（源码只在转换失败时兜底）
        let doc = xml_of("行内公式 $a^2+b^2=c^2$ 结束\n\n$$\n\\int_0^1 x dx\n$$\n");
        assert!(doc.contains("<m:oMath>"), "行内公式未生成 OMML: {}", doc);
        assert!(doc.contains("<m:sSup>"), "上标未生成上下标结构: {}", doc);
        assert!(doc.contains("<m:nary>"), "积分未生成 n 元运算符: {}", doc);
        assert!(
            doc.contains("<m:oMathPara><m:oMathParaPr><m:jc m:val=\"centerGroup\"/>"),
            "块级公式未按居中公式段落输出: {}",
            doc
        );
        let text = doc_text(&doc);
        assert!(!text.contains("a^2+b^2=c^2"), "行内公式仍残留 TeX 源码: {}", doc);
        assert!(!text.contains("\\int_0^1"), "块级公式仍残留 TeX 源码: {}", doc);
        // 数学命名空间必须声明在文档根上，否则 Word 会把 m: 元素当作未知元素
        assert!(
            doc.contains("xmlns:m=\"http://schemas.openxmlformats.org/officeDocument/2006/math\""),
            "缺少 m 命名空间: {}",
            doc
        );
        // OMML 必须是结构良好的 XML（拼错标签名 Word 会直接报文件损坏）
        assert!(xml_is_well_formed(&doc), "OMML 导致 document.xml 结构不良");
    }

    #[test]
    fn math_text_preserves_spaces() {
        // `m:t` 与 `w:t` 一样默认吞掉首尾空格（OOXML 文本规则），必须补 xml:space
        let doc = xml_of("$\\text{ a b}$\n");
        assert!(doc.contains("<m:t"), "公式文本缺失: {}", doc);
        assert!(
            !doc.contains("<m:t>") || doc.contains("<m:t xml:space=\"preserve\">"),
            "m:t 未保留空格声明: {}",
            doc
        );
    }

    #[test]
    fn unparsable_math_falls_back_to_tex_source() {
        // 引擎对未知宏会静默丢弃；整段都没有可渲染内容时应退回 TeX 源码，
        // 保证「公式不显示成 Word 公式」也不会变成空白
        let doc = xml_of("前 $\\thisisnotamacro$ 后\n");
        let text = doc_text(&doc);
        assert!(
            text.contains("thisisnotamacro"),
            "无法转换的公式被静默丢弃（既没有 OMML 也没有源码）: {}",
            doc
        );
        assert!(xml_is_well_formed(&doc), "兜底路径产生结构不良的 XML");
    }

    #[test]
    fn footnotes_become_word_footnotes_without_leaking() {
        let md = "正文引用脚注[^1]。\n\n[^1]: 脚注定义文字\n";
        let doc = docx_part(md, test_theme(), "word/document.xml");
        let fnx = docx_part(md, test_theme(), "word/footnotes.xml");
        let ct = docx_part(md, test_theme(), "[Content_Types].xml");
        let rels = docx_part(md, test_theme(), "word/_rels/document.xml.rels");
        let names = docx_parts(md, test_theme());

        // 正文：引用处是 Word 原生脚注引用，定义文字不再出现在正文
        assert!(doc.contains("<w:footnoteReference w:id=\"1\"/>"), "脚注引用缺失: {}", doc);
        assert!(doc.contains("w:rStyle w:val=\"FootnoteReference\""), "脚注引用样式缺失: {}", doc);
        assert!(!doc.contains("脚注定义文字"), "脚注定义泄漏到正文: {}", doc);
        assert!(doc_text(&doc).contains("正文引用脚注"), "正文丢失: {}", doc);

        // footnotes.xml：两个必需分隔符 + 定义内容 + 脚注序号 + 脚注样式
        assert!(fnx.contains("w:type=\"separator\""), "脚注分隔符缺失: {}", fnx);
        assert!(fnx.contains("w:type=\"continuationSeparator\""), "脚注延续分隔符缺失: {}", fnx);
        assert!(fnx.contains("<w:footnote w:id=\"1\">"), "脚注定义缺失: {}", fnx);
        assert!(fnx.contains("脚注定义文字"), "脚注内容丢失: {}", fnx);
        assert!(fnx.contains("<w:footnoteRef/>"), "脚注序号缺失: {}", fnx);
        assert!(fnx.contains("w:pStyle w:val=\"FootnoteText\""), "脚注样式未应用: {}", fnx);

        // 部件与关系声明（缺一则 Word 报文档损坏）
        assert!(names.contains(&"word/footnotes.xml".to_string()), "{:?}", names);
        assert!(ct.contains("PartName=\"/word/footnotes.xml\""), "{}", ct);
        assert!(ct.contains("wordprocessingml.footnotes+xml"), "{}", ct);
        assert!(rels.contains("Target=\"footnotes.xml\""), "{}", rels);
        assert!(rels.contains("relationships/footnotes"), "{}", rels);
    }

    /// 回归【8】：脚注里的**所有**文字都必须用脚注字号。
    ///
    /// 此前只有脚注首段被改写成 `FootnoteText`：脚注里的列表项用 `ListParagraph`（基于
    /// `Normal` = 正文字号）、多段脚注的第二段同样是 `Normal`、行内代码是**正文字号**的 0.9 倍
    /// （比脚注正文还大）—— 于是脚注内部字号参差不齐。
    #[test]
    fn footnote_inner_paragraphs_use_footnote_size() {
        let md = "正文[^fmt]。\n\n[^fmt]: 脚注首段含 `行内代码`。\n\n    - 脚注里的列表\n    - 第二项\n\n    脚注第二段。\n";
        let fnx = docx_part(md, test_theme(), "word/footnotes.xml");
        // 16px 正文 → sz 24；脚注 sz = round(24 × 0.83) = 20
        let body_sz = 24;
        let fn_sz = 20;
        assert!(
            fnx.contains(&format!("<w:sz w:val=\"{}\"/>", fn_sz)),
            "脚注未使用脚注字号: {}", fnx
        );
        assert!(
            !fnx.contains(&format!("<w:sz w:val=\"{}\"/>", body_sz)),
            "脚注里仍出现正文字号: {}", fnx
        );
        // 脚注里的行内代码必须比脚注正文更小（否则「脚注正文 0.9 倍 = 正文字号」）
        assert!(
            fnx.contains("<w:sz w:val=\"18\"/>"),
            "脚注行内代码未按脚注字号换算: {}", fnx
        );
        // 列表项与多段脚注的第二段都要显式写小字号
        assert!(
            fnx.matches("<w:rPr><w:sz w:val=\"20\"/><w:szCs w:val=\"20\"/></w:rPr>").count() >= 2,
            "脚注段落（列表项/第二段）未写段落级字号: {}", fnx
        );
        // 脚注重定尺寸不能污染正文：正文用正文字号
        let doc = docx_part(md, test_theme(), "word/document.xml");
        assert!(
            !doc.contains("<w:sz w:val=\"20\"/><w:szCs w:val=\"20\"/>"),
            "脚注字号泄漏到正文: {}", doc
        );
    }

    /// 回归【6】：引用必须是**一个连续容器 + 真实嵌套层级**。
    ///
    /// 逐段落写 `w:pBdr`/`w:shd` 时每个段落各画一条边框、段间距处断开（WPS 不合并相邻段落边框），
    /// 看起来「被打断成多个引用、且没有层级」。改为单元格表格：表格连续绘制左边框与底色，
    /// 嵌套引用是父单元格里的内层表格 —— 层级由单元格外边距递进。
    #[test]
    fn quote_is_one_continuous_container_with_nesting() {
        let md = "> 第一段\n>\n> 第二段\n>\n> > 嵌套第二层\n";
        let doc = xml_of(md);
        assert!(xml_is_well_formed(&doc), "引用表格产生结构不良的 XML: {}", doc);
        assert_eq!(doc.matches("<w:tbl>").count(), 2, "引用应为表格容器（含嵌套层）: {}", doc);
        assert_eq!(doc.matches("<w:tr>").count(), 2, "每层引用一个单元格行: {}", doc);
        // 左边框 3pt（= 预览 4px）强调色，由表格绘制
        assert!(
            doc.contains("<w:left w:val=\"single\" w:sz=\"24\" w:space=\"0\" w:color=\"0066CC\"/>"),
            "引用左边框未由表格绘制: {}", doc
        );
        // 段落级边框/底纹全部消失（否则又会断开）
        assert!(!doc.contains("<w:pBdr>"), "引用仍写段落级边框: {}", doc);
        assert_eq!(
            doc.matches("<w:shd w:val=\"clear\" w:color=\"auto\" w:fill=\"F0F7FF\"/>").count(),
            4,
            "底色应由表格与单元格各画一次（两层共 4 处）: {}", doc
        );
        // 外层一个单元格里同时包含两段（连续容器，不再按段落断开）
        let first_end = doc.find("</w:tbl>").unwrap();
        let second_start = doc[doc.find("<w:tbl>").unwrap() + 7..].find("<w:tbl>").unwrap();
        assert!(
            second_start < first_end,
            "嵌套引用未被包进外层单元格（层级丢失）: {}", doc
        );
        // 两段都在**同一个**单元格里
        let cell = &doc[doc.find("<w:tc>").unwrap()..first_end];
        assert!(cell.contains("第一段") && cell.contains("第二段"), "同层多段未在同一容器内: {}", doc);

        // Quote 样式只保留文字色（边框/底色/缩进都交给表格）
        let styles = docx_part("> 引用\n", test_theme(), "word/styles.xml");
        let quote = style_block(&styles, "Quote");
        assert!(quote.contains("<w:color w:val=\"666666\"/>"), "引用文字色丢失: {}", quote);
        assert!(!quote.contains("w:pBdr") && !quote.contains("w:shd"), "Quote 样式不应再画边框/底色: {}", quote);
    }

    #[test]
    fn orphan_footnote_definition_and_missing_definition_keep_text() {
        // 有定义但没引用：内容不能消失（按普通段落输出）
        let doc = xml_of("正文\n\n[^orphan]: 未被引用的定义\n");
        assert!(doc_text(&doc).contains("未被引用的定义"), "未被引用的脚注定义丢失: {}", doc);
        // 有引用但没定义：按 Markdown 原文输出
        let doc2 = xml_of("正文[^missing]结束\n");
        assert!(doc_text(&doc2).contains("[^missing]"), "缺定义的引用被丢弃: {}", doc2);
        assert!(!doc2.contains("<w:footnoteReference"), "缺定义时不应生成脚注引用: {}", doc2);
    }

    #[test]
    fn scan_footnotes_separates_definitions_from_references() {
        let (defined, referenced) = scan_footnotes("正文[^a]\n\n[^a]: 定义\n\n[^b]: 没被引用\n");
        assert!(defined.contains("a") && defined.contains("b"), "{:?}", defined);
        assert!(referenced.contains("a") && !referenced.contains("b"), "{:?}", referenced);
        // 单独的定义行不会被误判成引用
        let (d2, r2) = scan_footnotes("[^x]: 定义\n");
        assert!(d2.contains("x") && r2.is_empty(), "定义被误判为引用: {:?}", r2);
    }

    #[test]
    fn horizontal_rule_becomes_bordered_paragraph() {
        // 回归：`---` 分隔线此前完全消失
        let doc = xml_of("上文\n\n---\n\n下文\n");
        assert!(
            doc.contains("<w:pBdr><w:bottom w:val=\"single\" w:sz=\"6\" w:space=\"1\" w:color=\"D5E2FF\"/></w:pBdr>"),
            "分隔线缺失: {}", doc
        );
        let text = doc_text(&doc);
        assert!(text.contains("上文") && text.contains("下文"), "{}", doc);
    }

    /// document.xml 里出现的 numId 序列
    fn num_ids(doc: &str) -> Vec<u32> {
        let mut out = Vec::new();
        let mut rest = doc;
        const PAT: &str = "<w:numId w:val=\"";
        while let Some(i) = rest.find(PAT) {
            let after = &rest[i + PAT.len()..];
            let end = after.find('"').unwrap_or(0);
            if let Ok(v) = after[..end].parse() {
                out.push(v);
            }
            rest = &after[end..];
        }
        out
    }

    #[test]
    fn each_top_level_list_restarts_numbering() {
        // 回归：此前所有有序列表共用 numId=1 → 第二个有序列表接着上一个继续编号
        let md = "1. 甲\n2. 乙\n\n正文\n\n1. 丙\n2. 丁\n";
        let doc = xml_of(md);
        let ids = num_ids(&doc);
        assert!(ids.len() >= 4, "编号缺失: {:?}", ids);
        assert_ne!(ids[0], ids[2], "两个有序列表共用了同一个编号实例: {:?}", ids);
        // 两个有序列表各自指向**独有**的 abstractNum（共享 abstractNum 会让计数器互相推高）
        let numbering = docx_part(md, test_theme(), "word/numbering.xml");
        assert!(
            numbering.contains("<w:num w:numId=\"100\"><w:abstractNumId w:val=\"0\"/>"),
            "第一个列表未指向 abstractNum 0: {}", numbering
        );
        assert!(
            numbering.contains("<w:num w:numId=\"101\"><w:abstractNumId w:val=\"1\"/>"),
            "第二个列表未指向独有 abstractNum: {}", numbering
        );
        assert_eq!(
            numbering.matches("<w:abstractNum w:abstractNumId=").count(),
            2,
            "每个列表应有独立 abstractNum: {}", numbering
        );
    }

    #[test]
    fn nested_lists_get_own_instance_with_preview_levels() {
        // 预览里每个 `<ol>` 都从 1 重新开始（各级都是 decimal），所以嵌套有序列表**不再**共用
        // 父实例（共用会渲染成 Word 的 1.1. 多级编号，与预览不符），而是各自一个实例 + ilvl=0；
        // 缩进改由段落 `w:ind` 表达。项目符号的层级差异（• ◦ ▪）由各列表自有的 abstractNum 表达。
        let doc = xml_of("1. 一级\n   1. 二级\n");
        let ids = num_ids(&doc);
        assert_eq!(ids.len(), 2, "编号数量不对: {:?}", ids);
        assert_ne!(ids[0], ids[1], "嵌套有序列表不应共用编号实例: {:?}", ids);
        // 两级有序列表都是 ilvl=0 + 各自缩进 720 / 1440
        assert_eq!(doc.matches("<w:ilvl w:val=\"0\"/>").count(), 2, "有序列表 ilvl 应为 0: {}", doc);
        assert!(!doc.contains("<w:ilvl w:val=\"1\"/>"), "编号层级不应大于 0: {}", doc);
        assert!(doc.contains("<w:ind w:left=\"1440\" w:hanging=\"360\"/>"), "嵌套层缩进丢失: {}", doc);

        // 项目符号嵌套：二级换用同尺寸的 ◦（不再靠 ilvl 递进），缩进同步 1440
        let bullets = xml_of("- 一级\n  - 二级\n");
        assert!(bullets.contains("<w:ind w:left=\"1440\" w:hanging=\"360\"/>"), "二级缩进丢失: {}", bullets);
        let bn = docx_part("- 一级\n  - 二级\n", test_theme(), "word/numbering.xml");
        assert!(bn.contains("<w:lvlText w:val=\"\u{25E6}\"/>"), "二级项目符号应为 ◦: {}", bn);
        // 无序里嵌有序：有序层仍是 ilvl=0
        let mixed = xml_of("- 甲\n  1. 一\n  2. 二\n");
        assert!(mixed.contains("<w:ind w:left=\"1440\" w:hanging=\"360\"/>"), "混合嵌套缩进丢失: {}", mixed);
    }

    #[test]
    fn ordered_list_start_value_is_honored() {
        // 回归：`3. 第三项` 的起始值此前被忽略（永远从 1 开始）
        let numbering = docx_part("3. 第三项\n4. 第四项\n", test_theme(), "word/numbering.xml");
        assert!(
            numbering.contains("<w:lvlOverride w:ilvl=\"0\"><w:startOverride w:val=\"3\"/></w:lvlOverride>"),
            "起始值未生效: {}", numbering
        );
        // 起始值为 1 时**也要**写 override：多个实例共享同一 abstractNum，不覆盖的话 Word
        // 会接着上一个列表继续编号（这是 Word 的经典坑）
        let n2 = docx_part("1. 第一项\n", test_theme(), "word/numbering.xml");
        assert!(
            n2.contains("<w:lvlOverride w:ilvl=\"0\"><w:startOverride w:val=\"1\"/></w:lvlOverride>"),
            "隐式起始 1 也应写 startOverride 以保证重新计数: {}", n2
        );
    }

    #[test]
    fn task_list_item_has_no_double_marker() {
        // 回归：任务项此前同时写 numPr + ☑ → Word 里出现「项目符号 + 勾选框」双重标记
        let doc = xml_of("- [x] 完成事项\n- [ ] 待办事项\n");
        assert!(doc.contains("☑") && doc.contains("☐"), "任务字形丢失: {}", doc);
        assert!(!doc.contains("<w:numPr>"), "任务项不应带编号（会变成双重标记）: {}", doc);
        assert_eq!(
            doc.matches("<w:ind w:left=\"720\" w:hanging=\"360\"/>").count(),
            2,
            "任务项缩进未对齐编号文本位: {}", doc
        );
        // 勾选字形必须在正文字体里没有字形，需显式指定符号字体
        assert!(doc.contains("w:ascii=\"Segoe UI Symbol\""), "任务字形未指定符号字体: {}", doc);
    }

    #[test]
    fn superscript_subscript_and_inline_html_map_to_runs() {
        // 应用的上标/下标走 HTML 标签（工具条插入 `<sup></sup>` / `<sub></sub>`，预览 `html:true` 才渲染），
        // 所以导出只认这两个标签；`^a^` / `~b~` 这类拓展语法**预览不识别**（字面显示），
        // 导出也必须保持字面 —— 否则会出现「预览是 `^a^`、Word 里却成了上标」的不一致。
        let doc = xml_of("上标 <sup>2</sup> 与 <sub>i</sub>\n\n语法 ^a^ 与 ~b~\n");
        assert_eq!(
            doc.matches("<w:vertAlign w:val=\"superscript\"/>").count(), 1,
            "HTML 上标未生效: {}", doc
        );
        assert_eq!(
            doc.matches("<w:vertAlign w:val=\"subscript\"/>").count(), 1,
            "HTML 下标未生效: {}", doc
        );
        let text = doc_text(&doc);
        assert!(text.contains("^a^"), "`^a^` 不应被转换成上标: {}", text);
        // 已知差异：pulldown 的删除线**同时接受单波浪线**（GFM 只认 `~~x~~`），关掉 SUBSCRIPT 后
        // `~b~` 就落到删除线（预览里 markdown-it 只认 `~~`，`~b~` 是字面文本）。
        // 二者不可兼得（无法只关单波浪线），取「保住 `~~删除线~~`」这一侧。
        assert!(doc.contains("<w:strike/>"), "`~~x~~` 删除线失效: {}", doc);
        // 回归：`^a^` 此前会把整段拆碎（is_inline_start 未含 Superscript）
        assert_eq!(doc.matches("<w:p>").count(), 2, "段落被拆碎: {}", doc);
    }

    #[test]
    fn inline_html_formatting_and_breaks() {
        let doc = xml_of("前<u>下划线</u>与<mark>高亮</mark>，换行<br>下一行\n");
        assert!(doc.contains("<w:u w:val=\"single\"/>"), "下划线未生效: {}", doc);
        assert!(doc.contains("<w:highlight w:val=\"yellow\"/>"), "高亮未生效: {}", doc);
        assert!(doc.contains("<w:r><w:br/></w:r>"), "<br> 未生效: {}", doc);
        assert_br_only_inside_runs(&doc);
    }

    #[test]
    fn wikilink_stays_plain_text_and_bare_url_is_autolinked() {
        // `[[某页]]` 不是 URL：写成外部超链接会生成无效目标，应按原文输出
        let doc = xml_of("参见 [[某页]]\n");
        assert!(doc_text(&doc).contains("[[某页]]"), "wikilink 原文丢失: {}", doc);
        assert!(!doc.contains("<w:hyperlink"), "wikilink 不应生成超链接: {}", doc);
        // 预览 linkify 会把裸 URL 变成链接
        let md2 = "见 https://example.com/a?b=1 说明\n";
        let doc2 = xml_of(md2);
        assert!(doc2.contains("<w:hyperlink"), "裸 URL 未自动链接: {}", doc2);
        let rels2 = docx_part(md2, test_theme(), "word/_rels/document.xml.rels");
        assert!(
            rels2.contains("Target=\"https://example.com/a?b=1\""),
            "URL 目标不对: {}", rels2
        );
        assert!(doc_text(&doc2).contains("见 https://example.com/a?b=1 说明"), "文本被改动: {}", doc2);
    }

    #[test]
    fn smart_punctuation_is_disabled_like_preview() {
        // 预览 typographer:false → 引号/破折号/省略号必须保持原样
        let doc = xml_of("他说 \"引号\" 与 a--b 与 省略...\n");
        let text = doc_text(&doc);
        assert!(text.contains("\"引号\""), "英文引号被智能替换: {}", text);
        assert!(text.contains("a--b"), "破折号被智能替换: {}", text);
        assert!(text.contains("..."), "省略号被智能替换: {}", text);
    }

    #[test]
    fn code_block_is_one_paragraph_with_line_breaks() {
        let doc = xml_of("```\nline1\nline2\nline3\n```\n");
        assert_eq!(doc.matches("w:pStyle w:val=\"CodeBlock\"").count(), 1, "代码块应为一个段落: {}", doc);
        assert_eq!(doc.matches("<w:br/>").count(), 2, "代码行间应有换行: {}", doc);
        assert_eq!(doc.matches("<w:p>").count(), 1, "不应有多余段落: {}", doc);
        assert_br_only_inside_runs(&doc);
    }

    /// 回归：每个 `<w:br/>` 都必须包在 `<w:r>` 里。
    ///
    /// `w:br` 是 run 级元素，直接挂在 `<w:p>` 下不是合法段落内容 —— Word/WPS 会整段忽略，
    /// 表现为「软换行、硬换行、代码块行间换行全部消失、文字挤成一行」（用户报的 【1】【4】）。
    /// XML 仍然良构，所以只有这条断言能挡住回归。
    fn assert_br_only_inside_runs(doc: &str) {
        let total = doc.matches("<w:br/>").count();
        let wrapped = doc.matches("<w:r><w:br/></w:r>").count();
        assert_eq!(total, wrapped, "存在裸 <w:br/>（必须包在 <w:r> 里）: {}", doc);
        assert!(!doc.contains("</w:r><w:br/>"), "存在裸 <w:br/>: {}", doc);
    }

    #[test]
    fn soft_and_hard_breaks_stay_in_run() {
        // 【1】同段落里的软换行（单个换行）/ 硬换行（两空格、行尾反斜杠）都必须换行且不能裸写
        let doc = xml_of("第一行\n第二行  \n第三行\\\n第四行\n");
        assert!(doc.contains("<w:r><w:br/></w:r>"), "换行未生效: {}", doc);
        assert_br_only_inside_runs(&doc);
        // 反斜杠硬换行不应把 `\` 留在正文里
        assert!(!doc_text(&doc).contains('\\'), "硬换行反斜杠残留: {}", doc_text(&doc));
        // 同一段落内的换行：只有一个非空段落
        assert_eq!(doc.matches("<w:p>").count(), 1, "不应拆成多个段落: {}", doc);
    }

    #[test]
    fn code_block_uses_frontend_highlight_spans_with_colors() {
        // 【7】语法高亮：导出直接复用前端（预览**同一份** highlight.js）的分词与 computed style，
        // 逐片段写 w:color / w:b / w:i；片段内部的换行仍走 run 级 `<w:br/>`。
        use std::collections::HashMap;
        let mut theme = test_theme();
        theme.code_highlights = CodeHighlights {
            styles: HashMap::from([
                ("".to_string(), CodeStyle { color: "#24292F".into(), bold: false, italic: false }),
                ("hljs-keyword".to_string(), CodeStyle { color: "rgb(207, 34, 46)".into(), bold: true, italic: false }),
                ("hljs-string".to_string(), CodeStyle { color: "0A3069".into(), bold: false, italic: true }),
                ("hljs-number".to_string(), CodeStyle { color: "0550AE".into(), bold: false, italic: false }),
            ]),
            blocks: HashMap::from([(
                code_key("rust", "let s = \"hi\";\nlet t = 2;"),
                vec![
                    ("hljs-keyword".to_string(), "let".to_string()),
                    ("".to_string(), " s = ".to_string()),
                    ("hljs-string".to_string(), "\"hi\"".to_string()),
                    // 换行落在无着色片段里：必须转成 run 内的 <w:br/>，而不是把两行并成一行
                    ("".to_string(), ";\nlet t = ".to_string()),
                    ("hljs-number".to_string(), "2".to_string()),
                    ("".to_string(), ";".to_string()),
                ],
            )]),
        };
        let doc = docx_part("```rust\nlet s = \"hi\";\nlet t = 2;\n```\n", theme, "word/document.xml");

        // 结构不变：一个代码块 = 一个段落，块内换行包在 run 里
        assert_eq!(doc.matches("w:pStyle w:val=\"CodeBlock\"").count(), 1, "代码块应为一个段落: {}", doc);
        assert_eq!(doc.matches("<w:br/>").count(), 1, "代码行间应有换行: {}", doc);
        assert_br_only_inside_runs(&doc);

        // 逐片段着色：关键字（粗、rgb 归一成十六进制）、字符串（斜）、数字
        assert!(doc.contains("<w:color w:val=\"CF222E\"/>"), "关键字颜色缺失: {}", doc);
        assert!(doc.contains("<w:color w:val=\"0A3069\"/>"), "字符串颜色缺失: {}", doc);
        assert!(doc.contains("<w:color w:val=\"0550AE\"/>"), "数字颜色缺失: {}", doc);
        assert!(doc.contains("<w:b/><w:bCs/>"), "关键字应加粗: {}", doc);
        assert!(doc.contains("<w:i/><w:iCs/>"), "字符串应斜体: {}", doc);
        // 无着色片段用主题正文色兜底
        assert!(doc.contains("<w:color w:val=\"24292F\"/>"), "无类片段应有兜底色: {}", doc);

        // 文本不丢不重：拼接所有片段正好等于原代码（换行不在 w:t 里，故此处无换行）
        assert_eq!(
            doc_text(&doc),
            "let s = \"hi\";let t = 2;",
            "着色后文本被改变: {}",
            doc_text(&doc)
        );
        // 6 个片段在换行处拆成 7 个 run（换行本身是独立的 `<w:r><w:br/></w:r>`）
        assert_eq!(doc.matches("<w:rPr>").count(), 7, "片段与换行切分不正确: {}", doc);
    }

    /// 前端 `collectCodeHighlights()` 产出的 JSON 必须能被 Rust 侧直接吃下并着色。
    ///
    /// 这条用例守的是 **JS↔Rust 的接线**：字段名（`theme.codeHighlights` 是 camelCase）、
    /// `blocks` 的「`[[类路径, 文本], …]`」数组形状、`styles` 的 `{color,bold,italic}` —— 任一处
    /// 改名/改形状，导出就会静默退回单色（用户看到的现象是「语法高亮没了」，很难定位）。
    #[test]
    fn frontend_highlight_payload_deserializes_and_colors_runs() {
        // 与前端真实产出同构：颜色是 computed style 的 `rgb(…)`，代码里含 U+001F 分隔符
        let payload = r##"{
            "accent": "#0066CC",
            "text": "rgb(36, 41, 47)",
            "font": "MiSans",
            "monoFont": "\"Consolas\", monospace",
            "border": "#D5E2FF",
            "surface": "#F0F7FF",
            "fontSizePx": 20,
            "lineHeight": 2,
            "codeHighlights": {
                "styles": {
                    "": { "color": "rgb(36, 41, 47)", "bold": false, "italic": false },
                    "hljs-keyword": { "color": "rgb(207, 34, 46)", "bold": true, "italic": false }
                },
                "blocks": {
                    "rust\u001flet x = 1;": [["hljs-keyword", "let"], ["", " x = 1;"]]
                }
            }
        }"##;
        let theme: DocxTheme = serde_json::from_str(payload).expect("前端 payload 必须能反序列化");
        let doc = docx_part("```rust\nlet x = 1;\n```\n", theme, "word/document.xml");
        assert!(doc.contains("<w:color w:val=\"CF222E\"/>"), "关键字未着色: {}", doc);
        assert!(doc.contains("<w:b/><w:bCs/>"), "关键字未加粗: {}", doc);
        assert!(doc.contains("<w:color w:val=\"24292F\"/>"), "无类片段未用兜底色: {}", doc);
        assert_eq!(doc.matches("w:pStyle w:val=\"CodeBlock\"").count(), 1, "段落结构被破坏: {}", doc);
        assert_eq!(doc_text(&doc), "let x = 1;", "文本被改变: {}", doc_text(&doc));
    }

    /// 高亮表里没有对应代码块时的兜底：单色等宽，不写任何 w:color。
    #[test]
    fn code_block_falls_back_to_mono_without_highlight_data() {
        use std::collections::HashMap;
        let mut theme = test_theme();
        theme.code_highlights = CodeHighlights {
            styles: HashMap::from([("hljs-keyword".to_string(), CodeStyle { color: "CF222E".into(), bold: true, italic: false })]),
            blocks: HashMap::from([(
                code_key("rust", "let s = 1;"),
                vec![("hljs-keyword".to_string(), "let".to_string()), ("".to_string(), " s = 1;".to_string())],
            )]),
        };
        // 语言不同：{python, let s = 1;} 不在表里（键包含语言，避免不同语言同文本串味）
        let doc = docx_part("```python\nlet s = 1;\n```\n", theme, "word/document.xml");
        assert!(!doc.contains("<w:color"), "查不到高亮时不应写着色: {}", doc);
        assert!(doc.contains("w:pStyle w:val=\"CodeBlock\""), "代码块样式缺失: {}", doc);
        assert_eq!(doc_text(&doc), "let s = 1;", "兜底路径文本应完整: {}", doc_text(&doc));

        // 规范化规则的前后端契约（前端必须用同一规则，否则查表必然落空）
        assert_eq!(normalize_code("a\r\nb\n\n"), "a\nb");
        assert_eq!(normalize_code("a\rb"), "a\nb"); // 单独 CR 也是换行（CommonMark 一致）
        assert_ne!(code_key("rust", "x"), code_key("py", "x"), "键必须包含语言");
    }

    #[test]
    fn styles_declare_doc_defaults_with_language() {
        let styles = docx_part("正文\n", test_theme(), "word/styles.xml");
        assert!(styles.contains("<w:docDefaults>"), "缺少默认值: {}", styles);
        assert!(
            styles.contains("<w:lang w:val=\"en-US\" w:eastAsia=\"zh-CN\"/>"),
            "缺少语言标记: {}", styles
        );
        assert!(styles.contains("<w:rFonts w:ascii=\"MiSans\""), "默认字体缺失: {}", styles);
    }

    #[test]
    fn local_image_kind_is_detected_by_magic_bytes() {
        let dir = std::env::temp_dir().join("yizimd-docx-test");
        std::fs::create_dir_all(&dir).unwrap();
        let png = [
            0x89u8, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48,
            0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00,
            0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41, 0x54, 0x78,
            0x9C, 0x62, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
            0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
        ];
        // 内容是真 PNG、扩展名却是 .jfif：此前会因扩展名不在白名单而被静默丢弃
        let disguised = dir.join("disguised.jfif");
        std::fs::write(&disguised, &png).unwrap();
        let md = format!("![a]({})\n", disguised.to_string_lossy().replace('\\', "\\\\"));
        let names = docx_parts(&md, test_theme());
        assert!(
            names.iter().any(|n| n == "word/media/image1.png"),
            "未按文件头判定类型: {:?}", names
        );

        // 扩展名写成 .png、内容其实是 GIF → 按文件头写成 gif
        let mut gif: Vec<u8> = b"GIF89a".to_vec();
        gif.extend_from_slice(&[0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00]);
        let wrong = dir.join("actually-gif.png");
        std::fs::write(&wrong, &gif).unwrap();
        let md2 = format!("![a]({})\n", wrong.to_string_lossy().replace('\\', "\\\\"));
        let names2 = docx_parts(&md2, test_theme());
        assert!(
            names2.iter().any(|n| n == "word/media/image1.gif"),
            "错误的扩展名未被文件头纠正: {:?}", names2
        );
    }

    /// 取某个部件的**原始字节**（图片部件是二进制，不能按字符串读）
    fn docx_part_bytes(md: &str, theme: DocxTheme, part: &str) -> Vec<u8> {
        let bytes = markdown_to_docx(md, theme, None, RemoteImages::new()).expect("generate docx");
        let mut zip = zip::ZipArchive::new(std::io::Cursor::new(&bytes)).expect("valid zip");
        let mut out = Vec::new();
        zip.by_name(part).unwrap().read_to_end(&mut out).unwrap();
        out
    }

    /// 测试用 SVG：240×120 px（96dpi → 180×90pt），带文字与矢量图形
    const TEST_SVG: &str = r##"<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120" viewBox="0 0 240 120">
  <rect x="0" y="0" width="240" height="120" fill="#ffffff" stroke="#0066cc" stroke-width="4"/>
  <circle cx="60" cy="60" r="30" fill="#d5e2ff"/>
  <text x="110" y="68" font-size="28" fill="#333333">Hi</text>
</svg>"##;

    #[test]
    fn sniff_svg_recognizes_text_xml_shapes() {
        assert!(sniff_svg(TEST_SVG.as_bytes()), "标准 SVG 未识别");
        // XML 声明 / BOM / 前导空白 / DOCTYPE / 注释 都不影响判定
        assert!(sniff_svg("<?xml version=\"1.0\"?>\n<svg/>".as_bytes()));
        assert!(sniff_svg("\u{feff}  \n<svg xmlns=\"http://www.w3.org/2000/svg\"/>".as_bytes()));
        assert!(sniff_svg("<!-- c --><svg/>".as_bytes()));
        assert!(sniff_svg("<SVG WIDTH=\"1\"/>".as_bytes()), "大小写不应影响判定");
        // 二进制（含 NUL）与不含 <svg 的文本都不算 SVG
        let png = [0x89u8, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        assert!(!sniff_svg(&png));
        assert!(!sniff_svg(b"not an image at all"));
        assert!(!sniff_svg(b"<html><body>hi</body></html>"));
        assert!(!sniff_svg(b""));
    }

    #[test]
    fn svg_rasterizes_vector_and_text_to_png() {
        let (png, w, h) = svg_to_png(TEST_SVG.as_bytes()).expect("SVG 栅格化");
        assert_eq!((w, h), (240.0, 120.0), "固有尺寸应取 SVG 的 px 尺寸");
        assert_eq!(sniff_image_ext(&png), Some("png"), "回退图不是 PNG");
        let (pw, ph) = image_dimensions("png", &png).expect("解析回退图尺寸");
        assert!(pw >= 240 && ph >= 120, "回退图不应小于固有尺寸: {}x{}", pw, ph);
        assert_eq!(pw * 120, ph * 240, "回退图宽高比必须与 SVG 一致");
        // 栅格化失败必须是 None（调用方退回「只嵌矢量」），不能 panic
        assert!(svg_to_png(b"<svg").is_none());
        assert!(svg_to_png(b"garbage").is_none());

        // 「文字是否真的画上去了」：有/无 <text> 两张图，像素必须不同。
        // 若 text / system-fonts 特性缺失或字体加载失败，文字会静默消失 → 两张图会一模一样
        let without_text = TEST_SVG.replace("<text x=\"110\" y=\"68\" font-size=\"28\" fill=\"#333333\">Hi</text>", "");
        let (png_no_text, _, _) = svg_to_png(without_text.as_bytes()).expect("SVG 栅格化（无文字）");
        assert!(png != png_no_text, "SVG 里的文字没有被渲染出来");
    }

    #[test]
    fn svg_is_embedded_as_vector_with_png_fallback() {
        let dir = std::env::temp_dir().join("yizimd-docx-svg-test");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("vector.svg");
        std::fs::write(&path, TEST_SVG).unwrap();
        let md = format!("前文 ![图示]({}) 后文\n", path.to_string_lossy().replace('\\', "\\\\"));
        let names = docx_parts(&md, test_theme());

        // 矢量部件与回退位图必须同时存在（LibreOffice 缺回退图会显示空白，tdf#126084）
        assert!(names.iter().any(|n| n == "word/media/image1.svg"), "缺少 SVG 部件: {:?}", names);
        assert!(names.iter().any(|n| n == "word/media/image1.png"), "缺少 PNG 回退部件: {:?}", names);

        let doc = docx_part(&md, test_theme(), "word/document.xml");
        // Word 2016+ 走这个扩展拿矢量
        assert!(
            doc.contains("<a:ext uri=\"{96DAC541-7B7A-43D3-8B79-37D633B846F1}\">"),
            "缺少 SVG 扩展点: {}", doc
        );
        assert!(
            doc.contains("<asvg:svgBlip xmlns:asvg=\"http://schemas.microsoft.com/office/drawing/2016/SVG/main\" r:embed=\"rIdSvg1\"/>"),
            "svgBlip 结构不对: {}", doc
        );
        // 主 blip 指向回退位图，svgBlip 指向矢量
        assert!(doc.contains("<a:blip r:embed=\"rIdImg1\">"), "主 blip 未指向回退图: {}", doc);
        // 尺寸取 SVG 固有尺寸（240×120 px @96dpi → 2286000 × 1143000 EMU），不是放大后的位图像素
        assert!(doc.contains("cx=\"2286000\" cy=\"1143000\""), "尺寸未按 SVG 固有尺寸: {}", doc);
        assert!(doc_text(&doc).contains("前文"), "正文丢失");
        assert!(xml_is_well_formed(&doc), "SVG 图片导致 document.xml 结构不良");

        // 关系：两个部件都用标准 image 关系类型（WPS 的 OOXML 层只认这个类型，靠内容类型区分）
        let rels = docx_part(&md, test_theme(), "word/_rels/document.xml.rels");
        assert!(
            rels.contains("Id=\"rIdImg1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/image\" Target=\"media/image1.png\""),
            "回退图关系不对: {}", rels
        );
        assert!(
            rels.contains("Id=\"rIdSvg1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/image\" Target=\"media/image1.svg\""),
            "矢量图关系不对: {}", rels
        );

        // 内容类型：svg 必须声明为 image/svg+xml，否则 Word 认为部件类型未知
        let ct = docx_part(&md, test_theme(), "[Content_Types].xml");
        assert!(
            ct.contains("<Default Extension=\"svg\" ContentType=\"image/svg+xml\"/>"),
            "缺少 svg 内容类型: {}", ct
        );
        assert_eq!(ct.matches("Extension=\"png\"").count(), 1, "png 内容类型应只声明一次: {}", ct);

        // 回退位图本身要是一张能解析的 PNG，尺寸与矢量一致（240×120 的 3 倍栅格化）
        let png = docx_part_bytes(&md, test_theme(), "word/media/image1.png");
        assert_eq!(image_dimensions("png", &png), Some((720, 360)), "回退位图尺寸不对");
    }

    #[test]
    fn svg_extra_css_units_and_content_detection() {
        let dir = std::env::temp_dir().join("yizimd-docx-svg-test");
        std::fs::create_dir_all(&dir).unwrap();
        // 扩展名不是 .svg、也没有魔数：靠内容判定（此前会因扩展名不在白名单而被丢弃）
        let disguised = dir.join("diagram.dat");
        std::fs::write(&disguised, TEST_SVG).unwrap();
        let md = format!("![d]({})\n", disguised.to_string_lossy().replace('\\', "\\\\"));
        let names = docx_parts(&md, test_theme());
        assert!(names.iter().any(|n| n == "word/media/image1.svg"), "未按内容识别 SVG: {:?}", names);

        // 物理单位（in）→ usvg 按 96dpi 换算：2in × 1in = 192×96 px
        let (_, w, h) = svg_to_png(
            br#"<svg xmlns="http://www.w3.org/2000/svg" width="2in" height="1in"></svg>"#,
        )
        .expect("带物理单位的 SVG 栅格化");
        assert_eq!((w.round(), h.round()), (192.0, 96.0), "物理单位换算不对");
    }

    #[test]
    fn invalid_svg_is_skipped_without_losing_text() {
        let dir = std::env::temp_dir().join("yizimd-docx-svg-test");
        std::fs::create_dir_all(&dir).unwrap();
        // 名为 .svg、内容是二进制（典型「其实是别的格式」）
        let broken = dir.join("broken.svg");
        std::fs::write(&broken, [0u8, 1, 2, 3, 0, 255, 254]).unwrap();
        let md = format!("前文 ![i]({}) 后文\n", broken.to_string_lossy().replace('\\', "\\\\"));
        let names = docx_parts(&md, test_theme());
        assert!(
            !names.iter().any(|n| n.starts_with("word/media/")),
            "损坏的图片不应被嵌入: {:?}", names
        );
        let doc = docx_part(&md, test_theme(), "word/document.xml");
        let text = doc_text(&doc);
        assert!(text.contains("前文") && text.contains("后文"), "正文丢失: {}", doc);

        // 语法残缺、但确实是「以 <svg 开头的文本」：不 panic，且 Content_Types 不能漏声明（
        // 只有图片真的嵌入了才需要声明；这里断言包仍然合法）
        let partial = dir.join("partial.svg");
        std::fs::write(&partial, "<svg xmlns=\"http://www.w3.org/2000/svg\"><rect").unwrap();
        let md2 = format!("前 ![p]({}) 后\n", partial.to_string_lossy().replace('\\', "\\\\"));
        let doc2 = docx_part(&md2, test_theme(), "word/document.xml");
        assert!(xml_is_well_formed(&doc2), "残缺 SVG 破坏了 document.xml");
        assert!(doc_text(&doc2).contains("前"), "残缺 SVG 导致正文丢失");
    }

    #[test]
    fn unsupported_image_is_skipped_without_losing_text() {
        let dir = std::env::temp_dir().join("yizimd-docx-test");
        std::fs::create_dir_all(&dir).unwrap();
        // TIFF：Word 支持但我们的打包器不支持，不能按「猜测类型」硬塞（否则 Word 报文件损坏）
        let tiff = dir.join("scan.tiff");
        std::fs::write(&tiff, [0x49u8, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00]).unwrap();
        let md = format!("前文 ![i]({}) 后文\n", tiff.to_string_lossy().replace('\\', "\\\\"));
        let names = docx_parts(&md, test_theme());
        assert!(
            !names.iter().any(|n| n.starts_with("word/media/")),
            "不支持的图片不应被嵌入: {:?}", names
        );
        let doc = docx_part(&md, test_theme(), "word/document.xml");
        let text = doc_text(&doc);
        assert!(text.contains("前文") && text.contains("后文"), "正文丢失: {}", doc);
    }

    #[test]
    fn webp_is_transcoded_to_png_for_word() {
        // Word / WPS 都不能渲染 webp（内嵌后是空框）→ 嵌入前必须转码为 PNG
        let mut img = image::RgbaImage::new(2, 3);
        img.put_pixel(0, 0, image::Rgba([255, 0, 0, 255]));
        let mut webp: Vec<u8> = Vec::new();
        image::codecs::webp::WebPEncoder::new_lossless(&mut webp)
            .encode(img.as_raw(), 2, 3, image::ExtendedColorType::Rgba8)
            .expect("encode webp");
        assert_eq!(sniff_image_ext(&webp), Some("webp"), "测试样本不是 webp");
        let png = webp_to_png(&webp).expect("webp → png");
        assert_eq!(sniff_image_ext(&png), Some("png"), "转码结果不是 PNG");
        assert_eq!(image_dimensions("png", &png), Some((2, 3)), "转码后尺寸变了");
        // 无法转码时必须返回 None（调用方保留原图并告警），不能 panic
        assert!(webp_to_png(b"not a webp at all").is_none());
    }

    #[test]
    fn webp_image_inside_docx_is_png() {
        let dir = std::env::temp_dir().join("yizimd-docx-test");
        std::fs::create_dir_all(&dir).unwrap();
        let mut img = image::RgbaImage::new(4, 4);
        img.put_pixel(1, 1, image::Rgba([0, 0, 255, 255]));
        let mut webp: Vec<u8> = Vec::new();
        image::codecs::webp::WebPEncoder::new_lossless(&mut webp)
            .encode(img.as_raw(), 4, 4, image::ExtendedColorType::Rgba8)
            .expect("encode webp");
        let path = dir.join("shot.webp");
        std::fs::write(&path, &webp).unwrap();
        let md = format!("![w]({})\n", path.to_string_lossy().replace('\\', "\\\\"));
        let names = docx_parts(&md, test_theme());
        assert!(
            names.iter().any(|n| n == "word/media/image1.png"),
            "webp 未被转码为 png: {:?}", names
        );
        assert!(
            !names.iter().any(|n| n.contains("webp")),
            "仍有 webp 部件: {:?}", names
        );
    }
}

