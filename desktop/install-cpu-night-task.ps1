param(
  [string]$WorldServerRoot = "C:\Users\user\Desktop\World_server",
  [string]$NodeExe = "node",
  [string]$StartTime = "00:35",
  [string]$TaskName = "WorldServer-CPU-Night-Autopilot"
)
$ErrorActionPreference = "Stop"
$runner = Join-Path $WorldServerRoot "desktop\cpu-night-autopilot.cjs"
if (!(Test-Path $runner)) { throw "Missing runner: $runner" }

$action = New-ScheduledTaskAction -Execute $NodeExe -Argument "`"$runner`"" -WorkingDirectory $WorldServerRoot
$trigger = New-ScheduledTaskTrigger -Daily -At $StartTime
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Hours 7)

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false }
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description "CPU-only silent World_server quality improvement. No GPU and no paid compute." | Out-Null

Write-Host "Installed scheduled task: $TaskName"
Write-Host "Runs daily at $StartTime local time."
Write-Host "Requires WORLD_SERVER_URL and AUTOPILOT_WORKER_TOKEN in the task environment/user environment."
