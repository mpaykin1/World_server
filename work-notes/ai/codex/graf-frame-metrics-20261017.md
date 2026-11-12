# GRAF Evolution — passive frame evidence

## Task
Issue #524: deliver Codex's first independent FPS/frame-time/draw-call measurement slice while diagnosing CI in parallel. Owner verdict pending.

## Why
Claude owns HybridLOD (PR #525); ChatGPT owns Sunken City. Measurements must remain available when Actions cannot start, without changing the accepted graphics or duplicating a quality controller.

## Current state
- Base master: `c6d0e116a5e3f8c06f8f1ed82167e85af3693f52`; clean canonical checkout, no extra worktree.
- Read AGENTS.md, DESKTOP_AI_INSTALL_AND_VERIFY.md, PR #525 source at `d6b6a2c6ab42e1121cf832e732bca32822967c95`, graf discovery branch `9771388532fabc4a5ee3c560f9aeedf544a970c1`, and full public meta6/graf.md.
- Issue #524/PR API blocked by cloud proxy; public issue HTML unavailable. User's supplied division of work and fetched branch code establish scope; full issue discussion still needs the connected browser ChatGPT.
- Existing GoldenQualityDirector/WorldQualityAutopilot collect smoothed/clamped control signals and change quality. PR #519's `b58b1ec4` fixes Island-specific wall-time adaptation/shader wind and has a game probe. None is a passive bounded raw evidence collector.
- Existing dependencies/Node/Chromium/Python Playwright reused. No installation or reauthorization.

## Target state
Standalone passive collector, deterministic tests, real local WebGL counter evidence and a repeatable script. Separate branch/PR, no merge or production link.

## Files / systems involved
New `shared/graphics/frame-metrics.js`, `test/graf-frame-metrics.test.js`, bounded local browser measurement script, usage/evidence documentation and this branch-specific work note. Do not edit Claude's LOD, ChatGPT's Sunken City, games, quality controllers, release rules or billing/settings.

## Known risks
RAF intervals are not GPU/CPU durations; software Chromium is not an iPhone benchmark. Three.js auto-reset counters can expose only the last pass. Caller must supply full-frame aggregates. Full repo tests contain known canonical Git side effects; do not execute those on the working repository. Mandatory checks remain required before merge.

## Golden systems that must be preserved
Existing quality directors, native render loop/composer/controls, certified registry, performance budgets, graphics and gameplay baseline. Collector has no RAF, DOM, renderer wrapping, networking or quality mutation.

## Errors that must not return
Timestamp zero must work; use uncapped wall time; retain long visible stalls; FPS is count/elapsed rather than mean instantaneous FPS; no fabricated zero draw counts; bound the sample ring; do not count a hidden pause as render time after explicit discontinuity.

## Exact patch / change plan
1. Add passive browser/CommonJS collector with explicit frame sampling, snapshots, discontinuity and reset.
2. Unit-test traces, raw percentiles, counter coverage and bounds.
3. Measure a real Three r160 fixture using existing Chromium with a virtual origin (no new server); verify two passes versus last-pass counters and rendered pixels.
4. Save raw measurements and reproducible command; record CI evidence separately from local results.
5. Commit/push, attempt PR and coordination comment when API permits; otherwise save exact publication/review payloads for connected browser ChatGPT.

## Tests to run
Focused collector tests; real WebGL measurement on desktop/mobile-sized viewports; check-js, architecture, desktop protocol, MF/IndieWorlds and diff checks. Full release/required checks are not waived or claimed. Existing HybridLOD can be tested read-only in memory if needed, not copied into this PR.

## Deployment / PR plan
Branch `ai/codex/graf-frame-metrics-20261017`, PR into master. Request Claude review in PR. Link results in existing issue #524. No merge, Actions rerun loop, service creation or paid tool. CI API block must not stall the local slice.

## Current progress
Session preflight passed: zero active worktree tails/dirty worktrees/pending external tasks; resource checks passed. Collective-brain route and recall ran; local fallback read, global risk report requires peer review. Collector + 13 tests implemented. Real WebGL captures on both viewports completed; raw JSON/source hashes/screenshots saved. Syntax/architecture/MF/IndieWorlds/desktop protocol checks passed; impact graph found no existing consumers. No original game/controller, Claude or ChatGPT file changed.

## Next action
Connected browser ChatGPT: create the prepared draft PR, post the saved #524 checkpoint update and request Claude review using the exact text in docs/GRAF_FRAME_METRICS.md. Then verify current CI steps/settings. No merge.

## Completion criteria
Useful code + automated tests + actual measurements + reproduction recipe + pushed SHA + PR/coordination publication, or an explicit externally blocked publication handoff. Independent Claude review/owner verdict remain separate; no self-assigned PASS/FAIL.

## Final evidence
- `node --test test/graf-frame-metrics.test.js`: 13 passed, 0 failed/skipped.
- Real Three r160 / Chromium154 / ANGLE SwiftShader: each viewport 960×540 and 390×844 had 60 intervals over 1000 ms, observed 60 FPS, p50/p95 ~16.70 ms, two-pass 2 calls/24 triangles versus last-pass 1/12. Nonempty RGB pixel readback, screenshots, zero browser/WebGL errors.
- Raw evidence in `docs/evidence/graf-frame-metrics-20261017/`; source hashes match current collector and runner. Recipe/API/limitations in `docs/GRAF_FRAME_METRICS.md`. No game/device FPS gain is claimed.
- 88-file syntax, architecture, MF, IndieWorlds, desktop protocol and diff checks passed. Existing impact graph: no affected consuming apps. Generated baseline reports were restored byte-for-byte rather than mixed into this PR.
- Full `npm run check`/release gate not run: older canonical Git/worktree side effects must be isolated first; required checks/review remain outstanding before any merge. No policy bypass.
- CI fact: API CONNECT 403 from Envoy before TLS; current jobs/steps/Actions settings/runners/limits unknown. Historical PR #520 billing evidence does not establish PR #525's current cause. No reruns or paid changes.
- Code/tests/evidence pushed as `116ae84a2e564e35cddab8c6341c034f2100ef70`. One draft PR attempt and one issue #524 comment attempt each returned GraphQL Forbidden; neither publication succeeded. Exact publication/review/ordinary-browser-ChatGPT continuation text is saved in `docs/GRAF_FRAME_METRICS.md`.
- Independent Claude review and owner verdict pending. No merge/deployment/paid service or new server. Session-owned scratch captures removed after byte-identical archival into docs/evidence; no extra worktree was created.
