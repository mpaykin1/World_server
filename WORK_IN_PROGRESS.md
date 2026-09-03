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
`node --test` (full suite, incl. `test/collective-brain.test.js`),
`node scripts/check-golden-standard.js`,
`node scripts/project-quality-reviewer.js`,
`node scripts/check-desktop-ai-protocol.js`, full `npm run release:gate`
(now including `collective-brain:check`/`security`/`cycle`). None of these
have been run yet on this branch - required before push.

## Deployment / PR plan
`ai/desktop/remote-task-bridge` -> `master`. Merge only after this branch's
own relevant checks are green (pre-existing unrelated red on master is
acceptable, matching PR #16/#17 precedent, but must be reconfirmed for this
diff, not assumed carried over).

## Current progress
Cherry-pick conflict resolution: 4 of 5 files resolved
(`.gitignore`, `package.json`, `DESKTOP_AI_INSTALL_AND_VERIFY.md`,
this file). `data/error-prevention-registry.json` remaining. Cherry-pick not
yet committed. No local verification run yet on this branch.

## Next action
Resolve the `data/error-prevention-registry.json` conflict, finish the
cherry-pick commit, then run local verification (unit tests, golden
standard, quality reviewer, desktop-ai protocol, full `release:gate`) before
committing the new remote-bridge files and pushing.

## Completion criteria
PR merged to master with: full `release:gate` PASS locally before push;
this PR's own CI checks green; a genuine E2E proof of the remote-task-bridge
loop (a real row enqueued in `world_remote_tasks`, `runOnce()` executed
locally, result correctly written back and visible in
`state/ai-agent-reports.jsonl`); GitHub-403 root cause diagnosed and either
fixed or handed to the user as one concrete manual action, with a regression
test and an error-prevention-registry entry.

## Final evidence
Not completed - cherry-pick still in progress, no push/PR yet.
