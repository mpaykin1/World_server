# WORK IN PROGRESS — ai/claude/live-link-robust

> Updated 2026-10-16. Task notes for this branch (AGENTS.md §11).

## Task
Live-link check: every view reports a verdict as an annotation, a crash included.

## Why
- #517 added the `live-link` job to Games autotests: agents whose browser cannot reach the site check the owner's game link in the cloud (AGENTS.md §21.5).
- Its first run on the production game link (run 38862748675) ended red with no annotation at all.
- An exception outside the `try` skipped the report: the screenshot, the browser start or close. A check with no verdict blocks the owner's link as surely as a broken game.
- WebFetch shows the production link serving «Остров сумерек».

## Current state
master 34202a1. The live-link script reports only after both views and only if nothing outside the `try` throws.

## Target state
- Each view: browser start, page, checks and screenshot run inside one `try`; the screenshot is optional.
- Each view prints its `::notice`/`::error` before the next view starts.
- Annotation text is one line with `%` escaped.

## Files / systems involved
- .github/workflows/games-autotests.yml (live-link script)
- test/games-autotests-workflow.test.js

## Known risks
- None for the PR checks: the `live-link` job runs only on a dispatch with `url`.

## Golden systems that must be preserved
- Controls
- Collisions
- Mobile support
- Compact UI/HUD
- Release certification
- Protected errors
- Approved Golden assets/components

## Errors that must not return
- A verification job that fails without saying why.

## Exact patch / change plan
1. Restructure `check()`: result dict first; everything in `try`; `except` records the error; `finally` closes the browser; report per view.
2. `one_line()` for annotation data.
3. Test: browser inside the `try`, crash recorded, report before return, optional screenshot, escaped text.
4. Dispatch the check on this branch with the production game link.

## Tests to run
- node --test test/games-autotests-workflow.test.js test/workflow-yaml-valid.test.js
- Local run of the extracted script (game build on 127.0.0.1 with three.js routed locally; a blocked host)
- npm run check (ARCHITECTURE_BASE_REF=34202a1), check-agent-rules, desktop-ai:check
- Cloud: Games autotests dispatched with the production game link

## Deployment / PR plan
Task branch -> CI -> PR -> merge on the owner's instruction (2026-10-14). Workflow only; nothing deploys.

## Current progress
Patch done; local runs green.

## Next action
Push, dispatch the cloud check on this branch, open the PR.

## Completion criteria
- The cloud check on the production game link gives a verdict per view.
- Required checks green.

## Final evidence
- Local, game build on 127.0.0.1: desktop and phone «Live link OK», state `play`, console clean, exit 0.
- Local, blocked host: two «Live link FAILED» annotations (ERR_TUNNEL_CONNECTION_FAILED), exit 1.
- node --test (workflow tests): 4/4.
