# WORK IN PROGRESS — ai/chatgpt/story-execution-20261104

> Updated 2026-11-04T12:59:56.506Z. Mandatory Desktop AI task context.

## Task
Repair completed story history and alternative-ending nonrepeat in existing PR 583

## Why
Existing PR #583 loses the second twist and hero variation fields at completion; later games can repeat them. Its dramaturgy also checks the primary ending while leaving selectable alternatives able to repeat the previous actual ending.

## Current state
Base PR HEAD ca8bffe4cd0d1c645619bcf28a94778139cf37ac. Baseline story tests 5/5 PASS. Reproduced seed 8 -> completed history -> seed 3 repeating the previous second twist. All nine requested PRs and #587 are open without signed independent review. Cloudflare check requiredness cannot be established from administrative API (403); branch metadata reports protected=false, so repository policy checks remain mandatory regardless. No merge or protection changes. Netlify and scheduled tasks are out of scope by explicit user instruction.

## Target state
Completed history preserves every executed twist and hero variation. Every selectable ending avoids the last actual type/location. Seeded completed-game cycles preserve cooldown and inputs. No false game-integration claims.

## Files / systems involved
- lib/engines/story.cjs, lib/engines/dramaturgy.cjs, test/engines-story.test.js and these branch notes. Update the existing PR #583 only; changes coordinated there before edits.

## Known risks
- Extra exclusions alter seeded story choices relative to the previous version; same seed/history remains deterministic. Legacy history lacking extra fields remains supported. Do not rewrite accepted games, baseline scores, review rules or schedules.

## Golden systems that must be preserved
- Controls
- Collisions
- Mobile support
- Compact UI/HUD
- Release certification
- Protected errors
- Approved Golden assets/components

## Errors that must not return
- Preserve immutable provenance/nonrepeat rules. No matching existing protection ID; add direct regression tests.

## Exact patch / change plan
1. Add failing completion-history and alternative-ending regressions.
2. Preserve twist/hero fields through Scenario -> completed history.
3. Exclude previous actual ending type/location from all ending choices and validate them.
4. Run focused engines tests and static gates; existing full cloud CI after atomic push.
5. Update PR #583 with exact SHA and renewed independent-review request. No self-approval/merge.

## Tests to run
- `npm run release:gate`
- `npm run quality:fuzz`
- `npm run quality:stability`
- `npm run quality:impact`
- Playwright affected projects/devices.

## Deployment / PR plan
Task branch -> CI -> PR -> preview/canary -> verified production promotion.

## Current progress
Baseline story 5/5 PASS; three added regressions FAIL on unchanged code. Repaired missing twist/hero/seed completion fields and alternative-ending cooldowns. Focused story/dramaturgy/nonrepeat 21/21 PASS, including 40 seeds, validator tampering and eight completed alternative-ending cycles. Cloud-first policy retained; no full local suite or dependency installation.

## Next action
Atomically update the existing PR #583 with a lease on its old HEAD; wait for fresh exact-head CI and request independent review. Do not merge without signed independent review and required checks.

## Completion criteria
- No accepted metric decreases.
- Required gates PASS.
- All affected apps verified.
- Regression protection added for fixed recurring bugs.
- Golden propagation handled for reusable successes.
- Final evidence recorded.

## Final evidence
LOCAL VERIFIED, NOT MERGED/DEPLOYED. Parent ca8bffe4cd0d1c645619bcf28a94778139cf37ac. Node 24.15.0; node --test test/engines-story.test.js test/engines-dramaturgy.test.js test/engines-nonrepeat.test.js PASS 21/21. Architecture PASS for 3 changed code files against master; diff check PASS. No percentage change claimed; score.json unchanged. Full suites run in existing CI. All nine task PRs and #587 audited: no signed independent review; no unsafe merges performed. Branch-protection administration API returned 403, branch metadata reports no protection; do not infer permission to omit project policy gates or change protection. No Netlify/scheduler operation performed.
