//! pdf_export.rs — 静默导出 PDF（仅 Windows）。
//!
//! Tauri 自带的 Webview::print() 在 Windows 上不可用（仅 macOS），
//! 因此走 WebView2 COM 的 ICoreWebView2::PrintToPdf：
//! 前端把「纯文档 HTML」（预览内容 + 内联主题/KaTeX CSS）写入共享状态，
//! 隐藏窗口通过自定义协议 yiziexport 加载后静默打印到目标路径。
//!
//! 注意：本模块只负责「投递」导出任务（创建隐藏窗口 + 注册回调），
//! 不阻塞任何线程；结果通过 oneshot channel 返回，由 async 命令 await。

#[cfg(target_os = "windows")]
mod imp {
    use std::sync::Arc;
    use tauri::webview::PageLoadEvent;
    use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
    use webview2_com::Microsoft::Web::WebView2::Win32::{ICoreWebView2_7, ICoreWebView2PrintSettings};
    use webview2_com::PrintToPdfCompletedHandler;
    use windows_core::Interface;

    /// 投递 PDF 导出任务：创建隐藏窗口并注册加载完成回调（不阻塞）。
    /// 返回 oneshot 接收端，打印完成后（或失败时）收到结果。
    pub fn start_export(
        app: &AppHandle,
        path: String,
    ) -> Result<tokio::sync::oneshot::Receiver<Result<(), String>>, String> {
        let (tx, rx) = tokio::sync::oneshot::channel::<Result<(), String>>();
        // oneshot Sender 不可 Clone，用 Arc<Mutex<Option<_>>> 支持多条失败路径（先取先得）
        let tx_shared = Arc::new(std::sync::Mutex::new(Some(tx)));
        let tx_cb = tx_shared.clone();
        let tx_fail = tx_shared.clone();
        let tx_outer = tx_shared.clone();
        let app2 = app.clone();
        let export_url = url::Url::parse("yiziexport://localhost/")
            .map_err(|e| format!("parse export url failed: {}", e))?;

        // 窗口创建必须在主线程；这里只投递，不等待
        app.run_on_main_thread(move || {
            let builder = WebviewWindowBuilder::new(&app2, "pdf-export", WebviewUrl::CustomProtocol(export_url))
                .visible(false)
                .title("PDF Export")
                .inner_size(1200.0, 1600.0);

            let app3 = app2.clone();
            let tx3 = tx_cb;
            let path3 = path;
            let builder = builder.on_page_load(move |window, payload| {
                eprintln!("[pdf_export] on_page_load event={:?}", payload.event());
                if !matches!(payload.event(), PageLoadEvent::Finished) {
                    return;
                }
                eprintln!("[pdf_export] page loaded, starting print flow");
                let wv = window.as_ref().clone();
                let app4 = app3.clone();
                let tx4 = tx3.clone();
                let path4 = path3.clone();
                // 等待字体/布局稳定后再打印（HTML 已内联渲染结果，无需外部资源）
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(400));
                    let app_inner = app4.clone();
                    let _ = app4.run_on_main_thread(move || {
                        let app_close = app_inner.clone();
                        let tx4_wv = tx4.clone();
                        eprintln!("[pdf_export] calling PrintToPdf");
                        let app_close_wv = app_close.clone();
                        let with_result = wv.with_webview(move |platform| {
                            let tx_print = tx4_wv.clone();
                            let app_close_cb = app_close_wv.clone();
                            let result: Result<(), String> = (move || {
                                let core = unsafe { platform.controller().CoreWebView2() }
                                    .map_err(|e| format!("get CoreWebView2 failed: {}", e))?;
                                let core7: ICoreWebView2_7 = core
                                    .cast()
                                    .map_err(|e| format!("QueryInterface ICoreWebView2_7 failed: {}", e))?;
                                let mut pw: Vec<u16> = path4.encode_utf16().collect();
                                pw.push(0);
                                let handler = PrintToPdfCompletedHandler::create(Box::new(
                                    move |error: windows_core::Result<()>, succeeded: bool| {
                                        eprintln!("[pdf_export] print callback: error={:?} succeeded={}", error, succeeded);
                                        let res = if error.is_ok() && succeeded {
                                            Ok(())
                                        } else {
                                            Err(format!(
                                                "PrintToPdf failed: {:?} succeeded={}",
                                                error, succeeded
                                            ))
                                        };
                                        if let Some(t) = tx_print.lock().unwrap().take() {
                                            let _ = t.send(res);
                                        }
                                        // 打印完成后再关窗：过早关闭会取消进行中的打印任务，回调永不触发
                                        let _ = app_close_cb
                                            .get_webview_window("pdf-export")
                                            .map(|w| w.close());
                                        Ok(())
                                    },
                                ));
                                let settings: Option<&ICoreWebView2PrintSettings> = None;
                                unsafe {
                                    core7
                                        .PrintToPdf(
                                            windows_core::PCWSTR(pw.as_ptr()),
                                            settings,
                                            Some(&handler),
                                        )
                                        .map_err(|e| format!("PrintToPdf failed: {}", e))?;
                                }
                                eprintln!("[pdf_export] PrintToPdf submitted");
                                Ok(())
                            })();
                            if let Err(e) = result {
                                eprintln!("[pdf_export] print submission failed: {}", e);
                                let _ = app_close_wv
                                    .get_webview_window("pdf-export")
                                    .map(|w| w.close());
                                if let Some(t) = tx4_wv.lock().unwrap().take() {
                                    let _ = t.send(Err(e));
                                }
                            }
                        });
                        if let Err(e) = with_result {
                            eprintln!("[pdf_export] with_webview failed: {}", e);
                            let _ = app_close.get_webview_window("pdf-export").map(|w| w.close());
                            if let Some(t) = tx4.lock().unwrap().take() {
                                let _ = t.send(Err(format!("with_webview failed: {}", e)));
                            }
                        }
                    });
                });
            });

            if let Err(e) = builder.build() {
                if let Some(t) = tx_fail.lock().unwrap().take() {
                    let _ = t.send(Err(format!("create export window failed: {}", e)));
                }
            }
        })
        .map_err(|e| {
            if let Some(t) = tx_outer.lock().unwrap().take() {
                let _ = t.send(Err(format!("run_on_main_thread failed: {}", e)));
            }
            format!("run_on_main_thread failed: {}", e)
        })?;

        Ok(rx)
    }
}

#[cfg(not(target_os = "windows"))]
mod imp {
    pub fn start_export(
        _app: &tauri::AppHandle,
        _path: String,
    ) -> Result<tokio::sync::oneshot::Receiver<Result<(), String>>, String> {
        Err("PDF export is only supported on Windows".to_string())
    }
}

pub fn start_export(
    app: &tauri::AppHandle,
    path: String,
) -> Result<tokio::sync::oneshot::Receiver<Result<(), String>>, String> {
    imp::start_export(app, path)
}
