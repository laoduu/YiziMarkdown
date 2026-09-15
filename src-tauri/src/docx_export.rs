//! docx_export.rs — Markdown → DOCX (OOXML) 导出。
//!
//! 用 pulldown-cmark 解析 Markdown，手工生成 OOXML 包（zip）：
//! 标题/列表/表格/代码块/引用/图片全部使用 Word 原生语义，颜色由前端传入的主题变量决定。

use pulldown_cmark::{Alignment, Event, HeadingLevel, Options, Parser, Tag, TagEnd};
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
            c if (c as u32) < 0x20 && c != '\t' && c != '\n' && c != '\r' => {}
            c => out.push(c),
        }
    }
    out
}

/// 从 CSS font-family 栈提取第一个族名（去掉引号）
fn first_family(stack: &str) -> String {
    let s = stack.trim();
    if let Some(start) = s.find('\'') {
        if let Some(end) = s[start + 1..].find('\'') {
            return s[start + 1..start + 1 + end].to_string();
        }
    }
    s.split(',').next().unwrap_or("").trim().trim_matches('"').to_string()
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

#[derive(Default, Clone, Copy)]
struct InlineState {
    bold: bool,
    italic: bool,
    strike: bool,
    link: bool,
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
    const EMU_PER_PX: i64 = 9525; // 1px @96dpi
    const EMU_PER_PT: i64 = 12700;
    const MAX_W_EMU: i64 = 5_486_400; // 6 英寸（A4 正文可用宽约 6.27in，留余量）

    let natural = image_dimensions(ext, data);
    // 目标宽度：显式 width 优先，否则原图宽度（未知则默认 5in）
    let target_w = match width_hint {
        Some(SizeHint::Px(v)) => (v * EMU_PER_PX as f64) as i64,
        Some(SizeHint::Pt(v)) => (v * EMU_PER_PT as f64) as i64,
        Some(SizeHint::Percent(p)) => (MAX_W_EMU as f64 * p / 100.0) as i64,
        None => natural.map_or(4_572_000, |(w, _)| w as i64 * EMU_PER_PX),
    };
    let w_emu = target_w.clamp(1, MAX_W_EMU);
    // 高度按原图比例；原图尺寸未知时按 4:3
    let h_emu = match natural {
        Some((w, h)) if w > 0 && h > 0 => (w_emu as f64 * h as f64 / w as f64) as i64,
        _ => (w_emu as f64 * 0.75) as i64,
    };
    (w_emu, h_emu.max(1))
}

struct ImageAsset {
    id: usize,
    ext: String,
    data: Vec<u8>,
}

/// 网络图片映射：原 URL → data URL。
/// 由调用方在导出前下载填充；生成器按解析出的 `dest_url` 精确查表，
/// 因此行内式 `![a](url)` 与引用式 `![a][id]`（解析后 dest_url 相同）都能命中。
pub type RemoteImages = std::collections::HashMap<String, String>;

pub struct DocxBuilder {
    body: String,
    rels: String,
    images: Vec<ImageAsset>,
    next_image_id: usize,
    next_link_id: usize,
    theme: DocxTheme,
    base_dir: Option<std::path::PathBuf>,
    remote_images: RemoteImages,
    list_stack: Vec<u32>, // numId 栈（有序=1，无序=2）
    quote_depth: u32,
}

impl DocxBuilder {
    fn new(theme: DocxTheme, base_dir: Option<std::path::PathBuf>, remote_images: RemoteImages) -> Self {
        DocxBuilder {
            body: String::new(),
            rels: String::new(),
            images: Vec::new(),
            next_image_id: 0,
            next_link_id: 0,
            theme,
            base_dir,
            remote_images,
            list_stack: Vec::new(),
            quote_depth: 0,
        }
    }

    // ---------- 文本/段落辅助 ----------

    fn run(&self, text: &str, st: InlineState, mono: bool, color: Option<&str>) -> String {
        let mut rpr = String::new();
        if st.bold { rpr.push_str("<w:b/><w:bCs/>"); }
        if st.italic { rpr.push_str("<w:i/><w:iCs/>"); }
        if st.strike { rpr.push_str("<w:strike/>"); }
        if st.link {
            rpr.push_str(&format!("<w:color w:val=\"{}\"/><w:u w:val=\"single\"/>", esc(&self.theme.accent)));
        }
        if mono {
            let f = esc(&self.theme.mono_font);
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

    fn code_run(&self, text: &str) -> String {
        let f = esc(&self.theme.mono_font);
        format!(
            "<w:r><w:rPr><w:rFonts w:ascii=\"{}\" w:hAnsi=\"{}\" w:cs=\"{}\"/><w:shd w:val=\"clear\" w:color=\"auto\" w:fill=\"F2F2F2\"/></w:rPr><w:t xml:space=\"preserve\">{}</w:t></w:r>",
            f, f, f, esc(text)
        )
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
            let ext = match mime.split(';').next().unwrap_or("") {
                "image/png" => "png",
                "image/jpeg" => "jpeg",
                "image/gif" => "gif",
                "image/bmp" => "bmp",
                "image/webp" => "webp",
                _ => "png",
            };
            match base64::engine::general_purpose::STANDARD.decode(b64.trim()) {
                Ok(bytes) => (bytes, ext.to_string()),
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
                Err(_) => return String::new(),
            };
            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("png").to_lowercase();
            let ext = match ext.as_str() {
                "jpg" | "jpeg" => "jpeg".to_string(),
                "png" => "png".to_string(),
                "gif" => "gif".to_string(),
                "bmp" => "bmp".to_string(),
                "webp" => "webp".to_string(),
                _ => return String::new(), // svg 等暂不支持嵌入
            };
            (data, ext)
        };

        self.next_image_id += 1;
        let img_id = self.next_image_id;
        let rid = format!("rIdImg{}", img_id);
        let file_name = format!("image{}.{}", img_id, ext);
        let (cx, cy) = image_emu(&ext, &data, width_hint);
        self.images.push(ImageAsset { id: img_id, ext, data });
        self.rels.push_str(&format!(
            "<Relationship Id=\"{}\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/image\" Target=\"media/{}\"/>",
            rid, file_name
        ));
        format!(
            "<w:r><w:drawing><wp:inline distT=\"0\" distB=\"0\" distL=\"0\" distR=\"0\"><wp:extent cx=\"{}\" cy=\"{}\"/><wp:docPr id=\"{}\" name=\"image{}\" descr=\"{}\"/><a:graphic xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\"><a:graphicData uri=\"http://schemas.openxmlformats.org/drawingml/2006/picture\"><pic:pic xmlns:pic=\"http://schemas.openxmlformats.org/drawingml/2006/picture\"><pic:nvPicPr><pic:cNvPr id=\"{}\" name=\"image{}\"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed=\"{}\"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"{}\" cy=\"{}\"/></a:xfrm><a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>",
            cx, cy, img_id, img_id, esc(alt), img_id, img_id, rid, cx, cy
        )
    }

    fn p_start(&mut self, style: &str, num: Option<(u32, u32)>) {
        self.p_start_ind(style, num, None);
    }

    fn p_start_ind(&mut self, style: &str, num: Option<(u32, u32)>, indent_left: Option<u32>) {
        let mut ppr = String::new();
        if !style.is_empty() {
            ppr.push_str(&format!("<w:pStyle w:val=\"{}\"/>", style));
        }
        if let Some((num_id, ilvl)) = num {
            ppr.push_str(&format!("<w:numPr><w:ilvl w:val=\"{}\"/><w:numId w:val=\"{}\"/></w:numPr>", ilvl, num_id));
        }
        if let Some(left) = indent_left {
            ppr.push_str(&format!("<w:ind w:left=\"{}\"/>", left));
        }
        self.body.push_str(&format!("<w:p><w:pPr>{}</w:pPr>", ppr));
    }

    fn p_end(&mut self) {
        self.body.push_str("</w:p>");
    }

    fn para_style(&self) -> &'static str {
        if self.quote_depth > 0 { "Quote" } else { "Normal" }
    }

    /// 任务列表勾选字形（内联 run）
    fn task_glyph(&self, checked: bool) -> String {
        let glyph = if checked { "☑ " } else { "☐ " };
        self.run(glyph, InlineState::default(), false, Some(&self.theme.accent))
    }

    /// 列表项段落：首段带编号/项目符号；续段仅用 ListParagraph + 与文本对齐的缩进。
    /// `level` 决定是否消费配对闭合标签：调用方已消费 Start(Paragraph) 时传 1（吃掉 End(Paragraph)），
    /// 紧凑列表项的行内内容无包裹标签时传 0。消费 iter 到本段结束为止。
    fn item_paragraph(&mut self, num: Option<(u32, u32)>, ilvl: u32, checked: Option<bool>, first: bool, level: u32, iter: &mut EventIter) {
        if first {
            self.p_start_ind("ListParagraph", num, None);
            if let Some(c) = checked {
                let glyph = self.task_glyph(c);
                self.body.push_str(&glyph);
            }
        } else {
            self.p_start_ind("ListParagraph", None, Some((ilvl + 1) * 720));
        }
        let inner = self.render_inlines(iter, InlineState::default(), level);
        self.body.push_str(&inner);
        self.p_end();
    }

    /// 空列表项（如 "- "）：只保留编号/项目符号，避免整个项目消失
    fn empty_item_paragraph(&mut self, num: Option<(u32, u32)>, checked: Option<bool>) {
        self.p_start("ListParagraph", num);
        if let Some(c) = checked {
            let glyph = self.task_glyph(c);
            self.body.push_str(&glyph);
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

    /// 单元格内容：紧凑段落（覆盖 Normal 的段后距/行距）+ 列对齐；表头文字加粗。
    fn render_table_cell(&mut self, iter: &mut EventIter, jc: &str, head: bool) {
        self.body.push_str(&format!(
            "<w:p><w:pPr><w:pStyle w:val=\"Normal\"/><w:spacing w:before=\"0\" w:after=\"0\" w:line=\"240\" w:lineRule=\"auto\"/><w:jc w:val=\"{}\"/></w:pPr>",
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
        matches!(
            tag,
            Tag::Emphasis | Tag::Strong | Tag::Strikethrough | Tag::Link { .. } | Tag::Image { .. }
        )
    }

    fn render_inlines(&mut self, iter: &mut EventIter, st: InlineState, level: u32) -> String {
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
                Event::Text(t) => out.push_str(&self.run(&t, st, false, None)),
                Event::Code(c) => out.push_str(&self.code_run(&c)),
                Event::SoftBreak | Event::HardBreak => out.push_str("<w:br/>"),
                // 行内 HTML 中的图片 <img src="…">
                Event::InlineHtml(h) => {
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
                        Tag::Link { dest_url, .. } => {
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
                self.p_start(self.para_style(), None);
                let inner = self.render_inlines(iter, InlineState::default(), 1);
                self.body.push_str(&inner);
                self.p_end();
            }
            Event::Start(Tag::BlockQuote(_)) => {
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
            }
            Event::Start(Tag::CodeBlock(_kind)) => {
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
                for line in code.split('\n') {
                    self.p_start("CodeBlock", None);
                    let run = self.run(line, InlineState::default(), true, None);
                    self.body.push_str(&run);
                    self.p_end();
                }
            }
            Event::Start(Tag::List(start)) => {
                let num_id = if start.is_some() { 1 } else { 2 };
                self.list_stack.push(num_id);
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
                let ilvl = self.list_stack.len().saturating_sub(1) as u32;
                let num = self.list_stack.last().copied().map(|id| (id, ilvl));
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
                                self.empty_item_paragraph(num, checked);
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
                            self.item_paragraph(num, ilvl, checked, first, 1, iter);
                            first = false;
                        }
                        // 行内起始标签（Strong/Emphasis/Link/Image/…）或紧凑项的行内内容：
                        // 不消费事件，交给 item_paragraph 统一渲染
                        Next::Inline | Next::Other => {
                            self.item_paragraph(num, ilvl, checked, first, 0, iter);
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
    for ext in exts {
        let mime = match ext.as_str() {
            "png" => "image/png",
            "jpeg" => "image/jpeg",
            "gif" => "image/gif",
            "bmp" => "image/bmp",
            "webp" => "image/webp",
            _ => continue,
        };
        s.push_str(&format!("<Default Extension=\"{}\" ContentType=\"{}\"/>", ext, mime));
    }
    s.push_str("<Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/><Override PartName=\"/word/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml\"/><Override PartName=\"/word/numbering.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml\"/></Types>");
    s
}

fn root_rels() -> String {
    "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/></Relationships>"
        .to_string()
}

fn styles_xml(theme: &DocxTheme) -> String {
    let accent = &theme.accent;
    let text = &theme.text;
    let font = &theme.font;
    let mono = &theme.mono_font;
    let mut s = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><w:styles xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">".to_string();
    // Normal
    s.push_str(&format!(
        "<w:style w:type=\"paragraph\" w:default=\"1\" w:styleId=\"Normal\"><w:name w:val=\"Normal\"/><w:qFormat/><w:pPr><w:spacing w:after=\"160\" w:line=\"360\" w:lineRule=\"auto\"/></w:pPr><w:rPr><w:rFonts w:ascii=\"{}\" w:hAnsi=\"{}\" w:eastAsia=\"{}\" w:cs=\"{}\"/><w:sz w:val=\"22\"/><w:szCs w:val=\"22\"/><w:color w:val=\"{}\"/></w:rPr></w:style>",
        esc(font), esc(font), esc(font), esc(font), esc(text)
    ));
    // 标题 1-6：主题强调色
    let sizes = [32, 28, 26, 24, 22, 20];
    for (i, sz) in sizes.iter().enumerate() {
        let lv = i + 1;
        s.push_str(&format!(
            "<w:style w:type=\"paragraph\" w:styleId=\"Heading{}\"><w:name w:val=\"heading {}\"/><w:basedOn w:val=\"Normal\"/><w:next w:val=\"Normal\"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before=\"360\" w:after=\"160\"/><w:outlineLvl w:val=\"{}\"/></w:pPr><w:rPr><w:b/><w:rFonts w:ascii=\"{}\" w:hAnsi=\"{}\" w:eastAsia=\"{}\"/><w:sz w:val=\"{}\"/><w:szCs w:val=\"{}\"/><w:color w:val=\"{}\"/></w:rPr></w:style>",
            lv, lv, i, esc(font), esc(font), esc(font), sz, sz, esc(accent)
        ));
    }
    // 列表段落
    s.push_str(
        "<w:style w:type=\"paragraph\" w:styleId=\"ListParagraph\"><w:name w:val=\"List Paragraph\"/><w:basedOn w:val=\"Normal\"/><w:qFormat/><w:pPr><w:spacing w:after=\"40\" w:line=\"360\" w:lineRule=\"auto\"/></w:pPr></w:style>",
    );
    // 代码块
    s.push_str(&format!(
        "<w:style w:type=\"paragraph\" w:styleId=\"CodeBlock\"><w:name w:val=\"Code Block\"/><w:basedOn w:val=\"Normal\"/><w:pPr><w:spacing w:after=\"0\" w:line=\"300\" w:lineRule=\"auto\"/><w:shd w:val=\"clear\" w:color=\"auto\" w:fill=\"F5F5F5\"/><w:ind w:left=\"120\"/></w:pPr><w:rPr><w:rFonts w:ascii=\"{}\" w:hAnsi=\"{}\" w:cs=\"{}\"/><w:sz w:val=\"20\"/></w:rPr></w:style>",
        esc(mono), esc(mono), esc(mono)
    ));
    // 引用
    s.push_str(&format!(
        "<w:style w:type=\"paragraph\" w:styleId=\"Quote\"><w:name w:val=\"Quote\"/><w:basedOn w:val=\"Normal\"/><w:qFormat/><w:pPr><w:spacing w:after=\"160\"/><w:ind w:left=\"360\"/><w:pBdr><w:left w:val=\"single\" w:sz=\"18\" w:space=\"8\" w:color=\"{}\"/></w:pBdr></w:pPr><w:rPr><w:color w:val=\"595959\"/></w:rPr></w:style>",
        esc(accent)
    ));
    s.push_str("</w:styles>");
    s
}

fn numbering_xml() -> String {
    // 有序列表：1. / 1.2. / 1.2.3.；无序列表：• / ◦ / ▪（三级缩进）
    let ordered_lvls = [
        (0, "%1.", 720, 360),
        (1, "%1.%2.", 1440, 360),
        (2, "%1.%2.%3.", 2160, 360),
    ];
    let bullet_lvls = [(0, "•", 720), (1, "◦", 1440), (2, "▪", 2160)];
    let mut s = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><w:numbering xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">");
    s.push_str("<w:abstractNum w:abstractNumId=\"0\"><w:multiLevelType w:val=\"hybridMultilevel\"/>");
    for (ilvl, text, left, hang) in ordered_lvls {
        s.push_str(&format!(
            "<w:lvl w:ilvl=\"{}\"><w:start w:val=\"1\"/><w:numFmt w:val=\"decimal\"/><w:lvlText w:val=\"{}\"/><w:lvlJc w:val=\"left\"/><w:pPr><w:ind w:left=\"{}\" w:hanging=\"{}\"/></w:pPr></w:lvl>",
            ilvl, text, left, hang
        ));
    }
    s.push_str("</w:abstractNum>");
    s.push_str("<w:abstractNum w:abstractNumId=\"1\"><w:multiLevelType w:val=\"hybridMultilevel\"/>");
    for (ilvl, text, left) in bullet_lvls {
        s.push_str(&format!(
            "<w:lvl w:ilvl=\"{}\"><w:start w:val=\"1\"/><w:numFmt w:val=\"bullet\"/><w:lvlText w:val=\"{}\"/><w:lvlJc w:val=\"left\"/><w:pPr><w:ind w:left=\"{}\" w:hanging=\"360\"/></w:pPr><w:rPr><w:rFonts w:ascii=\"Symbol\" w:hAnsi=\"Symbol\" w:hint=\"default\"/></w:rPr></w:lvl>",
            ilvl, text, left
        ));
    }
    s.push_str("</w:abstractNum>");
    s.push_str("<w:num w:numId=\"1\"><w:abstractNumId w:val=\"0\"/></w:num><w:num w:numId=\"2\"><w:abstractNumId w:val=\"1\"/></w:num></w:numbering>");
    s
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
    };

    let mut builder = DocxBuilder::new(theme, base_dir, remote_images);
    let parser = Parser::new_ext(md, Options::all());
    let mut iter = parser.peekable();
    while let Some(ev) = iter.next() {
        builder.render_block_event(&mut iter, ev);
    }

    let body_xml = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" xmlns:wp=\"http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing\"><w:body>{}<w:sectPr><w:pgSz w:w=\"11906\" w:h=\"16838\"/><w:pgMar w:top=\"1440\" w:right=\"1440\" w:bottom=\"1440\" w:left=\"1440\" w:header=\"708\" w:footer=\"708\" w:gutter=\"0\"/></w:sectPr></w:body></w:document>",
        builder.body
    );

    let doc_rels = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rIdStyles\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/><Relationship Id=\"rIdNumbering\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering\" Target=\"numbering.xml\"/>{}</Relationships>",
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
        let exts: Vec<String> = builder.images.iter().map(|i| i.ext.clone()).collect();
        add("[Content_Types].xml", content_types(&exts).as_bytes())?;
        add("_rels/.rels", root_rels().as_bytes())?;
        add("word/document.xml", body_xml.as_bytes())?;
        add("word/_rels/document.xml.rels", doc_rels.as_bytes())?;
        add("word/styles.xml", styles_xml(&builder.theme).as_bytes())?;
        add("word/numbering.xml", numbering_xml().as_bytes())?;
        for img in &builder.images {
            add(&format!("word/media/image{}.{}", img.id, img.ext), &img.data)?;
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
        let theme = DocxTheme {
            accent: "0066CC".into(),
            text: "333333".into(),
            font: "MiSans".into(),
            mono_font: "Consolas".into(),
            border: "D5E2FF".into(),
            surface: "F0F7FF".into(),
        };
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
        let theme = DocxTheme {
            accent: "0066CC".into(),
            text: "333333".into(),
            font: "MiSans".into(),
            mono_font: "Consolas".into(),
            border: "D5E2FF".into(),
            surface: "F0F7FF".into(),
        };
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
        let theme = DocxTheme {
            accent: "0066CC".into(),
            text: "333333".into(),
            font: "MiSans".into(),
            mono_font: "Consolas".into(),
            border: "D5E2FF".into(),
            surface: "F0F7FF".into(),
        };
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
        // 嵌套列表：内层应为独立段落 + ilvl=1
        let outer = doc.matches("<w:numId w:val=\"2\"").count();
        assert!(outer >= 3, "unordered list items missing: {}", outer);
        assert!(doc.contains("w:ilvl w:val=\"1\""), "nested list level missing");
        assert!(!doc.contains("外层</w:t></w:r><w:r><w:t xml:space=\"preserve\">内层嵌套"), "nested list collapsed into one paragraph");
        // numbering 多级
        assert!(numbering.matches("w:ilvl=\"").count() >= 6, "numbering missing levels");
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
        let theme = DocxTheme {
            accent: "0066CC".into(),
            text: "333333".into(),
            font: "MiSans".into(),
            mono_font: "Consolas".into(),
            border: "D5E2FF".into(),
            surface: "F0F7FF".into(),
        };
        let bytes = markdown_to_docx(md, theme, None, RemoteImages::new()).expect("generate docx");
        let reader = std::io::Cursor::new(&bytes);
        let mut zip = zip::ZipArchive::new(reader).expect("valid zip");
        let mut doc = String::new();
        zip.by_name("word/document.xml").unwrap().read_to_string(&mut doc).unwrap();
        doc
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
        assert!(doc.contains("w:numId w:val=\"2\""), "无序列表编号缺失: {}", doc);
        assert_eq!(doc.matches("ListParagraph").count(), 1, "应为单个列表段落: {}", doc);
    }

    #[test]
    fn ordered_list_item_starting_with_bold_keeps_content() {
        let doc = xml_of("1. **小标题**：说明文字\n");
        assert!(doc.contains("小标题"), "加粗小标题丢失: {}", doc);
        assert!(doc.contains("：说明文字"), "后续文本丢失: {}", doc);
        assert!(doc.contains("w:numId w:val=\"1\""), "有序列表编号缺失: {}", doc);
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
        assert!(doc.contains("w:ilvl w:val=\"1\""), "嵌套层级丢失: {}", doc);
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
        // 单元格：紧凑间距（覆盖 Normal 的段后距/行距）+ 顶对齐 + 列对齐
        assert!(doc.contains("<w:spacing w:before=\"0\" w:after=\"0\" w:line=\"240\" w:lineRule=\"auto\"/>"), "单元格间距未收紧: {}", doc);
        assert!(doc.contains("<w:vAlign w:val=\"top\"/>"), "单元格未顶对齐: {}", doc);
        assert!(doc.contains("<w:jc w:val=\"right\"/>"), "右对齐列未生效: {}", doc);
        assert_eq!(doc.matches("<w:tc>").count(), 4, "单元格数不对: {}", doc);
        assert_eq!(doc.matches("<w:tr>").count(), 2, "行数不对: {}", doc);
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

    /// 手动运行：把仓库根 README.md 导出为 docx 供人工在 Word 中核对
    /// cargo test --no-run 之后： cargo test write_readme_docx_for_inspection -- --ignored --nocapture
    #[test]
    #[ignore = "手动运行，产出 target/readme-export.docx 供人工核对"]
    fn write_readme_docx_for_inspection() {
        let manifest = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        let root = manifest.parent().expect("repo root");
        let md = std::fs::read_to_string(root.join("README.md")).expect("read README.md");
        let theme = DocxTheme {
            accent: "0066CC".into(),
            text: "333333".into(),
            font: "MiSans".into(),
            mono_font: "Consolas".into(),
            border: "D5E2FF".into(),
            surface: "F0F7FF".into(),
        };
        let bytes = markdown_to_docx(&md, theme, Some(root.to_path_buf()), RemoteImages::new()).expect("generate docx");
        let out = manifest.join("target/readme-export.docx");
        std::fs::write(&out, &bytes).expect("write docx");
        println!("已导出: {}", out.display());
    }
}

