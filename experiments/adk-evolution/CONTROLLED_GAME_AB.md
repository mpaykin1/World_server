# ADK versus existing AGES: controlled gameplay experiment

## Goal
Measure whether Google ADK improves validated game-feature throughput, not merely orchestration speed. Canonical source pair and SHA-256 are indexed in `docs/OSTROV_SUMEREK_BASELINES_AND_ADK.md` and GitHub issue #80 comment 6186237268.

## Experimental design
1. Keep original and improved HTML immutable. The historical improvement is NOT an ADK outcome.
2. Select two matched NEW gameplay changes against the same improved HTML baseline (e.g. two similarly scoped enemy attack patterns). Randomly assign AGES or AGES+ADK. Swap assignment in a second round.
3. Identical model, provider, prompts, token/time budgets, code access, tests, review gate and game viewport. Use free providers only. No secrets in repo.
4. Each arm produces a separate branch and PR; do not merge until independent checks and exact-head browser gameplay proof. Record run URL, head SHA, start/end, token usage if known, CI results, gameplay screenshots/replay, defects and regressions.
5. Primary metric: verified new gameplay behaviors per agent-hour. Secondary: time-to-green, human interventions, regressions, token use, CI minutes. Failure or missing evidence is NOT PASS.
6. Repeat >=3 paired trials before claiming an efficiency improvement. If no real LLM/runner or executable gameplay proof is available, report INCONCLUSIVE, never estimate a percentage.
7. Maintain 50/50 game and CLEAN_SERVER allocation only when currently authorized by canonical policy; this experiment must not alter five existing hourly tasks or launch a sixth.

## Current verified result
GitHub Actions 38693739756: ADK import PASS, synthetic no-LLM 3-agent sequence median 1.124ms versus direct await baseline 0.009ms (30 trials each). These are not equivalent game-development agents, so this is an overhead microbenchmark only.

## Missing before true A/B
- Source HTML bytes must be made accessible to the GitHub-only CI agent (currently in ChatGPT Library).
- Choose two matched gameplay changes and run both implementations with the same available model.
- Browser gameplay tests and independent review for each arm.

**Status: INCONCLUSIVE.** Do not promote ADK to production AGES on these data.
