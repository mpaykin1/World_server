# Ponytail A/B — measured results (2026-10-16)

Owner decides PASS/FAIL. This file reports measurements only.

Setup: model `claude-sonnet-5-5`; base commit `af601f65473fdbb1e6da24ac26937a1acb0924f5`; Ponytail see `results.json` (`ponytail_sha`) and `PONYTAIL_SKILL_pinned.md` (52 lines; protocol said 53, upstream changed).
Arms: A = plain; B = same + Ponytail SKILL.md via `--append-system-prompt-file` (B only). Separate directory copies, read-only tools (Read/Grep/Glob), no network/DB, no secrets, no master/Supabase/automation changes, no API key (session subscription usage; `total_cost_usd` is the CLI's estimate).
A and B of each task ran concurrently. Raw JSON logs in `logs/`.

| Task | Arm | Wall s | Input total* | Output | Turns | Cost USD |
|---|---|---|---|---|---|---|
| 1 Supabase migration security | A | 16.8 | 110 852 | 1 418 | 2 | 0.0253 |
| 1 | B | 19.8 | 171 983 | 1 845 | 3 | 0.0487 |
| 2 Stuck PR #379 | A | 25.7 | 284 062 | 2 390 | 5 | 0.1626 |
| 2 | B | 24.3 | 290 037 | 2 865 | 5 | 0.1690 |
| 3 Automation (world-quality-autopilot) | A | 11.8 | 110 380 | 815 | 2 | 0.1213 |
| 3 | B | 12.2 | 112 775 | 1 025 | 2 | 0.1240 |

*fresh + cache creation + cache read. Files changed: 0 and tests: n/a in all runs (read-only by design).

Savings, `100*(A-B)/A` (negative = Ponytail used more): total input -13.8%, output -24.1%, cost -10.5%, time -3.7%.

Caveats: 1 run per arm per task (smoke test, no variance); cost is distorted by prompt-cache state (task 1 first attempt kept in `logs/pair1_first_attempt/`); task 3 used `world-quality-autopilot.yml` because no workflow contains "AKA"; quality not scored — answers need owner review against independent assertions.
