@echo off
title Mail Mass — Connect Outlook
cd /d "%~dp0"

echo.
echo  Updating Outlook helper…
echo.

wscript "%~dp0helper\Start-MailMassHelper.vbs"

echo.
echo  Done. Go back to Mail Mass — status should say Connected.
echo.
timeout /t 3 /nobreak >nul
exit /b 0
