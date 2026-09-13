//! docx_export.rs — Markdown → DOCX (OOXML) 导出。
//!
//! 用 pulldown-cmark 解析 Markdown，手工生成 OOXML 包（zip）：
//! 标题/列表/表格/代码块/引用/图片全部使用 Word 原生语义，颜色由前端传入的主题变量决定。

use pulldown_cmark::{Event, HeadingLevel, Options, Parser, Tag};
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

/// 按原图宽高比计算插入尺寸（EMU，1px@96dpi = 9525），最大宽度 6in，避免比例变形
fn image_emu(ext: &str, data: &[u8]) -> (i64, i64) {
    match image_dimensions(ext, data) {
        Some((w, h)) => {
            const MAX_W_EMU: i64 = 5_486_400; // 6 英寸
            let w_emu = (w as i64) * 9525;
            let h_emu = (h as i64) * 9525;
            if w_emu > MAX_W_EMU {
                let scale = MAX_W_EMU as f64 / w_emu as f64;
                (MAX_W_EMU, (h_emu as f64 * scale) as i64)
            } else {
                (w_emu, h_emu)
            }
        }
        None => (4_572_000, 3_429_000), // 默认 5in × 3.75in
    }
}

struct ImageAsset {
    id: usize,
    ext: String,
    data: Vec<u8>,
}

pub struct DocxBuilder {
    body: String,
    rels: String,
    images: Vec<ImageAsset>,
    next_image_id: usize,
    next_link_id: usize,
    theme: DocxTheme,
    base_dir: Option<std::path::PathBuf>,
    list_stack: Vec<u32>, // numId 栈（有序=1，无序=2）
    quote_depth: u32,
}

impl DocxBuilder {
    fn new(theme: DocxTheme, base_dir: Option<std::path::PathBuf>) -> Self {
        DocxBuilder {
            body: String::new(),
            rels: String::new(),
            images: Vec::new(),
            next_image_id: 0,
            next_link_id: 0,
            theme,
            base_dir,
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

    fn image_run(&mut self, alt: &str, dest: &str) -> String {
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
        let (cx, cy) = image_emu(&ext, &data);
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
        let mut ppr = String::new();
        if !style.is_empty() {
            ppr.push_str(&format!("<w:pStyle w:val=\"{}\"/>", style));
        }
        if let Some((num_id, ilvl)) = num {
            ppr.push_str(&format!("<w:numPr><w:ilvl w:val=\"{}\"/><w:numId w:val=\"{}\"/></w:numPr>", ilvl, num_id));
        }
        self.body.push_str(&format!("<w:p><w:pPr>{}</w:pPr>", ppr));
    }

    fn p_end(&mut self) {
        self.body.push_str("</w:p>");
    }

    fn para_style(&self) -> &'static str {
        if self.quote_depth > 0 { "Quote" } else { "Normal" }
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
                            out.push_str(&self.image_run(&alt, &dest_url.to_string()));
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
                let inner = self.render_inlines(iter, InlineState::default(), 0);
                self.body.push_str(&inner);
                self.p_end();
            }
            Event::Start(Tag::Paragraph) => {
                self.p_start(self.para_style(), None);
                let inner = self.render_inlines(iter, InlineState::default(), 0);
                self.body.push_str(&inner);
                self.p_end();
            }
            Event::Start(Tag::BlockQuote(_)) => {
                self.quote_depth += 1;
                while let Some(ev2) = iter.next() {
                    match ev2 {
                        Event::End(_) => break, // 消费 End(BlockQuote)
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
                        Event::End(_) => break, // 消费 End(List)
                        Event::Start(_) => self.render_block_event(iter, ev2),
                        _ => {}
                    }
                }
                self.list_stack.pop();
            }
            Event::Start(Tag::Item) => {
                let num = self.list_stack.last().copied().map(|id| (id, self.list_stack.len().saturating_sub(1) as u32));
                let mut checked: Option<bool> = None;
                let mut first = true;
                loop {
                    // 任务列表标记（若有）
                    if let Some(Event::TaskListMarker(c)) = iter.peek() {
                        checked = Some(*c);
                        iter.next();
                        continue;
                    }
                    match iter.peek() {
                        None => break,
                        Some(Event::End(_)) => {
                            iter.next(); // 消费 End(Item)
                            break;
                        }
                        Some(Event::Start(_)) => {
                            let ev2 = iter.next().unwrap();
                            if first {
                                self.p_start("ListParagraph", num);
                                let accent = self.theme.accent.clone();
                                if let Some(c) = checked {
                                    let glyph = if c { "☑ " } else { "☐ " };
                                    let run = self.run(glyph, InlineState::default(), false, Some(&accent));
                                    self.body.push_str(&run);
                                }
                                match ev2 {
                                    Event::Start(Tag::Paragraph) => {
                                        let inner = self.render_inlines(iter, InlineState::default(), 0);
                                        self.body.push_str(&inner);
                                    }
                                    _ => self.render_block_event(iter, ev2),
                                }
                                self.p_end();
                                first = false;
                            } else {
                                self.render_block_event(iter, ev2);
                            }
                        }
                        Some(_) => {
                            // tight list：整段内联内容包成 ListParagraph
                            if first {
                                self.p_start("ListParagraph", num);
                                let accent = self.theme.accent.clone();
                                if let Some(c) = checked {
                                    let glyph = if c { "☑ " } else { "☐ " };
                                    let run = self.run(glyph, InlineState::default(), false, Some(&accent));
                                    self.body.push_str(&run);
                                }
                                let inner = self.render_inlines(iter, InlineState::default(), 0);
                                self.body.push_str(&inner);
                                self.p_end();
                                first = false;
                            } else {
                                iter.next();
                            }
                        }
                    }
                }
            }
            Event::Start(Tag::Table(_)) => {
                self.body.push_str("<w:tbl><w:tblPr><w:tblW w:w=\"0\" w:type=\"auto\"/><w:tblBorders><w:top w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"BFBFBF\"/><w:left w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"BFBFBF\"/><w:bottom w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"BFBFBF\"/><w:right w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"BFBFBF\"/><w:insideH w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"BFBFBF\"/><w:insideV w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"BFBFBF\"/></w:tblBorders></w:tblPr>");
                while let Some(ev2) = iter.next() {
                    match ev2 {
                        Event::End(_) => break, // 消费 End(Table)
                        Event::Start(Tag::TableHead) | Event::Start(Tag::TableRow) => {
                            self.body.push_str("<w:tr>");
                            while let Some(ev3) = iter.next() {
                                match ev3 {
                                    Event::End(_) => break, // 消费 End(TableRow/TableHead)
                                    Event::Start(Tag::TableCell) => {
                                        self.body.push_str("<w:tc><w:tcPr><w:tcW w:w=\"0\" w:type=\"auto\"/></w:tcPr>");
                                        let mut cell_first = true;
                                        while let Some(ev4) = iter.next() {
                                            match ev4 {
                                                Event::End(_) => break, // 消费 End(TableCell)
                                                Event::Start(Tag::Paragraph) => {
                                                    self.p_start("Normal", None);
                                                    let inner = self.render_inlines(iter, InlineState::default(), 0);
                                                    self.body.push_str(&inner);
                                                    self.p_end();
                                                    cell_first = false;
                                                }
                                                _ if cell_first => {
                                                    self.p_start("Normal", None);
                                                    let first_run = match ev4 {
                                                        Event::Text(t) => self.run(&t, InlineState::default(), false, None),
                                                        Event::Code(c) => self.code_run(&c),
                                                        _ => String::new(),
                                                    };
                                                    self.body.push_str(&first_run);
                                                    let inner = self.render_inlines(iter, InlineState::default(), 0);
                                                    self.body.push_str(&inner);
                                                    self.p_end();
                                                    cell_first = false;
                                                }
                                                _ => {}
                                            }
                                        }
                                        self.body.push_str("</w:tc>");
                                    }
                                    _ => {}
                                }
                            }
                            self.body.push_str("</w:tr>");
                        }
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
                self.p_start(self.para_style(), None);
                let run = self.run(&h, InlineState::default(), false, None);
                self.body.push_str(&run);
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

/// 生成 docx 字节流
pub fn markdown_to_docx(md: &str, theme: DocxTheme, base_dir: Option<std::path::PathBuf>) -> Result<Vec<u8>, String> {
    let theme = DocxTheme {
        accent: theme.accent.trim_start_matches('#').to_uppercase(),
        text: theme.text.trim_start_matches('#').to_uppercase(),
        font: first_family(&theme.font),
        mono_font: first_family(&theme.mono_font),
    };

    let mut builder = DocxBuilder::new(theme, base_dir);
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
        };
        let bytes = markdown_to_docx(md, theme, None).expect("generate docx");
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
        };
        let bytes = markdown_to_docx(&md, theme, None).expect("generate docx");
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
        };
        let bytes = markdown_to_docx(md, theme, None).expect("generate docx");
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
        assert_eq!(image_emu("png", &png), (9525, 9525));
        // 未知格式返回 None → 默认尺寸
        assert_eq!(image_dimensions("webp", &png), None);

        // 1x1 WebP（VP8L 无损，w-1/h-1 打包在 14bit 字段）
        let webp: Vec<u8> = [
            0x52, 0x49, 0x46, 0x46, 0x12, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50,
            0x38, 0x4C, 0x05, 0x00, 0x00, 0x00, 0x2F, 0x00, 0x00, 0x00, 0x00, 0x00,
        ]
        .to_vec();
        assert_eq!(image_dimensions("webp", &webp), Some((1, 1)));
        assert_eq!(image_emu("webp", &webp), (9525, 9525));
    }
}

