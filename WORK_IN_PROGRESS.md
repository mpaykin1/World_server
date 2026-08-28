# WORK IN PROGRESS — SESSION RECOVERY + CI STABILIZATION (2026-08-28)

## Task
Recover World_server after a local environment crash/reinstall on branch
`ai/opencode/multi-ai-peer-improvement`: rescue substantial uncommitted
local work, get CI green again, and fix the automation that caused the
crash's aftermath to actively fight the recovery.

## Why
The previous session left ~250 files of a large "integration/control-plane"
system on disk (scripts, data policies, tests, an AI Supervisor Control
Plane Supabase migration) that were never committed, plus an in-progress
`api/` -> `lib/api-handlers/` consolidation whose CI-breaking follow-ups
were sitting uncommitted. Per AGENTS.md rule 17 (COMMIT DISCIPLINE, added
this session): work that only exists on local disk does not survive a
reinstall and must be checkpointed into Git immediately.

## Current state
- Checkpoint commit `a33114e` (and follow-ups through `a6c5bea`) landed all
  recoverable local work on `ai/opencode/multi-ai-peer-improvement` and
  pushed to `origin`.
- Fixed and pushed, in order: (1) finished the `api/` -> `lib/api-handlers/`
  consolidation follow-ups (test import path, server.js, vercel.json);
  (2) wired the `ai_supervisor_control_plane` and `orchestrator_leader_lease`
  migrations from `supabase/migrations_backup_20260824/` into the live
  `supabase/migrations/` dir and bumped `scripts/check-supabase-migrations.js`
  to 110/new digest; (3) found and fixed the root cause of two migrations
  getting silently deleted and force-pushed away mid-session: a stale
  `%TEMP%\opencode\quality_autoloop.ps1` (outside git, from a previous
  session, wired into the `WorldServer-BlockerRepair` scheduled task) that
  hardcoded the old 108-file/old-digest baseline and auto-restored +
  auto-committed + auto-pushed on any mismatch. Replaced with
  `scripts/quality-autoloop-tick.ps1` (versioned, reads the guard script as
  single source of truth, only logs on mismatch instead of auto-reverting);
  (4) reverted `services/ai3d-worker/ai3d/plugins/mesh_quality_optimizer.py`
  to its last working version (the uncommitted rewrite imported a
  `services/ai3d-worker/ai3d/mesh_optimizer.py` module that was never
  created, breaking the AI3D E2E smoke test); (5) fixed 4 more scripts
  (`check-ai3d-delivery-policy.js`, `check-ai3d-v4-combined.js`,
  `world-quality-analyzer.js`, `world-runtime-quality-profiler.js`) that
  still read from the pre-consolidation `api/ai3d.js` /
  `api/ai3d-voxel-generate.js` paths.
- CI progression on this branch: `check` job now passes `npm run check`
  (142/142), AI3D discovery/E2E smoke, AI3D evidence gate, AI3D final
  delivery policy, and AI3D V4 combined integration. Currently blocked on
  `npm run release:gate` -> `desktop-ai:check`, which is this very file
  being stale (fixed by this update).

## Target state
- `npm run release:gate` passes in CI on this branch (or fails only on
  gates that are legitimately incomplete work, never on stale-path bugs).
- The two new Supabase migrations exist as reviewed, guard-passing SQL
  files ready to apply; actual application to the live production
  Supabase project is a separate, deliberate step (see Known risks).
- No automation on this machine can silently revert or force-push over
  committed work again.

## Files / systems involved
- `lib/api-handlers/*`, `server.js`, `vercel.json`, `test/ai3d-voxel-serverless.test.js`
- `supabase/migrations/`, `supabase/migrations_backup_20260824/`, `scripts/check-supabase-migrations.js`
- `scripts/quality-autoloop-tick.ps1`, `state/blocker-repair/unified-tick.ps1`, `%TEMP%\opencode\quality_autoloop.ps1`
- `services/ai3d-worker/ai3d/plugins/mesh_quality_optimizer.py`
- `scripts/check-ai3d-delivery-policy.js`, `scripts/check-ai3d-v4-combined.js`, `scripts/world-quality-analyzer.js`, `scripts/world-runtime-quality-profiler.js`
- `AGENTS.md` (new rule 17: COMMIT DISCIPLINE)
- The large uncommitted `integration/control-plane` framework under `scripts/`, `data/*-policy.json`, `policy/`, `config/`, `test/*.test.js`

## Known risks
- `services/ai3d-worker/ai3d/mesh_optimizer.py` (the "V10 canonical
  quality-gated mesh pipeline") was referenced by an uncommitted rewrite
  but never implemented anywhere in the repo. The plugin was reverted to
  the working Blender-Decimate version instead of inventing that module
  blind. A future session with the original design intent should either
  implement it properly or drop the delegation comment.
- The two new Supabase migrations are NOT yet applied to any live Supabase
  project. `list_projects` via the connected Supabase MCP only shows
  `Improve` (empty) and `world-server-preview` (unrelated 11-migration
  history) — neither matches the 110-migration history tracked here, so
  the actual production project for this repo is not reachable from this
  session's Supabase MCP connection. Do not apply blind to either listed
  project.
- Two other AI worktrees are active in sibling directories
  (`World_server_claude` on `ai/claude/safe-parallel-20260826`,
  `World_server_quality_autopilot_v7_test` on
  `opencode/quality-autopilot-v7-test`) — not touched this session.
- Stray nested copies of those same worktree names exist *inside* this
  main tree with another AI's `.env.local` secrets in them; excluded via
  `.gitignore`, left untouched, not investigated further.
- `system-control-plane.cjs --verify` currently reports 67-70/75 gates
  passing; the remaining gates (`honest-100-functions`,
  `monotonic-100-guard`, `orchestrator-continuity`, `release-promotion`,
  `readiness`) are honestly-tracked incomplete work (physical device /
  native evidence gaps), not faked.

## Golden systems that must be preserved
- Desktop/mobile controls, collisions, grounding, step-up (untouched this session).
- AI3D front-reference fidelity and Final Delivery gate (untouched; policy checkers fixed, not weakened).
- Deny-by-default release policy (`data/app-release-registry.json`).

## Errors that must not return
- CI must not fail due to stale `api/*.js` path references after any future consolidation of `api/` — grep for `api/<name>.js` string literals across `scripts/` whenever files move out of `api/`.
- No script/scheduled task may auto-commit and auto-push without a human/AI review step in the loop (see AGENTS.md rule 17).
- `supabase/migrations/` file count and digest must only change together with `scripts/check-supabase-migrations.js` in the same commit.

## Exact patch / change plan
1. Update this file (done) so `desktop-ai:check` stops blocking `release:gate`.
2. Re-run `npm run release:gate` in CI; triage any further legitimate failures one at a time, smallest safe fix first, commit+push after each (rule 17).
3. Leave genuinely incomplete gates (honest-100, monotonic-100, readiness, release-promotion) as known-incomplete rather than forcing a fake pass.

## Tests to run
- `npm run check` (142/142 expected)
- `node scripts/check-supabase-migrations.js` (PASS 110 expected)
- `node scripts/check-ai3d-delivery-policy.js`, `node scripts/check-ai3d-v4-combined.js`
- `npm run release:gate` (in progress, iterating in CI)

## Deployment / PR plan
1. Keep pushing verified fixes to `ai/opencode/multi-ai-peer-improvement` (never `master`).
2. Once `release:gate` is green (or only blocked on documented incomplete work), open/refresh a PR to `master` via `gh pr create`.
3. Do not merge without human review; do not auto-merge.

## Current progress
- Recovery + 6 fix commits pushed (`a33114e` .. `a6c5bea`). CI check job now clears `npm run check`, AI3D smoke/evidence/delivery/V4 gates. `release:gate` blocked on `desktop-ai:check` until this file was updated (this commit).

## Next action
Push this WORK_IN_PROGRESS.md update, re-run CI, and continue triaging whatever `release:gate` step fails next (expected candidates: `golden:check`, `quality:check`, `tech:audit`, `integration:verify` — the same class of stale-path or genuinely-incomplete-gate issues seen so far).

## Completion criteria
- `npm run release:gate` passes in CI, or every remaining failure is a documented, honestly-incomplete gate (not a bug this session introduced or could trivially fix).
- All recovered work committed and pushed; nothing valuable left only on local disk.

## Final evidence
- `npm run check`: 142/142 PASS (local and CI).
- `node scripts/check-supabase-migrations.js`: PASS 110 migrations.
- `node scripts/system-integration-gate.cjs`: 127/127 PASS.
- `node scripts/policy-engine.cjs`: PASS.
- CI run history on `ai/opencode/multi-ai-peer-improvement`: progressed from failing at `npm run check` (import error) through AI3D E2E/evidence/delivery/V4 gates all green, currently at `release:gate` / `desktop-ai:check`.
