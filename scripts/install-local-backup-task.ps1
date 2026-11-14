param(
 [Parameter(Mandatory=$true)][ValidatePattern('^[a-z0-9]{16,24}$')][string]$ProjectRef,
 [ValidatePattern('^(?:[01]\d|2[0-3]):[0-5]\d$')][string]$Time='03:30'
)
$ErrorActionPreference='Stop'
$taskName='Pomodolist-Local-Backup'
$existing=Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if($existing -and $existing.Actions.Arguments -notmatch [regex]::Escape($ProjectRef)){throw 'A backup task for another project already exists.'}
$scriptPath=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'backup-local.ps1'))
$arguments='-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+$scriptPath+'" -ProjectRef '+$ProjectRef
$action=New-ScheduledTaskAction -Execute (Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe') -Argument $arguments -WorkingDirectory ([IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')))
$start=(Get-Date).Date.AddHours([int]$Time.Split(':')[0]).AddMinutes([int]$Time.Split(':')[1])
$trigger=New-ScheduledTaskTrigger -Daily -At $start
$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 1) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 15)
$settings.Hidden=$true
$principal=New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Encrypted local DB and Storage backup; keeps seven successful snapshots. Requires this Windows account, Node, Supabase login and Docker.' -Force|Out-Null
Write-Output ('Local backup task is ready; daily '+$Time+' in the Windows time zone. It runs only while this account is signed in.')
