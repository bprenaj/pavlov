# Pavlov - custom NSIS uninstall cleanup (Uninstall Standard).
#
# electron-builder's stock uninstaller already kills running app processes and
# removes the install dir, shortcuts, and its own registry keys. This macro
# removes everything else the app writes on a machine. deleteAppDataOnUninstall
# is NOT used because it only works with one-click installers and ours is
# assisted (oneClick: false); userData is removed here instead.
#
# CRITICAL GUARD: auto-updates run the OLD uninstaller silently with the
# --updated flag before installing the new version. Everything here sits
# inside "ifNot isUpdated" so an update can never wipe user data, the
# autostart entry, or the updater cache mid-cycle. Do not move any cleanup
# outside this guard.
#
# tests/unit/uninstallCleanup.test.ts locks this file against the paths and
# names the app actually writes at runtime; update both together.

!macro customUnInstall
  ${ifNot} ${isUpdated}
    # userData: settings (pavlov-config.json), entitlement, install id, logs.
    RMDir /r "$APPDATA\Pavlov"

    # electron-updater download cache: staged installers and blockmaps under
    # %LOCALAPPDATA%, grows by roughly one installer per release. Never
    # removed by the stock uninstaller.
    RMDir /r "$LOCALAPPDATA\pavlov-updater"

    # Autostart entry written by app.setLoginItemSettings. On Windows the Run
    # value name is the AppUserModelId (set in src/main/index.ts for packaged
    # builds).
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.swisstropic.pavlov"

    # Generic Electron fallback Run value name: any unbranded Electron app
    # shares it, so it is deleted only when its command points into OUR
    # install dir.
    ClearErrors
    ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "electron.app.Electron"
    ${ifNot} ${Errors}
      StrCpy $1 "$LOCALAPPDATA\Programs\Pavlov\"
      StrLen $2 $1
      StrCpy $3 $0 $2
      ${if} $3 == $1
        DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "electron.app.Electron"
      ${endif}
    ${endif}
  ${endif}
!macroend
