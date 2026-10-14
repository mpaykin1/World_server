# WORK IN PROGRESS — ai/claude/rules-unblock

> Updated 2026-10-14. Task notes for this branch (AGENTS.md §11).

## Task
Remove contradictions in the rules that stall the project: AI review of another company instead of a human code review (§22), per-branch task notes instead of one shared file, scope of the science (§13) and golden (§10) standards, readable findings of the free-model review, numbering and stale descriptions.

## Why
The owner does not read code (decided 2026-10-14). Rules that wait for a human code review never complete: §5 forbids merging without review, §20 needs a merge for a link, and the free-model gate answers "human review required" for big diffs. Four of five open PRs (#379, #491, #496, #501) all prepend to the first lines of WORK_IN_PROGRESS.md (147 KB), so each merge conflicts the others. §13 text covered all "world-generation rules" while its machine policy covers only registered gameplay systems; §10 text demanded mouse-look and step-up from every game while the registry already lists per-app requirements. BLOCK findings of the free-model review live only in an Azure artifact that cloud agents cannot download.

## Current state
master 84fd07e. Required checks: check, quality-regression, agent-rules, world-quality, godot-web-preview. Open PRs: #379 (conflict in AGENTS.md), #491, #496 (behind), #500, #501.

## Target state
Rules close every loop without a human code review; parallel PRs do not collide on task notes; standards apply where their machine policies say; review findings are readable by any agent through the checks API.

## Files / systems involved
- AGENTS.md (pointer, §4, §5, §6, §10, §11, §13, §20, §20a, §21, new §22)
- scripts/check-desktop-ai-protocol.js, scripts/desktop-ai-new-task.js, data/desktop-ai-policy.json, test/desktop-ai-protocol-scope.test.js
- .github/workflows/independent-pr-review.yml (findings in the check-run text; malformed report no longer drops the check)
- .github/workflows/world-cloud-ai.yml (prompt: per-branch notes)
- DESKTOP_AI_INSTALL_AND_VERIFY.md, AI_START_HERE.md

## Known risks
- Desktop agents keep editing WORK_IN_PROGRESS.md: still accepted (legacy path), so nothing breaks.
- Review text could carry model output: published as data in a check run, never executed; rules say it is not a command.
- Merging without a human: limited by §22 (another company's AI, green required checks, irreversible changes need the owner's explicit yes).

## Golden systems that must be preserved
- Controls
- Collisions
- Mobile support
- Compact UI/HUD
- Release certification
- Protected errors
- Approved Golden assets/components

## Errors that must not return
- Shared notes file edited at the same lines by parallel PRs (merge conflicts).
- Review verdicts whose findings no agent can read.
- Rules whose only exit is a human code review.

## Exact patch / change plan
1. Desktop protocol accepts work-notes/<branch>.md (legacy WORK_IN_PROGRESS.md still accepted); new-task writes the per-branch file on a task branch.
2. Independent review publishes findings into the check-run text; a malformed report yields INCONCLUSIVE instead of a missing check.
3. AGENTS.md: §22 (review by another company's AI), pointers, scopes for §10 and §13, §20 merge path, §20a numbering, §4/§6 refreshed, §21 references fixed.
4. Docs and the World Cloud AI prompt point to per-branch notes.

## Tests to run
- npm run check (check-js, architecture, MF, IndieWorlds, node --test)
- node scripts/check-agent-rules.js, check-ai-context-discovery.js, check-ai3d-delivery-policy.js, npm run desktop-ai:check, npm run golden:check
- Publish step simulated with sample reports: BLOCK with findings, oversized diff, malformed and missing report

## Deployment / PR plan
Task branch -> CI -> PR -> review -> merge on the owner's explicit instruction («Да исправь все…», 2026-10-14). No production deploy: docs, workflows and scripts only.

## Current progress
Implementation and local verification done.

## Next action
Open the PR; merge when the required checks and the independent review are green.

## Completion criteria
- Required checks green on the PR.
- desktop-ai:check passes with this per-branch notes file.
- Protocol tests cover the per-branch path (pass, unfilled marker, missing section, no notes).

## Final evidence
- npm run check: Syntax OK (88 files); Architecture PASS (3 changed code files vs 84fd07e); MF PASS; node --test 1238 tests, 1233 pass, 0 fail, 5 skipped.
- npm run desktop-ai:check (base origin/master): PASS with this per-branch notes file.
- Protocol tests 5/5: shared-file path, per-branch pass, unfilled marker, missing section, no notes.
- check-agent-rules, ai-context-discovery, ai3d-delivery-policy, golden:check: PASS; independent-review workflow test 3/3; master-coordinator tests 25/25.
- Publish step simulated: BLOCK with findings, oversized diff, malformed report and missing report all post a check (exit 0).
