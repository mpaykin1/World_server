# WORK IN PROGRESS — WORLD_SERVER_GOLDEN_STANDARD_V10_1

## Task
Install WORLD_SERVER_GOLDEN_STANDARD_V10_1_DESKTOP_AI_PROTOCOL (self-applying Golden Standard V10.1) from 4e20c3d base. Provide Vercel serverless fallback + Final Delivery V3 hard gate + deny-by-default release registry + canonical physics/UI + quality governance.

## Why
- Previous V4 combined patch already gave `Vercel fallback ready` and `NOT_READY` governance, but project lacked full quality gates, regression protection, Golden component propagation, mobile/desktop matrix, and Desktop AI protocol.
- V10 adds persistent quality scorecard, error recurrence protection, Golden propagation, Vercel buildCommand gate, and mandatory WORK_IN_PROGRESS.

## Current state
- Branch `opencode/ai3d-full-integration` at 4e20c3d (merge PR #5 READY). Zip `WORLD_SERVER_GOLDEN_STANDARD_V10_1_DESKTOP_AI_PROTOCOL.zip` untracked, installer `GOLDEN_STANDARD_WORLD_SERVER_V10/install-golden-standard.cjs` extracted.
- Baseline gates before patch: `npm run check` 144 tests PASS, `npx playwright test e2e/ai3d-voxel-city-autoplay` 2/2 PASS (37678 voxels 101 chunks 8988 tris), `/api/ai3d?action=delivery` returns deliveryPolicy/status, `/api/ai3d-voxel-generate` 200.
- Previous installer run failed due to CRLF vs LF and already-patched canonical movement (installer not idempotent).

## Target state
- `npm run release:gate` PASS (desktop-ai:check, check, golden:check, quality:check, quality:regression, quality:fuzz, quality:impact, quality:perceptual, tech:audit, tech:health, duplicates, contracts, project:review, stability, evidence:score).
- `npm run check` 144 PASS, Playwright 2/2 PASS, no metric regression (44.17 -> 97.58 violations 0).
- `vercel.json:buildCommand = npm run release:gate`, CI has `WORLD SERVER Golden Standard source/release gate (hard)`.
- AGENTS.md has §10 Golden Standard + §11 Desktop AI mandatory instruction.
- `WORK_IN_PROGRESS.md` updated, `DESKTOP_AI_INSTALL_AND_VERIFY.md` read.

## Files / systems involved
- `apps/voxel-world/client.js`, `apps/ai3d-voxel-city/client.js`, `apps/catalog/client.js`, `apps/survival/client.js`, `api/apps.js`, `playwright.config.js`, `services/ai3d-worker/ai3d/runner.py`, `vercel.json`, `.github/workflows/ci.yml`, `AGENTS.md`, plus 100+ payload copies via installer.

## Known risks
- Installer expects LF, repo has CRLF autocrlf -> fixed via `fix_all.py` and idempotent wrapper for voxel-world/ai3d/catalog.
- Runner placeholder `\\n` vs `\n` mismatch -> manually patched via `patch_runner.py`.
- `apps/survival/client.js` forbidden pattern `Math.cos(yaw)` -> fixed to `GameGoldenStandard?.basisFromForward`.
- CI anchor `Install Playwright browsers` CRLF -> fixed.

## Golden systems that must be preserved
- Controls (canonical XZ via `GameGoldenPhysics.canonicalXZ`), collisions (goldenHorizontal step-up 1.05), mobile goldenlook, compact UI/HUD, release certification, protected errors, Golden assets, working graphics.

## Errors that must not return
- `data/error-prevention-registry.json` + `DUPLICATE_SYSTEM_REPORT` blocker patterns.

## Exact patch / change plan
1. `git reset --hard 4e20c3d` to base, fix CRLF via `fix_all.py`.
2. Extract zip, run `node GOLDEN_STANDARD.../install-golden-standard.cjs` with idempotent wrappers for voxel-world/ai3d/catalog and manual runner patches.
3. Fix `apps/survival/client.js` forbidden pattern.
4. Re-run installer until `GOLDEN STANDARD PASS` + `release:gate` PASS.
5. `npm run release:gate` full verification, `npx playwright test` for autoplay.

## Tests to run
- `npm run release:gate` (includes desktop-ai:check, check, golden:check, quality:check, quality:regression, fuzz, impact, perceptual, tech:audit, tech:health, duplicates, contracts, project:review, stability, evidence:score) -> PASS 144 tests, 95.5% evidence.
- `npx playwright test e2e/ai3d-voxel-city-autoplay.spec.js` -> 2/2 PASS.
- `node scripts/check-ai3d-delivery-policy.js` + `check-ai3d-v4-combined.js` -> PASS.
- `node -e` serverless voxel generate -> 4896 voxels.

## Deployment / PR plan
- Commit on `opencode/ai3d-full-integration` (from 4e20c3d) as `feat(golden): WORLD_SERVER_GOLDEN_STANDARD_V10_1`.
- Push to origin, update PR #5 (or new PR if PR #5 already MERGED). Do NOT push master directly. Vercel preview auto from branch.

## Current progress
- 100% installer applied, hard gate PASS, duplicate blocker fixed, release:gate PASS.

## Next action
- Commit + push, ensure `git status` clean, verify `vercel.json` buildCommand and CI gate.

## Completion criteria
- No accepted metric decreases (44.17 -> 97.58 violations 0, evidence 95.5%).
- Required gates PASS, affected apps verified, `QUALITY_MASTER_REPORT.json` generated, PR ready.

## Final evidence
- `npm run release:gate` PASS (144 tests, golden PASS, quality PASS, no regression violations 0, duplicate blockers 0).
- Playwright autoplay PASS (37678 voxels 101 chunks 8988 tris).
- `vercel.json` buildCommand `npm run release:gate`, `ci.yml` has Golden Standard hard gate.
- Commit SHA to be created on push.
