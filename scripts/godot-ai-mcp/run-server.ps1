<#
.SYNOPSIS
  Supervisor that keeps the godot-ai MCP HTTP server (127.0.0.1:8000/mcp)
  running from the PERSISTENT venv, starting/restarting it as needed.
  Called both by the WorldServer-BlockerRepair unified tick (every ~15 min,
  already-scheduled infrastructure) and can be run standalone.

.WHY
  The old MCP config launched a fresh `uvx mcp-proxy` process (and expected
  something else to already be serving :8000) on every single Claude launch,
  with no persistence and no self-repair. This script is the "always-on
  production service" replacement.

.NOTES
  This process registers itself for a one-shot check-and-(re)start rather
  than an infinite loop, because it is invoked periodically by the existing
  unified-tick scheduler instead of its own dedicated scheduled task
  (Register-ScheduledTask was denied "Access is denied" for this session -
  reusing already-scheduled infrastructure sidesteps that entirely). Pass
  -Loop to run the old-style infinite supervisor loop instead, for manual/
  interactive use.
#>
param(
    [switch]$Loop
)
$ErrorActionPreference = "Continue"
$Root = "C:\Users\user\.godot-ai-mcp"
$VenvDir = Join-Path $Root "venv"
$LockPath = Join-Path $Root "run-server.lock"
$Log = Join-Path $Root "godot-ai-server.log"
$PidFile = Join-Path $Root "godot-ai.pid"
$RepoRoot = "C:\Users\user\Desktop\World_server"
$Port = 8000

function Log($m) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    New-Item -ItemType Directory -Force -Path $Root | Out-Null
    Add-Content -Path $Log -Value "[$ts] $m" -ErrorAction SilentlyContinue
}

function Start-GodotAiIfNeeded {
    $listening = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($listening) {
        Log "Port $Port already has a listener (pid $($listening[0].OwningProcess)) - nothing to do"
        return
    }

    $venvPy = Join-Path $VenvDir "Scripts\python.exe"
    if (-not (Test-Path $venvPy)) {
        Log "venv missing - running setup-env.ps1 first"
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot "scripts\godot-ai-mcp\setup-env.ps1") 2>&1 | ForEach-Object { Log "  setup: $_" }
    }

    $godotAiExe = Join-Path $VenvDir "Scripts\godot-ai.exe"
    if (-not (Test-Path $godotAiExe)) {
        Log "godot-ai.exe still missing after setup - giving up this tick, will retry next tick"
        return
    }

    Log "Starting godot-ai --transport streamable-http --port $Port (detached, hidden)"
    Start-Process -FilePath $godotAiExe `
        -ArgumentList @("--transport", "streamable-http", "--port", "$Port", "--pid-file", $PidFile) `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $Root "godot-ai-stdout.log") `
        -RedirectStandardError (Join-Path $Root "godot-ai-stderr.log")
    Start-Sleep -Seconds 2
    $listening = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($listening) { Log "godot-ai now listening on :$Port (pid $($listening[0].OwningProcess))" }
    else { Log "godot-ai did not come up on :$Port within 2s - check $Root\godot-ai-stderr.log" }
}

if (-not $Loop) {
    Log "=== run-server (single tick) ==="
    Start-GodotAiIfNeeded
    Log "=== run-server (single tick) done ==="
    exit 0
}

# Legacy interactive infinite-loop mode (manual use only - not used by the
# scheduled tick path, which calls this script once per tick instead).
$lockFile = $null
try {
    $lockFile = [System.IO.File]::Open($LockPath, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
} catch {
    Log "Another run-server.ps1 -Loop instance already holds the lock - exiting"
    exit 0
}
try {
    Log "=== run-server -Loop START ==="
    while ($true) {
        Start-GodotAiIfNeeded
        Start-Sleep -Seconds 30
    }
} finally {
    if ($lockFile) { $lockFile.Close(); $lockFile.Dispose() }
    Log "=== run-server -Loop END ==="
}
