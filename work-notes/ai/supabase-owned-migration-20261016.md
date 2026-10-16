# Supabase owner migration checkpoint (2026-10-16)

## Task
Transfer only working, valuable World Server functionality/data from inaccessible source Supabase to owner-controlled world-server-preview. Source MUST remain working.

## Why
Owner lost login to old organization; second Codex needs sustainable independent admin access.

## Current state
Read-only Supabase plugin source audit completed; source 518 MiB, 113 public tables, 38 private tables, 15 active Edge Functions. Target is a PAUSED project in a different organization; its project ref and secrets have not been supplied. Current plugin only reaches SOURCE. No target connection and no data movement.

## Target state
Owner controls target with preserved world state, proven functional parity, no unnecessary telemetry bloat, and rollback.

## Files / systems involved
data/supabase-owner-migration-20261016.json, scripts/supabase-owner-migration.cjs, docs/SUPABASE_OWNER_MIGRATION_20261016.md, source/target Supabase, GitHub and Cloudflare bindings.

## Known risks
Data loss, Auth FK mismatch, inconsistent RLS, lost edge source/secrets, 500 MB Free cap, target already having data, copying stale automated leases, credentials in logs.

## Golden systems that must be preserved
Worlds and saves, gameplay progression, live UX, animation/graphics policies, quality learning, all valuable research and rollback ability.

## Errors that must not return
Blind prod cutover, new project replacing old without proof, restore into occupied target without backup, copying expired secrets, fabricated QA scores, unsupported full migration claim.

## Exact patch / change plan
1. Commit source inventory and classification manifest.
2. Add non-destructive pg_dump archive/audit tooling.
3. Document owner-safe process and exact dependencies.
4. On target access, back up old + target, stage restore and verify before production cutover.

## Tests to run
V8 syntax check of script; JSON policy parse/validation; pg_dump and psql audit on actual source; pg_restore --list on backups; source/target count verification; RLS and functional tests.

## Deployment / PR plan
This is a non-deploying draft PR from ai/supabase-owned-migration-20261016. Do not merge until user review and target readiness. No change to master/production.

## Current progress
Source inventory, policy, backup-only script and docs committed. No destination writes.

## Next action
Get world-server-preview project URL and resume, inspect target, obtain authorized Postgres source dump route.

## Completion criteria
Target backed up and restored, matched data and verified app functionality; only user PASS/FAIL determines outcome.

## Final evidence
Initial source read-only SQL + GitHub metadata audit; source size and largest tables measured. Destination unverified; migration NOT DONE.
