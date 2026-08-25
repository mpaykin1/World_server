# DESKTOP AI V12.3 — MANDATORY INSTALL / VERIFY / REPAIR PROTOCOL

## Non-stop rule

**Do not stop while any reproducible in-scope error remains unfixed or any changed behavior remains unverified.**

This rule does not mean repeating the same failed command forever.

After 2–3 failed attempts:
1. stop repeating the same strategy;
2. inspect logs/evidence/contracts;
3. isolate the root cause;
4. try a different safe repair path;
5. add regression protection;
6. rerun the failing test;
7. rerun the wider release gate.

If an external permission or unavailable physical provider blocks one item, record the blocker and continue all other actionable work. Never fabricate a PASS.

## Phase 0 — refresh state

Before editing:

```powershell
git checkout master
git pull origin master
git status --short
git rev-parse HEAD
```

Read:
- `AGENTS.md`
- `DESKTOP_AI_INSTALL_AND_VERIFY.md`
- this file
- `WORK_IN_PROGRESS.md`

Query the live Supabase work packet using the connected Supabase tool:

```sql
select public.quality_desktop_ai_work_packet();
```

Record in `WORK_IN_PROGRESS.md`:
- current master SHA;
- current runtime score;
- open gaps;
- queued jobs;
- security unexpected count;
- schema drift state;
- master protection state;
- OIDC bridge state;
- production probe state;
- exact patch plan;
- tests;
- errors that must not return;
- deployment/PR plan.

## Phase 1 — install V12 Git-side bridge

Run from the extracted package:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\INSTALL_V12_3.ps1 -RepoPath "C:\Users\user\Desktop\World_server"
```

The installer MUST:
- create a new `ai/desktop/...` branch;
- never edit `master` directly;
- add the OIDC bridge workflow and scripts;
- update Desktop AI/AGENTS instructions;
- run syntax checks;
- run `npm run desktop-ai:check`;
- run `npm run check`;
- run `npm run release:gate`;
- push the task branch;
- open a PR.

Do not merge if required checks fail.

## Phase 2 — merge bridge PR

Watch the PR:

```powershell
gh pr checks <PR_NUMBER> --watch --fail-fast
```

Fix every reproducible failure. Do not disable or bypass checks.

When green:

```powershell
gh pr merge <PR_NUMBER> --squash --delete-branch
```

## Phase 3 — run exact production migration sync

After the V12 workflow exists on `master`:

```powershell
git checkout master
git pull origin master
gh workflow run "Quality Runtime Bridge V12"
```

Watch the run:

```powershell
gh run list --workflow "Quality Runtime Bridge V12" --limit 5
gh run watch <RUN_ID> --exit-status
```

The scheduled/manual sync uses GitHub Actions OIDC with audience:

`world-server-quality-bridge`

It must NOT require a stored Supabase service-role key.

The bridge returns the exact live production migration history. The workflow materializes it in `supabase/migrations/` and opens/updates:

`ai/quality/supabase-schema-sync`

The old six mismatched migration files must disappear from the canonical folder because Git history already preserves them. Never delete production migration history.

## Phase 4 — validate and merge the schema-sync PR

```powershell
gh pr list --head ai/quality/supabase-schema-sync
gh pr checks <SCHEMA_PR_NUMBER> --watch --fail-fast
```

Required verification:
- materializer syntax PASS;
- local migration name digest PASS;
- exact server migration-name digest PASS during sync run;
- `npm run release:gate` PASS;
- no unexpected deletion outside migration/manifest scope.

Then merge:

```powershell
gh pr merge <SCHEMA_PR_NUMBER> --squash --delete-branch
```

## Phase 5 — post-merge attestation

A push to `master` triggers the V12 workflow. It must:
- obtain a fresh GitHub OIDC token;
- record the actual merged master SHA;
- send exact migration filenames to Supabase;
- require `quality_schema_drift_status().drift = false`;
- read GitHub branch protection;
- record that external-control evidence in Supabase;
- fetch and upload the new work-packet as a workflow artifact.

Check live:

```sql
select public.quality_schema_drift_status();
select public.quality_runtime_score();
select public.quality_security_definer_status();
select public.quality_external_controls_status();
select public.quality_github_bridge_status();
select public.quality_desktop_ai_work_packet();
```

Do not mark schema sync complete until `drift=false`.

## Phase 6 — protect master

Once the new PR checks exist:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\ensure-master-protection-v12.ps1
```

Then verify with GitHub API:

```powershell
gh api repos/mpaykin1/World_server/branches/master --jq '{protected:.protected,contexts:.protection.required_status_checks.contexts}'
```

Expected:
- `protected = true`
- required contexts include the actual existing checks, including `quality-bridge-static`.

Run the V12 workflow once more so Supabase receives fresh `protected=true` evidence.

Do not close `github.master.protection.disabled` manually.

## Phase 7 — pixel atlas

Gap:

`pixel.animation.atlas.missing`

Do not create a fake manifest.

Run:

```powershell
node scripts/build-pixel-atlas-v12.cjs --scan
```

If real pixel PNG/WebP assets exist, build a real atlas and verify dimensions/frame map. Then register through the connected Supabase tool:

```sql
select public.quality_register_pixel_atlas_manifest(<REAL_MANIFEST_JSON>);
```

Requirements:
- real texture URL/path;
- valid width/height;
- non-empty `manifest.frames`;
- real frame rectangles.

If there are no real pixel source assets in the repository, leave the gap open and record that exact blocker.

## Phase 8 — real physical devices

Gap:

`runtime.real-device.evidence.missing`

Do not count desktop emulation, Playwright device profiles, or a spoofed user-agent as physical-device evidence.

Full PASS requires:
- verified physical iOS evidence <= 30 days old;
- verified physical Android evidence <= 30 days old.

Use:

```sql
select public.quality_record_real_device_report(<REPORT_JSON>);
select public.quality_verify_real_device_report('<REPORT_ID>', <PROVIDER_EVIDENCE_JSON>);
select public.quality_real_device_status();
```

Never set `verified=true` without real provider/run/artifact evidence.

## Phase 9 — security

Run:

```sql
select public.quality_security_definer_audit();
select public.quality_security_definer_status();
```

At package creation:
- audited: 23;
- authenticated guarded: 21;
- intentional public read: 2;
- unexpected: 0.

If `unexpected > 0`, do not mass-revoke blindly. Inspect each function, intended callers, auth guards, RLS contract, and regression tests.

## Final completion criteria

Do NOT say “100%” unless all applicable items are proven:
- no reproducible in-scope error remains;
- all changed behavior re-tested;
- regression protection added for confirmed fixes;
- `npm run release:gate` PASS;
- schema drift false;
- master protected true with fresh GitHub API evidence;
- OIDC bridge positive-path success recorded;
- production synthetic probe healthy;
- runtime worker heartbeat fresh;
- security unexpected count 0;
- pixel atlas real and verified;
- verified physical iOS + Android evidence present;
- no compatible actionable job remains.

At the end report:
- overall readiness %;
- runtime score;
- system connectivity %;
- each remaining gap;
- evidence for each PASS;
- exact reason for every non-PASS.
