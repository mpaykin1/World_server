# User-scope, idempotent GitHub CLI installer for Windows. Never touches a working gh.exe.
# Source: official cli/cli release; verifies archive against the published SHA-256 manifest.
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$root = Join-Path $env:LOCALAPPDATA 'WorldServerAI\tools\github-cli'
$exe = Join-Path $root 'gh.exe'
if (Test-Path $exe) {
  try {
    & $exe --version | Select-Object -First 1
    if ($LASTEXITCODE -ne 0) { throw 'gh failed' }
    Write-Output 'GH_ALREADY_INSTALLED'
    exit 0
  } catch { throw 'Existing gh.exe is broken; refusing to overwrite automatically.' }
}
New-Item -ItemType Directory -Path $root -Force | Out-Null
$staging = Join-Path $env:LOCALAPPDATA ('WorldServerAI\tools\gh-install-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $staging -Force | Out-Null
try {
  $headers = @{ 'User-Agent' = 'WorldServer-gh-bootstrap'; 'Accept' = 'application/vnd.github+json' }
  $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/cli/cli/releases/latest' -Headers $headers
  $archiveAsset = @($release.assets | Where-Object { $_.name -match '^gh_[0-9.]+_windows_amd64\.zip$' }) | Select-Object -First 1
  $sumsAsset = @($release.assets | Where-Object { $_.name -match '^gh_[0-9.]+_checksums\.txt$' }) | Select-Object -First 1
  if (!$archiveAsset -or !$sumsAsset) { throw 'Official release is missing ZIP/checksums.' }
  $archive = Join-Path $staging $archiveAsset.name
  $sums = Join-Path $staging $sumsAsset.name
  Write-Output ('OFFICIAL_RELEASE ' + $release.tag_name)
  Invoke-WebRequest -UseBasicParsing -Uri $archiveAsset.browser_download_url -OutFile $archive -Headers $headers
  Invoke-WebRequest -UseBasicParsing -Uri $sumsAsset.browser_download_url -OutFile $sums -Headers $headers
  $manifest = Get-Content -LiteralPath $sums -Raw
  $regex = '(?m)^([0-9a-fA-F]{64})\s+\*?' + [regex]::Escape($archiveAsset.name) + '\s*$'
  $m = [regex]::Match($manifest, $regex)
  if (!$m.Success) { throw 'Archive not found in official checksum manifest.' }
  $expected = $m.Groups[1].Value.ToLowerInvariant()
  $actual = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($expected -ne $actual) { throw 'SHA256 mismatch; installation refused.' }
  Write-Output ('SHA256_VERIFIED ' + $actual)
  $unpacked = Join-Path $staging 'unpacked'
  Expand-Archive -LiteralPath $archive -DestinationPath $unpacked
  $candidate = Get-ChildItem -LiteralPath $unpacked -Filter gh.exe -File -Recurse | Select-Object -First 1
  if (!$candidate) { throw 'Verified archive contains no gh.exe.' }
  Copy-Item -LiteralPath $candidate.FullName -Destination $exe -ErrorAction Stop
  & $exe --version | Select-Object -First 1
  if ($LASTEXITCODE -ne 0) { throw 'Installed binary failed version check.' }
  $userPath = [Environment]::GetEnvironmentVariable('Path','User')
  $parts = @($userPath -split ';' | Where-Object { $_ -and $_.Trim() })
  if ($parts -notcontains $root) {
    [Environment]::SetEnvironmentVariable('Path', (($parts + $root) -join ';'), 'User')
    Write-Output 'USER_PATH_UPDATED_NEW_TERMINALS'
  }
  Write-Output ('GH_READY ' + $exe)
} finally {
  Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
}
