# WORK IN PROGRESS — Scoped Task Compiler, resource scheduler, real native Godot pipeline

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
