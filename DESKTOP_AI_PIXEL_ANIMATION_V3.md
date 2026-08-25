# DESKTOP AI — PIXEL ANIMATION SYSTEM V3 INSTALL / VERIFY

## Task
Install Pixel Animation System V3 into World_server without deleting/simplifying existing graphics. V3 must become the preferred scalable path while V2 fallback remains intact.

## What is already live on Supabase
- Project is healthy.
- Runtime policy `default` = **version 3**.
- 17 animation profiles enabled.
- `pixel-animation-config` = **version 3 ACTIVE**.
- `pixel-animation-telemetry` = **version 2 ACTIVE**, `verify_jwt=true`.
- `pixel_animation_atlas_manifests` supports `layers` + `streaming`.
- `pixel_animation_device_baselines` exists with RLS and explicit deny-all client policy.
- `pixel_animation_learned_policy` exists with RLS and read-only enabled-policy access.
- Modern `sb_publishable_*` and `sb_secret_*` keys are handled without treating them as JWT Bearer tokens.
- Security/Performance Advisor has no remaining pixel-animation-specific structural security issue; the two speculative V3 `updated_at` indexes were removed as unused.

## V3 systems to integrate
1. GPU compute culling + indirect drawing on eligible WebGPU high/ultra scenes.
2. Multi-atlas texture arrays and stream-ahead loading.
3. Procedural region/mask rig for localized pixel deformation.
4. Pipeline/backend warm-up and failure/success cache.
5. Animated visual regression across deterministic frame sequences.
6. Device FPS baseline collection and bounded learned quality policy.
7. Safe idempotent auto-integration for explicitly marked world/game canvases.
8. Existing V2 WebGPU/WebGL2/Canvas2D, Pixi adapter, worker, 17 profiles, LOD, culling, adaptive quality remain mandatory fallbacks.

## Golden systems that must be preserved
- All accepted artwork, texture detail, lighting, shadows and existing visual style.
- Pixel-perfect nearest-neighbor rendering.
- Existing controls, camera, collision, physics and mobile input.
- Existing game mechanics and content.
- Golden Standard/release gates and deny-by-default release behavior.
- No direct edit/push to production branch.

## Errors that must not return
- One timer/RAF/DOM/canvas per ambient object.
- Per-object texture upload/draw-call explosion where atlas/instancing can batch.
- Linear filtering/blurry pixel art.
- Full-rate updates for off-screen/far objects.
- GPU visible-buffer overflow or indirect instance count > `maxVisible`.
- Texture-array layer mismatch or reading wrong atlas page.
- WebGPU-only implementation with no WebGL2/Canvas2D fallback.
- Treating Node tests as proof that WGSL/WebGPU works on real devices.
- Unbounded self-learning that can alter quality more than policy permits.
- Anonymous/raw telemetry writes to baseline tables.
- Storing raw user-agent/device strings in learned baseline rows.
- Sending `sb_publishable_*` or `sb_secret_*` as a JWT Bearer token.
- Auto-integrator modifying arbitrary UI canvases; only marked world/game canvases are eligible.
- Any change that breaks controls, collision, camera, graphics, existing animation or mobile input.

## Exact patch / change plan
1. Read `AGENTS.md`, `DESKTOP_AI_INSTALL_AND_VERIFY.md`, this file and current `WORK_IN_PROGRESS.md`.
2. Pull latest accepted base. Create `ai/desktop/pixel-animation-system-v3` (timestamp suffix if needed). Never modify `main`/`master` directly.
3. Record baseline: git status, current release gate, current runtime/browser errors, representative screenshots/FPS.
4. Run V3 `install.cjs` from repo root. Installer is additive and preserves V2 fallbacks.
5. Review auto-integrator report. It may modify only HTML containing `canvas[data-pixel-animation]`, `canvas[data-world-canvas]`, `canvas#game`, or `canvas#world`. Any other modified HTML is a failure: revert root cause and fix installer.
6. Run structural + unit + animated regression + 50k benchmark.
7. Run `supabase migration list`; reconcile exact live V3 migrations. Do not duplicate already-applied DDL and never use migration repair without proving the actual schema/history mismatch.
8. Fetch `pixel-animation-config` v3. Verify 17 profiles, policy v3, atlas `layers/streaming`, V3 capabilities and optional learned policy.
9. Authenticated-only telemetry smoke: send a bounded synthetic/real FPS summary using a real signed-in test user. Verify baseline row updates and learned policy only after >=20 samples. Verify unauthenticated call is rejected.
10. Run `npm run quality:impact`, `npm run release:gate`, plus all project-specific tests.
11. Browser/device matrix: desktop WebGPU, forced WebGL2, forced Canvas2D; mobile/Safari-compatible fallback. Test 1k/5k/10k/20k/30k desktop and 500/1500/3000/6000/9000 mobile where practical.
12. Validate compute path on eligible WebGPU scenes: culling mode reports `gpu-compute`, visible count is bounded, indirect draw works, no validation error/device loss.
13. Validate texture arrays: correct page/layer for sprites, layer 0 remains backward-compatible, stream-ahead never blurs/replaces source art.
14. Run animated visual regression against accepted V2/V3 references and inspect actual screenshots; synthetic signature PASS alone is insufficient.
15. Inspect console, network, runtime logs, Vercel preview logs, Supabase function logs and performance traces.
16. For EVERY error/regression: identify root cause -> fix full root cause -> add regression protection -> rerun failed check -> rerun its parent gate -> rerun release gate when affected.
17. Continue searching after first PASS. Stop only when all mandatory failures/errors/regressions are gone, or a truly external blocker is recorded with exact evidence.
18. Commit, push task branch, open PR, verify CI + preview on desktop/mobile. Promote only after evidence passes.
19. Replace `WORK_IN_PROGRESS.md` Final evidence with exact branch, commit, PR, preview, tests, FPS, browser/backend/device matrix and remaining blockers.

## Tests to run
- `node --check shared/pixel-animation-engine.js`
- `node --check shared/pixel-animation-webgpu.js`
- `node --check shared/pixel-animation-gpu-culling.js`
- `node --check shared/pixel-animation-multi-atlas.js`
- `node --check shared/pixel-animation-region-rig.js`
- `node --check shared/pixel-animation-pipeline-cache.js`
- `node --check shared/pixel-animation-device-learning.js`
- `node scripts/pixel-animation-verify.js`
- `node --test test/pixel-animation-engine.test.js test/pixel-animation-v2.test.js test/pixel-animation-v3.test.js test/pixel-animation-syntax.test.js`
- `node scripts/pixel-animation-visual-regression.js`
- `node scripts/pixel-animation-benchmark.js 50000 300`
- `node scripts/pixel-animation-auto-integrate.js .` and immediately verify idempotency by running it a second time (`changed` must be 0).
- `supabase migration list`
- config v3 GET validation
- authenticated telemetry POST + unauthenticated rejection
- `npm run quality:impact`
- `npm run release:gate`
- browser lab + forced backend matrix + actual screenshots/FPS/console checks.

## Current evidence before repository install
- Patch suite: **20/20 PASS**.
- Animated regression: **8/8 PASS**.
- Latest 50k spatial benchmark: **~0.065 ms/query** in patch environment.
- V3 policy: live.
- Config function v3: ACTIVE.
- Telemetry function v2: ACTIVE + JWT verification.
- 17 profiles: live.
- RLS: live on V3 telemetry/learning tables.
- New V3 security-advisor issue: fixed with explicit deny policy.
- New V3 unused-index advisor issues: fixed by removing speculative indexes.
- Repository/PR/preview/device GPU evidence: NOT COMPLETE because this chat currently sees 0 accessible GitHub repositories.

## Completion criteria
- 0 mandatory test failures.
- 0 new browser console/network/runtime errors.
- 0 accepted graphics/control/physics/mobile regressions.
- Real WebGPU compute/indirect path proven on at least one supported browser/device.
- Forced WebGL2 and Canvas2D fallbacks proven.
- Multi-atlas layers visually correct.
- Auto-integrator is idempotent and touches only marked game/world canvases.
- Telemetry rejects unauthenticated requests; modern/legacy Supabase keys both work correctly.
- Full parent release gate PASS.
- Task branch + PR + preview + device evidence exist before production promotion.

## Non-stop error rule
Desktop AI MUST NOT stop because an installer, unit test, CI job or one browser passed. It must continue looking for test failures, console/network/runtime errors, WGSL validation errors, device loss, wrong atlas layers, visual regressions, FPS regressions, fallback failures, telemetry/auth errors and integration gaps. For every issue it must find the root cause, fix it, add regression protection where applicable, rerun the failed test and the complete parent gate, then continue checking until no mandatory error remains. A proven external blocker may be documented, but it never permits claiming 100% completion.
