# WORK IN PROGRESS — ai/claude/fix-ci-breakages

> Updated 2026-10-14. Task notes for this branch (AGENTS.md §11).

## Task
Fix the CI breakages that block work: the invalid AI Bridge ingress workflow, the Quality Canary that has never passed since it moved to Cloudflare, and the daily auto-fix PR that carries only regenerated reports.

## Why
The owner asked to fix every breakage that hinders work (2026-10-14).
- `.github/workflows/ai-bridge-ingress.yml` has been invalid YAML since b595e15 (2026-10-06): the template literal's lines at column 1 end the `script: |` block, and `**Task ID:**` then reads as a YAML alias. GitHub reports a failed run on every push to every branch, so every commit and PR shows a red X that is not a code defect.
- Quality Canary Deploy has not passed since it switched to Cloudflare (#212, 2026-09-21).
  - `Release gate` fails in the shallow checkout: the architecture gate (since #486) cannot find a base and counts every file as changed.
  - Before that, `Deploy immutable Cloudflare canary` failed from 2026-09-26. That day #313 added a cron trigger to `wrangler.jsonc`. Every canary deploys a new worker named per run with that cron, and the Free account has five cron slots. PR previews were fixed the same day by stripping crons (#317); the canary was not.
- Quality Auto-Fix PR opens a PR every day even when the auto-fix applied nothing: it commits every report JSON that the release gate regenerates. #504 has `changes: []` and 34 report files. Its checks wait for approval, so it rots and someone has to close it.

## Current state
master 7856dfd.
- Quality Canary: 161 failed runs; last success 2026-09-21 (Vercel-skip version).
- Ingress workflow: fails on every push.
- Daily auto-fix PRs #483, #489, #490, #492, #495, #497, #499 were all closed without merge; #504 is open with no source fix.

## Target state
- Every workflow file parses, and a test guards it.
- The canary checks out full history and deploys one serialized worker without cron triggers.
- The auto-fix opens a PR only for files it actually fixed and commits only those files.

## Files / systems involved
- .github/workflows/ai-bridge-ingress.yml
- .github/workflows/quality-canary.yml
- .github/workflows/quality-autofix-pr.yml
- test/workflow-yaml-valid.test.js (new)
- test/ai-bridge-workflow.test.js
- test/quality-canary-config.test.js

## Known risks
- Canary worker name changes from per-run to one stable `world-server-canary`: runs are serialized by a concurrency group, and each run verifies its exact SHA.
- Canary may still fail at a later step (browser gate failed 2026-09-23..26, cause unknown because logs are not readable here). Playwright now also reports through the GitHub reporter, so failures become readable annotations.
- Stale per-run canary workers stay on the Cloudflare account: deleting them is an irreversible resource change that needs the owner's explicit yes (§22.6).

## Golden systems that must be preserved
- Controls
- Collisions
- Mobile support
- Compact UI/HUD
- Release certification
- Protected errors
- Approved Golden assets/components

## Errors that must not return
- A workflow file that does not parse (red run on every push).
- Shallow checkout feeding the architecture gate.
- Preview or canary workers taking production Cloudflare cron slots.
- Report-only bot PRs.

## Exact patch / change plan
1. Ingress: build the child issue body from an indented array joined by newlines; add hidden `Task ID:` / `Origin Comment ID:` markers so the duplicate check matches.
2. Canary: `fetch-depth: 0`; a concurrency group; a stable worker name; strip crons into `.wrangler-canary.jsonc`; Playwright GitHub reporter.
3. Auto-fix: decide from `AUTOFIX_REPORT.json` changes; stage only the fixed files.
4. Test that every workflow parses and has triggers and jobs; extend the canary and ingress tests.

## Tests to run
- node --test test/workflow-yaml-valid.test.js test/ai-bridge-workflow.test.js test/quality-canary-config.test.js
- npm run check (ARCHITECTURE_BASE_REF = merge base)
- node scripts/check-agent-rules.js, npm run desktop-ai:check

## Deployment / PR plan
Task branch -> CI -> PR -> review by another company's AI (§22) -> merge on the owner's instruction («И починить все поломки которые мешают работе», 2026-10-14). The next master push runs the canary for real.

## Current progress
Patch applied and verified locally.

## Next action
Open the PR; merge when the required checks are green; watch the first canary run on master.

## Completion criteria
- Every workflow parses (test).
- Required checks green on the PR.
- After merge, the push to master shows no ingress failure; the canary passes `Release gate` and `Deploy`.

## Final evidence
- js-yaml parse of all 33 workflows: only ai-bridge-ingress.yml failed before the fix (`unidentified alias "*Task" at line 71`); all 33 parse after.
- Ingress script run against a mocked client: creates one child issue; a redelivered comment is skipped as a duplicate (it never matched before).
- Auto-fix detection simulated in a scratch repo: `changes: []` gives no PR; one applied fix stages only that file, report JSONs stay unstaged.
- New and extended tests fail on the master versions of the three workflows (7 failures) and pass on the fixed ones.
- npm run check (ARCHITECTURE_BASE_REF=7856dfd): Syntax OK (88 files); Architecture PASS (4 changed code files); node --test 1279 tests, 1274 pass, 0 fail, 5 skipped.
- node scripts/check-agent-rules.js: PASS. npm run desktop-ai:check: PASS.
- Live canary result after merge: recorded in the PR.
