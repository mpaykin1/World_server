$ErrorActionPreference = 'Stop'
$repo = 'C:\Users\user\Desktop\World_server'
$statusPath = Join-Path $repo 'LONG_SOAK_STATUS.json'
$metaPath = Join-Path $repo '.world-server-state\long-soak\process.json'
if (Test-Path $statusPath) {
  $status = Get-Content $statusPath -Raw | ConvertFrom-Json
  if ($status.longSoakCertified -eq $true) {
    schtasks.exe /Change /TN 'WorldServer_LongSoak_Watchdog' /Disable 2>$null | Out-Null
    exit 0
  }
}
$meta = $null
if (Test-Path $metaPath) { $meta = Get-Content $metaPath -Raw | ConvertFrom-Json }
if ($meta -and $meta.pid) {
  if (Get-Process -Id ([int]$meta.pid) -ErrorAction SilentlyContinue) { exit 0 }
}
$logDir = Join-Path $env:LOCALAPPDATA 'WorldServerAI\long-soak'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$out = Join-Path $logDir 'long-soak-watchdog.out.log'
$err = Join-Path $logDir 'long-soak-watchdog.err.log'
$p = Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' -ArgumentList @('scripts\long-soak-runner.cjs','run','8','--resume') -WorkingDirectory $repo -RedirectStandardOutput $out -RedirectStandardError $err -WindowStyle Hidden -PassThru
try { $p.PriorityClass = 'BelowNormal' } catch {}
$record = [ordered]@{ pid=$p.Id; startedAt=[DateTime]::UtcNow.ToString('o'); targetHours=8; stdout=$out; stderr=$err; source='watchdog'; resume=$true }
$record | ConvertTo-Json | Set-Content $metaPath -Encoding UTF8
