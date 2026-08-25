param([string]$RepoPath="$env:USERPROFILE\Desktop\World_server",[switch]$Runtime)
$ErrorActionPreference="Stop"
if(-not(Test-Path(Join-Path $RepoPath "package.json"))){throw "World_server not found: $RepoPath"}
Push-Location $RepoPath
try{
 $required=@("scripts/quiet-quality-autopilot.js","scripts/quality-progressive-rollout.js","scripts/quality-real-device-visual-oracle.js","scripts/quality-renderer-tuner-gate.js","scripts/quality-trace-critical-path-optimizer.js","scripts/quality-chaos-failover.js","scripts/install-quality-autopilot-v6.js","scripts/verify-v6-runtime.js","api/quality-telemetry.js","api/quality-summary.js","api/quality-rollout-config.js","api/quality-trace.js","lib/quality-resilient-fetch.js","shared/quality-telemetry.js","shared/quality-rollout-router.js","shared/quality-renderer-tuner.js","shared/quality-visual-oracle.js","services/ai3d-worker/quality_trace.py","integrations/godot/quality_trace.gd","data/quiet-quality-autopilot.json",".github/workflows/quiet-quality-autopilot.yml")
 foreach($f in $required){if(-not(Test-Path $f)){throw "Missing V6 file: $f"}}
 foreach($f in($required|Where-Object{$_-match"\.js$"})){node --check $f;if($LASTEXITCODE-ne 0){throw "Syntax: $f"}}
 python -m py_compile services/ai3d-worker/quality_trace.py
 node -e "const c=require('./data/quiet-quality-autopilot.json');if(c.schemaVersion!=='6.0.0'||c.progressiveRollout?.stages?.join(',')!=='1,10,50,100'||!c.visualOracle?.enabled||!c.traceOptimizer?.enabled||!c.chaosFailover?.enabled||!c.rendererTuner?.enabled)process.exit(2);console.log('V6 CONFIG PASS')"
 node -e "const p=require('./package.json');for(const x of ['release:gate','golden:e2e','quality:v6:monitor','quality:v6:visual','quality:v6:trace-opt','quality:v6:chaos'])if(!p.scripts?.[x])throw Error(x);console.log('PACKAGE SCRIPTS PASS')"
 node scripts/verify-v6-runtime.js
 git diff --check
 if($Runtime){
   npm ci
   node scripts/quality-learning-engine.js
   node scripts/quality-chaos-failover.js
   node scripts/quality-trace-critical-path-optimizer.js
   node scripts/quality-real-device-visual-oracle.js
   node scripts/quality-renderer-tuner-gate.js
   node scripts/quality-otel-bridge-check.js
   node scripts/quiet-quality-autopilot.js
   if(-not(Test-Path "QUIET_AUTOPILOT_REPORT.json")){throw "Autopilot report missing"}
 }
 Write-Host "QUIET QUALITY AUTOPILOT V6 VERIFICATION PASS"
}finally{Pop-Location}
