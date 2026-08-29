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

<!-- CINEMATIC_VOXEL_QUALITY_V3_BEGIN -->
## Cinematic Voxel Quality V3 — mandatory graphics gate
For cinematic/high-detail 3D voxel scenes, primitive placeholder graphics are a release blocker. Reuse WorldQualityAutopilot and existing Golden/telemetry systems; run `npm run quality:cinematic:v3`, desktop/mobile captures and strict candidate scoring before claiming improvement. Preserve hero/near quality first; optimize occluded/offscreen/far work before render resolution or hero geometry. Every failure requires root cause + regression protection. See `docs/CINEMATIC_VOXEL_QUALITY_GUARD.md`.
<!-- CINEMATIC_VOXEL_QUALITY_V3_END -->

<!-- REFERENCE_VISUAL_GATE_BEGIN -->
## Reference Visual Gate — mandatory, user-set, permanent
Set by the user on 2026-08-28. Applies to every current and future project that has an approved reference image, not just one project. Only the user can relax or remove it; the AI may not lower a threshold or skip this on its own judgment, including for time/effort reasons.

Rule: before saying a visual result is done, ready, or finished (in any language - "готово", "результат готов", "final result", etc. are all forbidden while blocked), take a fresh screenshot, put it side by side against the project's approved reference image, and honestly self-score every category in that project's threshold table in `data/reference-visual-gate.json` (0-100, no rounding up, no benefit of the doubt). If ANY category scores below its threshold, the result MUST be reported as IN PROGRESS: name every category still under threshold with its current vs target number, and state the next concrete action. Do not present it as final.

For a new project with a reference image: define categories analogous to `data/reference-visual-gate.json`'s `categoryTemplate` (renaming the two subject-specific slots to that project's real focal subjects), default to `categoryTemplate.defaultThresholds` unless the user gives different numbers, and add a new entry under `projects` in that same file before doing any further work on it.

See `data/reference-visual-gate.json` for the full policy text, current thresholds, and last recorded score per project.
<!-- REFERENCE_VISUAL_GATE_END -->

<!-- GODOT_VOXEL_GAME_BASELINE_BEGIN -->
## Voxel Game Baseline — mandatory, user-set, permanent, engine-agnostic
Set by the user 2026-08-28/29, proven in `godot/dark-void-scene` AND its browser port `apps/dark-void-scene`. Every new voxel-art project — Godot or browser/Three.js — starts from this baseline instead of rediscovering it from scratch. Only the user can relax or remove it. (File/section name predates the browser port; the rules apply to both.)

Godot: copy `templates/godot-voxel-game-starter/`. Browser: copy/import `shared/dark-void-scene-runtime.mjs` (verified formula-for-formula port — same hash2/fbm1/ridgeHeight, same ROCK_DARK/MID/LIT hex, same 5:1 ratio, same true-orbit rig, same world/hero separation) plus `shared/navigator-dialog.mjs` for the intro panel; see `apps/dark-void-scene/client.js` for the reference wiring. The hard rules, in one line each — full detail and the exact bugs each one prevents are in `data/godot-voxel-game-baseline.json` and the matching entries in `data/error-prevention-registry.json`:
- Hero voxels are always exactly 5x smaller than world voxels (`HERO_VOX := WORLD_VOX / 5.0`) — both per-cube and overall subject scale.
- Camera is a true orbit rig: the rig node's own `position` is `(0,0,0)` at the tracked subject's origin; the back/up offset lives only inside the rig's internally-built camera child, never duplicated on the rig's own transform.
- World/terrain and the hero are always siblings, never parent/child in either direction.
- Materials: white albedo + per-instance vertex color, `roughness < 1.0`, real per-instance palette colors capped hard (~15-20% toward the lit anchor) rather than a grayscale multiply or full-strength hex.
- A dedicated rim/key light for silhouette definition against a dark/void sky (Godot: `DirectionalLight3D` with `sky_mode = LIGHT_ONLY`).
- Godot on an old/weak target GPU: `renderer/rendering_method = "gl_compatibility"` + `--rendering-driver opengl3`; volumetric fog silently doesn't work there, use exponential/height fog instead.
- Verify every "done" claim with a REAL standalone/build-equivalent run, not just the editor's live Play or an unverified page load — Godot: `godot.exe --path <project> --rendering-driver opengl3` checking console for `SCRIPT ERROR`/`Parse Error`; browser: actually read back rendered pixel data or DOM state via automation, don't assume a page "loaded" means it rendered.
- godot-ai MCP's `node_create` parent parameter is `parent_path`, not `parent` (silently ignored otherwise).
- three.js (this repo's vendored build): never name an `Object3D` subclass's own property `pivot` — reproducibly corrupts that object's matrix (see error-prevention-registry.json's `threejs-object3d-subclass-pivot-property-corrupts-matrix`). Use `pitchGroup` or similar.
<!-- GODOT_VOXEL_GAME_BASELINE_END -->
