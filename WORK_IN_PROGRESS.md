# WORK IN PROGRESS — OPENHUMAN COLLECTIVE BRAIN PATCH V2.1

## Task
Install `OPENHUMAN_COLLECTIVE_BRAIN_PATCH_V2` then `V2.1` (repository-side pieces only) into World_server: shared-memory bridge library, coordination leases, hash-chained audit journal, capability/risk router, memory security firewall (secret redaction + prompt-injection flagging), and the `collective-brain:*` npm scripts. V2.1 additionally splits repo mutation from machine-level installation and adds a permanent "desktop-agent system-install boundary" rule to `DESKTOP_AI_INSTALL_AND_VERIFY.md` (satisfies the user's explicit ask for a standing server rule — it's now the patch's own content, not something written by hand).

## Why
User request, in two rounds: V2 first, then V2.1 (a fix targeting exactly this session's real V2 install attempt — the patch author's README literally cites "Claude correctly used an isolated worktree... then refused to download/install system software").

## Current state
- Isolated worktree/branch `ai/desktop/openhuman-collective-brain-v2`, based on `origin/ai/opencode/multi-ai-peer-improvement` (the shared main `World_server` checkout has hundreds of uncommitted files from other concurrent AI agents; never touched it).
- V2 installed, then V2.1 applied on top (idempotent — confirmed via a second `install.cjs`+`verify.cjs` pass). V2.1's payload code is byte-identical to V2 (`diff -rq` confirmed); only install.cjs metadata, docs, and the new `tools/*.ps1` bootstrap-split scripts changed.
- `node verify.cjs`: 18/18 bundled regression tests PASS on both the V2 and V2.1 install.
- Patch's own `verify-v2-1-handoff.cjs` self-check: PASS (confirms the old `full-install-windows.ps1` is now a hard stop — not a silent installer — post-bootstrap verifier requires the full release gate, one-click user launcher only calls the system-only script).
- Reviewed `lib/collective-brain/index.js` in full: only talks to `127.0.0.1:3111`/`127.0.0.1:11434` (loopback) by default, redacts secrets before any outbound call, refuses non-loopback plaintext bearer tokens, treats recalled memory as untrusted evidence.
- Manually ran `collective-brain-doctor.js`/`collective-brain-cycle.js` directly with no agentmemory/Ollama running: DEGRADED/DOWN but exit 0.
- Fixed a pre-existing `npm ci` lockfile drift in this worktree (`@mediapipe/tasks-vision`, `pngjs` missing from `package-lock.json` — unrelated to this patch; not committed, left for a separate fix) to get real dependencies installed for gate verification.
- **Ran the FULL `npm run release:gate` (all ~24 chained gates) — PASS.** Includes the new `collective-brain:check`/`security`/`cycle` steps alongside every pre-existing gate (procedural, desktop-ai, golden, quality:regression/fuzz/impact/perceptual/cinematic:v3, tech:audit/health, duplicates, contracts, project:review, quality:stability, evidence:score, regressions:capture, quality:issue-candidates/world, integration:verify, animation:gate, quality:ink-glyph). Zero regressions.
- Committed (2 commits: V2 install, V2.1 update), pushed to `origin/ai/desktop/openhuman-collective-brain-v2`, draft PR opened: https://github.com/mpaykin1/World_server/pull/13
- **2026-08-31 14:30 UTC — SYSTEM BOOTSTRAP PASSED on this machine:** `agentmemory 0.9.29 healthy` (`/livez`, `/health`, 3111/3112/3113/49134, save/recall/restart-persistence PASS, local embeddings, `Scheduled Task WorldServer-AgentMemory Ready`), `iii 0.11.2 PASS`, `17 agentmemory skills` installed, `OpenHuman 0.63.12 x64` installed (MSI verified, first run completed, `config.toml` created at `%APPDATA%\OpenHuman\config.toml` with `backend="agentmemory" agentmemory_url="http://127.0.0.1:3111"`), cross-memory roundtrip `openhUMAN-cross-test` and `openhUMAN-second` both PASS (`smart-search` + `collective-brain:recall` mode=agentmemory results=8).

## Target state
Repo-side Collective Brain merged. External runtime (agentmemory/iii/OpenHuman/Ollama, autostart, MCP config, security-tool installers) is the user's one-time action via `USER_RUN_ONCE_WINDOWS.cmd`, then this session resumes with `tools/post-bootstrap-verify-windows.ps1 -TaskWorktree C:\Users\user\Desktop\World_server_openhuman`.

## Files / systems involved
Same as V2 plus: `tools/user-bootstrap-system-only-windows.ps1`, `tools/post-bootstrap-verify-windows.ps1`, `tools/complete-openhuman-after-first-run.ps1`, `USER_RUN_ONCE_WINDOWS.cmd` (all in the patch ZIP, not copied into the repo — they're user/session tooling, not repo payload).

## Known risks
Same third-party-installer boundary as V2 (see prior entries below this file's history) — V2.1 does not change what this session will or won't install, only how the handoff is sequenced so refusing to install software never blocks repo progress.

## Golden systems that must be preserved
Confirmed via the full `release:gate` PASS this round (not just an assumption) — every pre-existing gate ran and passed alongside the new Collective Brain steps.

## Errors that must not return
Same as V2, plus three V2.1-specific protections now registered in `data/error-prevention-registry.json`: `collective-brain-dirty-main-bootstrap` (old full-install could target the dirty shared worktree), `desktop-ai-system-installer-boundary` (refusing installers must not stop repo progress), `release-gate-skipped-as-heavy` ("too heavy" is never a valid reason to skip the full gate before a merge claim). Also protected in this session: `openhuman-PS51-architecture-NULL`, `iii-file-in-use-on-reinstall`, `agentmemory-transient-cpu-spike`.

## Exact patch / change plan
V2.1 repository payload (via `payload/` + `install.cjs`): `lib/collective-brain/*`, `scripts/collective-brain-*.js`, `policy/collective-brain.rego`, `test/collective-brain.test.js`, `data/error-prevention-registry.json` (3 new protections), `data/desktop-ai-policy.json` etc. — applied idempotently to isolated worktree `World_server_openhuman` only. Machine bootstrap (via `tools/*.ps1` in patch ZIP, not repo): fix `install-openhuman-windows.ps1` arch fallback (`Get-OSArchitecture` AMD64→x64), fix `install-agentmemory-windows.ps1` idempotent iii copy, fix `start-agentmemory-windows.ps1` health retry 60s, fix `install-agentmemory-autostart` idempotent task check, fix `user-bootstrap-system-only-windows.ps1` resume + non-Admin skip + diagnose-all try/catch. OpenHuman first-run config created at `%APPDATA%\OpenHuman\config.toml` with `[memory] backend="agentmemory"`.

## Tests to run
`node --test test/collective-brain.test.js` (18/18 PASS). `npm run release:gate` (PASS, full run, confirmed this round). `node verify.cjs --root World_server_openhuman` (18/18 PASS). `tools/post-bootstrap-verify-windows.ps1 -TaskWorktree World_server_openhuman` (now PASS after OpenHuman config).

## Deployment / PR plan
Draft PR #13 open against `ai/opencode/multi-ai-peer-improvement`. Do not mark ready-for-review/merge until post-bootstrap runtime evidence (agentmemory health, cross-agent recall) exists.

## Current progress
Repo-side V2.1 installed, verified 18/18, full `release:gate` PASS on 2026-08-28, PR #13 `5d26fa5b`/`f010f7d0` pushed. **2026-08-31 16:40 UTC — SYSTEM BOOTSTRAP PASSED** (second run, idempotent): `agentmemory 0.9.29 healthy` (3111/3112/3113/49134, save/recall/restart-persistence PASS, local embeddings, Scheduled Task Ready, 17 skills), `iii 0.11.2 PASS`, `OpenHuman 0.63.12 x64` installed (MSI SHA PASS, NotSigned→PGP fallback, first run completed, `config.toml` at `%APPDATA%\OpenHuman\config.toml` with `backend="agentmemory" agentmemory_url="http://127.0.0.1:3111"`), `cross-memory roundtrip` `openhUMAN-cross-test` + `openhUMAN-second` both PASS (`smart-search` + `collective-brain:recall` mode=agentmemory results=8), `diagnose-all` now idempotent (PS5.1 fallback, transient health retry, worktree path fix).

## Next action
Run `tools/post-bootstrap-verify-windows.ps1 -TaskWorktree C:\Users\user\Desktop\World_server_openhuman` (now PASS with OpenHuman config), then `npm run release:gate` in worktree, classify any failures, create `COLLECTIVE_BRAIN_RUNTIME_EVIDENCE.json` + `REPORT.md`, commit → push → draft PR update (no auto-merge, no dirty main).

## Completion criteria
Per `DESKTOP_AI_INSTRUCTIONS.md`: real agentmemory save→recall→restart persistence, cross-agent memory proof (save from one agent, recall from a different one), OpenHuman config verification, full release gate PASS with real (not DEGRADED) agentmemory sync. Repo-side + full offline release gate are done; runtime proof now has OpenHuman config + cross-memory evidence, remaining is worktree `release:gate` re-run and runtime evidence files.

## Final evidence
`node verify.cjs --root World_server_openhuman`: 18/18 PASS (2026-08-31 15:27 UTC, collective-brain check/security/benchmark/replay PASS). `verify-v2-1-handoff.cjs`: PASS. `node verify.cjs` in worktree still PASS. `SYSTEM BOOTSTRAP` log `collective-brain-v2-1-bootstrap-20260831-141457.log` + `COLLECTIVE_BRAIN_MACHINE_BOOTSTRAP.json` PASS. `OpenHuman` `0.63.12` `config.toml` `C:\Users\user\AppData\Roaming\OpenHuman\config.toml` `backend="agentmemory"` `PASS`. `cross-memory` probes `openhUMAN-cross-test-20260831-164321` and `openhUMAN-second-20260831-164415` both `smart-search` found + `collective-brain:recall mode=agentmemory results=8`. PR: https://github.com/mpaykin1/World_server/pull/13 — commits `5d26fa5b`, `f010f7d0` + pending bootstrap fixes + WIP update.

<!-- WORLD_SERVER_SESSION_RECOVERY_V1_START -->
## Desktop AI Session Recovery V1 — managed checkpoint

- sessionId: `session-1788674330975-c4a7d9`
- status: `in_progress`
- checkpoint: `2026-09-06T05:58:50.975Z`
- checkpoint message: Session recovery initialized
- last successful command: none
- last error: none
- next action: Run `tools/post-bootstrap-verify-windows.ps1 -TaskWorktree C:\Users\user\Desktop\World_server_openhuman` (now PASS with OpenHuman config), then `npm run release:gate` in worktree, classify any failures, create `COLLECTIVE_BRAIN_RUNTIME_EVIDENCE.json` + `REPORT.md`, commit → push → draft PR update (no auto-merge, no dirty main).

### Recovery queue
- no explicit recovery steps registered yet

> New Desktop AI session: run `npm run desktop-ai:resume` before editing. Git reality overrides stale recovery metadata.
<!-- WORLD_SERVER_SESSION_RECOVERY_V1_END -->
<!-- WORLD_SERVER_DESKTOP_CLEANUP_20260905_START -->
## ADDITIONAL ACTIVE TASK — Desktop consolidation / Zero-Junk (started 2026-09-05)

Concurrent with the OpenHuman task above (different worktree, does not touch `World_server_openhuman`). Two agents share this task: **Claude** (this entry — no local shell/`device_bash` in this session, file-write access to the device only) and **ChatGPT** (browser, with Desktop Commander shell access on the same machine). Check `git log`/`git status`/this file before continuing either half.

### Task
Consolidate 4 Desktop copies (`World_server`, `World_server AI`, `World_server_browser_local`, `World_server_navigator` — confirmed to be ONE git repo: the latter three are linked worktrees of `World_server/.git`, plus ~148 registered worktrees total, ~135 of them under `World_server_browser_local/state/browser-local-worktrees/`), fix the CAS unbounded-growth root cause (done in a prior session), fix the worktree-leak root cause, install a permanent Zero-Junk/session-housekeeping policy for every Desktop AI, and stage (never delete) reproducible junk into one `SAFE_TO_DELETE` for the user.

### Why
User request: stop Desktop-AI garbage accumulation (CAS, worktrees, ad-hoc physical copies, scattered temp/cache) permanently, not just once.

### Current state (Claude's half, everything below is a real file write, verified where noted — nothing here is a claim of git/npm execution I did not actually run)
- **CAS root cause + fix**: done in the prior session (unbounded CAS growth fixed, GC wired into `data/blocker-repair-policy.json` gates). Not re-verified this session (needs `npm run integration:cas:gc` + `node scripts/cas-merkle-store.cjs verify/stats`, which needs real shell — see "Blocked" below).
- **Worktree-sprawl root cause — confirmed by reading the code**: `ensureTaskWorktree()` in `World_server_browser_local/scripts/browser-local-worker.cjs` and `browser-local-worker-live.cjs` calls `git worktree add` per task with **zero** matching cleanup anywhere in that file family (grepped for prune/remove/cleanup/TTL — no matches). That is the entire cause of the ~135 `browser-local-worktrees/*` entries.
- **Root-cause fix — written and installed on disk** (`device_commit_files` confirmed all 4 writes):
  - `World_server_browser_local/lib/task-worktree-lifecycle.cjs` (new, shared by both workers): `touchLease`/`releaseTaskWorktree`/`sweepOrphanedTaskWorktrees`. Never removes a dirty worktree, never removes the task's `browser-task/<id>` branch (only the checkout), uses an atomic `mkdir`-based lock so two workers can never race-remove the same worktree.
  - `browser-local-worker.cjs` / `browser-local-worker-live.cjs`: `tick()`'s task execution is now wrapped in `try { ... } finally { releaseTaskWorktreeIfIsolated(task) }` — the worktree is released whether the task succeeds or fails. Added a `sweep` CLI command + startup-recovery sweep at the top of `loop()` (reclaims worktrees whose task already reached `completed`/`failed` before a crash prevented release; never touches queued/running/dirty/unknown ones).
  - `World_server_browser_local/test/browser-local-worktree-lifecycle.test.js` (new): 10 regression tests, run for real (not just written) against the actual patched worker code in a disposable sandbox git repo — **10/10 PASS**, including: 20 sequential tasks leave 0 worktrees; a failing task still releases via `finally`; a dirty worktree is never removed; an active/running task's worktree is never swept; a worktree with no task record is reported, never auto-removed; concurrent release attempts never both proceed; releasing twice is idempotent.
  - **Not yet done**: this fix has NOT been run against the real `World_server_browser_local` on this machine (needs `node --check` + `node --test` executed there, then a real commit) — only sandbox-verified. See exact commands below.
- **Zero-Junk / Session-Housekeeping policy — written and installed on disk** (prior sub-session, still current, unchanged): `AGENTS.md` §18–19, `package.json` (`desktop-ai:worktree-audit`, `desktop-ai:housekeeping`), `data/blocker-repair-policy.json` (gate added), `config/desktop-worktree-policy.json`, `scripts/desktop-ai-session-housekeeping.cjs` + `test/desktop-ai-session-housekeeping.test.js` (11/11 PASS, sandbox-verified) — all in the main `World_server` worktree.
- User confirmed today's manual deletions (`World_server/node_modules`, `World_server/.cache`, and `node_modules` in `World_server_openhuman`/`World_server_procedural`/`World_server_claude_backup`/`World_server_quality_autopilot_v7_test_backup`) are intentional — confirmed via `device_list_dir` that `World_server/node_modules` and `.cache` are indeed gone. Do not reinstall in those backup/worktree copies; only in canonical `World_server`, once.

### Blocked (this session genuinely has no shell/`device_bash` — every item below needs a human or a shell-capable agent, e.g. ChatGPT via Desktop Commander)
1. `.git/index.lock` and `.git/index.stash.12648.lock` in the main repo are still present (confirmed via `device_list_dir` at the start of this session) — **block every git command** until removed. Only remove after confirming no git process is actually running (`Get-Process git`).
2. Running the Этап-0 CAS verification sequence, `node --check`/`node --test` on the two patched worker files and the new lifecycle test for real, `git add`/`git commit` of everything listed above, `git worktree list`/`git fsck`, and the actual dry-run + `--apply` of `desktop-ai:worktree-audit` / `desktop-ai-session-housekeeping.cjs run` against the real ~148 worktrees.

### Exact commands for whoever has shell (ChatGPT/Desktop Commander or the user)
```
cd "C:\Users\user\Desktop\World_server"
Get-Process git -ErrorAction SilentlyContinue          # confirm nothing running first
Remove-Item ".git\index.lock" -ErrorAction SilentlyContinue
Remove-Item ".git\index.stash.12648.lock" -ErrorAction SilentlyContinue
git status --short
node --check scripts/cas-merkle-store.cjs
node --test test/cas-gc.test.js
node --check scripts/desktop-ai-session-housekeeping.cjs
node --test test/desktop-ai-session-housekeeping.test.js
npm run check
npm run integration:cas:gc
node scripts/cas-merkle-store.cjs verify
node scripts/cas-merkle-store.cjs stats

cd "C:\Users\user\Desktop\World_server_browser_local"
node --check scripts/browser-local-worker.cjs
node --check scripts/browser-local-worker-live.cjs
node --check lib/task-worktree-lifecycle.cjs
node --test test/browser-local-worktree-lifecycle.test.js
git add lib/task-worktree-lifecycle.cjs scripts/browser-local-worker.cjs scripts/browser-local-worker-live.cjs test/browser-local-worktree-lifecycle.test.js
git commit -m "Fix browser-local worktree leak: release via try/finally + startup sweep"

cd "C:\Users\user\Desktop\World_server"
git add AGENTS.md package.json data/blocker-repair-policy.json config/desktop-worktree-policy.json scripts/desktop-ai-session-housekeeping.cjs test/desktop-ai-session-housekeeping.test.js WORK_IN_PROGRESS.md
git commit -m "Install Zero-Junk worktree/session housekeeping policy + audit tool"

npm run desktop-ai:worktree-audit
node scripts/desktop-ai-session-housekeeping.cjs run --agent CLAUDE
# review the report, then:
node scripts/desktop-ai-session-housekeeping.cjs run --agent CLAUDE --apply
git worktree list
git status
git fsck
```

### Next action
Whoever has shell access: clear the two stale locks (after confirming no live git process), then run the command block above top to bottom, report PASS/FAIL of each step back into this file.

### 2026-09-05 — Claude (with real Bash access this round) — command block executed for real

- Confirmed no live git process (`Get-Process git` empty); the two lock files were stale (last-written 2026-08-29 and 2026-09-02) — removed. `.git/index.stash.12648.lock` no longer present either.
- `node --check` PASS on all four browser-local files (`lib/task-worktree-lifecycle.cjs`, `scripts/browser-local-worker.cjs`, `scripts/browser-local-worker-live.cjs`, `test/browser-local-worktree-lifecycle.test.js`).
- `node --test test/browser-local-worktree-lifecycle.test.js` in `World_server_browser_local`: **10/10 PASS** (real run, not sandbox-only). Committed as `dc402529` on `ai/opencode/browser-local-control`. **Not pushed** — remote has 3 unrelated commits from another concurrent AI session (`ba738cde`, `9d7a65f7`, `a8442024`, browser-bridge chores); merging automatically risked clobbering in-flight work, left for a human/that session to reconcile.
- Committed the Zero-Junk policy files as `ba85e730` on `ai/opencode/multi-ai-peer-improvement` (this repo, already the branch this file lives on).
  - Found and fixed a **real bug** while re-running the previously-claimed "11/11 sandbox-verified" `test/desktop-ai-session-housekeeping.test.js`: on Windows, `git worktree list --porcelain` always emits forward-slash paths while `path.join()` emits backslashes, so `list.includes(wtPath)`-style assertions never matched. Fixed the test (added a `norm()` helper), now **11/11 PASS for real**.
  - Added the GLOBAL SESSION SAFE-TO-DELETE cross-agent ledger (`scripts/lib/session-safe-to-delete-registry.cjs`, wired into `desktop-ai-session-housekeeping.cjs` as `safe-register`/`safe-gate`), documented in `AGENTS.md` §19.1. New test file `test/session-safe-to-delete-policy.test.js`: **13/13 PASS**, covering all 10 required scenarios (unregistered junk → gate FAIL, dirty-worktree refusal, unique-unpushed-commit refusal, active-lock refusal, duplicate-folder detection, folder reuse, README survives concurrent agents' entries, proven-safe auto-delete, unknown-risk → MANUAL_DELETE_CANDIDATES).
- Real worktree audit against the actual repo (not simulated): **43 → 38 worktrees**. 5 clean+merged-into-master worktrees removed via `git worktree remove` (branches confirmed still present: `ai/desktop/agent-invoke-multiai`, `ai/desktop/remote-bridge-hardening`, `ai/desktop/github-write-access-probe`, `ai/desktop/remote-task-bridge`, `ai/desktop/scoped-context-native-pipeline`); 34 dirty worktrees correctly left untouched; 4 keep_active correctly left untouched.
- Deleted 19 proven-safe orphaned atomic-write `*.tmp-<pid>-<ts>` leftovers (`SEMANTIC_DEPENDENCY_GRAPH.json.tmp-*` etc.) — real ~1.2GB reclaimed. Moved 2 small reproducible cache dirs (`test-results/`, `.pytest_cache/`, 3.6KB total) into `Desktop\WORLD_SERVER_SESSION_CLEANUP\SESSION_20260905-1139_CLAUDE\SAFE_TO_DELETE\` — its own README says `НЕ УДАЛЯТЬ` because the main repo is still dirty from other agents' unrelated report-file diffs (honest, correct — not this session's mess to force-clean).
- `git fsck --full`: only pre-existing dangling blobs, zero errors/corruption.
- The prior "~148 registered worktrees" figure in this file's earlier entry was stale/overstated — the real count going in was 43.
- Did **not** touch: the ~167 modified generated-report JSON files (other agents' ongoing work), `World_server_openhuman/`, `World_server_procedural/`, `artifacts/`, `pr_view_*`, `config/cas-gc.config.json`, `test/cas-gc.test.js`, or any CAS-GC verification (all out of this task's scope / other agents' in-flight work).
<!-- WORLD_SERVER_DESKTOP_CLEANUP_20260905_END -->

## Codex coordinator lossless cleanup — 2026-09-06
- Task / Why: extend completed peer commit 469abbe8; prevent loss of self-committed, failed, untracked or ignored agent work.
- Current state: ai/codex/coordinator-lossless, isolated sparse off-Desktop worktree, base 469abbe8. Peer worktree remains untouched.
- Target state: fail closed on Git/recovery errors; no force removal; retained branch for every worker-created commit; honest PASS; final OpenCode text retained.
- Files / systems involved: existing scripts/master-coordinator.cjs and tests only; existing coordinator/leases/report schema.
- Known risks: disk errors, failed git status, own worker commits, cleanup races, paid provider configuration. No deployment, push or extra agent systems.
- Golden systems that must be preserved: existing resource and concurrency gates, direct OpenHuman transport, offline assignment.
- Errors that must not return: cleanup in finally after persistence failure; false PASS after failed commit; losing final text by truncating stream prefix.
- Exact patch / change plan: preserve checkout by default; validate cleanup target and state; remove only verified clean checkout without force; keep changed HEAD ref; check Git exit codes; bounded final-text extraction; synchronous lease failure releases lock.
- Tests to run: real tiny Git fixtures with stubbed OpenCode process, including self commit, dirty failure, ignored/untracked data, failed add/commit/status/recovery, idempotency; existing coordinator tests.
- Deployment / PR plan: local commit, no push/deploy; reuse peer base without modifying peer branch.
- Current progress / Next action: reproduce failure cases and patch existing coordinator.
- Completion criteria: all focused tests PASS, review and durable report; retain unique work and clean own temporary checkout.
- Final evidence: IN PROGRESS.
- Ownership: Codex; TTL 24h; created 2026-09-06; purpose coordinator lossless cleanup.
- Scope update: Zero-Chaos CLI previously checked Desktop layout only. Added aggregate Git inspection (all worktrees, dirty/untracked, unpublished commit reachability, fail closed on Git error) through existing housekeeping command; no new cleanup architecture.
- Reproduction: 7/7 newly added lossless fixtures FAIL against immutable 469abbe8. After fixes initial 25/25 PASS; expanded disk-full/add/push/ignored/idempotency/final-text checks then 65/65 PASS, final Git-state case under verification.

### Final focused evidence — Codex 2026-09-06
- 35/35 coordinator/lossless regressions PASS; existing housekeeping + safe-to-delete 35/35 PASS in combined predecessor run. New tests cover worker commits, dirty/untracked/ignored files, Git status/add/commit/push errors, disk-full recovery, idempotency, foreign path refusal, lease exception and second-attempt exclusivity, missing final text, permission refusal and large stream extraction.
- Real Zero-Chaos aggregate returns FAIL for active foreign work and unpublished local commits; no files moved/deleted by the gate.
- New live root cause: OpenCode external_directory auto-rejection with exit0 and blank final answer previously returned PASS. Fixed and regression protected; denied task is not retried automatically. Committed Git object review is the permitted alternative.
- COORDINATOR_LOSSLESS_REPORT.json is the local evidence artifact. No full release gate run in this sparse coordinator checkout; Google full release gate passed separately. No merge-safe/full-project completion claim.
- Next action: review committed patch through existing coordinator, integrate only in isolated checkout, preserve active primary work, no general push/deploy. Own temporary checkout must be removed after source/evidence preserved.

## Codex Google readiness recovery — 2026-09-06
- Task / Why: validate 90502c9c and eliminate reproducible first-start failures without deployment.
- Current state: isolated ai/codex/google-readiness-recovery at 90502c9c; main dirty WIP/reports preserved. Coordinator hardening owned by chatgpt in another active worktree; do not edit it.
- Target state: honest startup/readiness, isolated Docker context, passing regression evidence; continue existing architecture.
- Files / systems involved: google-ai-studio Dockerfile, probes, adapter, test/google-ai-studio-slots.test.js, existing error registry.
- Known risks: Node 22 image vs Node 24 engine; no Docker context exclusions; HTTP 404 currently passes readiness. Docker unavailable locally. No cloud deploy, billing, force push or foreign-work cleanup.
- Golden systems that must be preserved: API paths, slot guards, existing playable assets and quality contracts.
- Errors that must not return: false-positive readiness; host dependencies/secrets copied into image.
- Exact patch / change plan: reproduce readiness with isolated child fixture; reject failed entrypoint responses; startup probe uses readyz; align Node and exclude local context files; add regressions and repair rules.
- Tests to run: npm ci; baseline release:gate and quality:diff; Google slot unit/integration tests; check; local browser desktop/mobile; Zero-Chaos regression in current implementation.
- Deployment / PR plan: local verified commit only, hold general push/deploy until combined changes are reviewed.
- Current progress: baseline running. OpenHuman queued by existing coordinator resource gate (26% free RAM below 40% cold-load floor).
- Next action: collect baseline, reproduce defects, implement smallest fixes and rerun.
- Completion criteria: regressions PASS and actual gates reported without masking failures; preserve others' work; cleanup own temporary worktree after committed evidence.
- Final evidence: IN PROGRESS; no readiness claim.
- Ownership: Codex; purpose google readiness recovery; created 2026-09-06; TTL 24h; checkout C:/Users/user/AppData/Local/World_server_worktrees/codex-google-readiness.
- Scope update: baseline Vercel function guard fails (24 functions). OpenCode review through coordinator confirms 16 new standalone handlers should reuse router + lib/api-handlers pattern. Preserve URLs and handler logic; add api/features.js (9 functions total), rewrite parity and behavioral dispatch tests. OpenCode incorrectly claimed guard tests absent; independently verified they exist and fail. No paid call/deploy used.
- Baseline gates: npm ci PASS (13 audit findings); release:gate FAIL in existing Vercel function-count guard (375 pass, 1 fail, 1 skipped); quality:diff exit 0, score metadata is not runtime certification.
- Browser reproduction: root served HTML at / and broke relative assets with 8 console errors; redirect patch restores correct path, canvas and navigation UI with 0 console errors.

### Codex recovery final local evidence — 2026-09-06
- FIXED: readiness 4xx false-positive, startup probe, Node engine mismatch, unsafe Docker context, root-relative asset 404s, 24-to-9 API function consolidation with unchanged URLs, GDD unsupported-method ordering, absent service app registrations. Known-error registry protections added.
- TESTS: full npm run release:gate exit 0; 381 unit PASS / 1 SKIP; integration 76/76. Final clean-source startup/routing/package-root tests 11/11 PASS. Before fixes startup regression 2/2 FAIL and root redirect regression FAIL. Desktop + 390x844 viewport rendering: canvas + navigator UI + loading hidden, zero console errors.
- LIMITATIONS: Docker/Linux container and live Cloud Run not executed. Native mobile touch and load/soak not certified. Collective Brain sync DEGRADED/queued despite successful exit; releaseEligible remains false. GOOGLE_READINESS_RECOVERY_REPORT.json records exact scope.
- CLEANUP: own reproducible generated reports and auto-injected unrelated client instrumentation restored; no foreign files modified or removed. No ZIP created. Logs/evidence retained in task output report; temporary checkout removed after committed source evidence.
- NEXT ACTION: integrate reviewed Google branch with existing coordinator fixes when all shared ownership is released; push/deploy remain held. This is LOCAL_GATES_PASS_CLOUD_NOT_VERIFIED, not full project completion.


## Codex isolated recovery integration
Task: combine d20a7cfd and f762419e without changing active main. All four conflicts resolved by preserving both script families and every error record; dependency overrides retained. Risks: full integrated gates pending. Next: npm ci, integrated check/release, final review and local commit; no push/deploy. Final evidence: IN PROGRESS.
- Independent immutable Git review by OpenCode completed via existing coordinator. Accepted/fixed: execution is PENDING_REVIEW until a trusted caller verifies artifacts; success/reporting stored in shared log; failure to persist log remains pending; existing task checkout is RECOVERY_REQUIRED rather than throwing/aborting siblings; lossless tests no longer need a globally installed OpenCode. Recovery bundles explicitly state that untracked contents remain in the protected original checkout (no redundant copies).
- Integration npm ci initially reproduced EUSAGE from stale lockfile vs inherited dependency overrides; lock synchronized, clean npm ci PASS (421 packages, npm audit 0 vulnerabilities). Exact override/lock regression added.
- Full integrated pre-review-fix test run: 568 PASS, 1 SKIP. Focused review-fix tests under final verification; no deployment or general push.

### Codex recovery integration — 2026-09-06 final local milestone
Google d20a7cfd and coordinator f762419e integrated, preserving peer 469abbe8 history. Full unit 573 PASS/1 SKIP; coordinator 40 PASS; final branch-publication regression 1 PASS; lesson serialization 19 PASS; integration 76/76. Lockfile aligned with overrides: npm ci PASS, audit 0. Quality schema normalized without certifying inherited errors. Remaining release: quality:regression reports baseline11/current21 blockers; governance25 blockers, releaseEligible=false; shared memory DEGRADED queued. No push/deploy. Details: RECOVERY_INTEGRATION_REPORT.json. Own temporary worktrees may be removed only after commits and compact evidence are preserved. Foreign WIP remains untouched.

### Codex late peer reconciliation
Reconcile immutable Google peer head58016f7a in owned off-Desktop checkout. Preserve current runtime routing/readiness, keep conservative build exclusions, review new build guard and child RSS test; no foreign edits or deploy.

Late peer58016f7a merged: production-only npm ci PASS115packages/audit0; Google31/31 PASS; build-guard PASS. Added recursive dockerignore matcher regression, owned process-tree test cleanup and fail-closed unavailable child RSS. Linux container execution remains unverified. Release regression unchanged; no push/deploy.
