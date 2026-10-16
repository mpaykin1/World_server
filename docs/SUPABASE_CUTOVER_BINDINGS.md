# World Server Supabase cutover bindings (PR #514)

**State:** PREPARED ONLY. No new database has been restored, no Edge Function deployed to the new project, and production is unchanged. The owner alone decides MVP PASS/FAIL after live proof.

## Split-brain risk fixed in Cloudflare Worker

The original `cloudflare-worker.js` has five old-source Supabase Edge Function URLs as runtime fallbacks. Changing only `SUPABASE_URL` made the browser point to the new Auth/database while world writes, emergence, and quality telemetry still reached the old production.

In the migration branch, the Worker now refuses to route those Edge requests when `SUPABASE_URL` differs from old production until the exact corresponding target bindings are configured. It rejects wrong-origin, wrong-function-path and extra query/fragment overrides. Dynamic API requests also require an explicit independent `WORLD_SERVER_API_ORIGIN` (never the existing default). `/api/config` returns `configured: false` until all target bindings are present. An unchanged/legacy production configuration behaves as before.

This is a **fail-closed safety mechanism**, not a migrated backend. It does not attest that the target functions are deployed, database contracts work, or Cloud Run is retargeted. A non-empty target API origin is necessary but insufficient: independently verify every dependency and response before cutover.

## Owner-only target access bridge (no credentials in chat or Git)

The authorized Windows machine has PostgreSQL 17.11 client tools under
`%LOCALAPPDATA%\\WorldServerAI\\tools\\postgresql-17\\pgsql\\bin`.
For a **read-only** target authentication check, the owner can use the local branch checkout:

```powershell
powershell -NoProfile -File "$env:LOCALAPPDATA\\WorldServerAI\\worktrees\\pr514-audit\\scripts\\owner-target-preflight.ps1"
```

The script asks for only the **Session pooler hostname** and a masked **new-project database password**. It uses PostgreSQL SSL `verify-full` (default `sslrootcert=system`), saves no credentials or passwords, clears temporary libpq environment variables, prints only a non-sensitive summary, and never changes either database. If the system CA store is insufficient, download the project's certificate and pass `-CaCertificate "C:\\path\\to\\downloaded.crt"` instead; never disable TLS verification. For autonomous testing, run `-SelfTest` without credentials.

**Direct owner links:** [target Connect](https://supabase.com/dashboard/project/xlcdnlsyvxqtopmkweiy?showConnect=true), [target Database Settings / certificate](https://supabase.com/dashboard/project/xlcdnlsyvxqtopmkweiy/settings/database). A successful probe verifies target PostgreSQL login only, not migrated data or readiness.

## Mandatory target Cloudflare configuration

Set these environment variables as a single versioned deployment (do not change current production bindings until staging tests and rollback are ready):

| Variable | Target requirement |
| --- | --- |
| `SUPABASE_URL` | `https://xlcdnlsyvxqtopmkweiy.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | **New project's** publishable key; never old project's key or a service/secret key |
| `WORLD_SERVER_STACK_READ_ORIGIN` | `https://xlcdnlsyvxqtopmkweiy.supabase.co/functions/v1/world-stack-read` |
| `WORLD_SERVER_STACK_WRITE_ORIGIN` | `https://xlcdnlsyvxqtopmkweiy.supabase.co/functions/v1/world-stack-write` |
| `WORLD_SERVER_EMERGENCE_ORIGIN` | `https://xlcdnlsyvxqtopmkweiy.supabase.co/functions/v1/world-emergence` |
| `WORLD_SERVER_QUALITY_SUMMARY_ORIGIN` | `https://xlcdnlsyvxqtopmkweiy.supabase.co/functions/v1/quality-summary` |
| `WORLD_SERVER_QUALITY_TELEMETRY_ORIGIN` | `https://xlcdnlsyvxqtopmkweiy.supabase.co/functions/v1/quality-telemetry` |
| `WORLD_SERVER_API_ORIGIN` | Independently proven replacement for the existing old Cloud Run dynamic API backend, not the previous default |

The deployed Supabase function sources are archived in `experiments/supabase-owner-migration/edge-deployed-20261016/` for review; these are NOT yet deployed on the target. Credentials for Edge Functions, queues, cron, webhooks, Auth and Cloud Run need separate safe migration/rotation; do not copy old JWT secrets by accident.

## Mandatory ordered live proof before changing production

1. Obtain authorized **target** PostgreSQL credentials and management token in a secure local environment; ChatGPT Supabase connector currently has access to old source only. Target PostgREST HTTP 401 without keys is **network reachability, not authentication proof**.
2. Obtain authorized **source** PostgreSQL export access without resetting any active production password. Never claim full backup based on catalog queries alone.
3. Audit source AND occupied target, back up both, verify integrity, rehearse full archive restore on isolated cluster. Include source schema/grants/RLS and Supabase-managed components where appropriate.
4. Selectively migrate valuable gameplay/auth/learning content to target, preserve FK/permissions/cron dependencies, verify record hashes and real game workflows. Archive history before pruning on target. Source untouched.
5. Deploy **only** target-compatible Edge Functions and environment secrets, verify each with real network calls, then explicitly retarget dynamic API backend and automation integrations. Confirm Telegram/bot/game writes converge on one new DB.
6. Deploy preview Worker with all eight variables set, audit GET/POST routing and mobile game flows, prove no old-origin writes and quantify user visibility and performance. Validate rollback using archived target and old source.
7. Run checks and collect live evidence. Only after owner verdict and full readiness may a separate change perform production cutover. No outcome analysis or automatic merge before owner decision.

## Regression evidence

`node --test test/cloudflare-worker.test.js test/supabase-cutover-bindings.test.js`

Tests cover the unchanged old-production defaults, incomplete target bindings, mixed old/new endpoints, explicit full target routing, and disabled automatic old Cloud Run fallback. These are **mocked routing tests**, not a live database/Edge deployment test. Production environment remains unchanged.
