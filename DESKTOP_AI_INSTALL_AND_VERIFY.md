# DESKTOP AI — WORK / PATCH / VERIFY PROTOCOL

> Mandatory operating instruction for any Desktop AI working on `World_server`.
> This file must be read before editing code, applying a patch, running deployment, or reporting completion.

## 1. Current mission

The project is moving toward a self-improving AI Game Factory where:

- every project can only preserve or improve accepted quality;
- one fixed error becomes permanently regression-protected;
- one approved successful solution becomes a reusable Golden Component;
- changes to shared systems are checked in every affected project;
- no broken world, diagnostic app, or unverified candidate may be published as a normal playable release;
- desktop + mobile + controls + collisions + UI + graphics + performance are release contracts.

## 2. Before doing any work

Desktop AI MUST:

1. Read:
   - `AGENTS.md`
   - `DESKTOP_AI_INSTALL_AND_VERIFY.md`
   - `WORK_IN_PROGRESS.md`
   - `data/quality-scorecard.json`
   - `data/quality-baseline.json`
   - `data/error-prevention-registry.json`
   - `data/golden-components.json`
   - `data/system-contracts.json`
2. Confirm the current Git branch.
3. NEVER work directly in `master`.
4. Create a task branch:
   - `ai/desktop/<task>`
   - or `opencode/<task>`
5. Run the baseline gates before editing:
   - `npm ci`
   - `npm run release:gate`
   - `npm run quality:diff`
6. If baseline is already failing, record the exact failure in `WORK_IN_PROGRESS.md` before changing anything.

## 3. Mandatory task instruction

For EVERY new task or patch, Desktop AI MUST update `WORK_IN_PROGRESS.md`.

It must contain:

- `Task`
- `Why`
- `Current state`
- `Target state`
- `Files / systems involved`
- `Known risks`
- `Golden systems that must be preserved`
- `Errors that must not return`
- `Exact patch / change plan`
- `Tests to run`
- `Deployment / PR plan`
- `Current progress`
- `Next action`
- `Completion criteria`
- `Final evidence`

A patch without an up-to-date `WORK_IN_PROGRESS.md` is INVALID.

## 4. What to do with a received patch / ZIP

When a patch or Golden Standard ZIP is supplied:

1. Do NOT copy files blindly into `master`.
2. Create a new branch from the current accepted base.
3. Back up affected files.
4. Read the patch manifest and README.
5. Run the installer only in the task branch.
6. If an installer fails an exact anchor:
   - STOP that patch application;
   - do not approximate silently;
   - inspect the current source;
   - adapt the patch deliberately;
   - document the adaptation in `WORK_IN_PROGRESS.md`.
7. Run:
   - `npm run release:gate`
   - `npm run quality:fuzz`
   - `npm run quality:stability`
   - `npm run quality:impact`
   - `npm run quality:root-cause`
   - `npm run quality:knowledge`
8. Run Playwright desktop/mobile/device matrix.
9. Verify every affected app from `QUALITY_CHANGE_IMPACT.json`.
10. Never raise a score merely because code was added. Raise only with evidence.
11. If any accepted metric drops:
   - DO NOT merge;
   - DO NOT deploy;
   - fix the regression or revert the candidate.
12. Open a PR only after required gates pass.

## 5. Special patch rules

Desktop AI MUST preserve:

- canonical camera-relative controls;
- correct W/S/A/D + arrows;
- Space = vertical jump only;
- camera roll = zero;
- grounded spawn;
- wall collision;
- stair step-up <= 1.05;
- mobile controls;
- compact non-obstructive system UI;
- deny-by-default release registry;
- protected regression tests;
- exact approved Golden assets/components;
- working graphics and gameplay that are not part of the task.

Do not “simplify” away a working quality feature to make another test pass.

## 6. Shared-system rule

Before changing `shared/*`, Desktop AI MUST run:

- `npm run quality:impact`

All affected apps must be tested.

If a successful fix is reusable:

1. identify the exact implementation;
2. register/promote it through Golden mechanisms;
3. propagate/adopt it in compatible projects;
4. add regression coverage.

## 7. Confirmed-error rule

When the user confirms an error is fixed:

1. mark it protected in `data/error-prevention-registry.json`;
2. add or generate a regression test;
3. run the test;
4. update `WORK_IN_PROGRESS.md`;
5. do not rely only on conversation memory.

## 8. Approved-success rule

When the user says a component/graphic/system is excellent:

1. preserve the EXACT source/asset;
2. hash/version it;
3. register it as Golden;
4. propagate to compatible apps;
5. add adoption checks;
6. never replace it with an approximation without an explicit verified migration.

## 9. UI rule

Persistent technical/debug text is forbidden outside compact system menus.

Allowed persistent gameplay HUD:
- reticle;
- health;
- hotbar/inventory;
- active objective;
- immediate context action.

System/debug/settings/world selection must live behind compact buttons.

## 10. Deployment protocol

Desktop AI must prefer:

`branch -> PR -> CI -> preview/canary -> behavioral tests -> production promotion`

Never deploy an untested local working tree directly to production.

If canary or post-deploy smoke fails:
- abort/rollback;
- keep the previous production release;
- record the failure;
- create regression protection if it exposed a new bug.

## 11. Completion is forbidden until

Desktop AI may NOT say “done” until it has:

- updated `WORK_IN_PROGRESS.md`;
- run required static/unit/fuzz gates;
- run desktop/mobile behavior tests where applicable;
- checked all affected apps;
- produced `QUALITY_MASTER_REPORT.json` or equivalent evidence;
- confirmed no accepted metric regressed;
- documented remaining blockers;
- created a PR or produced a ready-to-apply patch if repository write is unavailable.

## 12. Final response format

Desktop AI must report:

1. Branch / commit / PR.
2. What changed.
3. What was preserved.
4. Tests and PASS/FAIL.
5. Quality table: `Before -> After -> Delta`.
6. Affected projects tested.
7. New regression protections.
8. New Golden components/adoptions.
9. Remaining blockers.
10. Exact next action.
11. Preview / production link only if verified working.

Never invent a successful deployment, URL, test pass, or integration.


## 13. V11 CPU-only night autopilot

Hard project constraint for this installation:

- GPU must NOT be required.
- Paid GPU must NOT be used.
- Paid compute for the quality-autopilot loop must remain zero.
- Night learning uses CPU and verified quality history only.

When applying V11:

1. Apply `supabase/migrations/20260824010000_silent_cpu_autopilot.sql`.
2. Configure server secrets:
   - `CRON_SECRET`
   - `AUTOPILOT_WORKER_TOKEN`
   - existing Supabase server credentials.
3. Verify `vercel.json` contains only the allowed daily CPU-autopilot cron and does not exceed Hobby-plan cron limits.
4. Run:
   - `npm run quality:cpu-policy`
   - `npm run quality:night-plan`
   - `npm run quality:night-report`
   - `node --test test/cpu-night-autopilot.test.js`
   - `npm run release:gate`
5. On the Windows machine that owns `World_server`, install:
   - `desktop/install-cpu-night-task.ps1`
6. Test once manually:
   - `desktop/run-cpu-night-now.cmd`
7. Confirm:
   - every planned task has `requiresGpu=false`;
   - every planned task has `estimatedPaidCost=0`;
   - dirty worktree is rejected;
   - failed candidate is reset/deleted;
   - accepted quality never decreases.
8. Do not enable full production autopilot until candidate mode has accumulated real overnight evidence.

### What to do with this patch

Install V11 only on a task branch. Do not overwrite `master` directly.
Keep the generated nightly `.patch` candidates for review.
If GitHub write is available, open a PR only after all gates pass.
If GitHub write is unavailable, leave the candidate patch and final evidence for the next Desktop AI session.


## 14. V12 CPU Evolution Engine

V12 adds CPU-only continuous evolution. Desktop AI must use it without GPU and without paid compute.

### Install / verify V12

1. Work only in a task branch.
2. Update `WORK_IN_PROGRESS.md` before project edits.
3. Install free CPU Python dependencies:
   - `python -m pip install -r requirements-cpu-quality.txt`
4. Run:
   - `npm run quality:cpu-policy`
   - `npm run quality:adaptive-budget`
   - `npm run quality:night-plan`
   - `npm run quality:curriculum`
   - `npm run quality:knowledge-learn`
   - `npm run quality:cpu-genetic`
   - `npm run quality:incremental-tests`
   - `npm run quality:auto-test-synth`
   - `node --test test/v12-cpu-evolution.test.js`
   - `npm run release:gate`
5. CPU texture test:
   - `npm run quality:textures`
   - inspect `CPU_TEXTURE_FACTORY_REPORT.json`
   - never overwrite originals.
6. CPU mesh test:
   - `npm run quality:mesh-scan`
   - inspect `CPU_MESH_SCAN_REPORT.json`
   - HQ originals must remain intact.
7. Optional local code model:
   - set `QUALITY_LLAMA_CLI` to local `llama-cli`;
   - set `QUALITY_CPU_MODEL` to a local GGUF code model;
   - GPU layers MUST remain zero (`-ngl 0`);
   - run `npm run quality:cpu-tournament`.
   Absence of a local model is not a release failure.
8. Compare changed visual output against approved references with the CPU SSIM tool where approved baselines exist.
9. Run full release gate after all incremental tests.

### Mandatory error-closure loop

Desktop AI MUST NOT stop at the first green-looking patch.

Repeat:

`scan -> reproduce -> root cause -> fix -> incremental tests -> full gate -> rescan`

until:
- there are no remaining fixable blockers;
- there are no failed mandatory gates;
- protected errors have not returned;
- no accepted quality metric regressed.

Before writing "done", run the platform equivalent of:

`DESKTOP_AI_REQUIRE_COMPLETE=1 npm run desktop-ai:error-closure`

On Windows CMD:

`set DESKTOP_AI_REQUIRE_COMPLETE=1 && npm run desktop-ai:error-closure`

On PowerShell:

`$env:DESKTOP_AI_REQUIRE_COMPLETE="1"; npm run desktop-ai:error-closure`

If a blocker is truly external, record it in `DESKTOP_AI_EXTERNAL_BLOCKERS.json` with:
- exact evidence;
- why it cannot be fixed in the current repo/session;
- exact next action.

An undocumented external blocker is NOT a valid reason to stop.

### What to do with the V12 patch

- Apply only on a task branch.
- Do not lower quality settings globally just to improve FPS.
- Keep CPU genetic profiles as candidates until behavioral + visual gates pass.
- Keep texture/mesh outputs non-destructive.
- Do not commit generated cache files unless they are explicitly part of an approved asset migration.
- If an improvement works across projects, convert it to a Golden pattern/component and propagate it.
- If an attempted improvement repeatedly fails, record it in Failure KB / Never-Retry.


## 15. V13 Self-Calibrating CPU Quality

V13 must remain CPU-only and zero-paid-compute.

### V13 installation sequence

1. Create/update the task branch and `WORK_IN_PROGRESS.md`.
2. Install the V13 patch with the normal installer.
3. Install free CPU Python requirements:
   - `python -m pip install -r requirements-cpu-quality.txt`
4. Run:
   - `npm run quality:cpu-policy`
   - `npm run quality:hardware-profile`
   - `npm run quality:bayesian`
   - `npm run quality:invariants`
   - `npm run quality:self-calibrate`
   - `npm run quality:adaptive-budget`
   - `npm run quality:night-plan`
   - `npm run quality:incremental-tests`
   - `npm run quality:test-cache-smoke`
   - `node --test test/v13-self-calibrating.test.js test/v13-visual-assets.test.js test/v13-invariant-golden.test.js`
5. Run CPU asset checks:
   - `npm run quality:asset-similarity`
   - `npm run quality:mesh-scan`
6. If approved visual baseline screenshots exist, run the CPU Visual Ensemble for every affected visual app.
7. Run the full `npm run release:gate`.

### Checkpoint rule

Long CPU jobs must checkpoint. If the night window ends or the machine becomes busy:
- save the current generation/state;
- exit safely;
- resume next night;
- never restart an expensive deterministic search from zero unnecessarily.

### Test-cache rule

- Hash command + changed inputs + lockfile + runtime.
- Reuse only an exact matching PASS.
- A cache hit cannot substitute for live/canary/post-deploy checks.
- The full final release gate remains mandatory.

### Invariant mining

New inferred invariants remain `candidate` until independently validated.
Do not automatically turn correlation into a release rule.

### Multi-file Golden Pattern

If a successful solution spans several files:
1. verify the complete solution;
2. obtain explicit approval;
3. snapshot the exact files and hashes with `promote-golden-pattern`;
4. propagate only the exact verified version;
5. preserve rollback/version history.

### Strict finish rule

Before saying the task is complete:

1. Run `npm run desktop-ai:fix-loop`.
2. Inspect every failing report.
3. For any remaining fixable error, perform manual root-cause and fix it.
4. Rerun `npm run desktop-ai:fix-loop`.
5. Repeat until it is clean.
6. Run the full release gate.
7. Run strict error closure:

PowerShell:
`$env:DESKTOP_AI_REQUIRE_COMPLETE="1"; npm run desktop-ai:error-closure`

CMD:
`set DESKTOP_AI_REQUIRE_COMPLETE=1 && npm run desktop-ai:error-closure`

Desktop AI MUST NOT stop while a fixable error or mandatory failed gate remains.

If the only remaining blocker is external, it must be documented with exact evidence and exact next action. Never report an external blocker as a fixed system.
