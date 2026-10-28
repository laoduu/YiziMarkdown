; YiziMarkdown —— NSIS 安装器的波兰语 Tauri 文案
;
; 为什么需要这个文件：Tauri 打包器自带 15 种语言的「它自己的」提示文案
; （安装/卸载维护页、WebView2 安装、降级保护等），列表里没有波兰语；
; 不补的话，选了 Polski 的安装器会在这些少数对话框里回落英文。
; 键名与 Tauri 上游 English.nsh 一一对应，只是把值换成波兰语。
;
; 注意：不要把本文件存成带 BOM 的 UTF-8 —— 打包器会自己补 BOM
; （tauri-bundler 的 write_utf8_with_bom），自带 BOM 会变成双 BOM。
LangString addOrReinstall ${LANG_POLISH} "Dodaj/ponownie zainstaluj komponenty"
LangString alreadyInstalled ${LANG_POLISH} "Już zainstalowano"
LangString alreadyInstalledLong ${LANG_POLISH} "${PRODUCTNAME} ${VERSION} jest już zainstalowany. Wybierz operację do wykonania i kliknij Dalej, aby kontynuować."
LangString appRunning ${LANG_POLISH} "{{product_name}} jest uruchomiony! Zamknij go i spróbuj ponownie."
LangString appRunningOkKill ${LANG_POLISH} "{{product_name}} jest uruchomiony!$\nKliknij OK, aby go zamknąć"
LangString chooseMaintenanceOption ${LANG_POLISH} "Wybierz operację konserwacji do wykonania."
LangString choowHowToInstall ${LANG_POLISH} "Wybierz sposób instalacji ${PRODUCTNAME}."
LangString createDesktop ${LANG_POLISH} "Utwórz skrót na pulpicie"
LangString dontUninstall ${LANG_POLISH} "Nie odinstalowuj"
LangString dontUninstallDowngrade ${LANG_POLISH} "Nie odinstalowuj (ten instalator nie pozwala instalować starszej wersji bez odinstalowania)"
LangString failedToKillApp ${LANG_POLISH} "Nie udało się zamknąć {{product_name}}. Zamknij go i spróbuj ponownie"
LangString installingWebview2 ${LANG_POLISH} "Instalowanie WebView2..."
LangString newerVersionInstalled ${LANG_POLISH} "Nowsza wersja ${PRODUCTNAME} jest już zainstalowana! Nie zaleca się instalowania starszej wersji. Jeśli naprawdę chcesz zainstalować tę starszą wersję, najpierw odinstaluj obecną. Wybierz operację do wykonania i kliknij Dalej, aby kontynuować."
LangString older ${LANG_POLISH} "starsza"
LangString olderOrUnknownVersionInstalled ${LANG_POLISH} "W systemie zainstalowana jest $R4 wersja ${PRODUCTNAME}. Zaleca się odinstalowanie obecnej wersji przed instalacją. Wybierz operację do wykonania i kliknij Dalej, aby kontynuować."
LangString silentDowngrades ${LANG_POLISH} "Ten instalator nie obsługuje instalacji starszej wersji; instalacja cicha nie może być kontynuowana, użyj instalatora graficznego.$\n"
LangString unableToUninstall ${LANG_POLISH} "Nie można odinstalować!"
LangString uninstallApp ${LANG_POLISH} "Odinstaluj ${PRODUCTNAME}"
LangString uninstallBeforeInstalling ${LANG_POLISH} "Odinstaluj przed instalacją"
LangString unknown ${LANG_POLISH} "nieznana"
LangString webview2AbortError ${LANG_POLISH} "Nie udało się zainstalować WebView2! Bez niego aplikacja nie może działać. Uruchom instalator ponownie."
LangString webview2DownloadError ${LANG_POLISH} "Błąd: pobieranie WebView2 nie powiodło się - $0"
LangString webview2DownloadSuccess ${LANG_POLISH} "Program inicjujący WebView2 został pobrany pomyślnie"
LangString webview2Downloading ${LANG_POLISH} "Pobieranie programu inicjującego WebView2..."
LangString webview2InstallError ${LANG_POLISH} "Błąd: instalacja WebView2 nie powiodła się, kod wyjścia $1"
LangString webview2InstallSuccess ${LANG_POLISH} "WebView2 został zainstalowany pomyślnie"
LangString deleteAppData ${LANG_POLISH} "Usuń dane aplikacji"
