-- P0 SUPABASE SECURITY DEFINER RPC AUDIT — browser_ai_worker_* functions
-- 2026-09-05 (updated same day after direct live-schema access confirmed
-- the earlier reconciliation proposal, and surfaced a new P0 finding)
--
-- *** STILL NOT APPLIED TO ANY LIVE PROJECT. Repo-side only. Applying this
-- *** to production is a separate, explicit action requiring its own
-- *** sign-off — see the per-section notes below for what is now CONFIRMED
-- *** vs. what remains unresolved. ***
--
-- Context: Supabase Security Advisor flagged public.browser_ai_worker_claim,
-- public.browser_ai_worker_complete, both signatures of
-- public.browser_ai_worker_heartbeat, and public.browser_ai_reconcile_worker_health
-- as publicly-callable SECURITY DEFINER functions on the live "Improve"
-- project (project_ref iphfwxjuhsucvdyluink). This project is not reachable
-- from this session's own Supabase MCP connection; the first pass of this
-- audit relied on repo migration history plus 3 disposable, fully-rolled-
-- back empirical probes against the reachable "world-server-preview"
-- project (same Postgres 17 engine) to reason about likely live behavior
-- without ever touching the flagged project directly.
--
-- 2026-09-05 UPDATE: direct read access to the actual live project
-- (iphfwxjuhsucvdyluink) was obtained via a separate channel (ChatGPT) and
-- confirmed the following as PRODUCTION FACT, not inference:
--
--   1. public.browser_ai_worker_claim — SECURITY DEFINER, EXECUTE granted to
--      anon/authenticated/service_role, inline auth against
--      private.browser_ai_worker_tokens using extensions.digest(...),
--      invalid token raises an exception. This CONFIRMS the reconciliation
--      already proposed in section 1 below (this file already replaced the
--      stale repo INVOKER version from 20260903132521_browser_local_worker_token_auth.sql
--      with exactly this pattern before live access existed — the guess was
--      correct). Do NOT revert this function to the old INVOKER +
--      private.browser_ai_validate_worker_token version; that version was
--      empirically proven non-functional for anon/authenticated callers
--      (see the "why this pattern was rejected" note kept below section 1
--      for the reasoning and the exact permission-denied proof).
--
--   2. public.browser_ai_worker_complete — same confirmation: SECURITY
--      DEFINER, anon/authenticated/service_role, inline token validation.
--      Same "do not revert to INVOKER" instruction applies.
--
--   3. public.browser_ai_worker_heartbeat (both signatures) — SECURITY
--      DEFINER, inline token validation, live already uses
--      extensions.digest(...) (schema-qualified) — confirms the hardening
--      in section 1 below was not a behavior change, it matches what is
--      already deployed.
--
--   4. NEW P0 FINDING — public.browser_ai_reconcile_worker_health(integer):
--      SECURITY DEFINER, EXECUTE granted to anon AND authenticated AND
--      service_role, with NO worker-token validation and NO auth.uid()
--      ownership check at all. The function mutates public.browser_ai_heartbeats
--      (marks workers offline based on its integer argument — presumed a
--      staleness-threshold in seconds, exact body still not recovered, but
--      irrelevant to the grant fix below: REVOKE/GRANT statements only need
--      the function's signature, never its body). No caller for this RPC
--      exists anywhere in this repo (re-grepped across every worktree:
--      zero matches outside this migration and its own test file) — this is
--      a real, live, unauthenticated privilege-surface bug: any anonymous
--      caller holding only the publishable key can currently force any
--      worker's heartbeat row offline. Hardened in section 3 below:
--      REVOKE ALL FROM PUBLIC/anon/authenticated, GRANT EXECUTE TO
--      service_role only (function body is NOT redefined — unknown, and a
--      GRANT/REVOKE change never requires it). Table owner (postgres)
--      privileges are unaffected by REVOKE ALL on non-owner roles, so
--      dashboard/migration-runner access is preserved automatically.
--
--   5. A live worker token (BROWSER_WORKER_TOKEN) was found committed in
--      cleartext in this repo (migration comment + a report JSON). Removed
--      from both files in a prior commit — git HISTORY still contains it.
--      Treated as compromised; see the separate rotation plan (not part of
--      this migration file — grants/DDL cannot rotate a secret value).
--
-- ---------------------------------------------------------------------
-- Why the OLD repo INVOKER pattern for claim/complete was rejected (kept
-- for anyone reviewing this file's history/rationale):
-- ---------------------------------------------------------------------
-- public.browser_ai_worker_claim and public.browser_ai_worker_complete, as
-- committed in supabase/migrations/20260903132521_browser_local_worker_token_auth.sql,
-- were SECURITY INVOKER and validated via a call to
-- private.browser_ai_validate_worker_token(text) — a SECURITY DEFINER
-- helper REVOKEd from public/anon/authenticated with no compensating GRANT.
-- Empirically proven broken (probe against world-server-preview, rolled
-- back, zero residue): `ERROR: 42501: permission denied for function
-- definer_helper`. A SECURITY INVOKER function calling a SECURITY DEFINER
-- helper the CALLER cannot directly EXECUTE fails with a permission error —
-- standard PostgreSQL behavior (EXECUTE privilege is checked against the
-- currently-executing role at every call site, nested or not). A second
-- probe proved the same failure mode when such a helper is referenced from
-- an RLS policy's USING clause. This is why section 1 below defines
-- claim/complete/heartbeat with an INLINE check instead of calling out to
-- validate_worker_token — now directly confirmed to match live reality.
--
-- What this migration does NOT do: redefine browser_ai_reconcile_worker_health's
-- body (unknown — only its grants are changed), touch the "story" domain
-- SECURITY DEFINER functions (separate feature area, already using the
-- sound auth.uid()-ownership pattern per a read-only review — not part of
-- this P0's scope), or REVOKE/GRANT anything on browser_ai_enqueue_task/
-- get_task/get_result/list_workers/cancel_task/claim_task/heartbeat/
-- complete_task (original, service_role-only set) — those are already
-- correctly scoped (SECURITY INVOKER, revoked from anon/authenticated,
-- service_role only) and match their actual caller
-- (scripts/browser-local-worker.cjs, service-role admin client).

begin;

-- ---------------------------------------------------------------------
-- 1. Harden browser_ai_worker_heartbeat: schema-qualify digest() so a
--    same-named function in `public` (listed before `extensions` in
--    search_path) can never shadow the real pgcrypto digest(). No
--    behavior change for any well-formed caller.
-- ---------------------------------------------------------------------

create or replace function public.browser_ai_worker_heartbeat(
  p_worker text,
  p_token text,
  p_capabilities jsonb default '[]'::jsonb,
  p_current_task text default null,
  p_detail jsonb default '{}'::jsonb,
  p_version text default '2026-09-03.v3'
) returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_version text := coalesce(nullif(trim(p_version),''), '2026-09-03.v3');
  v_valid boolean;
begin
  select exists(
    select 1 from private.browser_ai_worker_tokens
    where worker = p_worker
      and active is true
      and (expires_at is null or expires_at > now())
      and token_hash = encode(extensions.digest(coalesce(p_token,''), 'sha256'), 'hex')
  ) into v_valid;
  if not coalesce(v_valid,false) then
    raise exception 'invalid worker credentials';
  end if;
  if p_worker is null or char_length(trim(p_worker)) < 3 then raise exception 'worker required'; end if;
  if char_length(v_version) > 32 or char_length(v_version) < 1 then raise exception 'invalid version length'; end if;
  if v_version !~ '^[A-Za-z0-9._-]+$' then raise exception 'invalid version format'; end if;
  insert into public.browser_ai_heartbeats(worker, version, capabilities, detail, current_task, last_seen, online)
  values (left(trim(p_worker),120), v_version, coalesce(p_capabilities,'[]'::jsonb), coalesce(p_detail,'{}'::jsonb), p_current_task, now(), true)
  on conflict (worker) do update set version = excluded.version, capabilities = excluded.capabilities, detail = excluded.detail, current_task = excluded.current_task, last_seen = now(), online = true;
  return jsonb_build_object('ok', true, 'worker', p_worker, 'version', v_version, 'at', now());
end;
$$;
revoke all on function public.browser_ai_worker_heartbeat(text,text,jsonb,text,jsonb,text) from public;
grant execute on function public.browser_ai_worker_heartbeat(text,text,jsonb,text,jsonb,text) to anon, authenticated, service_role;

create or replace function public.browser_ai_worker_heartbeat(
  p_worker text,
  p_token text,
  p_capabilities jsonb,
  p_current_task text,
  p_detail jsonb
) returns jsonb
language sql
security definer
set search_path = public, private, extensions, pg_temp
as $$
  select public.browser_ai_worker_heartbeat(p_worker, p_token, p_capabilities, p_current_task, p_detail, '2026-09-03.v3');
$$;
revoke all on function public.browser_ai_worker_heartbeat(text,text,jsonb,text,jsonb) from public;
grant execute on function public.browser_ai_worker_heartbeat(text,text,jsonb,text,jsonb) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. Reconcile browser_ai_worker_claim / browser_ai_worker_complete to the
--    same proven-correct pattern as heartbeat v3: SECURITY DEFINER, inline
--    check against private.browser_ai_worker_tokens, no dependency on the
--    private.browser_ai_worker_auth singleton table or
--    private.browser_ai_validate_worker_token (proven non-functional for
--    anon/authenticated callers as currently granted — see header notes).
-- ---------------------------------------------------------------------

create or replace function public.browser_ai_worker_claim(
  p_worker text,
  p_token text,
  p_capabilities jsonb default '[]'::jsonb,
  p_lease_seconds integer default 300
) returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_row public.browser_ai_tasks;
  v_valid boolean;
begin
  select exists(
    select 1 from private.browser_ai_worker_tokens
    where worker = p_worker
      and active is true
      and (expires_at is null or expires_at > now())
      and token_hash = encode(extensions.digest(coalesce(p_token,''), 'sha256'), 'hex')
  ) into v_valid;
  if not coalesce(v_valid,false) then
    raise exception 'invalid worker credentials';
  end if;
  if p_worker is null or char_length(trim(p_worker)) < 3 then raise exception 'worker id required'; end if;

  with picked as (
    select id
    from public.browser_ai_tasks
    where status in ('queued','running')
      and expires_at > now()
      and attempts < max_attempts
      and (p_capabilities is null or p_capabilities = '[]'::jsonb or capability = any (select jsonb_array_elements_text(p_capabilities)))
      and (status = 'queued' or (status = 'running' and lease_expires_at is not null and lease_expires_at < now()))
    order by created_at asc
    for update skip locked
    limit 1
  )
  update public.browser_ai_tasks j
  set status = 'running',
      attempts = j.attempts + 1,
      lease_owner = p_worker,
      lease_expires_at = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds,300),3600))),
      executor = p_worker,
      started_at = coalesce(j.started_at, now()),
      updated_at = now()
  from picked
  where j.id = picked.id
  returning j.* into v_row;

  if v_row.task_id is not null then
    return jsonb_build_object('ok', true, 'task', jsonb_build_object('id', v_row.id,'task_id', v_row.task_id,'capability', v_row.capability,'args', v_row.args,'repo', v_row.repo,'worktree_mode', v_row.worktree_mode,'risk', v_row.risk,'created_at', v_row.created_at,'expires_at', v_row.expires_at,'idempotency_key', v_row.idempotency_key,'status', v_row.status,'lease_owner', v_row.lease_owner,'lease_expires_at', v_row.lease_expires_at,'executor', v_row.executor,'started_at', v_row.started_at,'finished_at', v_row.finished_at,'result', v_row.result,'attempts', v_row.attempts,'max_attempts', v_row.max_attempts,'requested_by', v_row.requested_by,'updated_at', v_row.updated_at));
  else
    return jsonb_build_object('ok', true, 'task', null);
  end if;
end;
$$;
revoke all on function public.browser_ai_worker_claim(text,text,jsonb,integer) from public;
grant execute on function public.browser_ai_worker_claim(text,text,jsonb,integer) to anon, authenticated, service_role;

create or replace function public.browser_ai_worker_complete(
  p_worker text,
  p_token text,
  p_task_id text,
  p_status text,
  p_result jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_row public.browser_ai_tasks;
  v_valid boolean;
begin
  select exists(
    select 1 from private.browser_ai_worker_tokens
    where worker = p_worker
      and active is true
      and (expires_at is null or expires_at > now())
      and token_hash = encode(extensions.digest(coalesce(p_token,''), 'sha256'), 'hex')
  ) into v_valid;
  if not coalesce(v_valid,false) then
    raise exception 'invalid worker credentials';
  end if;
  if p_status not in ('completed','failed','blocked','cancelled') then raise exception 'invalid status %', p_status; end if;
  update public.browser_ai_tasks set status = p_status, result = coalesce(p_result,'{}'::jsonb), finished_at = now(), updated_at = now(), lease_expires_at = null, executor = p_worker
  where task_id = p_task_id
  returning * into v_row;
  if not found then return jsonb_build_object('ok', false, 'error', 'not found'); end if;
  return jsonb_build_object('ok', true, 'task_id', v_row.task_id, 'status', v_row.status);
end;
$$;
revoke all on function public.browser_ai_worker_complete(text,text,text,text,jsonb) from public;
grant execute on function public.browser_ai_worker_complete(text,text,text,text,jsonb) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. P0 fix: browser_ai_reconcile_worker_health(integer) currently has no
--    auth check at all and is EXECUTABLE by anon and authenticated. Grants-
--    only change — the function body is not known and is NOT redefined
--    here; CREATE OR REPLACE is deliberately not used. Confirmed zero
--    callers anywhere in this repo across every worktree, so no legitimate
--    anon/authenticated caller is broken by this revoke. service_role
--    (the only role this repo's own service-role-authenticated worker
--    scripts use) keeps EXECUTE; the function owner (postgres) is
--    unaffected by REVOKE ALL on non-owner roles and keeps implicit access
--    regardless (dashboard / migration runner access is preserved).
-- ---------------------------------------------------------------------

revoke all on function public.browser_ai_reconcile_worker_health(integer) from public, anon, authenticated;
grant execute on function public.browser_ai_reconcile_worker_health(integer) to service_role;

commit;
