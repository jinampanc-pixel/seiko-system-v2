param(
  [Parameter(Mandatory=$true)][string]$NodePath,
  [Parameter(Mandatory=$true)][string]$ConfigPath,
  [string]$TaskName = 'Jinam Daily PC Backup'
)
$ErrorActionPreference = 'Stop'
$nodeExecutable = (Resolve-Path -LiteralPath $NodePath).Path
$privateConfig = (Resolve-Path -LiteralPath $ConfigPath).Path
$repository = Split-Path -Parent $PSScriptRoot
$runner = Join-Path $PSScriptRoot 'run-pc-backup.ps1'
if ($nodeExecutable.Contains('"') -or $privateConfig.Contains('"') -or $runner.Contains('"')) { throw 'Invalid task paths.' }
# The native task runs with the existing Windows login; no password or Codex process is needed.
$windowsPowerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$action = New-ScheduledTaskAction -Execute $windowsPowerShell -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -File "{0}" -NodePath "{1}" -ConfigPath "{2}"' -f $runner,$nodeExecutable,$privateConfig) -WorkingDirectory $repository
$triggers = @((New-ScheduledTaskTrigger -Daily -At '20:00'), (New-ScheduledTaskTrigger -AtLogOn -User ([Security.Principal.WindowsIdentity]::GetCurrent().Name)))
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 30) -ExecutionTimeLimit (New-TimeSpan -Minutes 20)
$principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$task = New-ScheduledTask -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Description 'Verified encrypted Jinam PC backup; retries missed daily runs and provider failures without Codex or the Jinam app.'
Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force | Select-Object TaskName,State
