# Desktop AI — Gap Closure Protocol V1

## Goal
Close real system gaps, not report them. A gap is closed only after fresh verification evidence proves the original failure condition is gone.

## Non-negotiable rules
1. Never work directly on `master` or `main`.
2. Never auto-merge a PR.
3. Never lower a quality baseline to make a test pass.
4. Never mark a gap closed because a patch was written. Patch -> canonical tests -> runtime/canary evidence -> closed.
5. Never delete or simplify existing graphics, physics, animation, controls or effects to satisfy performance gates.
6. Prefer deterministic, reversible fixes. Unknown/high-risk fixes become Desktop AI tasks, not blind mutations.
7. If a fix fails, record the exact error, classify root cause, change the strategy, rerun. Do not stop while a blocker or auto-fixable gap remains.
8. `100%` is allowed only when `GAP_CLOSURE_STATUS.json.perfectReadiness === true` and all canonical reports are fresh.

## Install
Create a branch from the newest quality branch, ideally:
`ai/desktop/world-quality-autopilot-v4` -> `ai/desktop/gap-closure-v1`.

Copy the patch folder into the repository and run:
`node install-gap-closure-v1.cjs <repo-path>`

The installer must refuse protected branches.

## Mandatory cycle
Run this cycle until no release blocker remains:

1. `npm run project:review`
2. `npm run quality:world:full`
3. `npm run quality:gaps`
4. `npm run quality:gaps:apply`
5. `npm run project:review`
6. `npm run quality:world:full`
7. `npm run check`
8. `npm run golden:check`
9. `npm run quality:regression`
10. `npm run quality:perceptual`
11. `npm run quality:stability`
12. `npm run quality:gaps:gate`

If step 12 fails, read `GAP_CLOSURE_REPORT.json`, fix the highest-severity root cause, and repeat the full cycle.

## Database behavior
`public.run_gap_closure_db_cycle()` is the canonical DB detector. It runs every 5 minutes and tracks:
- fresh runtime evidence across client telemetry + synthetic probe + runtime state;
- pixel animation atlas materialization;
- physical-device evidence;
- stale quality-worker jobs;
- exposed SECURITY DEFINER execute grants.

It writes:
- `public.gap_closure_registry`
- `public.gap_closure_evidence`
- `public.gap_closure_runs`

It may enqueue deterministic worker jobs, but must not auto-revoke security grants or perform destructive fixes.

## Closure states
`detected -> queued -> fixing -> verifying -> canary -> closed`

Use `blocked` only when an external dependency is genuinely unavailable. A blocked gap remains non-100% and must contain exact dependency/evidence.

## Current priority order
1. Production quality regression / unavailable production summary.
2. Mobile `viewport-fit=cover` major finding.
3. Stale or unprocessed quality-worker jobs.
4. Pixel atlas manifest generation and verification.
5. Supabase SECURITY DEFINER least-privilege review.
6. Real iOS + Android device evidence.
7. Optimization/runtime quality from 97-98% to verified 100%.

## Definition of done
Do not stop until:
- no release blockers;
- no auto-fixable gaps remain open;
- `release:gate` passes;
- production quality check passes;
- every closed gap has verification evidence newer than the patch that fixed it;
- PR contains reports and tests, and master has not been pushed directly.
