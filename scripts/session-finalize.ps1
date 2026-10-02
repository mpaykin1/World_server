param(
  [string]$Desktop = [Environment]::GetFolderPath('Desktop'),
  [string]$ArchiveRoot = "$env:LOCALAPPDATA\WorldServerAI\archives",
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
New-Item -ItemType Directory -Force -Path $ArchiveRoot | Out-Null

function Invoke-Safe {
  param([scriptblock]$Action)
  if ($DryRun) { return }
  & $Action
}

function Save-Zip {
  param([string]$Path)
  $name = Split-Path $Path -Leaf
  $zip = Join-Path $ArchiveRoot "$name-$stamp.zip"
  if ($DryRun) { Write-Host "[DRY] ZIP $Path -> $zip"; return $zip }
  Compress-Archive -Path $Path -DestinationPath $zip -CompressionLevel Optimal -Force
  if (!(Test-Path $zip)) { throw "Archive was not created: $zip" }
  return $zip
}
function Test-RemoteContainsHead {
  param([string]$Repo)
  git -C $Repo fetch origin --quiet 2>$null
  if ($LASTEXITCODE -ne 0) { return $false }
  $refs = git -C $Repo branch -r --contains HEAD 2>$null
  return [bool]$refs
}

function Save-GitRepo {
  param([string]$Repo)
  $dirty = git -C $Repo status --porcelain
  $branch = (git -C $Repo branch --show-current).Trim()
  if ($dirty) {
    if (!$branch) {
      $branch = "ai/session-recovery/$stamp"
      Invoke-Safe { git -C $Repo switch -c $branch | Out-Host }
    }
    Invoke-Safe { git -C $Repo add -A }
    Invoke-Safe { git -C $Repo commit -m "chore: autosave before AI session cleanup $stamp" | Out-Host }
  }
  if ($branch) {
    if ($DryRun) {
      Write-Host "[DRY] PUSH $branch"
    } else {
      git -C $Repo push -u origin $branch | Out-Host
      $pushExit = $LASTEXITCODE
      if ($pushExit -eq 0) { return $true }
    }
  }
  if (!$dirty -and (Test-RemoteContainsHead $Repo)) { return $true }
  return $false
}
$keepDirs = @('World_server','scratch-chain-reaction','.tools','всеподряд','новыйальбом','скорее')
$repoPatterns = @('World_server_*','ws-*','ws_*','scratch-chain-reaction-*')
$helperPatterns = @(
  '*worktree*.ps1','*worktree*.txt','cleanup_tail.ps1',
  'actionforge-app.js','clean_world_worktrees.txt'
)

$repoCandidates = foreach ($pattern in $repoPatterns) {
  Get-ChildItem -LiteralPath $Desktop -Directory -Force -Filter $pattern -ErrorAction SilentlyContinue
}
$repoCandidates = $repoCandidates | Sort-Object FullName -Unique | Where-Object {
  $keepDirs -notcontains $_.Name
}

foreach ($item in $repoCandidates) {
  $path = $item.FullName
  Write-Host "[CHECK] $path"
  $saved = $false
  if (Test-Path (Join-Path $path '.git')) {
    try { $saved = Save-GitRepo $path } catch { Write-Warning $_ }
  }
  if (!$saved) {
    $zip = Save-Zip $path
    Write-Host "[ARCHIVED] $zip"
    $saved = $true
  }
  if ($saved) {
    if ($DryRun) {
      Write-Host "[DRY] REMOVE $path"
    } else {
      try {
        Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction Stop
        Write-Host "[REMOVED] $path"
      } catch {
        $zip = Save-Zip $path
        Write-Warning "Could not remove locked folder; preserved as $zip"
        throw
      }
    }
  }
}

$helperFiles = foreach ($pattern in $helperPatterns) {
  Get-ChildItem -LiteralPath $Desktop -File -Force -Filter $pattern -ErrorAction SilentlyContinue
}
$helperFiles = $helperFiles | Sort-Object FullName -Unique
if ($helperFiles) {
  $bundle = Join-Path $ArchiveRoot "desktop-helper-files-$stamp.zip"
  if ($DryRun) {
    $helperFiles | ForEach-Object { Write-Host "[DRY] ARCHIVE FILE $($_.FullName)" }
  } else {
    Compress-Archive -Path $helperFiles.FullName -DestinationPath $bundle -Force
    foreach ($f in $helperFiles) { Remove-Item -LiteralPath $f.FullName -Force }
    Write-Host "[ARCHIVED] $bundle"
  }
}

Write-Host '[VERIFY] Remaining World Server session clutter:'
Get-ChildItem -LiteralPath $Desktop -Force | Where-Object {
  $_.Name -match '^(World_server_|ws[-_]|scratch-chain-reaction-)'
} | Select-Object Name, FullName
