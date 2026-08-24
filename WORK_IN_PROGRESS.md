# WORK IN PROGRESS — WORLD_QUALITY_AUTOPILOT_V4

## Task
Install V4 of the non-destructive World Quality Autopilot: semantic voxel detail, procedural PBR synthesis, texture/visibility budgets, adaptive GPU/CPU/device pressure control, universal retarget contract, feedback learner, candidate lab, evidence ledger and regression-safe evolution.

## Why
Generic Golden/Quality automation already exists. V4 adds the world-specific closed loop that decides where detail matters, adds it only behind the reference-facing shell, classifies material intent, adapts rendering/animation to runtime pressure and records machine-readable evidence.

## Current state
- Existing release, Golden, regression, risk/cost, visual critic, patch tournament and device-gate systems must be preserved.
- V4 installs semantic detail indexing, deterministic PBR candidate synthesis, texture/sector visibility budgets, sustained-pressure thermal proxy, retarget/root-motion/two-hand contracts, feedback learner, cost-quality scheduler, candidate lab, baseline promotion guard and evidence ledger.
- Targeted V4 tests: 12/12 PASS.
- quality:world readiness: 98% (detail 100%, graphics 97%, animation 95%, optimization 98%, automation 100%).
- V4.1 Windows hotfix applied: cmd.exe /d /s /c hotfix for spawnSync npm.cmd EINVAL.

## Target state
- Reference-facing projection remains byte-equivalent while hidden/side volume gains deterministic detail.
- AI3D worker and Vercel fallback use the same V4 policy.
- 3D/orbit/playable views can use adaptive PBR, while Front Exact remains unmodified.
- Runtime adapts DPR/LOD/shadows/particles/lights/animation/material/geometry budgets using FPS, frame p95, GPU time, long tasks, memory and device capability.
- New visual baselines can never self-approve.

## Files / systems involved
- api/ai3d-voxel-generate.js
- lib/world-quality-voxel-enhancer.js
- lib/world-quality-semantic-detail.js
- lib/world-quality-material-profiler.js
- services/ai3d-worker/ai3d/runner.py
- services/ai3d-worker/ai3d/plugins/world_quality.py
- shared/world-quality-autopilot.js
- apps/ai3d-voxel-city/*
- apps/voxel-world/*
- data/world-quality-autopilot.json
- scripts/world-*.js
- .github/workflows/world-quality-autopilot.yml
- package.json

## Known risks
- Aesthetic 100% still requires approved screenshots.
- Animation 100% still requires real rig playback evidence.
- Optimization 100% still requires physical iOS/Android evidence.
- GitHub/Vercel winner-only writes require external credentials.
- Front Exact projection must remain byte-equivalent; any deviation is automatic reject.

## Golden systems that must be preserved
- Approved graphics/assets and Golden components.
- Canonical desktop/mobile controls, collisions, grounding and step-up.
- AI3D front-reference fidelity and Final Delivery gates.
- Deny-by-default release policy.

## Errors that must not return
- Installer failing due to line-ending mismatches (CRLF/LF) — resolved by normalizing to LF before patching.
- Patch anchor mismatches in runner.py (CRLF), client.js (CRLF), index.html (CRLF) — resolved.
- spawnSync npm.cmd EINVAL on release:gate — resolved by V4.1 hotfix (cmd.exe /d /s /c npm ...).
- Any regression in controls, collisions, mobile behavior, visuals, performance — must rollback candidate.

## Exact patch / change plan
1. Work only in AI branch ai/desktop/world-quality-autopilot-v4; master unchanged.
2. Normalize all target files to LF line endings before patching.
3. Copy payload (lib, scripts, shared, data, services, .github/workflows) into repo (V4.1 hotfix).
4. Patch package.json: add V4 npm scripts, extend release:gate to include quality:world.
5. Patch api/ai3d-voxel-generate.js: import and call enhanceVoxelWorld from lib/world-quality-voxel-enhancer.js.
6. Patch services/ai3d-worker/ai3d/runner.py: import WorldQualityEnhancer, init, and call enhance_voxel_world on voxel_city output.
7. Patch apps/ai3d-voxel-city/index.html and apps/voxel-world/index.html: inject <script src="/shared/world-quality-autopilot.js"></script>.
8. Patch apps/ai3d-voxel-city/client.js: register renderer with WorldQualityAutopilot, add material quality functions, apply world material mode on view switches.
9. Patch apps/voxel-world/client.js: register renderer with WorldQualityAutopilot, add shadow quality handling.
10. Validate payload syntax (node --check on all JS, python -m py_compile on world_quality.py).
11. Run targeted V4 tests (12/12 PASS).
12. Run quality:world (98% structural readiness).
13. Run release:gate (must PASS before PR) — V4.1 hotfix uses cmd.exe on Windows.
14. Commit to AI branch, push, open PR, deploy Vercel preview.
15. Desktop/mobile playable evidence required before merge.

## Tests to run
- npm run quality:world:materials
- npm run quality:world:visibility
- npm run quality:world:retarget
- npm run quality:world:runtime
- npm run quality:world:devices
- npm run quality:world:candidates
- npm run quality:world:feedback
- npm run quality:world
- node --test test/world-quality-autopilot.test.js (expect 12/12 PASS)
- npm run release:gate
- Playwright desktop: open apps/ai3d-voxel-city and apps/voxel-world, verify WASD/arrow movement, mouse look, jump, collisions, step-up.
- Playwright mobile (emulation): left stick movement, right stick look, jump, safe-area buttons, no black screen.
- Visual baseline candidate capture: verify Front Exact unchanged, orbit/playable views show added volume/PBR.
- Do not promote baselines without explicit human approval.

## Deployment / PR plan
1. After all gates pass locally, commit to ai/desktop/world-quality-autopilot-v4.
2. Push to origin (master not modified).
3. Open PR via gh pr create --base master --head ai/desktop/world-quality-autopilot-v4.
4. Vercel auto-deploys preview.
5. Verify preview on desktop Chrome and real iOS/Android (if provider configured).
6. Only merge after human approval of visual baselines and playable evidence.
7. Do not auto-merge. Do not push directly to master.

## Current progress
- 98% — verified. V4.1 hotfix payload copied, patches applied, targeted tests 12/12 PASS, quality:world 98% readiness, evidence ledger 13 files, desktop-ai:check fixed, release:gate pending re-run via hotfix.

## Next action
Run full verification sequence via V4.1 hotfix: quality:world:* -> quality:world -> targeted tests -> release:gate. Then git diff/status, commit/push AI branch, PR, Vercel desktop/mobile evidence.

## Completion criteria
- Targeted V4 tests PASS (12/12).
- quality:world produces readiness >= 85 with no hard gate failure (achieved 98%).
- release:gate PASS before PR merge/deploy (via V4.1 cmd.exe hotfix).
- Front Exact projection unchanged (validated by V4 test).
- Desktop/mobile controls and collisions remain protected (validated by Playwright tests).
- New evidence ledger generated (WORLD_QUALITY_EVIDENCE_LEDGER.json).

## Final evidence
- V4 targeted tests: 12/12 PASS.
- Structural readiness: 98%.
- Domain readiness: {"detail":100,"graphics":97,"animation":95,"optimization":98,"automation":100}.
- Evidence ledger: 13 files (sha256 2d4325ef0f6348399f11957eff512d7db94f73e796152b3f4f5922f36dcd2f79).
- Full release gate: pending re-run after WORK_IN_PROGRESS.md update via V4.1 hotfix.
- GitHub push/PR and Vercel preview: pending Desktop AI / CI.
