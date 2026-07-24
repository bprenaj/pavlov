# MapSense - custom NSIS uninstall cleanup (Uninstall Standard).
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
    # userData: settings (mapsense-config.json), entitlement, install id, logs.
    RMDir /r "$APPDATA\MapSense"

    # electron-updater download cache: staged installers and blockmaps under
    # %LOCALAPPDATA%, grows by roughly one installer per release. Never
    # removed by the stock uninstaller.
    RMDir /r "$LOCALAPPDATA\mapsense-updater"

    # Autostart entry written by app.setLoginItemSettings. On Windows the Run
    # value name is the AppUserModelId (set in src/main/index.ts for packaged
    # builds).
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.swisstropic.mapsense"

    # Generic Electron fallback Run value name: any unbranded Electron app
    # shares it, so it is deleted only when its command points into OUR
    # install dir.
    ClearErrors
    ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "electron.app.Electron"
    ${ifNot} ${Errors}
      StrCpy $1 "$LOCALAPPDATA\Programs\MapSense\"
      StrLen $2 $1
      StrCpy $3 $0 $2
      ${if} $3 == $1
        DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "electron.app.Electron"
      ${endif}
    ${endif}

    # Retired 1.0.x brand residue (product renamed 2026-07-24): userData
    # (already migrated into $APPDATA\MapSense at first run), updater cache,
    # and autostart Run value. The old install dir is NOT touched; its own
    # uninstaller owns it.
    RMDir /r "$APPDATA\Pavlov"
    RMDir /r "$LOCALAPPDATA\pavlov-updater"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.swisstropic.pavlov"
  ${endif}
!macroend
