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

## Measured cleanup sizing, not permission to delete

Read-only source SQL at **2026-10-16T05:34:59Z** measured **151 public/private
tables, 477,298,688 bytes of relations including indexes/TOAST**.
An archived machine-readable aggregate, without private table names or row
contents, is in
`experiments/supabase-owner-migration/live-source-size-groups-20261016.json`.

- **28 must-keep** tables: 6,250,496 bytes
- **5 archive-only candidates:** 463,142,912 bytes (~97% of the measured
  public/private relation storage). These are historical quality/probe/gap
  logs and include potentially valuable learning or failure evidence.
- **9 reset candidates:** 2,351,104 bytes, subject to preserving completed
  results, retries and dead-letter records
- **109 unclassified tables:** 5,554,176 bytes. No skipping or dropping these
  without mapping dependencies; they may contain essential functionality.

**No size reduction has occurred.** PostgreSQL relation size is not archive
size, does not include other managed schemas such as cron, and cannot prove
target capacity. Archive the historical rows and prove they can be restored
before summarizing or excluding them **on the target only**. Never infer an
unused object from low row counts or low scan counts alone. Keep the source
unchanged for rollback.

## Required final write fence and delta verification

A prior full backup and a successful fixture restore **do not** prove that the
target contains the last live world/player changes. In a read-only source SQL
check at 2026-10-16T05:29:06Z the source contained **2 worlds, 5,284 player
states, 0 orphaned player states, 3 Auth users, 10 active cron jobs, 105,623
cron execution rows, and 144 migrations**. A preceding read-only check during
this investigation showed **5,282 player states**. These are time-specific
observations; no user activity or update interval is assumed.

`lib/supabase-migration-evidence.cjs` now has a mandatory
`final_delta_and_write_fence` gate. For READY_FOR_OWNER_REVIEW it requires
verifiable live evidence that **all runtime writers** (browser, Telegram,
Cloudflare, Edge Functions, cron, workers and external producers) were
coordinated and fenced while the final source and target snapshots were taken;
pending queue work was drained or safely replayed, final Auth/Storage/queue
state was covered, and content fingerprints from both projects were compared
again **after** the fence. A mismatch or observed write after the fence blocks
readiness as REGRESSION; missing or stale evidence means UNKNOWN.

This is not an instruction to pause production right now. A write fence is
a future cutover step and must be reversible; design it to minimize write
unavailability after staging restore and target functional testing. The
validator remains **offline** and cannot independently attest that an operator
has really applied the fence, so live logs and a trusted verification run are
still required. The user's PASS/FAIL decision is always separate and pending.

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
