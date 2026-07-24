# verify-uninstall.ps1 - run AFTER uninstalling Pavlov.
#
# Asserts the machine is completely clean: no running processes, no install
# dir, no userData, no updater cache, no autostart or uninstall registry
# entries, no shortcuts. Prints PASS/FAIL per check and exits 1 if anything
# survived.
#
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\verify-uninstall.ps1
#
# This is the real-world counterpart of tests/unit/uninstallCleanup.test.ts:
# the unit test locks what the uninstaller PROMISES, this script checks what
# a machine actually looks like after the promise ran.

$failures = @()

function Check([string]$label, [bool]$clean, [string]$detail) {
    if ($clean) {
        Write-Host "PASS  $label"
    } else {
        Write-Host "FAIL  $label -> $detail" -ForegroundColor Red
        $script:failures += $label
    }
}

# 1. No app process survived
$procs = @(Get-Process 'Pavlov' -ErrorAction SilentlyContinue)
Check 'no running app processes' ($procs.Count -eq 0) ("PIDs: " + (($procs | ForEach-Object Id) -join ', '))

# 2. Install directory
$installDir = "$env:LOCALAPPDATA\Programs\Pavlov"
Check "install dir gone: $installDir" (-not (Test-Path $installDir)) 'directory exists'

# 3. userData (pavlov-config.json, entitlement, install id, logs)
$userData = "$env:APPDATA\Pavlov"
Check "userData gone: $userData" (-not (Test-Path $userData)) 'directory exists'

# 4. electron-updater download cache
$updaterCache = "$env:LOCALAPPDATA\pavlov-updater"
Check "updater cache gone: $updaterCache" (-not (Test-Path $updaterCache)) 'directory exists'

# 5. Autostart Run values (AUMID name + legacy generic name if ours)
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$run = Get-ItemProperty $runKey -ErrorAction SilentlyContinue
$aumid = $run.'com.swisstropic.pavlov'
Check 'autostart Run value gone (com.swisstropic.pavlov)' ($null -eq $aumid) "$aumid"
$legacy = $run.'electron.app.Electron'
$legacyIsOurs = ($null -ne $legacy) -and ($legacy -like '*\Programs\Pavlov\*')
Check 'legacy autostart Run value gone (electron.app.Electron)' (-not $legacyIsOurs) "$legacy"

# 6. Uninstall registry keys
$uninstKeys = @(Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall' -ErrorAction SilentlyContinue |
    Where-Object {
        $p = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
        ($p.DisplayName -like 'Pavlov*') -or ($_.PSChildName -like '*com.swisstropic.pavlov*')
    })
Check 'uninstall registry keys gone' ($uninstKeys.Count -eq 0) (($uninstKeys | ForEach-Object PSChildName) -join ', ')

# 7. Shortcuts
foreach ($lnk in @(
    "$env:USERPROFILE\Desktop\Pavlov.lnk",
    "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Pavlov.lnk"
)) {
    Check "shortcut gone: $lnk" (-not (Test-Path $lnk)) 'shortcut exists'
}

Write-Host ''
if ($failures.Count -eq 0) {
    Write-Host 'CLEAN: no Pavlov residuals found.' -ForegroundColor Green
    exit 0
} else {
    Write-Host ("RESIDUALS FOUND: " + $failures.Count + " check(s) failed.") -ForegroundColor Red
    exit 1
}
