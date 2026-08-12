@echo off
title Mail Mass — Connect YOUR Outlook
setlocal
echo.
echo  Connecting Outlook on THIS computer only.
echo  Mail will send from YOUR mailbox — never anyone else's.
echo.

set "DEST=%LOCALAPPDATA%\MailMassHelper"
if not exist "%DEST%" mkdir "%DEST%" >nul 2>&1

REM Prefer helper next to this file (repo / unzipped folder)
if exist "%~dp0MailMassHelper.ps1" (
  copy /Y "%~dp0MailMassHelper.ps1" "%DEST%\MailMassHelper.ps1" >nul
  goto RUN
)

REM Download from the live site (first-time visitor)
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { New-Item -ItemType Directory -Force -Path (Join-Path $env:LOCALAPPDATA 'MailMassHelper') | Out-Null; Invoke-WebRequest -UseBasicParsing -Uri 'https://gaelleelters.com/Mail%%20Mass/helper/MailMassHelper.ps1' -OutFile (Join-Path $env:LOCALAPPDATA 'MailMassHelper\MailMassHelper.ps1') } catch { Write-Host $_.Exception.Message; exit 1 }"
if errorlevel 1 (
  echo.
  echo  Download failed. Check internet, or put MailMassHelper.ps1 beside this .bat
  pause
  exit /b 1
)

:RUN
if not exist "%DEST%\MailMassHelper.ps1" (
  echo Helper file missing.
  pause
  exit /b 1
)

start "Mail Mass Helper" powershell -NoProfile -ExecutionPolicy Bypass -File "%DEST%\MailMassHelper.ps1"
echo.
echo  Helper opened. Go back to Mail Mass — status should say Connected.
echo  Next visits: just click Connect Outlook (no re-download).
echo  Keep that helper window open while you send.
echo.
timeout /t 4 /nobreak >nul
exit /b 0
