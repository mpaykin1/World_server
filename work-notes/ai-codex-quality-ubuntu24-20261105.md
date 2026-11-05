# META GAMES quality runner recovery

## Task
Restore completion of the existing mandatory Quality Regression Lock; no new capability.

## Why
Master 0aff1fd4b46d0c1127ff6836965d9143322bc91e run42106585812/job127522886624 was CANCELLED after slow Ubuntu26.04/resolute apt downloads during Playwright install, leaving behavior SKIPPED. Cancellation is not PASS.

## Current state
Existing workflow runs ubuntu-latest with timeout20min. Source unit/seven-engine/generated-browser CI passed. Generated game release275 is publicly byte-verified but owner acceptance pending. No duplicate publish or release acceptance is introduced here.

## Target state
Existing quality job runs on explicit ubuntu-24.04 and completes its unchanged checks.

## Files / systems involved
.github/workflows/quality-regression.yml and this branch work note only.

## Known risks
OS pin may expose compatibility issues; exact-head CI must decide. No claim that every network timeout is eliminated.

## Golden systems that must be preserved
All game/runtime bytes, golden thresholds, release registry, permissions, secrets, timeout, commands and existing concurrency.

## Errors that must not return
Do not relabel cancelled/skipped behavior as PASS; do not retry unchanged infrastructure blindly.

## Exact patch / change plan
Replace only runs-on ubuntu-latest with ubuntu-24.04. Keep browser install chromium+webkit and behavior tests unchanged. Never touch Netlify/SEO/schedules/accepted games.

## Tests to run
Verify exact one-line workflow delta and invariant preservation, then existing CI on exact head; inspect actual runner/browser/behavior log. No heavy local npm install or browser.

## Deployment / PR plan
Separate ai/codex/quality-ubuntu24-20261105 branch from0aff, draft PR for cloud checks. No production deploy/config change.

## Current progress
Rules read at0aff; graf.md absent by nontruncated recursive tree search; no nested workflow AGENTS. All22 open PR files checked, no collision on target workflow. Executor idle/reference-only. Guard preflight verification ok cleanupfalse. Existing collective route desktop-ai/claude-code; recall0 local results, no new agent started.

## Next action
Apply one-line runner pin and open draft PR to run existing cloud gates.

## Completion criteria
Exact-head mandatory gates pass with actual desktop/mobile behavior executed, no metric regression, no conflict. Merge only after checks; owner acceptance of generated game remains separate.

## Final evidence
PENDING cloud candidate results. Baseline failure42106585812 is retained, not overwritten. Local preflight reports high RAM pressure; all heavy checks run in existing CI.
