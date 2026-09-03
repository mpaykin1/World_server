# BROWSER LOCAL BRIDGE AUDIT

Generated: 2026-09-03
Worktree: ai/opencode/browser-local-control (C:\Users\user\Desktop\World_server_browser_local)
Base: b5c967da (ai/opencode/multi-ai-peer-improvement)

## Summary
Audited existing queues, control planes, collective brain, workers, Supabase tables/RPCs, schedulers.

## Existing capability — REUSABLE

| System | Location | Status | Reuse decision |
|---|---|---|---|
| `quality_worker_jobs` queue + `claim_quality_worker_job()` lease RPC | `supabase/migrations/20260823042723_quality_autopilot_runtime.sql`, `20260823042923_quality_worker_claim.sql`, `20260823043539_quality_worker_lease_recovery.sql` | **PASS** — `queued→running→complete/failed` with `FOR UPDATE SKIP LOCKED`, lease_expiry reclaim, priority ordering | Reuse pattern for new `browser_ai_tasks` claim RPC; do not duplicate logic |
| `private.quality_worker_heartbeats` + `quality_record_worker_heartbeat()` | `supabase/migrations/20260824053613_quality_runtime_worker_v11.sql` | PASS — `worker text primary key, capabilities jsonb, detail jsonb, checked_at` | Reuse heartbeat schema pattern for `browser_ai_heartbeats` |
| `quality_desktop_ai_work_packet()` | `20260824053613`, `20260824060050` | PASS — aggregates `quality_worker_jobs` + gaps + rules for Desktop AI | Extend to include `browser_ai_tasks` in future version; not replaced |
| `public.gap_closure_registry` + `run_gap_closure_db_cycle()` | `20260824060136` | PASS — but not relevant to browser bridge; do not touch | Ignore |
| Desktop AI Session Recovery V1.3 (`scripts/desktop-ai-session-recovery.cjs`, `state/session-recovery/`) | `WORK_IN_PROGRESS.md`, `state/session-recovery/*` | PASS — watchdog, lease, `WAITING_VALID`/`STALLED`/`DEAD`, `UNFINISHED_WORK.json`, `SESSION_HEALTH.json` | Reuse lease/heartbeat semantics; do not duplicate watchdog |
| Autonomous blocker repair scheduler | `scripts/autonomous-blocker-repair.cjs`, `state/blocker-repair/*` | PASS — running timers (8h-long-soak, fresh-android/ios) | Preserve; new worker must not conflict |
| Collective Brain V2.1 (`lib/collective-brain/index.js`, `data/collective-brain/*`, `COLLECTIVE_BRAIN_*`) | `lib/collective-brain`, `scripts/collective-brain-*.js` | PASS — shared memory bridge (agentmemory 127.0.0.1:3111), lease `data/collective-brain/runtime/locks`, hash-chained `events.jsonl`, `cycle/recall/route/policyGate`, `release:gate` includes `collective-brain:check/security/cycle` (18/18 tests) | REUSE: every successful browser coding task records `{symptom, rootCause, fix, tests, files, commit, preventionRule}` via `collective-brain:protect-fix` or direct ledger |
| AnythingLLM sandbox worktree | `git worktree list` → `World_server_anythingllm_sandbox` `ai/desktop/anythingllm-sandbox` | EXISTS but not installed per audit (no running service found) | Do not duplicate; reference capability `anythingllm.query` as optional fallback |
| OpenHuman bridge | `World_server_openhuman2` worktree, `COLLECTIVE_BRAIN_RUNTIME_EVIDENCE.json` | EXISTS — loopback only, redacted | Keep as fallback after OpenCode; not primary executor |
| Supabase Realtime | `supabase/migrations` use `quality_worker_jobs`; publication not checked but pattern exists | Usable — prefer polling + optional Realtime subscription | Implement Realtime as improvement after polling PASS |
| MCP / filesystem server | Not found in `package.json` (no `@modelcontextprotocol/server-filesystem`) | Missing | Not needed for pull model; document as future hardening |
| Ollama local inference | `lib/collective-brain` `OLLAMA_URL=127.0.0.1:11434` `ollamaHealth()` | Present but DEGRADED (no local model required) | Keep as last fallback |
| Quality Autopilot (`npm run quality:auto-cycle`, `world-quality-autopilot`) | `scripts/world-quality-autopilot.js`, `scripts/auto-quality-cycle.js` | PASS | Integrate: after coding task run minimal quality gate before promotion |

## Broken / Missing

| Gap | Impact | Resolution in this bridge |
|---|---|---|
| No `browser_ai_tasks` typed queue | Browser ChatGPT cannot enqueue local work | **Create** `browser_ai_tasks` + `browser_ai_heartbeats` with typed contract (see migration `20260903000000_browser_local_control.sql`) |
| No `browser_ai_*` RPCs (enqueue/get/result/workers/cancel) | Browser has no SQL/RPC surface | **Create** 5 RPCs: `browser_ai_enqueue_task`, `browser_ai_get_task`, `browser_ai_get_result`, `browser_ai_list_workers`, `browser_ai_cancel_task` + internal `browser_ai_claim_task`/`complete`/`heartbeat` |
| No local pull worker with allowlist/lease/timeout/crash-recovery | No execution loop | **Create** `scripts/browser-local-worker.cjs` (poll + optional Realtime, HMAC verify, expiry, idempotency, allowlist, isolated worktree per task, heartbeat, bounded output) |
| No capability registry | Risk of arbitrary code execution | **Create** `lib/browser-local-control/capabilities.json` (allowlist: repo.*, git.*, test.*, agent.*, quality.*, browser.*, artifact.*) |
| No Supabase Storage / artifact path for large diffs | Large patches overflow result row | Result stores `git_diff_summary` + `artifacts[]` refs; large logs → `state/browser-local-artifacts/<task_id>.log` or Storage bucket ref (future) |
| No `.env.example` entry for `BROWSER_CONTROL_SECRET` | Secrets not documented | **Added** to `.env.example` |
| No `docs/BROWSER_LOCAL_CONTROL.md` / `state/browser-local-worker.json` / `reports/browser-local-control-e2e.json` / `reports/OPENCODE_BROWSER_AUTHORITY_CONTRIBUTION.json` | No observable state/docs | **Create** as part of this branch |

## Duplicate — AVOIDED

- Did NOT create a second quality worker queue; new tables are **domain-separated** (browser-initiated vs autopilot) but reuse same claim/lease/heartbeat pattern.
- Did NOT duplicate Collective Brain lease/watchdog — worker uses its own `state/browser-local-worker.json` + `state/browser-local-queue/` file queue for offline E2E, and `browser_ai_heartbeats` in Supabase when connected.
- Did NOT duplicate scheduler — polling interval 3s, maxConcurrent=1, timeout per capability (spec in `capabilities.json`).

## Decision: why a new table is justified

`quality_worker_jobs` is generic (`kind text, payload jsonb, required_capabilities jsonb`) and optimized for autopilot kinds (`runtime.synthetic.*`, `schema.drift`). Browser bridge needs:
- typed fields: `task_id`, `requested_by`, `capability`, `args`, `repo`, `worktree_mode`, `risk`, `created_at`, `expires_at`, `idempotency_key`, `status` per spec,
- RLS/auth model for `browser-chatgpt` principal (not `service_role` autopilot),
- browser-visible read path (`SELECT`/`RPC` from Browser ChatGPT Supabase access),
- idempotency on `idempotency_key` with upsert semantics distinct from `job_key`.

Extending `quality_worker_jobs` with nullable columns would pollute autopilot and require risky migration of existing rows. A parallel `browser_ai_tasks` table reuses the **proven queue mechanics** (claim with `SKIP LOCKED`, lease reclaim, heartbeat) without coupling domains. Quality Autopilot can optionally read browser tasks via a future view; no data loss.

## Capabilities to expose (allowlist)

See `lib/browser-local-control/capabilities.json` for full registry. Priority order for code tasks:
1. deterministic scripts
2. OpenCode (this worker)
3. OpenHuman
4. AnythingLLM/Ollama
5. Claude/Codex escalation (out of scope for worker)

## Security

- Secrets never committed; `.env.example` only shows names, real values from `/.env.local` / Vault / Vercel env.
- HMAC verification (`BROWSER_CONTROL_SECRET`) optional for local FS queue; required for Supabase path when `BROWSER_CONTROL_REQUIRE_SIGNATURE=1`.
- Allowlist enforcement before any worktree mutation; `risk=high` requires explicit confirmation (enforced in worker).
- Output truncation (`stdout_summary` 4k, `stderr_summary` 4k), full logs → artifact file with SHA, result returns reference/path.

## Reusable evidence paths

- `state/session-recovery/DESKTOP_AI_RESUME.md` — auto-resume on new chat
- `data/collective-brain/runtime/` — lease/locks/events/outbox (pattern reused)
- `supabase/migrations/quality_worker_claim.sql` — claim RPC template reused for `browser_ai_claim_task`
