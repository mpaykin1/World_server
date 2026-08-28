# WORK IN PROGRESS — PIXEL ANIMATION SYSTEM V3

## Task
Integrate and verify additive V3: GPU compute culling, indirect draw, multi-atlas arrays/streaming, region rig, pipeline cache/warm-up, animated regression, authenticated device learning and safe auto-integration while preserving V2 fallbacks and all existing game quality.

## Why
The V2 renderer scales well, but very large scenes still benefit from removing CPU visibility work, reducing atlas swaps, localizing deformation and learning conservative device budgets from real evidence.

## Current state
- Server V3 policy/tables/functions are live.
- Patch local suite: 20/20 PASS; animated regression 8/8 PASS; 50k spatial query ~0.065 ms/query latest run.
- Supabase V3 advisor findings caused by this patch were fixed (explicit deny policy; unused speculative indexes removed).
- Actual World_server repo/PR/browser-device integration is pending because connected GitHub currently exposes 0 repositories here.

## Target state
Task branch integrated; all project gates PASS; WebGPU compute + indirect draw validated on real browser; WebGL2/Canvas2D fallbacks validated; correct atlas layers/streaming; telemetry auth/learning proven; zero accepted regressions; PR/preview/device evidence recorded.

## Files / systems involved
`shared/pixel-animation-*.js`, `shared/pixel-atlas-builder.js`, `scripts/pixel-animation-*.js`, `test/pixel-animation-*.test.js`, `tools/pixel-animation-lab/index.html`, V1/V2/V3 Supabase migrations, config + telemetry Edge Functions, `data/golden-components.json`, package scripts.

## Known risks
Real WGSL validation/device behavior cannot be proven by Node tests. Texture-array limits vary by device. Learned policy must stay bounded. Auto-integration must never touch unrelated canvases. Migration history must match already-live production DDL.

## Golden systems that must be preserved
Existing art/detail/light/shadows, nearest-neighbor pixel integrity, controls, camera, physics, collision, mobile input, content/mechanics, Golden release gates, deny-by-default release policy.

## Errors that must not return
Per-object timers/RAF/canvases; blurry filtering; unbounded visible buffers; wrong atlas layer; WebGPU-only dependence; anonymous telemetry; modern Supabase secret/publishable Bearer misuse; unbounded learning; arbitrary canvas mutation; false 100% claim without device evidence.

## Exact patch / change plan
Use `DESKTOP_AI_PIXEL_ANIMATION_V3.md` as authoritative. Create task branch; baseline; run installer; review auto-integration; reconcile migrations; run all V3 tests/project gates; test config/telemetry; run real backend/device matrix; fix root causes and add regression tests; rerun parent gates; PR/preview; promote only after evidence.

## Tests to run
`node scripts/pixel-animation-verify.js`; full 4-file Node test suite; visual-regression script; 50k benchmark; auto-integrator twice for idempotency; migration/config/telemetry checks; `quality:impact`; `release:gate`; real browser/backend/device matrix.

## Deployment / PR plan
Task branch -> full local gates -> push -> PR -> CI -> preview -> real browser/device evidence -> promotion. Never direct-push production branch.

## Current progress
Server V3 100%; patch code/tests 97%; actual repository integration/device evidence pending.

## Next action
Desktop AI installs this ZIP into actual World_server and executes the authoritative V3 instruction until every mandatory error/regression is fixed.

## Completion criteria
0 mandatory failures/errors/regressions; validated WebGPU compute + WebGL2 + Canvas2D; correct multi-atlas; safe learning/auth; idempotent targeted integration; release gate PASS; PR/preview/device evidence present.

## Final evidence
NOT COMPLETE until Desktop AI records exact branch/commit/PR/preview, all gate outputs, browser/device/backend FPS evidence and zero-error confirmation.

## Non-stop error rule
Do not stop at first PASS. Find every root cause, fix it, add regression protection, rerun the failed test and its complete parent gate, and continue until no mandatory error remains. External blockers must be proven and documented and do not justify claiming completion.

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
