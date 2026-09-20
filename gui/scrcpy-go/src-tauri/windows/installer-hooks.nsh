; Capture this directory before the macros expand in Tauri's generated script.
!define SCRCPY_GO_HOOK_DIR "${__FILEDIR__}"

!macro ScrcpyGoStopBackend
  ; Stop polling before releasing ADB, or the launcher may immediately restart it.
  !insertmacro CheckIfAppIsRunning "${MAINBINARYNAME}.exe" "${PRODUCTNAME}"

  Push $0
  Push $1
  Push $2
  InitPluginsDir
  File /oname=$PLUGINSDIR\scrcpy-go-stop-backend.ps1 "${SCRCPY_GO_HOOK_DIR}\stop-backend.ps1"
  StrCpy $2 "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe"
  ${If} ${RunningX64}
    ; The 32-bit installer needs native PowerShell to inspect 64-bit processes.
    StrCpy $2 "$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe"
  ${EndIf}
  DetailPrint "Releasing Scrcpy GO backend files..."
  nsExec::ExecToStack /TIMEOUT=15000 '"$2" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\scrcpy-go-stop-backend.ps1" -InstallDirectory "$INSTDIR"'
  Pop $0
  Pop $1
  ${If} $0 != 0
    DetailPrint "$1"
    Pop $2
    Pop $1
    Pop $0
    SetErrorLevel 1
    Abort "Could not release Scrcpy GO backend files. Close Scrcpy GO and its mirroring windows, then try again."
  ${EndIf}
  DetailPrint "$1"
  Pop $2
  Pop $1
  Pop $0
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro ScrcpyGoStopBackend
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro ScrcpyGoStopBackend
!macroend
