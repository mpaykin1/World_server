param([Parameter(Mandatory=$true)][string]$RepoPath)
$ErrorActionPreference='Stop';$PatchRoot=Split-Path -Parent $MyInvocation.MyCommand.Path;$RepoPath=(Resolve-Path $RepoPath).Path
if(-not (Test-Path (Join-Path $RepoPath '.git'))){throw "RepoPath is not a Git repository: $RepoPath"}
$base='master';git -C $RepoPath show-ref --verify --quiet refs/heads/master;if($LASTEXITCODE -ne 0){$base='main'}
git -C $RepoPath fetch origin $base 2>$null;if($LASTEXITCODE -ne 0){Write-Warning "Fetch failed; using local $base safely."}
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss';$candidate="opencode/quality-autopilot-v11-cpu-$stamp";$parent=Split-Path -Parent $RepoPath;$name=Split-Path -Leaf $RepoPath;$WorktreePath=Join-Path $parent "${name}_quality_autopilot_v11_cpu_$stamp"
git -C $RepoPath worktree add -b $candidate $WorktreePath $base;if($LASTEXITCODE -ne 0){throw 'Could not create isolated worktree'}
node (Join-Path $PatchRoot 'scripts\apply-quality-autopilot-v10.js') --repo $WorktreePath --patch-root $PatchRoot;if($LASTEXITCODE -ne 0){throw 'v10 prerequisite overlay failed'}
node (Join-Path $PatchRoot 'scripts\apply-quality-autopilot-v11.js') --repo $WorktreePath --patch-root $PatchRoot;if($LASTEXITCODE -ne 0){throw 'v11 CPU-first overlay failed'}
Push-Location $WorktreePath
try{
 if(Test-Path package-lock.json){npm ci --ignore-scripts;if($LASTEXITCODE -ne 0){throw 'npm ci failed'}}
 $attempt=0;do{$attempt++;npm run quality:v11:test;if($LASTEXITCODE -eq 0){$pass=$true;break};Write-Warning "v11 tests failed attempt $attempt - inspect and fix before continuing";$pass=$false}while($attempt -lt 3)
 if(-not $pass){throw 'v11 tests still fail: DO NOT PUSH. Fix root cause and rerun.'}
 npm run quality:v11:cpu:benchmark;if($LASTEXITCODE -ne 0){throw 'CPU benchmark failed'}
 npm run quality:v11:cpu:parallel-scan;if($LASTEXITCODE -ne 0){throw 'CPU parallel scan failed'}
 npm run quality:v11:cpu:toolchain
 npm run quality:v11:cpu:policy;if($LASTEXITCODE -ne 0){throw 'CPU-first policy failed'}
 npm run quality:v10:sbom;if($LASTEXITCODE -ne 0){throw 'Supply-chain gate failed'}
 $env:QUALITY_BASE_REF=$base;npm run quality:v10:migrations;if($LASTEXITCODE -ne 0){throw 'Migration safety gate failed'}
 if((Get-Content package.json -Raw) -match '"release:gate"'){npm run release:gate;if($LASTEXITCODE -ne 0){throw 'Current release:gate failed. Fix every reproducible error in touched scope and rerun.'}}
 npm run quality:v11:readiness
 Write-Host 'QUALITY_AUTOPILOT_V11_CPU_FIRST_APPLIED_AND_VERIFIED';Write-Host "CANDIDATE_BRANCH=$candidate";Write-Host "CANDIDATE_WORKTREE=$WorktreePath";Write-Host "ORIGINAL_REPO_UNCHANGED=$RepoPath"
}finally{Pop-Location}
