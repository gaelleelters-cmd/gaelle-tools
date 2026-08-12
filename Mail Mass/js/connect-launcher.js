/* Connect Outlook for visitors — THEIR PC, THEIR mailbox only. */
(function (global) {
  'use strict';

  var INSTALLED_KEY = 'mailmassHelperInstalled';

  function helperScriptUrl() {
    try {
      return new URL('helper/MailMassHelper.ps1', window.location.href).href;
    } catch (e) {
      return 'helper/MailMassHelper.ps1';
    }
  }

  function connectZipUrl() {
    try {
      return new URL('helper/MailMass_Connect.zip', window.location.href).href;
    } catch (e) {
      return 'helper/MailMass_Connect.zip';
    }
  }

  function connectPs1Url() {
    try {
      return new URL('helper/MailMass_Connect.ps1', window.location.href).href;
    } catch (e) {
      return 'helper/MailMass_Connect.ps1';
    }
  }

  function markInstalled() {
    try { localStorage.setItem(INSTALLED_KEY, '1'); } catch (e) {}
  }

  function wasInstalled() {
    try { return localStorage.getItem(INSTALLED_KEY) === '1'; } catch (e) { return false; }
  }

  function powershellCommand() {
    var url = helperScriptUrl().replace(/'/g, "''");
    return [
      "New-Item -ItemType Directory -Force -Path \"$env:LOCALAPPDATA\\MailMassHelper\" | Out-Null",
      "Invoke-WebRequest -UseBasicParsing -Uri '" + url + "' -OutFile \"$env:LOCALAPPDATA\\MailMassHelper\\MailMassHelper.ps1\"",
      "Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',\"$env:LOCALAPPDATA\\MailMassHelper\\MailMassHelper.ps1\""
    ].join('; ');
  }

  function triggerHrefDownload(href, filename) {
    var a = document.createElement('a');
    a.href = href;
    if (filename) a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      try { a.remove(); } catch (e) {}
    }, 1500);
    return true;
  }

  /** Prefer real HTTPS zip (Chrome often fails blob .bat with "Download error"). */
  function download() {
    return triggerHrefDownload(connectZipUrl(), 'MailMass_Connect.zip');
  }

  function downloadPs1() {
    return triggerHrefDownload(connectPs1Url(), 'MailMass_Connect.ps1');
  }

  /** Wake previously installed helper without downloading again. */
  function wakeLocal() {
    try {
      var iframe = document.createElement('iframe');
      iframe.setAttribute('aria-hidden', 'true');
      iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none';
      iframe.src = 'mailmass://start';
      document.body.appendChild(iframe);
      setTimeout(function () {
        try { iframe.remove(); } catch (e) {}
      }, 2500);
      return true;
    } catch (e) {
      return false;
    }
  }

  function copyPowerShell() {
    var cmd = powershellCommand();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(cmd).then(function () { return true; });
    }
    try {
      var ta = document.createElement('textarea');
      ta.value = cmd;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      return Promise.resolve(true);
    } catch (e) {
      return Promise.reject(e);
    }
  }

  global.MailMassConnect = {
    helperScriptUrl: helperScriptUrl,
    connectZipUrl: connectZipUrl,
    connectPs1Url: connectPs1Url,
    powershellCommand: powershellCommand,
    download: download,
    downloadPs1: downloadPs1,
    wakeLocal: wakeLocal,
    markInstalled: markInstalled,
    wasInstalled: wasInstalled,
    copyPowerShell: copyPowerShell
  };
})(window);
