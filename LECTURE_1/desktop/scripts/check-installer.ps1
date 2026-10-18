$ErrorActionPreference = 'Stop'
$qaRoot = [IO.Path]::GetFullPath($env:ATTENTION_SMOKE_DIR)
$qaEvidence = Join-Path $qaRoot 'smoke'
New-Item -ItemType Directory -Path $qaEvidence -Force | Out-Null
$qaInstaller = (Resolve-Path 'dist/CODEPLANT-ATTENTION-Setup.exe').Path
$qaInstall = Join-Path $qaRoot '설치 검사 #1\CODEPLANT ATTENTION'
$qaDesktop = [Environment]::GetFolderPath('Desktop')
$qaPrograms = [Environment]::GetFolderPath('Programs')
$qaNode = (Get-Command node.exe).Source

# This is a disposable hosted Windows runner, never the user's existing profile.
$env:USERPROFILE = Join-Path $qaRoot '새 사용자'
$env:APPDATA = Join-Path $env:USERPROFILE 'AppData\Roaming'
$env:LOCALAPPDATA = Join-Path $env:USERPROFILE 'AppData\Local'
New-Item -ItemType Directory -Path $env:APPDATA,$env:LOCALAPPDATA,(Join-Path $env:USERPROFILE 'Desktop'),(Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs') -Force | Out-Null

$qaWizard = Start-Process -FilePath $qaInstaller -PassThru
for ($qaTry=0; $qaTry -lt 50; $qaTry++) {
  $qaWizard.Refresh()
  if ($qaWizard.MainWindowHandle -ne 0 -or $qaWizard.HasExited) { break }
  Start-Sleep -Milliseconds 200
}
$qaWizardTitle = $qaWizard.MainWindowTitle
try {
  Add-Type -AssemblyName System.Drawing,System.Windows.Forms
  $qaBounds = [Windows.Forms.Screen]::PrimaryScreen.Bounds
  $qaBitmap = New-Object Drawing.Bitmap($qaBounds.Width,$qaBounds.Height)
  $qaGraphics = [Drawing.Graphics]::FromImage($qaBitmap)
  $qaGraphics.CopyFromScreen($qaBounds.Location,[Drawing.Point]::Empty,$qaBounds.Size)
  $qaBitmap.Save((Join-Path $qaEvidence 'installer-wizard.png'))
  $qaGraphics.Dispose(); $qaBitmap.Dispose()
} catch { 'Hosted runner screenshot unavailable' | Set-Content (Join-Path $qaEvidence 'installer-wizard-note.txt') }
if (-not $qaWizard.HasExited) { Stop-Process -Id $qaWizard.Id -Force }

$qaSetup = Start-Process -FilePath $qaInstaller -ArgumentList @('/S','/currentuser',('/D='+$qaInstall)) -PassThru -Wait
if ($qaSetup.ExitCode -ne 0) { throw "Installer exit: $($qaSetup.ExitCode)" }
$qaExe = Join-Path $qaInstall 'CODEPLANT ATTENTION.exe'
if (-not (Test-Path -LiteralPath $qaExe)) { throw 'Installed executable missing' }
$qaShortcutShell = New-Object -ComObject WScript.Shell
$qaFoundShortcuts = @()
foreach ($qaCandidates in @(
  @((Join-Path $qaDesktop 'CODEPLANT ATTENTION.lnk'),(Join-Path $env:USERPROFILE 'Desktop\CODEPLANT ATTENTION.lnk')),
  @((Join-Path $qaPrograms 'CODEPLANT ATTENTION.lnk'),(Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\CODEPLANT ATTENTION.lnk'))
)) {
  $qaShortcut = $qaCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if (-not $qaShortcut) { throw ('Shortcut missing from profile: '+($qaCandidates -join ', ')) }
  if ($qaShortcutShell.CreateShortcut($qaShortcut).TargetPath -ne $qaExe) { throw 'Shortcut target mismatch' }
  $qaFoundShortcuts += $qaShortcut
}
$qaRegistration = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' | Where-Object { $_.DisplayName -like 'CODEPLANT ATTENTION*' -and $_.DisplayVersion -eq '0.7.0' }
if (-not $qaRegistration) { throw 'Installed-app registration missing' }

# Confirm the installed app needs no globally installed Node, Python or AI CLI.
$env:PATH = "$env:SystemRoot\System32;$env:SystemRoot"
$qaApp = Start-Process -FilePath $qaExe -ArgumentList '--smoke-test' -PassThru
for ($qaTry=0; $qaTry -lt 90; $qaTry++) {
  if ((Test-Path (Join-Path $qaEvidence 'result.json')) -or (Test-Path (Join-Path $qaEvidence 'error.json'))) { break }
  Start-Sleep -Seconds 2
}
if (Test-Path (Join-Path $qaEvidence 'error.json')) { throw (Get-Content (Join-Path $qaEvidence 'error.json') -Raw) }
$qaResult = Get-Content (Join-Path $qaEvidence 'result.json') -Raw | ConvertFrom-Json
if (-not $qaResult.ok) { throw 'Installed app smoke failed' }
if (-not $qaApp.WaitForExit(10000)) { throw 'Installed app did not exit after verification' }

$qaData = Join-Path $env:APPDATA 'codeplant-attention-desktop\data'
New-Item -ItemType Directory -Path $qaData -Force | Out-Null
$qaSentinel = Join-Path $qaData 'preserve-test.txt'
'public fixture' | Set-Content -LiteralPath $qaSentinel
$qaUninstaller = Get-ChildItem -LiteralPath $qaInstall -Filter 'Uninstall*.exe' | Select-Object -First 1
if (-not $qaUninstaller) { throw 'Uninstaller missing' }
$qaUninstall = Start-Process -FilePath $qaUninstaller.FullName -ArgumentList '/S' -Wait -PassThru
for ($qaTry=0; $qaTry -lt 30 -and (Test-Path -LiteralPath $qaExe); $qaTry++) { Start-Sleep -Seconds 1 }
if ((Test-Path -LiteralPath $qaExe) -or -not (Test-Path -LiteralPath $qaSentinel)) { throw 'Uninstall or data preservation failed' }
@{ok=$true;wizardTitle=$qaWizardTitle;unicodeInstallPath=$true;cleanProfile=$true;globalToolsAbsent=$true;shortcuts=$qaFoundShortcuts;installedAppsRegistration=$true;uninstallPreservesData=$true;realModelCall=$false} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $qaEvidence 'installer-result.json') -Encoding utf8
