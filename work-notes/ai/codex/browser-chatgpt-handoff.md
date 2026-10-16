# WORK IN PROGRESS — ai/codex/browser-chatgpt-handoff

## Task
Persist the owner's Codex → ordinary browser ChatGPT handoff rule and prepare a resumable handoff.

## Why
Resource limits must not lose work or silently switch the next executor back to Codex. The next executor is a new ordinary ChatGPT browser conversation.

## Current state
The prior test-only work is pushed in PR #520, branch ai/codex/offline-adapter-tests, source commit 66815adac3f13c64b3a45d1c924802d6687821a0, handoff commit fcc906ad5db3813fac1b3cfaf7e0efe7d82a418b. Existing scoped checkpoint: World_server issue #80 comment 6211706016. Git/raw source access works, but current GitHub API CONNECT requests return 403 despite saved api.github.com access. No reinstallation or credential change is needed.

## Target state
Future agents discover the rule in repository instructions; code and exact evidence are saved before resource exhaustion; the owner receives a checkpoint link, PR link and a complete prompt for ordinary browser ChatGPT.

## Files / systems involved
AGENTS.md, AI_START_HERE.md, CLOUD_AI_HANDOFF.md, a ready-to-copy prompt and this note in World_server. Documentation-only counterpart in mpaykin1/meta6; existing shared checkpoint remains issue #80.

## Known risks
Observer World V5/V6 source records disagree about historical owner acceptance. Preserve both records and treat current owner verdict as unconfirmed here. Current Codex work did not implement V5. Ordinary browser ChatGPT may lack a coding connector: disclose that limitation, never assume it inherits the cloud machine or can open a new chat automatically.

## Golden systems that must be preserved
Accepted game sources, existing engines/modules, existing checkpoint ownership, source/CI/live evidence separation, free tools and the owner's exclusive PASS/FAIL authority.

## Errors that must not return
Handing off to another Codex, invented quota counts or tests, stale links reported as live, duplicate engines/checkpoints, repeated setup and automatic owner acceptance.

## Exact patch / change plan
Link one complete protocol from the standard bootstrap files. Prepare a truthful current prompt with exact sources and work state. Push separate documentation branches; create PRs and update the existing scoped GitHub comment if API access works. Otherwise retain pushed code and ready API payloads without claiming remote writes succeeded.

## Tests to run
Documentation diff/links, instruction discoverability and exact Git refs. No runtime/test changes or new installations; do not run unrelated full suites for prose-only changes.

## Deployment / PR plan
Documentation-only branches/PRs; no merge, deployment, new automation or paid fallback. Existing PR #520 stays separate.

## Current progress
Protocol discoverable from AGENTS/AI_START_HERE; complete current handoff prompt prepared. Counterpart documents pushed in meta6 review branch; no default branch changed. V5/V6 source and current source updates inspected; original visual engine and existing modules preserved. Document review corrected V5/V6 scope and unmerged-status ambiguity. Explicit user-requested CLI diagnosis completed with 15-second timeouts; existing Git path works, Envoy blocks API CONNECT before TLS. No install/login/TLS changes.

## Next action
Push this documentation branch. Ordinary browser ChatGPT with connected GitHub must create documentation PRs and update the existing scoped issue #80 comment from the saved prompt while cloud API is blocked. Continue actual Observer requirements with existing modules, not environment setup. Do not invent a new PR number or claim the issue comment changed.

## Completion criteria
Reusable protocol and complete prompt pushed to GitHub; confirmed checkpoint/PR updates or precise external access blocker; no false owner verdict or automated-chat claim.

## Final evidence
Five Markdown files only; new bootstrap links and explicit anchor resolve, diff whitespace check passed. No application/test/dependency changes, therefore no unrelated runtime tests repeated. Previous PR #520 evidence remains 70 successful / 3 opt-in skipped / 0 failed; full World CI never executed due billing/spending restriction. Current gh2.46.0 API GETs failed behind Envoy CONNECT403; native Git read/push works. Existing issue #80 comment and new documentation PR writes remain unconfirmed because API is unavailable. A full ready-to-copy browser prompt preserves exact prior source SHA, remaining V5 requirements, V6 reuse, live-link uncertainty, main-ChatGPT UNKNOWN and no-repeat-setup guidance. No ordinary browser chat can be auto-created by available tools; no owner verdict or post-verdict lesson recorded.
