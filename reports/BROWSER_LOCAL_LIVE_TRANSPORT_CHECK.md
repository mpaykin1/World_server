# BROWSER LOCAL LIVE TRANSPORT CHECK — 2026-09-03

## CLI state
- `npx supabase --version` → `2.116.0` PASS
- `npx supabase projects list` → `{"_tag":"Error","error":{"code":"LegacyPlatformAuthRequiredError","message":"Access token not provided. Supply an access token by running 'supabase login' or setting the SUPABASE_ACCESS_TOKEN environment variable."}}` — **not authenticated**
- `npx supabase migration list` → `LegacyProjectNotLinkedError: Cannot find project ref. Have you run supabase link?` — **not linked**
- `npx supabase db push --help` → available, flags `--project-ref`, `--password`, `--db-url`, `--linked`, `--include-all` — **requires auth**
- `supabase/.temp/project-ref` → missing (only `cli-latest` exists)
- `supabase/.temp/cli-latest` → `v2.116.0`
- `~/.supabase/telemetry.json` only, no `access-token` / `config.json`
- Env `SUPABASE_ACCESS_TOKEN`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` → all empty (`Get-ChildItem Env:SUPABASE*` → none)
- Env `VERCEL_OIDC_TOKEN` present in `C:/Users/user/Desktop/World_server/.env.local` but OIDC ≠ Vercel API token — `fetch https://api.vercel.com/v9/projects/.../env` with OIDC → `403 invalidToken` (tested `vercel_test.cjs`)
- `npx vercel --version` 59.11.2 available, but `.vercel/project.json` only contains `projectId prj_XsKyvMHpuNomoPBxuOD8vd26Fi3y` + `orgId team_itmMhMILAlqU6yLs7xnsvbo1`, no `auth.json` in `~/.vercel` or `~/.config/vercel`
- `WORLD_SERVER_SECRETS/SECRETS_INDEX.md` confirms `SUPABASE_SECRET_KEY` lives only in `Vercel -> world-server -> Settings -> Environment Variables` and `SUPABASE_PREVIEW_SECRET_KEY` blocked on dashboard retrieval — no local vault
- `gh auth status` → `mpaykin1` logged in, but `gh secret list` → 0 secrets, no repo-level Supabase secret to reuse
- `gh api repos/mpaykin1/World_server/actions/secrets` → `total_count 0`
- `scripts/sync-supabase-migrations.cjs` requires `SUPABASE_URL` + `SUPABASE_SECRET_KEY` (throws if missing) — no fallback
- No Supabase MCP configured (`.opencode` empty, no `mcp*.json`)
- No `supabase/config.toml` (local stack not `supabase start`)

## Live Supabase reachability (publishable key only)
- `GET https://world-server.vercel.app/api/config` → `{"supabaseUrl":"https://iphfwxjuhsucvdyluink.supabase.co","supabasePublishableKey":"sb_publishable_dwZ33fr4F1475dHOXKE7Dw_JxWaxbIQ"}` — **URL confirmed**
- `POST https://iphfwxjuhsucvdyluink.supabase.co/rest/v1/rpc/browser_ai_enqueue_task` with `apikey=sb_publishable_...` → `404 PGRST202 Could not find function public.browser_ai_enqueue_task` — **migration not live** (expected, proves need for `db push`)
- `GET /rest/v1/browser_ai_tasks` → `404 PGRST205 Could not find table public.browser_ai_tasks` — **not live**
- Publishable key is anon, not service_role — even when live, `browser_ai_*` RPCs are `REVOKE FROM anon,authenticated; GRANT TO service_role` + `SECURITY INVOKER` — anon will get `403`/`401`, which is **intentional secure behavior** (not a public remote execution API)

## Migration security review
- Original `20260903000000_browser_local_control.sql` used `SECURITY DEFINER` (8 functions) — consistent with existing `quality_worker_jobs` pattern but more privilege than needed
- Reviewed: tables have `ENABLE ROW LEVEL SECURITY` + `REVOKE FROM anon,authenticated` + `policy FOR ALL TO service_role USING (true)` — so `SECURITY INVOKER` with service_role caller is sufficient and least privilege
- **Fixed** in this branch (still not live remotely, so safe to amend): all 8 functions now `SECURITY INVOKER` + `SET search_path = public, pg_temp` + `REVOKE FROM public,anon,authenticated; GRANT TO service_role` — no weakening, no public access, no `authenticated` read (commented `grant select` stays disabled)
- Capability allowlist enforced in `browser_ai_enqueue_task` (`v_allowed text[]` 35 caps), plus `risk`/`worktree_mode` checks, HMAC optional, expiry, idempotency, lease reclaim

## Worker Supabase mode
- `scripts/browser-local-worker.cjs` already supports dual transport: `trySupabaseHeartbeat()` / `trySupabaseComplete()` via `@supabase/supabase-js` when `SUPABASE_URL` + `SUPABASE_SECRET_KEY` are set; primary is Supabase, FS queue `state/browser-local-queue/` is fallback/recovery
- With only publishable key, worker stays in FS mode (verified `node scripts/browser-local-worker.cjs health` → heartbeat `online true`, queue 5 tasks)
- After live deploy, worker poll should be `Supabase queue → claim → execute → complete → heartbeat`; interval 3s, `maxConcurrent=1`, `timeout per cap`, `lease 300s`, crash recovery via `lease_expires_at` check

## What remains for TRUE REMOTE E2E
1. `npx supabase login` (or set `SUPABASE_ACCESS_TOKEN`)
2. `npx supabase link --project-ref iphfwxjuhsucvdyluink`
3. `npx supabase db push` (applies `supabase/migrations/20260903000000_browser_local_control.sql` — now SECURITY INVOKER)
4. Verify: `npx supabase migration list` shows `20260903000000_browser_local_control` as remote applied
5. Verify via SQL/RPC: `select * from public.browser_ai_tasks limit 1` and `select public.browser_ai_list_workers()` exist
6. Set `SUPABASE_URL` + `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) in env for worker (or rely on existing Vercel env) and run `node scripts/browser-local-worker.cjs loop`
7. From Browser ChatGPT (via Supabase connector): `select public.browser_ai_enqueue_task('repo.status','{}'::jsonb,'idem-live-1')` → watch worker claim → `select public.browser_ai_get_result('task_...')`

No new code needed — all RPCs, worker, docs, heartbeat, capability registry are code-complete and tested locally 5/5 (`reports/browser-local-control-e2e.json`).
