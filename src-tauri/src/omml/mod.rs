//! tex2word math engine — LaTeX math -> OMML (OfficeMath).
//!
//! A LaTeX-math parser builds a small AST, and an OMML renderer produces the
//! `m:` elements Word edits as native equations. The public entry point wraps
//! the rendered content in an `<m:oMath>` element (the `m` namespace is declared
//! on the document root by the back-end).
//!
//! # 来源与许可（vendor 说明）
//!
//! 本目录是 [`tex2word-math`](https://crates.io/crates/tex2word-math) **v1.0.6**
//! 的源码副本（`src/lib.rs` → 本文件，另有 `omml.rs` / `parser.rs` / `symbols.rs`），
//! 来自 <https://github.com/yfyang86/rstex2word>，作者 Yifan Yang，MIT 许可
//! （见同目录 `LICENSE-MIT`）。
//!
//! 之所以 vendor 而不是加依赖：该 crate 发布极新（2026-07，下载量数百），
//! 而我们把它放在 Markdown → DOCX 的关键路径上；源码仅约 46 KB 且**零外部依赖**，
//! 复制进来后上游若停止维护也不影响构建，同时便于逐条加回归断言。
//! 上游四个文件保持原样，**仅两处 `use` 路径**改为 `crate::omml::…`（上游按「lib 根」写
//! `crate::parser` / `crate::symbols`，vendor 成子模块后必须补全路径），其余逐字节不变；
//! 需要调整覆盖率时在本目录外（`docx_export.rs`）做兜底与后处理，不改上游逻辑。

mod omml;
mod parser;
mod symbols;

/// Render inline LaTeX math to a complete `<m:oMath>…</m:oMath>` element.
pub fn to_omath(latex: &str) -> String {
    format!("<m:oMath>{}</m:oMath>", omml::render(&parser::parse(latex)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wraps_in_omath() {
        let x = to_omath("x^2");
        assert!(x.starts_with("<m:oMath>") && x.ends_with("</m:oMath>"));
        assert!(x.contains("<m:sSup>"));
    }

    #[test]
    fn full_expression() {
        // E = mc^2 -> a leading text run (E=m, adjacent runs merge) + sSup for c^2
        let x = to_omath("E = mc^2");
        assert!(x.contains("<m:sSup>"));
        assert!(x.contains('E') && x.contains("<m:t>c</m:t>"));
    }
}
