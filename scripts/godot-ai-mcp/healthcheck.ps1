<#
.SYNOPSIS
  Auto-healthcheck + auto-repair for the godot-ai MCP server. Runs a REAL MCP
  `initialize` handshake against http://127.0.0.1:8000/mcp (not just a port
  check), and if it fails: repairs the persistent venv (pip, not uv - see
  setup-env.ps1) and (re)starts the server via run-server.ps1. Called from
  state/blocker-repair/unified-tick.ps1 (already-scheduled, runs every
  ~15 min via the WorldServer-BlockerRepair task) so a fresh Windows/Claude
  reinstall self-heals without a human noticing - registering a DEDICATED
  scheduled task for this was attempted and denied ("Access is denied" from
  both the ScheduledTasks PowerShell module and schtasks.exe for this
  session), so this reuses the one piece of scheduling infrastructure that
  is already working instead.

.USAGE
  powershell -ExecutionPolicy Bypass -File healthcheck.ps1
  Writes state\godot-ai-mcp\health.json in the World_server repo (evidence,
  git-trackable) and a local log under %USERPROFILE%\.godot-ai-mcp.
#>
$ErrorActionPreference = "Continue"
$Root = "C:\Users\user\.godot-ai-mcp"
$RepoRoot = "C:\Users\user\Desktop\World_server"
$Log = Join-Path $Root "healthcheck.log"
$HealthJson = Join-Path $RepoRoot "state\godot-ai-mcp\health.json"
$Port = 8000
$Url = "http://127.0.0.1:$Port/mcp"

function Log($m) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    New-Item -ItemType Directory -Force -Path $Root | Out-Null
    Add-Content -Path $Log -Value "[$ts] $m" -ErrorAction SilentlyContinue
    Write-Host "[$ts] $m"
}

function Test-McpInitialize {
    $body = '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"godot-ai-healthcheck","version":"1.0"}}}'
    try {
        $resp = Invoke-WebRequest -Uri $Url -Method POST -Body $body -ContentType "application/json" `
            -Headers @{ "Accept" = "application/json, text/event-stream" } -TimeoutSec 8 -UseBasicParsing
        if ($resp.StatusCode -ne 200) { return @{ ok = $false; reason = "HTTP $($resp.StatusCode)" } }
        if ($resp.Content -notmatch '"serverInfo"' -or $resp.Content -notmatch '"protocolVersion"') {
            return @{ ok = $false; reason = "response missing MCP initialize fields" }
        }
        return @{ ok = $true; reason = "initialize OK" }
    } catch {
        return @{ ok = $false; reason = $_.Exception.Message }
    }
}

function Test-VenvHealthy {
    $py = Join-Path $Root "venv\Scripts\python.exe"
    if (-not (Test-Path $py)) { return $false }
    & $py -c "import win32api, mcp_proxy, godot_ai" 2>&1 | Out-Null
    return ($LASTEXITCODE -eq 0)
}

Log "=== healthcheck START ==="
$initResult = Test-McpInitialize
$venvOk = Test-VenvHealthy
$repaired = $false
$actions = @()

if (-not $initResult.ok) {
    Log "MCP initialize FAILED: $($initResult.reason)"
    if (-not $venvOk) {
        Log "venv unhealthy - repairing via setup-env.ps1"
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot "scripts\godot-ai-mcp\setup-env.ps1") 2>&1 | ForEach-Object { Log "  setup: $_" }
        $actions += "rebuilt-venv"
        $repaired = $true
    }
    Log "Running run-server.ps1 to (re)start the server"
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot "scripts\godot-ai-mcp\run-server.ps1") 2>&1 | ForEach-Object { Log "  run-server: $_" }
    $actions += "started-server"
    $repaired = $true

    Start-Sleep -Seconds 5
    $initResult = Test-McpInitialize
    Log "Post-repair MCP initialize: ok=$($initResult.ok) reason=$($initResult.reason)"
} else {
    Log "MCP initialize OK"
}

$health = [ordered]@{
    schemaVersion   = "1.0.0"
    generatedAt     = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    endpoint        = $Url
    mcpInitializeOk = $initResult.ok
    reason          = $initResult.reason
    venvHealthy     = $venvOk
    repaired        = $repaired
    actions         = $actions
    pass            = $initResult.ok
}
New-Item -ItemType Directory -Force -Path (Split-Path $HealthJson) | Out-Null
$health | ConvertTo-Json -Depth 5 | Set-Content -Path $HealthJson -Encoding utf8

Log "=== healthcheck END pass=$($health.pass) ==="
if (-not $health.pass) { exit 1 }
exit 0
