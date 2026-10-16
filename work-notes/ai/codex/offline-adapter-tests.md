# WORK IN PROGRESS — ai/codex/offline-adapter-tests

## Task
Make the agent adapter Git lifecycle tests independent of the real World Server checkout and remote.

## Why
Normal repository checks repeatedly fetch origin/master and create full World Server test checkouts. This adds network and disk work to the development gates needed by «Остров сумерек», and changes the developer's Git metadata.

## Current state
Base master c6d0e116a5e3f8c06f8f1ed82167e85af3693f52. Issue #80, its current directive/checkpoint and nine open PRs inspected on 2026-10-16, including complete paginated changed-file lists. No open PR owns agent-adapters tests. Game content (#511), graphics/FPS (#519), migration and experimental branches remain separately owned. Scoped ownership handoff: issue #80 comment 6211706016.

## Target state
Keep real Git lifecycle assertions while using a tiny disposable local repository and local origin. Normal tests must neither fetch GitHub nor alter the canonical checkout's branches/worktrees. No application runtime change.

## Files / systems involved
test/agent-adapters.test.js, test/helpers/offline-git-fixture.cjs and this task record. Existing Git and Node.js 24 only.

## Known risks
Adapter scratch paths are captured at module import; scope their environment before import. Retain branch ownership, cleanup, collision and corrupt-worktree coverage. Keep optional live model tests distinct from normal offline Git tests.

## Golden systems that must be preserved
Free-model allowlist, real production adapter functions, guarded cleanup and source checkout integrity.

## Errors that must not return
Tests mutating developer Git metadata, depending on GitHub availability, leaking fixture branches/worktrees or silently skipping lifecycle checks.

## Exact patch / change plan
Reproduce canonical Git access with a read-only guard; create an isolated minimal Git fixture and local origin; point the existing lifecycle tests at it; add enforceable network/checkout protection; run focused and applicable repository checks. Do not change master, game behavior, acceptance thresholds or paid services.

## Tests to run
Focused adapter suite with Git network access denied; regression counterexamples for forbidden canonical Git operations; syntax/architecture/MF/IndieWorlds gates; npm run check if remaining test effects can be safely contained. Compare canonical refs/worktrees before and after.

## Deployment / PR plan
One branch and one PR to master, without merging. Coordinate in the PR with ChatGPT and request Claude review under AGENTS.md §22. Owner PASS/FAIL remains pending.

## Current progress
Implemented a one-file Git fixture with local bare origin, file-only Git transport, fixture-cwd guard and branch/worktree leak checks. Preserved actual adapter lifecycle assertions. Live Ollama now requires the same explicit opt-in flag already used by neighboring adapter tests; OpenCode remains opt-in. Actual session preflight is tested with fixture cwd and guaranteed restoration on success/failure. Internal review caught and corrected the initial opt-in cwd issue. No runtime/dependency changes or additional installations.

## Next action
PR #520 is open; Claude review and ChatGPT coordination requested in comment 6211834457. GitHub Actions jobs did not start because of the account billing/spending restriction. Independent Claude review and a complete isolated CI run remain pending; do not merge or change paid settings. Owner PASS/FAIL remains pending.

## Completion criteria
Real lifecycle tests pass offline, canonical checkout metadata stays unchanged, no unexpected tracked outputs, reviewable PR created with exact validation evidence and Claude review request.

## Final evidence
- Fail-before: an external preload that rejects canonical Git mutations stopped the original real-worktree test at `fetch origin master`; no fetch or checkout was allowed.
- Pass-after: the same guard permits the complete changed adapter suite: 21 passed, 2 explicit live-tool skips, 0 failed (23 tests, about 0.38 s on this cloud machine). No before/after wall-time speedup is claimed.
- Adapter/session-guard/tail-budget/Ollama-patch suites: 70 passed, 3 explicit live-tool skips, 0 failed (73 tests). Actual localhost fake-server timing tests executed; no model inference.
- Repository checks: 88-file syntax check, architecture against origin/master, MF, IndieWorlds and diff whitespace checks passed. Canonical branches/worktrees compared byte-for-byte before/after: unchanged.
- Environment: Node 24.19.0, npm dependencies installed by lockfile, local server/catalog/apps/static HTTP smoke and 18 other selected baseline tests passed. Supabase-backed config is unavailable without bindings; it is outside this test-only task. install_script/start_skill/API domain saved in environment draft; publication not performed.
- Full local npm run check is deliberately not represented as passed: existing collective-brain-remote-bridge tests still create canonical worktrees and manipulate shared ignored state. Existing GitHub CI provides the isolated full-suite run for this PR; no workflow or assertion was weakened.
- GitHub CI run 38876644180 on source commit 66815adac3f13c64b3a45d1c924802d6687821a0 has zero executed steps. Its check annotations say: "The job was not started because recent account payments have failed or your spending limit needs to be increased." This is an external account restriction, not test execution or a code failure. No retry without a state change and no spending-limit/payment change is authorized by this task.
- This task does not claim owner acceptance, independent Claude review, merge, deployment or gameplay/FPS improvement.
