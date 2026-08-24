# WORK IN PROGRESS

> Mandatory Desktop AI task context for V13 Self-Calibrating CPU Quality Engine.

## Task
Install, test, and close all fixable errors for V13 CPU Self-Calibrating Quality Engine.

## Why
V12 already provides CPU-only nightly improvement. V13 must reduce wasted CPU, improve visual/collision/asset analysis, learn better action priorities, resume long jobs across nights, and make reusable successes safer.

## Current state
V12 prepared package is at 98%+ architectural readiness with CPU-only nightly automation. External live GitHub/Vercel blockers remain separate from package readiness.

## Target state
The CPU autopilot self-calibrates from real night history, caches deterministic tests, resumes checkpoints, predicts high-value improvements with Bayesian evidence, detects visual/asset/collision regressions, mines candidate invariants, and can freeze exact multi-file Golden solutions.

## Files / systems involved
- CPU Visual Ensemble
- Invariant Miner
- Test Result Cache
- Night Checkpointing
- Bayesian Quality Predictor
- Multi-file Golden Patterns
- Asset Similarity Scanner
- CPU Collision Simplifier
- Hardware Quality Profiles
- 30-night Self Calibration
- Desktop AI Fix Loop / Error Closure

## Known risks
- Visual comparison without an approved baseline cannot prove aesthetics.
- Similar assets must never be auto-deleted.
- Bayesian/self-calibration outputs cannot bypass tests.
- Cached tests must be hash-exact.
- Checkpoints must never resume across incompatible code/policy versions.
- Hardware profiles cannot alter gameplay contracts.
- Golden multi-file extraction requires explicit approval.
- No GPU or paid compute may be introduced.

## Golden systems that must be preserved
- Correct controls
- Collision/step-up behavior
- Mobile behavior
- Compact UI/HUD
- Approved visuals/assets
- Certified release registry
- Protected regression errors
- V10-V12 no-regression, CPU-only and Desktop AI protocols

## Errors that must not return
- All protected errors in `data/error-prevention-registry.json`
- GPU or paid jobs
- false-green tests
- inverted controls
- broken walls/stairs
- missing mobile controls
- dirty-worktree night mutation
- quality regressions accepted as improvements
- stale/missing Desktop AI work instruction

## Exact patch / change plan
1. Install V13 on a task branch.
2. Install CPU Python requirements.
3. Run hardware/Bayesian/invariant/self-calibration analysis.
4. Generate adaptive night plan.
5. Verify checkpoint resume and exact test-cache behavior.
6. Run visual ensemble with approved references where available.
7. Run similarity and collision candidate analysis.
8. Run all V13 tests.
9. Run `desktop-ai:fix-loop`.
10. Manually root-cause and fix every remaining fixable error.
11. Repeat fix-loop until clean.
12. Run full release gate and strict error closure.
13. Produce PR or ready-to-apply patch with evidence.

## Tests to run
- `npm run quality:cpu-policy`
- `npm run quality:hardware-profile`
- `npm run quality:bayesian`
- `npm run quality:invariants`
- `npm run quality:self-calibrate`
- `npm run quality:night-plan`
- `npm run quality:incremental-tests`
- `npm run quality:test-cache-smoke`
- all V13 node tests
- CPU visual/asset/collision checks where inputs exist
- `npm run release:gate`
- `npm run desktop-ai:fix-loop`
- strict `desktop-ai:error-closure`

## Deployment / PR plan
Task branch -> incremental tests -> full gate -> fix loop -> strict closure -> PR -> preview/canary -> verified production promotion. Never edit production directly.

## Current progress
V13 package is being prepared and locally verified. Live installation is not claimed.

## Next action
Desktop AI installs the V13 package locally, runs the complete test/fix loop, and does not stop until only documented external blockers remain.

## Error closure loop
Repeat scan -> reproduce -> root cause -> deterministic/manual fix -> incremental tests -> full gate -> rescan. Do not stop on an unresolved fixable error. A failed automatic fix-loop means manual work is required, not that the task is finished.

## Completion criteria
- V13 unit/integration tests PASS
- CPU-only / zero-paid policy PASS
- Checkpoint + test cache verified
- No visual/collision/asset destructive changes
- Full release gate PASS
- Desktop AI fix-loop clean
- Strict error closure PASS
- No accepted metric decreases
- Final evidence recorded

## Final evidence
Not complete until Desktop AI runs this protocol in the target `World_server` repository.
