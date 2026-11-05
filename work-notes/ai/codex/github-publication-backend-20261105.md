# Task
Implement the existing publication coordinator's bounded GitHub candidate backend.
## Why
The host-configured coordinator/MCP still lacks a concrete persistent candidate operation. Process-local maps cannot prevent duplicate PRs after restart or uncertain remote writes.
## Current state
Base c046c92d6d4b3ed62995eef494f2ed7304f33d98. Postmerge main CI, generated browser, quality, Godot and seven engines SUCCESS; Canary running. Executor idle/reference-only. Full repository tree nontruncated: existing GitHub discovery/probe code is not a bounded publication backend and will not be run for credentials or cleanup.
## Target state
Fixed mpaykin1/meta6 main candidate with deterministic remote branch per full artifact hash; verify all seven added blobs before reuse. No merge or delivery claim.
## Files / systems involved
New lib/engines/github-publication-backend.cjs, focused backend tests and this note. Existing coordinator contract retained.
## Known risks
Transport and approval authorities must be injected by the trusted host; no credentials or defaults. GitHub responses and pending branches may be hostile or stale and must be verified. Live backend configuration/publication remains separate.
## Golden systems that must be preserved
Existing games, portal, read-only public MCP, Netlify/reserve/SEO, schedules, CI permissions, secrets and tariffs.
## Errors that must not return
No arbitrary repository/path, route overwrite, duplicate remote branch/PR on timeout, foreign candidate reuse, caller approval, auto merge or published claim from a PR.
## Exact patch / change plan
Validate original package/source and fixed route/files/budgets. Persist identity in branch ai/meta-games/publish-<full hash>. Create seven blobs through Git data API on current main. On uncertain ref/PR creation recover by reading existing remote state; verify single-parent commit and exact seven added-file hashes. Release acceptance remains a separate host callback bound to merged commit.
## Tests to run
Two independent instances/restart, concurrent calls, timeout after successful writes, foreign/tampered candidate, occupied route, unmerged and stale/merged receipt paths. No live network write in fixtures.
## Deployment / PR plan
One PR; mandatory exact-head checks and browser. No transport configured in default CLI, no real game release claimed. Reuse existing approved connector path for eventual live acceptance.
## Current progress
Preflight PASS cleanup=false; note created before implementation edits. Fresh rules/control read, no competing publication PR found. Six new backend tests initially PASS. After explicitly adding sparse-absent existing regression files, all four test files actually executed: 17 tests PASS/0FAIL, 467.5499ms. The earlier two-path invocation executed only the six present backend tests, not nine; no inflated count claimed.
## Next action
Implement backend and focused negative/concurrency tests, inspect diff, commit/PR, verify exact-head CI.
## Completion criteria
Remote candidate can be recovered without duplicate or overwrite, and a mismatched remote candidate fails closed. No new HTTP write surface or automatic merge.
## Final evidence
Initial 17 focused tests PASS with actual generated artifacts and a GitHub API simulator; no live GitHub write or publication. Premerge negative audit then reproduced a missing ancestry gate: replace remote ref/PR with a new candidate commit whose parent is ahead of/outside main ancestry while retaining the seven valid additions; six tests PASS and new seventh FAIL (Missing expected rejection). An initial fixture was refined to mutate the actual candidate parent/SHA/ref rather than only fabricate an inconsistent ancestry response; refined fixture also failed before the fix. Added exact merge-base parent-vs-current-main check before reuse. All four focused regression files now 18 PASS/0FAIL429.4227ms; exact-head CI must be renewed. No old HEAD PASS transferred. CLI/default configuration unchanged.
