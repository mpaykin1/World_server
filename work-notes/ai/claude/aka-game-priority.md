# WORK IN PROGRESS — ai/claude/aka-game-priority

> Updated 2026-10-14. Task notes for this branch (AGENTS.md §11).

## Task
Point the five hourly ChatGPT roles (Builder, Fleet, Ocean, Architect, SRE Observer) at the game «Остров сумерек» in `AI_START_HERE.md`, where every new chat and role boots.

## Why
The owner, 2026-10-14: «Ты можешь отсюда все исправить чтобы 5 автозадач ГПТ занимались игрой ?».

The roles boot from `AI_START_HERE.md`, then the RESUME-ANY-CHAT checkpoint in issue #80. Their standing directive (2026-10-12) was 50% CLEAN_SERVER / 50% GRAPHICS-DEMO-001, the medieval demo in ChatGPT Library and Tech Lab. They kept away from the game («do not hijack capacity»).

The owner's new directive is posted in issue #80 (comment 6165494995), and the checkpoint now points to it. `AI_START_HERE.md` §9 still said «50% GRAPHICS / 50% CLEAN_SERVER не меняется». The roles report a STATE_CONFLICT and stop when sources disagree, so the boot file must say the same thing as the directive.

## Current state
master 7856dfd. `AI_START_HERE.md` has no current-priority entry; §9 fixes the 50/50 split.

## Target state
`AI_START_HERE.md` opens with the current priority (the game, §21/§22, the link to the directive), and §9 says 50/50 is paused.

## Files / systems involved
- AI_START_HERE.md

## Known risks
- Documentation only; nothing executes it. Tests that read `AI_START_HERE.md` (SZH, manual delivery, MF, project context) must stay green.

## Golden systems that must be preserved
- Controls
- Collisions
- Mobile support
- Compact UI/HUD
- Release certification
- Protected errors
- Approved Golden assets/components

## Errors that must not return
- Boot files that contradict the owner's latest directive, so roles stall on a state conflict.

## Exact patch / change plan
1. Add «Текущий приоритет пяти ежечасных ролей ChatGPT» after the introduction.
2. Replace the §9 line that fixed 50/50.

## Tests to run
- node --test test/szh-system.test.js test/manual-delivery-contract.test.js test/must-finish.test.mjs test/project-context-api.test.js
- node scripts/check-ai-context-discovery.js
- npm run check (ARCHITECTURE_BASE_REF = merge base)
- npm run desktop-ai:check

## Deployment / PR plan
Task branch -> CI -> PR -> merge on the owner's instruction (2026-10-14). Documentation only; no deploy.

## Current progress
Edit done; checks run.

## Next action
Open the PR and merge when the required checks are green.

## Completion criteria
- Required checks green.
- `AI_START_HERE.md` and the issue #80 checkpoint name the same priority.

## Final evidence
- node --test (SZH, manual delivery, MF, project context): 18/18 pass.
- check-ai-context-discovery: PASS.
- npm run check (ARCHITECTURE_BASE_REF=7856dfd): Syntax OK (88 files); Architecture PASS (0 changed code files); node --test 1238 tests, 1233 pass, 0 fail.
- npm run desktop-ai:check: PASS. check-agent-rules: PASS.
