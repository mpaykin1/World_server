$ErrorActionPreference = "Continue"
$Root = "C:\Users\user\AppData\Local\WorldServerAI\krieger-heartbeat"
$Repo = Join-Path $Root "repo"
$Reports = Join-Path $Root "reports"
$Prompt = Join-Path $Repo "docs\KRIEGER_HEARTBEAT_PROMPT.txt"
$Bridge = "C:\Users\user\AppData\Local\WorldServerAI\ai-pair\pair-bridge.cjs"
$Lock = Join-Path $Root "run.lock"
$Branch = "ai/krieger-heartbeat"
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$Out = Join-Path $Reports ("run-" + $Stamp + ".txt")
$Log = Join-Path $Reports "scheduler.log"

New-Item -ItemType Directory -Force -Path $Reports | Out-Null
if (Test-Path $Lock) {
  $age = (Get-Date) - (Get-Item $Lock).LastWriteTime
  if ($age.TotalMinutes -lt 60) { Add-Content $Log "$Stamp SKIP overlapping run"; exit 0 }
  Remove-Item $Lock -Force -ErrorAction SilentlyContinue
}
New-Item -ItemType File -Force -Path $Lock | Out-Null

try {
  if (-not (Test-Path (Join-Path $Repo ".git"))) {
    Add-Content $Log "$Stamp BLOCK worktree missing"
    exit 3
  }
  Set-Location $Repo
  git fetch origin --prune 2>&1 | Add-Content $Log
  git checkout $Branch 2>&1 | Add-Content $Log

  if (-not (git status --porcelain)) {
    git rebase origin/master 2>&1 | Add-Content $Log
    if ($LASTEXITCODE -ne 0) {
      git rebase --abort 2>&1 | Add-Content $Log
      Add-Content $Log "$Stamp BLOCK rebase conflict"
      exit 2
    }
  }

  $basePrompt = Get-Content -Raw $Prompt
  $chatgptInbox = ""
  if (Test-Path $Bridge) {
    $chatgptInbox = (& node $Bridge inbox --to codex 2>$null | Out-String)
  }
  $runPrompt = $basePrompt + "`n`nCHATGPT SUPERVISOR RESPONSES AVAILABLE TO THIS RUN:`n" + $chatgptInbox
  $runPrompt | codex exec -C $Repo -m gpt-6-luna --sandbox workspace-write --approve-for-me --skip-git-repo-check -o $Out - 2>&1 | Add-Content $Log
  $codexExit = $LASTEXITCODE

  if ($codexExit -ne 0) {
    Add-Content $Log "$Stamp BLOCK codex_unavailable exit=$codexExit no_checkpoint_no_push"
    exit $codexExit
  }

  if (-not (Test-Path $Out)) {
    Add-Content $Log "$Stamp BLOCK codex_output_missing no_checkpoint_no_push"
    exit 4
  }

  $outText = Get-Content -Raw $Out
  if ([string]::IsNullOrWhiteSpace($outText)) {
    Add-Content $Log "$Stamp BLOCK codex_output_empty no_checkpoint_no_push"
    exit 5
  }

  if (Test-Path $Out) {
    $latest = Join-Path $Repo "KRIEGER_HEARTBEAT_LATEST.md"
    "# KRIEGER heartbeat latest" | Set-Content -Encoding UTF8 $latest
    "" | Add-Content $latest
    ("Generated: " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss zzz")) | Add-Content $latest
    "" | Add-Content $latest
    Get-Content $Out | Add-Content $latest

    if (Test-Path $Bridge) {
      $report = (Get-Content -Raw $Out).Trim()
      $sha = (git rev-parse HEAD).Trim()
      $summary = "KRIEGER 15m heartbeat. Review evidence, decide highest evidence-backed delta-K/time action, execute what ChatGPT can safely execute, and reply with exact next instructions for Codex. Report:" + [Environment]::NewLine + $report
      & node $Bridge request --from codex --to chatgpt --kind evidence --summary $summary --sha $sha --context "KRIEGER_HEARTBEAT_LATEST.md on ai/krieger-heartbeat" 2>&1 | Add-Content $Log
    }
  }

  git add -A
  if (git status --porcelain) {
    git commit -m ("checkpoint: KRIEGER heartbeat " + $Stamp) 2>&1 | Add-Content $Log
  }
  git push -u origin $Branch 2>&1 | Add-Content $Log
  $pushExit = $LASTEXITCODE
  Add-Content $Log "$Stamp DONE codex_exit=$codexExit push_exit=$pushExit"
} finally {
  Remove-Item $Lock -Force -ErrorAction SilentlyContinue
}
