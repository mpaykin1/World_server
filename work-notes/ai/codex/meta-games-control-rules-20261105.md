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

## Owner update 2026-11-05
Control interval changed from 30 to 7 minutes in the existing Codex heartbeat meta-games (ACTIVE, same target thread). Policy requires identifying and launching useful independent tasks while primary results are pending, without interrupting busy GPT, duplicating work or manufacturing scope. Controller may do independent work itself. No extra scheduler, subagents or services created. Policy readback is checked; no runtime tests or production readiness claimed. Fresh independent review must target updated PR HEAD.

## Direct owner authorization
Owner explicitly requested removing the independent-review wait for this control policy and merging it into master. This supersedes the previous review-wait notes for PR #589 only. Required technical checks still apply; unrelated code/reviews and branch protection are unchanged. Exact-head CI is checked before merge; deployment is not claimed for this documentation-only change.
