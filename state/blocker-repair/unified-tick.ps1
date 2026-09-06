$ErrorActionPreference = "Continue"
$root = "C:\Users\user\Desktop\World_server"
$lockPath = "$root\state\blocker-repair\unified.lock"
$log = "$root\state\blocker-repair\scheduler.log"
function Log($m) { $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"; $line = "[$ts][UNIFIED] $m"; try { Add-Content -Path $log -Value $line -ErrorAction SilentlyContinue } catch {}; Write-Host $line }
$lockFile = $null
try {
  $lockFile = [System.IO.File]::Open($lockPath,[System.IO.FileMode]::OpenOrCreate,[System.IO.FileAccess]::ReadWrite,[System.IO.FileShare]::None)
} catch { Log "SKIP parallel run - lock busy"; exit 0 }
try {
  Set-Location $root
  try { (Get-Process -Id $PID).PriorityClass = 'BelowNormal' } catch {}
  Log "START"
  try { & powershell.exe -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File "$root\scripts\quality-autoloop-tick.ps1" 2>&1 | ForEach-Object { Log "autoloop: $_" } } catch { Log "autoloop error: $_" }
  try { & "C:\Program Files\nodejs\node.exe" "$root\scripts\ai-supervisor-watcher.cjs" poll 2>&1 | ForEach-Object { Log "supervisor: $_" } } catch { Log "supervisor error: $_" }
  try { & "C:\Program Files\nodejs\node.exe" "$root\scripts\autonomous-blocker-repair.cjs" tick 2>&1 | ForEach-Object { Log "blocker: $_" } } catch { Log "blocker error: $_" }
  try { & "C:\Program Files\nodejs\node.exe" "$root\scripts\system-control-plane.cjs" --verify 2>&1 | ForEach-Object { Log "verify: $_" } } catch { Log "verify error: $_" }
  try { & powershell.exe -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File "$root\scripts\godot-ai-mcp\healthcheck.ps1" 2>&1 | ForEach-Object { Log "godot-ai: $_" } } catch { Log "godot-ai error: $_" }
  Log "END"
} finally {
  if ($lockFile) { $lockFile.Close(); $lockFile.Dispose() }
}
