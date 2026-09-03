# Browser ChatGPT ↔ Local World_server Control Bridge

> Supabase queue (pull) → Desktop OpenCode worker → isolated git worktree → result queue → Browser ChatGPT

Version: `2026-09-03.v3` — Worktree: `ai/opencode/browser-local-control` — Authority +checkpoint/state (Browser ChatGPT can checkpoint/resume/health/state.read)

## Architecture

```
Browser ChatGPT (chat)
  │ enqueue via  browser_ai_enqueue_task() RPC / SQL
  ▼
Supabase  browser_ai_tasks  (RLS: service_role, Realtime publication)
  │ claim via  browser_ai_claim_task()  (FOR UPDATE SKIP LOCKED, lease 300s, reclaim)
  ▼
Local World_server Coordinator  —  scripts/browser-local-worker.cjs  (poll 3s, max 1 concurrent, timeout per capability)
  │ verify signature (HMAC BROWSER_CONTROL_SECRET), expiry, idempotency, allowlist
  │ select/create isolated worktree  state/browser-local-worktrees/<task_id>  branch browser-task/<task_id>
  ▼
OpenCode + deterministic scripts + local tools (isolated git worktree)
  ▼
tests / diff / artifacts / screenshots  (bounded output, large logs → state/browser-local-artifacts/<task_id>.json)
  ▼
Result queue  browser_ai_complete_task() / state/browser-local-results/<task_id>.json
  ▼
Browser ChatGPT  reads via  browser_ai_get_result() / browser_ai_get_task() / SQL
```

Free-first priority for code tasks: 1) deterministic scripts → 2) OpenCode → 3) OpenHuman → 4) AnythingLLM/Ollama → 5) Claude/Codex escalation.

## Quick start (local FS queue, no Supabase secret required)

```bash
# enqueue tasks (idempotent)
node scripts/browser-local-queue.cjs enqueue 'repo.status' '{}'
node scripts/browser-local-queue.cjs enqueue 'repo.read' '{"path":"package.json"}'
node scripts/browser-local-queue.cjs enqueue 'git.apply_patch' '{"path":"reports/browser-chatgpt-local-e2e.txt","content":"hello"}'
node scripts/browser-local-queue.cjs enqueue 'test.run' '{"target":"test/collective-brain.test.js","command":"node --test test/collective-brain.test.js"}'
node scripts/browser-local-queue.cjs enqueue 'agent.dispatch' '{"applyFix":true}'

# run one tick (or loop)
node scripts/browser-local-worker.cjs tick
node scripts/browser-local-worker.cjs loop   # poll every 3s
node scripts/browser-local-worker.cjs health

# read result
node scripts/browser-local-queue.cjs result <task_id>
node scripts/browser-local-queue.cjs list

# full 5-E2E suite
npm run browser:e2e
```

## Supabase path (when SUPABASE_URL + SUPABASE_SECRET_KEY are set)

Migrations: `supabase/migrations/20260903000000_browser_local_control.sql` creates

- `public.browser_ai_tasks` — typed queue with `task_id`, `capability`, `args`, `repo`, `worktree_mode`, `risk`, `expires_at`, `idempotency_key`, `status`, lease columns, `result jsonb`.
- `public.browser_ai_heartbeats` — `worker`, `online`, `version`, `capabilities[]`, `current_task`, `last_seen`, `success_rate`, `avg_latency_ms`.
- RPCs:

| RPC | Purpose |
|---|---|
| `browser_ai_enqueue_task(p_capability, p_args, p_idempotency_key, p_risk, p_expires_in_seconds, ...)` | enqueue (deduplicates on `idempotency_key`) |
| `browser_ai_get_task(p_task_id)` | fetch task + result pointer |
| `browser_ai_get_result(p_task_id)` | fetch finished result (or error if not finished) |
| `browser_ai_list_workers()` | heartbeats in last 10 min |
| `browser_ai_cancel_task(p_task_id)` | cancel queued/running |
| `browser_ai_claim_task(p_worker, p_capabilities, p_lease_seconds)` | worker claim (internal, `SKIP LOCKED` + lease reclaim) |
| `browser_ai_heartbeat(p_worker, p_capabilities, p_detail)` | publish heartbeat |
| `browser_ai_complete_task(p_task_id, p_status, p_result)` | write result |

All RPCs are `SECURITY DEFINER` and `REVOKE` from `public/anon/authenticated`, `GRANT TO service_role`. Browser ChatGPT uses its existing Supabase service access (same as quality tables). Realtime publication includes both tables.

```sql
-- Browser ChatGPT examples (via SQL or RPC)
select public.browser_ai_enqueue_task('repo.status', '{}'::jsonb, 'idem-123', 'low', 3600);
select public.browser_ai_get_task('task_abc');
select public.browser_ai_get_result('task_abc');
select public.browser_ai_list_workers();
select public.browser_ai_cancel_task('task_abc');
```

Poll model: `Supabase queue` → Desktop worker every 3 s (or Realtime NOTIFY) → `Supabase result`. No inbound tunnel needed; NAT/firewall bypassed.

## Task contract

```json
{
  "task_id": "task_9f3a...",
  "requested_by": "browser-chatgpt",
  "capability": "repo.read",
  "args": { "path": "package.json" },
  "repo": "mpaykin1/World_server",
  "worktree_mode": "isolated",
  "risk": "low",
  "created_at": "2026-09-03T00:00:00.000Z",
  "expires_at": "2026-09-03T01:00:00.000Z",
  "idempotency_key": "idem_abc123",
  "status": "queued"
}
```

Result:

```json
{
  "task_id": "task_9f3a...",
  "status": "completed|failed|blocked",
  "executor": "desktop-opencode",
  "started_at": "...",
  "finished_at": "...",
  "files_changed": [],
  "git_diff_summary": "",
  "commit_sha": "",
  "tests": [],
  "artifacts": [],
  "stdout_summary": "",
  "stderr_summary": "",
  "blockers": [],
  "confidence": 0.92,
  "detail": {}
}
```

Large stdout is truncated to 4k; full output → `state/browser-local-artifacts/<task_id>.json` (or Storage bucket, returns ref).

## Capability registry

Allowlisted in `lib/browser-local-control/capabilities.json` (timeout, risk, worktree). Worker rejects any capability not in list. Highlights:

 - READ: `repo.status`, `repo.tree`, `repo.read`, `repo.search`, `repo.diff`, `repo.history`
 - GIT: `git.fetch/create_worktree/create_branch/apply_patch/stage/commit/push/conflicts`
 - TEST: `test.list/run`, `lint.run`, `build.run`, `benchmark.run`
 - AGENTS: `agent.list/dispatch/status/result/retry/cancel`
 - QUALITY: `quality.status/run/blockers/regressions`
 - BROWSER: `browser.open/scenario/screenshot/console` (when Playwright available)
 - ARTIFACTS: `artifact.list/read/zip`
 - CHECKPOINT/STATE (v3): `checkpoint.create/list`, `session.status/resume/health`, `state.read` — Browser ChatGPT controls recovery checkpoint + reads DESKTOP_AI_RESUME.md / SESSION_HEALTH.json / UNFINISHED_WORK.json (allowlist only, no path traversal)

## Worker guarantees

1. Signature/auth: HMAC-SHA256 of `task_id:capability:args` with `BROWSER_CONTROL_SECRET` (optional locally, required when `BROWSER_CONTROL_REQUIRE_SIGNATURE=1`).
2. Expiration: drop if `expires_at < now()` → `blocked`.
3. Idempotency: dedup on `idempotency_key` at enqueue.
4. Allowlist: reject unknown capability → `blocked`.
5. Isolated worktree per task (`browser-task/<task_id>`), base HEAD SHA recorded; sibling AI worktrees never touched.
6. Timeout per capability (default 120 s, up to 300 s for `agent.dispatch`).
7. Bounded output (max 256 k, stdout 4k, stderr 2k), heartbeat every tick, lease 300 s with reclaim.
8. Crash recovery: expired `running` lease → reset to `queued` on next tick.
9. `release:gate` minimal after coding tasks (full gate before promotion).

## Heartbeat

File: `state/browser-local-worker.json` + Supabase `browser_ai_heartbeats` when connected.

```json
{
  "worker": "desktop-opencode",
  "online": true,
  "version": "2026-09-03.v3",
  "capabilities": ["repo.status","repo.read","git.apply_patch","test.run","agent.dispatch", "..."],
  "current_task": null,
  "last_seen": "2026-09-03T00:00:00.000Z",
  "success_rate": 0.99,
  "avg_latency_ms": 842
}
```

Browser ChatGPT can call `browser_ai_list_workers()` or `SELECT * FROM browser_ai_heartbeats` / read the JSON.

## Isolation & locks

- Per-task branch `browser-task/<task_id>` + worktree `state/browser-local-worktrees/<task_id>` — never touches `master` or another AI's active worktree.
- Before any write: check `state/session-recovery/SESSION_HEALTH.json` + `git worktree list` for active leases.
- Cleanup only after explicit verification; failed tasks keep evidence.
- Collective Brain: every successful fix writes `{symptom, rootCause, fix, tests, files, commit, preventionRule}` via `lib/collective-brain` `appendEvent` / `protect-fix`.

## Security / secrets

- Never commit real secrets; only `.env.example` names. Real values from `Vercel` / `vault` / local `.env.local` (gitignored).
- `BROWSER_CONTROL_SECRET` is HMAC key, not logged or returned in result.
- `SUPABASE_SECRET_KEY` lives only in Vercel env / `vault.decrypted_secrets`, RPCs are `service_role` only.

## Files

- `supabase/migrations/20260903000000_browser_local_control.sql` — tables + RPCs
- `lib/browser-local-control/capabilities.json` — allowlist
- `lib/browser-local-control/index.js` — validate/build task/result, HMAC, caps
- `scripts/browser-local-worker.cjs` — pull worker (poll / tick / loop / health)
- `scripts/browser-local-queue.cjs` — local enqueue/get/result/list/cancel
- `scripts/browser-local-e2e.cjs` — 5-E2E suite (status/read/write/test/agent)
- `state/browser-local-worker.json` — heartbeat
- `state/browser-local-queue/` — queued tasks (FS fallback)
- `state/browser-local-results/` — completed tasks
- `reports/browser-local-control-e2e.json` — E2E evidence
- `reports/OPENCODE_BROWSER_AUTHORITY_CONTRIBUTION.json` — authority delta for Claude

## Remaining blockers (if any)

See `reports/browser-local-control-e2e.json` `summary` + `reports/OPENCODE_BROWSER_AUTHORITY_CONTRIBUTION.json` `remainingBlockers`.
