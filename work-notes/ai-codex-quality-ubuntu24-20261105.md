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
Verify exact final note-update HEAD checks, mark PR611 ready and merge only after mandatory gates pass; then verify master.

## Completion criteria
Exact-head mandatory gates pass with actual desktop/mobile behavior executed, no metric regression, no conflict. Merge only after checks; owner acceptance of generated game remains separate.

## Final evidence
Candidate2d98b35167b15998523047695207acad4307639c: QualityRegression42129617059/job127602607576 SUCCESS on actual Ubuntu24.04/noble; browser install completed and unchanged behavioral gate18passed(32.3s). Hard release gate and quality delta SUCCESS. check/agent-rules/world-quality/godot-web-preview/fleet-pre/Lighthouse/Workers Builds SUCCESS on2d98. Preview42129617030/job127602607873 failed with actual Cloudflare10037 Free100Workers quota; not rerun, no plan/resource/permission change. Reviews empty, no fabricated independent approval. Baseline cancelled42106585812 retained as historical failure, not relabelled. Final note-update HEAD must receive its own mandatory checks before merge. Guard pre/post verification ok cleanupfalse; local memory pressure high, heavy checks executed only in existing CI.
