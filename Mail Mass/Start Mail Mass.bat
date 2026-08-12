@echo off
title Mail Mass — Connect Outlook
cd /d "%~dp0"

echo.
echo  Connecting to Outlook on THIS PC only…
echo.

REM Self-contained visitor launcher (works from Downloads after website download)
if exist "%~dp0helper\MailMass_Connect.bat" (
  call "%~dp0helper\MailMass_Connect.bat"
  exit /b %ERRORLEVEL%
)

REM Local repo fallback
if exist "%~dp0helper\MailMassHelper.ps1" (
  set "DEST=%TEMP%\MailMassHelper"
  if not exist "%DEST%" mkdir "%DEST%" >nul 2>&1
  copy /Y "%~dp0helper\MailMassHelper.ps1" "%DEST%\MailMassHelper.ps1" >nul
  start "Mail Mass Helper" powershell -NoProfile -ExecutionPolicy Bypass -File "%DEST%\MailMassHelper.ps1"
  echo  Helper window opened. Return to Mail Mass.
  timeout /t 3 /nobreak >nul
  exit /b 0
)

echo Could not find the Outlook helper files.
pause
exit /b 1
