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

- sessionId: `session-1787632622221-75896e`
- status: `interrupted`
- checkpoint: `2026-08-28T04:57:45.608Z`
- checkpoint message: checkpoint before scheduler_kick fix - dirty 662, health DEAD overdue 625m, soak dead, honest 68/68
- last successful command: none
- last error: operation — Watchdog detected dead session/process: unfinished work exists but no responsible process is alive after 14.5 minute(s)
- next action: fix scheduler_kick npm.cmd quoting

### Recovery queue
- no explicit recovery steps registered yet

> New Desktop AI session: run `npm run desktop-ai:resume` before editing. Git reality overrides stale recovery metadata.
<!-- WORLD_SERVER_SESSION_RECOVERY_V1_END -->

<!-- WORLD_SERVER_GOOGLE_CLOUD_RUN_READINESS_20260906_START -->
## ADDITIONAL ACTIVE TASK — Google AI Studio / Cloud Run deploy-readiness review (started 2026-09-06)

Unrelated to the OpenHuman Collective Brain task above (different concern,
same branch because this branch is where the google-ai-studio/ Cloud Run
work already lives — see commit 90502c9c and `GOOGLE_CLOUD_RUN_DEPLOYMENT.md`).
Real Cloud Run deploy remains user-gated; nothing below touched `gcloud`,
billing, or any paid service.

### Task
Independent production-reviewer pass over this branch's Cloud Run deploy
path (`google-ai-studio/Dockerfile`, `cloudrun-entry.cjs`, the two
`cloudrun-service-*.yaml` manifests) looking specifically for defects that
would only surface *after* pressing Deploy — build context, Dockerfile,
package-lock consistency, PORT/host binding, env/secrets handling,
startup/shutdown, health/readiness, filesystem/writable-path assumptions,
cold start, memory/CPU limits.

### Findings (all fixed, each with a regression test — see commits)
1. **Missing `.dockerignore`** (HIGH) — build context is repo root and the
   Dockerfile does `COPY . .`; with no `.dockerignore`, ~1500 files this app
   never reads at runtime (`.iw-graphics-staging/` alone: 934 files) and
   any local `.env` would be sent to the builder. Verified zero runtime
   references from `server.js`/`api/`/`lib/`/`shared/`/`apps/dark-void-scene/`
   into each excluded path before excluding it. Fixed: `.dockerignore` (commit `0077075f`).
2. **Node version mismatch** (MEDIUM) — Dockerfile pinned `node:22-alpine`,
   package.json declares `engines.node: "24.x"`. Fixed: bumped to
   `node:24-alpine` (commit `853ab266`).
3. **`runtimeBudget()` measured the wrong process** (MEDIUM-HIGH, silent) —
   `cloudrun-entry.cjs` spawns the real `server.js` as a child and proxies to
   it; `/api/runtime-budget` (this branch's own documented OOM early-warning
   signal) called `process.memoryUsage()` on the *wrapper* only — the one
   process that never does real work. The child sharing the same 1Gi
   container cgroup was invisible to it, so the budget endpoint could report
   "ok" right up to an actual OOM kill. Fixed: reads the child's real RSS via
   `/proc/<pid>/status` (Linux-only — exactly what Cloud Run is; degrades to
   `childMemorySource: 'unavailable'` elsewhere rather than guessing).
   Commit `58016f7a`.
4. **No automated gate for any of the above** — added `build-guard` to the
   existing `scripts/google-ai-studio-slots.cjs` controller (reuses its
   report/evidence-ledger conventions; did not create a parallel tool),
   wired into `npm run google:slots:build-guard`, `google:slots:gate`, and
   `fullGate()`. Commit `a356aae8`.

Checked and found already correct, no fix needed: PORT read from
`process.env.PORT || 8080` ✓, binds `0.0.0.0` ✓, `/healthz`+`/readyz`
already real (not self-reported-only) ✓, SIGTERM/SIGINT graceful shutdown
with a bounded force-exit fallback ✓, secrets already routed through Cloud
Run Secret Manager `secretKeyRef` in both `cloudrun-service-*.yaml` (never
plain env) ✓, `package-lock.json` already in sync with `package.json`
(`npm ci --omit=dev --dry-run` clean, 114 packages) ✓, no durable
app-state writes to Cloud Run's ephemeral disk (`fs-guard`, pre-existing
tool, still 0 findings) ✓.

### Tests
`node --test test/google-ai-studio-slots.test.js test/dockerignore-guard.test.js test/cloudrun-entry-runtime-budget.test.js` — **25/25 PASS**.
`node scripts/check-js.js` (repo-wide syntax gate) — 64/64 files PASS.
`node scripts/google-ai-studio-slots.cjs build-guard` / `fs-guard` — both `ok:true` on the real repo post-fix.

### Provenance correction
Commit `0077075f` on this branch mistakenly carried
`AI-Session: https://claude.ai/code/session_01MJjnYYUZ8cAMDG8LD8T4r7` copied
from an earlier commit rather than checking AGENTS.md's own "AI COMMIT
PROVENANCE" rule against reusing another session's id. Every commit after
it in this task uses `local-cli-20260906-google-cloud-run-review` instead.
Not rewriting `0077075f` itself (history stays as-is) — noted here and in
`853ab266`'s own commit message for anyone auditing provenance later.

### Not done here (still user/owner-gated or out of this task's scope)
- The actual `gcloud`/Console "Deploy container" click — per
  `GOOGLE_CLOUD_RUN_DEPLOYMENT.md`, that remains the user's own action.
- A deeper require-graph-based case-sensitivity audit (Windows dev vs. Linux
  container filesystem) — checked the obvious risk areas by hand, found
  nothing, but didn't build dedicated tooling for it this round; worth a
  follow-up if a future Linux-only failure ever looks path-case-shaped.
- `services/`, `.iw-graphics-staging/`, and the other excluded-from-image
  directories were only checked for *runtime* references from the served
  app, not reviewed for their own correctness — out of this task's scope.

### Next action
Pick the next real blocker from shared reports (this repo's existing
`CHANGE_IMPACT_MATRIX.json`/`SYSTEM_ENHANCEMENT_BACKLOG.json`/quality
reports) that doesn't overlap PowerShell-Claude's or OpenCode's currently
active branches/worktrees, and continue the same fix-root-cause +
regression-test + shared-report loop.
<!-- WORLD_SERVER_GOOGLE_CLOUD_RUN_READINESS_20260906_END -->
