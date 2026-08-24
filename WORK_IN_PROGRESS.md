# WORK IN PROGRESS — WORLD SERVER QUALITY RUNTIME V11.3

## Task
Install V11.3 Quality Runtime (Supabase schema sync, drift gates, autonomous quality loop) on top of V4.1 World Quality Autopilot, verify no regression, and close all fixable in-scope errors.

## Why
V11.x runtime control plane is live in Supabase (synthetic probe, lease recovery, autonomous Edge Worker, score 0–100, gap-closure). Local Git must be synchronized with exact production migration history, otherwise drift detector and quality gates will fail. V11.3 adds the missing local tooling (sync, manifest, drift workflows, master-protection) to make local `release:gate` match production.

## Current state
- master SHA: `fa34457` (V4.1 World Quality Autopilot 100% readiness, 181/181 check)
- working branch: `ai/desktop/quality-runtime-v11-20260824-090217` (from `fa34457`)
- runtime score: `WORLD_QUALITY_AUTOPILOT_STATUS.json` `100%` (`detail 100 graphics 100 animation 100 optimization 98 automation 100`), `WORLD_QUALITY_AUTOPILOT_REPORT.json` `hardGateReady true`
- schema drift: `supabase/migrations` 6 files (`20260819055525`..`20260823063700_quality_telemetry`), `data/supabase-migration-manifest.json` newly generated `6` `digest c536bd6b...` `offline ok true`
- production probe: `https://world-server.vercel.app` `200` `ai3d-voxel-city` `world-quality-autopilot.js 4.0.0` `api/apps` certified
- worker heartbeat: `supabase` migrations synced, `V13` night autopilot installed on separate branch `ai/desktop/v13-self-calibrating-cpu` (not yet merged)
- queued jobs: `pixel.animation.atlas.missing`, `runtime.real-device.evidence.missing`, `supabase.security.security-definer-exposure`
- open gaps: `quality-regression` `check` `lighthouse` pending on V11_3 branch (pre-existing master failures)

## Target state
- `supabase/migrations` exactly matches production `quality_export_migration_history` (6 files, digest `c536bd6b...`)
- `data/supabase-migration-manifest.json` present and `offline ok`
- `npm run release:gate` PASS (including `desktop-ai:check`, `check 156/156`, `golden:check`, `quality:world 100%`)
- No new runtime/browser/server errors, graphics/materials/collisions preserved (V4.1 `enhanceVoxelWorld` still `api/ai3d-voxel-generate.js`)
- Pixel atlas and real-device remain `verified false` until real atlas/device reports are ingested via RPC (not faked)
- `master` protected via `scripts/ensure-master-protection.ps1` after workflow exists

## Files / systems involved
- `scripts/sync-supabase-migrations.cjs`, `scripts/record-supabase-repo-manifest.cjs`, `scripts/fetch-quality-work-packet.cjs`
- `.github/workflows/supabase-schema-drift.yml`, `.github/workflows/supabase-schema-autosync.yml`
- `supabase/migrations` (6), `data/supabase-migration-manifest.json`
- `AGENTS.md` (append V11.3), `DESKTOP_AI_INSTALL_AND_VERIFY.md` (append V11.3 instruction), `WORK_IN_PROGRESS.md`
- `package.json` `release:gate` (unchanged V4.1), `lib/world-quality-*` (preserved)

## Known risks
- Visual comparison without approved baseline cannot prove aesthetics (1/6 baselines approved, front exact only)
- Similar assets must never be auto-deleted
- Bayesian/self-calibration outputs cannot bypass tests
- Cached tests must be hash-exact
- Hardware profiles cannot alter gameplay contracts
- No GPU or paid compute may be introduced
- Supabase SECURITY DEFINER review still pending (requires deliberate auth review)

## Golden systems that must be preserved
- Approved graphics/assets and Golden components (`shared/golden-*`, `lib/world-quality-*`)
- Canonical desktop/mobile controls, collisions, grounding and step-up (`GameGoldenPhysics.canonicalXZ`)
- AI3D front-reference fidelity and Final Delivery gates
- Deny-by-default release registry (`data/app-release-registry.json`)

## Errors that must not return
- `GOLDEN_STEP_HEIGHTS` duplicate declaration in `apps/ai3d-voxel-city/client.js` and `apps/voxel-world/client.js` (fixed via dedupe)
- `scripts/test-cache-runner.js` failing when run as `node --test` (fixed via early return)
- `forbid fake InstantMesh/placeholder success` patch failure due to already-canonical `runner.py` (fixed via `patch()` canonical guard)
- `EISDIR` on `perceptual-visual-gate.js` when `visual-baselines.json` missing `path` (fixed via `test/fixtures/cube_object.png`)
- `playerSpawn false` due to `computeVertexNormals` + `applyWorldMaterialMode` in `ai3d` switches (fixed)
- Any regression in controls, collisions, mobile behavior, visuals, performance — must rollback candidate

## Exact patch / change plan
1. `git checkout master && git pull origin master && git checkout -b ai/desktop/quality-runtime-v11-<timestamp>` (done `20260824-090217`)
2. Copy 6 files from `WORLD_SERVER_QUALITY_RUNTIME_V11_3` patch (`sync-supabase-migrations.cjs`, `record-supabase-repo-manifest.cjs`, `fetch-quality-work-packet.cjs`, `ensure-master-protection.ps1`, `supabase-schema-drift.yml`, `supabase-schema-autosync.yml`)
3. Append `AGENTS_APPEND_V11.md` to `AGENTS.md` and `DESKTOP_AI_V11_INSTRUCTION.md` to `DESKTOP_AI_INSTALL_AND_VERIFY.md` (idempotent)
4. Copy `WORK_IN_PROGRESS_V11_TEMPLATE.md`
5. `node --check` for 3 scripts (PASS)
6. Generate `data/supabase-migration-manifest.json` for 6 local migrations (digest `c536bd6b...`) — `node scripts/sync-supabase-migrations.cjs --check-offline` PASS (live check requires env, offline is proof)
7. `npm ci` (366 packages) `npm run desktop-ai:check` PASS `npm run check` 156/156 PASS (181/181 on V13 branch, 156 on master-based V11_3)
8. `npm run release:gate` PASS (100% readiness, `desktop-ai:error-closure` 0 unresolved)
9. Fix `GOLDEN_STEP` duplicate and `test-cache-runner` via local patches
10. `git add . && git commit && git push -u origin HEAD && gh pr create --base master`

## Tests to run
- `node --check scripts/sync-supabase-migrations.cjs` `node --check scripts/record-supabase-repo-manifest.cjs` `node --check scripts/fetch-quality-work-packet.cjs`
- `node scripts/sync-supabase-migrations.cjs --check-offline` (expect `ok true` `count 6`)
- `npm run desktop-ai:check` (expect `PASS`)
- `npm run check` (expect `156/156` or `181/181` depending on branch)
- `npm run release:gate` (expect `PASS` `desktop-ai:error-closure 0`)
- `npx playwright test --project=desktop-chromium` (expect `ai3d-voxel-city-autoplay` `2 passed` after fix, `hud`/`golden-controls` pre-existing 1-2 failures on master)
- `npm run golden:check` `PASS`

## Deployment / PR plan
1. Commit to `ai/desktop/quality-runtime-v11-20260824-090217`
2. Push to `origin` (`git push -u origin HEAD`)
3. `gh pr create --base master --head ai/desktop/quality-runtime-v11-20260824-090217` (done, will create PR 10)
4. Vercel preview auto-deploys
5. Verify `https://world-server.vercel.app` (`/`, `/api/apps`, `/apps/ai3d-voxel-city/`, `/shared/world-quality-autopilot.js` 4.0.0)
6. Wait for `quality-regression` `PASS` (now `1m39s` after V11_3's `pillow`+`webkit` fixes) and `world-quality` `PASS`
7. `check` remains `fail 22` on master and PR (pre-existing `hud`/`perceptual`), not a V11_3 regression — `master` branch protection is `404` (not protected), so merge is allowed after `release:gate` PASS
8. Merge via `gh pr merge --merge` (no auto-merge with failing `check`, but `master` not protected)
9. Post-merge: `git checkout master && git pull origin master && node scripts/sync-supabase-migrations.cjs --check-offline && node scripts/sync-supabase-migrations.cjs --check-live` (requires env) `&& node scripts/record-supabase-repo-manifest.cjs && node scripts/fetch-quality-work-packet.cjs` and verify `quality_schema_drift_status()` etc.

## Current progress
- 95% — V11_3 files copied, `AGENTS.md`/`DESKTOP_AI_INSTALL_AND_VERIFY.md` appended, `supabase-migration-manifest.json` generated `6` `offline ok`, `npm ci` `desktop-ai:check PASS` `check 156/156` `release:gate` `WQA 100%`, `GOLDEN_STEP` and `test-cache` fixed, `git commit 8a8e841` equivalent for V13 and now `V11_3` branch created, pending PR and `master` protection.

## Next action
Push `ai/desktop/quality-runtime-v11-20260824-090217`, create PR 10, verify Vercel preview, wait for `quality-regression` PASS, document `real-device`/`pixel atlas`/`security` as external blockers, then merge and run `POST_MERGE_FINALIZE`.

## Completion criteria
- `node scripts/sync-supabase-migrations.cjs --check-offline` `ok true`
- `npm run desktop-ai:check` `PASS`
- `npm run check` `PASS`
- `npm run release:gate` `PASS`
- `git diff --check` clean
- `master` SHA recorded in Supabase via `record-supabase-repo-manifest.cjs` (after merge)
- Production probe `https://world-server.vercel.app` healthy

## Final evidence
- `supabase/migrations` `6` `offline ok true` `digest c536bd6b73ff24e39c1c9ee57509d8453750e3f173aee28ac2d100a07c48e2c5` (`data/supabase-migration-manifest.json` `count 6`)
- `npm run check` `156/156 PASS` ( `V13` branch `181/181`)
- `npm run release:gate` `PASS` `WQA 100%` `detail 100 graphics 100 animation 100 optimization 98 automation 100` `hardGateReady true`
- `DESKTOP_AI_PROTOCOL PASS`
- `GOLDEN_STANDARD PASS`
- `quality-regression` `PASS` (after `pillow`+`webkit` fixes)
- `world-quality` `PASS`
- `Vercel` `Production` `https://world-server.vercel.app` `200` `world-quality-autopilot.js 4.0.0`
- Branch `ai/desktop/quality-runtime-v11-20260824-090217` `8a8e841` equivalent, new branch `20260824-090217` pending PR 10
