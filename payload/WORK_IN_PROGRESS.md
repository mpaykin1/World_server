# WORK IN PROGRESS — PWA SELF-IMPROVING V4 MAX

## Task
Install/upgrade V4 and fully connect PWA, adaptive graphics, shader/stutter profiling, predictive streaming, CPU asset derivatives, learned quality profiles, semantic rigs, WebKit/real-iOS evidence, quiet self-improvement and rollback.

## Why
V3 had strong PWA/convergence foundations but lacked fully connected CPU transcode tooling, production-learned profiles, explicit shader-stutter control, real-iOS evidence separation, and had a rig-adapter signature mismatch plus local `/data`/quality-profile routing gaps.

## Current state
Patch package prepared. Production remains unchanged until task-branch gates and deployed verification pass.

## Target state
- local + deployed PWA gates PASS;
- renderer/shader/predictive integration complete for certified compatible renderers;
- relevant rigs registered/tested;
- CPU derivative pipeline available without GPU and preserves originals;
- telemetry migration applied through normal migration path;
- learned quality API functioning;
- Chromium + mobile WebKit preview PASS;
- production smoke PASS;
- real-iOS evidence reported truthfully;
- convergence `CLEAN`, unresolved errors 0, regressions 0.

## Errors that must not return
False-green localhost preview; V3 `registerRig(id, fn)` signature mismatch; local server missing `/data` or `/api/quality-profile`; profile oscillation; server recommendation bypassing device ceiling; destructive source-asset replacement; prediction abandoning player chunks; shader compilation stutter ignored; WebKit emulation claimed as real iPhone; unresolved blocker reported as done.

## Exact patch / change plan
1. Safe V2/V3/base upgrade on task branch.
2. Integrate renderer + shader/stutter + predictive streaming + rig scan.
3. Generate asset manifests; bootstrap/apply free CPU derivatives when candidates exist.
4. Apply additive V4 telemetry migration.
5. Run local convergence/release gates until CLEAN.
6. Deploy exact preview; Chromium + WebKit + smoke.
7. PR/canary; production smoke; collect real-iOS evidence.
8. On any failure: root-cause fix + regression test + repeat; never declare completion while unresolved.

## Tests to run
`npm ci`; `npm run pwa:integrate-runtime`; `npm run assets:quality`; `npm run assets:transcode`; `npm run pwa:check`; `npm run animation:check`; `npm run check`; `npm run quality:converge:full`; `npm run release:gate`; deployed Playwright Chromium/WebKit; post-deploy smoke; `npm run quality:ios-evidence` after production.

## Deployment / PR plan
No direct master push. Task branch -> exact Vercel preview -> browser/smoke gates -> PR -> canary/promotion. Quiet auto-merge remains low-risk-only. Production failure -> Vercel rollback; quiet patch -> code revert lane.

## Completion criteria
All mandatory gates PASS, `QUALITY_CONVERGENCE_REPORT.status=CLEAN`, unresolved errors 0, regressions 0, evidence recorded, physical-iPhone status stated without guessing.

## Final evidence
Fill only after real installation/deployment verification. Do not fabricate.
