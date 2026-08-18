# Mail Mass Helper - local Outlook bridge for the website
# Listens on http://127.0.0.1:19527 so the web app can send without downloading a file each time.
# Version 4: never opens Inspector (Word editor was showing raw HTML tags as plain text).

$ErrorActionPreference = 'Stop'
$Port = 19527
$Prefix = "http://127.0.0.1:$Port/"
# Version bumped in TcpListener block below (v8 — persist install + mailmass:// wake)

$MailMassHelperScriptPath = $PSCommandPath
if (-not $MailMassHelperScriptPath) { $MailMassHelperScriptPath = $MyInvocation.MyCommand.Path }

function Install-MailMassLocal {
  try {
    $installDir = Join-Path $env:LOCALAPPDATA 'MailMassHelper'
    New-Item -ItemType Directory -Force -Path $installDir | Out-Null

    $self = $script:MailMassHelperScriptPath
    if ($self -and (Test-Path -LiteralPath $self)) {
      $targetHelper = Join-Path $installDir 'MailMassHelper.ps1'
      if ((Resolve-Path -LiteralPath $self).Path -ne (Join-Path $installDir 'MailMassHelper.ps1')) {
        Copy-Item -LiteralPath $self -Destination $targetHelper -Force
      }
    }

    $startPs1 = Join-Path $installDir 'Start-MailMassHelper.ps1'
    $startBody = @'
$ErrorActionPreference = "SilentlyContinue"
try {
  $h = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:19527/health" -TimeoutSec 1
  if ($h.StatusCode -eq 200) { exit 0 }
} catch {}
$helper = Join-Path $env:LOCALAPPDATA "MailMassHelper\MailMassHelper.ps1"
if (-not (Test-Path -LiteralPath $helper)) { exit 1 }
Start-Process powershell -ArgumentList @("-NoProfile","-ExecutionPolicy","Bypass","-File",$helper) | Out-Null
'@
    Set-Content -LiteralPath $startPs1 -Value $startBody -Encoding UTF8

    $root = 'HKCU:\Software\Classes\mailmass'
    New-Item -Path $root -Force | Out-Null
    Set-ItemProperty -Path $root -Name '(default)' -Value 'URL:Mail Mass Protocol'
    New-ItemProperty -Path $root -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
    $cmdKey = 'HKCU:\Software\Classes\mailmass\shell\open\command'
    New-Item -Path $cmdKey -Force | Out-Null
    $cmd = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Minimized -File "' + $startPs1 + '" "%1"'
    Set-ItemProperty -Path $cmdKey -Name '(default)' -Value $cmd
  } catch {
    # Non-fatal — Connect still works without protocol wake
  }
}

Install-MailMassLocal


function Send-Cors([System.Net.HttpListenerResponse]$res) {
  $res.Headers.Add('Access-Control-Allow-Origin', '*')
  $res.Headers.Add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  $res.Headers.Add('Access-Control-Allow-Headers', 'Content-Type')
  # Chrome Private Network Access / Local Network Access (HTTPS site → 127.0.0.1)
  $res.Headers.Add('Access-Control-Allow-Private-Network', 'true')
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
  # Dear + first name always Calibri, same size as the message body (no extra bottom margin — spacer handles the blank line)
  return "margin:0;font-family:Calibri,sans-serif;font-size:$size;font-weight:normal;font-style:normal;"
}

function Build-MessageHtml([string]$greeting, [string]$firstName, [string]$message, [bool]$messageIsHtml = $false) {
  $parts = New-Object System.Text.StringBuilder
  [void]$parts.Append("<div style=""font-family:Calibri,sans-serif;font-size:11pt;"">")

  if ($greeting -ne '__SKIP__') {
    if ([string]::IsNullOrWhiteSpace($greeting)) {
      $open = "$(Html-Escape $firstName),"
    } else {
      $open = "$(Html-Escape $greeting) $(Html-Escape $firstName),"
    }

    $greetStyle = Get-GreetingFontStyle $message
    [void]$parts.Append("<p style=""$greetStyle""><span style=""$greetStyle"">$open</span></p>")
    # Exactly one blank line between greeting and body
    [void]$parts.Append('<p style="margin:0;line-height:12pt;font-size:11pt;">&nbsp;</p>')
  }

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
    $sigBody = $signatureHtml
    if ($signatureHtml -match '(?is)<body[^>]*>(.*)</body>') {
      $sigBody = $Matches[1]
    }
    # Trim leading blank lines / empty paragraphs from signature
    $sigBody = [regex]::Replace($sigBody, '(?is)^(\s|<br\s*/?>|&nbsp;|<p[^>]*>\s*(&nbsp;|\s|<br\s*/?>)*\s*</p>)+', '')
    # Exactly one blank line between body and signature
    $sig = '<p style="margin:0;line-height:12pt;font-size:11pt;">&nbsp;</p>' + $sigBody
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

function Resolve-RowAttachPath([string]$raw) {
  if ([string]::IsNullOrWhiteSpace($raw)) { return '' }
  $p = $raw.Trim()
  $href = [regex]::Match($p, '(?i)\bhref\s*=\s*["'']([^"'']+)["'']')
  if ($href.Success) { $p = $href.Groups[1].Value }
  $p = [regex]::Replace($p, '<[^>]+>', ' ')
  $p = $p.Replace('&nbsp;', ' ').Replace('&amp;', '&').Replace('&quot;', '"')
  $p = $p.Trim().Trim('"').Trim("'")
  if ($p -match '(?i)^file:') {
    try { $p = [Uri]::UnescapeDataString($p) } catch {}
    $p = $p -replace '(?i)^file://+', ''
    if ($p -match '^/+([A-Za-z]:)') { $p = $Matches[1] + $p.Substring($Matches[0].Length) }
  }
  $p = $p -replace '/', '\'
  if ([string]::IsNullOrWhiteSpace($p)) { return '' }
  if (Test-Path -LiteralPath $p -PathType Leaf) {
    return (Resolve-Path -LiteralPath $p).Path
  }

  $roots = New-Object System.Collections.Generic.List[string]
  $candidates = @(
    [Environment]::GetFolderPath('Desktop'),
    [Environment]::GetFolderPath('MyDocuments'),
    (Join-Path $env:USERPROFILE 'Downloads'),
    (Join-Path $env:USERPROFILE 'Desktop'),
    (Join-Path $env:USERPROFILE 'Documents')
  )
  foreach ($od in @($env:OneDrive, $env:OneDriveCommercial, $env:OneDriveConsumer)) {
    if ($od) {
      $candidates += @(
        (Join-Path $od 'Desktop'),
        (Join-Path $od 'Downloads'),
        (Join-Path $od 'Documents')
      )
    }
  }
  foreach ($folder in $candidates) {
    if ($folder -and (Test-Path -LiteralPath $folder)) { [void]$roots.Add($folder) }
  }

  $leaf = [IO.Path]::GetFileName($p)
  if ([string]::IsNullOrWhiteSpace($leaf)) { return $p }
  foreach ($root in ($roots | Select-Object -Unique)) {
    foreach ($candidate in @(
      (Join-Path $root $p),
      (Join-Path $root $leaf),
      (Join-Path (Join-Path $root 'Certificates') $leaf)
    )) {
      if (Test-Path -LiteralPath $candidate -PathType Leaf) {
        return (Resolve-Path -LiteralPath $candidate).Path
      }
    }
  }
  return $p
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
      $attach = ''
      $rowDir = $null
      try {
        $embedded = $null
        try {
          if ($m.PSObject.Properties.Name -contains 'fileAttachment') { $embedded = $m.fileAttachment }
        } catch {}
        if ($embedded -and -not [string]::IsNullOrWhiteSpace([string]$embedded.contentBytes)) {
          $safeName = [IO.Path]::GetFileName([string]$embedded.name)
          if ([string]::IsNullOrWhiteSpace($safeName)) { $safeName = 'attachment.bin' }
          $rowDir = Join-Path $env:TEMP ('MailMassRowAttach_' + [Guid]::NewGuid().ToString('N'))
          New-Item -ItemType Directory -Path $rowDir -Force | Out-Null
          $attach = Join-Path $rowDir $safeName
          [IO.File]::WriteAllBytes($attach, [Convert]::FromBase64String([string]$embedded.contentBytes))
        } else {
          $attach = Resolve-RowAttachPath ([string]$m.attach)
          if ([string]::IsNullOrWhiteSpace($attach) -and $tempAttach) { $attach = $tempAttach }
        }

        if ([string]::IsNullOrWhiteSpace($email) -or ($attach -and -not (Test-Path -LiteralPath $attach))) {
          $skipped++
        } else {
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
      } catch {
        $skipped++
      } finally {
        if ($rowDir -and (Test-Path -LiteralPath $rowDir)) {
          try { Remove-Item -LiteralPath $rowDir -Recurse -Force -ErrorAction SilentlyContinue } catch {}
        }
      }
    }
  } finally {
    if ($tempDir -and (Test-Path -LiteralPath $tempDir)) {
      try { Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue } catch {}
    }
  }

  return @{ processed = $sent; skipped = $skipped }
}

function Write-TcpHttpResponse([System.Net.Sockets.NetworkStream]$stream, [int]$code, [string]$contentType, [byte[]]$bytes) {
  $statusText = switch ($code) {
    200 { 'OK' }
    204 { 'No Content' }
    404 { 'Not Found' }
    500 { 'Internal Server Error' }
    default { 'OK' }
  }
  $header = "HTTP/1.1 $code $statusText`r`n" +
    "Access-Control-Allow-Origin: *`r`n" +
    "Access-Control-Allow-Methods: GET, POST, OPTIONS`r`n" +
    "Access-Control-Allow-Headers: Content-Type`r`n" +
    "Access-Control-Allow-Private-Network: true`r`n" +
    "Content-Type: $contentType`r`n" +
    "Content-Length: $($bytes.Length)`r`n" +
    "Connection: close`r`n`r`n"
  $headerBytes = [Text.Encoding]::ASCII.GetBytes($header)
  $stream.Write($headerBytes, 0, $headerBytes.Length)
  if ($bytes.Length -gt 0) { $stream.Write($bytes, 0, $bytes.Length) }
  $stream.Flush()
}

function Write-TcpJson([System.Net.Sockets.NetworkStream]$stream, [int]$code, $obj) {
  $json = ($obj | ConvertTo-Json -Compress -Depth 8)
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  Write-TcpHttpResponse $stream $code 'application/json; charset=utf-8' $bytes
}

function Read-HttpRequest([System.Net.Sockets.NetworkStream]$stream) {
  $buffer = New-Object byte[] 65536
  $ms = New-Object IO.MemoryStream
  $started = [DateTime]::UtcNow
  $deadline = $started.AddSeconds(30)
  $headerEnd = -1
  $sepLen = 4
  $contentLength = 0

  while ([DateTime]::UtcNow -lt $deadline) {
    if (-not $stream.DataAvailable) {
      # Idle open socket with no bytes yet — common browser probe; ignore quietly
      if ($ms.Length -eq 0 -and (([DateTime]::UtcNow - $started).TotalMilliseconds -gt 1500)) {
        return $null
      }
      # Partial headers already buffered — keep waiting for the rest
      Start-Sleep -Milliseconds 15
      continue
    }

    $read = $stream.Read($buffer, 0, $buffer.Length)
    if ($read -le 0) { break }
    $ms.Write($buffer, 0, $read)

    $textSoFar = [Text.Encoding]::ASCII.GetString($ms.ToArray())
    $crlf = $textSoFar.IndexOf("`r`n`r`n")
    $lf = $textSoFar.IndexOf("`n`n")
    if ($crlf -ge 0) {
      $headerEnd = $crlf
      $sepLen = 4
    } elseif ($lf -ge 0) {
      $headerEnd = $lf
      $sepLen = 2
    } else {
      continue
    }

    $headers = $textSoFar.Substring(0, $headerEnd)
    $clMatch = [regex]::Match($headers, '(?im)^Content-Length:\s*(\d+)')
    $contentLength = if ($clMatch.Success) { [int]$clMatch.Groups[1].Value } else { 0 }
    $bodyStart = $headerEnd + $sepLen
    $totalNeeded = $bodyStart + $contentLength
    $rawBytes = $ms.ToArray()
    while ($rawBytes.Length -lt $totalNeeded -and [DateTime]::UtcNow -lt $deadline) {
      if ($stream.DataAvailable) {
        $read = $stream.Read($buffer, 0, $buffer.Length)
        if ($read -le 0) { break }
        $ms.Write($buffer, 0, $read)
        $rawBytes = $ms.ToArray()
      } else {
        Start-Sleep -Milliseconds 15
      }
    }
    break
  }

  if ($ms.Length -eq 0) { return $null }

  $raw = [Text.Encoding]::UTF8.GetString($ms.ToArray())
  $crlf = $raw.IndexOf("`r`n`r`n")
  $lf = $raw.IndexOf("`n`n")
  if ($crlf -ge 0) {
    $sep = $crlf
    $sepLen = 4
    $splitPat = "`r`n"
  } elseif ($lf -ge 0) {
    $sep = $lf
    $sepLen = 2
    $splitPat = "`n"
  } else {
    return $null
  }

  $headerText = $raw.Substring(0, $sep)
  $body = if ($raw.Length -gt $sep + $sepLen) { $raw.Substring($sep + $sepLen) } else { '' }
  $lines = $headerText -split $splitPat
  $requestLine = ($lines[0] -replace "`r$", '')
  $parts = $requestLine -split ' '
  if ($parts.Count -lt 2) { return $null }
  $pathRaw = $parts[1]
  try {
    $absPath = ([uri]('http://local' + $pathRaw)).AbsolutePath
  } catch {
    $absPath = $pathRaw
  }
  return @{
    Method = $parts[0]
    Path = $absPath
    Body = $body
  }
}



# TcpListener avoids Windows HttpListener URLACL (no admin needed).
$HelperVersion = 12
$tcp = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)

try {
  $tcp.Start()
} catch {
  Write-Host "Could not start on $Prefix"
  Write-Host $_.Exception.Message
  Write-Host "Is another Mail Mass Helper already running?"
  pause
  exit 1
}

Write-Host "Mail Mass Helper v$HelperVersion is running."
Write-Host "Go back to the Mail Mass tab in your browser."
Write-Host "If Chrome asks to allow local network access - click Allow."
Write-Host "Status should turn Connected (click Connect Outlook if it does not)."
Write-Host "Listening on $Prefix"
Write-Host "Keep this window open while you send. Close it to stop."
Write-Host ""

while ($true) {
  $client = $null
  $stream = $null
  try {
    $client = $tcp.AcceptTcpClient()
    $stream = $client.GetStream()
    $req = Read-HttpRequest $stream
    if ($null -eq $req) { continue }
    $method = [string]$req.Method
    $path = ([string]$req.Path).TrimEnd('/').ToLowerInvariant()

    if ($method -eq 'OPTIONS') {
      Write-TcpHttpResponse $stream 204 'text/plain' ([byte[]]@())
      continue
    }

    if ($method -eq 'GET' -and ($path -eq '' -or $path -eq '/health' -or $path -eq '/status')) {
      Write-TcpJson $stream 200 @{ ok = $true; service = 'MailMassHelper'; version = $HelperVersion }
      continue
    }

    if ($method -eq 'POST' -and $path -eq '/send') {
      $payload = $req.Body | ConvertFrom-Json
      $result = Send-MailBatch $payload
      Write-TcpJson $stream 200 @{ ok = $true; processed = $result.processed; skipped = $result.skipped; version = $HelperVersion }
      $msg = '[{0}] Sent {1}, skipped {2}' -f (Get-Date -Format 'HH:mm:ss'), $result.processed, $result.skipped
      Write-Host $msg
      continue
    }

    Write-TcpJson $stream 404 @{ ok = $false; error = 'Not found' }
  } catch {
    $msg = [string]$_.Exception.Message
    $quiet = $msg -match '(?i)invalid http|empty|timeout'
    if (-not $quiet) {
      try {
        if ($stream) {
          Write-TcpJson $stream 500 @{ ok = $false; error = $msg }
        }
      } catch {
        # ignore write failures on broken sockets
      }
      Write-Host ('ERROR: ' + $msg)
    }
  } finally {
    try { if ($stream) { $stream.Close() } } catch { }
    try { if ($client) { $client.Close() } } catch { }
  }
}
