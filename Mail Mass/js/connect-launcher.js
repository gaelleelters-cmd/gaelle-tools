/* Builds MailMass_Connect.bat for visitors — runs on THEIR PC, THEIR Outlook. */
(function (global) {
  'use strict';

  function helperScriptUrl() {
    try {
      return new URL('helper/MailMassHelper.ps1', window.location.href).href;
    } catch (e) {
      return 'helper/MailMassHelper.ps1';
    }
  }

  function buildBat(scriptUrl) {
    var url = String(scriptUrl || helperScriptUrl()).replace(/"/g, '');
    // Escape % for batch as %% ; keep URL usable inside powershell single-quoted string
    var urlForBat = url.replace(/%/g, '%%');
    var lines = [
      '@echo off',
      'title Mail Mass — Connect YOUR Outlook',
      'setlocal',
      'echo.',
      'echo  Connecting Outlook on THIS computer only.',
      'echo  Mail will send from YOUR mailbox — never anyone else\'s.',
      'echo.',
      'set "DEST=%TEMP%\\MailMassHelper"',
      'if not exist "%DEST%" mkdir "%DEST%" >nul 2>&1',
      '',
      'REM Prefer a helper sitting next to this file (USB / unzipped folder)',
      'if exist "%~dp0MailMassHelper.ps1" (',
      '  copy /Y "%~dp0MailMassHelper.ps1" "%DEST%\\MailMassHelper.ps1" >nul',
      '  goto RUN',
      ')',
      '',
      'REM Download helper from the Mail Mass page you opened (works for any visitor)',
      'powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -UseBasicParsing -Uri \'' + url.replace(/'/g, "''") + '\' -OutFile (Join-Path $env:TEMP \'MailMassHelper\\MailMassHelper.ps1\') } catch { Write-Host $_.Exception.Message; exit 1 }"',
      'if errorlevel 1 (',
      '  echo.',
      '  echo  Download failed. Check your internet, then try again.',
      '  echo  Or copy MailMassHelper.ps1 into the same folder as this .bat',
      '  pause',
      '  exit /b 1',
      ')',
      '',
      ':RUN',
      'if not exist "%DEST%\\MailMassHelper.ps1" (',
      '  echo Helper file missing.',
      '  pause',
      '  exit /b 1',
      ')',
      '',
      'start "Mail Mass Helper" powershell -NoProfile -ExecutionPolicy Bypass -File "%DEST%\\MailMassHelper.ps1"',
      'echo.',
      'echo  Helper opened. Go back to Mail Mass — status should say Connected.',
      'echo  Keep that window open while you send.',
      'echo.',
      'timeout /t 4 /nobreak >nul',
      'exit /b 0'
    ];
    return lines.join('\r\n');
  }

  function download() {
    var bat = buildBat(helperScriptUrl());
    var blob = new Blob([bat], { type: 'application/octet-stream' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'MailMass_Connect.bat';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      try { URL.revokeObjectURL(a.href); } catch (e) {}
      try { a.remove(); } catch (e2) {}
    }, 1500);
    return true;
  }

  global.MailMassConnect = {
    helperScriptUrl: helperScriptUrl,
    buildBat: buildBat,
    download: download
  };
})(window);
