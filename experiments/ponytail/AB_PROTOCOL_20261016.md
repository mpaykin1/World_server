# Ponytail A/B experiment — isolated from Supabase migration

Status: HARNESS_READY; AGENT_RUNS_NOT_YET_MEASURED. No claim of speedup.

## Fastest fair experiment
Run the same real, read-only World Server bug-analysis task twice on the same agent/model/version, with identical context and tool access. Randomize order. A = standard project rules; B = same rules plus pinned upstream `skills/ponytail/SKILL.md` from DietrichGebert/ponytail. Do not install hooks, change the agent global config, or expose Supabase secrets.

Task: analyze `scripts/supabase-migration-optimizer.cjs` and migration safety tests; report the single highest-impact missing check with file:line evidence and a minimal proposed fix. **Do not edit files or access live databases.** If this file is unavailable, select one existing migration script, record its SHA, and use that identical task for both arms.

Capture each run's wall-clock seconds, input/output tokens (from actual provider usage), total USD cost if known, correctness score (0–5 against independent human-reviewed assertions), and whether the answer introduces a regression. Record model ID, repo HEAD SHA, Ponytail source SHA, timestamp, and exact prompts. If any usage metric is unavailable, mark it `null`; never estimate it from word count.

## Decision rules
A measured improvement requires BOTH runs, identical task and environment, noninferior correctness, and no additional security risk. Report percentage savings as `100*(baseline-treatment)/baseline` only for measured positive baselines. One pair is a smoke test, not statistical proof. Repeat on at least 3 tasks before changing AKA automation.

## Guardrails
- Production Supabase, database credentials, deployment and master remain untouched.
- No new recurring automation or mandatory review gate.
- No paid model calls without owner approval.
- PASS/FAIL and any success/failure learning commit belong exclusively to the owner.
- Ponytail benchmark figures from its README are external author claims, not World Server measurements.

## Current evidence
Verified upstream Ponytail README and 53-line SKILL.md via GitHub connector, and World Server package.json plus retired independent-review workflow. These checks establish feasibility only; observed World Server speedup is **unknown**.
