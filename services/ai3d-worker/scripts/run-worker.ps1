$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)
if (Test-Path ".env") {
  Get-Content ".env" | Where-Object { $_ -and -not $_.StartsWith('#') } | ForEach-Object {
    $k,$v = $_ -split '=',2
    if ($k) { [Environment]::SetEnvironmentVariable($k.Trim(), $v.Trim(), 'Process') }
  }
}
$port = if ($env:AI3D_PORT) { $env:AI3D_PORT } else { "8787" }
python -m uvicorn server:app --host 0.0.0.0 --port $port --workers 1
