; =====================================================================
; YiziMarkdown NSIS 安装/卸载钩子
;
; 安装前：判断是不是全新安装（升级时不能重置用户语言）；把旧版安装目录里
;         可能被用户改过的主题/配置备份到用户文档目录，
;         供应用首次启动做一次性迁移（见 src-tauri/src/theme_layer.rs）
; 安装后：把安装向导选定的语言写进 HKCU（应用首次启动读取并自删，见
;         src-tauri/src/main.rs 的 take_install_language）；
;         自动注册 .md 文件关联（写入 HKCU，无需管理员权限）
; 卸载时：自动清理注册表（含上面那条语言标记），恢复系统默认 .md 关联
;
; 注意：本文件含中文，且 NSIS 脚本是 `Unicode true` —— 必须存成 **UTF-8 带 BOM**，
; 否则 makensis 按 ANSI 解码，LangString 里的中文会变成乱码。
; =====================================================================

; ----- 语言选择对话框（安装向导的第一步）-----
; Tauri 模板在 .onInit 里插 MUI_LANGDLL_DISPLAY，先弹这个选择框再进欢迎页。
; 标题/说明默认是英文的 "Installer Language"，这里按 NSIS 的 LCID 给出各语言文案
; （LangString 只认数字 LCID：钩子文件在 MUI_LANGUAGE 之前被 include，
;  此时 ${LANG_*} 常量还不存在，所以直接写 LCID）。
; 可用语言列表与顺序在 tauri.conf.json > bundle.windows.nsis.languages 里。
LangString yzLangTitle 2052 "选择安装语言"
LangString yzLangTitle 1028 "選擇安裝語言"
LangString yzLangTitle 1033 "Choose Installer Language"
LangString yzLangTitle 1041 "インストール言語の選択"
LangString yzLangTitle 1042 "설치 언어 선택"
LangString yzLangTitle 1031 "Installationssprache wählen"
LangString yzLangTitle 1036 "Choisir la langue d'installation"
LangString yzLangTitle 1034 "Elegir el idioma de instalación"
LangString yzLangTitle 2070 "Escolher o idioma de instalação"
LangString yzLangTitle 1040 "Scegli la lingua di installazione"
LangString yzLangTitle 1045 "Wybierz język instalacji"
LangString yzLangTitle 1043 "Installatielanguage kiezen"
LangString yzLangTitle 1055 "Kurulum dilini seçin"
LangString yzLangTitle 1053 "Välj installationsspråk"
LangString yzLangTitle 1058 "Вибір мови встановлення"

LangString yzLangInfo 2052 "安装向导与应用将使用该语言。"
LangString yzLangInfo 1028 "安裝精靈與應用程式將使用此語言。"
LangString yzLangInfo 1033 "Setup and the app will use this language."
LangString yzLangInfo 1041 "セットアップとアプリはこの言語を使用します。"
LangString yzLangInfo 1042 "설치 마법사와 앱이 이 언어를 사용합니다."
LangString yzLangInfo 1031 "Setup und App verwenden diese Sprache."
LangString yzLangInfo 1036 "L'installation et l'app utiliseront cette langue."
LangString yzLangInfo 1034 "La instalación y la app usarán este idioma."
LangString yzLangInfo 2070 "A instalação e o app usarão este idioma."
LangString yzLangInfo 1040 "L'installazione e l'app useranno questa lingua."
LangString yzLangInfo 1045 "Instalator i aplikacja użyją tego języka."
LangString yzLangInfo 1043 "Setup en app gebruiken deze taal."
LangString yzLangInfo 1055 "Kurulum ve uygulama bu dili kullanacak."
LangString yzLangInfo 1053 "Installeraren och appen använder detta språk."
LangString yzLangInfo 1058 "Майстер і застосунок використовуватимуть цю мову."

; 覆盖 MUI 的英文默认文案（在 .onInit 插入 MUI_LANGDLL_DISPLAY 之前生效即可）
!define MUI_LANGDLL_WINDOWTITLE "$(yzLangTitle)"
!define MUI_LANGDLL_INFO "$(yzLangInfo)"

; 应用首次启动读取的一次性语言标记（与 src-tauri/src/main.rs 的 INSTALL_LANG_REGKEY/VALUE 一致）。
; 刻意放在自己的子键 ``Software\YiziMarkdown\Installer`` 里：Tauri 模板用
; ``Software\${MANUFACTURER}\${PRODUCTNAME}``（本产品是 Software\yizimarkdown\YiziMarkdown）
; 存安装目录与「Installer Language」，Windows 注册表键名不分大小写 —— 直接写
; ``Software\YiziMarkdown`` 会和它落到同一个键上，卸载时的 /ifempty 清理可能互相踩。
!define YZ_LANG_REGKEY "Software\YiziMarkdown\Installer"
!define YZ_LANG_REGVALUE "Language"

; 1 = 本次是全新安装（PREINSTALL 里判定，POSTINSTALL 里用）
Var YzFreshInstall

; ----- 安装前钩子：判定全新安装 + 升级时保留用户资产 -----
; 主题备份只在「尚未迁移」时执行（用户层 marker 不存在）。全新安装不会命中任何文件，
; 因此不会创建空目录。
!macro NSIS_HOOK_PREINSTALL
  ; 全新安装判定：安装目录里已有主程序，或注册表里已有卸载项 → 视为升级。
  ; 升级/自动更新时绝不能把用户后来改过的界面语言重置成安装语言 —— 装完重启
  ; 应用却突然换语言是很糟的体验。
  StrCpy $YzFreshInstall 1
  ${If} ${FileExists} "$INSTDIR\${MAINBINARYNAME}.exe"
    StrCpy $YzFreshInstall 0
  ${EndIf}
  ReadRegStr $0 SHCTX "${UNINSTKEY}" "UninstallString"
  ${If} $0 != ""
    StrCpy $YzFreshInstall 0
  ${EndIf}

  ${IfNot} ${FileExists} "$PROFILE\Documents\yizimarkdown\themes\themes.user.json"
    ${If} ${FileExists} "$INSTDIR\user.css"
    ${OrIf} ${FileExists} "$INSTDIR\keybindings.json"
    ${OrIf} ${FileExists} "$INSTDIR\themes\theme.json"
      CreateDirectory "$PROFILE\Documents\yizimarkdown\themes\legacy-import"
      ; 主题：整目录 .css 一起备份；应用侧会与内置逐字节比对，
      ; 与内置相同的副本直接丢弃，只有真正改过的才进 overrides/
      CopyFiles /SILENT "$INSTDIR\themes\*.css" "$PROFILE\Documents\yizimarkdown\themes\legacy-import"
      CopyFiles /SILENT "$INSTDIR\themes\theme.json" "$PROFILE\Documents\yizimarkdown\themes\legacy-import"
      CopyFiles /SILENT "$INSTDIR\user.css" "$PROFILE\Documents\yizimarkdown\themes\legacy-import"
      CopyFiles /SILENT "$INSTDIR\keybindings.json" "$PROFILE\Documents\yizimarkdown\themes\legacy-import"
    ${EndIf}
  ${EndIf}
!macroend

; ----- 安装后钩子：安装语言交接 + 注册 .md 文件关联 -----
!macro NSIS_HOOK_POSTINSTALL
  ; 安装向导选定的语言（$LANGUAGE 是 NSIS 的 LCID）→ 应用语言 id。
  ; 只写「全新安装」：应用首次启动时读取并删除该值（take_install_language），
  ; 于是第一次打开就是安装时选的语言，之后一切以应用内设置为准。
  ${If} $YzFreshInstall == 1
    ${If} $LANGUAGE == 2052
      WriteRegStr HKCU "${YZ_LANG_REGKEY}" "${YZ_LANG_REGVALUE}" "zh"
    ${ElseIf} $LANGUAGE == 1028
      WriteRegStr HKCU "${YZ_LANG_REGKEY}" "${YZ_LANG_REGVALUE}" "zh-tw"
    ${ElseIf} $LANGUAGE == 1033
      WriteRegStr HKCU "${YZ_LANG_REGKEY}" "${YZ_LANG_REGVALUE}" "en"
    ${ElseIf} $LANGUAGE == 1041
      WriteRegStr HKCU "${YZ_LANG_REGKEY}" "${YZ_LANG_REGVALUE}" "ja"
    ${ElseIf} $LANGUAGE == 1042
      WriteRegStr HKCU "${YZ_LANG_REGKEY}" "${YZ_LANG_REGVALUE}" "ko"
    ${ElseIf} $LANGUAGE == 1031
      WriteRegStr HKCU "${YZ_LANG_REGKEY}" "${YZ_LANG_REGVALUE}" "de"
    ${ElseIf} $LANGUAGE == 1036
      WriteRegStr HKCU "${YZ_LANG_REGKEY}" "${YZ_LANG_REGVALUE}" "fr"
    ${ElseIf} $LANGUAGE == 1034
      WriteRegStr HKCU "${YZ_LANG_REGKEY}" "${YZ_LANG_REGVALUE}" "es"
    ${ElseIf} $LANGUAGE == 2070
      WriteRegStr HKCU "${YZ_LANG_REGKEY}" "${YZ_LANG_REGVALUE}" "pt"
    ${ElseIf} $LANGUAGE == 1046
      WriteRegStr HKCU "${YZ_LANG_REGKEY}" "${YZ_LANG_REGVALUE}" "pt"
    ${ElseIf} $LANGUAGE == 1040
      WriteRegStr HKCU "${YZ_LANG_REGKEY}" "${YZ_LANG_REGVALUE}" "it"
    ${ElseIf} $LANGUAGE == 1045
      WriteRegStr HKCU "${YZ_LANG_REGKEY}" "${YZ_LANG_REGVALUE}" "pl"
    ${ElseIf} $LANGUAGE == 1043
      WriteRegStr HKCU "${YZ_LANG_REGKEY}" "${YZ_LANG_REGVALUE}" "nl"
    ${ElseIf} $LANGUAGE == 1055
      WriteRegStr HKCU "${YZ_LANG_REGKEY}" "${YZ_LANG_REGVALUE}" "tr"
    ${ElseIf} $LANGUAGE == 1053
      WriteRegStr HKCU "${YZ_LANG_REGKEY}" "${YZ_LANG_REGVALUE}" "sv"
    ${ElseIf} $LANGUAGE == 1058
      WriteRegStr HKCU "${YZ_LANG_REGKEY}" "${YZ_LANG_REGVALUE}" "uk"
    ${Else}
      ; 语言列表里没有的语言（理论上进不来）：留空标记，应用侧会忽略
    ${EndIf}
  ${EndIf}

  WriteRegStr HKCU "Software\Classes\YiziMarkdown.md" "" "Markdown File"
  WriteRegStr HKCU "Software\Classes\YiziMarkdown.md" "DefaultIcon" "$INSTDIR\md-icon.ico,0"
  WriteRegStr HKCU "Software\Classes\YiziMarkdown.md\shell\open\command" "" '"$INSTDIR\YiziMarkdown.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\.md" "" "YiziMarkdown.md"
  ; 通知 Shell 刷新文件关联
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

; ----- 卸载后钩子：清理文件关联与语言标记 -----
!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey HKCU "Software\Classes\YiziMarkdown.md"
  DeleteRegKey HKCU "Software\Classes\.md"
  ; 尚未被应用消费的语言标记（装完没启动过就卸载）：一并清掉，避免下次全新安装
  ; 读到上一次安装的残留语言
  DeleteRegValue HKCU "${YZ_LANG_REGKEY}" "${YZ_LANG_REGVALUE}"
  DeleteRegKey /ifempty HKCU "${YZ_LANG_REGKEY}"
  ; 通知 Shell 刷新文件关联
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

