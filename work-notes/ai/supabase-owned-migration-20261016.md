# Supabase owner migration checkpoint (2026-10-16)

## Task
Transfer only working, valuable World Server functionality/data from inaccessible source Supabase to owner-controlled world-server-preview. Source MUST remain working.

## Why
Owner lost login to old organization; second Codex needs sustainable independent admin access.

## Current state
Continuing the existing PR #514 at 62dc78ab269f2b20e94d9b08dba6841ab6b6ca6b in the same checkout and branch. The earlier source audit records 518 MiB, 113 public tables, 38 private tables and 16 active Edge Functions; those are historical observations, not fresh live measurements. Target ref xlcdnlsyvxqtopmkweiy is known and its resumed dashboard state remains API/database-unverified. This Codex cloud instance currently has only the source public Supabase URL/key, no source/target Postgres DSNs, no server secret and no management access token. Existing configuration metadata and runtime variable names were checked without logging values. No target connection or data movement is claimed.

## Target state
Owner controls target with preserved world state, proven functional parity, measured size/scheduler/runtime improvements (not assumed), no unnecessary telemetry bloat, and rollback.

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
5. Extend the existing tooling with comprehensive read-only catalogs (relations, functions, dependencies, indexes, queues, cron and history), secret-safe transport, verified archive provenance and conservative evidence gates.
6. Exercise actual PostgreSQL backup/restore and audit behavior in disposable local databases while live credentials remain unavailable. Keep fixture measurements distinct from World Server production improvements.
7. Commit code, tests and sanitized evidence to this existing PR branch; do not merge or change production. Owner verdict remains PENDING until a genuinely ready MVP can be tested.

## Tests to run
V8 syntax check of script; JSON policy parse/validation; pg_dump and psql audit on actual source; pg_restore --list on backups; source/target count verification; RLS and functional tests.

## Deployment / PR plan
This is a non-deploying draft PR from ai/supabase-owned-migration-20261016. Do not merge until user review and target readiness. No change to master/production.

## Current progress
All 16 deployed Edge Functions were recovered as code snapshots into the migration branch. Source database and target have not been modified.

Source inventory, policy, backup-only script and docs committed. No destination writes.

Cloud continuation implementation:
- Preserved two concurrent upstream commits by fast-forwarding to 90eb5ecdc883dc1e74912ecbed9b56b34a389bfe; continuing the same PR and branch, no new checkout/worktree.
- Replaced unsafe selective backup with a private complete logical archive retaining ACL/owners, exported snapshot provenance, SHA256 and TOC; restore rehearsal stays NOT_RUN until actually performed.
- Added complete read-only catalog inventory, explicit capability/permission coverage, canonical data fingerprints, guarded source/target transport, strict evidence/owner gates and exact learning-observation preservation.
- Fixed and reproduced three actual PostgreSQL defects: PGDATABASE does not expand an environment URI; RLS can hide differing rows behind equal zero counts; timezone settings can change fingerprints of identical timestamps. Added real regressions.
- Hardened target-only REST probe: explicit target bindings, origin/type/OpenAPI validation, timeout, redirect rejection and redacted diagnostics.
- Added a signed/checksummed user-local PostgreSQL 17.11 installer and one-command disposable-cluster validation. Temporary databases and raw fixture archives were stopped/removed.
- Expanded protected callers and documented CAS credential-hash rotation and valuable queue result/error/dead-letter records; no actual reset or exclusion is authorized by a size/zero-scan heuristic.

## Next action
Target project ref xlcdnlsyvxqtopmkweiy is known and owner resumed it according to dashboard. Second Codex must verify real target API access, inspect and back up target, secure authorized source dump, then run source-plan and carry out clean-and-upgrade migration with evidence. Preserve source production unchanged.

Cloud continuation: Git read access to the PR and branch is verified. GitHub API access initially returned Forbidden; the required hostname is being added to the environment draft while native Git remains usable. First focused baseline: the existing optimizer test file executes 5 actual Node subtests; historical claims of eight sandbox tests are not a new test run. Missing PostgreSQL DSNs block a fresh exhaustive source audit and target backup/restore. Continue independent implementation and local integration validation before requesting outside action.

Latest next action: securely bind WS_SOURCE_DATABASE_URL, WS_TARGET_DATABASE_URL and target SUPABASE_ACCESS_TOKEN in environment settings. Runtime names/config metadata were rechecked: no bindings. GitHub repository/environment secret metadata returned HTTP403 Resource not accessible by integration; no values were extracted. Then run fresh source/target audit and full backups, rehearse restore/roles, collect real dependency/runtime evidence and perform target-only migration/optimization. Keep old production unchanged. Credentials must not be entered in chat or committed. Current source public key is insufficient for these steps.

## Cleanup/modernization evidence (2026-10-16)
Owner explicitly requested to improve project and delete unnecessary components during transfer. Added mandatory dry-run cleanup script scripts/supabase-migration-optimizer.cjs, node:test coverage and evidence-based classification/optimization policy. Ran eight deterministic tests of the actual GitHub script through sandboxed V8: PASS (parsing, no writes, target ID, sizing uncertainty, estimated bytes, complete known stats, duplicate rejection, unsafe table-name rejection). No live DB operations or cleanup have happened yet. Actual live cleanup gains are UNKNOWN until target is deployed and measured.

## Completion criteria
Target backed up and restored, matched data and verified app functionality, with at least one independently measurable improvement and no regression; only user PASS/FAIL determines outcome.

## Final evidence
Autonomous validator: `WS_PG_BIN_DIR=/workspace/.cache/world-server-pg17/root/usr/lib/postgresql/17/bin node scripts/validate-supabase-migration.cjs --with-core` executed 140 tests, 140 passed, 0 failed/skipped. Includes 64 existing core checks and real PG17 catalogs, complete archives, fresh restore, occupied-target preservation, ACL/SECURITY DEFINER/RLS, same-count mutation, timezone and archive-integrity counterexamples. `check:fast` checked88 JS files; architecture from origin/master, mf:check and indieworlds:check completed. Full npm run check/release pipeline unrun because automatic discovery creates real Git worktrees and rewrites unrelated reports; no production-readiness claim follows.

Sanitized report, exact implementation hashes and test output: experiments/supabase-owner-migration/validation-20261016/. LOCAL_FIXTURE index bytes decreased360448→327680 (32768 bytes);120 matching query rows and28 priority fingerprints retained. This demonstrates the measurement procedure on generated fixtures, not an improvement to live World Server. Single-run local phase timings are diagnostics, not p95 evidence. Historical source audit remains separately labeled; no fresh private source/target SQL access, live archive/restore, target deployment, live optimization or cutover occurred. Owner verdict PENDING; MVP is not yet ready for PASS/FAIL.
