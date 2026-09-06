$ErrorActionPreference = 'SilentlyContinue'
$base = Join-Path $env:LOCALAPPDATA 'WorldServerAI'
$log = Join-Path $base 'performance-guard.log'
$env:OLLAMA_KEEP_ALIVE = '0'
$env:OLLAMA_MAX_LOADED_MODELS = '1'
$env:OLLAMA_NUM_PARALLEL = '1'
New-Item -ItemType Directory -Force -Path $base | Out-Null
function Log([string]$m) { "[$(Get-Date -Format s)] $m" | Add-Content -Path $log }
function Set-Priority([int]$processId,[string]$level) {
  try { (Get-Process -Id $processId -ErrorAction Stop).PriorityClass = $level } catch {}
}
function Get-RamState {
  $os = Get-CimInstance Win32_OperatingSystem
  [pscustomobject]@{
    UsedPct = [math]::Round((1-$os.FreePhysicalMemory/$os.TotalVisibleMemorySize)*100,1)
    FreeGB = [math]::Round($os.FreePhysicalMemory/1MB,2)
  }
}
function Get-CpuLoad {
  $v = (Get-CimInstance Win32_Processor | Measure-Object LoadPercentage -Average).Average
  if($null -eq $v) { return 0 }
  return [double]$v
}
function Managed-Background($p) {
  $c = [string]$p.CommandLine
  if(!$c) { return $false }
  return ($c -match '(?i)autonomous-blocker-repair|desktop-ai-session-recovery|quality-autoloop|worldserver-hourly-autopilot|\.agentmemory|godot-ai')
}
$ram = Get-RamState
$cpu = Get-CpuLoad
$procs = @(Get-CimInstance Win32_Process)
foreach($p in $procs) {
  if($p.Name -match '^(llama-server|ollama|node|python|powershell|cmd|godot-ai)(\.exe)?$' -and (Managed-Background $p -or $p.Name -match '^(llama-server|ollama)(\.exe)?$')) {
    Set-Priority $p.ProcessId 'BelowNormal'
  }
}
$dupePatterns = '(?i)autonomous-blocker-repair\.cjs\s+(loop|tick)|desktop-ai-session-recovery\.cjs\s+watchdog|worldserver-hourly-autopilot\.ps1|quality-autoloop-tick\.ps1'
$managed = @($procs | Where-Object { $_.CommandLine -match $dupePatterns })
$groups = $managed | Group-Object { ($_.CommandLine -replace '\s+',' ').Trim().ToLowerInvariant() }
foreach($g in $groups) {
  if($g.Count -le 1) { continue }
  $ordered = @($g.Group | Sort-Object CreationDate)
  foreach($dup in ($ordered | Select-Object -Skip 1)) {
    try { Stop-Process -Id $dup.ProcessId -Force; Log "DEDUP stopped pid=$($dup.ProcessId) $($dup.Name)" } catch {}
  }
}
$pressure = ($ram.UsedPct -ge 75 -or $ram.FreeGB -lt 4)
$severe = ($ram.UsedPct -ge 88 -or $ram.FreeGB -lt 1.5 -or $cpu -ge 90)
if($severe) {
  foreach($p in $procs) { if(Managed-Background $p) { Set-Priority $p.ProcessId 'Idle' } }
  Log "SEVERE pressure CPU=$cpu RAM=$($ram.UsedPct)% free=$($ram.FreeGB)GB"
}
if($pressure) {
  $llamas = @(Get-Process llama-server -ErrorAction SilentlyContinue)
  if($llamas.Count -gt 0) {
    $before = ($llamas | Measure-Object CPU -Sum).Sum
    Start-Sleep -Seconds 2
    $llamas2 = @(Get-Process llama-server -ErrorAction SilentlyContinue)
    $after = ($llamas2 | Measure-Object CPU -Sum).Sum
    $logical = [math]::Max(1,(Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors)
    $llamaCpu = [math]::Round((($after-$before)/(2*$logical))*100,1)
    if($llamaCpu -le 2) {
      $rows = @(& ollama ps 2>$null | Select-Object -Skip 1)
      foreach($row in $rows) {
        if($row -match '^\s*(\S+)') {
          $model = $matches[1]
          & ollama stop $model 2>$null | Out-Null
          Log "UNLOAD idle Ollama model=$model CPU=$llamaCpu RAM=$($ram.UsedPct)%"
        }
      }
    } else { Log "DEFER active Ollama CPU=$llamaCpu RAM=$($ram.UsedPct)%" }
  }
}
if(Test-Path $log) {
  $f = Get-Item $log
  if($f.Length -gt 2MB) { @(Get-Content $log -Tail 1000) | Set-Content $log }
}

$limits = @{ OLLAMA_KEEP_ALIVE='0'; OLLAMA_MAX_LOADED_MODELS='1'; OLLAMA_NUM_PARALLEL='1' }
foreach($k in $limits.Keys) {
  if([Environment]::GetEnvironmentVariable($k,'User') -ne $limits[$k]) {
    [Environment]::SetEnvironmentVariable($k,$limits[$k],'User')
    Log "SET user env $k=$($limits[$k])"
  }
}
$restartMarker = Join-Path $base 'ollama-env-applied-v1.marker'
if(-not (Test-Path $restartMarker)) {
  $loaded = @(& ollama ps 2>$null | Select-Object -Skip 1 | Where-Object { $_.Trim() })
  if($loaded.Count -eq 0) {
    $ollamaProcs = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('ollama.exe','ollama app.exe') })
    foreach($op in $ollamaProcs) {
      try { Stop-Process -Id $op.ProcessId -Force } catch {}
    }
    Start-Sleep -Seconds 2
    $app = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama app.exe'
    if(Test-Path $app) {
      Start-Process -FilePath $app | Out-Null
      Set-Content -Path $restartMarker -Value (Get-Date -Format o)
      Log 'RESTARTED Ollama once while idle so memory limits take effect immediately'
    }
  }
}
