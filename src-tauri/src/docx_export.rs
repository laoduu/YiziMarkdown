//! docx_export.rs — Markdown → DOCX (OOXML) 导出。
//!
//! 用 pulldown-cmark 解析 Markdown，手工生成 OOXML 包（zip）：
//! 标题/列表/表格/代码块/引用/图片全部使用 Word 原生语义，颜色由前端传入的主题变量决定。

use pulldown_cmark::{
    Alignment, BlockQuoteKind, CodeBlockKind, Event, HeadingLevel, LinkType, Options, Parser, Tag,
    TagEnd,
};
use base64::Engine as _;
use std::io::Write;
use std::path::Path;

type EventIter<'a> = std::iter::Peekable<Parser<'a>>;

/// `[toc]` 的占位标记：与前端 `docxPrepare.ts` 的 `DOCX_TOC_MARKER` 必须是同一个字符串。
///
/// 前端把独立的 `[toc]` / `[[toc]]` 行替换成这行 HTML 注释，这里解析到它就输出一个 TOC 域。
/// 不用可见文本，是为了占位符本身不在 Word 里留下任何痕迹；同时兼容直接传进来的裸 `[toc]`
/// （例如测试或别的调用方没走前端预处理）。
const TOC_MARKER: &str = "<!--yizi:toc-->";

/// 目录占位判定：HTML 注释标记，或直接传进来的裸 `[toc]` / `[[toc]]`
fn is_toc_placeholder(text: &str) -> bool {
    let t = text.trim();
    t.eq_ignore_ascii_case(TOC_MARKER)
        || t.eq_ignore_ascii_case("[toc]")
        || t.eq_ignore_ascii_case("[[toc]]")
}

/// 目录书签名：`_Toc000000001`。Word 更新域时也生成同名书签，顺序一致所以不冲突。
fn toc_bookmark(seq: usize) -> String {
    format!("_Toc{:09}", seq)
}

/// 提示块自定义标题的占位标记：与前端 `docxPrepare.ts` 的 `DOCX_ALERT_TITLE_MARKER` 同字符串。
///
/// `> [!TIP] 小技巧` 里 `]` 后的标题在 GFM 解析层会把整行退化成普通引用文本，所以前端
/// 把标题转成引用块内的 HTML 注释（base64 载荷，标题里的 `-->` 等字符不会破坏注释），
/// 这里解析到它就把标题单独渲染成「图标 + 彩色标题」段落。
const ALERT_TITLE_MARKER: &str = "<!--yizi:alert-title:";

fn alert_title_from_marker(text: &str) -> Option<String> {
    let t = text.trim();
    let payload = t.strip_prefix(ALERT_TITLE_MARKER)?.strip_suffix("-->")?;
    let bytes = base64::engine::general_purpose::STANDARD.decode(payload.trim()).ok()?;
    String::from_utf8(bytes).ok()
}

/// 类型 → `(默认标题, 强调色, octicon path)`。
///
/// 颜色与图标路径和预览侧 `src/styles/globals.css` 的 `.md-alert-*` 保持一致（浅色系，
/// Word 始终是白底，暗色主题也会先经过 docxPalette 换成白底等效色）。
fn alert_meta(kind: BlockQuoteKind) -> (&'static str, &'static str, &'static str) {
    match kind {
        BlockQuoteKind::Note => (
            "Note",
            "0969DA",
            "M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM8 3.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75Z",
        ),
        BlockQuoteKind::Tip => (
            "Tip",
            "1F883D",
            "M8 1.5c-2.363 0-4 1.69-4 3.75 0 .984.424 1.625.984 2.304l.214.253c.223.264.47.556.673.848.284.411.537.896.621 1.49a.75.75 0 0 1-1.484.211c-.04-.282-.163-.547-.37-.847a8.456 8.456 0 0 0-.542-.68c-.084-.1-.173-.205-.268-.32C3.201 7.75 2.5 6.766 2.5 5.25 2.5 2.31 4.863 0 8 0s5.5 2.31 5.5 5.25c0 1.516-.701 2.5-1.328 3.259-.095.115-.184.22-.268.32-.106.122-.202.223-.313.331-.503.562-.739.995-.739 1.59a.75.75 0 0 1-1.5 0c0-.641.211-1.215.798-1.876a8.46 8.46 0 0 1 .226-.275c.16-.183.318-.354.482-.552.414-.5.727-1.06.727-1.797 0-2.06-1.637-3.75-4-3.75ZM6 15.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z",
        ),
        BlockQuoteKind::Important => (
            "Important",
            "8250DF",
            "M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0 1 14.25 13H8.06l-2.573 2.573A1.458 1.458 0 0 1 3 14.543V13H1.75A1.75 1.75 0 0 1 0 11.25Zm1.75-.25a.25.25 0 0 0-.25.25v9.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h6.5a.25.25 0 0 0 .25-.25v-9.5a.25.25 0 0 0-.25-.25Z",
        ),
        BlockQuoteKind::Warning => (
            "Warning",
            "9A6700",
            "M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z",
        ),
        BlockQuoteKind::Caution => (
            "Caution",
            "CF222E",
            "M4.47.22A.749.749 0 0 1 5 0h6c.199 0 .389.079.53.22l4.25 4.25c.141.14.22.331.22.53v6a.749.749 0 0 1-.22.53l-4.25 4.25A.749.749 0 0 1 11 16H5a.749.749 0 0 1-.53-.22L.22 11.53A.749.749 0 0 1 0 11V5c0-.199.079-.389.22-.53Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
        ),
    }
}

/// 提示块图标 SVG（16×16，填充色即类型强调色）；由 `image_run` 转成 PNG + 矢量双份。
fn alert_icon_svg(kind: BlockQuoteKind) -> String {
    let (_, color, path) = alert_meta(kind);
    format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\" width=\"16\" height=\"16\"><path fill=\"#{}\" d=\"{}\"/></svg>",
        color, path
    )
}

/// A4（11906×16838 twips）扣掉上下各 1 英寸页边距后的正文区高度，估算分页用。
const PAGE_CONTENT_H: f64 = 13958.0;
/// 正文区宽度（11906 - 2×1440），也正好是 TOC 条目右对齐制表位的位置（9026）。
const PAGE_CONTENT_W: f64 = 9026.0;

/// 目录条目：级别、纯文字、**估算**页码。
#[derive(Clone)]
struct TocEntry {
    level: u32,
    text: String,
    page: u32,
}

/// 估算用的翻页光标：按 twips 累加，越过正文区高度就进位到下一页。
struct PageCursor {
    used: f64,
    page: u32,
}

impl PageCursor {
    fn new() -> Self {
        Self { used: 0.0, page: 1 }
    }

    /// 累加一个块的高度；`used` 只保留「当前页里的余量」，跨页由循环逐页扣减。
    fn advance(&mut self, h: f64) {
        self.used += h;
        while self.used >= PAGE_CONTENT_H {
            self.used -= PAGE_CONTENT_H;
            self.page += 1;
        }
    }
}

/// 粗略字宽（em）：ASCII 记 0.55，汉字/全角记 1.0。只服务于折行估算，不求精确。
fn text_em(s: &str) -> f64 {
    s.chars().map(|c| if c.is_ascii() { 0.55 } else { 1.0 }).sum()
}

/// 按每行 `em_per_line` 个 em 折行后的行数（`\n` 处强制换行，空串也算 1 行）。
fn line_count(s: &str, em_per_line: f64) -> f64 {
    s.split('\n')
        .map(|l| (text_em(l) / em_per_line).ceil().max(1.0))
        .sum::<f64>()
        .max(1.0)
}

/// 预扫描全文：按文档顺序收集标题，并**估算**每个标题落在第几页。
///
/// 一次遍历干两件事，因为两者都要走同一条事件流：
///   1. 标题文字 —— 让 `toc_field()` 能预先写出域结果（标题 + 指向 `_Toc` 书签的超链接），
///      否则不生成 `settings.xml` 时目录位置一片空白，必须手动 F9；
///   2. 估算页码 —— 每个块折算成 twips 高度（行数 × 行高 + 段间距），从第 1 页累加，
///      越过正文区高度就翻页。思路与 notemark 的 `collectToc()` 一致。
///
/// 估算的精度只够给一个「初值」：真实分页还取决于字体度量、表格跨页、图片实际高度、
/// 分页符等。数字写进 `PAGEREF` 域的**结果**里，用户按 F9 后 Word 会用真实排版覆盖它。
///
/// 计数口径必须与渲染阶段一致：只收 `level <= DocxLayout.toc.maxLevel` 的标题，
/// 两处都用同一个条件，书签序号才对得上。
fn heading_level(level: HeadingLevel) -> u32 {
    match level {
        HeadingLevel::H1 => 1,
        HeadingLevel::H2 => 2,
        HeadingLevel::H3 => 3,
        HeadingLevel::H4 => 4,
        HeadingLevel::H5 => 5,
        HeadingLevel::H6 => 6,
    }
}

/// 把 `==高亮==` / `^上标^` / `~下标~` 预处理成 `<mark>` / `<sup>` / `<sub>`。
///
/// pulldown-cmark 0.13 没有高亮位，且它的上下标规则要求标记前是空白/标点
/// （`E=mc^2^` 这种紧贴写法识别不了）。统一在这里转成行内 HTML，走
/// `apply_html_inline_tag` 映射，预览与 Word 的语义就完全一致。
/// 围栏代码块、行内代码、`$…$` 数学公式原样跳过。
fn inline_markers_to_html(md: &str) -> String {
    let mut out = String::with_capacity(md.len() + 16);
    let mut fence: Option<char> = None;
    let mut math_block = false;
    for line in md.split_inclusive('\n') {
        let trimmed = line.trim();
        // `$$` 块公式：内部 `^`/`~`/`==` 都是 LaTeX，不能改写
        if math_block {
            out.push_str(line);
            if trimmed.ends_with("$$") {
                math_block = false;
            }
            continue;
        }
        if trimmed.starts_with("$$") {
            out.push_str(line);
            math_block = !trimmed[2..].ends_with("$$");
            continue;
        }
        let trimmed_start = line.trim_start();
        let marker = trimmed_start.chars().next().and_then(|c| {
            if c != '`' && c != '~' {
                return None;
            }
            let n = trimmed_start.chars().take_while(|x| *x == c).count();
            (n >= 3).then_some(c)
        });
        if let Some(open) = fence {
            out.push_str(line);
            if trimmed_start.chars().take_while(|c| *c == open).count() >= 3 {
                fence = None;
            }
            continue;
        }
        if let Some(c) = marker {
            fence = Some(c);
            out.push_str(line);
            continue;
        }
        out.push_str(&convert_inline_markers_line(line));
    }
    out
}

fn convert_inline_markers_line(line: &str) -> String {
    let mut out = String::with_capacity(line.len());
    let mut i = 0usize;
    while i < line.len() {
        let rest = &line[i..];
        let c = rest.chars().next().unwrap();
        if c == '`' {
            let run = rest.chars().take_while(|x| *x == '`').count();
            let marker = "`".repeat(run);
            if let Some(rel) = rest[run..].find(&marker) {
                let end = i + run + rel + run;
                out.push_str(&line[i..end]);
                i = end;
            } else {
                out.push_str(&line[i..i + run]);
                i += run;
            }
            continue;
        }
        // `$…$` / `$$…$$`：数学公式里的 `^`、`~`、`==` 不能改写
        if c == '$' {
            let dollar_run = if rest.starts_with("$$") { 2 } else { 1 };
            let marker = "$".repeat(dollar_run);
            if let Some(rel) = rest[dollar_run..].find(&marker) {
                let end = i + dollar_run + rel + dollar_run;
                out.push_str(&line[i..end]);
                i = end;
                continue;
            }
            out.push(c);
            i += 1;
            continue;
        }
        if c == '\\' {
            out.push(c);
            i += 1;
            if let Some(n) = line[i..].chars().next() {
                out.push(n);
                i += n.len_utf8();
            }
            continue;
        }
        // HTML 标签 / 裸 URL / Markdown 链接目标里的 `==`、`^`、`~` 不能改写
        if c == '<' {
            if let Some(rel) = rest.find('>') {
                out.push_str(&rest[..=rel]);
                i += rel + 1;
                continue;
            }
        }
        if rest.starts_with("http://") || rest.starts_with("https://") {
            let end = rest
                .find(|c: char| c.is_whitespace() || matches!(c, ')' | ']' | '>' | '"' | '\''))
                .unwrap_or(rest.len());
            out.push_str(&rest[..end]);
            i += end;
            continue;
        }
        if rest.starts_with("](") {
            if let Some(rel) = rest.find(')') {
                out.push_str(&rest[..=rel]);
                i += rel + 1;
                continue;
            }
        }
        // `~~删除线~~` 不当下标处理
        if rest.starts_with("~~") {
            out.push_str("~~");
            i += 2;
            continue;
        }
        // `1~5`、`0~20` 这类数字区间不当下标
        let prev_digit = line[..i].chars().next_back().is_some_and(|c| c.is_ascii_digit());
        let (marker, open, close) = if rest.starts_with("==") {
            ("==", "<mark>", "</mark>")
        } else if rest.starts_with('^') {
            ("^", "<sup>", "</sup>")
        } else if rest.starts_with('~') && !prev_digit {
            ("~", "<sub>", "</sub>")
        } else {
            out.push(c);
            i += c.len_utf8();
            continue;
        };
        if let Some(rel) = rest[marker.len()..].find(marker) {
            let content = &rest[marker.len()..marker.len() + rel];
            if valid_inline_marker_content(content, marker) {
                out.push_str(open);
                out.push_str(content);
                out.push_str(close);
                i += marker.len() + rel + marker.len();
                continue;
            }
        }
        out.push(c);
        i += c.len_utf8();
    }
    out
}

/// 上下标内容约束：只接受短 ASCII（`2`、`i`、`n-1`、`max` 等）。
///
/// 单波浪线在中文文档里常被当区间号用（`64K~512K`、`0~20轮`），若不加约束会把
/// 整段区间误当 `<sub>`；长度/字符集过滤后即可与真正的 `H~2~O` 区分。
/// 上下标内容里禁止出现的字符：空白、中英文标点、括号、Markdown / 代码标记。
///
/// 与前端 `markdownRenderer.ts` 的 `MARKER_FORBIDDEN` 同口径：
/// - `64K~512K、0~20` 里的顿号会阻断跨区间配对，`512K、0` 不再被吞成下标；
/// - `^` 禁止 `[` `]`，避免孤立 `^` 把 `[^1]` 脚注引用卷进上标。
fn is_marker_forbidden(c: char) -> bool {
    c.is_whitespace()
        || matches!(
            c,
            '、' | '，'
                | '。'
                | '；'
                | '：'
                | '！'
                | '？'
                | '…'
                | '·'
                | '—'
                | '－'
                | '“'
                | '”'
                | '‘'
                | '’'
                | '（'
                | '）'
                | '【'
                | '】'
                | '《'
                | '》'
                | '〈'
                | '〉'
                | '「'
                | '」'
                | '『'
                | '』'
                | '['
                | ']'
                | '('
                | ')'
                | '{'
                | '}'
                | '<'
                | '>'
                | '"'
                | '\''
                | '`'
                | '$'
                | '*'
                | '_'
                | '^'
                | '='
                | '~'
                | '\\'
                | '/'
                | '|'
                | ','
                | ';'
                | ':'
                | '!'
                | '?'
        )
}

fn valid_inline_marker_content(content: &str, marker: &str) -> bool {
    if content.trim().is_empty() || content != content.trim() {
        return false;
    }
    match marker {
        // 高亮内容不限字符（中文/空格/标点都允许），只限制长度，避免跨段乱配
        "==" => content.chars().count() <= 64,
        // 上标：中文也允许，但禁止标点/括号/标记字符，避免吞掉正文与脚注引用
        "^" => content.chars().count() <= 32 && !content.chars().any(is_marker_forbidden),
        // 下标：更短，且拒绝 `64K~512K` 这类「数字+单位」区间
        "~" => {
            if content.chars().count() > 8 || content.chars().any(is_marker_forbidden) {
                return false;
            }
            let mut chars = content.chars();
            let starts_digit = chars.next().is_some_and(|c| c.is_ascii_digit());
            let rest: String = chars.collect();
            !(starts_digit && !rest.is_empty() && rest.chars().all(|c| c.is_ascii_alphabetic()))
        }
        _ => false,
    }
}

/// 预扫描标题（仅用于计算目录条目数与书签顺序）。
fn collect_toc_headings(md: &str, opts: &Options, m: &Metrics) -> Vec<(u32, String)> {
    let max = m.layout.toc_max_level();
    let mut out: Vec<(u32, String)> = Vec::new();
    let mut heading: Option<(u32, String)> = None;
    for ev in Parser::new_ext(md, opts.clone()) {
        match ev {
            Event::Start(Tag::Heading { level, .. }) => {
                heading = Some((heading_level(level), String::new()));
            }
            Event::End(TagEnd::Heading(_)) => {
                if let Some((lv, text)) = heading.take() {
                    if lv <= max {
                        out.push((lv, html_plain_text(&text)));
                    }
                }
            }
            Event::Text(t)
            | Event::Code(t)
            | Event::InlineHtml(t)
            | Event::InlineMath(t)
            | Event::DisplayMath(t) => {
                if let Some((_, s)) = heading.as_mut() {
                    s.push_str(&t);
                }
            }
            Event::SoftBreak | Event::HardBreak => {
                if let Some((_, s)) = heading.as_mut() {
                    s.push(' ');
                }
            }
            _ => {}
        }
    }
    out
}

/// 目录块自身的高度（twips）：标题行 + 标题后距 + 条目行 + 条目间距。
/// 它必须计入页码估算，否则 `[toc]` 放在开头时，第一个正文标题会被算成第 1 页。
fn toc_block_height(m: &Metrics, entries: usize) -> f64 {
    let toc = &m.layout.toc;
    let heading_line = m.body_pt * toc.heading_scale * 1.3 * 20.0;
    let entry_line = m.body_pt * toc.line_height * 20.0;
    let heading_after = m.em_twips(toc.heading_after_em) as f64;
    let entry_gap = m.em_twips(toc.entry_gap_em) as f64;
    heading_line
        + heading_after
        + entries as f64 * entry_line
        + entries.saturating_sub(1) as f64 * entry_gap
}

/// 预扫描全文：收集标题并**估算**每个标题落在第几页。
///
/// 两遍扫描：第一遍只数标题，得到目录块自身高度；第二遍按块高累加页码。
/// 页码只是「打开即可见」的初值，用户按 F9 后 Word 会用真实排版覆盖。
fn collect_toc(md: &str, opts: &Options, m: &Metrics) -> Vec<TocEntry> {
    let headings = collect_toc_headings(md, opts, m);
    let toc_height = toc_block_height(m, headings.len());
    let max = m.layout.toc_max_level();
    let em = m.body_pt * 20.0; // 1em = 正文字号（twips）
    let body_line = em * m.line_em(m.line); // CSS 行高（w:line/200，不是 /240）
    let em_per_line = (PAGE_CONTENT_W / em).max(1.0);
    let code_line = em * m.layout.code.scale * m.line_em(m.line);
    let paragraph_before = m.em_twips(m.layout.paragraph.before_em) as f64;

    let mut cur = PageCursor::new();
    let mut out: Vec<TocEntry> = Vec::new();
    let mut heading: Option<(u32, String)> = None;
    let mut para: Option<String> = None;
    let mut code: Option<String> = None;
    let mut in_table = false;
    let mut table_rows = 0usize;
    let mut seen_block = false;
    // 表格后的 gap 已经承担间距，下一个块不再叠加段前（与渲染阶段一致）
    let mut suppress_next = false;

    for ev in Parser::new_ext(md, opts.clone()) {
        match ev {
            Event::Start(Tag::Heading { level, .. }) => {
                heading = Some((heading_level(level), String::new()));
            }
            Event::End(TagEnd::Heading(_)) => {
                if let Some((lv, text)) = heading.take() {
                    let before = if seen_block && !suppress_next {
                        m.em_twips(m.layout.heading_before_em(lv)) as f64
                    } else {
                        0.0
                    };
                    suppress_next = false;
                    cur.advance(before);
                    seen_block = true;
                    // 页码取标题**起始**位置：标题被挤到下一页时，目录也该指下一页
                    let page = cur.page;
                    if lv <= max {
                        out.push(TocEntry { level: lv, text: html_plain_text(&text), page });
                    }
                    let pt = m.body_pt * m.layout.heading_scale(lv);
                    let per_line = (PAGE_CONTENT_W / (pt * 20.0)).max(1.0);
                    cur.advance(line_count(&text, per_line) * pt * 1.3 * 20.0);
                }
            }
            Event::Start(Tag::Paragraph) => {
                if !in_table {
                    para = Some(String::new());
                }
            }
            Event::End(TagEnd::Paragraph) => {
                if let Some(t) = para.take() {
                    if is_toc_placeholder(&t) {
                        // 目录块自身也要占页：两遍扫描已经算出它的高度；再补它相对前文的段前。
                        if seen_block && !suppress_next {
                            cur.advance(paragraph_before);
                        }
                        cur.advance(toc_height);
                        seen_block = true;
                        suppress_next = false;
                    } else {
                        if seen_block && !suppress_next {
                            cur.advance(paragraph_before);
                        }
                        suppress_next = false;
                        seen_block = true;
                        cur.advance(line_count(&t, em_per_line) * body_line);
                    }
                }
            }
            Event::Start(Tag::CodeBlock(_)) => {
                code = Some(String::new());
            }
            Event::End(TagEnd::CodeBlock) => {
                if let Some(t) = code.take() {
                    if seen_block && !suppress_next {
                        cur.advance(m.em_twips(m.layout.code.before_em) as f64);
                    }
                    suppress_next = false;
                    seen_block = true;
                    let rows = t.split('\n').count().max(1) as f64;
                    cur.advance(rows * code_line);
                }
            }
            Event::Start(Tag::Table(_)) => {
                in_table = true;
                table_rows = 0;
            }
            Event::End(TagEnd::TableRow) => table_rows += 1,
            Event::End(TagEnd::Table) => {
                in_table = false;
                seen_block = true;
                // 每行按两行正文估（表头/窄列常折行）+ 表格后的间隔
                cur.advance(
                    table_rows.max(1) as f64 * 2.0 * body_line
                        + m.em_twips(m.layout.table.gap_em) as f64,
                );
                suppress_next = true;
            }
            Event::Html(h) => {
                if is_toc_placeholder(&h) {
                    if seen_block && !suppress_next {
                        cur.advance(paragraph_before);
                    }
                    cur.advance(toc_height);
                    seen_block = true;
                    suppress_next = false;
                } else if let Some((_, s)) = heading.as_mut() {
                    s.push_str(&h);
                } else if let Some(s) = para.as_mut() {
                    s.push_str(&h);
                }
            }
            Event::Text(t)
            | Event::Code(t)
            | Event::InlineHtml(t)
            | Event::InlineMath(t)
            | Event::DisplayMath(t) => {
                if let Some((_, s)) = heading.as_mut() {
                    s.push_str(&t);
                } else if let Some(s) = para.as_mut() {
                    s.push_str(&t);
                } else if let Some(s) = code.as_mut() {
                    s.push_str(&t);
                }
            }
            Event::SoftBreak | Event::HardBreak => {
                if let Some((_, s)) = heading.as_mut() {
                    s.push(' ');
                } else if let Some(s) = para.as_mut() {
                    s.push('\n');
                }
            }
            // 图片按三分之一页估（导出时宽度统一贴正文区，高度随比例浮动）
            Event::Start(Tag::Image { .. }) => cur.advance(PAGE_CONTENT_H / 3.0),
            Event::Rule => {
                if seen_block {
                    cur.advance(m.em_twips(m.layout.rule.before_em) as f64);
                }
                seen_block = true;
                cur.advance(20.0 + m.em_twips(m.layout.rule.after_em) as f64);
            }
            _ => {}
        }
    }
    out
}

// ===================== Word 版式规范（DOCX layout） =====================
//
// 与前端 `src/lib/docxLayout.ts` 的 `DocxLayout` 一一对应。原则：
//   · 主题只传颜色/字体/代码高亮，**版式值不跟主题走**；
//   · 段距统一走「段前」，段后为 0，避免 Word 像 CSS 那样把段前段后相加；
//   · Rust 侧不再另有 `HEADING_EM`、固定 1em/0.5em、写死引用色。
//
// 所有 `em` 都是相对正文字号；`pt` 用于边框宽度。

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DocxFonts {
    pub latin: String,
    pub east_asia: String,
    /// 标题西文字体；空串 = 跟随正文（兼容旧调用方）
    pub heading_latin: String,
    /// 标题东亚字体；空串 = 跟随正文
    pub heading_east_asia: String,
    pub mono: String,
}

impl Default for DocxFonts {
    fn default() -> Self {
        Self {
            latin: String::new(),
            east_asia: String::new(),
            heading_latin: String::new(),
            heading_east_asia: String::new(),
            mono: String::new(),
        }
    }
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DocxBodyLayout {
    /// 正文字号（pt）；规范基准 11pt
    pub size_pt: f64,
    /// 行高倍数；规范基准 1.5
    pub line_height: f64,
    /// true = 正文字号跟随设置里的「预览字号」；false = 固定用 size_pt
    pub follow_preview_size: bool,
    /// `both` = 两端对齐，其他值按左对齐处理
    pub align: String,
    pub first_line_indent_em: f64,
}

impl Default for DocxBodyLayout {
    fn default() -> Self {
        Self {
            size_pt: 11.0,
            line_height: 1.5,
            follow_preview_size: false,
            align: "both".to_string(),
            first_line_indent_em: 0.0,
        }
    }
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DocxHeadingsLayout {
    pub scales: Vec<f64>,
    pub before_em: Vec<f64>,
    pub after_em: Vec<f64>,
    pub bold: bool,
}

impl Default for DocxHeadingsLayout {
    fn default() -> Self {
        Self {
            // 规范 18/15/13/12/11/11pt ÷ 11pt
            scales: vec![18.0 / 11.0, 15.0 / 11.0, 13.0 / 11.0, 12.0 / 11.0, 1.0, 1.0],
            // 规范段前 18/12/10/8/6/6pt ÷ 11pt
            before_em: vec![18.0 / 11.0, 12.0 / 11.0, 10.0 / 11.0, 8.0 / 11.0, 6.0 / 11.0, 6.0 / 11.0],
            after_em: vec![0.0; 6],
            bold: true,
        }
    }
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DocxParagraphLayout {
    pub before_em: f64,
}

impl Default for DocxParagraphLayout {
    fn default() -> Self {
        // 规范段前 0、段后 6pt；只走段前，所以取 6pt/11pt
        Self { before_em: 6.0 / 11.0 }
    }
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DocxListLayout {
    pub before_em: f64,
    pub item_gap_em: f64,
    pub indent_em: f64,
    pub hanging_em: f64,
}

impl Default for DocxListLayout {
    fn default() -> Self {
        Self {
            before_em: 6.0 / 11.0,
            item_gap_em: 3.0 / 11.0,
            // 规范 0.74cm 缩进 / 0.37cm 悬挂（cm → pt → em，基准 11pt）
            indent_em: 20.976 / 11.0,
            hanging_em: 10.488 / 11.0,
        }
    }
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DocxQuoteLayout {
    /// 引用字号相对正文的倍数；规范 10.5pt
    pub scale: f64,
    /// 引用行距（Word 口径：1.0 = 单倍，240 = 单倍）；规范用单倍行距
    pub line_height: f64,
    pub padding_x_em: f64,
    pub padding_y_em: f64,
    pub paragraph_gap_em: f64,
    pub border_pt: f64,
    /// 空串 = 跟随正文文字色
    pub text_color: String,
}

impl Default for DocxQuoteLayout {
    fn default() -> Self {
        Self {
            scale: 10.5 / 11.0,
            line_height: 1.0,
            // 四向 0.4cm → em（基准 11pt）
            padding_x_em: 11.339 / 11.0,
            padding_y_em: 11.339 / 11.0,
            paragraph_gap_em: 6.0 / 11.0,
            border_pt: 3.0,
            text_color: String::new(),
        }
    }
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DocxCodeLayout {
    pub scale: f64,
    pub before_em: f64,
    pub padding_x_em: f64,
    pub padding_y_em: f64,
}

impl Default for DocxCodeLayout {
    fn default() -> Self {
        Self {
            // 规范 9pt / 11pt；0.2cm 内边距 → em
            scale: 10.0 / 11.0,
            before_em: 6.0 / 11.0,
            padding_x_em: 5.669 / 11.0,
            padding_y_em: 5.669 / 11.0,
        }
    }
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DocxTableLayout {
    /// 表格字号相对正文的倍数；规范 10pt
    pub scale: f64,
    pub gap_em: f64,
    pub cell_margin_x_em: f64,
    pub cell_margin_y_em: f64,
    pub border_pt: f64,
}

impl Default for DocxTableLayout {
    fn default() -> Self {
        Self {
            scale: 10.0 / 11.0,
            gap_em: 6.0 / 11.0,
            // 左右 0.2cm、上下 0.1cm → em
            cell_margin_x_em: 5.669 / 11.0,
            cell_margin_y_em: 2.835 / 11.0,
            border_pt: 0.5,
        }
    }
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DocxRuleLayout {
    pub before_em: f64,
    pub after_em: f64,
}

impl Default for DocxRuleLayout {
    fn default() -> Self {
        Self { before_em: 0.5, after_em: 0.5 }
    }
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DocxTocLayout {
    pub max_level: u32,
    pub line_height: f64,
    pub entry_gap_em: f64,
    pub heading_scale: f64,
    pub heading_after_em: f64,
}

impl Default for DocxTocLayout {
    fn default() -> Self {
        Self {
            max_level: 6,
            line_height: 1.15,
            entry_gap_em: 3.0 / 11.0,
            heading_scale: 13.0 / 11.0,
            heading_after_em: 6.0 / 11.0,
        }
    }
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DocxLayout {
    pub fonts: DocxFonts,
    pub body: DocxBodyLayout,
    pub headings: DocxHeadingsLayout,
    pub paragraph: DocxParagraphLayout,
    pub list: DocxListLayout,
    pub quote: DocxQuoteLayout,
    pub code: DocxCodeLayout,
    pub table: DocxTableLayout,
    pub rule: DocxRuleLayout,
    pub toc: DocxTocLayout,
}

impl Default for DocxLayout {
    fn default() -> Self {
        Self {
            fonts: DocxFonts::default(),
            body: DocxBodyLayout::default(),
            headings: DocxHeadingsLayout::default(),
            paragraph: DocxParagraphLayout::default(),
            list: DocxListLayout::default(),
            quote: DocxQuoteLayout::default(),
            code: DocxCodeLayout::default(),
            table: DocxTableLayout::default(),
            rule: DocxRuleLayout::default(),
            toc: DocxTocLayout::default(),
        }
    }
}

impl DocxLayout {
    fn toc_max_level(&self) -> u32 {
        self.toc.max_level.clamp(1, 6)
    }

    fn heading_scale(&self, level: u32) -> f64 {
        self.headings
            .scales
            .get((level.saturating_sub(1)) as usize)
            .copied()
            .unwrap_or(1.0)
            .clamp(0.5, 4.0)
    }

    fn heading_before_em(&self, level: u32) -> f64 {
        self.headings
            .before_em
            .get((level.saturating_sub(1)) as usize)
            .copied()
            .unwrap_or(0.6)
            .max(0.0)
    }
}

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
    /// 目录标题文案（TOC 域上方那行字），跟随界面语言，如「目录」/「Contents」/「目次」。
    /// 前端用 `reader.toc` 词条传入；缺省回退「目录」，兼容旧的调用方。
    #[serde(default)]
    pub toc_title: Option<String>,
    /// Word 版式规范；缺省使用内置默认值（见 `DocxLayout`），兼容旧调用方。
    #[serde(default)]
    pub layout: Option<DocxLayout>,
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
#[derive(Debug, Clone)]
struct Metrics {
    /// 正文字号（磅）
    body_pt: f64,
    /// 正文字号（半磅，`w:sz`）
    body_sz: u32,
    /// 正文行距（`w:line`，lineRule=auto；240 = 单倍）
    line: u32,
    /// Word 版式规范（唯一事实源）
    layout: DocxLayout,
    /// 解析后的拉丁 / 东亚 / 等宽字体名（主题只给 CSS 栈，这里拆成 Word 可用的具体字体）
    font_latin: String,
    font_east_asia: String,
    /// 标题字体；与正文分开，用于复刻 Word 的「标题用 Light 字族」默认
    font_heading_latin: String,
    font_heading_east_asia: String,
    font_mono: String,
}

impl Metrics {
    /// Word 的「单倍行距」≈ 1.2 倍字号（随字体度量浮动）；CSS 的 line-height 是「倍数 × 字号」，
    /// 因此换算成 `w:line` 需要除以 1.2。
    const WORD_SINGLE: f64 = 1.2;

    /// 脚注文字相对正文字号的倍数（Word 惯例：比正文小一号）。
    /// 正文与脚注**共用**这一个常量：`styles.xml` 的 `FootnoteText` 与脚注内各段/各 run 的
    /// 显式字号都由它推导，否则脚注里的列表项会继承 `Normal` 的正文字号（比脚注正文大一圈）。
    const FOOTNOTE_RATIO: f64 = 0.83;

    fn new(font_size_px: Option<f64>, line_height: Option<f64>, layout: DocxLayout, theme: &DocxTheme) -> Self {
        // 字号：规范默认固定 11pt；`followPreviewSize = true` 时才跟随「预览字号」。
        let layout_pt = layout.body.size_pt;
        let body_pt = if layout.body.follow_preview_size || layout_pt <= 0.0 {
            font_size_px.unwrap_or(16.0).clamp(4.0, 200.0) * 0.75
        } else {
            layout_pt.clamp(4.0, 200.0)
        };
        let body_sz = (body_pt * 2.0).round().max(2.0) as u32;
        // 行距：规范里的「1.5 倍」按 Word 口径（240=单倍 → 1.5 倍=360），不是 CSS line-height。
        // layout 没给时退回设置里的「预览行高」（CSS 口径，走 line_of 换算）。
        let word_line = if layout.body.line_height >= 1.0 {
            Some((240.0 * layout.body.line_height).round())
        } else {
            None
        };
        let fallback_latin = first_family(&theme.font);
        let font_latin = if layout.fonts.latin.trim().is_empty() {
            fallback_latin.clone()
        } else {
            layout.fonts.latin.trim().to_string()
        };
        let font_east_asia = if layout.fonts.east_asia.trim().is_empty() {
            font_latin.clone()
        } else {
            layout.fonts.east_asia.trim().to_string()
        };
        let font_mono = if layout.fonts.mono.trim().is_empty() {
            first_family(&theme.mono_font)
        } else {
            layout.fonts.mono.trim().to_string()
        };
        // 标题字体：空串字典回退到正文（旧调用方保持原来的「标题与正文同族」行为）
        let font_heading_latin = if layout.fonts.heading_latin.trim().is_empty() {
            font_latin.clone()
        } else {
            layout.fonts.heading_latin.trim().to_string()
        };
        let font_heading_east_asia = if layout.fonts.heading_east_asia.trim().is_empty() {
            font_east_asia.clone()
        } else {
            layout.fonts.heading_east_asia.trim().to_string()
        };
        let mut m = Metrics {
            body_pt,
            body_sz,
            line: 240,
            layout,
            font_latin,
            font_east_asia,
            font_heading_latin,
            font_heading_east_asia,
            font_mono,
        };
        m.line = match word_line {
            Some(v) => v.clamp(240.0, 240.0 * 6.0) as u32,
            None => m.line_of(line_height.unwrap_or(1.8).clamp(1.0, 5.0)),
        };
        m
    }

    /// 以 Word 的 auto 行距值反推 CSS 行高：`w:line` 的 240 = 单倍 ≈ 1.2×字号，
    /// 所以实际行高 = 字号 × `w:line / 200`（不是 `/240`）。
    fn line_em(&self, line: u32) -> f64 {
        line as f64 / 200.0
    }

    /// A4 减去左右各 2.54cm 页边距后的正文宽度（twips），也是目录点线制表位。
    fn text_width_twips(&self) -> u32 {
        PAGE_CONTENT_W as u32
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
fn font_table_xml(m: &Metrics) -> String {
    let mut s = String::from(
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><w:fonts xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">",
    );
    let charset = |f: &str| if is_cjk_family(f) { "86" } else { "00" };
    let latin = &m.font_latin;
    let east_asia = &m.font_east_asia;
    let heading_latin = &m.font_heading_latin;
    let heading_east_asia = &m.font_heading_east_asia;
    let mono = &m.font_mono;
    // 拉丁正文：一条链同时覆盖 Windows / macOS / Linux 与拉丁兜底
    s.push_str(&format!(
        "<w:font w:name=\"{}\"><w:altName w:val=\"Microsoft YaHei, PingFang SC, Noto Sans SC, Segoe UI, Arial\"/><w:charset w:val=\"{}\"/><w:family w:val=\"swiss\"/><w:pitch w:val=\"variable\"/></w:font>",
        esc(latin),
        charset(latin)
    ));
    // 东亚正文：与拉丁分开声明；中文文档必须有一个明确的 CJK 回退
    if !east_asia.eq_ignore_ascii_case(latin) {
        s.push_str(&format!(
            "<w:font w:name=\"{}\"><w:altName w:val=\"Microsoft YaHei, PingFang SC, Noto Sans SC, SimSun\"/><w:charset w:val=\"{}\"/><w:family w:val=\"swiss\"/><w:pitch w:val=\"variable\"/></w:font>",
            esc(east_asia),
            charset(east_asia)
        ));
    }
    // 标题西文：Word 默认的 Calibri Light / 等线 Light 与正文字体不同；
    // 缺失时回退到 Arial / Helvetica Neue（macOS），而不是继续用正文的 Calibri。
    if !heading_latin.eq_ignore_ascii_case(latin)
        && !heading_latin.eq_ignore_ascii_case(east_asia)
        && !heading_latin.eq_ignore_ascii_case(mono)
    {
        s.push_str(&format!(
            "<w:font w:name=\"{}\"><w:altName w:val=\"Calibri, Arial, Helvetica Neue, Liberation Sans\"/><w:charset w:val=\"{}\"/><w:family w:val=\"swiss\"/><w:pitch w:val=\"variable\"/></w:font>",
            esc(heading_latin),
            charset(heading_latin)
        ));
    }
    // 标题东亚：等线 Light 缺失时优先落到微软雅黑 / 苹方 / 思源黑体
    if !heading_east_asia.eq_ignore_ascii_case(latin)
        && !heading_east_asia.eq_ignore_ascii_case(east_asia)
        && !heading_east_asia.eq_ignore_ascii_case(heading_latin)
        && !heading_east_asia.eq_ignore_ascii_case(mono)
    {
        s.push_str(&format!(
            "<w:font w:name=\"{}\"><w:altName w:val=\"Microsoft YaHei, PingFang SC, Noto Sans SC, SimHei, SimSun\"/><w:charset w:val=\"{}\"/><w:family w:val=\"swiss\"/><w:pitch w:val=\"variable\"/></w:font>",
            esc(heading_east_asia),
            charset(heading_east_asia)
        ));
    }
    // 等宽字体（与正文/标题同名则跳过——fontTable 以 name 为键，不可重复）
    if !mono.eq_ignore_ascii_case(latin)
        && !mono.eq_ignore_ascii_case(east_asia)
        && !mono.eq_ignore_ascii_case(heading_latin)
        && !mono.eq_ignore_ascii_case(heading_east_asia)
    {
        s.push_str(&format!(
            "<w:font w:name=\"{}\"><w:altName w:val=\"Cascadia Mono, Consolas, Courier New, DejaVu Sans Mono\"/><w:charset w:val=\"{}\"/><w:family w:val=\"modern\"/><w:pitch w:val=\"fixed\"/></w:font>",
            esc(mono),
            charset(mono)
        ));
    }
    // 任务列表勾选字形（☐ U+2610 / ☑ U+2611）在常见中日韩与拉丁字体里**没有字形**
    // （cmap 实测：MiSans / 微软雅黑 / 宋体 / Segoe UI 均无），只有符号字体才有，
    // 因此必须显式指定字体，并用替代名链覆盖 macOS / Linux（找不到主名称时才读取）
    if !latin.eq_ignore_ascii_case(TASK_GLYPH_FONT)
        && !east_asia.eq_ignore_ascii_case(TASK_GLYPH_FONT)
        && !mono.eq_ignore_ascii_case(TASK_GLYPH_FONT)
    {
        s.push_str(&format!(
            "<w:font w:name=\"{}\"><w:altName w:val=\"MS Gothic, Apple Symbols, Arial Unicode MS, Noto Sans Symbols 2, DejaVu Sans\"/><w:charset w:val=\"00\"/><w:family w:val=\"auto\"/><w:pitch w:val=\"variable\"/></w:font>",
            TASK_GLYPH_FONT
        ));
    }
    // 项目符号二/三级的 `◦ U+25E6` / `▪ U+25AA`（见 `BULLET_LEVELS`）：MiSans / 宋体等
    // 正文字体没有这两个字形，所以显式指定了微软雅黑；不装雅黑的机器（如英文版 Windows、
    // macOS）靠下面的替代名链落到自带这两个字形的符号字体上
    if !latin.eq_ignore_ascii_case(BULLET_GLYPH_FONT)
        && !east_asia.eq_ignore_ascii_case(BULLET_GLYPH_FONT)
        && !mono.eq_ignore_ascii_case(BULLET_GLYPH_FONT)
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

/// `<center>…</center>` 块 → 居中文字；不是 center 块时返回 `None`。
/// 预览里浏览器原生居中；Word 需要落成 `w:jc=center` 的段落，不能把标签当文本输出。
fn center_block_text(html: &str) -> Option<String> {
    let trimmed = html.trim();
    let lower = trimmed.to_ascii_lowercase();
    if !lower.starts_with("<center") || !lower.contains("</center>") {
        return None;
    }
    Some(html_plain_text(trimmed))
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
pub(crate) fn svg_to_png(data: &[u8]) -> Option<(Vec<u8>, f64, f64)> {
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
pub(crate) fn omml_of(tex: &str) -> Option<String> {
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
    /// 已渲染的列表项数量：第一项用列表段前，后续项用项间距
    items: usize,
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
    /// 正文里**已经出现过引用**的脚注 label。
    ///
    /// Word 要求 `w:footnoteReference` 的 id 与 `footnotes.xml` 里的定义一对一：同一个 id
    /// 被引用两次时，`document.xml` 出现重复 id，Word 打开即报「文件可能已经损坏」（实测）。
    /// 而 Markdown 允许同一个 `[^x]` 被引用多次（复制粘贴带脚注的段落就会遇到），
    /// `markdown-it-footnote` 在预览里也是照常支持。所以第二次及以后**不再生成脚注引用**，
    /// 降级为上标文字，保住「文件能打开」这条底线。
    footnote_ref_seen: std::collections::HashSet<String>,
    /// 脚注内部产生的超链接/图片关系（须写在 footnotes.xml.rels 里）
    footnote_rels: String,
    /// 代码块语法高亮（前端用预览同一份 highlight.js 结果算出，见 `CodeHighlights`）
    code_highlights: CodeHighlights,
    /// 目录条目：导出前预扫描全文得到的「级别 + 纯文字 + 估算页码」。
    /// TOC 域是惰性的（`settings.xml` 的 `updateFields` 会触发「域可能引用了其他文件」弹窗，
    /// 所以不生成 settings 部件），因此域结果必须在这里**预先写好**，打开即可见。
    toc_items: Vec<TocEntry>,
    /// 渲染阶段遇到的第几个标题（与 `toc_items` 下标一一对应，用于 `_Toc%09d` 书签名）
    heading_seq: usize,
    /// 是否已经输出过正文块：第一块的段前距必须为 0，不能凭空多出 1em。
    saw_block: bool,
    /// 表格/引用块后的 gap 段落已经提供的间距；下一个块不再叠加段前距。
    suppress_before: bool,
}

impl DocxBuilder {
    fn new(mut theme: DocxTheme, base_dir: Option<std::path::PathBuf>, remote_images: RemoteImages) -> Self {
        // 版式从主题里取出后由 Metrics 持有；Rust 侧不再自己维护标题比例/段距表。
        let layout = theme.layout.take().unwrap_or_default();
        let metrics = Metrics::new(theme.font_size_px, theme.line_height, layout, &theme);
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
            footnote_ref_seen: std::collections::HashSet::new(),
            footnote_rels: String::new(),
            code_highlights,
            toc_items: Vec::new(),
            heading_seq: 0,
            saw_block: false,
            suppress_before: false,
        }
    }

    // ---------- 段距折叠 ----------
    //
    // Word 的段前/段后是**相加**的，不像 CSS 会折叠。若沿用 `Normal after=1em` +
    // `Heading before=1.5em`，段间距会变成 2.5em，而预览只有 1.5em。
    // 因此正文所有段落的段后统一为 0，只由「下一个块的段前」决定间距；
    // 表格/引用块（它们本身不是段落）后面用 gap 段落承担间距，并抑制下一个块的段前，
    // gap 高度取「规范间距」与「下一个块段前」的较大值。

    fn block_before(&mut self, wanted: u32) -> u32 {
        let before = if !self.saw_block || self.suppress_before {
            0
        } else {
            wanted
        };
        self.saw_block = true;
        self.suppress_before = false;
        before
    }

    fn note_block(&mut self) {
        self.saw_block = true;
        self.suppress_before = false;
    }

    /// 表格/引用块本身没有段前距：在它们前面补一个 gap 段落。
    /// 如果上一个块也是表格/引用块，它后面的 gap 已经承担了间距，不再叠加。
    fn gap_before_table_like(&mut self) {
        if self.saw_block && !self.suppress_before {
            let gap = self.metrics.em_twips(self.metrics.layout.table.gap_em);
            self.body.push_str(&self.gap_paragraph_twips(gap));
        }
        self.note_block();
    }

    fn paragraph_before(&mut self) -> u32 {
        if self.in_footnote {
            return 0;
        }
        let em = if self.quote_depth > 0 {
            self.metrics.layout.quote.paragraph_gap_em
        } else {
            self.metrics.layout.paragraph.before_em
        };
        let wanted = self.metrics.em_twips(em);
        self.block_before(wanted)
    }

    fn heading_before(&mut self, level: u32) -> u32 {
        if self.in_footnote {
            return 0;
        }
        let wanted = self.metrics.em_twips(self.metrics.layout.heading_before_em(level));
        self.block_before(wanted)
    }

    fn code_before(&mut self) -> u32 {
        if self.in_footnote {
            return 0;
        }
        let wanted = self.metrics.em_twips(self.metrics.layout.code.before_em);
        self.block_before(wanted)
    }

    fn list_before(&mut self, first_item: bool) -> u32 {
        if self.in_footnote {
            return 0;
        }
        let em = if first_item {
            self.metrics.layout.list.before_em
        } else {
            self.metrics.layout.list.item_gap_em
        };
        let wanted = self.metrics.em_twips(em);
        self.block_before(wanted)
    }

    /// 表格/引用块后 gap 的高度：取规范间距与下一个块段前的较大值；
    /// 文档结束时为 0，只保留一个 1pt 的结构段落。
    fn gap_after_table(&mut self, iter: &mut EventIter) -> u32 {
        let next = Self::next_block_before(iter, &self.metrics);
        if next == 0 {
            0
        } else {
            self.metrics.em_twips(self.metrics.layout.table.gap_em).max(next)
        }
    }

    fn next_block_before(iter: &mut EventIter, m: &Metrics) -> u32 {
        let em = match iter.peek() {
            Some(Event::Start(Tag::Heading { level, .. })) => {
                let lv = match level {
                    HeadingLevel::H1 => 1,
                    HeadingLevel::H2 => 2,
                    HeadingLevel::H3 => 3,
                    HeadingLevel::H4 => 4,
                    HeadingLevel::H5 => 5,
                    HeadingLevel::H6 => 6,
                };
                m.layout.heading_before_em(lv)
            }
            Some(Event::Start(Tag::Paragraph)) => m.layout.paragraph.before_em,
            Some(Event::Start(Tag::CodeBlock(_))) => m.layout.code.before_em,
            Some(Event::Start(Tag::List(_))) => m.layout.list.before_em,
            Some(Event::Start(Tag::Table(_))) | Some(Event::Start(Tag::BlockQuote(_))) => {
                m.layout.table.gap_em
            }
            Some(Event::Html(h)) if is_toc_placeholder(h) => m.layout.paragraph.before_em,
            _ => 0.0,
        };
        m.em_twips(em)
    }

    // ---------- 文本/段落辅助 ----------

    /// 当前上下文的正文字号（半磅）：脚注内为脚注字号，否则为文档正文字号。
    /// 脚注里的一切相对倍数（行内代码 0.9em、段落字号）都基于它换算。
    fn base_sz(&self) -> u32 {
        if self.in_footnote { self.metrics.footnote_sz() } else { self.metrics.body_sz }
    }

    /// 基础字号下的 run 上属性（`w:rPr` 内容），供文本 run 与字形 run 复用
    ///
    /// **子元素必须按 ECMA-376 的 CT_RPr 顺序落地**：
    /// `rFonts → b → bCs → i → iCs → strike → color → sz → szCs → highlight → u → vertAlign`。
    /// 顺序写错（例如 `<w:sz/>` 排在 `<w:color/>` 前面）Word 会报「发现无法读取的内容」
    /// 并走一遍修复，内容其实没坏 —— 所以这里先分段拼，最后按顺序合并，不做「边判断边 push」。
    fn run_with(&self, text: &str, st: InlineState, mono: bool, color: Option<&str>, font: Option<&str>) -> String {
        let mut fonts = String::new();
        let mut weight = String::new();
        let mut color_xml = String::new();
        let mut size = String::new();
        let mut deco = String::new();

        if mono {
            let f = esc(&self.metrics.font_mono);
            fonts.push_str(&format!("<w:rFonts w:ascii=\"{}\" w:hAnsi=\"{}\" w:eastAsia=\"{}\" w:cs=\"{}\"/>", f, f, f, f));
            // 代码字号比例来自版式规范；基准字号在脚注里是脚注字号
            let sz = Metrics::sz_scale_from(self.base_sz(), self.metrics.layout.code.scale);
            size.push_str(&format!("<w:sz w:val=\"{0}\"/><w:szCs w:val=\"{0}\"/>", sz));
        } else if self.in_footnote {
            // 脚注正文里的普通 run 显式写小字号：脚注段落可能带 `ListParagraph` 等继承
            // `Normal`（正文字号）的样式，只靠 `FootnoteText` 样式继承会被它们盖掉
            let sz = self.base_sz();
            size.push_str(&format!("<w:sz w:val=\"{0}\"/><w:szCs w:val=\"{0}\"/>", sz));
        }
        if let Some(f) = font {
            // 显式字体（如任务列表勾选字形）只作用于 ascii/hAnsi/cs —— eastAsia 留给东亚字体，
            // 该字形本身是 BMP 符号、不含 CJK 上下文。
            let f = esc(f);
            let ea = esc(&self.metrics.font_east_asia);
            fonts.push_str(&format!("<w:rFonts w:ascii=\"{}\" w:hAnsi=\"{}\" w:eastAsia=\"{}\" w:cs=\"{}\"/>", f, f, ea, f));
        }

        if st.bold { weight.push_str("<w:b/><w:bCs/>"); }
        if st.italic { weight.push_str("<w:i/><w:iCs/>"); }
        if st.strike { weight.push_str("<w:strike/>"); }

        if st.link {
            color_xml.push_str(&format!("<w:color w:val=\"{}\"/>", esc(&self.theme.accent)));
        } else if let Some(c) = color {
            color_xml.push_str(&format!("<w:color w:val=\"{}\"/>", esc(c)));
        }

        if st.highlight { deco.push_str("<w:highlight w:val=\"yellow\"/>"); }
        // 链接既有主题色也有下划线；`st.underline` 单独标记的也走同一条
        if st.link || st.underline { deco.push_str("<w:u w:val=\"single\"/>"); }
        // 上/下标互斥（同时出现时上标优先，与浏览器一致的表现）
        if st.sup {
            deco.push_str("<w:vertAlign w:val=\"superscript\"/>");
        } else if st.sub {
            deco.push_str("<w:vertAlign w:val=\"subscript\"/>");
        }

        let rpr = format!("{fonts}{weight}{color_xml}{size}{deco}");
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
        let f = esc(&self.metrics.font_mono);
        let fill = esc(&self.theme.surface);
        let sz = Metrics::sz_scale_from(self.base_sz(), self.metrics.layout.code.scale);
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
        let before = self.paragraph_before();
        self.body.push_str(&format!(
            "<w:p><w:pPr><w:pStyle w:val=\"Normal\"/><w:spacing w:before=\"{}\" w:after=\"0\"/>{}</w:pPr>",
            before, jc
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

    fn p_start(&mut self, style: &str, num: Option<(u32, u32)>, before: u32) {
        self.p_start_ind(style, num, None, before);
    }

    /// `indent` = (left, hanging) twips；`before` = 段前 twips（段后恒为 0）
    fn p_start_ind(
        &mut self,
        style: &str,
        num: Option<(u32, u32)>,
        indent: Option<(u32, Option<u32>)>,
        before: u32,
    ) {
        let before = if self.in_footnote { 0 } else { before };
        let mut ppr = String::new();
        if !style.is_empty() {
            ppr.push_str(&format!("<w:pStyle w:val=\"{}\"/>", style));
        }
        if let Some((num_id, ilvl)) = num {
            ppr.push_str(&format!("<w:numPr><w:ilvl w:val=\"{}\"/><w:numId w:val=\"{}\"/></w:numPr>", ilvl, num_id));
        }
        // 段后恒为 0：间距只由「下一个块的段前」表达，避免 Word 把 before+after 相加。
        ppr.push_str(&format!("<w:spacing w:before=\"{}\" w:after=\"0\"/>", before));
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
            let sz = if style == "CodeBlock" {
                Metrics::sz_scale_from(self.metrics.footnote_sz(), self.metrics.layout.code.scale)
            } else {
                self.metrics.footnote_sz()
            };
            ppr.push_str(&format!("<w:rPr><w:sz w:val=\"{0}\"/><w:szCs w:val=\"{0}\"/></w:rPr>", sz));
        }
        self.body.push_str(&format!("<w:p><w:pPr>{}</w:pPr>", ppr));
    }

    fn p_end(&mut self) {
        self.body.push_str("</w:p>");
    }

    /// 提示块标题段落：图标 + 类型强调色 + 自定义标题。
    ///
    /// 预览里标题是 `display:flex` 的一行：16×16 octicon + 0.92em 粗体类型色文字。
    /// Word 侧用内嵌 SVG（`image_run` 会同时写矢量与 PNG 回退）复刻图标；字号取 Quote 样式
    /// 的 0.92 倍，标题段后距按预览的 0.35em 留白。
    fn alert_title_xml(&mut self, kind: BlockQuoteKind, title: &str) -> String {
        let (_, color, _) = alert_meta(kind);
        // Quote 样式字号 → 标题字号（预览 .md-alert-title 为 0.92em）
        let quote_sz = self.metrics.sz_scale(self.metrics.layout.quote.scale);
        let title_sz = Metrics::sz_scale_from(quote_sz, 0.92);
        let title_pt = title_sz as f64 / 2.0;

        let svg = alert_icon_svg(kind);
        let icon_url = format!(
            "data:image/svg+xml;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(svg.as_bytes())
        );
        // 图标与字号同高；w:position 下沉约 1.5pt，让方形图标与文字视觉居中
        let mut icon = self.image_run("", &icon_url, Some(SizeHint::Pt(title_pt)));
        if icon.starts_with("<w:r>") {
            icon = icon.replacen("<w:r>", "<w:r><w:rPr><w:position w:val=\"-3\"/></w:rPr>", 1);
        }
        // 图标与文字之间留 0.4em（预览 gap）：一个空格 + 1pt 字距
        let gap = format!(
            "<w:r><w:rPr><w:spacing w:val=\"20\"/><w:sz w:val=\"{0}\"/><w:szCs w:val=\"{0}\"/></w:rPr><w:t xml:space=\"preserve\"> </w:t></w:r>",
            title_sz
        );
        let title_run = format!(
            "<w:r><w:rPr><w:b/><w:bCs/><w:color w:val=\"{}\"/><w:sz w:val=\"{}\"/><w:szCs w:val=\"{}\"/></w:rPr><w:t xml:space=\"preserve\">{}</w:t></w:r>",
            color,
            title_sz,
            title_sz,
            esc(title)
        );
        let line = (240.0 * self.metrics.layout.quote.line_height).round().clamp(240.0, 1440.0) as u32;
        let after = self.metrics.em_twips(0.35);
        format!(
            "<w:p><w:pPr><w:pStyle w:val=\"Quote\"/><w:keepNext/><w:spacing w:before=\"0\" w:after=\"{}\" w:line=\"{}\" w:lineRule=\"auto\"/></w:pPr>{}{}{}</w:p>",
            after, line, icon, gap, title_run
        )
    }

    /// 引用块 → 单元格表格（`quote_table` 的内层实现）。
    ///
    /// 预览里的 `blockquote` 是**一个**容器：左边框与底色是连续的，内部多段落、嵌套引用、
    /// 列表都在这一个容器里。逐段落写 `w:pBdr`/`w:shd` 时，每个段落各画一条边框，
    /// 段间距处露出缺口（WPS 不会把相邻段落的边框合并成一条），看起来「被打断成多个引用」。
    ///
    /// 改用单元格表格后：边框与底色由**表格**连续绘制；嵌套层级由 `w:tblInd` + 收窄宽度
    /// 递进（每层左右各让出 `quote.padding_x_em`，等价于预览嵌套 blockquote 的左右 padding），
    /// 因此不需要任何段落级边框/底纹。
    fn quote_block_xml(&self, inner: &str) -> String {
        let accent = esc(&self.theme.accent);
        let surface = esc(&self.theme.surface);
        let pad = self.metrics.em_twips(self.metrics.layout.quote.padding_x_em);
        let vpad = self.metrics.em_twips(self.metrics.layout.quote.padding_y_em);
        let border_sz = (self.metrics.layout.quote.border_pt * 8.0).round().clamp(1.0, 96.0) as u32;
        // 第 1 层占满正文宽度；嵌套一层就左右各缩进一个 padding，避免内层竖条贴住外层。
        let depth = self.quote_depth + 1;
        let tbl_w = self
            .metrics
            .text_width_twips()
            .saturating_sub(pad.saturating_mul(2 * (depth - 1)))
            .max(200);
        let indent = if depth > 1 {
            format!("<w:tblInd w:w=\"{}\" w:type=\"dxa\"/>", pad)
        } else {
            String::new()
        };
        // 空引用（`>` 单独一行）也要有合法单元格内容（`w:tc` 至少一个块级元素）
        let inner = if inner.trim().is_empty() {
            "<w:p><w:pPr><w:pStyle w:val=\"Quote\"/></w:pPr></w:p>".to_string()
        } else if inner.trim_end().ends_with("</w:tbl>") {
            // `w:tc` 必须以**段落**收尾。嵌套引用（`> >`）会渲染成内层 `<w:tbl>`，单元格里
            // 直接以表格结尾时 Word 判定文件损坏，打开报「发现无法读取的内容」。
            // 补一个 1pt 空段落兜底（高度可忽略），与 body 末尾 `tbl` 后补段落同理。
            format!(
                "{}<w:p><w:pPr><w:spacing w:before=\"0\" w:after=\"0\" w:line=\"240\" w:lineRule=\"auto\"/>\
                 <w:rPr><w:sz w:val=\"2\"/><w:szCs w:val=\"2\"/></w:rPr></w:pPr></w:p>",
                inner
            )
        } else {
            inner.to_string()
        };
        let none = "w:val=\"none\" w:sz=\"0\" w:space=\"0\" w:color=\"auto\"";
        format!(
            "<w:tbl><w:tblPr><w:tblW w:w=\"{tbl_w}\" w:type=\"dxa\"/>{indent}<w:tblBorders><w:top {none}/>\
             <w:left w:val=\"single\" w:sz=\"{border_sz}\" w:space=\"0\" w:color=\"{accent}\"/><w:bottom {none}/>\
             <w:right {none}/><w:insideH {none}/><w:insideV {none}/></w:tblBorders>\
             <w:shd w:val=\"clear\" w:color=\"auto\" w:fill=\"{surface}\"/><w:tblLayout w:type=\"autofit\"/>\
             <w:tblCellMar><w:top w:w=\"{vpad}\" w:type=\"dxa\"/><w:left w:w=\"0\" w:type=\"dxa\"/>\
             <w:bottom w:w=\"{vpad}\" w:type=\"dxa\"/><w:right w:w=\"0\" w:type=\"dxa\"/></w:tblCellMar></w:tblPr>\
             <w:tblGrid><w:gridCol w:w=\"{tbl_w}\"/></w:tblGrid>\
             <w:tr><w:tc><w:tcPr><w:tcW w:w=\"{tbl_w}\" w:type=\"dxa\"/>\
             <w:shd w:val=\"clear\" w:color=\"auto\" w:fill=\"{surface}\"/></w:tcPr>{inner}</w:tc></w:tr></w:tbl>",
            none = none,
            accent = accent,
            surface = surface,
            vpad = vpad,
            border_sz = border_sz,
            tbl_w = tbl_w,
            indent = indent,
            inner = inner,
        )
    }


    fn para_style(&self) -> &'static str {
        if self.quote_depth > 0 { "Quote" } else { "Normal" }
    }

    /// 表格类块（引用块 / Markdown 表格）之后的间隔段落。
    ///
    /// Word 里块与块的间距全部由**段落的** `w:spacing` 决定，表格自身没有“外边距”，所以
    /// 表格后面必须跟一个带行高的空段落，否则会：
    ///   · 与紧邻的表格被 Word 合并成一个（左边框连成一条、中间没有空隙）；
    ///   · 与代码块（`CodeBlock` 样式 `before=0`）或正文段落紧贴。
    ///
    /// `em` 取 1.0 即与预览的 `table { margin: 1em 0 }` / `blockquote { margin: 1em 0 }` 一致。
    /// 行高用 `exact` 精确控制，字号取 1pt，避免段落自身多出空白。
    fn gap_paragraph_twips(&self, twips: u32) -> String {
        let line = if twips == 0 { 20 } else { twips.max(20) };
        format!(
            "<w:p><w:pPr><w:spacing w:before=\"0\" w:after=\"0\" w:line=\"{}\" w:lineRule=\"exact\"/>\
             <w:rPr><w:sz w:val=\"2\"/><w:szCs w:val=\"2\"/></w:rPr></w:pPr></w:p>",
            line
        )
    }

    /// 任务列表勾选字形（内联 run）
    fn task_glyph(&self, checked: bool) -> String {
        let glyph = if checked { "☑ " } else { "☐ " };
        self.run_with(glyph, InlineState::default(), false, Some(&self.theme.accent), Some(TASK_GLYPH_FONT))
    }

    /// 列表项段落：首段带编号/项目符号；续段仅用 ListParagraph + 与文本对齐的缩进。
    /// `level` 决定是否消费配对闭合标签：调用方已消费 Start(Paragraph) 时传 1（吃掉 End(Paragraph)），
    /// 紧凑列表项的行内内容无包裹标签时传 0。消费 iter 到本段结束为止。
    fn item_paragraph(
        &mut self,
        num: Option<(u32, u32)>,
        depth: u32,
        checked: Option<bool>,
        first: bool,
        level: u32,
        iter: &mut EventIter,
        before: u32,
    ) {
        // 缩进/悬挂都按版式规范换算（不再写死 720/360）：
        // 编号层级 ilvl 恒为 0，层级差异由段落 `w:ind` 表达。
        // 先各取一次 twips 再乘层级，保证与 numbering.xml 的 `w:ind` 完全一致。
        let indent = self.metrics.em_twips(self.metrics.layout.list.indent_em);
        let hanging = self.metrics.em_twips(self.metrics.layout.list.hanging_em);
        let left = depth.max(1) * indent;
        if first {
            match checked {
                // 任务项：**不写 numPr**。预览里勾选框取代了项目符号，若同时写 numPr，Word 会
                // 既画项目符号又画勾选框（双重标记）。
                Some(c) => {
                    self.p_start_ind("ListParagraph", None, Some((left, Some(hanging))), before);
                    let glyph = self.task_glyph(c);
                    self.body.push_str(&glyph);
                }
                None => self.p_start_ind("ListParagraph", num, Some((left, Some(hanging))), before),
            }
        } else {
            self.p_start_ind("ListParagraph", None, Some((left, None)), before);
        }
        let inner = self.render_inlines(iter, InlineState::default(), level);
        self.body.push_str(&inner);
        self.p_end();
    }

    /// 空列表项（如 "- "）：只保留编号/项目符号，避免整个项目消失
    fn empty_item_paragraph(&mut self, num: Option<(u32, u32)>, depth: u32, checked: Option<bool>, before: u32) {
        let indent = self.metrics.em_twips(self.metrics.layout.list.indent_em);
        let hanging = self.metrics.em_twips(self.metrics.layout.list.hanging_em);
        let left = depth.max(1) * indent;
        if let Some(c) = checked {
            self.p_start_ind("ListParagraph", None, Some((left, Some(hanging))), before);
            let glyph = self.task_glyph(c);
            self.body.push_str(&glyph);
        } else {
            self.p_start_ind("ListParagraph", num, Some((left, Some(hanging))), before);
        }
        self.p_end();
    }

    /// 表格一行。表头行（thead）加主题底色、跨页重复，单元格文字加粗。
    fn render_table_row(&mut self, iter: &mut EventIter, aligns: &[Alignment], head: bool, surface: &str) {
        if head {
            // CT_TrPr 顺序：cantSplit 在 tblHeader 之前
            self.body.push_str("<w:tr><w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>");
        } else {
            self.body.push_str("<w:tr><w:trPr><w:cantSplit/></w:trPr>");
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
                    self.body.push_str("<w:vAlign w:val=\"center\"/></w:tcPr>");
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
        // 规范：表格文字 10pt（相对正文 11pt 的比例），通过段落级 rPr 让单元格内所有 run 继承。
        let table_sz = self.metrics.sz_scale(self.metrics.layout.table.scale);
        // 表格单元格用单倍行距（240）：1.5 倍会把行高撑满，垂直居中看不出效果。
        self.body.push_str(&format!(
            "<w:p><w:pPr><w:pStyle w:val=\"Normal\"/><w:spacing w:before=\"0\" w:after=\"0\" w:line=\"240\" w:lineRule=\"auto\"/><w:jc w:val=\"{}\"/><w:rPr><w:sz w:val=\"{}\"/><w:szCs w:val=\"{}\"/></w:rPr></w:pPr>",
            jc,
            table_sz,
            table_sz
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
                    } else if !self.footnote_ref_seen.insert(label.to_string()) {
                        // 同一脚注的**第二次及以后**引用：不再生成 `footnoteReference`
                        // （重复 id 会让 Word 判定文件损坏，见字段注释），降级为上标 `[label]`。
                        // 与预览一致的粗/斜体沿用当前状态，但不带上链接样式。
                        out.push_str(&self.run(
                            &format!("[{}]", label),
                            InlineState { sup: true, sub: false, link: false, ..st },
                            mono,
                            None,
                        ));
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

    /// 目录：一个「目录」标题段落 + TOC 域。
    ///
    /// **域结果在这里预先生成**（条目文字 + 指向 `_Toc` 书签的超链接），打开文档即可见，
    /// 不需要用户按 F9。域本身仍然有效：用户改完标题按 F9，Word 会按大纲级别重新收集，
    /// 补上页码、重排层级。
    ///
    /// 不生成 `word/settings.xml` 的 `<w:updateFields w:val="true"/>`，也不给 `fldChar` 加
    /// `w:dirty` —— 两者都会让 Word 打开时弹「该文档包含的域可能引用了其他文件」。
    fn toc_field(&mut self) {
        // 目录标题走 TocHeading：它没有 outlineLvl，不会把自己也列进目录。
        // 文案由前端按界面语言传入（`theme.toc_title`），缺省才回退中文。
        let title = self
            .theme
            .toc_title
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("目录")
            .to_string();
        // 目录块本身也是一个块：先取它相对前文的段前（表格后的 gap 已经承担时为 0），
        // 再记录到段距状态里，后面的标题不会把它当成开头。
        let heading_before = self.paragraph_before();
        self.body.push_str(&format!(
            "<w:p><w:pPr><w:pStyle w:val=\"TocHeading\"/><w:spacing w:before=\"{}\" w:after=\"0\"/></w:pPr>",
            heading_before
        ));
        self.body.push_str(&self.run(&title, InlineState::default(), false, None));
        self.body.push_str("</w:p>");

        // `\o "1-N"` 收录到版式规范规定的层级；`\h` 生成可点击链接，
        // `\z` 隐藏 Web 版页码，`\u` 用标题的大纲级别而不是自定义样式。
        let max_level = self.metrics.layout.toc_max_level();
        let instr = format!(" TOC \\o \"1-{}\" \\h \\z \\u ", max_level);
        let items = self.toc_items.clone();
        let total = items.len();
        let heading_after = self.metrics.em_twips(self.metrics.layout.toc.heading_after_em);
        let entry_gap = self.metrics.em_twips(self.metrics.layout.toc.entry_gap_em);

        // 无标题：域留空（只保留域本身，更新后 Word 会显示「无目录项」），不写任何提示文字
        if total == 0 {
            self.body.push_str(&format!(
                "<w:p><w:pPr><w:pStyle w:val=\"TOC1\"/><w:spacing w:before=\"{}\" w:after=\"0\"/></w:pPr>\
                 <w:r><w:fldChar w:fldCharType=\"begin\"/></w:r>\
                 <w:r><w:instrText xml:space=\"preserve\">{}</w:instrText></w:r>\
                 <w:r><w:fldChar w:fldCharType=\"separate\"/></w:r>\
                 <w:r><w:fldChar w:fldCharType=\"end\"/></w:r></w:p>",
                heading_after, instr
            ));
            return;
        }

        for (i, entry) in items.iter().enumerate() {
            let lv = entry.level;
            let text = entry.text.as_str();
            let page_no = entry.page;
            let bm = toc_bookmark(i + 1);
            let before = if i == 0 { heading_after } else { entry_gap };
            self.body.push_str("<w:p>");
            self.body.push_str(&format!(
                "<w:pPr><w:pStyle w:val=\"TOC{}\"/><w:spacing w:before=\"{}\" w:after=\"0\"/></w:pPr>",
                lv, before
            ));
            // 域代码只写一次：begin/separate 落在首个条目段，end 落在末个条目段
            if i == 0 {
                self.body.push_str("<w:r><w:fldChar w:fldCharType=\"begin\"/></w:r>");
                self.body.push_str(&format!(
                    "<w:r><w:instrText xml:space=\"preserve\">{}</w:instrText></w:r>",
                    instr
                ));
                self.body.push_str("<w:r><w:fldChar w:fldCharType=\"separate\"/></w:r>");
            }
            let label = if text.trim().is_empty() { " " } else { text };
            let text_run = self.run(label, InlineState::default(), false, None);
            // 点线 + 页码：制表位（右对齐、dot leader）定义在 TOC1-6 样式里。
            // 页码走 `PAGEREF` 域，但**域结果先填一个估算值**（`collect_toc` 按块高累加算出）——
            // 这样打开文档就有页码可看，不必先按 F9；用户按 F9 后 Word 重新排版，
            // 用真实页码覆盖这个估算值。纯文本而非嵌套域，Word 不会弹「域可能引用其他文件」。
            let page = format!(
                "<w:r><w:tab/></w:r>\
                 <w:r><w:fldChar w:fldCharType=\"begin\"/></w:r>\
                 <w:r><w:instrText xml:space=\"preserve\"> PAGEREF {bm} \\h </w:instrText></w:r>\
                 <w:r><w:fldChar w:fldCharType=\"separate\"/></w:r>\
                 <w:r><w:t>{page_no}</w:t></w:r>\
                 <w:r><w:fldChar w:fldCharType=\"end\"/></w:r>"
            );
            let link = format!(
                "<w:hyperlink w:anchor=\"{}\" w:history=\"1\">{}{}</w:hyperlink>",
                bm, text_run, page
            );
            self.body.push_str(&link);
            if i + 1 == total {
                self.body.push_str("<w:r><w:fldChar w:fldCharType=\"end\"/></w:r>");
            }
            self.body.push_str("</w:p>");
        }
    }

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
                // 标题上挂 `_Toc` 书签：目录域结果里的超链接靠它跳转（Word 自己更新域时
                // 也会生成同名书签，顺序一致所以不冲突）
                let max_level = self.metrics.layout.toc_max_level();
                let bookmark = if lv <= max_level {
                    self.heading_seq += 1;
                    Some((self.heading_seq, toc_bookmark(self.heading_seq)))
                } else {
                    None
                };
                let before = self.heading_before(lv);
                // 引用块里的标题也要让出 `Quote` 的左右内边距：表格 cell margin 已为 0，
                // 标题样式自身没有缩进，不补就会贴住引用左边框。
                let hanging = if self.quote_depth > 0 {
                    Some((self.metrics.em_twips(self.metrics.layout.quote.padding_x_em), None))
                } else {
                    None
                };
                self.p_start_ind(&style, None, hanging, before);
                if let Some((id, name)) = &bookmark {
                    self.body.push_str(&format!(
                        "<w:bookmarkStart w:id=\"{}\" w:name=\"{}\"/>",
                        id, name
                    ));
                }
                let inner = self.render_inlines(iter, InlineState::default(), 1);
                self.body.push_str(&inner);
                if let Some((id, _)) = &bookmark {
                    self.body.push_str(&format!("<w:bookmarkEnd w:id=\"{}\"/>", id));
                }
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
                    // 先渲染到临时缓冲：独立成段的裸 `[toc]` / `[[toc]]` 直接换成 TOC 域，
                    // 不留下一个只写着“[toc]”的段落；其它内容再按普通段落输出。
                    let inner = self.render_inlines(iter, InlineState::default(), 1);
                    // 行内渲染可能把 `[toc]` 拆成多个 run（autolink 分段），先取纯文本再判断
                    if is_toc_placeholder(&html_plain_text(&inner)) {
                        self.toc_field();
                        return;
                    }
                    let before = self.paragraph_before();
                    self.p_start(self.para_style(), None, before);
                    self.body.push_str(&inner);
                    self.p_end();
                }
            }
            // 引用块：内容先渲染到临时缓冲，最后整体裹进一个单元格表格（连续左边框 + 连续底色，
            // 嵌套层级由单元格外边距递进）—— 见 `quote_block_xml` 的说明
            Event::Start(Tag::BlockQuote(kind)) => {
                // 引用块是表格容器：表格没有段前距，先补 gap；首段也不该再叠一层。
                self.gap_before_table_like();
                self.suppress_before = true;
                let saved = std::mem::take(&mut self.body);
                self.quote_depth += 1;
                // 提示块：类型来自 GFM 的 BlockQuoteKind；自定义标题由前端写成紧随其后的
                // HTML 注释（见 ALERT_TITLE_MARKER），必须在正文第一个块之前出现。
                let mut alert: Option<(BlockQuoteKind, String)> =
                    kind.map(|k| (k, alert_meta(k).0.to_string()));
                let mut title_slot = kind.is_some();
                while let Some(ev2) = iter.next() {
                    match ev2 {
                        Event::End(TagEnd::BlockQuote(_)) => break, // 消费 End(BlockQuote)
                        Event::End(_) => {}                        // 容错：忽略多余闭合标签
                        // 标题占位注释会被解析器包成 `HtmlBlock`：先消费这一块并取注释内容。
                        // 提示块若以其它 HTML 块开头，原有行为本来也不渲染，consume 不引入回归。
                        Event::Start(Tag::HtmlBlock) if title_slot => {
                            while let Some(inner) = iter.next() {
                                match inner {
                                    Event::Html(h) => {
                                        if let Some(custom) = alert_title_from_marker(&h) {
                                            if let Some((_, title)) = alert.as_mut() {
                                                *title = custom;
                                            }
                                        }
                                    }
                                    Event::End(TagEnd::HtmlBlock) => break,
                                    _ => {}
                                }
                            }
                            title_slot = false;
                        }
                        Event::Start(_) => {
                            title_slot = false;
                            self.render_block_event(iter, ev2);
                        }
                        Event::Html(h) => {
                            if title_slot {
                                if let Some(custom) = alert_title_from_marker(&h) {
                                    if let Some((_, title)) = alert.as_mut() {
                                        *title = custom;
                                    }
                                }
                                title_slot = false;
                            }
                        }
                        _ => title_slot = false,
                    }
                }
                self.quote_depth -= 1;
                let inner = std::mem::replace(&mut self.body, saved);
                let inner = match alert {
                    // 标题段放在正文前；正文第一段已被 suppress_before 压成 0，间距只由标题段后距提供
                    Some((kind, title)) => {
                        format!("{}{}", self.alert_title_xml(kind, &title), inner)
                    }
                    None => inner,
                };
                self.body.push_str(&self.quote_block_xml(&inner));
                // 引用块是 1×1 表格，而 Word 里**表格没有段前/段后距**（块间距全靠段落的
                // `w:spacing`），所以表格后面必须补一个带行高的空段落，否则：
                //   · 与紧邻的表格被合并成一个（实测 `Tables.Count` 由 2 变 1、左边框连成一条）；
                //   · 与代码块（`CodeBlock` 样式 `before=0`）、正文段落紧贴（中间没有空隙）。
                // 间距按版式规范取「表格间距」与下一个块段前的较大值；这同时满足了
                // 「表格不能是 body 的最后一个元素」。
                let gap = self.gap_after_table(iter);
                self.body.push_str(&self.gap_paragraph_twips(gap));
                self.suppress_before = true;
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
                let before = self.code_before();
                self.p_start("CodeBlock", None, before);
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
            // 分隔线 `---`：一条单独的细线，**不再借用一个整行高的空段落**。
            // 以前只写 before/after 间距、行高继承 Normal（约 1.6em），导出后视觉上
            // 就是「分割线上下各多一个空行」。改为 exact 1pt 行高 + 2 号字：段落本身
            // 几乎零高，只留 6pt 的上下间距（与预览 hr 的边距同量级）。
            Event::Rule => {
                self.body.push_str(&format!(
                    "<w:p><w:pPr><w:pStyle w:val=\"Normal\"/><w:pBdr><w:bottom w:val=\"single\" w:sz=\"6\" w:space=\"1\" w:color=\"{}\"/></w:pBdr><w:spacing w:before=\"120\" w:after=\"120\" w:line=\"20\" w:lineRule=\"exact\"/><w:rPr><w:sz w:val=\"2\"/><w:szCs w:val=\"2\"/></w:rPr></w:pPr></w:p>",
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
                    items: 0,
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
                let first_item = self
                    .list_stack
                    .last()
                    .map(|i| self.lists[*i].items == 0)
                    .unwrap_or(false);
                if let Some(&i) = self.list_stack.last() {
                    self.lists[i].items += 1;
                }
                let first_before = self.list_before(first_item);
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
                                self.empty_item_paragraph(num, depth, checked, first_before);
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
                            let before = if first { first_before } else { 0 };
                            self.item_paragraph(num, depth, checked, first, 1, iter, before);
                            first = false;
                        }
                        // 行内起始标签（Strong/Emphasis/Link/Image/…）或紧凑项的行内内容：
                        // 不消费事件，交给 item_paragraph 统一渲染
                        Next::Inline | Next::Other => {
                            let before = if first { first_before } else { 0 };
                            self.item_paragraph(num, depth, checked, first, 0, iter, before);
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
                // 表格本身没有段前距；先补 gap，表格后再补一个 gap。
                self.gap_before_table_like();
                let border = esc(&self.theme.border);
                let surface = esc(&self.theme.surface);
                // 对齐版式规范：整表 100% 宽、统一边框/单元格内边距
                let border_sz = (self.metrics.layout.table.border_pt * 8.0).round().clamp(1.0, 96.0) as u32;
                let cell_x = self.metrics.em_twips(self.metrics.layout.table.cell_margin_x_em);
                let cell_y = self.metrics.em_twips(self.metrics.layout.table.cell_margin_y_em);
                // 表格宽度 = 正文整宽（9026 twips）。
                let table_w = self.metrics.text_width_twips();
                self.body.push_str(&format!(
                    "<w:tbl><w:tblPr><w:tblW w:w=\"{tw}\" w:type=\"dxa\"/><w:tblLayout w:type=\"autofit\"/>\
                     <w:tblBorders><w:top w:val=\"single\" w:sz=\"{sz}\" w:space=\"0\" w:color=\"{b}\"/>\
                     <w:left w:val=\"single\" w:sz=\"{sz}\" w:space=\"0\" w:color=\"{b}\"/>\
                     <w:bottom w:val=\"single\" w:sz=\"{sz}\" w:space=\"0\" w:color=\"{b}\"/>\
                     <w:right w:val=\"single\" w:sz=\"{sz}\" w:space=\"0\" w:color=\"{b}\"/>\
                     <w:insideH w:val=\"single\" w:sz=\"{sz}\" w:space=\"0\" w:color=\"{b}\"/>\
                     <w:insideV w:val=\"single\" w:sz=\"{sz}\" w:space=\"0\" w:color=\"{b}\"/></w:tblBorders>\
                     <w:tblCellMar><w:top w:w=\"{cy}\" w:type=\"dxa\"/><w:left w:w=\"{cx}\" w:type=\"dxa\"/>\
                     <w:bottom w:w=\"{cy}\" w:type=\"dxa\"/><w:right w:w=\"{cx}\" w:type=\"dxa\"/></w:tblCellMar>\
                     </w:tblPr>",
                    sz = border_sz,
                    b = border,
                    tw = table_w,
                    cx = cell_x,
                    cy = cell_y
                ));
                // 列网格：按列数均分正文可用宽度（A4 去 2×2.54cm 页边距 = 9026 twips）。
                // 没有 `w:tblGrid` 时 Word/WPS 需自行推断列宽，多列时容易宽窄不齐。
                let cols = alignments.len().max(1);
                let col_w = table_w / cols as u32;
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
                // 表格后必须跟一个段落（Word 结构要求），同时承担与下一个块之间的间距。
                // 取「表格间距」与下一个块段前的较大值，避免 Word 把两者相加。
                let gap = self.gap_after_table(iter);
                self.body.push_str(&self.gap_paragraph_twips(gap));
                self.suppress_before = true;
            }
            Event::Text(t) => {
                // 裸 `[toc]`（未走前端预处理）也按目录域处理
                if is_toc_placeholder(&t) {
                    self.toc_field();
                    return;
                }
                let before = self.paragraph_before();
                self.p_start(self.para_style(), None, before);
                let run = self.run(&t, InlineState::default(), false, None);
                self.body.push_str(&run);
                self.p_end();
            }
            Event::Html(h) => {
                // 前端把 `[toc]` 换成 HTML 注释标记，到这里输出 TOC 域
                if is_toc_placeholder(&h) {
                    self.toc_field();
                    return;
                }
                // `<center>…</center>`：输出居中段落，不再把标签当正文打印
                if let Some(text) = center_block_text(&h) {
                    let before = self.paragraph_before();
                    self.body.push_str(&format!(
                        "<w:p><w:pPr><w:pStyle w:val=\"{}\"/><w:spacing w:before=\"{}\" w:after=\"0\"/><w:jc w:val=\"center\"/></w:pPr>",
                        self.para_style(),
                        before
                    ));
                    let mut first = true;
                    for line in text.split('\n') {
                        if !first {
                            self.body.push_str(BR);
                        }
                        self.body.push_str(&self.run(line, InlineState::default(), false, None));
                        first = false;
                    }
                    self.p_end();
                    return;
                }
                let imgs = extract_imgs(&h);
                let before = self.paragraph_before();
                self.p_start(self.para_style(), None, before);
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

// 注：这里**不生成** `word/settings.xml`。之前用 `<w:updateFields w:val="true"/>`
// 让 Word 打开时自动更新域，代价是弹一个「该文档包含的域可能引用了其他文件，是否更新？」
// 的对话框 —— 对 TOC 来说是误报。fldChar 上的 `w:dirty="true"` 也不写。
// 代价是域不会自动重算，所以 `toc_field()` 把域结果（标题文字 + 超链接）直接写好，
// 打开就能看到完整目录；用户改了标题再按 F9 即可让 Word 重算并补上页码。

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
    let font_latin = esc(&m.font_latin);
    let font_east_asia = esc(&m.font_east_asia);
    let font_heading_latin = esc(&m.font_heading_latin);
    let font_heading_east_asia = esc(&m.font_heading_east_asia);
    let font_mono = esc(&m.font_mono);
    let surface = esc(&theme.surface);
    let layout = &m.layout;

    let sz = m.body_sz;
    let line = m.line;
    // 代码块用单倍行距：多倍行距在 Word 里把额外行距加在基线下方，
    // 会造成上内边距比下内边距小；单倍下上下边框间距才对称。
    let code_line = m.line_of(1.0);
    // 段距全部走段前，段后恒为 0（见 DocxBuilder 的「段距折叠」说明）。
    let body_before = m.em_twips(layout.paragraph.before_em);
    let first_line = m.em_twips(layout.body.first_line_indent_em);
    let h_line = m.line_of(1.3); // 标题行高 1.3 倍
    let toc_line = m.line_of(layout.toc.line_height);
    let code_sz = m.sz_scale(layout.code.scale);
    let quote_sz = m.sz_scale(layout.quote.scale);
    // 引用的左右内边距改由段落 `w:ind` 承担：表格单元格不再加左右 margin，
    // 否则 100% 宽表格 + 左右 cell margin 会顶出页边距。
    let quote_pad = m.em_twips(layout.quote.padding_x_em);
    // 引用正文按规范用单倍行距（10.5pt）：Word 的多倍行距会把额外行距都加在基线下方，
    // 单倍行距下文字正好填满行框，不会显得「贴在上沿」。
    let quote_line = (240.0 * layout.quote.line_height).round().clamp(240.0, 1440.0) as u32;
    let code_pad = m.em_twips(layout.code.padding_x_em);
    // 代码块内边距：用「与底色同色的段落边框 + w:space」把底纹撑开。
    // 段落本身没有 padding 属性，`w:shd` 只覆盖文字行；边框 space 让着色区域延伸到边框，
    // 边框颜色 = 底色 ⇒ 视觉上就是四向内边距。
    let code_pad_x_pt = (layout.code.padding_x_em * m.body_pt).round().clamp(0.0, 31.0) as u32;
    let code_pad_y_pt = (layout.code.padding_y_em * m.body_pt).round().clamp(0.0, 31.0) as u32;
    let fn_sz = m.footnote_sz();
    let quote_color = if layout.quote.text_color.trim().is_empty() {
        text.clone()
    } else {
        esc(&layout.quote.text_color)
    };
    let toc_max = layout.toc_max_level();
    let toc_h_sz = m.sz_scale(layout.toc.heading_scale);
    let body_jc = if layout.body.align.eq_ignore_ascii_case("both") { "both" } else { "left" };

    let mut s = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><w:styles xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">".to_string();
    // 文档默认值：把字体/字号/行距写进 docDefaults（而不是只靠样式继承），
    // Word 的「正文」样式、新建段落、脚注等都直接取这里的值
    s.push_str(&format!(
        "<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii=\"{font_latin}\" w:hAnsi=\"{font_latin}\" w:eastAsia=\"{font_east_asia}\" w:cs=\"{font_latin}\"/><w:color w:val=\"{text}\"/><w:sz w:val=\"{sz}\"/><w:szCs w:val=\"{sz}\"/><w:lang w:val=\"en-US\" w:eastAsia=\"zh-CN\"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:before=\"0\" w:after=\"0\" w:line=\"{line}\" w:lineRule=\"auto\"/></w:pPr></w:pPrDefault></w:docDefaults>"
    ));
    // Normal：段前由 `p_start` 按块类型覆盖，段后恒为 0。
    s.push_str(&format!(
        "<w:style w:type=\"paragraph\" w:default=\"1\" w:styleId=\"Normal\"><w:name w:val=\"Normal\"/><w:qFormat/><w:pPr><w:spacing w:before=\"{body_before}\" w:after=\"0\" w:line=\"{line}\" w:lineRule=\"auto\"/><w:ind w:firstLine=\"{first_line}\" w:firstLineChars=\"0\"/><w:jc w:val=\"{body_jc}\"/></w:pPr><w:rPr><w:rFonts w:ascii=\"{font_latin}\" w:hAnsi=\"{font_latin}\" w:eastAsia=\"{font_east_asia}\" w:cs=\"{font_latin}\"/><w:color w:val=\"{text}\"/><w:sz w:val=\"{sz}\"/><w:szCs w:val=\"{sz}\"/></w:rPr></w:style>"
    ));
    // 标题 1-6：比例来自 DocxLayout，不再用 Rust 里的第二份表。
    for lv in 1..=6 {
        let hsz = m.sz_scale(layout.heading_scale(lv));
        let h_before = m.em_twips(layout.heading_before_em(lv));
        let bold = if layout.headings.bold { "<w:b/>" } else { "" };
        s.push_str(&format!(
            "<w:style w:type=\"paragraph\" w:styleId=\"Heading{lv}\"><w:name w:val=\"heading {lv}\"/><w:basedOn w:val=\"Normal\"/><w:next w:val=\"Normal\"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before=\"{h_before}\" w:after=\"0\" w:line=\"{h_line}\" w:lineRule=\"auto\"/><w:ind w:left=\"0\" w:right=\"0\" w:firstLine=\"0\" w:firstLineChars=\"0\"/><w:jc w:val=\"left\"/><w:outlineLvl w:val=\"{outline}\"/></w:pPr><w:rPr><w:rFonts w:ascii=\"{font_heading_latin}\" w:hAnsi=\"{font_heading_latin}\" w:eastAsia=\"{font_heading_east_asia}\" w:cs=\"{font_heading_latin}\"/>{bold}<w:color w:val=\"{accent}\"/><w:sz w:val=\"{hsz}\"/><w:szCs w:val=\"{hsz}\"/></w:rPr></w:style>",
            outline = lv - 1
        ));
    }
    // 目录标题（TOC 域上方那行字）：不能复用 Heading —— 带 outlineLvl 会把自己也收进目录
    s.push_str(&format!(
        "<w:style w:type=\"paragraph\" w:styleId=\"TocHeading\"><w:name w:val=\"TOC Heading\"/><w:basedOn w:val=\"Normal\"/><w:next w:val=\"Normal\"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before=\"0\" w:after=\"0\" w:line=\"{h_line}\" w:lineRule=\"auto\"/><w:ind w:left=\"0\" w:right=\"0\" w:firstLine=\"0\" w:firstLineChars=\"0\"/><w:jc w:val=\"center\"/></w:pPr><w:rPr><w:rFonts w:ascii=\"{font_heading_latin}\" w:hAnsi=\"{font_heading_latin}\" w:eastAsia=\"{font_heading_east_asia}\" w:cs=\"{font_heading_latin}\"/><w:b/><w:color w:val=\"{text}\"/><w:sz w:val=\"{toc_h_sz}\"/><w:szCs w:val=\"{toc_h_sz}\"/></w:rPr></w:style>"
    ));
    // 目录条目 TOC1-N：段后 0，条目间距由 `toc_field` 的段前控制。
    for lv in 1..=toc_max {
        let ind = if lv > 1 {
            format!("<w:ind w:left=\"{}\" w:firstLine=\"0\"/>", m.em_twips(1.0) * (lv - 1))
        } else {
            "<w:ind w:firstLine=\"0\"/>".to_string()
        };
        s.push_str(&format!(
            "<w:style w:type=\"paragraph\" w:styleId=\"TOC{lv}\"><w:name w:val=\"toc {lv}\"/><w:basedOn w:val=\"Normal\"/><w:next w:val=\"Normal\"/><w:uiPriority w:val=\"39\"/><w:pPr><w:tabs><w:tab w:val=\"right\" w:leader=\"dot\" w:pos=\"{tab}\"/></w:tabs><w:spacing w:before=\"0\" w:after=\"0\" w:line=\"{toc_line}\" w:lineRule=\"auto\"/>{ind}<w:jc w:val=\"left\"/></w:pPr><w:rPr><w:rFonts w:ascii=\"{font_latin}\" w:hAnsi=\"{font_latin}\" w:eastAsia=\"{font_east_asia}\" w:cs=\"{font_latin}\"/><w:color w:val=\"{text}\"/><w:sz w:val=\"{sz}\"/><w:szCs w:val=\"{sz}\"/></w:rPr></w:style>",
            tab = m.text_width_twips()
        ));
    }
    // 列表段落：段前由 Item 处理器写入，段后恒为 0。
    s.push_str(&format!(
        "<w:style w:type=\"paragraph\" w:styleId=\"ListParagraph\"><w:name w:val=\"List Paragraph\"/><w:basedOn w:val=\"Normal\"/><w:qFormat/><w:pPr><w:spacing w:before=\"0\" w:after=\"0\" w:line=\"{line}\" w:lineRule=\"auto\"/><w:ind w:firstLine=\"0\" w:firstLineChars=\"0\"/><w:jc w:val=\"left\"/></w:pPr></w:style>"
    ));
    // 代码块：等宽 + 主题 surface 底色 + 左右内边距。
    s.push_str(&format!(
        "<w:style w:type=\"paragraph\" w:styleId=\"CodeBlock\"><w:name w:val=\"Code Block\"/><w:basedOn w:val=\"Normal\"/><w:pPr><w:pBdr><w:top w:val=\"single\" w:sz=\"4\" w:space=\"{pad_y_pt}\" w:color=\"{surface}\"/><w:left w:val=\"single\" w:sz=\"4\" w:space=\"{pad_x_pt}\" w:color=\"{surface}\"/><w:bottom w:val=\"single\" w:sz=\"4\" w:space=\"{pad_y_pt}\" w:color=\"{surface}\"/><w:right w:val=\"single\" w:sz=\"4\" w:space=\"{pad_x_pt}\" w:color=\"{surface}\"/></w:pBdr><w:shd w:val=\"clear\" w:color=\"auto\" w:fill=\"{surface}\"/><w:spacing w:before=\"{code_before}\" w:after=\"0\" w:line=\"{code_line}\" w:lineRule=\"auto\"/><w:ind w:left=\"{pad}\" w:right=\"{pad}\" w:firstLine=\"0\"/><w:jc w:val=\"left\"/></w:pPr><w:rPr><w:rFonts w:ascii=\"{font_mono}\" w:hAnsi=\"{font_mono}\" w:eastAsia=\"{font_mono}\" w:cs=\"{font_mono}\"/><w:sz w:val=\"{code_sz}\"/><w:szCs w:val=\"{code_sz}\"/></w:rPr></w:style>",
        code_before = m.em_twips(layout.code.before_em),
        code_line = code_line,
        pad = code_pad,
        pad_x_pt = code_pad_x_pt,
        pad_y_pt = code_pad_y_pt
    ));
    // 引用：只保留文字色；边框/底色由引用块表格绘制。段距由引用块内段前控制。
    s.push_str(&format!(
        "<w:style w:type=\"paragraph\" w:styleId=\"Quote\"><w:name w:val=\"Quote\"/><w:basedOn w:val=\"Normal\"/><w:qFormat/><w:pPr><w:spacing w:before=\"0\" w:after=\"0\" w:line=\"{quote_line}\" w:lineRule=\"auto\"/><w:ind w:left=\"{quote_pad}\" w:right=\"{quote_pad}\" w:firstLine=\"0\" w:firstLineChars=\"0\"/><w:jc w:val=\"left\"/></w:pPr><w:rPr><w:color w:val=\"{quote_color}\"/><w:sz w:val=\"{quote_sz}\"/><w:szCs w:val=\"{quote_sz}\"/></w:rPr></w:style>"
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

fn numbering_xml(lists: &[ListInstance], m: &Metrics) -> String {
    let mut s = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><w:numbering xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">");
    // 每个列表（顶层与嵌套）**各占一个 `w:abstractNum`**：
    //   · `w:num` 只是 abstractNum 的实例，计数器挂在 abstractNum 上，只靠 `startOverride`
    //     （层级切换）重置 —— 共享 abstractNum 时「第一章 → 第一节 → 第二节 → 第二章」
    //     会把第二章渲染成 3（被二级列表推高，WPS 实测）
    //   · 每个列表自带 abstractNum 后，编号必然实例内独立；起始值同时写在 `w:lvl/w:start`
    //     与 `w:lvlOverride/w:startOverride`（双保险，兼容对 restart 语义实现不同的阅读器）
    //   · 编号层级恒为 ilvl=0：层级差异只靠段落 `w:ind` 缩进（预览里每个 `<ol>` 都是从 1
    //     开始的一级编号，靠 ilvl 会变成 Word 的 `1.1.` 多级编号）
    let indent = m.em_twips(m.layout.list.indent_em);
    let hanging = m.em_twips(m.layout.list.hanging_em);
    for (i, li) in lists.iter().enumerate() {
        let left = li.depth.max(1) * indent;
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
            "<w:abstractNum w:abstractNumId=\"{}\"><w:multiLevelType w:val=\"singleLevel\"/><w:lvl w:ilvl=\"0\"><w:start w:val=\"{}\"/><w:numFmt w:val=\"{}\"/><w:lvlText w:val=\"{}\"/><w:lvlJc w:val=\"left\"/><w:pPr><w:ind w:left=\"{}\" w:hanging=\"{}\"/></w:pPr>{}</w:lvl></w:abstractNum>",
            i, start, num_fmt, lvl_text, left, hanging, rpr
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
        toc_title: theme.toc_title,
        layout: theme.layout,
    };

    let mut builder = DocxBuilder::new(theme, base_dir, remote_images);
    // 脚注：只有「有定义且有引用」的 label 才转 Word 脚注
    let (defined, referenced) = scan_footnotes(md);
    builder.footnote_defined = defined.intersection(&referenced).cloned().collect();

    // 解析选项：与预览保持一致 ——
    //   · 关闭「智能标点」（预览 typographer:false，否则 `"引号"`→“ ”、`a--b`→a–b、`...`→… 会不一致）
    //   · `^x^` / `~x~` / `==x==` 由 `inline_markers_to_html` 统一转成 `<sup>`/`<sub>`/`<mark>`，
    //     不走 pulldown 的上下标位（它要求标记前有空白，`E=mc^2^` 会漏；且 SUBSCRIPT 会改变 `~~` 语义）
    //   · 脚注改用 GFM 语义（预览用 markdown-it-footnote）
    let mut opts = Options::all();
    opts.remove(Options::ENABLE_SMART_PUNCTUATION);
    opts.remove(Options::ENABLE_SUPERSCRIPT);
    opts.remove(Options::ENABLE_SUBSCRIPT);
    // 注意：ENABLE_OLD_FOOTNOTES 的位包含 ENABLE_FOOTNOTES，移除后必须补回 GFM 脚注位
    opts.remove(Options::ENABLE_OLD_FOOTNOTES);
    opts.insert(Options::ENABLE_FOOTNOTES);
    // `==高亮==` / `^上标^` / `~下标~` 统一预处理，标题扫描与正文解析走同一份文本
    let md = inline_markers_to_html(md);
    // 预扫描标题 + 估算页码：目录域的「域结果」在导出时就直接写好（见 `toc_field`），打开即可见
    let toc_items = collect_toc(&md, &opts, &builder.metrics);
    builder.toc_items = toc_items;
    let mut iter = Parser::new_ext(&md, opts).peekable();
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
        add("word/numbering.xml", numbering_xml(&builder.lists, &builder.metrics).as_bytes())?;
        add("word/fontTable.xml", font_table_xml(&builder.metrics).as_bytes())?;
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
            doc.contains("<w:ind w:left=\"840\" w:hanging=\"210\"/>"),
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
        assert!(doc.contains("<w:ind w:left=\"420\"/>"), "续段缩进缺失: {}", doc);
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
        assert!(doc.contains("<w:ind w:left=\"840\" w:hanging=\"210\"/>"), "嵌套层级丢失: {}", doc);
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
        // 表格宽度 = 正文宽 - 左右 cell margin，避免 100% 宽 + 边距顶出页边距
        assert!(doc.contains("w:tblW w:w=\"9026\" w:type=\"dxa\""), "表格宽度未铺满正文区: {}", doc);
        // 网格线使用主题 --editor-border（D5E2FF），而非硬编码灰
        assert!(doc.contains("w:color=\"D5E2FF\""), "边框未使用主题色: {}", doc);
        assert!(!doc.contains("BFBFBF"), "仍存在硬编码边框色: {}", doc);
        // 表头：底色 = 主题 --editor-surface、跨页重复、文字加粗
        assert!(doc.contains("<w:tblHeader/>"), "表头未设置跨页重复: {}", doc);
        assert!(doc.contains("w:fill=\"F0F7FF\""), "表头底色缺失: {}", doc);
        assert!(doc.contains("<w:b/>"), "表头文字未加粗: {}", doc);
        // 单元格：单倍行距 + 垂直居中 + 列对齐
        assert!(doc.contains("<w:spacing w:before=\"0\" w:after=\"0\" w:line=\"240\" w:lineRule=\"auto\"/>"), "单元格行距不是单倍: {}", doc);
        assert!(doc.contains("<w:vAlign w:val=\"center\"/>"), "单元格未垂直居中: {}", doc);
        assert!(doc.contains("<w:jc w:val=\"right\"/>"), "右对齐列未生效: {}", doc);
        assert_eq!(doc.matches("<w:tc>").count(), 4, "单元格数不对: {}", doc);
        assert_eq!(doc.matches("<w:tr>").count(), 2, "行数不对: {}", doc);
        // 列网格：2 列均分「正文宽度 - 左右 cell margin」
        assert_eq!(doc.matches("<w:gridCol w:w=\"4513\"/>").count(), 2, "列网格缺失: {}", doc);
        // 左右 0.2cm、上下 0.1cm 的单元格边距
        assert!(doc.contains("<w:tblCellMar><w:top w:w=\"57\" w:type=\"dxa\"/><w:left w:w=\"113\" w:type=\"dxa\"/>"), "单元格边距不正确: {}", doc);
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
            toc_title: None,
            layout: None,
        }
    }

    /// 测试用：按主题默认版式构造 Metrics（与 `markdown_to_docx` 的解析口径一致）
    fn metrics_of(theme: &DocxTheme) -> Metrics {
        let layout = theme.layout.clone().unwrap_or_default();
        Metrics::new(theme.font_size_px, theme.line_height, layout, theme)
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
    fn heading_and_body_fonts_are_serialized_separately() {
        // 「字体跟随预览」关闭时前端传入 Word 经典默认字体：正文 Calibri/等线，标题 Calibri Light/等线 Light
        let mut theme = test_theme();
        let mut layout = DocxLayout::default();
        layout.fonts = DocxFonts {
            latin: "Calibri".into(),
            east_asia: "DengXian".into(),
            heading_latin: "Calibri Light".into(),
            heading_east_asia: "DengXian Light".into(),
            mono: "Consolas".into(),
        };
        theme.layout = Some(layout);

        let m = metrics_of(&theme);
        assert_eq!(m.font_latin, "Calibri");
        assert_eq!(m.font_heading_latin, "Calibri Light");
        assert_eq!(m.font_heading_east_asia, "DengXian Light");

        let styles = styles_xml(&theme, &m);
        let normal = style_block(&styles, "Normal");
        assert!(normal.contains("w:ascii=\"Calibri\""), "{}", normal);
        assert!(normal.contains("w:eastAsia=\"DengXian\""), "{}", normal);
        let heading = style_block(&styles, "Heading1");
        assert!(heading.contains("w:ascii=\"Calibri Light\""), "{}", heading);
        assert!(heading.contains("w:eastAsia=\"DengXian Light\""), "{}", heading);

        let ft = font_table_xml(&m);
        assert!(ft.contains("<w:font w:name=\"Calibri Light\">"), "{}", ft);
        assert!(
            ft.contains("<w:altName w:val=\"Calibri, Arial, Helvetica Neue, Liberation Sans\"/>"),
            "标题西文替代链缺失: {}", ft
        );
        assert!(ft.contains("<w:font w:name=\"DengXian Light\">"), "{}", ft);
        assert!(
            ft.contains("<w:altName w:val=\"Microsoft YaHei, PingFang SC, Noto Sans SC, SimHei, SimSun\"/>"),
            "标题东亚替代链缺失: {}", ft
        );
    }

    #[test]
    fn heading_fonts_fall_back_to_body_when_not_set() {
        let theme = test_theme(); // layout 为 None，旧调用方
        let m = metrics_of(&theme);
        assert_eq!(m.font_heading_latin, m.font_latin);
        assert_eq!(m.font_heading_east_asia, m.font_east_asia);
    }

    #[test]
    fn font_table_declares_alt_names_for_substitution() {
        let theme = test_theme();
        let ft = font_table_xml(&metrics_of(&theme));
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
        let ft = font_table_xml(&metrics_of(&theme));
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
        let theme = test_theme();
        let ft = font_table_xml(&metrics_of(&theme));
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
        let theme = test_theme();
        let a = Metrics::new(None, None, DocxLayout::default(), &theme);
        let b = Metrics::new(Some(16.0), Some(1.8), DocxLayout::default(), &theme);
        assert_eq!((a.body_sz, a.line), (b.body_sz, b.line));
        assert_eq!(a.body_sz, 22, "规范固定 11pt（22 半磅）");
        assert_eq!(a.line, 360, "规范 1.5 倍行距 = 240×1.5（Word 口径）");
    }

    #[test]
    fn body_font_size_and_line_height_follow_settings() {
        // 用户设置：预览字号 20px、行高 2.0（应用默认设置值）
        let theme = || DocxTheme { font_size_px: Some(20.0), line_height: Some(2.0), ..test_theme() };
        let styles = docx_part("正文\n\n# 标题\n", theme(), "word/styles.xml");
        // 规范固定 11pt（22 半磅）/ 1.5 倍行距（300），不跟随预览字号
        assert!(styles.contains("<w:sz w:val=\"22\"/>"), "正文字号不是规范 11pt: {}", styles);
        assert!(styles.contains("w:line=\"360\""), "行距不是规范 1.5 倍: {}", styles);
        // 段前距 = 6pt = 120 twips（段后恒为 0，避免 Word 相加）
        assert!(styles.contains("w:before=\"120\""), "段前距不是规范 6pt: {}", styles);
        // 标题按规范：h1 = 18pt = 36 半磅
        assert!(styles.contains("<w:sz w:val=\"36\"/>"), "h1 字号不是规范 18pt: {}", styles);
        // h3 = 13pt = 26 半磅
        assert!(styles.contains("<w:sz w:val=\"26\"/>"), "h3 字号不是规范 13pt: {}", styles);
        // 代码块行距跟随规范 1.5 倍
        let code_style = style_block(&styles, "CodeBlock");
        assert!(code_style.contains("w:line=\"240\""), "代码块行距不是单倍: {}", code_style);
        // 表格单元格同理
        let doc = docx_part("| a | b |\n|---|---|\n| 1 | 2 |\n", theme(), "word/document.xml");
        assert!(
            doc.contains("<w:spacing w:before=\"0\" w:after=\"0\" w:line=\"240\" w:lineRule=\"auto\"/>"),
            "单元格行距不是单倍: {}",
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

    /// 同一个脚注被引用两次（复制粘贴带脚注的段落就会遇到）。
    ///
    /// Word 要求 `w:footnoteReference` 的 id 与 `footnotes.xml` 里的定义**一对一**：同一个 id
    /// 出现两次时 Word 打开即报「文件可能已经损坏」（实测 `样式测试.docx` 就是这么坏的）。
    /// 所以第二次及以后只输出上标文字，不再生成脚注引用。
    #[test]
    fn repeated_footnote_reference_is_downgraded() {
        let md = "正文引用脚注[^1]。\n\n> 引用块里又写了一次[^1]。\n\n[^1]: 脚注定义文字\n";
        let doc = docx_part(md, test_theme(), "word/document.xml");
        let fnx = docx_part(md, test_theme(), "word/footnotes.xml");

        // 核心约束：脚注引用只能出现一次
        assert_eq!(
            doc.matches("<w:footnoteReference").count(),
            1,
            "脚注引用重复（Word 会判定文件损坏）: {}",
            doc
        );
        // 第二次降级为上标 `[1]`，标记不丢
        assert!(doc.contains("<w:vertAlign w:val=\"superscript\"/>"), "降级标记缺失: {}", doc);
        assert!(doc_text(&doc).contains("[1]"), "降级文字缺失: {}", doc);
        // 定义仍只有一条，内容没被复制
        assert_eq!(fnx.matches("<w:footnote w:id=\"1\">").count(), 1, "{}", fnx);
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
        // 规范 11pt 正文 → sz 22；脚注 sz = round(22 × 0.83) = 18
        let body_sz = 22;
        let fn_sz = 18;
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
            fnx.contains("<w:sz w:val=\"16\"/>"),
            "脚注行内代码未按脚注字号换算: {}", fnx
        );
        // 列表项与多段脚注的第二段都要显式写小字号
        assert!(
            fnx.matches("<w:rPr><w:sz w:val=\"18\"/><w:szCs w:val=\"18\"/></w:rPr>").count() >= 2,
            "脚注段落（列表项/第二段）未写段落级字号: {}", fnx
        );
        // 脚注重定尺寸不能污染正文：正文用正文字号
        let doc = docx_part(md, test_theme(), "word/document.xml");
        assert!(
            !doc.contains("<w:sz w:val=\"18\"/><w:szCs w:val=\"18\"/>"),
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
        assert!(quote.contains("<w:color w:val=\"333333\"/>"), "引用文字色未跟随正文: {}", quote);
        assert!(!quote.contains("w:pBdr") && !quote.contains("w:shd"), "Quote 样式不应再画边框/底色: {}", quote);
    }

    /// 回归：两个相邻引用块之间必须有间隔。
    ///
    /// 每个引用块是一个 1×1 表格，而 Word 会把**紧邻的表格合并**成一个（实测：文档里两个
    /// `<w:tbl>` 直接相接时，打开后 `Tables.Count` 仍为 1，视觉上两块粘在一起、左边框连成
    /// 一条，中间没有任何空隙）。所以两块之间要补一个 1em 高的空段落隔断。
    #[test]
    fn adjacent_blockquotes_are_not_merged() {
        let doc = xml_of("> 第一块\n\n> 第二块\n");
        assert_eq!(doc.matches("<w:tbl>").count(), 2, "应为两个独立的引用容器: {}", doc);
        assert!(!doc.contains("</w:tbl><w:tbl>"), "两个引用表格直接相接，Word 会合并: {}", doc);
        // 间隔段落：紧跟第一个表格之后、精确 1em 行高（16px 正文 → 240 twips）
        assert!(
            doc.contains("</w:tbl><w:p><w:pPr><w:spacing w:before=\"0\" w:after=\"0\" w:line=\""),
            "缺少引用块之间的间隔段落: {}",
            doc
        );
        // 单个引用块后面同样要留间隔段落（表格没有段后距，否则下文会紧贴引用块底边）
        let one = xml_of("> 只有一块\n");
        assert_eq!(one.matches("<w:tbl>").count(), 1, "{}", one);
        assert!(
            one.contains("</w:tbl><w:p><w:pPr><w:spacing w:before=\"0\" w:after=\"0\" w:line=\""),
            "引用块后缺少间隔段落: {}",
            one
        );
    }

    /// 引用块（1×1 表格）与代码块相邻时也必须有间隔。
    ///
    /// `CodeBlock` 样式的 `w:spacing before="0"`（段落间距全靠上一段的 `after`），而表格
    /// 没有段后距 —— 不补段落的话代码块会直接贴着引用块底边。
    #[test]
    fn blockquote_and_code_block_have_gap() {
        let doc = xml_of("> 引用块\n\n```rust\nlet a = 1;\n```\n");
        assert!(
            doc.contains("</w:tbl><w:p><w:pPr><w:spacing w:before=\"0\" w:after=\"0\" w:line=\""),
            "引用块与代码块之间缺少间隔段落: {}",
            doc
        );
        assert_eq!(doc.matches("w:pStyle w:val=\"CodeBlock\"").count(), 1, "{}", doc);
    }

    #[test]
    fn gfm_alert_renders_type_icon_and_default_title() {
        // GFM 的 `[!TIP]` 独占一行 → pulldown-cmark 给出 BlockQuoteKind::Tip
        let doc = xml_of("> [!TIP]\n> 正文内容\n");
        assert!(doc.contains("w:color w:val=\"1F883D\""), "提示块标题未使用类型色: {}", doc);
        assert!(doc.contains("<w:t xml:space=\"preserve\">Tip</w:t>"), "缺少默认标题: {}", doc);
        assert!(doc.contains("<w:drawing>"), "缺少图标图片: {}", doc);
        assert!(doc.contains("正文内容"), "正文丢失: {}", doc);
        assert!(xml_is_well_formed(&doc), "提示块 XML 结构损坏: {}", doc);
        // 标题段在正文段之前
        let title_at = doc.find(">Tip</w:t>").expect("title");
        let body_at = doc.find("正文内容").expect("body");
        assert!(title_at < body_at, "标题应在正文前: {}", doc);
    }

    #[test]
    fn gfm_alert_uses_custom_title_marker_and_type_color() {
        // 前端把 `> [!CAUTION] 危险操作` 转成「标记行 + base64 注释」
        let doc = xml_of("> [!CAUTION]\n> <!--yizi:alert-title:5bCP5oqA5ben-->\n> 正文\n");
        assert!(doc.contains("w:color w:val=\"CF222E\""), "类型色不对: {}", doc);
        assert!(doc.contains("<w:t xml:space=\"preserve\">小技巧</w:t>"), "自定义标题丢失: {}", doc);
        assert!(!doc.contains("yizi:alert-title"), "占位注释漏进正文: {}", doc);
        assert!(doc.contains("<w:drawing>"), "缺少图标: {}", doc);
    }

    #[test]
    fn plain_blockquote_does_not_gain_alert_title_or_icon() {
        let doc = xml_of("> 普通引用\n");
        assert!(!doc.contains("<w:drawing>"), "普通引用不应有图标: {}", doc);
        assert!(!doc.contains(">Tip</w:t>"), "普通引用不应有提示块标题: {}", doc);
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
        // 回归：分隔线段落必须「零高」，否则导出后线上下各多出一个空行
        assert!(
            doc.contains("<w:spacing w:before=\"120\" w:after=\"120\" w:line=\"20\" w:lineRule=\"exact\""),
            "分隔线段落没有压成细线: {}", doc
        );
        let text = doc_text(&doc);
        assert!(text.contains("上文") && text.contains("下文"), "{}", doc);
    }

    #[test]
    fn toc_field_uses_layout_max_level_and_bookmarks() {
        let md = "# A\n\n<!--yizi:toc-->\n\n## B\n\n### C\n\n#### D\n\n##### E\n\n###### F\n";
        let doc = xml_of(md);
        // 目录收全部 1-6 级
        assert!(doc.contains(" TOC \\o \"1-6\" \\h \\z \\u "), "目录域层级不对: {}", doc);
        assert!(doc.contains("<w:pStyle w:val=\"TOC1\"/>"), "TOC1 缺失: {}", doc);
        assert!(doc.contains("<w:pStyle w:val=\"TOC2\"/>"), "TOC2 缺失: {}", doc);
        assert!(doc.contains("<w:pStyle w:val=\"TOC3\"/>"), "TOC3 缺失: {}", doc);
        assert!(doc.contains("<w:pStyle w:val=\"TOC4\"/>"), "TOC4 缺失: {}", doc);
        assert!(doc.contains("<w:pStyle w:val=\"TOC6\"/>"), "TOC6 缺失: {}", doc);
        // 书签与超链接一一对应（1-6 级都挂）
        assert!(doc.contains("<w:bookmarkStart w:id=\"1\" w:name=\"_Toc000000001\"/>"), "书签缺失: {}", doc);
        assert!(doc.contains("<w:hyperlink w:anchor=\"_Toc000000001\""), "目录超链接缺失: {}", doc);
        assert!(doc.contains("_Toc000000004"), "H4 也应挂目录书签: {}", doc);
        assert!(doc.contains("_Toc000000006"), "H6 也应挂目录书签: {}", doc);
    }

    #[test]
    fn center_html_block_is_centered() {
        let doc = xml_of("<center>居中的文字</center>\n");
        assert!(doc.contains("<w:jc w:val=\"center\"/>"), "center 块没有居中: {}", doc);
        assert!(!doc.contains("&lt;center"), "center 标签被当成正文: {}", doc);
        assert!(doc_text(&doc).contains("居中的文字"), "center 文字丢失: {}", doc);
    }

    #[test]
    fn heading_inside_quote_has_left_padding() {
        let doc = xml_of("> # 引用里的标题\n");
        assert!(
            doc.contains("<w:pStyle w:val=\"Heading1\"/><w:spacing w:before=\"0\" w:after=\"0\"/><w:ind w:left=\"227\"/>"),
            "引用里的标题缺少左内边距: {}",
            doc
        );
    }

    #[test]
    fn inline_sup_sub_highlight_and_strike_are_exported() {
        let doc = xml_of("x^2^ H~2~O ==重点== ~~删~~\n");
        assert!(doc.contains("<w:vertAlign w:val=\"superscript\"/>"), "上标缺失: {}", doc);
        assert!(doc.contains("<w:vertAlign w:val=\"subscript\"/>"), "下标缺失: {}", doc);
        assert!(doc.contains("<w:highlight w:val=\"yellow\"/>"), "高亮缺失: {}", doc);
        assert!(doc.contains("<w:strike/>"), "删除线缺失: {}", doc);
    }

    #[test]
    fn chinese_superscript_and_subscript_are_exported() {
        let doc = xml_of("^上标^ 与 ~下标~\n");
        assert!(doc.contains("<w:vertAlign w:val=\"superscript\"/>"), "中文上标缺失: {}", doc);
        assert!(doc.contains("<w:vertAlign w:val=\"subscript\"/>"), "中文下标缺失: {}", doc);
    }

    #[test]
    fn numeric_ranges_are_not_subscripts() {
        let doc = xml_of("1~5 和 0~20\n");
        assert!(!doc.contains("<w:vertAlign w:val=\"subscript\"/>"), "数字区间被误当下标: {}", doc);
    }

    #[test]
    fn highlight_inside_code_is_not_converted() {
        let doc = xml_of("`a==b==`\n\n```\nx==y==\n```\n");
        assert!(doc.contains("a==b=="), "行内代码被改写: {}", doc);
        assert!(doc.contains("x==y=="), "围栏代码被改写: {}", doc);
    }

    #[test]
    fn raw_toc_paragraph_is_supported() {
        // 前端正常会换成 HTML 标记；直接调用 markdown_to_docx 的测试/其它调用方传裸 [toc] 也要能认。
        let doc = xml_of("# A\n\n[toc]\n\n## B\n");
        assert!(doc.contains(" TOC \\o \"1-6\" \\h \\z \\u "), "裸 [toc] 未生成目录域: {}", doc);
        assert!(!doc_text(&doc).contains("[toc]"), "裸 [toc] 仍留在正文: {}", doc);
    }

    #[test]
    fn toc_page_estimate_accounts_for_the_toc_block() {
        // 80 条目录约 2-3 页；如果估算时忽略目录自身高度，H0 会被误算成第 1 页。
        let mut md = String::from("# Before\n\n<!--yizi:toc-->\n\n");
        for i in 0..80 {
            md.push_str(&format!("## H{}\n\n", i));
        }
        let theme = test_theme();
        let m = metrics_of(&theme);
        let entries = collect_toc(&md, &Options::all(), &m);
        let before = entries.iter().find(|e| e.text == "Before").expect("Before");
        let h0 = entries.iter().find(|e| e.text == "H0").expect("H0");
        assert_eq!(before.page, 1, "目录前的标题应在第 1 页");
        assert!(h0.page >= 2, "目录自身高度未计入页码估算: H0 在第 {} 页", h0.page);
    }

    #[test]
    fn paragraph_spacing_uses_before_only() {
        let doc = xml_of("第一段\n\n第二段\n");
        // 第一段顶格：段前 0；第二段段前 6pt = 120 twips（规范 11pt 正文）
        assert!(doc.contains("<w:spacing w:before=\"0\" w:after=\"0\"/>"), "首段段前不是 0: {}", doc);
        assert!(doc.contains("<w:spacing w:before=\"120\" w:after=\"0\"/>"), "次段段前缺失: {}", doc);
        // Word 会把段前/段后相加：正文段落绝不能再出现段后 6pt
        assert!(!doc.contains("w:after=\"120\""), "正文仍存在段后距: {}", doc);
    }

    #[test]
    fn table_end_gap_matches_layout() {
        // 表格后必须有段落（Word 结构要求），高度由版式规范里的 table.gapEm 决定。
        // 规范 6pt = 120 twips；下一个段落段前也是 6pt，取较大值后仍是 120。
        let doc = xml_of("| A | B |\n| --- | --- |\n| 1 | 2 |\n\n后续文字\n");
        assert!(doc.contains("</w:tbl>"), "表格缺失: {}", doc);
        let after = &doc[doc.find("</w:tbl>").unwrap() + "</w:tbl>".len()..];
        assert!(
            after.starts_with("<w:p><w:pPr><w:spacing w:before=\"0\" w:after=\"0\" w:line=\"120\" w:lineRule=\"exact\""),
            "表格后的 gap 段落高度不符合规范: {}", &after[..after.len().min(180)]
        );
        // 段后距绝不能回到 6pt：Word 会把段前/段后相加
        assert!(!after[..after.len().min(400)].contains("w:after=\"120\""), "表格后仍有段后距: {}", &after[..after.len().min(400)]);
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
        assert!(doc.contains("<w:ind w:left=\"840\" w:hanging=\"210\"/>"), "嵌套层缩进丢失: {}", doc);

        // 项目符号嵌套：二级换用同尺寸的 ◦（不再靠 ilvl 递进），缩进同步 1440
        let bullets = xml_of("- 一级\n  - 二级\n");
        assert!(bullets.contains("<w:ind w:left=\"840\" w:hanging=\"210\"/>"), "二级缩进丢失: {}", bullets);
        let bn = docx_part("- 一级\n  - 二级\n", test_theme(), "word/numbering.xml");
        assert!(bn.contains("<w:lvlText w:val=\"\u{25E6}\"/>"), "二级项目符号应为 ◦: {}", bn);
        // 无序里嵌有序：有序层仍是 ilvl=0
        let mixed = xml_of("- 甲\n  1. 一\n  2. 二\n");
        assert!(mixed.contains("<w:ind w:left=\"840\" w:hanging=\"210\"/>"), "混合嵌套缩进丢失: {}", mixed);
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
            doc.matches("<w:ind w:left=\"420\" w:hanging=\"210\"/>").count(),
            2,
            "任务项缩进未对齐编号文本位: {}", doc
        );
        // 勾选字形必须在正文字体里没有字形，需显式指定符号字体
        assert!(doc.contains("w:ascii=\"Segoe UI Symbol\""), "任务字形未指定符号字体: {}", doc);
    }

    #[test]
    fn mixed_inline_syntax_in_task_list_exports_clean_text_and_one_glyph() {
        // 专项：任务项里混排行内代码、加粗、行内 HTML（与预览/实时模式同一份 Markdown）。
        // 导出必须：内容只出现一次、不泄漏 `**` / 反引号、勾选字形只出现一次。
        let doc = xml_of("- [ ] 含 **加粗** 与 `代码`\n  - [x] 嵌套 <sup>2</sup>\n");
        let text = doc_text(&doc);
        assert_eq!(text.matches("加粗").count(), 1, "加粗内容重复或被吞: {}", text);
        assert_eq!(text.matches("代码").count(), 1, "行内代码重复或被吞: {}", text);
        assert!(!text.contains("**"), "加粗标记泄漏到 Word: {}", text);
        assert!(!text.contains("`代码`"), "反引号泄漏到 Word: {}", text);
        assert_eq!(doc.matches("☐").count(), 1, "未完成任务字形应只有一个: {}", doc);
        assert_eq!(doc.matches("☑").count(), 1, "已完成任务字形应只有一个: {}", doc);
        assert!(!doc.contains("<w:numPr>"), "任务项不应再叠加项目符号/编号: {}", doc);
        assert!(doc.contains("<w:vertAlign w:val=\"superscript\"/>"), "行内 <sup> 未生效: {}", doc);
    }

    #[test]
    fn superscript_subscript_and_inline_html_map_to_runs() {
        // `<sup>`/`<sub>` HTML 与 `^a^`/`~b~` 扩展语法都映射到同一套 run 属性
        let doc = xml_of("上标 <sup>2</sup> 与 <sub>i</sub>\n\n语法 ^a^ 与 ~b~，删除 ~~x~~\n");
        assert_eq!(
            doc.matches("<w:vertAlign w:val=\"superscript\"/>").count(), 2,
            "上标（HTML + ^^）未生效: {}", doc
        );
        assert_eq!(
            doc.matches("<w:vertAlign w:val=\"subscript\"/>").count(), 2,
            "下标（HTML + ~）未生效: {}", doc
        );
        let text = doc_text(&doc);
        assert!(!text.contains("^a^"), "`^a^` 仍残留字面: {}", text);
        assert!(!text.contains("~b~"), "`~b~` 仍残留字面: {}", text);
        assert!(doc.contains("<w:strike/>"), "`~~x~~` 删除线失效: {}", doc);
        // 回归：上下标不能把整段拆碎
        assert_eq!(doc.matches("<w:p>").count(), 2, "段落被拆碎: {}", doc);
    }

    #[test]
    fn inline_markers_do_not_pair_across_ranges() {
        // 回归：同一行多个数字区间，标点必须阻断配对，不能把 `512K、0` 吞成下标
        let doc = xml_of("数字区间：64K~512K、0~20、1~5\n");
        assert!(
            !doc.contains("<w:vertAlign w:val=\"subscript\"/>"),
            "跨区间不应变成下标: {}",
            doc
        );
        assert!(doc_text(&doc).contains("64K~512K"), "原文被改写: {}", doc);
    }

    #[test]
    fn superscript_does_not_swallow_footnote_reference() {
        // 回归：`^` 内容禁止 `[` `]`，孤立的 `^2^` 与 `^3^` 不能把 `[^1]` 卷进上标
        let doc = xml_of("正文 ^2^ 与脚注[^1]，后续 ^3^。\n\n[^1]: 脚注内容\n");
        assert_eq!(
            doc.matches("<w:vertAlign w:val=\"superscript\"/>").count(),
            2,
            "只应有两个上标: {}",
            doc
        );
        assert!(
            doc.contains("<w:footnoteReference w:id=\"1\"/>"),
            "脚注引用缺失: {}",
            doc
        );
    }

    #[test]
    fn highlight_keeps_nested_emphasis() {
        // 与预览同口径：`==**加粗**==` 在 Word 里同时是高亮 + 加粗
        let doc = xml_of("==**加粗** 与 *斜体*==\n");
        assert!(
            doc.contains("<w:highlight w:val=\"yellow\"/>"),
            "高亮缺失: {}",
            doc
        );
        assert!(doc.contains("<w:b/>"), "高亮内加粗丢失: {}", doc);
        assert!(doc.contains("<w:i/>"), "高亮内斜体丢失: {}", doc);
    }

    #[test]
    fn reported_cross_range_and_footnote_regressions() {
        // 用户实测上报：预览修好后 DOCX 仍错。前端曾另有一套转换规则，已改为只由 Rust 处理。
        let doc = xml_of("数字区间连写：64K~512K、0~20、1~5\n");
        assert_eq!(
            doc.matches("<w:vertAlign w:val=\"subscript\"/>").count(),
            0,
            "数字区间不应变成下标: {}",
            doc
        );
        assert!(doc_text(&doc).contains("64K~512K"), "原文被改写: {}", doc);

        let doc = xml_of("这里引用一个脚注[^1]，再引用第二个[^2]。\n\n[^1]: 一\n[^2]: 二\n");
        assert_eq!(
            doc.matches("<w:vertAlign w:val=\"superscript\"/>").count(),
            0,
            "脚注引用之间的文字不应变成上标: {}",
            doc
        );
        assert_eq!(
            doc.matches("<w:footnoteReference").count(),
            2,
            "两条脚注引用应各自保留: {}",
            doc
        );
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

