; =====================================================================
; YiziMarkdown NSIS 安装/卸载钩子
;
; 安装时：自动注册 .md 文件关联（写入 HKCU，无需管理员权限）
; 卸载时：自动清理注册表，恢复系统默认 .md 关联
; =====================================================================

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
