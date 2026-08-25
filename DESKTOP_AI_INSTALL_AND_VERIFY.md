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

## 13. Truthful 100% production-certification rule

Desktop AI MUST treat `100%` as a certification claim, not as a rounded implementation score.

`readinessPercent` MUST NOT be 100 unless ALL of the following are true:

1. Every declared visual baseline in `WORLD_VISUAL_BASELINE_CANDIDATES.json` has a matching `APPROVED` entry in `data/visual-baselines.json`.
2. `data/real-device-provider.json` is `CONFIGURED`.
3. `WORLD_DEVICE_PROFILE_MATRIX.json` reports `percent: 100` and `evidence.physicalProvider: true`.
4. At least one animation/runtime-rig sample is explicitly `productionEligible: true`, contains a real non-synthetic source, has at least six mapped skeleton entries, and contains runtime constraints.
5. The required GitHub CI sequence has passed and recomputed World Quality with `WQA_REQUIRED_CI_PASS=true`.

Synthetic, fixture, mock, fake, emulated, or `local-test` evidence MUST NEVER satisfy production runtime evidence.

A single approved baseline MUST NEVER stand in for the complete baseline matrix.

If any production-certification condition is missing:

- `production100Certified` MUST be `false`;
- `readinessPercent` MUST be capped below 100;
- the exact blocker IDs MUST be printed and written to the report;
- do not auto-promote aesthetic baselines;
- do not relabel synthetic evidence as real;
- do not weaken tests, thresholds, or contracts to obtain a higher score.

Desktop AI must continue fixing patch-related failures until all fixable errors are resolved. External blockers such as unavailable physical-device evidence must remain visible blockers rather than being faked or bypassed.

---

# Desktop AI — System Integration V7.5

## Mandatory behavior
1. Never install on `master`/`main`; create an `ai/desktop/...` branch.
2. Install patches 01→18 in order, then install patch 19 V7.5 last.
3. Do not use last-writer-wins. Unknown or locally improved files require semantic merge and a version bump.
4. Never call a function 100% because a file exists. `CERTIFIED_100` requires its explicit machine-readable contract and fresh evidence newer than the source.
5. A new feature must strengthen existing `CERTIFIED_100` functions. Run Honest-100 + Monotonic Guard before promotion. If a certified function regresses, block promotion and restore/fix it; do not waive the gate.
6. Preserve mandated technologies/APNG and finished graphics. Never simplify/remove working graphics, physics, movement, shadows, textures, light, sound variation or gameplay spatial contracts.
7. Prefer scalable, CPU-first, minimum-manual-action solutions. Improve safe items automatically; never require GPU.
8. Always deliver full corrected files, never ask the user to edit individual lines. Never paste HTML into chat; provide a downloadable artifact instead.

## Exact V7.5 verification
Run from repository root:
`npm run integration:full`
`npm run release:gate`
`npm run integration:functions:audit`
`npm run integration:functions:coverage`
`npm run integration:functions:verify`
`npm run integration:cas:replicate`
`npm run integration:device-fleet`
`npm run integration:slo:autopilot`
`npm run integration:db:fencing`
`npm run integration:causal:native`

## Long-run evidence — never fake it
Run `npm run integration:soak:long` until at least 8 real wall-clock hours are recorded; 24h is preferred. Short smoke PASS proves the harness only and MUST NOT set `longSoakCertified=true`.

## External/native truth gates
Operational 100% is forbidden until all applicable evidence is real/fresh: safe Cosign >=3.1.3; independent remote CAS peer; fresh real Android+iOS; native Wasmtime/TLC where required; completed dependency security scan; transactional production deployment evidence; fenced production leader lease; live fenced migration evidence when migrations are in scope; native ETW/eBPF/perf/OBI collector when native causal coverage is claimed; >=8h long-soak evidence.

## Failure loop
For every reproducible failure: root cause → replace/fix complete file/system → rerun affected tests → `integration:full` → `release:gate`. Never stop at a false green. Preserve Stable until Candidate passes all evidence.

## Final report
Report separately: structural readiness %, evidence confidence %, operational readiness %, Honest-100 certified/contracted count, global capability certification %, external blockers, failed gates, branch/commit/deployment evidence. Never merge those into a misleading single 100%.
