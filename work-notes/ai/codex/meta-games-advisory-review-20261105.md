# META GAMES advisory review

## Task
Apply direct owner instruction: independent review no longer blocks META GAMES merge.
## Why
Unavailable independent approvals have stalled otherwise checked work.
## Current state
Older AGENTS/control instructions require signed cross-company review.
## Target state
Explicit dated owner override, advisory review, mandatory technical checks and concrete-defect blockers preserved.
## Files / systems involved
AGENTS.md; architecture/meta-games-platform/CONTROL_RULES_RU.md; this note. Matching META GAMES instruction in meta6 handled in separate repository PR.
## Known risks
Conflating waived approval wait with permission to ignore defects; wording explicitly forbids this.
## Golden systems that must be preserved
All runtime, games, licenses, technical CI, branch protection, secrets, owner acceptance and five schedules.
## Errors that must not return
False approvals or automatic reviewer availability treated as a technical pass.
## Exact patch / change plan
Dated authoritative policy for META GAMES, synchronized control rules; no workflows changed.
## Tests to run
Remote content readback; required cloud CI on final HEAD. Documentation only, no runtime test invented.
## Deployment / PR plan
Policy PR authorized directly by owner; merge after required technical checks, without independent approval wait.
## Current progress
Instructions read, scope confirmed by direct owner message, documentation prepared.
## Next action
Create PR, check exact-head technical gates, merge and read master.
## Completion criteria
Canonical policy in main branch plus existing control heartbeat updated.
## Final evidence
Remote readback/CI/merge recorded in PR; production readiness not claimed.
