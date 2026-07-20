# ONE-TIME setup for the site owner — not for website visitors.
# Creates the Microsoft app so anyone on gaelleelters.com can click Send
# and sign in with their own Microsoft / Outlook account.
#
# Run:
#   powershell -ExecutionPolicy Bypass -File .\Register-MailMassAzureApp.ps1

$ErrorActionPreference = 'Stop'
$RedirectUris = @(
  'https://gaelleelters.com/Mail%20Mass/index.html',
  'https://www.gaelleelters.com/Mail%20Mass/index.html',
  'http://localhost/Mail%20Mass/index.html'
)

Write-Host ''
Write-Host 'Mail Mass - one-time Microsoft setup'
Write-Host 'Sign in with the Microsoft account that should own this app.'
Write-Host ''

if (-not (Get-Module -ListAvailable -Name Microsoft.Graph.Applications)) {
  Write-Host 'Installing Microsoft.Graph.Applications module...'
  Install-Module Microsoft.Graph.Applications -Scope CurrentUser -Force -AllowClobber
}
Import-Module Microsoft.Graph.Applications

Connect-MgGraph -Scopes 'Application.ReadWrite.All' -NoWelcome

$graphAppId = '00000003-0000-0000-c000-000000000000'
$userRead = 'e1fe6dd8-ba31-4d61-89e7-88639da4683d'
$mailSend = 'b633e1c5-b582-4b8b-9b69-ae0b8e7e35ea'
$resourceAccess = @(
  @{
    ResourceAppId = $graphAppId
    ResourceAccess = @(
      @{ Id = $userRead; Type = 'Scope' },
      @{ Id = $mailSend; Type = 'Scope' }
    )
  }
)

$existing = @(Get-MgApplication -Filter "displayName eq 'Mail Mass'" -ErrorAction SilentlyContinue)
if ($existing.Count -gt 0) {
  $app = $existing[0]
  Write-Host ('Found existing app: ' + $app.AppId)
  Update-MgApplication -ApplicationId $app.Id -Spa @{ RedirectUris = $RedirectUris } -RequiredResourceAccess $resourceAccess
} else {
  $app = New-MgApplication -DisplayName 'Mail Mass' `
    -SignInAudience 'AzureADandPersonalMicrosoftAccount' `
    -Spa @{ RedirectUris = $RedirectUris } `
    -RequiredResourceAccess $resourceAccess
  Write-Host ('Created app: ' + $app.AppId)
}

$clientId = $app.AppId
$configPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\js\config.js'))
if (Test-Path $configPath) {
  $js = Get-Content $configPath -Raw
  $js = $js -replace "clientId:\s*'[^']*'", ("clientId: '" + $clientId + "'")
  $js = $js -replace 'MAILMASS_CLIENT_ID_PLACEHOLDER', $clientId
  Set-Content -Path $configPath -Value $js -Encoding UTF8
  Write-Host ('Updated ' + $configPath)
}

Write-Host ''
Write-Host 'DONE. Application client ID:'
Write-Host $clientId
Write-Host ''
Write-Host 'Also add GitHub secret MAILMASS_CLIENT_ID with this value for deploy.'
Write-Host 'Visitors only click Send - Microsoft asks them to sign in once.'
Disconnect-MgGraph | Out-Null
