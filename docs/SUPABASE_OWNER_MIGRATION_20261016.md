# World Server: перенос Supabase владельцу (2026-10-16)

Status: SOURCE_AUDITED / BACKUP_SCRIPT_COMMITTED / TARGET_NOT_CONNECTED / NO_CUTOVER.

## Источник подтверждён

- Supabase ref: iphfwxjuhsucvdyluink, PostgreSQL 17, ACTIVE_HEALTHY.
- Database size: 542846099 bytes (about 518 MiB). Free Supabase has 500 MB database size limit.
- 113 tables in public, 38 in private, 27 in auth, 8 in storage.
- Source migration ledger: 144 entries. GitHub master supabase/migrations: 10 files. Do not expect repo migrations to reproduce production.
- 15 ACTIVE Supabase Edge Functions; several source deployments must be recovered separately.
- Storage buckets: image-world-sources and image-world-output; storage.objects currently has 0 rows.
- Auth: 3 users. Never replay active refresh/session tokens.
- Valuable data: voxel worlds, player saves, world events, animation policies, stories, project context, and quality learning state.

Largest tables (including indexes): private.quality_runtime_scores (167MB), public.gap_closure_evidence (93MB), public.gap_closure_runs (90MB), private.quality_autopilot_runs (83MB), cron.job_run_details (45MB). These histories must be archived, not silently discarded or copied into the Free tier.

## Target

The owner has access to a Supabase organization named Improve (org slug ayoxcnfmwbpmwwhdeljs). There is a PAUSED project world-server-preview. Its PROJECT REF has not been supplied and the existing ChatGPT Supabase connector cannot currently access it. This means NO target operations have occurred.

Owner one-time action: open world-server-preview, use Resume project if available, and send its /dashboard/project/PROJECT_REF URL. Before touching target content, inspect and back up any existing data.

## Source backup automation

- Manifest: data/supabase-owner-migration-20261016.json
- Node script: scripts/supabase-owner-migration.cjs
- Requires PostgreSQL 17 client programs psql and pg_dump in PATH.
- Set WS_SOURCE_DATABASE_URL to a private authorized source Postgres session connection string.
- Set WS_TARGET_DATABASE_URL to a private authorized target Postgres session connection string.
- Keep URLs in machine environment, not in chat, public frontend, Git or CI logs.

Commands:

    node scripts/supabase-owner-migration.cjs audit-source
    node scripts/supabase-owner-migration.cjs audit-target
    node scripts/supabase-owner-migration.cjs backup
    node scripts/supabase-owner-migration.cjs verify

Backup writes outside repo:
Windows: %LOCALAPPDATA%\WorldServerAI\archives\supabase-owner-migration-20261016
Unix: ~/.local/share/WorldServerAI/archives/supabase-owner-migration-20261016

The script does not change either DB. It produces a FULL confidential local archive (public + private + auth data) and a SELECTIVE archive (public + private, excluding history and temporary/secret-bearing rows according to manifest). The full archive contains highly sensitive credentials/data and MUST remain securely stored offline. It refuses to overwrite an existing archive.

Blocking dependency: currently connected Supabase tools can query source SQL but do NOT expose its Postgres login password. A temporary restricted export credential or another authorized Postgres source connection must be established before CLI pg_dump can run. The paused target project also needs identification and authentication.

## Mandatory gates before switching production

1. Resume and inspect target; preserve its pre-existing data.
2. Obtain source read-only export and target admin connections.
3. Run backup; validate archives with pg_restore --list; record hashes outside Git.
4. Test a selective restore into disposable/empty target namespace. Never use pg_restore --clean on occupied target.
5. Restore schema, extensions, private functions, triggers, RLS, grants and dependencies. Address Auth identities and foreign keys deliberately.
6. Redeploy selected Edge Functions and recreate needed secrets/cron/webhooks through the target account. Old keys must be rotated, not blindly copied.
7. Verify world/game state, player save/load, private memory, quality loop, Edge Functions, security advisors, regressions, browser/mobile and rollback. Compare source and target data.
8. Gradually switch deployment bindings only after LIVE evidence; old source remains untouched as fallback.
9. No PASS/FAIL attribution until the owner explicitly decides. Success/failure analysis commits follow only after that decision.

Important: verify command compares key table row counts; it is a starting guard, NOT proof of full functional equivalence. Do not invent a visibility score. Target project settings, auth-provider configuration, users' active sessions, storage object bytes, service secrets and third-party bindings are outside a SQL dump.

Official guides:
- https://supabase.com/docs/guides/platform/migrating-to-supabase/postgres
- https://supabase.com/docs/guides/platform/database-size
- https://supabase.com/docs/guides/platform/free-project-pausing
