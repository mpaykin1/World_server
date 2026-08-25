param([string]$RepoPath="$env:USERPROFILE\Desktop\World_server")
$ErrorActionPreference="Stop"
$PatchRoot=Split-Path -Parent $MyInvocation.MyCommand.Path
$Stamp=Get-Date -Format "yyyyMMdd-HHmmss"
$BackupRoot=Join-Path $RepoPath ".quiet-autopilot-backup\v6-$Stamp"
if(-not(Test-Path(Join-Path $RepoPath "package.json"))){throw "World_server not found: $RepoPath"}
if(-not(Test-Path(Join-Path $RepoPath ".git"))){throw "Not a Git repository: $RepoPath"}
$targets=@(
"scripts\quiet-quality-autopilot.js","scripts\quality-ab-canary.js","scripts\quality-proof-gate.js","scripts\quality-telemetry-ledger.js","scripts\quality-autopilot-feedback.js","scripts\quality-distributed-coordinator.js","scripts\quality-learning-engine.js","scripts\quality-multi-region-probe.js","scripts\quality-patch-outcome.js","scripts\quality-real-device-rum.js","scripts\quality-work-queue.js","scripts\quality-autofix.js","scripts\quality-geographic-device-gate.js","scripts\quality-mobile-gpu-profiler.js","scripts\quality-otel-bridge-check.js","scripts\quality-progressive-rollout.js","scripts\quality-real-device-visual-oracle.js","scripts\quality-renderer-tuner-gate.js","scripts\quality-trace-critical-path-optimizer.js","scripts\quality-chaos-failover.js","scripts\install-quality-autopilot-v6.js","scripts\verify-v6-runtime.js",
"api\quality-telemetry.js","api\quality-summary.js","api\quality-probe-us.js","api\quality-probe-eu.js","api\quality-probe-ap.js","api\quality-rollout-config.js","api\quality-trace.js",
"lib\quality-regional-probe.js","lib\quality-trace.js","lib\quality-resilient-fetch.js",
"shared\quality-telemetry.js","shared\quality-rollout-router.js","shared\quality-renderer-tuner.js","shared\quality-visual-oracle.js",
"data\quiet-quality-autopilot.json",".github\workflows\quiet-quality-autopilot.yml","services\ai3d-worker\quality_trace.py","integrations\godot\quality_trace.gd")
$new=@()
try{
 foreach($rel in $targets){
   $src=Join-Path $PatchRoot $rel;if(-not(Test-Path $src)){throw "Patch file missing: $rel"}
   $dst=Join-Path $RepoPath $rel
   if(Test-Path $dst){$b=Join-Path $BackupRoot $rel;New-Item -ItemType Directory -Force -Path(Split-Path -Parent $b)|Out-Null;Copy-Item -Force $dst $b}else{$new+=$dst}
   New-Item -ItemType Directory -Force -Path(Split-Path -Parent $dst)|Out-Null;Copy-Item -Force $src $dst
 }
 Push-Location $RepoPath
 try{
   $remote=(git remote get-url origin 2>$null);if($LASTEXITCODE-ne 0-or$remote-notmatch"mpaykin1/World_server"){throw "Unexpected origin: $remote"}
   $env:QUALITY_V6_BACKUP_ROOT=$BackupRoot
   node scripts/install-quality-autopilot-v6.js
   if($LASTEXITCODE-ne 0){throw "V6 integration installer failed"}
   foreach($rel in($targets|Where-Object{$_-match"\.js$"})){node --check($rel-replace'\\','/');if($LASTEXITCODE-ne 0){throw "Syntax failed: $rel"}}
   python -m py_compile services/ai3d-worker/quality_trace.py
   node -e "const c=require('./data/quiet-quality-autopilot.json');if(c.schemaVersion!=='6.0.0'||!c.visualOracle?.enabled||!c.traceOptimizer?.enabled||!c.chaosFailover?.enabled||!c.rendererTuner?.enabled)process.exit(2);console.log('V6 CONFIG PASS')"
   node -e "const v=require('./vercel.json');for(const[f,r]of [['api/quality-probe-us.js','iad1'],['api/quality-probe-eu.js','fra1'],['api/quality-probe-ap.js','sin1']])if(!v.functions?.[f]?.regions?.includes(r))throw Error(f);console.log('V6 VERCEL PASS')"
   git diff --check;if($LASTEXITCODE-ne 0){throw "git diff --check failed"}
 }finally{Pop-Location}
 Write-Host "QUIET QUALITY AUTOPILOT V6 INSTALLED";Write-Host "Backup: $BackupRoot";Write-Host "Apply SUPABASE_V6_RUNTIME_MIGRATION.sql only if the live V6 migration is not already present, then run VERIFY_QUIET_AUTOPILOT.ps1 -Runtime"
}catch{
 foreach($f in $new){if(Test-Path $f){Remove-Item -Force $f}}
 if(Test-Path $BackupRoot){Get-ChildItem $BackupRoot -Recurse -File|ForEach-Object{$rel=$_.FullName.Substring($BackupRoot.Length).TrimStart('\','/');$dst=Join-Path $RepoPath $rel;New-Item -ItemType Directory -Force -Path(Split-Path -Parent $dst)|Out-Null;Copy-Item -Force $_.FullName $dst}}
 throw
}
