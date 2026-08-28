$ErrorActionPreference="Continue"
$root="C:\Users\user\Desktop\World_server"
$lockPath="$root\state\blocker-repair\unified.lock"
$log="$root\state\blocker-repair\scheduler.log"
function Log($m){ $ts=Get-Date -Format "yyyy-MM-dd HH:mm:ss"; $line="[$ts][UNIFIED] $m"; try{ Add-Content -Path $log -Value $line -ErrorAction SilentlyContinue }catch{}; Write-Host $line }

$lockFile=$null
try{
  $lockFile=[System.IO.File]::Open($lockPath,[System.IO.FileMode]::OpenOrCreate,[System.IO.FileAccess]::ReadWrite,[System.IO.FileShare]::None)
  Log "LOCK acquired $lockPath"
}catch{
  Log "SKIP parallel run - lock busy $lockPath : $_"
  exit 0
}
try{
  Log "=== UNIFIED TICK START quality_autoloop -> supervisor poll -> blocker-repair -> verification ==="
  Set-Location $root
  try{
    Log "Step 1: quality_autoloop"
    & powershell.exe -ExecutionPolicy Bypass -File "C:\Users\user\AppData\Local\Temp\opencode\quality_autoloop.ps1" 2>&1 | ForEach-Object { Log "  autoloop: $_" }
  }catch{ Log "autoloop error $_" }
  try{
    Log "Step 1b: supervisor advisory poll"
    & "C:\Program Files\nodejs\node.exe" "$root\scripts\ai-supervisor-watcher.cjs" poll 2>&1 | ForEach-Object { Log "  supervisor: $_" }
  }catch{ Log "supervisor poll error $_" }
  try{
    Log "Step 2: blocker-repair tick"
    & "C:\Program Files\nodejs\node.exe" "$root\scripts\autonomous-blocker-repair.cjs" tick 2>&1 | ForEach-Object { Log "  blocker: $_" }
  }catch{ Log "blocker tick error $_" }
  try{
    Log "Step 3: verification"
    & "C:\Program Files\nodejs\node.exe" "$root\scripts\system-control-plane.cjs" --verify 2>&1 | ForEach-Object { Log "  verify: $_" }
  }catch{ Log "verify error $_" }
  Log "=== UNIFIED TICK END ==="
  if(Test-Path "$root\state\blocker-repair\state.json"){
    $st=Get-Content "$root\state\blocker-repair\state.json" -Raw | ConvertFrom-Json
    Log "state nextRunAt=$($st.nextRunAt) blockers pass=$($st.counts.pass) requires_ai=$($st.counts.requires_ai) waiting=$($st.counts.waiting) mergeSafe=$($st.mergeSafe)"
  }
}finally{
  if($lockFile){ $lockFile.Close(); $lockFile.Dispose() }
  Log "LOCK released"
}
