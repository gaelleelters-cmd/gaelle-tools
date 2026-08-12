@echo off
title Mail Mass — Outlook helper
setlocal
set "DEST=%TEMP%\MailMassHelper"
if not exist "%DEST%" mkdir "%DEST%" >nul 2>&1
copy /Y "%~dp0MailMassHelper.ps1" "%DEST%\MailMassHelper.ps1" >nul
start "Mail Mass Helper" powershell -NoProfile -ExecutionPolicy Bypass -File "%DEST%\MailMassHelper.ps1"
