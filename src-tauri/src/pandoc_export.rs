//! Pandoc-based DOCX export.
//!
//! This path is intentionally separate from `docx_export.rs`: the built-in
//! exporter always works offline, while this one delegates to the user's local
//! Pandoc installation and can apply a custom Word reference document.

use std::env;
use std::ffi::OsString;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

pub const PANDOC_NOT_FOUND: &str = "PANDOC_NOT_FOUND";
pub const PANDOC_FAILED: &str = "PANDOC_FAILED";
pub const PANDOC_TEMPLATE_INVALID: &str = "PANDOC_TEMPLATE_INVALID";

/// Convert Markdown to DOCX with Pandoc.
///
/// `base_dir` is used both as the process working directory and Pandoc's
/// resource path, so relative image paths behave like they do in the editor.
/// `template` must be an existing `.docx` reference document.
pub fn markdown_to_docx(
    markdown: &str,
    output: &Path,
    base_dir: Option<&Path>,
    template: Option<&Path>,
) -> Result<(), String> {
    if let Some(template) = template {
        if !is_valid_template(template) {
            return Err(format!(
                "{}: reference document must be an existing .docx file: {}",
                PANDOC_TEMPLATE_INVALID,
                template.display()
            ));
        }
    }

    let output_dir = output
        .parent()
        .ok_or_else(|| format!("{}: invalid output path", PANDOC_FAILED))?;
    if !output_dir.is_dir() {
        return Err(format!(
            "{}: output directory does not exist: {}",
            PANDOC_FAILED,
            output_dir.display()
        ));
    }

    // Write beside the destination so the final copy stays on the same volume.
    // Pandoc needs the `.docx` suffix to select the DOCX writer.
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let file_name = output
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("document.docx");
    let temp_output = output_dir.join(format!(
        ".{}.{}.{}.tmp.docx",
        file_name,
        std::process::id(),
        stamp
    ));

    let args = build_args(&temp_output, base_dir, template);
    let mut last_not_found = None;

    for program in pandoc_candidates() {
        let mut command = Command::new(&program);
        command
            .args(&args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(target_os = "windows")]
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
        if let Some(dir) = base_dir {
            if dir.is_dir() {
                command.current_dir(dir);
            }
        }

        let mut child = match command.spawn() {
            Ok(child) => child,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                last_not_found = Some(e);
                continue;
            }
            Err(e) => {
                let _ = std::fs::remove_file(&temp_output);
                return Err(format!(
                    "{}: failed to start {}: {}",
                    PANDOC_FAILED,
                    program.display(),
                    e
                ));
            }
        };

        // Read stdout/stderr while stdin is being written. Waiting for a large
        // Markdown document first can deadlock if Pandoc fills an output pipe.
        let input = markdown.as_bytes().to_vec();
        let writer = child
            .stdin
            .take()
            .map(|mut stdin| std::thread::spawn(move || stdin.write_all(&input)));
        let result = child.wait_with_output();
        let write_error = writer
            .and_then(|handle| handle.join().ok())
            .and_then(Result::err);
        if let Some(e) = write_error {
            let _ = std::fs::remove_file(&temp_output);
            return Err(format!(
                "{}: failed to send Markdown to Pandoc: {}",
                PANDOC_FAILED, e
            ));
        }
        let result = match result {
            Ok(result) => result,
            Err(e) => {
                let _ = std::fs::remove_file(&temp_output);
                return Err(format!(
                    "{}: failed waiting for Pandoc: {}",
                    PANDOC_FAILED, e
                ));
            }
        };

        if !result.status.success() {
            let stderr = String::from_utf8_lossy(&result.stderr);
            let detail = stderr.trim();
            let _ = std::fs::remove_file(&temp_output);
            return Err(if detail.is_empty() {
                format!("{}: Pandoc exited with {}", PANDOC_FAILED, result.status)
            } else {
                format!("{}: {}", PANDOC_FAILED, detail)
            });
        }

        if let Err(e) = std::fs::copy(&temp_output, output) {
            let _ = std::fs::remove_file(&temp_output);
            return Err(format!(
                "{}: failed to write output file {}: {}",
                PANDOC_FAILED,
                output.display(),
                e
            ));
        }
        let _ = std::fs::remove_file(&temp_output);
        return Ok(());
    }

    Err(match last_not_found {
        Some(e) => format!(
            "{}: Pandoc executable not found ({}). Install Pandoc or add it to PATH.",
            PANDOC_NOT_FOUND, e
        ),
        None => format!(
            "{}: Pandoc executable not found. Install Pandoc or add it to PATH.",
            PANDOC_NOT_FOUND
        ),
    })
}

pub fn is_valid_template(path: &Path) -> bool {
    path.is_file()
        && path
            .extension()
            .and_then(|ext| ext.to_str())
            .is_some_and(|ext| ext.eq_ignore_ascii_case("docx"))
}

fn build_args(
    output: &Path,
    base_dir: Option<&Path>,
    template: Option<&Path>,
) -> Vec<OsString> {
    let mut args = vec![
        OsString::from("--from=markdown"),
        OsString::from("--to=docx"),
        OsString::from("--standalone"),
        OsString::from("--output"),
        output.as_os_str().to_owned(),
    ];
    if let Some(dir) = base_dir {
        args.push(OsString::from("--resource-path"));
        args.push(dir.as_os_str().to_owned());
    }
    if let Some(template) = template {
        args.push(OsString::from("--reference-doc"));
        args.push(template.as_os_str().to_owned());
    }
    args
}

fn pandoc_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(path) = env::var_os("YIZIMARKDOWN_PANDOC") {
        if !path.is_empty() {
            candidates.push(PathBuf::from(path));
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Some(local) = env::var_os("LOCALAPPDATA") {
            candidates.push(PathBuf::from(local).join("Pandoc").join("pandoc.exe"));
        }
        if let Some(program_files) = env::var_os("ProgramFiles") {
            candidates.push(
                PathBuf::from(program_files)
                    .join("Pandoc")
                    .join("pandoc.exe"),
            );
        }
        if let Some(program_files_x86) = env::var_os("ProgramFiles(x86)") {
            candidates.push(
                PathBuf::from(program_files_x86)
                    .join("Pandoc")
                    .join("pandoc.exe"),
            );
        }
    }

    #[cfg(target_os = "macos")]
    {
        candidates.push(PathBuf::from("/opt/homebrew/bin/pandoc"));
        candidates.push(PathBuf::from("/usr/local/bin/pandoc"));
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        candidates.push(PathBuf::from("/usr/bin/pandoc"));
        candidates.push(PathBuf::from("/usr/local/bin/pandoc"));
    }

    // Finally let the OS resolve it from PATH.
    candidates.push(PathBuf::from(if cfg!(target_os = "windows") {
        "pandoc.exe"
    } else {
        "pandoc"
    }));

    let mut deduped = Vec::new();
    for candidate in candidates {
        if !deduped.iter().any(|existing| existing == &candidate) {
            deduped.push(candidate);
        }
    }
    deduped
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn args_include_template_and_resource_path() {
        let args = build_args(
            Path::new("out.docx"),
            Some(Path::new("docs")),
            Some(Path::new("reference.docx")),
        );
        let args: Vec<String> = args
            .into_iter()
            .map(|arg| arg.to_string_lossy().to_string())
            .collect();
        assert!(args.windows(2).any(|w| w == ["--output", "out.docx"]));
        assert!(!args.contains(&"--toc".to_string()));
        assert!(args.windows(2).any(|w| w == ["--resource-path", "docs"]));
        assert!(args
            .windows(2)
            .any(|w| w == ["--reference-doc", "reference.docx"]));
    }

    #[test]
    fn template_must_exist_and_have_docx_extension() {
        assert!(!is_valid_template(Path::new("missing.docx")));
        assert!(!is_valid_template(Path::new("README.md")));
    }

    #[test]
    fn exports_with_reference_doc_when_pandoc_is_available() {
        let probe = match Command::new("pandoc").arg("--version").output() {
            Ok(output) if output.status.success() => output,
            _ => return,
        };
        assert!(String::from_utf8_lossy(&probe.stdout).contains("pandoc"));

        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let dir = env::temp_dir().join(format!(
            "yizimd-pandoc-export-{}-{}",
            std::process::id(),
            stamp
        ));
        std::fs::create_dir_all(&dir).unwrap();

        let template = dir.join("reference.docx");
        let default_template = Command::new("pandoc")
            .args(["--print-default-data-file", "reference.docx"])
            .output()
            .unwrap();
        assert!(default_template.status.success());
        std::fs::write(&template, &default_template.stdout).unwrap();

        let output = dir.join("output.docx");
        markdown_to_docx(
            "# 标题\n\n正文\n\n```mermaid\ngraph LR\nA-->B\n```\n",
            &output,
            Some(&dir),
            Some(&template),
        )
        .unwrap();
        let bytes = std::fs::read(&output).unwrap();
        assert!(bytes.starts_with(b"PK"), "Pandoc 输出不是有效的 OOXML 包");

        let _ = std::fs::remove_file(template);
        let _ = std::fs::remove_file(output);
        let _ = std::fs::remove_dir(dir);
    }
}
