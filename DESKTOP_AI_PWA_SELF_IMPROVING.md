# DESKTOP AI — WORLD_SERVER PWA SELF-IMPROVING V4 MAX

## Mission
Install/upgrade V4 in the real `World_server`, finish all runtime integrations, test the actual deployed preview, and keep repairing until every reproducible error and regression is gone. Do not stop after copying files, generating a report, or obtaining a partial green result.

## Absolute rule — never stop on an unresolved error
**DO NOT REPORT COMPLETION WHILE ANY REPRODUCIBLE ERROR, FAILED GATE, UNRESOLVED INTEGRATION, REGRESSION, OR VISUAL DEGRADATION REMAINS.**

`BLOCKED_UNRESOLVED` and `MAX_ROUNDS_UNRESOLVED` are not completion. They are instructions to:
1. inspect the failing command and logs;
2. identify root cause;
3. repair root cause without deleting/simplifying working graphics;
4. add/update regression protection;
5. rerun the affected test and `npm run quality:converge:full`;
6. repeat until status is `CLEAN`.

Never lower baselines, disable hard tests, hide errors, add `|| true`, or use `continue-on-error` to fake green.

## Safe installation
1. Read `AGENTS.md`, `DESKTOP_AI_INSTALL_AND_VERIFY.md`, this file, `PWA_SELF_IMPROVING_SYSTEM.md`, `WORK_IN_PROGRESS.md`.
2. Update `WORK_IN_PROGRESS.md` before editing: current state, target, risks, patch plan, tests, deployment/PR plan, errors that must not return, progress, final evidence.
3. Start from latest `master`, clean worktree. Never work directly on `master`.
4. Run:
   `node install-pwa-self-improve.cjs "C:\Users\user\Desktop\World_server"`
5. If installer reports a stale/unknown managed file, preserve the newer code and semantically rebase V4 onto it. Never force overwrite.

## Mandatory V4 integration
Run:
- `npm run pwa:integrate-runtime`
- `npm run pwa:discover-integration`
- `npm run assets:quality`
- `npm run assets:transcode`
- `npm run animation:check`
- `npm run pwa:check`

For every certified Three.js renderer, verify:
- adaptive DPR/quality controller connected;
- shader prewarm + frame-stutter profiler connected;
- predictive camera-aware streaming connected where streaming exists;
- original shadow state preserved;
- renderer integration is idempotent.

For `voxel-world`, verify `WORLD_SERVER_PREDICTIVE_CHUNK_CENTER` exists and predicted center is clamped so the player area cannot be abandoned.

## Free CPU asset pipeline — no GPU required
1. Run `npm run assets:toolchain` to install exact free CPU tools from `data/asset-toolchain-lock.json`.
2. Run `npm run assets:transcode:apply`.
3. Inspect `CPU_ASSET_TRANSCODE_REPORT.json` and `data/derived-asset-map.json`.
4. Original PNG/JPG/GLB/GLTF files MUST remain untouched.
5. Promote derivatives only after load test + visual/perceptual regression PASS.
6. Never downscale/delete/decimate source masters merely for FPS.

Expected technologies: KTX2/Basis derivatives for textures and Meshopt/KTX2 derivatives for glTF where compatible.

## Telemetry-driven quality learning
1. Apply `supabase/migrations/20260824053000_quality_telemetry_v4.sql` through the normal Supabase migration path.
2. Verify `/api/quality-telemetry`, `/api/quality-summary`, `/api/quality-profile`.
3. Verify no user identity/email/account id is stored in quality telemetry.
4. Verify learned server recommendation cannot raise quality above device capability safety ceiling.
5. Test weak evidence -> performance/balanced and strong sustained evidence -> high/ultra only when thresholds pass.

## Semantic rigs / weapons / shields
Run `npm run animation:check` and `npm run pwa:discover-integration`.

For every relevant character rig, connect the real state provider with `WorldServerRigAdapters.registerThreeCharacter(root,{stateProvider,...})`. Structural discovery alone is not semantic proof.

Mandatory contracts:
- feet face movement direction;
- sword strike/shot follows feet/facing direction;
- pistol remains in the hand;
- rifle/machine gun remains in two hands;
- shield stays in front of torso;
- shield stays vertical;
- shield covers the certified chest/abdomen threshold when measurable.

Do not claim 100% relevant-rig coverage until every discovered relevant rig has runtime sampling and a regression test.

## Mandatory local verification
Repair and repeat until all green:
- `npm ci`
- `npm run pwa:integrate-runtime`
- `npm run assets:quality`
- `npm run assets:transcode`
- `npm run pwa:check`
- `npm run animation:check`
- `npm run check`
- `npm run quality:converge:full`
- `npm run release:gate`

Also run every Golden/gameplay/physics/control test affected by changed apps. One unrelated green test is not evidence.

## Mandatory deployed verification
1. Push task branch and create immutable Vercel preview.
2. Use `PLAYWRIGHT_BASE_URL=<exact preview>`; localhost is forbidden as preview evidence.
3. Run Chromium + `mobile-webkit`, including `e2e/ios-pwa-runtime.spec.js`.
4. Verify manifest, Service Worker, offline shell, update path, install metadata, controls, collisions, rendering, no console errors and no stale SW.
5. Run `post-deploy-smoke.js` against preview.
6. Open PR only after gates pass. Medium/high risk requires normal review.
7. After production promotion run post-production smoke. Failure must trigger Vercel rollback; quiet autonomous patch also triggers code-revert lane.

## Physical iPhone truth
WebKit emulation is mandatory but **not** physical-iPhone evidence.

After production traffic exists, run:
- `npm run quality:ios-evidence`
- optionally strict: `npm run quality:ios-evidence:strict`

Interpretation:
- `NO_REAL_IOS_EVIDENCE` = physical evidence pending;
- `REAL_IOS_BROWSER_EVIDENCE` = real iOS sessions exist, but installed-PWA evidence not yet seen;
- `REAL_IOS_PWA_EVIDENCE` = real iOS + standalone PWA telemetry exists.

If a physical iPhone is available, verify Safari → Share → Add to Home Screen, launch from icon, touch, rotation if supported, reload/update, offline shell, resume, FPS/frame pacing/input latency and no WebGL context loss.

## Final evidence required before saying DONE
Return:
- branch, commit SHA, PR;
- exact preview URL; production URL if promoted;
- convergence status `CLEAN`;
- PWA gate percentage;
- renderer/shader/predictive integration coverage;
- relevant semantic-rig coverage;
- asset toolchain/transcode status;
- Chromium PASS;
- mobile WebKit PASS;
- physical-iPhone evidence status truthfully;
- release gate PASS;
- post-deploy smoke PASS;
- unresolved errors = 0;
- regressions = 0;
- remaining genuinely unimplemented/configuration-dependent systems.

Never report 100% based only on files existing. Percentages require runtime/test evidence.
