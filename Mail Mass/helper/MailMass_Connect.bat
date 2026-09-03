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
