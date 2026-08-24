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


---

# DESKTOP AI — WORLD SERVER V11.3 MANDATORY INSTRUCTION

This file is mandatory for every V11.3 installation, repair, upgrade, deployment, and quality-improvement run.

## Absolute rule

**Do not stop while a reproducible in-scope error remains unfixed or a changed behavior remains unverified.**

This does NOT mean repeating the same failing command forever:
- after 2–3 failed attempts, change strategy;
- inspect logs/evidence/contracts;
- isolate the failing subsystem;
- repair the root cause;
- add regression protection;
- rerun the failing test and the broader gate.

If an external permission or unavailable physical service blocks one item, record it explicitly, try another safe route, and continue all other actionable work. Never convert an external blocker into a fake PASS.

## 1. Before touching files

Read:
1. `AGENTS.md`
2. `DESKTOP_AI_INSTALL_AND_VERIFY.md`
3. this file
4. `WORK_IN_PROGRESS.md` if present

Then query the live Supabase work packet:

```sql
select public.quality_desktop_ai_work_packet();
```

Use the connected Supabase app/MCP when available. Never paste service-role secrets into chat or commit them.

Create/update `WORK_IN_PROGRESS.md` before editing. It must contain:
- exact goal;
- current Git SHA/branch;
- current runtime score;
- queued jobs and open gaps;
- systems affected;
- risks;
- exact patch plan;
- tests to run;
- errors that must not return;
- deployment / PR plan;
- completion criteria;
- final evidence.

## 2. Git safety

Never edit directly on `master`.

```powershell
git checkout master
git pull origin master
git status --short
git checkout -b ai/desktop/quality-runtime-v11-<timestamp>
```

If the working tree is not clean, preserve the user’s work first. Never discard unknown changes.

## 3. Close Git ↔ Supabase migration drift

Preferred automated path when `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY` are already available to the local process:

```powershell
node scripts/sync-supabase-migrations.cjs --apply
node scripts/sync-supabase-migrations.cjs --check-offline
node scripts/sync-supabase-migrations.cjs --check-live
```

The sync script:
- calls `quality_export_migration_history()`;
- backs up the old local migration folder before replacing SQL files;
- writes the exact production migration names and SQL statements;
- stores rollback statements separately;
- writes `data/supabase-migration-manifest.json`;
- verifies the server name digest.

If the environment variables are not available, do NOT request or expose the service key. Use the connected Supabase tool to call:

```sql
select public.quality_export_migration_history();
```

Then materialize the returned `version_name.sql` files exactly and build the same manifest.

Never “fix drift” by deleting production migration history.

## 4. Run quality gates

At minimum:

```powershell
npm ci
node --check scripts/sync-supabase-migrations.cjs
node --check scripts/record-supabase-repo-manifest.cjs
node scripts/sync-supabase-migrations.cjs --check-offline
npm run desktop-ai:check
npm run check
npm run release:gate
```

Run all relevant browser/runtime tests for any touched system. For gameplay or UI changes, include desktop + mobile Playwright evidence. Do not simplify graphics to make tests pass.

When a test fails:
1. capture exact error;
2. locate root cause;
3. fix the root cause;
4. add/update regression protection;
5. rerun the failed test;
6. rerun `release:gate`.

## 5. Pixel atlas gap

Live gap key:

`pixel.animation.atlas.missing`

Do NOT insert a fake atlas manifest.

Build a real texture atlas from real project pixel assets. After a real atlas exists, register it through:

```sql
select public.quality_register_pixel_atlas_manifest(
  '{
    "atlasKey":"world-pixel-atlas-v1",
    "version":1,
    "textureUrl":"/assets/pixel/world-atlas-v1.png",
    "width":2048,
    "height":2048,
    "manifest":{"frames":{"example":{"x":0,"y":0,"w":32,"h":32}}}
  }'::jsonb
);
```

Replace the example with the real URL, dimensions, and all real frame entries.

The server will reject:
- missing URL;
- invalid dimensions;
- empty `manifest.frames`.

The gap closes only after a valid manifest is recorded and the gap cycle verifies it.

## 6. Real-device gap

Live gap key:

`runtime.real-device.evidence.missing`

Do NOT mark emulator results as physical-device evidence.

Required for full device readiness:
- verified physical iOS report from the last 30 days;
- verified physical Android report from the last 30 days.

Ingestion contract:

```sql
select public.quality_record_real_device_report(<report-json>);
```

New reports are intentionally `verified=false`.

Verification requires provider/run/artifact evidence:

```sql
select public.quality_verify_real_device_report(
  '<report-uuid>',
  '{"provider":"<provider>","runId":"<run>","artifactUrl":"https://..."}'::jsonb
);
```

Check:

```sql
select public.quality_real_device_status();
```

Never claim real-device 100% until `ready=true`.

## 7. Security gap

Live gap key:

`supabase.security.security-definer-exposure`

Do not mass-revoke functions blindly. For each flagged SECURITY DEFINER function:
1. inspect its body;
2. inspect ownership/RLS contract;
3. determine intended caller;
4. prefer SECURITY INVOKER where possible;
5. otherwise keep SECURITY DEFINER only with explicit authorization checks and least-privilege EXECUTE grants;
6. rerun Supabase Security Advisor;
7. run auth/story/game regression tests.

## 8. Commit + PR

Before commit:

```powershell
git diff --check
git status --short
node scripts/sync-supabase-migrations.cjs --check-offline
npm run release:gate
```

Then:

```powershell
git add .
git commit -m "feat(quality): runtime V11.3 schema sync and autonomous quality loop"
git push -u origin HEAD
gh pr create --base master --fill
```

Do not bypass failing checks.

## 9. Protect master

After the new workflow has existed and produced its status checks, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\ensure-master-protection.ps1
```

Verify through GitHub API that `master` is actually protected. A local script existing is not evidence that protection is active.

## 10. Post-merge finalization

After the PR is merged:

```powershell
git checkout master
git pull origin master
node scripts/sync-supabase-migrations.cjs --check-offline
node scripts/sync-supabase-migrations.cjs --check-live
node scripts/record-supabase-repo-manifest.cjs
node scripts/fetch-quality-work-packet.cjs
```

The manifest recorder sends:
- the actual merged master SHA;
- the actual local migration filename list.

Then check live:

```sql
select public.quality_schema_drift_status();
select public.quality_runtime_score();
select public.quality_desktop_ai_work_packet();
```

## 11. Completion rules

Do not say “done” unless:
- no reproducible in-scope error remains;
- every modified behavior is re-tested;
- regression protection exists for confirmed fixes;
- `release:gate` passes;
- Git migration manifest matches the live database;
- the current master SHA is recorded in Supabase;
- production synthetic probe is healthy;
- runtime worker heartbeat is fresh;
- no compatible actionable runtime job remains;
- PR/deployment evidence is recorded.

Do not claim **overall 100%** while open non-runtime gaps such as real-device evidence, pixel atlas, or unresolved security review remain.

At the end always report:
- system readiness %;
- runtime score;
- connectivity %;
- remaining gaps;
- exact evidence for every PASS;
- exact blockers for every non-PASS.

