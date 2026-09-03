# WORK IN PROGRESS — Safe remote-task bridge for Browser ChatGPT (Collective Brain V2.1 port)

## Task
Give a remote client (Browser ChatGPT, using its own existing Supabase access)
a SAFE way to trigger real local work in World_server, without ever exposing
a shell, a tunnel, or production secrets to the browser session. Concretely:
(1) port the existing Collective Brain V2.1 coordination substrate
(`lib/collective-brain/*`, `scripts/collective-brain-*.js`,
`data/collective-brain/*`, `policy/collective-brain.rego`,
`test/collective-brain.test.js`) from branch
`ai/opencode/multi-ai-peer-improvement` (where it already exists, merged
there as PR #13, commit `70fef1e3`) onto real `master`, since it is not an
ancestor of `origin/master` and the new bridge must reuse it rather than
duplicate it; (2) add a typed, allowlisted remote-task queue
(`data/collective-brain/remote-task-commands.json` +
`scripts/collective-brain-remote-bridge.cjs`) backed by a new Supabase table
`public.world_remote_tasks`, where every `command` maps to exactly one
pre-approved local script/action - never an arbitrary shell string.

## Why
User explicitly declined a raw-shell/tunnel/`local.exec` bridge with
unrestricted secrets (GitHub App private key, Supabase service-role key,
Vercel production tokens) for a browser AI session, and instead requested
this safe design: official-connector + PR-based flow for anything reaching
master, plus a typed/allowlisted, outbound-only polling worker for local
execution. User's explicit instruction: "Не создавай дубликат существующего
coordinator/control-plane. Сначала найди существующие World_server systems и
усиливай их" (don't duplicate the existing coordinator - find and strengthen
it), hence porting `lib/collective-brain` rather than building a second,
parallel policy/audit system from scratch.

## Current state
- Worktree `World_server_remote_bridge`, branch `ai/desktop/remote-task-bridge`,
  based on `origin/master` (real master, at `4ee41f13` - the
  `WORLD_ENTRYPOINT` follow-up merge, not the divergent
  `ai/opencode/multi-ai-peer-improvement` branch).
- New Supabase table `public.world_remote_tasks` created (id, command
  CHECK-constrained to the 10 allowlisted commands, args jsonb,
  requested_by, status CHECK-constrained to
  queued/claimed/running/done/failed/rejected, claimed_by/claimed_at,
  started_at/finished_at, result jsonb, error, created_at, updated_at);
  RLS enabled; `authenticated` granted INSERT+SELECT only (via explicit
  `CREATE POLICY`, not just a table GRANT - RLS defaults to deny-all
  with a grant but no policy, caught by `get_advisors`'s
  `rls_enabled_no_policy` lint and fixed with a follow-up migration);
  no UPDATE/DELETE policy for `authenticated` - only the local worker's
  service-role key (never exposed to the browser) may transition task
  status/write results. Re-verified clean via `get_advisors`.
- `data/collective-brain/remote-task-commands.json` (new): the command
  allowlist - `run_tests`, `run_linter`, `run_benchmark`, `build_web`,
  `build_native` (unavailable, reports status honestly), `inspect_logs`
  (reads one of 5 pre-approved report files), `run_existing_script` (runs
  one of 5 pre-approved scripts by scriptId, never a raw path),
  `apply_patch` (guarded: isolated worktree only, `git apply --check`
  first, forbidden path prefixes incl. `.env`/`data/collective-brain`/
  `.git/`/`node_modules/`, 64KB diff cap), `verify_patch`,
  `restart_known_worker` (empty allowlist by design - safe no-op until a
  worker is deliberately registered).
- `scripts/collective-brain-remote-bridge.cjs` (new): local, outbound-only
  polling worker. Never opens a port. `claimNextTask` does an atomic
  conditional UPDATE (`status=queued -> claimed`) against Supabase so
  concurrent workers don't double-claim. `executeTask` runs every command
  through the EXISTING `lib/collective-brain` `policyGate` first (hard-deny
  / approval-required), then dispatches by `def.kind`. Results are scanned
  with the existing `securityScanText` before being written back to
  Supabase, and mirrored into `state/ai-agent-reports.jsonl` (the existing
  shared multi-agent coordination log) and the collective-brain hash-chained
  audit event log - not a new competing reporting channel.
- Cherry-picked `70fef1e3` (Collective Brain V2.1) onto this branch via
  `git cherry-pick -x --no-commit`. 23 files added cleanly with no conflict.
  5 files conflicted; all 5 now resolved:
  - `.gitignore`: purely additive (HEAD side of the hunk was empty) - took
    the incoming block (secrets index, local toolchain cache, generated
    `COLLECTIVE_BRAIN_*.json` report entries, `.patch-backups/`, etc).
  - `package.json`: NOT purely additive - naive "take incoming" would have
    silently pulled in ~207 references to nonexistent scripts belonging to
    unrelated systems from the divergent branch (`procedural:*`,
    `gs360:*`, `panorama360:*`, `ink-glyph:*`, `pwa:*`,
    `integration:*`, `animation:gate`, etc - none of which exist on
    master). Root cause: `git show --stat <commit>` only reflects a
    commit's diff against its OWN parent, not against the actual
    cherry-pick target base, so an apparently small/clean commit can still
    apply large unrelated additive hunks onto a different base. Fixed by
    restoring master's exact clean `package.json`
    (`git show origin/master:package.json`) and manually re-applying only
    the two real, verified changes: 13 new `collective-brain:*` script
    entries, and extending `release:gate` with
    `&& npm run collective-brain:check && npm run collective-brain:security
    && npm run collective-brain:cycle` (explicitly excluding the incoming
    side's references to systems absent from master). Verified via a script
    that checks every `npm run` script's referenced file actually exists:
    207 missing -> 0 missing.
  - `DESKTOP_AI_INSTALL_AND_VERIFY.md`: purely additive (HEAD side empty) -
    took the incoming block (Cinematic Voxel Quality V3 gate, Reference
    Visual Gate, Voxel Game Baseline, Collective Brain V2.1 mandatory-loop
    section) unchanged.
  - `WORK_IN_PROGRESS.md`: this file - both sides were stale WIP entries for
    already-completed/already-merged prior tasks (HEAD: the
    `world-entrypoint-followup` task, merged as PR #17; incoming: the
    `openhuman-collective-brain-v2` task, merged separately as PR #13 on the
    other branch) - discarded both, replaced with this fresh entry for the
    actual current task, matching this session's established pattern.
  - `data/error-prevention-registry.json`: not yet inspected/resolved (next
    conflict to resolve).

## Target state
- `lib/collective-brain` present on `master` (via this PR), so the remote
  bridge's `require('../lib/collective-brain')` resolves to a real,
  already-audited module - not a stub, not a duplicate.
- Browser ChatGPT can enqueue a row into `world_remote_tasks` using its own
  Supabase access; the local worker (run manually or via `--watch`) picks it
  up, executes exactly one pre-approved action, and writes a security-scanned
  result back - with zero shell access and zero secret exposure to the
  browser session.
- Full `npm run release:gate` (including the 3 newly-appended
  `collective-brain:*` steps) passes on this branch before it is proposed for
  merge.

## Files / systems involved
- Ported: `lib/collective-brain/index.js`, 11 `scripts/collective-brain-*.js`
  files, `policy/collective-brain.rego`, `test/collective-brain.test.js`,
  `data/collective-brain/agent-capabilities.json`,
  `data/collective-brain/collective-brain-policy.json`,
  `data/collective-brain/knowledge-ledger.json`,
  `data/collective-brain/technology-plan.json`,
  `.collective-brain-install.json`, `COLLECTIVE_BRAIN_RUNTIME_EVIDENCE.json`,
  `COLLECTIVE_BRAIN_RUNTIME_REPORT.md`,
  `COLLECTIVE_BRAIN_V2_1_RUNTIME_EVIDENCE.json`.
- New this task: `data/collective-brain/remote-task-commands.json`,
  `scripts/collective-brain-remote-bridge.cjs`, Supabase migrations
  `world_remote_task_bridge_v1` + `world_remote_task_bridge_v1_rls_policies`.
- Modified: `.gitignore`, `package.json`, `DESKTOP_AI_INSTALL_AND_VERIFY.md`.

## Known risks
- `apply_patch` is the highest-risk command in the allowlist even though it
  is guarded (isolated-worktree-only, `git apply --check` first, forbidden
  path prefixes, size cap) - it is intentionally the one most worth extra
  scrutiny in review.
- `restart_known_worker`'s allowlist is intentionally empty - no live
  process can be restarted via this bridge yet, by design, until one is
  deliberately registered.
- This PR does not by itself close the GitHub Connector 403 gap - that still
  requires separate root-cause diagnosis + a user action in GitHub's App
  installation settings (tracked separately, not part of this PR's scope).

## Golden systems that must be preserved
`app-release-registry.json` deny-by-default gate and Golden voxel-collision
UI/physics contract (from PR #16) - untouched by this branch; will be
reverified via `node scripts/check-golden-standard.js` before push.

## Errors that must not return
- `lib/collective-brain` silently absent from `master` while other code
  depends on it (this port's entire purpose).
- RLS enabled with a GRANT but no explicit POLICY, making the grant silently
  inert (`rls_enabled_no_policy`) - already fixed and re-verified for
  `world_remote_tasks`; worth registering as a general error-prevention entry
  once `data/error-prevention-registry.json`'s conflict is resolved.
- A cherry-pick's `git show --stat` diff being read as "this is the full,
  isolated scope of what will be added" - it is only the diff against the
  commit's own original parent, not against the real target base.

## Exact patch / change plan
See "Current state" above for the precise per-file resolution already
applied. Remaining: resolve `data/error-prevention-registry.json`, finish the
cherry-pick with a real commit, run full local verification, write final
evidence into this file, commit, push, open a PR
(`ai/desktop/remote-task-bridge` -> `master`), matching the exact proven
PR #16/#17 pattern (verify own-relevant CI green, confirm any remaining red
is pre-existing/unrelated via `gh run list --branch master`, ask before
merging with any red).

## Tests to run
- `node --test test/collective-brain.test.js`: 18/18 PASS.
- `node --test` (full suite): 145/145 PASS.
- `node scripts/check-golden-standard.js`: PASS.
- `node scripts/check-desktop-ai-protocol.js`: PASS.
- `node scripts/collective-brain-check.js` / `-security-scan.js` /
  `-cycle.js`: all PASS (cycle DEGRADED/sync=queued when no local
  agentmemory is running, PASS/sync=synced when it is - both exit 0 by
  design, agentmemory absence must never break the game/gate path).
- `node scripts/project-quality-reviewer.js`: `blockers=0` (same
  pre-existing unrelated `ai3d-voxel-city` major finding as PR #16/#17).
- Full `npm run release:gate` (all ~21 chained gates, now including
  `collective-brain:check`/`security`/`cycle`): **PASS, exit 0.**
  `quality:check` reports `overall=98% blockers=15 releaseEligible=false`
  but still exits `[QUALITY_CHECK] PASS` - pre-existing tracked blockers,
  not introduced by this branch, same semantics as PR #16/#17's pre-existing
  unrelated CI red.

## Deployment / PR plan
`ai/desktop/remote-task-bridge` -> `master`. Merge only after this branch's
own relevant checks are green (pre-existing unrelated red on master is
acceptable, matching PR #16/#17 precedent, but must be reconfirmed for this
diff, not assumed carried over).

## Current progress
- Cherry-pick fully resolved and committed (all 5 conflicts, see "Current
  state" above) - `lib/collective-brain` now present on this branch.
- Closed a real gate gap found during review: `apply_patch` (the highest-risk
  remote command) was NOT in `collective-brain-policy.json`'s
  `approvalRequiredOperations`, so it would have auto-executed despite the
  command's own description claiming it is "subject to policyGate" - added
  `"remote-task:apply_patch"` to `approvalRequiredOperations`, so it now
  requires `COLLECTIVE_BRAIN_HUMAN_APPROVED=1` before it can run at all.
- Full local verification PASS (see "Tests to run").
- **Real E2E proof of the remote-task-bridge loop**, run against the actual
  Supabase project `xlcdnlsyvxqtopmkweiy` ("world-server-preview"):
  1. Inserted a task row into `public.world_remote_tasks`
     (`command='run_existing_script'`, `args={"scriptId":"collective-brain-check"}`,
     `requested_by='browser-chatgpt-e2e-test'`) via the Supabase MCP,
     simulating what Browser ChatGPT would do with its own `authenticated`
     Supabase access - confirmed row created with `status='queued'`.
  2. Performed the worker's atomic claim (`status: queued -> claimed`,
     conditional on `status='queued'`) - succeeded, matching
     `claimNextTask()`'s logic.
  3. Ran the actual allowlisted local action for real:
     `node scripts/collective-brain-check.js` -> `[COLLECTIVE_BRAIN_CHECK]
     PASS`, exit 0 - the exact command `run_existing_script` with
     `scriptId=collective-brain-check` maps to.
  4. Wrote the real result back (`status='running'` -> `status='done'`,
     `result={ok:true, exitCode:0, scriptId, stdout, stderr}`) - matching
     `runOnce()`'s finishing update.
  5. Appended and verified a matching entry in
     `state/ai-agent-reports.jsonl` (`agent:
     'collective-brain-remote-bridge'`, `status:'done'`, `progress:100`),
     then removed the synthetic test artifact (both the DB row and the local
     report-log entry) since it was a simulation, not genuine agent
     activity, and should not be mistaken for one.
  6. Re-ran `get_advisors(type:'security')`: `world_remote_tasks` does not
     appear in the `rls_enabled_no_policy` list - the RLS/policy fix holds.
  - **Caveat, honestly noted**: steps 2-4's Supabase read/write calls were
    made directly via the Supabase MCP (which has project-level access),
    not by literally invoking `scripts/collective-brain-remote-bridge.cjs`
    end-to-end - this machine has no local `.env` with
    `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` configured (checked; none
    exists anywhere on this machine for World_server), and there is no tool
    available to this session that can read a Supabase project's secret
    key (by design - `get_publishable_keys` only returns the public
    key). The script's own logic (`claimNextTask`'s exact atomic-UPDATE
    query, `executeTask`'s dispatch, `securityScanText` before write-back)
    was verified by direct code review against this same real schema, and
    every command kind it dispatches to was independently exercised
    (`collective-brain-check.js` run for real above; `npm run check`/
    `collective-brain:*` all run for real during `release:gate`). Running
    the literal `.cjs` file end-to-end needs exactly one user action: copy
    `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (or
    `SUPABASE_SECRET_KEY`) into a local `.env` in whichever checkout runs
    the worker, per `.env.example` - never pasted into chat.

## Next action
Commit the new remote-bridge files
(`data/collective-brain/remote-task-commands.json`,
`scripts/collective-brain-remote-bridge.cjs`) plus this WIP update, push
`ai/desktop/remote-task-bridge`, open the PR against `master`, wait for CI,
confirm this PR's own checks are green (pre-existing unrelated red is
acceptable per PR #16/#17 precedent, but must be reconfirmed for this diff),
then merge.

## Completion criteria
PR merged to master with: full `release:gate` PASS locally before push
(done); this PR's own CI checks green; a genuine E2E proof of the
remote-task-bridge loop (done, see above, with an honestly-noted caveat on
which layer was exercised directly vs. via code review); GitHub-403 root
cause diagnosed and either fixed or handed to the user as one concrete
manual action, with a regression test and an error-prevention-registry
entry (separate, not yet started).

## Final evidence
- `node --test test/collective-brain.test.js`: 18/18 PASS.
- `node --test` (full suite): 145/145 PASS.
- `node scripts/check-golden-standard.js`: PASS.
- `node scripts/check-desktop-ai-protocol.js`: PASS.
- `node scripts/project-quality-reviewer.js`: blockers=0.
- Full `npm run release:gate`: PASS, exit 0 (log captured this session).
- E2E remote-task-bridge proof: real Supabase row
  queued -> claimed -> running -> done, real local script executed and its
  real result written back, verified via `get_advisors` that RLS/policy
  remains correctly configured. Details and caveat above.
- Not yet completed: PR not yet opened; GitHub-403 root cause not yet
  finalized.
