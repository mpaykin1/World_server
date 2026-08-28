<#
.SYNOPSIS
  Create/repair the PERSISTENT Python environment for the godot-ai MCP server
  and the mcp-proxy stdio<->HTTP bridge.

.WHY
  `uvx` rebuilds an ephemeral environment from scratch on every Claude launch.
  On Windows, installing pywin32==312 through uv's wheel installer fails
  reproducibly:
    "Wheel contains an invalid entry (directory) in the `scripts` directory"
  pywin32's published wheel for this build genuinely contains a stray
  `.tmpXXXXXX` directory inside `pywin32-312.data/scripts` (an upstream
  packaging defect), which uv's strict wheel-structure validator rejects.
  `pip` is lenient about this and installs it fine. So: build ONE persistent
  venv with `pip` (never uv's installer) and never touch `uvx` again for this
  server - this removes the whole class of "uvx rebuild hits a flaky/broken
  wheel" failures, not just this one instance of it.

.USAGE
  powershell -ExecutionPolicy Bypass -File setup-env.ps1
  Idempotent - safe to re-run. Exit code 0 on success, non-zero on failure.
#>
$ErrorActionPreference = "Stop"
$EnvRoot = "C:\Users\user\.godot-ai-mcp"
$VenvDir = Join-Path $EnvRoot "venv"
$PyExe = "C:\Users\user\AppData\Local\Programs\Python\Python311\python.exe"
$LogFile = Join-Path $EnvRoot "setup.log"

function Log($m) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] $m"
    New-Item -ItemType Directory -Force -Path $EnvRoot | Out-Null
    Add-Content -Path $LogFile -Value $line -ErrorAction SilentlyContinue
    Write-Host $line
}

function Test-VenvHealthy {
    $py = Join-Path $VenvDir "Scripts\python.exe"
    if (-not (Test-Path $py)) { return $false }
    $probe = & $py -c "import win32api, mcp_proxy, godot_ai; print('OK')" 2>&1
    return ($LASTEXITCODE -eq 0 -and $probe -match "OK")
}

Log "=== setup-env START ==="

if (Test-VenvHealthy) {
    Log "venv already healthy (pywin32 + mcp-proxy + godot-ai importable) - nothing to do"
    Log "=== setup-env END (already healthy) ==="
    exit 0
}

if (-not (Test-Path $PyExe)) {
    Log "FATAL: Python 3.11 not found at $PyExe - install it first (https://www.python.org/downloads/, or `winget install Python.Python.3.11`)"
    exit 1
}
$verLine = & $PyExe --version 2>&1
Log "Using base interpreter: $PyExe ($verLine)"

if (Test-Path $VenvDir) {
    Log "Removing stale/broken venv at $VenvDir"
    Remove-Item -LiteralPath $VenvDir -Recurse -Force -ErrorAction SilentlyContinue
}

Log "Creating venv at $VenvDir"
& $PyExe -m venv $VenvDir
if ($LASTEXITCODE -ne 0) { Log "FATAL: venv creation failed"; exit 1 }

$venvPy = Join-Path $VenvDir "Scripts\python.exe"

Log "Upgrading pip"
& $venvPy -m pip install --upgrade pip 2>&1 | ForEach-Object { Log "  pip: $_" }

# Install pywin32 FIRST and separately, via pip (not uv) - this is the one
# package that trips uv's wheel validator. Everything else can use either
# installer; pip end-to-end keeps this script dependency-free of uv.
Log "Installing pywin32==312 via pip (bypasses uv's wheel-structure validator)"
& $venvPy -m pip install "pywin32==312" 2>&1 | ForEach-Object { Log "  pip: $_" }
if ($LASTEXITCODE -ne 0) {
    Log "pywin32==312 failed - retrying with latest pywin32 (unpinned) in case 312 is pulled from PyPI or the mirror serves a different, valid build"
    & $venvPy -m pip install "pywin32" 2>&1 | ForEach-Object { Log "  pip: $_" }
    if ($LASTEXITCODE -ne 0) { Log "FATAL: pywin32 install failed on both attempts"; exit 1 }
}

Log "Installing mcp-proxy==0.11.0 and godot-ai"
& $venvPy -m pip install "mcp-proxy==0.11.0" "godot-ai" 2>&1 | ForEach-Object { Log "  pip: $_" }
if ($LASTEXITCODE -ne 0) { Log "FATAL: mcp-proxy/godot-ai install failed"; exit 1 }

if (-not (Test-VenvHealthy)) {
    Log "FATAL: venv still not healthy after install (import check failed)"
    exit 1
}

Log "venv healthy: pywin32 + mcp-proxy + godot-ai all import cleanly"
Log "=== setup-env END (rebuilt) ==="
exit 0
