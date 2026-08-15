!include "nsProcess.nsh"

!macro customInit
  ${nsProcess::FindProcess} "NEXUS Voice Console.exe" $R0
  ${If} $R0 == 0
    DetailPrint "正在安全关闭旧版 NEXUS Voice Console..."
    ${nsProcess::CloseProcess} "NEXUS Voice Console.exe" $R1
    Sleep 5000
    ${nsProcess::FindProcess} "NEXUS Voice Console.exe" $R0
    ${If} $R0 == 0
      DetailPrint "旧版仍在运行，仅结束 NEXUS 自身进程..."
      ${nsProcess::KillProcess} "NEXUS Voice Console.exe" $R1
      Sleep 1200
    ${EndIf}
  ${EndIf}
  ${nsProcess::Unload}

  ; Do not launch the old uninstaller from inside the new installer: older NSIS
  ; releases can treat the parent as a competing installer and stop it. The
  ; install directory is considered safe only when both NEXUS marker files are
  ; present. User data lives under AppData\Roaming and is never touched here.
  ${If} ${FileExists} "$INSTDIR\NEXUS Voice Console.exe"
  ${AndIf} ${FileExists} "$INSTDIR\Uninstall NEXUS Voice Console.exe"
    DetailPrint "正在移除旧版程序文件（保留用户数据）..."
    RMDir /r "$INSTDIR"
    DeleteRegKey HKCU "${UNINSTALL_REGISTRY_KEY}"
    DeleteRegKey HKCU "${INSTALL_REGISTRY_KEY}"
    Sleep 1000
  ${EndIf}
!macroend
