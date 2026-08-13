# Mail Mass — Connect YOUR Outlook on THIS PC only (first-time install).
# Later visits: the website wakes this install via mailmass:// — no re-download.
$ErrorActionPreference = 'Stop'
$dest = Join-Path $env:LOCALAPPDATA 'MailMassHelper'
New-Item -ItemType Directory -Force -Path $dest | Out-Null
$helper = Join-Path $dest 'MailMassHelper.ps1'
$uri = 'https://gaelleelters.com/Mail%20Mass/helper/MailMassHelper.ps1'
Write-Host ''
Write-Host ' Connecting Outlook on THIS computer only.'
Write-Host ' Mail will send from YOUR mailbox — never anyone else''s.'
Write-Host ''
try {
  Invoke-WebRequest -UseBasicParsing -Uri $uri -OutFile $helper
} catch {
  Write-Host $_.Exception.Message
  Write-Host ' Download failed. Check internet, then try again.'
  pause
  exit 1
}
Start-Process powershell -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $helper)
Write-Host ' Helper opened. Go back to Mail Mass.'
Write-Host ' If Chrome asks to allow local network access — click Allow.'
Write-Host ' Then click Connect Outlook if status is not Connected yet.'
Write-Host ' Keep the helper window open while you send.'
Start-Sleep -Seconds 3
