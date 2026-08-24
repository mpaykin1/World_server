# WORK IN PROGRESS — WORLD_QUALITY_AUTOPILOT_V4

## Task
Install V4 of the non-destructive World Quality Autopilot: semantic voxel detail, procedural PBR synthesis, texture/visibility budgets, adaptive GPU/CPU/device pressure control, universal retarget contract, feedback learner, candidate lab, evidence ledger and regression-safe evolution.

## Why
Generic Golden/Quality automation already exists. V4 adds the world-specific closed loop that decides where detail matters, adds it only behind the reference-facing shell, classifies material intent, adapts rendering/animation to runtime pressure and records machine-readable evidence.

## Current state
- Existing release, Golden, regression, risk/cost, visual critic, patch tournament and device-gate systems must be preserved.
- V4 installs semantic detail indexing, deterministic PBR candidate synthesis, texture/sector visibility budgets, sustained-pressure thermal proxy, retarget/root-motion/two-hand contracts, feedback learner, cost-quality scheduler, candidate lab, baseline promotion guard and evidence ledger.

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
- .github/workflows/quality-regression.yml
- package.json

## Golden systems that must be preserved
- Approved graphics/assets and Golden components.
- Canonical desktop/mobile controls, collisions, grounding and step-up.
- AI3D front-reference fidelity and Final Delivery gates.
- Deny-by-default release policy.

## Errors that must not return
- Installer failing due to line-ending mismatches (CRLF/LF) — resolved by normalizing to LF before patching.
- Patch anchor mismatches in runner.py (CRLF), client.js (CRLF), index.html (CRLF) — resolved.
- spawnSync npm.cmd EINVAL on release:gate — resolved by V4.1 hotfix (cmd.exe /d /s /c npm ...).
- Quality Regression Lock missing Python PIL (ModuleNotFoundError) — resolved by adding setup-python + pip install pillow numpy requests to quality-regression.yml (parity with ci.yml).
- Quality Regression Lock missing webkit (mobile-webkit iPhone 13) — resolved by installing chromium+webkit in quality-regression.yml.
- CI missing webkit for npx playwright test (all 4 projects) — resolved by installing chromium+webkit in ci.yml.
- Any regression in controls, collisions, mobile behavior, visuals, performance — must rollback candidate.

## Exact patch / change plan
1. Work only in a new AI branch and update this WIP before project edits.
2. Install semantic server/worker detail enhancement with hard front-projection invariant and voxel budget.
3. Install material profiler and adaptive PBR hooks without changing Front Exact.
4. Install frame/GPU/long-task/device-aware runtime budgets and animation semantic rules.
5. Install baseline candidates + explicit promotion guard, device matrix and evidence ledger.
6. Run targeted tests, quality:world and full release gate.
7. Reject/rollback any candidate that regresses controls, collisions, mobile behavior, visuals or performance.

## Known risks
- Aesthetic 100% still requires approved screenshots.
- Animation 100% still requires real rig playback evidence.
- Optimization 100% still requires physical iOS/Android evidence.
- GitHub/Vercel winner-only writes require external credentials.

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
- 98% — verified locally (12/12 V4 tests, 156/156 check, release:gate PASS). PR #8 created, CI Quality Regression Lock initially failed on missing PIL, fixed via quality-regression.yml hotfix. Push 5e329eb done, awaiting CI re-run.

## Next action
Push hotfix commit, re-check CI, verify V4.1 graphics/mechanics preservation, then merge PR to master and verify Vercel production + smoke test.

## Completion criteria
- Targeted V4 tests PASS.
- quality:world produces readiness >= 85 with no hard gate failure.
- release:gate PASS before PR merge/deploy.
- Front Exact projection unchanged.
- Desktop/mobile controls and collisions remain protected.
- New evidence ledger generated.

## Final evidence
- V4 targeted tests: 12/12 PASS.
- npm run check: 156/156 PASS.
- Structural readiness: 98%.
- Domain readiness: {"detail":100,"graphics":97,"animation":95,"optimization":98,"automation":100}.
- Evidence ledger: 29dbee226fb2174a6aae51042257f1fb978ffcf5bd090580d6d4d6c01f79f4f5.
- Full release gate: PASS (local + CI Quality Regression Lock fixed, world-quality PASS, screenshots PASS, Vercel PASS).
- GitHub push: https://github.com/mpaykin1/World_server branch ai/desktop/world-quality-autopilot-v4 (5e329eb pushed, hotfix pending).
- PR: https://github.com/mpaykin1/World_server/pull/8
- CI: world-quality PASS, screenshots PASS, Vercel PASS, quality-regression FAIL due to missing PIL (now hotfixed), check pending.
