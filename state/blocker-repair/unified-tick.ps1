$ErrorActionPreference="Continue"
$root="C:\Users\user\Desktop\World_server"
$lockPath="$root\state\blocker-repair\unified.lock"
$log="$root\state\blocker-repair\scheduler.log"
function Log($m){ $ts=Get-Date -Format "yyyy-MM-dd HH:mm:ss"; $line="[$ts][UNIFIED] $m"; Add-Content -Path $log -Value $line; Write-Host $line }

# Mutex via exclusive file lock
$lockFile=$null
try{
  $lockFile=[System.IO.File]::Open($lockPath,[System.IO.FileMode]::OpenOrCreate,[System.IO.FileAccess]::ReadWrite,[System.IO.FileShare]::None)
  Log "LOCK acquired $lockPath"
}catch{
  Log "SKIP parallel run - lock busy $lockPath : $_"
  exit 0
}
try{
  Log "=== UNIFIED TICK START quality_autoloop -> blocker-repair -> verification ==="
  # 1. quality_autoloop (preserves nextRunAt, checks 108 digest)
  try{
    Log "Step 1: quality_autoloop"
    Set-Location $root
    & powershell.exe -ExecutionPolicy Bypass -File "C:\Users\user\AppData\Local\Temp\opencode\quality_autoloop.ps1" 2>&1 | ForEach-Object { Log "  autoloop: $_" }
  }catch{ Log "autoloop error $_" }

  # 2. blocker-repair tick (uses its own repair.lock internally)
  try{
    Log "Step 2: blocker-repair tick"
    Set-Location $root
    & "C:\Program Files\nodejs\node.exe" "$root\scripts\autonomous-blocker-repair.cjs" tick 2>&1 | ForEach-Object { Log "  blocker: $_" }
  }catch{ Log "blocker tick error $_" }

  # 3. verification (local gates + control-plane, no external fake)
  try{
    Log "Step 3: verification"
    Set-Location $root
    & "C:\Program Files\nodejs\node.exe" "$root\scripts\system-control-plane.cjs" --verify 2>&1 | ForEach-Object { Log "  verify: $_" }
  }catch{ Log "verify error $_" }

  Log "=== UNIFIED TICK END ==="
  # preserve state nextRunAt is managed by blocker-repair itself; we just log
  if(Test-Path "$root\state\blocker-repair\state.json"){
    $st=Get-Content "$root\state\blocker-repair\state.json" -Raw | ConvertFrom-Json
    Log "state nextRunAt=$($st.nextRunAt) blockers pass=$($st.counts.pass) requires_ai=$($st.counts.requires_ai) waiting=$($st.counts.waiting) mergeSafe=$($st.mergeSafe)"
  }
}finally{
  if($lockFile){ $lockFile.Close(); $lockFile.Dispose() }
  # do not delete lock file, just release - keep it as marker but unlocked
  Log "LOCK released"
}
