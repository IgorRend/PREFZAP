# Register a daily Scheduled Task (04:00) that runs the ZAPO auto-updater.
# Run once (as a user that can create tasks):
#     powershell -ExecutionPolicy Bypass -File scripts\zapo-autoupdate-task.ps1
# Re-running replaces the existing task.

$ErrorActionPreference = 'Stop'

$Root    = Split-Path -Parent $PSScriptRoot          # repo root = parent of scripts\
$Updater = Join-Path $Root 'scripts\zapo-autoupdate.mjs'
$TaskName = 'ZapoAutoUpdate'

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw "node not found in PATH." }

# Run node with working dir = repo root so relative paths resolve.
$action = New-ScheduledTaskAction -Execute $node -Argument "`"$Updater`"" -WorkingDirectory $Root
$trigger = New-ScheduledTaskTrigger -Daily -At 4am
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd

# Replace any existing task with the same name.
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
  -Settings $settings -Description 'Daily check + build of zapo-js from GitHub releases' | Out-Null

Write-Host "Registered daily Scheduled Task '$TaskName' at 04:00."
Write-Host "  node:    $node"
Write-Host "  script:  $Updater"
Write-Host "Run now to test:  Start-ScheduledTask -TaskName $TaskName"
Write-Host "Remove with:      Unregister-ScheduledTask -TaskName $TaskName -Confirm:`$false"
