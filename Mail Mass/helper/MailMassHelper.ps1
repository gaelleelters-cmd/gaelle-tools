# Mail Mass Helper - local Outlook bridge for the website
# Listens on http://127.0.0.1:19527 so the web app can send without downloading a file each time.
# Version 4: never opens Inspector (Word editor was showing raw HTML tags as plain text).

$ErrorActionPreference = 'Stop'
$Port = 19527
$Prefix = "http://127.0.0.1:$Port/"
$HelperVersion = 5

function Send-Cors([System.Net.HttpListenerResponse]$res) {
  $res.Headers.Add('Access-Control-Allow-Origin', '*')
  $res.Headers.Add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  $res.Headers.Add('Access-Control-Allow-Headers', 'Content-Type')
}

function Write-JsonResponse([System.Net.HttpListenerResponse]$res, [int]$code, $obj) {
  $json = ($obj | ConvertTo-Json -Compress -Depth 8)
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

function Test-LooksLikeHtml([string]$s) {
  if ([string]::IsNullOrWhiteSpace($s)) { return $false }
  return ($s.IndexOf('<') -ge 0) -or ($s.IndexOf('&nbsp;') -ge 0)
}

function Get-SignatureHtml {
  try {
    $dir = Join-Path $env:APPDATA 'Microsoft\Signatures'
    if (-not (Test-Path -LiteralPath $dir)) { return '' }
    $files = @(Get-ChildItem -LiteralPath $dir -File -ErrorAction SilentlyContinue |
      Where-Object { $_.Extension -match '^\.(htm|html)$' } |
      Sort-Object Length -Descending)
    if (-not $files.Count) { return '' }
    $pick = $files[0]
    $raw = [IO.File]::ReadAllText($pick.FullName)
    if ([string]::IsNullOrWhiteSpace($raw)) { return '' }
    return $raw
  } catch {
    return ''
  }
}

function Get-GreetingFontStyle([string]$message) {
  $size = '11pt'
  if ($message -match 'font-size:\s*([^;"''\s]+)') {
    $size = $Matches[1].Trim()
  }
  # Dear + first name always Calibri, same size as the message body
  return "margin:0 0 8pt 0;font-family:Calibri,sans-serif;font-size:$size;font-weight:normal;font-style:normal;"
}

function Build-MessageHtml([string]$greeting, [string]$firstName, [string]$message, [bool]$messageIsHtml = $false) {
  if ([string]::IsNullOrWhiteSpace($greeting)) {
    $open = "$(Html-Escape $firstName),"
  } else {
    $open = "$(Html-Escape $greeting) $(Html-Escape $firstName),"
  }

  $greetStyle = Get-GreetingFontStyle $message
  $parts = New-Object System.Text.StringBuilder
  [void]$parts.Append("<div style=""font-family:Calibri,sans-serif;font-size:11pt;"">")
  [void]$parts.Append("<p style=""$greetStyle""><span style=""$greetStyle"">$open</span></p>")

  if ($messageIsHtml -or (Test-LooksLikeHtml $message)) {
    [void]$parts.Append($message)
  } else {
    $norm = ($message -replace "`r`n", "`n" -replace "`r", "`n")
    foreach ($para in ($norm -split "`n`n")) {
      $p = $para.Trim()
      if ($p -eq '') { continue }
      $p = (Html-Escape $p) -replace "`n", '<br>'
      [void]$parts.Append("<p style=""margin:0 0 8pt 0;font-family:Calibri,sans-serif;font-size:11pt;"">$p</p>")
    }
  }
  [void]$parts.Append('</div>')
  return $parts.ToString()
}

function Wrap-MailHtml([string]$inner, [string]$signatureHtml) {
  $sig = ''
  if (-not [string]::IsNullOrWhiteSpace($signatureHtml)) {
    # If signature is a full HTML doc, pull body contents; else append as-is
    $sigBody = $signatureHtml
    if ($signatureHtml -match '(?is)<body[^>]*>(.*)</body>') {
      $sigBody = $Matches[1]
    }
    $sig = '<br><br>' + $sigBody
  }

  return @"
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
</head>
<body style="font-family:Calibri,Arial,sans-serif;font-size:11pt;">
$inner
$sig
</body>
</html>
"@
}

function Resolve-SharedAttachmentPath($payload) {
  $shared = $payload.attachment
  if (-not $shared) { return $null }
  $name = [string]$shared.name
  $bytesB64 = [string]$shared.contentBytes
  if ([string]::IsNullOrWhiteSpace($name) -or [string]::IsNullOrWhiteSpace($bytesB64)) { return $null }
  $safeName = [IO.Path]::GetFileName($name)
  if ([string]::IsNullOrWhiteSpace($safeName)) { $safeName = 'attachment.bin' }
  $dir = Join-Path $env:TEMP ('MailMassAttach_' + [Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $dir -Force | Out-Null
  $path = Join-Path $dir $safeName
  [IO.File]::WriteAllBytes($path, [Convert]::FromBase64String($bytesB64))
  return $path
}

function Send-MailBatch($payload) {
  $displayOnly = [string]$payload.displayOnly -eq '1' -or $payload.displayOnly -eq $true
  $mails = @($payload.mails)
  $sent = 0
  $skipped = 0
  $tempAttach = $null
  $tempDir = $null
  $signatureHtml = Get-SignatureHtml

  try {
    $tempAttach = Resolve-SharedAttachmentPath $payload
    if ($tempAttach) { $tempDir = Split-Path -Parent $tempAttach }

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
      if ([string]::IsNullOrWhiteSpace($attach) -and $tempAttach) { $attach = $tempAttach }
      if ([string]::IsNullOrWhiteSpace($email)) { $skipped++; continue }
      if ($attach -and -not (Test-Path -LiteralPath $attach)) { $skipped++; continue }

      $isHtml = $true
      try {
        if ($m.PSObject.Properties.Name -contains 'messageIsHtml') {
          $flag = $m.messageIsHtml
          if ($flag -eq $false -or [string]$flag -eq '0' -or [string]$flag -eq 'False') {
            $isHtml = Test-LooksLikeHtml ([string]$m.message)
          }
        }
      } catch {
        $isHtml = Test-LooksLikeHtml ([string]$m.message)
      }

      $inner = Build-MessageHtml ([string]$m.greeting) ([string]$m.first) ([string]$m.message) $isHtml
      $fullHtml = Wrap-MailHtml $inner $signatureHtml

      # NEVER call GetInspector — Word-as-email-editor turns HTML into visible source text.
      $mail = $outlook.CreateItem(0)
      $mail.BodyFormat = 2
      $mail.To = $email
      if ($m.cc) { $mail.CC = [string]$m.cc }
      if ($m.bcc) { $mail.BCC = [string]$m.bcc }
      $subject = [string]$m.subject
      if ([string]::IsNullOrWhiteSpace($subject)) { $subject = 'Document Attached' }
      $mail.Subject = $subject
      $mail.HTMLBody = $fullHtml
      if ($attach) { [void]$mail.Attachments.Add($attach) }

      if ($displayOnly) { $mail.Display() } else { $mail.Send() }
      $sent++
      Start-Sleep -Milliseconds 400
    }
  } finally {
    if ($tempDir -and (Test-Path -LiteralPath $tempDir)) {
      try { Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue } catch {}
    }
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

Write-Host "Mail Mass Helper v$HelperVersion is running."
Write-Host "Go back to Mail Mass and click Send with Outlook."
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
      Write-JsonResponse $res 200 @{ ok = $true; service = 'MailMassHelper'; version = $HelperVersion }
      continue
    }

    if ($req.HttpMethod -eq 'POST' -and $path -eq '/send') {
      $reader = New-Object IO.StreamReader($req.InputStream, [Text.Encoding]::UTF8)
      $raw = $reader.ReadToEnd()
      $reader.Close()
      $payload = $raw | ConvertFrom-Json
      $result = Send-MailBatch $payload
      Write-JsonResponse $res 200 @{ ok = $true; processed = $result.processed; skipped = $result.skipped; version = $HelperVersion }
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
