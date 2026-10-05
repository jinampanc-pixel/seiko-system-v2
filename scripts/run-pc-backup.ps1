param([Parameter(Mandatory=$true)][string]$NodePath, [Parameter(Mandatory=$true)][string]$ConfigPath)
$ErrorActionPreference = 'Stop'
$privateConfig = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$logPath = Join-Path $privateConfig.directory 'pc-job.log'
try {
  $result = & $NodePath (Join-Path $PSScriptRoot 'pc-backup.mjs') $ConfigPath 2>&1
  $resultCode = $LASTEXITCODE
  Add-Content -LiteralPath $logPath -Value (([DateTime]::UtcNow.ToString('o')) + ' ' + ($result -join ' '))
  exit $resultCode
} catch {
  Add-Content -LiteralPath $logPath -Value (([DateTime]::UtcNow.ToString('o')) + ' PC backup job failed. Check private configuration and authorization; existing archives are retained.')
  exit 1
}
