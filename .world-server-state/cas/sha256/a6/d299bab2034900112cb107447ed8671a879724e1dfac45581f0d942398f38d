param(
  [string]$RepoPath = 'C:\Users\user\Desktop\World_server',
  [switch]$NoPush
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$PatchRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not (Test-Path $RepoPath)) { throw "World_server not found: $RepoPath" }
if (-not (Test-Path (Join-Path $RepoPath '.git'))) { throw "Not a git repository: $RepoPath" }

function Run-Git([string[]]$Args) {
  & git -C $RepoPath @Args
  if ($LASTEXITCODE -ne 0) { throw "git failed: git $($Args -join ' ')" }
}

Write-Host '[APNG v3] Verify bundle integrity'
& node (Join-Path $PatchRoot 'scripts\verify-apng-bundle.js') $PatchRoot
if ($LASTEXITCODE -ne 0) { throw 'APNG bundle integrity verification failed' }

$dirty = (& git -C $RepoPath status --porcelain)
if ($LASTEXITCODE -ne 0) { throw 'git status failed' }
if ($dirty) { throw 'Working tree is not clean. Desktop AI must preserve/commit/stash the current task before installing APNG; installer refuses to overwrite unrelated work.' }

Write-Host '[APNG v3] Sync latest master'
Run-Git @('checkout','master')
Run-Git @('pull','--ff-only','origin','master')
$baseCommit = (& git -C $RepoPath rev-parse HEAD).Trim()
if (-not $baseCommit) { throw 'Cannot resolve current master SHA' }

$branch = 'ai/desktop/apng-quality-v3-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
Run-Git @('checkout','-b',$branch)
$pushed = $false
$succeeded = $false

$files = @(
  'lib/apng-engine.js',
  'api/apng.js',
  'apps/apng-lab/index.html',
  'apps/apng-lab/client.js',
  'apps/apng-lab/styles.css',
  'scripts/apng-quality-gate.js',
  'scripts/integrate-apng-system.js',
  '.github/workflows/apng-autofix.yml',
  'test/apng-engine.test.js',
  'test/apng-api.test.js',
  'test/apng-integration.test.js',
  'test/apng-gate.test.js',
  'e2e/apng-browser-compat.spec.js',
  'playwright.apng.config.js',
  'apng-quality.config.json',
  'docs/APNG_SYSTEM.md',
  'docs/DESKTOP_AI_APNG_INSTALL_AND_VERIFY.md'
)

Push-Location $RepoPath
try {
  foreach ($rel in $files) {
    $src = Join-Path $PatchRoot $rel
    $dst = Join-Path $RepoPath $rel
    if (-not (Test-Path $src)) { throw "Patch file missing: $rel" }
    $dir = Split-Path -Parent $dst
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    Copy-Item -LiteralPath $src -Destination $dst -Force
  }

  Write-Host '[APNG v3] Patch current server.js + package.json idempotently'
  node scripts/integrate-apng-system.js
  if ($LASTEXITCODE -ne 0) { throw 'APNG integration patch failed' }

  Write-Host '[APNG v3] Syntax + config checks'
  node -c lib/apng-engine.js
  if ($LASTEXITCODE -ne 0) { throw 'lib/apng-engine.js syntax failed' }
  node -c api/apng.js
  if ($LASTEXITCODE -ne 0) { throw 'api/apng.js syntax failed' }
  node -c apps/apng-lab/client.js
  if ($LASTEXITCODE -ne 0) { throw 'APNG Lab client syntax failed' }
  node -c scripts/apng-quality-gate.js
  if ($LASTEXITCODE -ne 0) { throw 'APNG gate syntax failed' }
  node -c scripts/integrate-apng-system.js
  if ($LASTEXITCODE -ne 0) { throw 'APNG integrator syntax failed' }
  node -c e2e/apng-browser-compat.spec.js
  if ($LASTEXITCODE -ne 0) { throw 'APNG browser spec syntax failed' }
  node -c playwright.apng.config.js
  if ($LASTEXITCODE -ne 0) { throw 'APNG Playwright config syntax failed' }
  node -e "JSON.parse(require('fs').readFileSync('apng-quality.config.json','utf8'))"
  if ($LASTEXITCODE -ne 0) { throw 'APNG policy config JSON invalid' }

  Write-Host '[APNG v3] Core + API + integration + fuzz regression suite'
  npm run apng:test
  if ($LASTEXITCODE -ne 0) { throw 'APNG tests failed' }

  Write-Host '[APNG v3] Atomically repair error-level / codec-risk / legacy 16-bit or Adam7 APNG assets on task branch'
  npm run apng:fix
  if ($LASTEXITCODE -ne 0) { throw 'APNG auto-repair failed' }

  Write-Host '[APNG v3] Verify repository APNG gate after repair'
  npm run apng:check
  if ($LASTEXITCODE -ne 0) { throw 'APNG quality gate still fails after auto-repair' }

  Write-Host '[APNG v3] Full repository check'
  npm run check
  if ($LASTEXITCODE -ne 0) { throw 'npm run check failed' }

  Write-Host '[APNG v3] Cross-browser local gate when Playwright is available'
  node -e "require.resolve('@playwright/test')" 2>$null
  if ($LASTEXITCODE -eq 0) {
    npm run apng:browser
    if ($LASTEXITCODE -ne 0) {
      Write-Host '[APNG v3] Browser binaries may be missing. Attempt automatic Playwright browser install.'
      npx playwright install chromium firefox webkit
      if ($LASTEXITCODE -eq 0) {
        npm run apng:browser
        if ($LASTEXITCODE -ne 0) { throw 'local APNG cross-browser gate failed after browser installation' }
      } else {
        Write-Host '[APNG v3] Browser installation unavailable locally; GitHub Actions browser-differential remains mandatory before merge.'
      }
    }
  } else {
    Write-Host '[APNG v3] Playwright module not installed locally; browser proof is mandatory in GitHub Actions browser-differential job.'
  }

  git diff --check
  if ($LASTEXITCODE -ne 0) { throw 'git diff --check failed' }

  $unexpectedDeleted = (& git diff --name-status | Select-String '^D\s')
  if ($unexpectedDeleted) { throw "APNG patch deleted existing files; refusing commit: $unexpectedDeleted" }

  git add -- lib/apng-engine.js api/apng.js apps/apng-lab scripts/apng-quality-gate.js scripts/integrate-apng-system.js .github/workflows/apng-autofix.yml test/apng-engine.test.js test/apng-api.test.js test/apng-integration.test.js test/apng-gate.test.js e2e/apng-browser-compat.spec.js playwright.apng.config.js apng-quality.config.json docs/APNG_SYSTEM.md docs/DESKTOP_AI_APNG_INSTALL_AND_VERIFY.md scripts/quality-master-report.js server.js package.json APNG_QUALITY_REPORT.json
  if ($LASTEXITCODE -ne 0) { throw 'failed to stage APNG core files' }
  foreach ($assetRoot in @('apps','shared','assets','public')) {
    if (Test-Path (Join-Path $RepoPath $assetRoot)) {
      git add -- $assetRoot
      if ($LASTEXITCODE -ne 0) { throw "failed to stage repaired APNG assets in $assetRoot" }
    }
  }
  git diff --cached --check
  if ($LASTEXITCODE -ne 0) { throw 'staged diff check failed' }

  $stagedDeleted = (& git diff --cached --name-status | Select-String '^D\s')
  if ($stagedDeleted) { throw "APNG patch staged deletions; refusing commit: $stagedDeleted" }

  git commit -m 'feat(apng): production-grade verified APNG repair v3'
  if ($LASTEXITCODE -ne 0) { throw 'git commit failed' }

  $commit = (& git rev-parse HEAD).Trim()
  if (-not $NoPush) {
    Run-Git @('push','-u','origin',$branch)
    $pushed = $true
    $gh = Get-Command gh -ErrorAction SilentlyContinue
    if ($gh) {
      & gh pr create --repo mpaykin1/World_server --base master --head $branch --title 'feat(apng): production-grade verified APNG repair v3' --body 'APNG v3: 8/16-bit + Adam7 decode, strict sequencing/CRC/resource guards, edge/halo and motion QA, policy-aware intentional effects, transparent-RGB sanitize, pixel/timeline verification, full-frame normalization, atomic repository repair, 26 regression tests, mutation fuzzing and Chromium/Firefox/WebKit CI gate. Existing systems preserved.'
      if ($LASTEXITCODE -ne 0) { throw 'gh pr create failed' }
    } else {
      Write-Host '[APNG v3] gh CLI not found. Branch was pushed; create PR from the pushed branch.'
    }
  }

  $succeeded = $true
  Write-Host "[APNG v3] PASS base=$baseCommit branch=$branch commit=$commit"
}
catch {
  $failure = $_
  Write-Host "[APNG v3] INSTALL FAILED: $($failure.Exception.Message)"
  Write-Host '[APNG v3] Rolling task branch back to untouched base; master was never modified.'
  & git -C $RepoPath reset --hard $baseCommit | Out-Null
  $cleanupPaths = @($files) + 'APNG_QUALITY_REPORT.json'
  & git -C $RepoPath clean -f -- @cleanupPaths | Out-Null
  if ($pushed) {
    & git -C $RepoPath push origin --delete $branch 2>$null | Out-Null
  }
  & git -C $RepoPath checkout master | Out-Null
  & git -C $RepoPath branch -D $branch 2>$null | Out-Null
  throw $failure
}
finally {
  Pop-Location
}

if (-not $succeeded) { throw 'APNG install did not complete' }
