# WORK IN PROGRESS — ai/codex/pipeline-contract-isolation-20261104

> Updated 2026-11-04T09:43:34.795Z. Mandatory Desktop AI task context.

## Task
Repair optional calc null handling and isolate seven-engine pipeline data

## Why
The existing pipeline rejects the contractually valid optional calc null result. It also passes caller-owned GameCard/history and shallow copies of previous outputs to adapters, allowing a stage to corrupt provenance and nonrepeat history.

## Current state
Base master 3676fc65c2fb8b2c9a65baf04bb3b225fcaf2985. Existing pipeline tests: 5/5 PASS on Node 24.15.0. Reproduction: calc {value:null} produces ENGINE_FAILED; an adapter can change caller card.id and recentGames[0].primaryConflict. PRs #581-583 implement adapters/scenario/calc separately and are not modified. No current readiness percentage claimed. Netlify production remains an external 404 blocker with no connected Netlify management tool. Preflight passed; free RAM 9.3%, so broad suites/install/builds run in existing cloud CI rather than locally.

## Target state
Optional calc may return {value:null} without blocking required engines. Every adapter receives detached input data; stored intermediate outputs and the caller's nested history remain stable on success and failure. No game integration or G4/G5 certification is inferred.

## Files / systems involved
- lib/engines/pipeline.cjs, test/engines-pipeline.test.js, pipeline contract and these notes. Project continuation records updated with candidate status only.

## Known risks
- structuredClone requires cloneable data, as supplied by declared data contracts. Functions remain in the adapter registry. Rejected noncloneable stage output must stop the chain explicitly. Existing synchronous API and stage order remain unchanged.

## Golden systems that must be preserved
- Controls
- Collisions
- Mobile support
- Compact UI/HUD
- Release certification
- Protected errors
- Approved Golden assets/components

## Errors that must not return
- No existing engine isolation protection was found. Add direct regression tests instead of claiming owner approval or promoting an unreviewed Golden component.

## Exact patch / change plan
1. Reproduce optional-null and reference leaks with failing tests.
2. Clone the run inputs, each adapter context and each stored output at stage boundaries.
3. Treat explicit calc null as skipped_optional; keep mandatory null as ENGINE_FAILED.
4. Run focused Node tests and static/architecture gates locally; required full suites in CI.
5. Publish branch/PR, obtain independent review per AGENTS section 22; no direct master push.

## Tests to run
- `npm run release:gate`
- `npm run quality:fuzz`
- `npm run quality:stability`
- `npm run quality:impact`
- Playwright affected projects/devices.

## Deployment / PR plan
Task branch -> CI -> PR -> preview/canary -> verified production promotion.

## Current progress
Baseline read and reference/null defects reproduced. Five added tests failed on the unchanged implementation (5 existing passed). Fixed optional-null handling and detached each stage boundary. Added a real dramaturgy/nonrepeat compatibility regression. Focused engine tests now 21/21 PASS (11 pipeline, 5 dramaturgy, 5 onboarding); architecture and syntax gates passed. No runtime game, hosting, advertising, rights or score.json change.

## Next action
Publish branch and PR; run full CI on exact HEAD and obtain independent review. Do not merge while required checks/review are unresolved. Afterwards integrate with existing adapter/scenario PRs without duplicating their work.

## Completion criteria
- No accepted metric decreases.
- Required gates PASS.
- All affected apps verified.
- Regression protection added for fixed recurring bugs.
- Golden propagation handled for reusable successes.
- Final evidence recorded.

## Final evidence
LOCAL VERIFIED, NOT MERGED / NOT DEPLOYED. Base 3676fc65c2fb8b2c9a65baf04bb3b225fcaf2985, Node 24.15.0. Commands: node --test test/engines-pipeline.test.js test/engines-dramaturgy.test.js test/engines-onboarding.test.js (21/21); ARCHITECTURE_BASE_REF=3676fc65... node scripts/check-architecture-limits.cjs (2 code files PASS); node scripts/check-js.js (88 JS PASS); git diff --check (PASS). engines-score.cjs --run --check --next passed, next dramaturgy.G4; reported 74 without META6_DIR, therefore not a complete cross-repository audit or whole-product readiness. Full npm run check / release:gate deferred to existing cloud CI per AGENTS section 12 and measured high memory pressure; no full-suite success is claimed. Netlify management tools not connected. Candidate review and cloud results remain pending.
