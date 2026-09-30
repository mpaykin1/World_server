param(
  [string]$Repo = 'C:\Users\user\Desktop\World_server',
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
$StateRoot = Join-Path $env:LOCALAPPDATA 'WorldServerAI'
New-Item -ItemType Directory -Force -Path $StateRoot | Out-Null
$Log = Join-Path $StateRoot 'maintenance.log'

function Write-Log([string]$Message) {
  $line = ('{0:u} {1}' -f (Get-Date), $Message)
  Add-Content -Path $Log -Value $line
  Write-Output $line
}

function Get-Health {
  $os = Get-CimInstance Win32_OperatingSystem
  $cpu = (Get-CimInstance Win32_Processor | Measure-Object LoadPercentage -Average).Average
  [pscustomobject]@{
    Cpu = [math]::Round([double]$cpu, 1)
    FreeRamGB = [math]::Round($os.FreePhysicalMemory / 1MB, 1)
    FreeCGB = [math]::Round((Get-PSDrive C).Free / 1GB, 1)
  }
}

function Stop-WorldServerOllama {
  if ($DryRun) { Write-Log 'DRYRUN would unload Agent Zero Ollama models'; return }
  foreach ($model in @('qwen3-fast:1.7b','qwen2.5-coder:3b','qwen2.5:3b-instruct')) {
    wsl -d Ubuntu -- bash -lc "OLLAMA_HOST=http://127.0.0.1:11434 ollama stop $model >/dev/null 2>&1 || true" | Out-Null
  }
}
$health = Get-Health
Write-Log ("health cpu={0}% freeRam={1}GB freeC={2}GB" -f $health.Cpu,$health.FreeRamGB,$health.FreeCGB)

$desktop = [Environment]::GetFolderPath('Desktop')
Get-ChildItem $desktop -File -Filter 'world_cleanup_*.ps1' -ErrorAction SilentlyContinue |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddHours(-1) } |
  ForEach-Object {
    if ($DryRun) { Write-Log ("DRYRUN would remove " + $_.FullName) }
    else { Remove-Item -LiteralPath $_.FullName -Force; Write-Log ("removed " + $_.Name) }
  }

$temp = [IO.Path]::GetTempPath()
Get-ChildItem $temp -Force -ErrorAction SilentlyContinue |
  Where-Object {
    $_.LastWriteTime -lt (Get-Date).AddDays(-2) -and
    $_.Name -match '^(world[_-]server|worldserver|ws-)'
  } | ForEach-Object {
    if ($DryRun) { Write-Log ("DRYRUN would remove temp " + $_.FullName) }
    else { Remove-Item -LiteralPath $_.FullName -Recurse -Force; Write-Log ("removed temp " + $_.Name) }
  }

Get-ChildItem $StateRoot -File -Filter '*.log' -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -ne $Log -and $_.LastWriteTime -lt (Get-Date).AddDays(-14) } |
  Remove-Item -Force -ErrorAction SilentlyContinue

if (Test-Path (Join-Path $Repo '.git')) {
  $branch = git -C $Repo branch --show-current
  $dirty = (git -C $Repo status --porcelain | Measure-Object).Count
  Write-Log ("git branch={0} dirty={1}" -f $branch,$dirty)
  if (-not $DryRun) {
    $oldPreference = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    git -C $Repo fetch origin --prune 2>$null | Out-Null
    git -C $Repo gc --auto 2>$null | Out-Null
    $ErrorActionPreference = $oldPreference
  }
}

$tooBusy = ($health.Cpu -ge 70 -or $health.FreeRamGB -lt 4.0 -or $health.FreeCGB -lt 20)
if ($tooBusy) {
  Write-Log 'resource gate active: Agent Zero review skipped'
  Stop-WorldServerOllama
  exit 0
}

try {
  $ui = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:5080/' -TimeoutSec 3
  if ($ui.StatusCode -ne 200) { throw 'Agent Zero UI unhealthy' }
} catch {
  Write-Log 'Agent Zero is not running; maintenance stays lightweight and does not auto-start it'
  exit 0
}

if ($DryRun) {
  Write-Log 'DRYRUN would run read-only Agent Zero review'
  exit 0
}

$a0 = 'C:\Users\user\.local\bin\a0.exe'
$review = Join-Path $StateRoot 'agent-zero-latest-review.txt'
$prompt = @(
  'Read /workspace/World_server/AGENTS.md and the first current section of /workspace/World_server/WORK_IN_PROGRESS.md.',
  'Act only as a low-impact secondary reviewer for the active World Server task.',
  'Do not edit files, do not run builds/tests, do not create worktrees, and do not start local models.',
  'Inspect /workspace/World_server only and keep the review read-only.',
  'Report: current task, blockers, safest next action, and what should be offloaded to cloud.',
  'Keep the answer under 12 lines.'
) -join ' '

$out = & $a0 headless --host 'http://127.0.0.1:5080' --new-chat --workspace $Repo --output text --print $prompt 2>&1
$out | Set-Content -Path $review -Encoding UTF8
Write-Log 'Agent Zero read-only review completed'

$after = Get-Health
Write-Log ("after review cpu={0}% freeRam={1}GB freeC={2}GB" -f $after.Cpu,$after.FreeRamGB,$after.FreeCGB)
if ($after.FreeRamGB -lt 3.0 -or $after.Cpu -ge 85) {
  Write-Log 'post-review resource guard unloading local Ollama models'
  Stop-WorldServerOllama
}
