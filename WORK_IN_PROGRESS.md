# WORK IN PROGRESS — Remote-task bridge production hardening

## Task
Per the user's explicit 10-point follow-up: make the Supabase-backed
remote-task bridge (PR #18) production-grade (autostart, watchdog,
healthcheck, restart, lease/anti-duplicate, crash recovery, graceful
shutdown, bounded retries + dead-letter, structured logs, telemetry,
regression tests) using existing infrastructure only; register the bridge
itself as the first real `restart_known_worker` entry; wire a real native
build pipeline to `build_native` if one exists; expand the command allowlist
with more real, existing scripts; make routing prefer free/local agents
over paid ones with escalation; auto-surface known fixes on failure;
re-verify how far capability coverage can go without ever handing the
browser raw shell/service-role/unrestricted GitHub/production secrets; and
prove resilience against reboot/network loss/worker crash/duplicate
delivery/stuck task/concurrent workers/stale worktree/failed
build-test/Supabase outage, each with a regression test.

## Why
User's explicit instruction: "Не останавливайся на 60%... максимально
заверши всё остальное самостоятельно" before asking for the one remaining
manual GitHub step.

## Current state (all verified real, not aspirational)

**0. Infra survey before writing anything** (to honor "не создавай новую
параллельную систему"): searched the whole repo for
watchdog/scheduler/leader-lease/durable-queue/crash-diagnostics/
disaster-recovery/control-plane systems. **None of these exist anywhere in
this repo** - no such script, file, or generator for the status-JSON names
suggested. The only real, wired infrastructure to build on is
`lib/collective-brain/index.js`'s `acquireLease`/`releaseLease` (file
lease, TTL + stale-reclaim), `appendEvent`/`verifyEventChain` (hash-chained
audit log), `policyGate`, `routeTask`, and the `cycle()` function's
acquire-lease/run/release-in-finally pattern, which every new piece below
copies rather than reinventing. Confirmed via direct search, not assumed.

**1. E2E audit of real master (post PR #18/#21)**: re-checked
`public.world_remote_tasks` on the live Supabase project
(`xlcdnlsyvxqtopmkweiy`) - schema intact, table empty (no leftover test
rows), `get_advisors` clean (table still absent from
`rls_enabled_no_policy`). Ran a fresh real round-trip
(queue -> claim -> real local execution -> writeback -> verify -> cleanup)
against master's actual deployed code before starting any changes.

**2-3. Production hardening of `scripts/collective-brain-remote-bridge.cjs`
+ new `scripts/collective-brain-remote-bridge-watchdog.js`**:
- Single-instance protection: every `runOnce()` cycle wraps in
  `collectiveBrain.acquireLease(ROOT,'remote-bridge-worker',...)` (the
  existing primitive, TTL 15min) - a second worker instance skips the cycle
  entirely rather than double-processing.
- Anti-duplicate execution: Supabase CAS claim (`update ... where
  status='queued'`) already prevented two workers claiming the *same* task;
  the lease now also prevents two workers claiming *different* tasks
  concurrently on one machine.
- Stuck-task reclaim: `reclaimStuckTasks()` finds tasks stuck in
  `claimed`/`running` past `REMOTE_BRIDGE_STUCK_MS` (default 10min,
  indexed via the new `world_remote_tasks_stuck_idx`), requeues them with
  `retry_count+1` if budget remains, else `dead_letter`.
- Bounded retries + dead-letter: new `retry_count`/`max_retries` (default
  2) columns (migration `world_remote_task_bridge_v2_retry_dead_letter`),
  `dead_letter` added to the status CHECK constraint. Extracted the
  decision into a pure `decideOutcomeStatus()` function (validation/policy
  errors -> `failed` immediately, no wasted retries; execution
  errors -> `retry-queued` until budget exhausted -> `dead_letter`, never
  silently vanishes).
- Crash recovery: the watchdog spawns the worker (`--watch`) detached,
  tracks it via a PID file, and on crash-loop-breaker-permitting failure,
  restarts it (bounded: `REMOTE_BRIDGE_MAX_RESTARTS`=5 per
  `REMOTE_BRIDGE_RESTART_WINDOW_MS`=10min, else `action:"circuit-open"` -
  a persistently broken worker degrades loudly instead of looping forever).
- Graceful shutdown: SIGINT/SIGTERM in `--watch` mode waits for the
  in-flight task to finish (30s hard cap) before releasing the lease and
  exiting.
- Structured logs: every lifecycle event is one JSON line to stdout
  (`{level,msg,at,component,...}`).
- Telemetry: a cheap-to-poll status snapshot at
  `data/collective-brain/runtime/remote-bridge-status.json` (updated every
  cycle) plus the existing collective-brain event chain - not a new,
  parallel telemetry system.
- Resilience to a transient Supabase failure: found and fixed a real gap -
  `claimNextTask`'s thrown error on a Supabase select failure was not
  caught anywhere in `runOnce()`, meaning a temporary Supabase outage would
  crash the whole `--watch` loop (recoverable only via the watchdog
  restarting it, a heavier response than necessary). Now caught explicitly
  and backs off to the next cycle with `{drained:false, reason:'supabase
  error: ...'}`, lease still released.
- Healthcheck: `collective-brain-remote-bridge-watchdog.js --healthcheck`
  (read-only), wired into the bridge's own new `health_status` command.
- **`restart_known_worker` now has its first real entry**:
  `allowedWorkers.collective-brain-remote-bridge ->
  scripts/collective-brain-remote-bridge-watchdog.js`, so a typed task can
  safely restart the bridge's own worker via the watchdog's `--restart`
  mode. Verified live: `executeTask({command:'restart_known_worker',
  args:{workerId:'collective-brain-remote-bridge'}})` really spawned and
  the watchdog's own PID-tracking confirmed it.
- Autostart: opt-in only (`REMOTE_BRIDGE_AUTOSTART=1`) hook in `server.js`,
  after `server.listen()`. Confirmed safe for Vercel: `vercel.json` serves
  this repo via `api/*.js` functions, never via `server.js`, so this can
  never run in the serverless production path - only in a long-lived local
  or self-hosted (e.g. Cloud Run-style) process. Verified live: started
  `server.js` with the flag on, watched the watchdog spawn a real worker
  (PID file appeared), then cleanly stopped everything.

**4. Native/EXE build pipeline**: confirmed (again, explicitly, before
touching `build_native`) that **none exists anywhere in this repo** -
`scripts/godot-runtime-smoke.js` only launches one scene headless as a
smoke test, it does not build/export an artifact; no `--export`,
electron-builder, pkg, nexe, or native/desktop build script anywhere.
**Did not fabricate one.** `build_native`'s description was tightened to
explicitly warn a future session not to wire it to
`godot-runtime-smoke.js` by mistake (it's a smoke test, not a build).
Remains `kind:"unavailable"`, reporting that status honestly.

**5. Allowlist expanded with real, already-existing scripts only**:
`run_integration_tests` -> `golden:e2e` (existing Playwright suite),
`run_release_gate` -> `release:gate` (existing full gate),
`run_visual_regression` -> `visual:check` (existing
`scripts/visual-regression.js`), `run_performance_benchmark` ->
new `perf:lighthouse` npm script wrapping `lhci autorun` against the
*same* `lighthouserc.cjs` CI's own `lighthouse` job already uses (not a
new perf tool). `read_ci_status`/`read_deployment_status`: read-only `gh`
CLI calls (`gh run list`, `gh pr list --state merged`), gated behind a
`gh auth status` check first - if `gh` isn't authenticated on the host
running the bridge, returns `{configured:false}` honestly rather than
failing unclearly or requiring a new secret. `known_issues_lookup`: keyword
match against `data/error-prevention-registry.json`'s `knownErrors` (same
data `collective-brain:recall` already reads). `health_status`: wraps the
watchdog healthcheck + event-chain integrity. `route_goal`: see below.

**6. Routing: prefer free/local agents, escalate only when needed**:
`data/collective-brain/agent-capabilities.json`'s existing (but
previously near-zero, unused) `costPenalty` field is now calibrated for
real - `desktop-ai`/`codex`/`claude-code` (paid, model-API-backed):
`costPenalty:15`; `opencode`/`openhuman` (free/local): `costPenalty:0-2`;
added a new `anythingllm` entry (`costPenalty:0`) since the user named it
explicitly and it wasn't in the capability list at all. This uses the
*existing* `routeTask()` scoring mechanism (`score -= costPenalty` before
ranking) rather than a new one - a generic/ambiguous task now ranks a free
agent first, while a strong keyword match (e.g. "architecture" for
claude-code) can still out-rank the penalty when the task genuinely needs
that agent's specific strength. New `route_goal` command exposes this as a
typed capability: given `args.goal`, returns the real ranked
recommendation. **Explicitly not implemented, and said so rather than
faking it**: an actual dispatch-and-execute-with-fallback loop that
invokes OpenCode/OpenHuman/AnythingLLM programmatically and falls back to
Claude/Codex on failure. No safe, already-existing local invocation
mechanism for those tools was found from Node in this repo/session to
build a real one on - `route_goal` is a recommendation service, not a
fake auto-dispatcher.

**7. Auto-use known fixes**: `known_issues_lookup` (above) plus: every task
failure now automatically runs the same keyword-match against
`knownErrors` and attaches hits as `result.knownIssueMatches` - a
recurring failure surfaces its own recorded root cause/fix without being
rediagnosed from scratch. `apply_patch` accepts optional `args.fixMetadata`
({id, rootCause, solution, protection[], evidence[]}); if the matching
`verify_patch` on the same `targetWorktree` then succeeds, the fix is
auto-registered via the existing `scripts/collective-brain-register-fix.js`
(not a new registration path).

**8. Capability coverage above 60% without unsafe grants**: everything
above was achievable through typed capabilities + the existing
control-plane, with zero new secrets exposed to the browser side and zero
raw shell. `read_ci_status`/`read_deployment_status` are the closest to a
new capability class (external read access) and are strictly read-only,
gated behind whatever `gh` auth already exists locally, never receiving or
forwarding a credential to the requester.

**9. Resilience - each with a real regression test** (new
`test/collective-brain-remote-bridge.test.js`, 18 tests, all against real
logic - either a realistic in-memory fake Supabase client implementing
actual CAS/filter semantics, or the real repo's own
`error-prevention-registry.json`):
- duplicate task delivery -> CAS test (second claimer loses the race).
- stuck task (crashed worker) -> reclaim-with-retry-budget test +
  dead-letter-on-exhaustion test + "recently claimed is left alone" test
  (no false reclaim).
- multiple concurrent AIs/workers -> lease-blocks-concurrent-cycle test.
- failed build/test -> non-retriable-fails-immediately test +
  retry/dead-letter pure state-machine test (`decideOutcomeStatus`, 7
  cases).
- Supabase temporary failure -> new test proving a thrown Supabase error
  is caught, cycle backs off gracefully, and (critically) the lease is
  still released for the next cycle - this is the test that caught the
  real unguarded-throw bug described in section 2-3 above.
- worker crash / reboot -> watchdog `isAlive`/`--healthcheck` tests
  (pure + CLI-level); full spawn/PID-file/stop/restart flow verified live
  manually (not an automated test - spawning/killing real detached
  processes from `node --test` risked flakiness/orphaned processes across
  concurrently-run test files sharing this worktree's real runtime
  directory, so this one is documented as manually verified rather than
  automated; the decision and the exact commands run are recorded here for
  reproducibility).
- stale worktree -> already covered by the existing `apply_patch`
  main-tree-refusal test from PR #18.
- known-issue matching -> real-match + no-false-positive tests against the
  actual repository registry (not a fixture).

## Target state
Bridge survives a crashed worker, a stuck task, a Supabase blip, and
concurrent workers without losing a task or double-executing one; can be
deliberately restarted via its own typed command; optionally starts with
the server; and Browser ChatGPT has a materially larger, still fully safe
set of real actions available (tests, integration tests, release gate,
visual regression, performance benchmark, CI/deployment status reads,
known-issue lookup, health status, routing recommendations) alongside the
original 10.

## Files / systems involved
- `scripts/collective-brain-remote-bridge.cjs` (hardened)
- `scripts/collective-brain-remote-bridge-watchdog.js` (new)
- `data/collective-brain/remote-task-commands.json` (9 new commands +
  `restart_known_worker` registered)
- `data/collective-brain/agent-capabilities.json` (costPenalty calibration
  + anythingllm)
- `server.js` (opt-in autostart hook)
- `package.json` (`perf:lighthouse` script)
- `test/collective-brain-remote-bridge.test.js` (new, 18 tests)
- Supabase migrations: `world_remote_task_bridge_v2_retry_dead_letter`,
  `world_remote_task_bridge_v3_expand_commands`

## Known risks
- `read_ci_status`/`read_deployment_status` depend on `gh` being
  authenticated on whatever host runs the bridge - a host without it simply
  reports `configured:false`, no silent failure.
- The watchdog's crash-loop breaker means a *persistently* broken worker
  will stop auto-restarting after 5 attempts/10min and needs a human/typed
  `restart_known_worker` after the underlying issue is fixed - this is
  intentional (a restart-loop hiding a real bug is worse than a loud stop).

## Golden systems that must be preserved
Untouched - no app/game code modified. Verified via
`node scripts/check-golden-standard.js` and the full `release:gate`.

## Errors that must not return
- A thrown Supabase error crashing the `--watch` loop instead of backing
  off (the bug found and fixed in section 2-3).
- `build_native` ever being silently pointed at
  `scripts/godot-runtime-smoke.js` (a smoke test, not a build) - the
  command's own description now warns against this explicitly.
- `git checkout master`-style stale-shared-branch-ref bugs (already
  registered from the prior PR) - not reintroduced here; this branch's own
  scripts never do that.

## Tests to run
- `node --test`: 162/162 PASS (145 pre-existing + 17 new in
  `collective-brain-remote-bridge.test.js`).
- `node scripts/check-golden-standard.js`: PASS.
- `node scripts/check-desktop-ai-protocol.js`: PASS.
- `node scripts/collective-brain-check.js`: PASS.
- `node scripts/project-quality-reviewer.js`: blockers=0.
- Full `npm run release:gate`: PASS, exit 0.
- Live E2E round-trip against real Supabase (both before changes, to audit
  master, and after, to prove the new `retry_count`/`max_retries` columns
  and a new command work against the live schema): PASS both times, fully
  cleaned up.
- Manual live verification (not automated, see section 9): autostart
  spawning a real worker via `server.js`, and `restart_known_worker`
  spawning a real worker via a typed `executeTask()` call - both confirmed
  via real PID files, then stopped and cleaned up.

## Deployment / PR plan
`ai/desktop/remote-bridge-hardening` -> `master`. Merge once this PR's own
checks are green (the `check` Playwright suite's pre-existing red on
master, unrelated to this branch, is acceptable per PR #16/#17/#18/#21
precedent - to be reconfirmed against master's HEAD at PR time, not
assumed).

## Current progress
All of the above implemented, tested, and verified. Not yet committed/
pushed/PR'd at the time this entry was written.

## Next action
Commit, push, open PR, wait for CI, confirm own-relevant checks green and
any remaining red is pre-existing/unrelated (reconfirm against master's
current HEAD), merge. Then produce the final BEFORE/AFTER report and the
short GitHub-UI instruction + automatic post-grant verification, per the
user's explicit closing request.

## Completion criteria
PR merged; final report delivered with capability coverage %, what's now
possible, what remains inaccessible and why; a precise short GitHub UI
instruction for adding repository access plus an automatic check to run
immediately after.

## Final evidence
See "Tests to run" above - all real, all passing, evidence captured in this
session's actual tool output (Supabase query results, gate log, live
process PIDs), not asserted.
