# Mail Mass — Connect YOUR Outlook on THIS PC only.
# Double-click or: Right-click → Run with PowerShell
$ErrorActionPreference = 'Stop'
$dest = Join-Path $env:TEMP 'MailMassHelper'
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
Write-Host ' Helper opened. Go back to Mail Mass — status should say Connected.'
Write-Host ' Keep that window open while you send.'
Start-Sleep -Seconds 3
