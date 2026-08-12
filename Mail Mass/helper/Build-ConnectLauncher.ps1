# Builds helper/MailMass_Connect.bat — one file visitors download.
# Embeds MailMassHelper.ps1 as base64 so it works from Downloads on ANY PC.
# Run: powershell -ExecutionPolicy Bypass -File .\Build-ConnectLauncher.ps1

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$helperPath = Join-Path $here 'MailMassHelper.ps1'
$outPath = Join-Path $here 'MailMass_Connect.bat'

if (-not (Test-Path -LiteralPath $helperPath)) {
  throw "Missing $helperPath"
}

$bytes = [IO.File]::ReadAllBytes($helperPath)
$b64 = [Convert]::ToBase64String($bytes)

$bat = @"
@echo off
title Mail Mass — Connect YOUR Outlook
setlocal
echo.
echo  Mail Mass connects to Outlook on THIS computer only.
echo  Your mailbox. Not anyone else's.
echo.

set "DEST=%TEMP%\MailMassHelper"
if not exist "%DEST%" mkdir "%DEST%" >nul 2>&1

REM Decode embedded helper into %%TEMP%% (works from Downloads / Desktop / USB)
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop'; ^
   $b64=@'
$b64
'@; ^
   $path=Join-Path $env:TEMP 'MailMassHelper\MailMassHelper.ps1'; ^
   New-Item -ItemType Directory -Force -Path (Split-Path $path) | Out-Null; ^
   [IO.File]::WriteAllBytes($path,[Convert]::FromBase64String(($b64 -replace '\s',''))); ^
   Start-Process -FilePath powershell -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File', $path) -WindowStyle Normal"

if errorlevel 1 (
  echo.
  echo  Could not start. Right-click this file -^> Run as the signed-in user.
  echo  Classic Outlook desktop must be installed on this PC.
  pause
  exit /b 1
)

echo.
echo  Helper window opened. Return to Mail Mass — status should say Connected.
echo  Keep the helper window open while you send.
echo.
timeout /t 4 /nobreak >nul
exit /b 0
"@

[IO.File]::WriteAllText($outPath, $bat, [Text.UTF8Encoding]::new($false))
Write-Host "Wrote $outPath ($([math]::Round((Get-Item $outPath).Length/1KB,1)) KB)"
