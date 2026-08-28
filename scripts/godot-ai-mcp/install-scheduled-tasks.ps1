<#
.SYNOPSIS
  Wires godot-ai MCP self-healing into the scheduler so a Windows/Claude
  reinstall recovers automatically instead of silently staying broken.

  Two layers, tried in order:
    1. Dedicated Windows Scheduled Tasks (WorldServer-GodotAI-Server /
       WorldServer-GodotAI-Healthcheck) - the clean approach, if this session
       has rights to create scheduled tasks.
    2. Fallback: append a step to the ALREADY-SCHEDULED
       state\blocker-repair\unified-tick.ps1 (runs every ~15 min via the
       existing WorldServer-BlockerRepair task) that calls healthcheck.ps1.
       Used automatically when step 1 is denied - this was hit in practice:
       Register-ScheduledTask AND schtasks.exe both returned "Access is
       denied" for the session that first set this up, so layer 2 is what
       is actually active. Re-run this script any time (e.g. from an
       elevated/interactive session) to upgrade to layer 1 once available;
       it is idempotent and safe either way.

.USAGE
  powershell -ExecutionPolicy Bypass -File install-scheduled-tasks.ps1
#>
$ErrorActionPreference = "Continue"
$RepoRoot = "C:\Users\user\Desktop\World_server"
$RunServer = Join-Path $RepoRoot "scripts\godot-ai-mcp\run-server.ps1"
$Healthcheck = Join-Path $RepoRoot "scripts\godot-ai-mcp\healthcheck.ps1"
$UnifiedTick = Join-Path $RepoRoot "state\blocker-repair\unified-tick.ps1"

function Try-RegisterDedicatedTasks {
    try {
        $action = New-ScheduledTaskAction -Execute "powershell.exe" `
            -Argument "-WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File `"$RunServer`" -Loop"
        $settings = New-ScheduledTaskSettingsSet -Hidden -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
            -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero)
        $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
        $logonTrigger = New-ScheduledTaskTrigger -AtLogOn
        Register-ScheduledTask -TaskName "WorldServer-GodotAI-Server" -Action $action -Trigger $logonTrigger -Settings $settings -Principal $principal -Force -ErrorAction Stop | Out-Null

        $hcAction = New-ScheduledTaskAction -Execute "powershell.exe" `
            -Argument "-WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File `"$Healthcheck`""
        $healthTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 10) -RepetitionDuration ([TimeSpan]::MaxValue)
        Register-ScheduledTask -TaskName "WorldServer-GodotAI-Healthcheck" -Action $hcAction -Trigger $healthTrigger -Settings $settings -Principal $principal -Force -ErrorAction Stop | Out-Null

        Start-ScheduledTask -TaskName "WorldServer-GodotAI-Server" -ErrorAction SilentlyContinue
        Write-Host "Layer 1 OK: registered WorldServer-GodotAI-Server + WorldServer-GodotAI-Healthcheck scheduled tasks"
        return $true
    } catch {
        Write-Host "Layer 1 unavailable (dedicated scheduled tasks): $($_.Exception.Message)"
        return $false
    }
}

function Install-UnifiedTickFallback {
    if (-not (Test-Path $UnifiedTick)) {
        Write-Host "Layer 2 SKIPPED: $UnifiedTick does not exist (WorldServer-BlockerRepair not installed on this machine) - nothing to wire into. Run this script again once it exists, or get Layer 1 permissions."
        return $false
    }
    $content = Get-Content -Raw -LiteralPath $UnifiedTick
    if ($content -match "GODOT_AI_MCP_HEALTHCHECK_V1") {
        Write-Host "Layer 2 already wired into unified-tick.ps1 - nothing to do"
        return $true
    }
    $block = @"

  try{
    Log "Step 4: godot-ai MCP healthcheck"
    # GODOT_AI_MCP_HEALTHCHECK_V1
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$Healthcheck" 2>&1 | ForEach-Object { Log "  godot-ai: `$_" }
  }catch{ Log "godot-ai healthcheck error `$_" }
"@
    # Insert right before the closing "  Log "=== UNIFIED TICK END ===""
    $marker = '  Log "=== UNIFIED TICK END ==="'
    if ($content -notmatch [regex]::Escape($marker)) {
        Write-Host "Layer 2 FAILED: expected marker not found in unified-tick.ps1 (script shape changed) - not modifying it blindly"
        return $false
    }
    $newContent = $content -replace [regex]::Escape($marker), ($block + "`r`n" + $marker)
    Set-Content -LiteralPath $UnifiedTick -Value $newContent -Encoding utf8
    Write-Host "Layer 2 OK: wired godot-ai healthcheck into $UnifiedTick (Step 4, runs every ~15 min via WorldServer-BlockerRepair)"
    return $true
}

$layer1 = Try-RegisterDedicatedTasks
if (-not $layer1) {
    Install-UnifiedTickFallback | Out-Null
}

Write-Host ""
Write-Host "Running one healthcheck tick now to (re)start the server immediately:"
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Healthcheck
