# WORK IN PROGRESS

## Task — Creature Factory CPU/runtime benchmark + readiness (2026-09-05)

### Task
Isolated worktree `browser-task/task_ff5da5eba66af0b337d4d284dd3aefc7` based on VERIFIED Creature Factory commit `32d345b0e71fd99bd764b6a0ef4de3e0d4a10baa`. Deterministically benchmark CPU/runtime planning overhead (buildRecipe, planCreatureQuality, instancingKey, AnimationScheduler) at creature counts 1/100/1000/5000; write `CREATURE_FACTORY_BENCHMARK.json` (benchmarkType `CPU_RUNTIME_NOT_RENDERED_FPS`) and `CREATURE_FACTORY_READINESS.json`; add only a minimal hook into existing readiness/telemetry; commit; do NOT touch master/deploy.

### Why
Focused benchmark/observability task for Creature Factory (no cherry-pick, no redesign).

### Current state
- `node --test test/creature-factory.test.js` = 15/15 PASS on base commit (required unchanged).
- Working tree clean on base commit.

### Target state
- `scripts/creature-factory-benchmark.cjs` (deterministic, runtime <15s) + `CREATURE_FACTORY_BENCHMARK.json` + `CREATURE_FACTORY_READINESS.json`.
- Minimal hook: npm script `creature-factory:bench` + existing `integration-telemetry-lib.cjs` span. No duplicate telemetry architecture.

### Files / systems involved
`scripts/creature-factory-benchmark.cjs` (new), `CREATURE_FACTORY_BENCHMARK.json` (new), `CREATURE_FACTORY_READINESS.json` (new), `package.json` (npm script hook), `WORK_IN_PROGRESS.md`. No runtime/library code touched.

### Known risks
- Benchmark must stay under 15s total; deterministic inputs; no network/GPU dependency.
- Must not touch `lib/creature-factory/*` or tests (no redesign).

### Golden systems that must be preserved
`lib/creature-factory/*`, `data/creature-lod-policy.json`, `test/creature-factory.test.js` (15/15).

### Errors that must not return
N/A (additive benchmark/observability only).

### Exact patch / change plan
1. `scripts/creature-factory-benchmark.cjs` — deterministic creature asset pool (13 categories x 2 formats), per-count iterations, timed loop over the four APIs, deterministic checksum sha256 over `recipeHash:tier`, sleepingCount, lodDistribution, instancingGroupCount; write JSON to repo root; emit existing integration-telemetry span.
2. Run `node scripts/creature-factory-benchmark.cjs` -> `CREATURE_FACTORY_BENCHMARK.json`.
3. `CREATURE_FACTORY_READINESS.json` with accepted formats, 13 categories, verified test count, benchmark evidence, remaining gaps.
4. `package.json`: `creature-factory:bench` (and `creature-factory:check`) npm scripts.
5. `npm run check` + `node --test test/creature-factory.test.js` before commit.

### Tests to run
`node --test test/creature-factory.test.js` (15/15), `node scripts/creature-factory-benchmark.cjs` (<15s), `npm run check` (syntax + tests).

### Deployment / PR plan
Commit + push to task branch only. No master commit, no deploy.

### Current progress
Base test verified 15/15. Script/reports in progress.

### Next action
Write benchmark script, run it, generate reports, hook npm script, run `npm run check`, commit.

### Completion criteria
Benchmark JSON printed with all required per-count fields, benchmarkType `CPU_RUNTIME_NOT_RENDERED_FPS`, runtime <15s, readiness JSON with all 13 categories + gaps, 15/15 tests still PASS, commit created.

### Final evidence
`CREATURE_FACTORY_BENCHMARK.json`, `CREATURE_FACTORY_READINESS.json`, test output, commit hash.

---

## OLD — OPENHUMAN COLLECTIVE BRAIN PATCH V2.1 (superseded prior session context, preserved for history)

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

- sessionId: `session-1788463539382-3e447f`
- status: `in_progress`
- checkpoint: `2026-09-03T19:32:26.339Z`
- checkpoint message: V3 LIVE HANDOVER ready — commit 81093648 pushed to ai/opencode/browser-local-control, 43 caps verified by Browser ChatGPT (2026-09-03.v3, 0 mismatch), ready for PID handover
- last successful command: none
- last error: none
- next action: stop old PID 9096, start new loop, verify v3 heartbeat

### Recovery queue
- no explicit recovery steps registered yet

> New Desktop AI session: run `npm run desktop-ai:resume` before editing. Git reality overrides stale recovery metadata.
<!-- WORLD_SERVER_SESSION_RECOVERY_V1_END -->
