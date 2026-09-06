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

- sessionId: `session-1788669362128-ec659b`
- status: `in_progress`
- checkpoint: `2026-09-06T04:36:02.129Z`
- checkpoint message: Session recovery initialized
- last successful command: none
- last error: none
- next action: Run `tools/post-bootstrap-verify-windows.ps1 -TaskWorktree C:\Users\user\Desktop\World_server_openhuman` (now PASS with OpenHuman config), then `npm run release:gate` in worktree, classify any failures, create `COLLECTIVE_BRAIN_RUNTIME_EVIDENCE.json` + `REPORT.md`, commit → push → draft PR update (no auto-merge, no dirty main).

### Recovery queue
- no explicit recovery steps registered yet

> New Desktop AI session: run `npm run desktop-ai:resume` before editing. Git reality overrides stale recovery metadata.
<!-- WORLD_SERVER_SESSION_RECOVERY_V1_END -->

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
