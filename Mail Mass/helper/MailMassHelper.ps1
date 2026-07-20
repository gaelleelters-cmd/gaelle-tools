# Mail Mass Helper - local Outlook bridge for the website
# Listens on http://127.0.0.1:19527 so the web app can send without downloading a file each time.
# Keep this running (or install to Startup). Close the console window to stop.

$ErrorActionPreference = 'Stop'
$Port = 19527
$Prefix = "http://127.0.0.1:$Port/"

function Send-Cors([System.Net.HttpListenerResponse]$res) {
  $res.Headers.Add('Access-Control-Allow-Origin', '*')
  $res.Headers.Add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  $res.Headers.Add('Access-Control-Allow-Headers', 'Content-Type')
}

function Write-JsonResponse([System.Net.HttpListenerResponse]$res, [int]$code, $obj) {
  $json = ($obj | ConvertTo-Json -Compress -Depth 6)
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  Send-Cors $res
  $res.StatusCode = $code
  $res.ContentType = 'application/json; charset=utf-8'
  $res.ContentLength64 = $bytes.Length
  $res.OutputStream.Write($bytes, 0, $bytes.Length)
  $res.OutputStream.Close()
}

function Html-Escape([string]$s) {
  if ($null -eq $s) { return '' }
  $t = $s
  $t = $t.Replace('&', '&amp;')
  $t = $t.Replace('<', '&lt;')
  $t = $t.Replace('>', '&gt;')
  $t = $t.Replace('"', '&quot;')
  return $t
}

function Build-MessageHtml([string]$greeting, [string]$firstName, [string]$message) {
  if ([string]::IsNullOrWhiteSpace($greeting)) {
    $open = "$(Html-Escape $firstName),"
  } else {
    $open = "$(Html-Escape $greeting) $(Html-Escape $firstName),"
  }
  $html = "<div style='font-family:Calibri,sans-serif;font-size:11.0pt;font-weight:normal;font-style:normal;'>" +
          "<p class=MsoNormal style='margin:0 0 8pt 0;font-weight:normal;'>$open</p>"
  $norm = ($message -replace "`r`n", "`n" -replace "`r", "`n")
  foreach ($para in ($norm -split "`n`n")) {
    $p = $para.Trim()
    if ($p -eq '') { continue }
    $p = (Html-Escape $p) -replace "`n", '<br>'
    $html += "<p class=MsoNormal style='margin:0 0 8pt 0;font-weight:normal;'>$p</p>"
  }
  return $html + '</div>'
}

function Insert-IntoBody([string]$fullHtml, [string]$contentHtml) {
  if ([string]::IsNullOrWhiteSpace($fullHtml)) { return $contentHtml }
  $lower = $fullHtml.ToLowerInvariant()
  $pos = $lower.IndexOf('<body')
  if ($pos -ge 0) {
    $gt = $fullHtml.IndexOf('>', $pos)
    if ($gt -ge 0) {
      return $fullHtml.Substring(0, $gt + 1) + $contentHtml + $fullHtml.Substring($gt + 1)
    }
  }
  return $contentHtml + $fullHtml
}

function Send-MailBatch($payload) {
  $displayOnly = [string]$payload.displayOnly -eq '1' -or $payload.displayOnly -eq $true
  $mails = @($payload.mails)
  $sent = 0
  $skipped = 0

  $outlook = $null
  try {
    $outlook = [Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application')
  } catch {
    $outlook = New-Object -ComObject Outlook.Application
  }
  if (-not $outlook) { throw 'Could not start Outlook. Open Outlook and try again.' }

  foreach ($m in $mails) {
    $email = [string]$m.email
    $attach = [string]$m.attach
    if ($attach.Length -ge 2 -and $attach.StartsWith('"') -and $attach.EndsWith('"')) {
      $attach = $attach.Substring(1, $attach.Length - 2)
    }
    if ([string]::IsNullOrWhiteSpace($email)) { $skipped++; continue }
    if ($attach -and -not (Test-Path -LiteralPath $attach)) { $skipped++; continue }

    $mail = $outlook.CreateItem(0)
    $mail.BodyFormat = 2
    $inspector = $mail.GetInspector
    Start-Sleep -Milliseconds 200
    $body = Build-MessageHtml ([string]$m.greeting) ([string]$m.first) ([string]$m.message)
    $mail.HTMLBody = Insert-IntoBody ([string]$mail.HTMLBody) $body
    $mail.To = $email
    if ($m.cc) { $mail.CC = [string]$m.cc }
    if ($m.bcc) { $mail.BCC = [string]$m.bcc }
    $subject = [string]$m.subject
    if ([string]::IsNullOrWhiteSpace($subject)) { $subject = 'Document Attached' }
    $mail.Subject = $subject
    if ($attach) { [void]$mail.Attachments.Add($attach) }

    try { $inspector.Close(0) } catch {}
    if ($displayOnly) { $mail.Display() } else { $mail.Send() }
    $sent++
    Start-Sleep -Milliseconds 400
  }

  return @{ processed = $sent; skipped = $skipped }
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($Prefix)

try {
  $listener.Start()
} catch {
  Write-Host "Could not start on $Prefix"
  Write-Host $_.Exception.Message
  Write-Host "Is another Mail Mass Helper already running?"
  pause
  exit 1
}

Write-Host "Mail Mass Helper is running."
Write-Host "Go back to the website and click Send with Outlook."
Write-Host "Listening on $Prefix"
Write-Host "Close this window to stop."
Write-Host ""

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request
  $res = $ctx.Response
  try {
    if ($req.HttpMethod -eq 'OPTIONS') {
      Send-Cors $res
      $res.StatusCode = 204
      $res.Close()
      continue
    }

    $path = $req.Url.AbsolutePath.TrimEnd('/').ToLowerInvariant()
    if ($req.HttpMethod -eq 'GET' -and ($path -eq '' -or $path -eq '/health' -or $path -eq '/status')) {
      Write-JsonResponse $res 200 @{ ok = $true; service = 'MailMassHelper'; version = 1 }
      continue
    }

    if ($req.HttpMethod -eq 'POST' -and $path -eq '/send') {
      $reader = New-Object IO.StreamReader($req.InputStream, $req.ContentEncoding)
      $raw = $reader.ReadToEnd()
      $reader.Close()
      $payload = $raw | ConvertFrom-Json
      $result = Send-MailBatch $payload
      Write-JsonResponse $res 200 @{ ok = $true; processed = $result.processed; skipped = $result.skipped }
      $msg = '[{0}] Sent {1}, skipped {2}' -f (Get-Date -Format 'HH:mm:ss'), $result.processed, $result.skipped
      Write-Host $msg
      continue
    }

    Write-JsonResponse $res 404 @{ ok = $false; error = 'Not found' }
  } catch {
    try {
      Write-JsonResponse $res 500 @{ ok = $false; error = $_.Exception.Message }
    } catch {}
    $errMsg = 'ERROR: ' + $_.Exception.Message
    Write-Host $errMsg
  }
}
