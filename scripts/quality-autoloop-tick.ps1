$ErrorActionPreference="Continue"
$root="C:\Users\user\Desktop\World_server"
$log="$root\QUALITY_AUTOLOOP.log"
function Log($m){ $ts=Get-Date -Format "yyyy-MM-dd HH:mm:ss"; "[$ts] $m" | Out-File -Append $log; Write-Host "[$ts] $m" }
Log "=== AUTOLOOP TICK START ==="

# Single source of truth for the expected migrations state is
# scripts/check-supabase-migrations.js (committed, versioned alongside the
# migration files themselves). Do NOT hardcode count/digest here - a
# hardcoded copy of this invariant is exactly what caused this script to
# auto-revert and force-push away two legitimate, guard-passing migrations
# (ai_supervisor_control_plane, orchestrator_leader_lease) that were added
# and verified locally but hadn't been picked up by this loop's stale
# baseline yet. See AGENTS.md rule 13 (no duplicate systems) and the
# incident notes in WORK_IN_PROGRESS.md.
try {
  $guard = & "C:\Program Files\nodejs\node.exe" "$root\scripts\check-supabase-migrations.js" 2>&1
  $guard | ForEach-Object { Log "  guard: $_" }
  if ($LASTEXITCODE -eq 0) {
    Log "LOCAL migrations match the committed guard (scripts/check-supabase-migrations.js) - OK"
  } else {
    # Guard failure now only LOGS an actionable warning. It never
    # auto-restores or auto-commits/pushes: an unattended script silently
    # rewriting supabase/migrations/ and force-pushing to whatever branch
    # happens to be checked out is unsafe in a multi-AI/multi-branch repo
    # and previously destroyed real in-progress work. A human or an
    # active AI session must reconcile this deliberately (either fix the
    # working tree to match the guard, or - if the change is intentional -
    # update scripts/check-supabase-migrations.js and commit both together).
    Log "GUARD FAILED - migrations drifted from the committed baseline. NOT auto-restoring/auto-pushing (see AGENTS.md rule 17 COMMIT DISCIPLINE). Needs manual/AI review."
  }
} catch { Log "ERROR running migration guard: $_" }

try {
  $ahead = git -C $root rev-list --count "origin/master..HEAD" 2>&1
  Log "commits ahead of master: $ahead (need PR if >0)"
} catch { Log "git ahead check failed $_" }

try {
  $plug = & "C:\Program Files\nodejs\node.exe" "$root\scripts\discover-quality-plugins.js" 2>&1 | Out-String
  Log "PLUGIN DISCOVER: $plug"
  & "C:\Program Files\nodejs\node.exe" "$root\scripts\auto-wire-plugins.js" 2>&1 | Out-File -Append $log
  Log "PLUGIN AUTO-WIRE tick done"
} catch { Log "PLUGIN check failed $_" }

Log "=== AUTOLOOP TICK END ==="
# Blocker repair is intentionally NOT invoked here. The unified scheduler owns
# that step exactly once per cycle; calling it here caused duplicate heavy work.
