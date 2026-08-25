param(
  [string]$RepoPath = "."
)

$ErrorActionPreference = "Stop"
$PatchRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoPath = (Resolve-Path $RepoPath).Path

Set-Location $RepoPath

if ((git status --porcelain).Length -gt 0) {
  throw "Working tree is not clean. Preserve current work before installing V12.3."
}

git checkout master
git pull origin master

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$branch = "ai/desktop/quality-runtime-v12-$stamp"
git checkout -b $branch

$paths = @(
  "scripts\github-quality-bridge-v12.cjs",
  "scripts\materialize-supabase-bridge-export-v12.cjs",
  "scripts\check-supabase-migration-manifest-v12.cjs",
  "scripts\build-pixel-atlas-v12.cjs",
  "scripts\ensure-master-protection-v12.ps1",
  ".github\workflows\quality-runtime-bridge.yml"
)

foreach ($rel in $paths) {
  $src = Join-Path $PatchRoot $rel
  $dst = Join-Path $RepoPath $rel
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dst) | Out-Null
  Copy-Item -Force $src $dst
}

$agentsPath = Join-Path $RepoPath "AGENTS.md"
$agents = Get-Content $agentsPath -Raw
if ($agents -notmatch "WORLD SERVER QUALITY RUNTIME V12\.3") {
  Add-Content -Path $agentsPath -Value ("`r`n`r`n" + (Get-Content (Join-Path $PatchRoot "AGENTS_APPEND_V12.md") -Raw))
}

$desktopPath = Join-Path $RepoPath "DESKTOP_AI_INSTALL_AND_VERIFY.md"
$desktop = Get-Content $desktopPath -Raw
if ($desktop -notmatch "DESKTOP AI V12\.3") {
  Add-Content -Path $desktopPath -Value ("`r`n`r`n---`r`n`r`n" + (Get-Content (Join-Path $PatchRoot "DESKTOP_AI_V12_INSTRUCTION.md") -Raw))
}

Copy-Item -Force (Join-Path $PatchRoot "WORK_IN_PROGRESS_V12_TEMPLATE.md") (Join-Path $RepoPath "WORK_IN_PROGRESS_V12_TEMPLATE.md")

node --check scripts/github-quality-bridge-v12.cjs
node --check scripts/materialize-supabase-bridge-export-v12.cjs
node --check scripts/check-supabase-migration-manifest-v12.cjs
node --check scripts/build-pixel-atlas-v12.cjs
node scripts/check-supabase-migration-manifest-v12.cjs

npm ci
npm run desktop-ai:check
npm run check
npm run release:gate

git diff --check
git status --short

git add .
git commit -m "feat(quality): add V12 GitHub OIDC quality bridge"
git push -u origin HEAD

$prUrl = gh pr create `
  --base master `
  --head $branch `
  --title "feat(quality): V12 GitHub OIDC quality bridge" `
  --body "Adds secretless GitHub Actions OIDC -> Supabase quality bridge client, exact migration sync workflow, branch-protection verifier, updated Desktop AI protocol, and pixel-asset scanner. Local desktop-ai/check/release gates passed."

Write-Host "PR created: $prUrl"
Write-Host "Do not stop here. Follow DESKTOP_AI_V12_INSTRUCTION.md through schema sync, post-merge attestation, and master protection."
