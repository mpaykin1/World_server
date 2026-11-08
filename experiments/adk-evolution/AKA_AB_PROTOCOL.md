# ADK vs existing hourly AKA roles — controlled experiment (2026-10-15)

Status: REGISTERED / BASELINE IN PROGRESS; no claim of game-speed improvement.

## Objective
Test whether Google ADK improves **verified completed outcomes per active agent-hour** in the five existing roles (Builder, Fleet, Architect, Ocean, SRE), not merely orchestrator microseconds. Preserve the existing five schedules, role ownership, 50/50 game/cleanup portfolio, review gates, and zero paid API spend.

## Design
1. CONTROL: record the next 3 completed hourly cycles of each role without ADK. Preserve exact role ID, UTC start/end, branch/PR SHA, issue/PR URL, attempted action, completed action, independent verification, failures, retries, token/compute cost when observable. UNKNOWN is not zero. Baseline from past runs may be appended but not silently mixed with prospective runs.
2. TREATMENT: in an isolated branch/CI, implement an ADK coordinator **adapter**, invoking the *same* read-only or safely scoped workflow with identical input snapshot, model, budget, task and tests. ADK must not dispatch a second writer or bypass role ownership. Do not mark treatment started until real ADK invocation and result artifacts exist. If no comparable model/tool execution is available, mark BLOCKED rather than counting a no-op as an agent productivity test.
3. Prefer paired tasks: game defect reproduction/test diagnosis (Builder/Fleet), missing required status-check diagnosis (#500; Ocean/SRE), and safe roadmap triage (Architect). Avoid parallel edits of live PRs; any treatment write requires normal lease and independent review.
4. For each pair report time-to-verified-outcome, accepted fixes, real PR merges, newly proven game behavior (G), cross-slice reuse (L), CI pass rate, retries, failures, token/cost and extra overhead. Compare quality and regressions before speed. At least 3 matched pairs per work class before a tentative verdict; insufficient sample = INCONCLUSIVE.
5. Promotion only if no safety regressions, equal/higher independent QA and reproducible improvement in verified outcome throughput. If ADK is slower or adds only reports, reject. Never automatically alter all five prompts or merge to master on the basis of this experiment.

## Current evidence
The existing ADK installation/import probe and synthetic no-LLM SequentialAgent benchmark passed in PR #512. Baseline median 0.009ms vs ADK median 1.124ms measures orchestration overhead **only**, not game-development productivity.

## Reporting
Every report starts with current **OPEN PR count** and number of proven new game improvements G/L, with source/time. Show control and treatment separately. Include run links and exact SHAs; missing observations UNKNOWN. Keep this file and the benchmark in experimental PR #512 until independent review and owner decision.

## Safety
No sixth automation. No edits to protected master, review bypass, deletion of GitHub CLI, paid provider, or weakening tests. User verdict remains required for game feature acceptance.