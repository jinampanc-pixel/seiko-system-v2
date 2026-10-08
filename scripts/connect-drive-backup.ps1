param(
  [Parameter(Mandatory=$true)][string]$NodePath,
  [Parameter(Mandatory=$true)][string]$ConfigPath,
  [Parameter(Mandatory=$true)][string]$ClientPath
)
$ErrorActionPreference = 'Stop'
$env:UV_THREADPOOL_SIZE = '1'
$env:NODE_OPTIONS = '--max-old-space-size=768'
Write-Host 'Keep this setup window open. Open the Google link below and complete consent within one hour.'
Write-Host 'Do not reload an old callback page. A fresh setup creates a fresh link.'
& (Resolve-Path -LiteralPath $NodePath).Path (Join-Path $PSScriptRoot 'authorize-drive-backup.mjs') (Resolve-Path -LiteralPath $ConfigPath).Path (Resolve-Path -LiteralPath $ClientPath).Path
if ($LASTEXITCODE -ne 0) { throw 'Drive setup did not finish. Existing backups are preserved. Start a fresh setup when ready.' }
Write-Host 'Drive connected. Run the daily backup runner to verify the encrypted remote copy.'
