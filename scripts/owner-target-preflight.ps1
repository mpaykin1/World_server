#requires -version 5.1
<#
Read-only owner-side access proof for an existing Supabase target.
Never saves or prints the password; no dumps, DDL, or deployment.
Execute from the PR #514 checkout on the owner's Windows machine.
#>
[CmdletBinding()]
param(
  [string]$PoolerHost,
  [string]$CaCertificate = 'system',
  [switch]$SelfTest
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$project = 'xlcdnlsyvxqtopmkweiy'

function Assert-PoolerHost([string]$HostName) {
  $value = $HostName.Trim()
  if ($value -notmatch '^[a-z0-9][a-z0-9.-]*\.pooler\.supabase\.com$' -or
      $value.Contains('..') -or $value.Length -gt 220) {
    throw 'Use only the Session pooler hostname copied from the new Supabase project Connect dialog.'
  }
  return $value
}
function Assert-Certificate([string]$Certificate) {
  if ($Certificate -eq 'system') { return 'system' }
  if (-not (Test-Path -LiteralPath $Certificate -PathType Leaf)) {
    throw 'CA certificate not found. Download the CA certificate from target Database Settings.'
  }
  return (Resolve-Path -LiteralPath $Certificate).Path
}

if ($SelfTest) {
  if ((Assert-PoolerHost 'aws-0-ap-southeast-1.pooler.supabase.com') -ne
      'aws-0-ap-southeast-1.pooler.supabase.com') { throw 'valid host rejected' }
  foreach ($hostile in @('db.old.supabase.co', 'localhost', 'pooler.supabase.com.evil.com',
      'https://aws-0-ap-southeast-1.pooler.supabase.com', 'a..pooler.supabase.com')) {
    try { [void](Assert-PoolerHost $hostile); throw 'unsafe host accepted' }
    catch { if ($_.Exception.Message -eq 'unsafe host accepted') { throw } }
  }
  if ((Assert-Certificate 'system') -ne 'system') { throw 'system CA mode invalid' }
  Write-Output 'TARGET_PREFLIGHT_SELFTEST_PASS'
  return
}

if (-not $PoolerHost) {
  Write-Output 'Copy the Session pooler HOSTNAME from the target Supabase Connect dialog, not the full URL.'
  $PoolerHost = Read-Host 'Session pooler hostname'
}
$PoolerHost = Assert-PoolerHost $PoolerHost
$CaCertificate = Assert-Certificate $CaCertificate

$pgBinary = Join-Path $env:LOCALAPPDATA 'WorldServerAI\tools\postgresql-17\pgsql\bin\psql.exe'
if (-not (Test-Path -LiteralPath $pgBinary -PathType Leaf)) {
  throw 'PostgreSQL 17 client not installed in expected WorldServerAI tools folder.'
}

Write-Output 'Enter the NEW project PostgreSQL database password (input hidden).'
$secure = Read-Host 'Target database password' -AsSecureString
$ptr = [IntPtr]::Zero
$plain = $null
$oldPg = @{}
$keys = @('PGHOST', 'PGHOSTADDR', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD', 'PGSSLMODE',
  'PGSSLROOTCERT', 'PGSSLCRL', 'PGSSLCRLDIR', 'PGSSLCERT', 'PGSSLKEY', 'PGSSLPASSWORD',
  'PGCONNECT_TIMEOUT', 'PGAPPNAME', 'PGOPTIONS', 'PGSERVICE', 'PGSERVICEFILE',
  'PGPASSFILE', 'PGGSSENCMODE')
try {
  foreach ($key in $keys) {
    $oldPg[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
    [Environment]::SetEnvironmentVariable($key, $null, 'Process')
  }
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  if ([string]::IsNullOrEmpty($plain)) { throw 'Empty database password' }
  [Environment]::SetEnvironmentVariable('PGHOST', $PoolerHost, 'Process')
  [Environment]::SetEnvironmentVariable('PGPORT', '5432', 'Process')
  [Environment]::SetEnvironmentVariable('PGDATABASE', 'postgres', 'Process')
  [Environment]::SetEnvironmentVariable('PGUSER', 'postgres.' + $project, 'Process')
  [Environment]::SetEnvironmentVariable('PGPASSWORD', $plain, 'Process')
  [Environment]::SetEnvironmentVariable('PGSSLMODE', 'verify-full', 'Process')
  [Environment]::SetEnvironmentVariable('PGSSLROOTCERT', $CaCertificate, 'Process')
  [Environment]::SetEnvironmentVariable('PGCONNECT_TIMEOUT', '15', 'Process')
  [Environment]::SetEnvironmentVariable('PGAPPNAME', 'world-server-owner-target-preflight', 'Process')
  [Environment]::SetEnvironmentVariable('PGOPTIONS',
    '-c default_transaction_read_only=on -c statement_timeout=15000', 'Process')
  [Environment]::SetEnvironmentVariable('PGGSSENCMODE', 'disable', 'Process')
  $query = "SELECT json_build_object('verified_target_login',current_user,'database',current_database(),'postgres',current_setting('server_version'),'tables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname IN ('public','private')));"
  $result = & $pgBinary -X --no-psqlrc -q -t -A -v ON_ERROR_STOP=1 -c $query 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $result) {
    throw 'Target authentication/SSL failed. Confirm the target database password, session pooler hostname and target CA certificate. No changes made.'
  }
  $report = $result | ConvertFrom-Json
  if ($report.verified_target_login -ne ('postgres.' + $project) -and $report.verified_target_login -ne 'postgres') {
    throw 'Unexpected target database identity. No changes made.'
  }
  $safe = [ordered]@{
    verified_target_project = $project
    verified_user = $report.verified_target_login
    database = $report.database
    postgres = $report.postgres
    public_private_tables = $report.tables
    mode = 'READ_ONLY'
    source_untouched = $true
    backup_created = $false
    owner_verdict = 'PENDING'
  }
  $safe | ConvertTo-Json -Compress
} finally {
  [Environment]::SetEnvironmentVariable('PGPASSWORD', $null, 'Process')
  foreach ($key in $keys) { [Environment]::SetEnvironmentVariable($key, $oldPg[$key], 'Process') }
  if ($ptr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
  $plain = $null
  if ($secure) { $secure.Dispose() }
}
