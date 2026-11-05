# WORK IN PROGRESS — ai/chatgpt/physics-execution-20261104

> Updated 2026-11-04T13:03:52.615Z. Mandatory Desktop AI task context.

## Task
Repair unsupported stair climbing, final grounding and invalid runtime physics configuration

## Why
Existing PR #585 allows stepping upward without ground support, retains a stale ground flag after leaving a platform, and accepts NaN runtime gravity producing NaN position/velocity. These directly affect safe runtime integration.

## Current state
Base 500a3fa3ee80f8eb168731ed4881d67de2cca17b. Existing physics 6/6 PASS. Direct reproductions: airborne feet y=.1 climb a .3 step in empty world; walking off floor ends y=-.08175 with contacts.ground=true; gravity NaN produces NaN output without error. Changes claimed in PR #585 before edits. No signed independent review. High memory pressure: full checks run through existing cloud CI.

## Target state
Step-up requires actual support and no ascending velocity, ground describes final support, and invalid runtime configuration fails before simulation. Grounded stairs, landing, thin-wall collision and camera remain compatible.

## Files / systems involved
- lib/engines/physics.cjs, test/engines-physics.test.js and these task notes in the existing PR #585. No game/browser-owned files changed.

## Known risks
- grounded-contact semantics become final-frame support rather than any transient floor contact. Step gating must retain normal stair traversal and not introduce wall tunnelling. Preserve all existing six tests.

## Golden systems that must be preserved
- Controls
- Collisions
- Mobile support
- Compact UI/HUD
- Release certification
- Protected errors
- Approved Golden assets/components

## Errors that must not return
- Preserve stairs-collision-broken, wall-collision-broken and spawn-not-grounded protections. Add direct regressions for newly reproduced defects.

## Exact patch / change plan
1. Add red regressions for unsupported stepping, stale ground and invalid config.
2. Reuse createPhysicsConfig validation at runtime; calculate support from solid geometry.
3. Gate step-up on actual support and descending/stationary motion; recompute final grounded contact.
4. Run focused physics/golden tests, architecture and diff checks; publish with HEAD lease.
5. Require fresh full CI and renewed independent review. Do not merge or claim game readiness.

## Tests to run
- `npm run release:gate`
- `npm run quality:fuzz`
- `npm run quality:stability`
- `npm run quality:impact`
- Playwright affected projects/devices.

## Deployment / PR plan
Task branch -> CI -> PR -> preview/canary -> verified production promotion.

## Current progress
Baseline 6/6 PASS; three new regressions FAIL on unchanged runtime. Added actual support checks for stairs, final grounding and config validation at the simulation boundary. Physics plus Golden Physics tests 16/16 PASS; architecture and diff checks PASS. No game/hosting/schedule changes.

## Next action
Atomically update existing PR #585 with HEAD lease; verify fresh cloud CI and obtain signed independent review on the new SHA. No merge until requirements are satisfied.

## Completion criteria
- No accepted metric decreases.
- Required gates PASS.
- All affected apps verified.
- Regression protection added for fixed recurring bugs.
- Golden propagation handled for reusable successes.
- Final evidence recorded.

## Final evidence
LOCAL VERIFIED, NOT MERGED/DEPLOYED. Parent 500a3fa3ee80f8eb168731ed4881d67de2cca17b; Node 24.15.0. node --test test/engines-physics.test.js test/golden-physics.test.js PASS 16/16; architecture PASS 2 code files; diff check PASS. Three red regressions proved defects before the fix. Full npm run check/release:gate run in existing cloud CI due high memory pressure; fresh results pending. No percentage/G4/G5/publication claim. Independent review remains mandatory.
