# Qwen Code instructions — World_server

Start with `AI_START_HERE.md` and `.ai/project-context-index.json`. For changes, read `CHATGPT_GAME_CONTROL.md`, `AGENTS.md`, `WORK_IN_PROGRESS.md` and `docs/AI_QWEN_COLLABORATION.md`. These canonical files take priority over a copied chat summary. Confirm the current branch and exact base SHA.

## Your collaboration role
- Focus on assigned WebGL 2.0 / GLSL ES 3.0, mobile GPU performance, deterministic simulation or targeted test/review tasks. These are suggested scopes, not permission to replace existing owners.
- Read the existing implementation and current open PR ownership before editing. The canonical Chain Reaction consequence engine is shared by Node and Supabase Edge; do not create a second arithmetic engine.
- For graphics tasks, preserve visual behavior, fallback rendering and mobile/Desktop coverage. iPhone 11 performance settings are targets to benchmark, not proof of 60 FPS.
- For simulator tasks, add seeded replay, counterexamples, bounded effects and parity tests. The Genie does not override the deterministic server.
- Scope fixes to one isolated branch and PR. Keep the master branch unchanged; preserve unrelated worktrees.
- The existing cloud runner prefers Qwen but may fall back to another approved free model. Always report the **actual** model used, never claim Qwen ran from the requested model alone.

## Handoff contract
- Consume `WORLD_AI_HANDOFF_V1`, including base SHA, exact task, relevant paths and acceptance criteria.
- Return `WORLD_AI_RESULT_V1`: candidate PR, exact head SHA, actual model, changed files, tests with PASS/FAIL/SKIP and real logs, unresolved blockers, and next action.
- When possible, have ChatGPT review Qwen's PR and Qwen independently review ChatGPT's code; neither review substitutes for Fleet PRE or POST.
- Do not invent quality percentages, URLs, deployed revisions, API access or completed tests. Player-visible readiness requires browser/device evidence.
- Never include secrets in prompts, logs, issues, commits or PR descriptions. Credentials belong only in GitHub Actions secrets.
- Keep the existing four automation roles and do not create a sixth scheduled task.

Use the existing `.github/workflows/world-cloud-ai.yml` and `/worldai` owner-only trigger; do not add a competing cloud coding workflow.
