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
For every new patch committed for cloud continuation, record:
- commit SHA and branch;
- exact changed files;
- what is already done;
- what remains for cloud agents;
- required checks and acceptance criteria;
- known blockers;
- production URL(s) affected.

## Completion rule
Local work is complete when the minimal safe patch is committed/pushed and cloud agents have enough context to continue. Do not spend the remaining local token/context budget trying to finish work that can now run remotely.

Cloud agents must keep graphics/gameplay quality intact, fix root causes, add regression protection, and never weaken working visuals merely to make tests pass.
