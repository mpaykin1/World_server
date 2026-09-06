# CLOUD AI HANDOFF

## Purpose
`World_server` is cloud-first. Desktop AI should do only the minimum work required to make a task available to browser/cloud agents, then coordinate rather than continue heavy local execution.

Production entry point: `https://world-server.ai.studio`
Source of truth: existing GitHub repository `mpaykin1/World_server`.

## Mandatory execution order
1. Inspect the current branch/commit and existing architecture.
2. Reuse existing systems; do not create a second repo, second AI Studio project, second coordinator, or duplicate service.
3. If a patch starts on the user's PC, make the smallest safe integration needed to commit/push it.
4. After push, move implementation/review/testing to browser/cloud whenever possible.
5. Use existing CI/cloud systems for heavy tests, builds, audits and long-running verification.
6. Keep Desktop/local work bounded, low-impact and reversible.

## Local computer protection
- No AI-generated worktrees/clones/logs/caches/builds/archives on Desktop.
- Prefer `%LOCALAPPDATA%\WorldServerAI\` and existing off-Desktop worktrees for unavoidable local temporary work.
- Do not launch local LLMs when a cloud agent can do the task.
- Do not start duplicate workers/recovery loops.
- Check RAM/disk/process pressure during long work and offload if the machine slows down.
- Delete only proven task-owned disposable artifacts; never unknown/user files.

## Coordinator responsibilities
- Prefer already-available cloud/browser agents and GitHub/CI over local compute.
- Use `scripts/master-coordinator.cjs` and the existing collective-brain/reporting/lease mechanisms instead of inventing a parallel dispatcher.
- Split large goals into small independently reviewable cloud tasks.
- Avoid duplicate assignments unless a deliberate independent review is useful.
- Collect results, compare them, integrate the best verified solution, and record root causes/regression protection.
- Keep machine-readable task state in the repository/shared coordination state so another agent can continue without rereading the whole project.

## Patch handoff contract
For every new patch committed for cloud continuation, record commit/branch, changed files, completed work, remaining work, checks, blockers, and affected production URLs.

## RUN_072 production port
Source patch commit: `f30efebe6021b9dd5fd231840934c4764bfbc8eb`.
Base: current `origin/master`; never merge the old divergent RUN_072 history.
Included: minimal RUN_062/066/071 dependencies, RUN_072 script/test, immutable `SCIENCE_RUN_072_H2.json`, and exact registry protection.
Production read endpoint: `GET /api/science-run072`.
Existing remote-task bridge access:
- read evidence: `inspect_logs` with `SCIENCE_RUN_072_H2.json`;
- verify RUN_072: `run_existing_script` with scriptId `science-run-072`.

## Cloud continuation
Run full CI/release checks in GitHub/cloud, not on the user's PC.
After merge, sync/publish the existing production project; do not create another repo/project.
Verify `GET https://world-server.ai.studio/api/science-run072` returns HTTP 200 and `evidence.pass=true`.
If deployment is quota-blocked, record it and retry in cloud; do not compensate with heavy local work.

## Completion rule
Local work is complete when the minimal safe patch is committed/pushed and cloud agents have enough context to continue.
Cloud agents must preserve graphics/gameplay quality, fix root causes, add regression protection, and never weaken working visuals merely to make tests pass.
