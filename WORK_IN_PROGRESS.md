# WORK IN PROGRESS — ArmorPaint Material Forge

## Task
Integrate ArmorPaint as an optional, production-safe PBR authoring source for World_server without embedding a second renderer or forcing heavy texture downloads on players. Extend the existing World Quality V4 material and universal microdetail systems with one canonical manifest/registry, deterministic import validation, adaptive runtime binding, and automation-ready checks.

## Why
ArmorPaint can supply authored base-color, normal, ORM and emissive maps for terrain, architecture, creatures, armor and weapons. The useful integration boundary is exported material data, not the full editor in the gameplay client. The server needs strict budgets, provenance, mobile degradation and shared-world reuse before these assets are safe.

## Current state
Branch `ai/codex/armorpaint-material-forge` was created from clean `origin/master` at `ca9d13eb987dcfd0afb8f9dcab66abdb89ef3b63`. World Quality V4 already synthesizes procedural PBR profiles and Universal Voxel Microdetail already patches the two certified voxel renderers. There is no canonical authored-material manifest, ArmorPaint importer, checked registry, texture path/dimension/hash validation or shared runtime map binder yet. Manual Fast Lane PR #91 remains separately owned and nonterminal; this branch must not touch its camera/framing scope.

## Target state
One additive Material Forge accepts ArmorPaint-style exports, rejects traversal/remote/unbounded/16K runtime assets, verifies provenance and hashes, compiles a deterministic browser registry, selects SAFE/BALANCED/HIGH/ULTRA material variants, binds PBR channels to existing Three.js materials, preserves procedural fallback, and becomes discoverable to the existing hourly Architect/Builder/Fleet/Ocean pipeline without creating a new automation.

## Files / systems involved
`lib/material-forge.js`, `scripts/material-forge.js`, `shared/graphics/material-forge-runtime.js`, `shared/graphics/universal-voxel-microdetail-bootstrap.js`, `data/material-forge/`, generated shared registry, package scripts, World Quality policy, Golden/technology registries, focused tests, documentation and this WIP evidence.

## Known risks
- Authored textures can increase download size, GPU memory and draw cost, especially on phones.
- Untrusted paths or remote URLs could bypass repository provenance or leak requests.
- Applying maps to UV-less voxel geometry can render incorrectly; triplanar/procedural fallback must remain.
- ORM channel packing and color-space errors can silently produce wrong materials.
- Material tuning must not change PR #91 camera/framing behavior or self-approve visual baselines.

## Golden systems that must be preserved
Existing renderer, procedural PBR synthesis, Universal Voxel Microdetail, adaptive World Quality tiers, deny-by-default releases, compact UI, controls/physics, exact orthographic presentation, accepted visual baselines and all release gates.

## Errors that must not return
16K runtime maps, path traversal, arbitrary remote texture URLs, missing provenance, unverified hashes, unsafe auto-publication, texture use above device budgets, visual-baseline self-approval, duplicate renderers/material systems and mandatory GPU/ArmorPaint dependencies at runtime.

## Exact patch / change plan
1. Define and validate a versioned ArmorPaint-compatible material manifest and canonical registry.
2. Add a deterministic import/check/compile CLI with file hashing, PNG dimension checks, channel conventions and strict web budgets.
3. Add an adaptive Three.js runtime binder with procedural fallback and same-origin map loading.
4. Connect the binder to Universal Voxel Microdetail and existing World Quality tier changes.
5. Register the reusable capability and add focused regression, drift and safety tests.
6. Run focused checks, full repository gates, diff review, commit, push and open a protected PR.
7. Extend the existing Architect/Builder/Fleet/Ocean hourly prompts after implementation evidence exists; never create a fifth worker.

## Tests to run
Focused Material Forge tests; deterministic registry drift check; `npm run check:fast`; `npm run check`; `npm run golden:check`; `npm run desktop-ai:check`; `npm run quality:diff`; affected browser smoke where feasible; full `npm run release:gate`; `git diff --check`.

## Deployment / PR plan
Commit and push `ai/codex/armorpaint-material-forge`, then open a PR into protected `master`. Do not direct-push master, merge, deploy or claim live integration from this implementation branch. The existing pipeline can integrate only after Fleet PRE verifies the exact head and the nonterminal Manual Fast Lane no longer blocks it.

## Current progress
Implementation is complete on the isolated branch. Material Forge now has a strict ArmorPaint export preset/importer, deterministic six-recipe registry, SAFE/BALANCED/HIGH/ULTRA budgets, same-origin/path/hash/dimension guards, adaptive UV/triplanar Three.js binding and procedural fallback. The shared bootstrap is adopted by `voxel-world`, `ai3d-voxel-city`, `survival`, `catalog` and `world-sharabass`. Runtime hardening also cancels stale texture loads, restores the original shader hook when a tier loses its authored-map plan, keeps private runtime state out of serializable Three.js `userData`, releases disposed material state and avoids shader recompilation for a zero-download fallback. Browser-gate hardening explicitly probes that fallback and normalizes key-only mobile WebKit events without reducing the existing movement threshold.

## Next action
Fleet must independently validate the current exact head of PR #97 on desktop/mobile and return `READY_FOR_OCEAN` or a concrete same-PR blocker. Ocean may integrate only that certified head after the higher-priority Manual Fast Lane clears. No authored visual baseline or production-readiness credit is allowed before Fleet PRE and later Fleet POST evidence.

## Completion criteria
Focused and repository gates pass; registry compilation is deterministic; unsafe/oversized inputs fail closed; browser runtime preserves procedural fallback and device ceilings; exact evidence is recorded; PR is open; existing hourly prompts are updated with bounded Material Forge responsibilities.

## Final evidence
- Focused Material Forge/runtime/import/security/discovery plus mobile input suite: 10 pass, 0 fail.
- Combined Material Forge + World Quality + microdetail suite before the final hardening tests: 33 pass, 0 fail.
- `npm run material-forge:check`: PASS; 6 deterministic recipes; source hash prefix `6a9bcdc0e67d`; 0 credited ArmorPaint map sets until real exports exist.
- Final `npm run check` inside the post-hardening gate: PASS; 607 tests, 603 pass, 0 fail, 4 intentional skips.
- `npm run golden:check`, `npm run contracts:check`, `npm run tech:audit`, `npm run quality:world:materials`, `npm run quality:diff`: PASS.
- Final post-hardening `npm run release:gate`: PASS through protocol, full tests, Golden, no-regression, fuzz, impact, perceptual, technology, duplicate, contracts, project, stability, evidence, World Quality and Collective Brain gates.
- Local static HTTP smoke returned 200 for the registry, runtime and five adopted worlds. Local Playwright browser evidence is unavailable because the Playwright CDN returned 502/timeouts; `e2e/material-forge.spec.js` carries desktop/mobile procedural and real WebGL authored-triplanar shader checks for CI/Fleet.
- Protected review PR #97 is open from `ai/codex/armorpaint-material-forge`; its remote head and exact base are recorded in PR metadata. No merge or deployment was performed.
- Existing hourly tasks were extended without a fifth worker or schedule changes: Architect `6a9f5b02fffc81918542f8cd6d1a70c8` (:00), Builder `6a9d497e64508191990f7f113089a95f` (:05), Fleet PRE/POST `6a9cede19eb88191b776ea7a9b64b217` (:25), Ocean `6a9e4318a7008191bfcf86e5ad352426` (:45). Post-update verification found one Material Forge contract in each prompt; all four remain enabled in `Asia/Tbilisi`.

---

# Previous work — Scoped Task Compiler, resource scheduler, real native Godot pipeline

---

# Patch-to-World ingestion and World Graph — 2026-09-07

## Task
Implement a reusable, idempotent Patch-to-World ingestion layer and interconnected World Graph on an isolated feature branch. Add manifests, revision history, portals, safe world APIs, manifest-driven metadata access, catalog integration, tests, and existing release-gate coverage.

## Why
Distinct patch families need stable world identities while later versions remain revisions/history. Public discovery must continue to respect the existing deny-by-default app-release registry.

## Current state
Branch `ai/chatgpt/patch-to-world-graph` is isolated from `origin/master`; baseline worktree was clean. Baseline `npm ci`, `npm run release:gate`, and `npm run quality:diff` were run before edits.

## Target state
One reusable graph/manifest library supports deterministic ingestion, deduplication, revision history and portal edges. `/api/worlds` exposes only registry-certified public worlds; `/api/apps` remains backward compatible. Catalog consumes world metadata without creating a second runtime.

## Files / systems involved
`lib/world-graph.js`, `scripts/ingest-world-patches.js`, `data/world-manifests/`, `data/world-graph-index.json`, `api/worlds.js`, `server.js`, catalog client, tests, and WIP evidence.

## Known risks
Do not auto-publish manifests; do not bypass `data/app-release-registry.json`; do not add a second persistence, telemetry, or rendering runtime. Existing apps and legacy APIs must remain unchanged.

## Golden systems that must be preserved
Existing app-release deny-by-default, catalog portals, shared controls/physics, persistence, telemetry, and all release gates.

## Errors that must not return
Catalog discovery by file existence, duplicate world identities, non-idempotent ingestion, dangling portals, and publication of uncertified/quarantine apps.

## Exact patch / change plan
1. Add strict manifest normalization and deterministic graph ingestion.
2. Add source patch-family/revision manifests for existing certified worlds.
3. Generate a checked-in graph index through the ingestion CLI.
4. Add read-only world APIs and local server routing.
5. Add catalog metadata integration without replacing the existing runtime.
6. Add focused tests and run the required release gates.

## Tests to run
Focused world-graph/ingestion/API tests, `npm run check`, `npm run release:gate`, `npm run quality:fuzz`, `npm run quality:stability`, `npm run quality:impact`, and relevant browser checks where feasible.

## Deployment / PR plan
Commit on this branch, push, open a PR to `master`; no direct deployment. Apply the 95% deployment/manual-action gate to any later promotion request.

## Current progress
Implementation complete on the isolated branch. `npm run world:ingest` reports `worlds=3 revisions=3 public=2`. The generated graph includes certified `ai3d-voxel-city` and `voxel-world`; quarantined `dark-void-scene` remains excluded by the release registry.

## Next action
Commit, push, and open the review PR. No deployment or publication action is included in this patch.

## Completion criteria
Idempotent ingestion and revision tests pass; world APIs and catalog preserve deny-by-default; all required release gates pass; PR contains evidence and known limitations.

## Final evidence
- `npm ci`: PASS; 353 audited packages, 0 vulnerabilities.
- `npm run check`: PASS; 501 tests, 499 pass, 0 fail, 2 skipped.
- Focused `test/world-graph.test.js`: 4 pass, 0 fail.
- `npm run release:gate`: PASS through protocol, tests, fuzz, impact, perceptual, tech, duplicate, contract, project, stability, evidence, world-quality, and collective-brain checks.
- `npm run quality:diff`: PASS before edits; post-change release gate remains PASS.
- Local HTTP smoke: `/api/worlds` 200 with 2 public worlds and graph edges; `/api/worlds?id=voxel-world` 200; `/api/apps` unchanged and deny-by-default.
- No production deployment performed; the 95% deployment/manual-action gate remains applicable to any later promotion.

## Task
Per the user's explicit follow-up cycle (target 90-95% capability coverage):
fix the confirmed agent_implement full-repo-timeout bottleneck with a real
Scoped Task Compiler + progressive context expansion; add a resource-aware
scheduler after a real concurrent-download-vs-agent-call incident; audit
OpenHuman's newly-discovered local JSON-RPC surface safely; build a real
production-architecture native (Godot) client sharing the exact same World
Spec/seed/terrain formulas as the web client, with a real headless Windows
EXE export pipeline; add history-based model selection; run a genuine,
honest 3-task free-agent E2E benchmark and a genuine native build E2E.

## Why
Previous round ended at ~85% coverage with agent_implement timing out on
every free model against the full repo. The user explicitly authorized
installing Godot (free/open-source) and asked for real, verified progress,
not design documents - and to never declare Scoped Task Compiler or Native
"confirmed" without real evidence.

## Current state
**All of the following is real and verified; the one deliberately NOT
overclaimed result is the automated free-agent benchmark - see below.**

- **Scoped Task Compiler** (`lib/scoped-task-compiler.js`, new): ranks a
  minimal file set for a goal (explicit path mentions in the goal text >
  matching `error-prevention-registry.json` entries > keyword-ranked repo
  search), 3 progressive levels (~5 files / ~20 files / full-repo
  fallback). `agent-adapters.js`'s `implementGoal()` now tries all 3
  levels for one model (with per-level timeout fractions of the caller's
  budget) before moving to the next model. Files are attached to OpenCode
  via repeated `-f <file>` flags (never via untrusted argv text - see the
  injection-safety design from the prior round, preserved and tested).
  8 real regression tests, all passing (`test/scoped-task-compiler.test.js`).
- **Resource-aware scheduler** (`lib/resource-scheduler.js`, new): real
  root-cause fix for an incident found live this session - a 1.19GB Godot
  export-templates download running concurrently with an agent_implement
  E2E test produced timeouts that, tested moments later in isolation with
  no competing download, succeeded in 10-13s. `implementGoal()` now
  exclusively holds an `LLM_REMOTE` resource-class slot (via the existing
  `lib/collective-brain` lease primitive - reused, not duplicated) for its
  whole attempt loop, so it can never again run concurrently with a
  scheduler-aware `NETWORK_HEAVY` task. Found and fixed a real bug in the
  scheduler itself during testing: `LIGHTWEIGHT` tasks (explicitly defined
  to never conflict with anything) were being serialized against each
  other by an over-eager lease-per-class implementation. 8 regression
  tests, all passing (`test/resource-scheduler.test.js`).
- **A second, more consequential real bug found and fixed**: `invokeOpencodeOnce`
  was classifying a timeout as pure failure and rolling back the worktree
  via `git checkout -- .` - even when OpenCode's process had ALREADY
  correctly completed the edit and was just hanging afterward instead of
  exiting (confirmed by watching the raw `--format json` event stream with
  `stdio:'inherit'`: real `tool_use`/`step_finish` events showing a correct
  edit at ~2s, but the process itself never exited). Fixed: on a timeout,
  `git diff` is checked in the target worktree BEFORE concluding failure -
  a real diff means real success (`processHangAfterCompletion:true`,
  verification still runs), an empty diff means real failure. This was a
  significant find - real completed work was being silently discarded
  before this fix.
- **New failure taxonomy**, used consistently now instead of one generic
  `'timeout'`: `timeout`/`process_hang` (no work, no contention evidence),
  `resource_contention` (no work, high memory pressure sampled at the
  moment of failure), `agent_error` (real non-zero exit), `verification_failed`
  (real edit, but `npm run check` failed), `no_changes`.
- **History-based model selection** (`lib/agent-history.js`, new):
  real, file-based (not ML) JSONL log of every attempt
  (taskType/contextBucket/model/duration/success/tokens/cost). Before
  ordering models, `rankModelsForTask()` prefers a model with a real,
  better track record on similar (heuristically bucketed) past tasks;
  models with no history keep their original relative order (never
  penalized for being untested). `recommendTimeoutMs()` can derive a
  timeout from real observed p90 durations once enough history exists,
  instead of one fixed number for every task. Wired into `implementGoal()`.
  8 regression tests, all passing (`test/agent-history.test.js`).
- **OpenHuman audit, done properly this round** (not just "no CLI found"):
  `C:\Program Files\OpenHuman\OpenHuman.exe` is a real installed binary. It
  is a full Tauri desktop GUI app that spawns an embedded core JSON-RPC
  server on `127.0.0.1:7788`. Safely probed (localhost only, never exposed
  externally, no auth bypassed, no token extracted): `/` and `/schema` are
  genuinely public/unauthenticated and return a full, real API description
  - **695 methods across 91 namespaces**, including directly relevant ones
  (`agent_team_start_member`: "Spawn a live worker for a member: claims a
  task and runs a real sub-agent to completion", `agent_chat`,
  `subagent`, `worktree`, `workflow_run`). `/rpc` genuinely returns a real
  `401 Unauthorized` for any unauthenticated call - confirmed the vendor's
  own stated design ("auth token loaded via in-memory handoff, no env
  crossing") is real and enforced, not just documented. **Conclusion: real,
  extensively documented internal API exists, but is deliberately gated
  behind a token this process has no legitimate way to obtain - no adapter
  was built, and none should be without the user first taking a real,
  explicit action (an OpenHuman-side "generate an API key for automation"
  feature, if one exists, was not searched for via the GUI - a possible
  next step for the user to investigate, analogous to the GitHub Connector
  403 fix).**
- **AnythingLLM**: re-confirmed the prior decision - not installed, and per
  the user's own instruction ("not worth installing just for agent count"),
  not installed this round either. Ollama (local Q&A) + OpenCode (free-tier
  code editing) already cover the free/local execution need; no functional
  gap was identified that AnythingLLM would uniquely fill.
- **Real native Godot pipeline** (`godot/world-client/`, new): Godot 4.7.2
  (free/open-source, explicitly authorized) downloaded, installed, and
  export templates (1.19GB, real resumable download after an artificial
  timeout truncated the first attempt) installed to the correct location.
  `WorldGen.gd` is a faithful port of `apps/voxel-world/client.js`'s real
  terrain formulas (`hash32`/`valueNoise`/`fbm`/`biomeAt`/`heightAt`) -
  **not a separate simplified game**: same seed produces the same
  height/biome at every coordinate as the web client, which is what makes
  this a second CLIENT of the same World_server world. Found and fixed a
  real, serious bug while porting: GDScript's 64-bit `int` does not
  replicate JS's 32-bit signed-multiply/unsigned-shift semantics
  (`Math.imul`/`>>>`) - the initial naive port rendered visibly wrong
  terrain (all-'snow' biome everywhere). Fixed with explicit
  `to_int32`/`imul32`/`ushr32` helpers. `scripts/compare-worldgen.js`
  cross-checks the real web formulas (copied verbatim, not reimplemented)
  against the real Godot binary across **7 seeds x 20 coordinates (140
  points, both quadrants, small/large magnitudes, seed 0 and a negative
  seed)** - PASS, 0 diffs. `scripts/godot-native-build.js` runs the full
  real pipeline: preflight -> headless `--export-release` -> artifact
  exists + plausible size -> real smoke test (runs the actual exported
  EXE, parses its output) -> web/native equivalence check - **PASS, exit
  0, run twice**. Wired as the real `build_native` typed command
  (`kind:"npm-script"`, `build:native`) - verified through the bridge's
  `executeTask` for real: `ok:true, exitCode:0`.
- **Real, honest E2E benchmark result - NOT overclaimed**: 3 real, small,
  correctly-scoped World_server tasks (add `viewport-fit=cover` to
  `apps/ai3d-voxel-city/index.html`, `apps/survival/index.html`,
  `apps/chat/index.html`) run through the full automated pipeline
  (`create_worktree` -> `agent_implement` -> `inspect_worktree_diff` ->
  `remove_worktree`) with NO competing downloads/builds this time.
  **Result: 0/3 succeeded automatically.** Every attempt at scoped context
  levels 1-2 failed fast (~2.5s, `agent_error`) across all 3 free models;
  level 3 (full-repo) hung until timeout (`process_hang`). Deep,
  time-boxed live diagnosis (raw shell invocation, `bash.exe`-direct
  invocation, `stdio:'inherit'`, single-vs-multiple `-f` flags) ruled out
  several specific hypotheses (it is not the multi-file-attachment
  mechanism specifically - a single-`-f` invocation later hung with zero
  output too) without reaching a fully proven root cause. The
  evidence-consistent (not proven) hypothesis: this session made several
  dozen calls to the same free-tier hosted models over a few hours, and
  the observed degradation resembles session-cumulative rate-limiting/
  backend overload, not a code bug - recorded honestly as an open question
  in `data/error-prevention-registry.json`, not swept under the rug.
  **The underlying mechanisms (Scoped Task Compiler's file selection,
  injection-safe attachment, hang-recovery diff-check) were separately,
  repeatedly verified correct via live testing earlier in the session when
  the service was less loaded - those are not invalidated by this
  incident, only the live success rate actually observed in this specific
  benchmark run is.**

## Target state
`agent_implement` reliably solves small, well-scoped World_server tasks
via the free tier without needing the whole repo as context, with correct
resource isolation, a correct hang-recovery path, and history-informed
model choice; a real native Godot client exists sharing the same World
Spec as the web client with a working, verified export pipeline.

## Files / systems involved
- `lib/scoped-task-compiler.js`, `lib/resource-scheduler.js`,
  `lib/agent-history.js` (new)
- `lib/agent-adapters.js` (implementGoal rewritten: progressive context,
  resource-scheduler wrap, history-based ranking, hang-recovery fix)
- `godot/world-client/` (new: project.godot, WorldGen.gd, Main.gd,
  main.tscn, export_presets.cfg)
- `scripts/compare-worldgen.js`, `scripts/godot-native-build.js` (new)
- `data/collective-brain/remote-task-commands.json` (`build_native` now
  real), `package.json` (`build:native`, `worldgen:compare`)
- `data/error-prevention-registry.json` (6 new entries)
- `test/scoped-task-compiler.test.js`, `test/resource-scheduler.test.js`,
  `test/agent-history.test.js` (new, 24 tests total)

## Known risks
- The free-tier OpenCode backend's real-world reliability is currently
  degraded for this session/account (see the honest E2E result above) -
  `agent_implement` should not be assumed to reliably succeed until this
  is re-verified after a cooldown period or from a different session.
- OpenHuman's real API surface (695 methods) remains inaccessible without
  a user-side action this session could not safely take.

## Golden systems that must be preserved
Untouched - no app/game code was actually committed by the E2E benchmark
(all 3 attempts failed and were cleanly rolled back/removed). Verified via
`node scripts/check-golden-standard.js` and the full `release:gate`.

## Errors that must not return
- `implementGoal` silently sending the whole repo to a free model for a
  small, precisely-scoped task (fixed - Scoped Task Compiler is now the
  default path, full-repo is the last-resort level 3).
- A concurrent NETWORK_HEAVY download starving an LLM_REMOTE call without
  either being aware of the other (fixed - resource scheduler).
- A completed, correct edit being discarded as a failure because the
  underlying process hung afterward instead of exiting (fixed -
  diff-before-rollback in invokeOpencodeOnce).
- `LIGHTWEIGHT` resource-class tasks being accidentally serialized against
  each other (fixed, regression-tested).
- A GDScript port of a JS bitwise/hash function using plain 64-bit
  `*`/`^`/`>>` instead of explicit 32-bit-wraparound helpers (fixed,
  regression-tested via scripts/compare-worldgen.js).
- Claiming Scoped Task Compiler or Native build_native "confirmed working"
  without a real, current, honestly-reported success - this WIP entry and
  the final report explicitly do not do that for the free-agent benchmark.

## Exact patch / change plan
See "Files / systems involved" above - 3 new lib modules, 2 new scripts, a
new Godot project, 3 new test files (24 tests), 6 new registry entries, and
targeted edits to `agent-adapters.js`/`remote-task-commands.json`/
`package.json`. No app/game source code changed (the E2E benchmark's
attempted edits were all rolled back on failure).

## Tests to run
- `node --test`: 202/203 PASS, 1 skipped by design (opt-in live opencode
  test, consistent with the prior round's precedent).
- `node scripts/check-golden-standard.js` / `check-desktop-ai-protocol.js`:
  PASS.
- `node scripts/project-quality-reviewer.js`: blockers=0.
- `node scripts/compare-worldgen.js`: PASS (7 seeds x 20 points, 0 diffs).
- `node scripts/godot-native-build.js` (`npm run build:native`): PASS,
  exit 0, run twice (real headless export + real smoke test + real
  equivalence check each time).
- Full `npm run release:gate`: to run before push.
- 3-task real-World_server free-agent E2E: 0/3 (see above, honestly
  reported, not the headline claim of this round).

## Deployment / PR plan
`ai/desktop/scoped-context-native-pipeline` -> `master`. Merge once this
PR's own checks are green (pre-existing unrelated Playwright red on
master, reconfirmed against master's current HEAD at PR time, acceptable
per established precedent).

## Current progress
All code, tests, and the native pipeline are implemented, tested, and
verified working on their own terms. The one explicitly NOT-yet-achieved
goal is a positive free-agent World_server E2E success (0/3 this round,
for reasons only partially diagnosed - see above). Not yet committed at
the time this entry was written.

## Next action
Run full `release:gate`, commit, push, open PR, wait for CI, merge. Then
produce the final report in the user's exact requested format, honestly
including the 0/3 E2E result and the still-open root-cause question.

## Completion criteria
PR merged; all new modules covered by real regression tests; native build
pipeline genuinely produces and verifies a working EXE; the free-agent E2E
result reported exactly as observed, not adjusted to look more favorable.

## Final evidence
- `node --test`: 202/203 PASS (1 skipped by design).
- `node scripts/compare-worldgen.js`: PASS, 140/140 sample points matched
  across 7 seeds.
- `node scripts/godot-native-build.js`: PASS, exit 0 (run twice, including
  once via the typed `build_native` bridge command directly).
- Real artifact: `GODOT_BUILD/world-server-native-windows.exe`, ~109MB,
  runs standalone, smoke-test output cross-verified against the web
  client's own terrain formula.
- 3-task free-agent World_server E2E: 0/3, honestly reported with full
  per-attempt diagnostics recorded in this file and in
  `data/error-prevention-registry.json`'s
  `opencode-free-tier-reliability-degrades-with-sustained-session-usage`
  entry.


---

# Addendum — World Cloud AI / OpenCode + Qwen

## Goal
Add an isolated cloud coding-agent path for `World_server` using GitHub Actions, pinned OpenCode, and Qwen3-Coder through OpenRouter, without changing the existing desktop-agent pipeline.

## Safety / integration
- Runs only on owner-triggered `/worldai` comments or manual workflow dispatch.
- Uses a per-run branch and opens a PR; it never writes directly to `master`.
- Keeps default GitHub Actions permissions read-only; this workflow requests only the write scopes it needs.
- Validates changes with existing `check`, `desktop-ai:check`, and `golden:check` gates.
- On verification failure, performs up to two repair passes without weakening tests.

## Current progress
Workflow added on isolated branch `ai/cloud-opencode-qwen`. YAML parsing, `git diff --check`, `desktop-ai:check`, `check:fast`, and `golden:check` pass. GitHub Actions PR permission is enabled while repository default workflow permission remains read-only.

## Next action
Push this isolated branch and open a PR. Live model E2E remains blocked until repository secret `OPENROUTER_API_KEY` is added.

## Final evidence
Local structural/protocol gates PASS. No claim of live Qwen/OpenRouter execution is made until the secret is configured and a real GitHub Actions run passes.

## Cloud AI secret compatibility fix — 2026-09-06

### Goal
Prevent cloud-agent startup failures when the existing OpenRouter repository secret uses the compatibility name `WORLD` instead of `OPENROUTER_API_KEY`.

### Root cause
The first real GitHub Actions E2E run proved the workflow only read `secrets.OPENROUTER_API_KEY`, while the repository currently exposes the user-created secret as `WORLD`.

### Change
`.github/workflows/world-cloud-ai.yml` now resolves `OPENROUTER_API_KEY` from `secrets.OPENROUTER_API_KEY || secrets.WORLD`. No secret value is logged, copied, or stored in the repository.

### Regression protection
Keep the preferred descriptive name first, retain `WORLD` only as a backwards-compatible alias, and fail closed if both are absent.

### Tests to run
YAML parse, `npm run desktop-ai:check`, `npm run check:fast`, `npm run golden:check`, then a real `workflow_dispatch` E2E on `master` after merge.

### Final evidence
Pending commit/CI/real cloud-agent E2E.

## Cloud AI provider hardening — 2026-09-06

### Goal
Make OpenCode + OpenRouter reliable in non-interactive GitHub Actions after the first authenticated run failed inside OpenCode with `UnknownError` before any repository edit.

### Root cause / mitigation
The built-in OpenRouter path did not provide an actionable provider error in CI. The workflow now uses an explicit OpenAI-compatible `worldrouter` provider through a temporary `OPENCODE_CONFIG`, with the key referenced only as `{env:OPENROUTER_API_KEY}`.

### Safety
The config lives only in the runner temp directory, contains no secret value, checks that `qwen/qwen3-coder:free` is currently advertised by OpenRouter, and keeps all Git changes isolated to `world-ai/run-*` branches.

### Tests to run
YAML parse, `check:fast`, `golden:check`, `desktop-ai:check`, then real workflow_dispatch E2E through Qwen → edit → verify → PR.

### Final evidence
Pending real cloud-agent E2E.

## Cloud AI live free-model fallback — 2026-09-06

### Goal
Remove the hard dependency on one disappearing free OpenRouter model while guaranteeing zero paid inference.

### Root cause
The live OpenRouter `/api/v1/models` catalog no longer advertised `qwen/qwen3-coder:free`; the workflow correctly failed before inference even though the old public model page still existed.

### Change
At every run, resolve an approved zero-cost open-weight model from the live catalog: prefer Qwen3 Coder Free, otherwise use GLM-5.2 Free. Generate a temporary OpenCode provider config for the selected model. Never fall back to a paid endpoint.

### Regression protection
Model selection requires both prompt and completion prices to equal zero and fails closed when no approved free model is live.

### Tests to run
YAML parse, local project guards, then real cloud E2E through model selection → OpenCode → repository edit → verification → pull request.

### Final evidence
Pending real workflow run.

## AI mutual reinforcement + cloud failover — 2026-09-06

### Goal
Increase whole-system readiness by connecting existing local/free agents, the GitHub cloud agent, shared Collective Brain evidence, and an explicit paid-only Codex fallback without duplicating infrastructure.

### Reused systems
Ported the already-tested OpenHuman/AnythingLLM subtask dispatcher and hardened master-coordinator onto current master. Kept current master registry/evidence/lock files and did not resurrect the removed legacy multi-ai-peer-review implementation.

### Changes
Master Coordinator can now dispatch OpenCode, OpenHuman, AnythingLLM and World Cloud AI, while Codex is an explicit opt-in fallback only. Automated cloud/OpenCode/Codex outcomes share the common ai-agent report log. New `--full-free` mode enables all free cooperating workers.
### Cloud root cause + protection
The prior E2E reached GLM-5.2 and then died on a transient `Provider returned error`. The workflow now resolves several live zero-cost tool-capable open-weight candidates and `world-cloud-opencode-failover.cjs` retries only provider/rate-limit/timeout failures on the next free model. Non-provider code/test failures fail closed and are never hidden.

### Safety / cost invariants
No paid cloud fallback is allowed inside World Cloud AI. Codex dispatch requires explicit `allowPaid=true` / `--allow-paid`. External task text is secret-scanned before OpenCode/cloud/Codex dispatch. Dirty failed local work is preserved off Desktop through the existing recovery path.

### Tests / evidence
Run master-coordinator + OpenHuman/AnythingLLM/MCP/resource tests, cloud failover unit tests, YAML parse, check:fast, desktop-ai:check, golden:check, then a real zero-cost cloud E2E. Final evidence pending the real cloud run.

### Linux CI portability defect found and fixed
PR #38 exposed nine Linux-only failures because the reused AI queue stack embedded `C:\Users\user\Desktop\World_server` as an executable path. Windows local tests hid this. Added `lib/world-server-paths.js` to discover the canonical git main worktree cross-platform, while executable source paths always resolve from the current checkout. Scheduler, router, OpenHuman, coordinator and health checks now reuse this resolver.

### Portability regression protection
`test/world-server-paths.test.js` verifies that source root is the active checkout, `durable-job-queue.cjs` exists inside it, and the canonical main worktree is discoverable. Machine-specific World_server path literals were removed from runtime/test code so Linux CI cannot regress to a Windows path again.

## 2026-09-06 dependency-security readiness closure
- Owner: ChatGPT automation; branch `ai/chatgpt/dependency-security`; isolated off-Desktop worktree.
- Root cause: latest `@lhci/cli@0.15.1` still resolves vulnerable Lighthouse/Puppeteer/qs/tmp/uuid transitive versions; `extract-zip@2.0.1` has no fixed npm release.
- Fix: keep LHCI API surface but override its security-sensitive transitive graph to current compatible fixed versions: Lighthouse 13.4.1, puppeteer-core 25.10.0, @puppeteer/browsers 3.2.2, qs 6.16.0, tmp 0.2.7, uuid 11.1.1. This also removes extract-zip entirely because browsers 3.x uses modern-tar.
- Evidence: `npm audit --json` reports 0 vulnerabilities after install; dependency tree confirms all overrides and no extract-zip.
- Regression: `test/dependency-security-lock.test.js` fails if critical packages fall below the remediated floors or extract-zip returns.
- Local full `npm run check` reached 461 PASS / 2 resource-scheduler failures caused by live system free RAM 13.3% while many parallel AIs were active; failures are resource-gate behavior, not dependency assertions. CI on clean GitHub runner is authoritative for full suite.
- Local LHCI healthcheck passed with the upgraded graph; collection could not start only because port 3100 was already occupied by another active agent/server. Do not kill that process; GitHub CI will verify an isolated run.

## 2026-09-06 catalog production performance root-cause fix
- Production evidence: catalog p10 FPS 12 (<30), p95 load 13231ms (>10500).
- Root cause: top-level await AppCore.init blocked module/load on Supabase CDN/network; mobile renderer also started at DPR up to 1.8 with antialias + shadows.
- Fix: non-blocking AppCore init, device-aware rendering budget, adaptive DPR, flat ground geometry, bounded mobile lightning bursts.
- Regression: test/catalog-production-performance.test.js 3/3 PASS; check:fast/golden/desktop-ai PASS.
- Remaining proof: full npm check + GitHub CI + post-deploy Production Quality Feedback.



## 2026-09-06 — Zero-Chaos / Computer-Health for all AI entrypoints

### Task
Make Desktop hygiene and low-impact computer-health enforcement mandatory for every controllable World_server AI session without creating a parallel subsystem.

### Root causes fixed
- `master-coordinator.cjs` dispatched agents without one shared pre/post session guard.
- `agent-adapters.js` used generic OS temp for disposable worktrees instead of the canonical LOCALAPPDATA worktree root.
- Remote bridge temporary patch/PR-body files used generic OS temp.
- Direct Desktop AI task startup had no mandatory zero-chaos preflight.

### Implemented
- Added shared `lib/agent-session-guard.js` driven by `data/desktop-ai-policy.json`.
- Enforced shared lifecycle for OpenCode, OpenHuman/direct Ollama, AnythingLLM, World Cloud AI, Codex, Claude Code/Desktop AI; browser-only agents receive the mandatory start/end contract.
- Worktrees now live under `%LOCALAPPDATA%\World_server_worktrees`; scratch/recovery under `%LOCALAPPDATA%\WorldServerAI`.
- Guard never terminates user/unrelated processes and deletes only proven owned, regenerable stale scratch.
- Future registered agents inherit the policy; unknown executable adapters fail closed.

### Evidence
- Focused regression suite: 47 PASS / 0 FAIL / 1 opt-in skip.
- `scripts/check-agent-rules.js`: PASS, including future-agent inheritance, off-Desktop roots, common guard coverage, and no-BOM shebang regression.
- Real-machine preflight/postflight: PASS; Desktop violations: 0; free RAM ~53%; free disk ~205 GB.
- Removed two stale owned AI goal temp files and the empty legacy temp-worktree root; no registered Git worktree was deleted.

### Completion
Commit and push this branch after final `git diff --check` / fast syntax gate.


## 2026-09-06 production evidence freshness hardening
- Root cause: production-quality-pull used only a 24h aggregate, so stale pre-deploy sessions could mask post-deploy reality; zero fresh sessions could be interpreted as a clean pass.
- Fix: evaluate a fresh 1h window separately from the 24h history and emit PASS / BLOCK / INCONCLUSIVE. Zero fresh sessions is INCONCLUSIVE; fresh FPS/load/error violations remain BLOCK.
- Regression: production-quality fresh-evidence + Node 24 tests 4/4 PASS; check:fast PASS.
- Live probe: freshSessions=0 => INCONCLUSIVE, proving the false-PASS path is closed.


---

# RUN_072 production port — 2026-09-06

## What / why
Port the already-verified RUN_072 science patch onto the current production master without importing its divergent history, and expose evidence through the existing production/API + remote-task infrastructure.

## Current state
Fresh branch from current `origin/master`; minimal RUN_062/066/071 dependencies + RUN_072 restored; current registry preserved and extended only with the RUN_072 protection entry.

## Target state
`/api/science-run072` returns immutable evidence in production; remote-task bridge can read the evidence and rerun RUN_072 by allowlisted scriptId; full verification runs in cloud CI.

## Tests
Focused RUN_072 tests, syntax checks, one deterministic experiment replay, and API smoke locally. Full CI/release in GitHub/cloud.

## Completion
Clean commit/push/PR, cloud checks, merge, existing production sync, then external HTTP 200 verification at `https://world-server.ai.studio/api/science-run072`.


---

# Universal Voxel Microdetail V2 — 2026-09-07

## Task
Advance the existing microdetail patch from standalone V1 into a production-integrated World_server V2 and commit it through an isolated AI branch/PR.

## Why
V1 had the right semantic profiles and hybrid geometry/shader idea, but it was still a ZIP installer rather than repository source, had no real browser integration evidence, and its physical detail decision was effectively tied to mesh build time rather than dynamic render proximity.

## Current state
Implemented in isolated off-Desktop worktree from `origin/master` db9e240. The current solution reuses the existing THREE renderers, WorldQualityAutopilot, world material/semantic/visibility systems and gameplay collision sources.

## Target state
Near surfaces show real cubic protrusions/dents; mid-distance surfaces use cheap shader microdetail; far/exact modes preserve base geometry. Animals, faces, scales, armor, weapons and fabric share semantic profiles, with explicit tagging available for ambiguous assets. Quality adapts without overriding the global tier ceiling.

## Files / systems involved
- `shared/microdetail-policy.json` — one policy source.
- `shared/graphics/universal-voxel-microdetail.js` — detail geometry + shader + local FPS hysteresis.
- `shared/graphics/universal-voxel-microdetail-bootstrap.js` — existing renderer hook and dynamic nearest-mesh selection.
- `lib/world-quality-microdetail-policy.js` — Node policy helpers.
- `scripts/world-microdetail-audit.js`, `test/world-microdetail.test.js`.
- bootstrap entries in `apps/voxel-world/index.html` and `apps/ai3d-voxel-city/index.html`.
- existing `scripts/world-quality-autopilot.js` + `package.json`.

## Risks / invariants
- Never change collision/occupancy because microdetail is visual only.
- Never runtime-retopologize SkinnedMesh; arbitrary animated assets use shader path.
- Water/glass stay smooth by policy.
- AI3D orthographic FRONT EXACT disables detail to preserve verifier fidelity.
- Do not create a second renderer, world, LOD stack or quality controller.
- Do not install optional dependencies without measured benefit.

## Exact patch plan
1. Centralize profiles/budgets/guards in shared policy JSON.
2. Build deterministic stepped-cube geometry from eligible exposed quad meshes.
3. Dynamically select only nearest eligible meshes and swap detail geometry only during render.
4. Apply semantic shader microdetail to Standard/Physical meshes, including animated assets without topology changes.
5. Wrap existing WorldQualityAutopilot registration so its tier is the detail ceiling and its stats include microdetail.
6. Add structural audit, tests, documentation and Desktop AI repair instructions.
7. Run focused + repository gates; fix root causes and add regressions before commit.

## Tests to run
- `npm run quality:world:microdetail`
- `node --test test/world-microdetail.test.js`
- `npm run check:fast`
- `npm run check`
- `npm run desktop-ai:check`
- `npm run golden:check`
- browser visual/performance verification if available without production deploy.

## Deployment / PR plan
Branch `ai/chatgpt/universal-microdetail-v2` -> PR to `master`. No direct master push, auto-merge or production deploy. GitHub CI/cloud verification is authoritative for heavy checks.

## Current progress
Core V2 runtime, policy, bootstrap integration, audit, tests and instructions are written. Focused verification is next; no production-ready/100% claim until browser evidence exists.

## Next action
Run syntax/policy/focused tests, inspect failures, fix until PASS, then run repository fast/full gates as resources permit. Commit/push only the validated source/docs/tests, not generated reports or `work/` scratch.

## Completion criteria
- source branch clean after commit;
- all microdetail structural/tests PASS;
- no gameplay client source changes required for this integration;
- PR opened with explicit known limitation that browser visual/FPS evidence is still required if not completed in this run;
- no accepted quality metric knowingly regresses.

## Final evidence
Pending current-run verification. `WORLD_MICRODETAIL_REPORT.json` is generated evidence and must not be committed unless repository policy explicitly tracks it.


### Final local evidence update — 2026-09-07
- UTF-8 mojibake regression found before commit, root cause was PowerShell text rewrite; file restored and reinserted byte-safely through Node UTF-8 I/O.
- Added regression that requires the original Russian `Картинка → город из кубиков` and forbids the observed mojibake marker.
- Shader injection hardened: world micro-position derives from `modelMatrix * vec4(transformed,1.0)` after Three.js transforms, not conditionally-declared `worldPosition`.
- Focused microdetail tests: 13/13 PASS.
- `quality:world:microdetail`: PASS, structural 100%, implementation 92%.
- Full repository test run before these two narrowly-scoped guards: 514 PASS / 0 FAIL / 2 opt-in skips.
- After final fixes: `check:fast` PASS, `golden:check` PASS, `git diff --check` PASS.
- Remaining evidence for 100% is browser visual/performance measurement in cloud/CI, not missing core architecture.


---

# Vercel Repair Agent bridge — 2026-09-07

## Task
Connect the existing zero-cost World Cloud AI (OpenCode + free-model failover) to Vercel commit failures so `world-server` build failures automatically become bounded repair tasks.

## Why
Vercel already posts commit statuses, but repair is manual. We need event-driven triage that distinguishes code/build failures from quota/rate-limit outages and only wakes the coding agent when code repair is justified.

## Current state
- Source of truth: `master` at `b7202e84` when this worktree was created.
- Existing `.github/workflows/world-cloud-ai.yml` already performs free-model implementation, verification, self-repair, branch push and PR creation.
- Vercel status on current master is `Deployment rate limited — retry in 24 hours` for `world-server` and two homepage projects.
- No local `VERCEL_TOKEN` or persisted Vercel CLI auth is present; the bridge must degrade safely without it.

## Target state
A failed `Vercel – world-server` commit status immediately triggers cloud triage. Quota/rate-limit/cancelled conditions produce a clean no-code result. Real build failures dispatch one focused task to the existing World Cloud AI. If repository secret `VERCEL_TOKEN` exists, private Vercel build logs are included automatically.

## Affected systems
- `.github/workflows/` — Vercel status bridge only.
- existing `world-cloud-ai.yml` — reused, not duplicated.
- `.github/scripts/` — pure status classifier used by workflow and tests.
- `test/` — regression coverage for quota-vs-code classification.

## Risks / invariants
- Never launch an AI repair for Vercel quota/rate-limit/external capacity failures.
- Never auto-merge a repair PR or push directly to `master`.
- Never expose `VERCEL_TOKEN`; it is optional and read only from GitHub Actions secrets.
- Avoid duplicate repair agents for the same Vercel status.
- Automatic scope is `Vercel – world-server`; other Vercel projects remain manual-dispatch capable to prevent three agents reacting to one commit.
- Bridge-only changes must remain non-deployable under the existing Vercel quota guard.

## Exact patch plan
1. Add a pure Vercel status classifier with external-limit/cancelled/build-failure classes.
2. Add an event-driven `status` + manual `workflow_dispatch` workflow.
3. Resolve the failed branch safely; stale deleted preview branches are skipped.
4. Optionally collect Vercel private logs when `VERCEL_TOKEN` exists.
5. Dispatch the existing `world-cloud-ai.yml` with bounded evidence and repair rules.
6. Add tests for rate limit, quota, generic build failure, unrelated status and cancellation.
7. Run focused tests + `npm run check` + agent/golden checks; then commit/push/PR for review.

## Tests to run
- `node --test test/vercel-failure-classifier.test.js`
- `npm run check`
- `npm run desktop-ai:check`
- `npm run golden:check`
- `git diff --check`

## Deployment / PR plan
This patch changes only `.github/`, `test/` and Markdown, so existing `scripts/check-vercel-ignore.js` should skip Vercel deployment for the bridge itself. Push branch `ai/chatgpt/vercel-repair-agent`, open PR to `master`, require normal review/CI, no automatic merge.

## Current progress
Isolated off-Desktop worktree created. Existing World Cloud AI and current Vercel status behavior inspected. Implementation is in progress.

## Next action
Write classifier + bridge workflow + tests, verify locally, then push to GitHub for cloud CI.

## Completion criteria
- Current rate-limit status classifies as external blocker and does not dispatch coding AI.
- Generic Vercel world-server build failure dispatches exactly one existing World Cloud AI run.
- Missing Vercel token is safe and non-fatal.
- Optional token path gathers logs without printing the token.
- Repository gates pass; PR is open for review.

## Final evidence
Pending verification and GitHub workflow test.


### Final evidence update — 2026-09-07
- Vercel classifier focused suite: **9/9 PASS**.
- Current real `Vercel – world-server` status `Deployment rate limited — retry in 24 hours.` classifies as `external-limit` with `shouldRepair=false`.
- Generic `Deployment has failed` classifies as `build-failure` with `shouldRepair=true`.
- Workflow YAML parses successfully.
- Existing Vercel quota guard confirms this bridge-only patch is non-deployable and will not consume a Vercel build.
- Full repository check: **552 PASS / 0 FAIL / 2 opt-in skips**.
- `desktop-ai:check`: PASS.
- `golden:check`: PASS.
- `git diff --check`: PASS.
- No local `VERCEL_TOKEN`/Vercel CLI auth exists; bridge safely degrades to GitHub evidence until repository secret `VERCEL_TOKEN` is configured.

## Final evidence
Implementation and local verification complete. Remaining proof is GitHub Actions parsing/execution after push plus a manual current-rate-limit workflow dispatch; no code repair should be launched for that external blocker.

## Vercel Hobby 12-function blocker — 2026-09-07
- Goal: make current master deployable on Vercel Hobby for immediate real testing.
- Root cause: current api/ has 14 serverless JS functions; Hobby hard limit is 12.
- Minimal fix: move register/login/me/logout handlers under lib/api-handlers and route their unchanged public URLs through one api/auth.js function.
- Invariants: preserve auth behavior and URLs; keep local server routes; add regression guard api/*.js <= 12; no Desktop scratch.
- Completion: focused/full checks -> PR -> required green checks -> merge -> exactly one Vercel preview -> browser smoke.
- Evidence: api/*.js reduced 14 -> 11; focused Vercel limit tests 3/3 PASS; JS syntax, agent rules and Golden Standard PASS.
- Remaining: cloud CI, merge, one Vercel preview and browser smoke.
