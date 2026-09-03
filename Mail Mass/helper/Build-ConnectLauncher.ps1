# Builds helper/MailMass_Connect.bat - one small file visitors download.
# The .bat downloads the LATEST MailMassHelper.ps1 from the website into
# %LOCALAPPDATA%\MailMassHelper and starts it (same flow as the proven
# "Copy PowerShell command" button, so installs always get the newest helper).
#
# NOTE: the old version embedded the helper as base64 on ONE cmd line, which
# breaks cmd.exe's 8191-character limit, and its double-quoted here-string
# corrupted $variables at build time. Do not bring that approach back.
#
# Run: powershell -ExecutionPolicy Bypass -File .\Build-ConnectLauncher.ps1

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$outPath = Join-Path $here 'MailMass_Connect.bat'

# Single-quoted here-string: nothing is expanded at build time.
$bat = @'
@echo off
title Mail Mass - Connect YOUR Outlook
setlocal
echo.
echo  Mail Mass connects to Outlook on THIS computer only.
echo  Your mailbox. Not anyone else's.
echo.
echo  Downloading the latest Outlook helper...

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $dir = Join-Path $env:LOCALAPPDATA 'MailMassHelper'; New-Item -ItemType Directory -Force -Path $dir | Out-Null; $dest = Join-Path $dir 'MailMassHelper.ps1'; Invoke-WebRequest -UseBasicParsing -Uri 'https://gaelleelters.com/Mail%%20Mass/helper/MailMassHelper.ps1' -OutFile $dest; Start-Process powershell -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',$dest)"

if errorlevel 1 (
  echo.
  echo  Could not download the helper. Check your internet connection,
  echo  or use the "Copy PowerShell command" button on the website instead.
  pause
  exit /b 1
)

echo.
echo  Helper window opened. Return to Mail Mass - status should say Connected.
echo  Keep the helper window open while you send.
echo.
timeout /t 4 /nobreak >nul
exit /b 0
'@

$bat = $bat -replace "`r?`n", "`r`n"
[IO.File]::WriteAllText($outPath, $bat, [Text.ASCIIEncoding]::new())
Write-Host "Wrote $outPath ($([math]::Round((Get-Item $outPath).Length/1KB,1)) KB)"
