$ErrorActionPreference = 'Stop'
$repo = 'C:\Users\user\Desktop\World_server'
$names = @(
  'WORLD_SERVER_REMOTE_CAS_URL',
  'WORLD_SERVER_CAS_TOKEN',
  'WORLD_SERVER_CAS_PEERS_JSON',
  'WORLD_SERVER_LEASE_URL',
  'WORLD_SERVER_LEASE_TOKEN'
)
foreach ($name in $names) {
  $value = [Environment]::GetEnvironmentVariable($name, 'User')
  if ($value) { Set-Item -Path ('Env:' + $name) -Value $value }
}
$logDir = Join-Path $env:LOCALAPPDATA 'WorldServerAI\verification'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$out = Join-Path $logDir 'release-gate.out.log'
$err = Join-Path $logDir 'release-gate.err.log'
Remove-Item $out,$err -Force -ErrorAction SilentlyContinue
$p = Start-Process -FilePath 'C:\Windows\System32\cmd.exe' -ArgumentList @('/d','/s','/c','npm run release:gate') -WorkingDirectory $repo -RedirectStandardOutput $out -RedirectStandardError $err -PassThru -WindowStyle Hidden
try { $p.PriorityClass = 'BelowNormal' } catch {}
Write-Output ('RELEASE_PID=' + $p.Id)
