# META GAMES control rules

## Task
Preserve the owner's control loop on GitHub (2026-11-05).
## Why
Chat-only instructions are difficult for future agents to discover.
## Current state
Control heartbeat exists in Codex; implementation PRs are separate. No publication or merge is claimed.
## Target state
One discoverable Russian control policy in the existing architecture.
## Files / systems involved
META_GAMES_CONTROL.md; architecture/meta-games-platform/CONTROL_RULES_RU.md; this task note.
## Known risks
Confusing delivery with execution or PR with production; duplicate assignment; stale SHA.
## Golden systems that must be preserved
Existing games, rights gates, independent review, five ChatGPT schedules.
## Errors that must not return
False PASS, anonymous MCP writes, duplicate orchestration, repeated deterministic failures.
## Exact patch / change plan
Add this note first, canonical policy second and root discovery alias third. Runtime and workflows untouched.
## Tests to run
Read back exact remote text and relative links; required repository CI and independent review before merge. Heavy local suites are not run for this cloud-only documentation change.
## Deployment / PR plan
Separate docs PR to master; no direct master push, merge or deploy.
## Current progress
Task scope and base SHA 3676fc65c2fb8b2c9a65baf04bb3b225fcaf2985 verified; policy prepared from explicit owner instructions.
## Next action
Create policy and alias, open PR and request non-OpenAI review.
## Completion criteria
Policy saved on GitHub and PR available; adoption into master requires required checks/review.
## Final evidence
Remote readback and PR recorded in the PR conversation. Baseline/full release gates not run locally; their PASS is not claimed. This document does not establish platform readiness.
