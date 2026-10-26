; =====================================================================
; YiziMarkdown NSIS 安装/卸载钩子
;
; 安装前：把旧版安装目录里可能被用户改过的主题/配置备份到用户文档目录，
;         供应用首次启动做一次性迁移（见 src-tauri/src/theme_layer.rs）
; 安装后：自动注册 .md 文件关联（写入 HKCU，无需管理员权限）
; 卸载时：自动清理注册表，恢复系统默认 .md 关联
; =====================================================================

; ----- 安装前钩子：升级时保留用户资产 -----
; 只在「尚未迁移」时执行（用户层 marker 不存在）。全新安装不会命中任何文件，
; 因此不会创建空目录。
!macro NSIS_HOOK_PREINSTALL
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

; ----- 安装后钩子：注册 .md 文件关联 -----
!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr HKCU "Software\Classes\YiziMarkdown.md" "" "Markdown File"
  WriteRegStr HKCU "Software\Classes\YiziMarkdown.md" "DefaultIcon" "$INSTDIR\md-icon.ico,0"
  WriteRegStr HKCU "Software\Classes\YiziMarkdown.md\shell\open\command" "" '"$INSTDIR\YiziMarkdown.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\.md" "" "YiziMarkdown.md"
  ; 通知 Shell 刷新文件关联
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

; ----- 卸载后钩子：清理文件关联 -----
!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey HKCU "Software\Classes\YiziMarkdown.md"
  DeleteRegKey HKCU "Software\Classes\.md"
  ; 通知 Shell 刷新文件关联
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
