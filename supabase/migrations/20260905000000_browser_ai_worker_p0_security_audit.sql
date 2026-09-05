-- P0 SUPABASE SECURITY DEFINER RPC AUDIT — browser_ai_worker_* functions
-- 2026-09-05
--
-- *** NOT YET APPLIED TO ANY LIVE PROJECT. DO NOT APPLY WITHOUT RECONCILING
-- *** AGAINST THE ACTUAL LIVE SCHEMA FIRST (see notes below). ***
--
-- Context: Supabase Security Advisor flagged public.browser_ai_worker_claim,
-- public.browser_ai_worker_complete, both signatures of
-- public.browser_ai_worker_heartbeat, and public.browser_ai_reconcile_worker_health
-- as publicly-callable SECURITY DEFINER functions on the live "Improve" project
-- (project_ref referenced in reports/OPENCODE_BROWSER_AUTHORITY_CONTRIBUTION.json
-- as iphfwxjuhsucvdyluink — NOT one of the two Supabase projects reachable from
-- this session's MCP connection; ground truth for that specific project could
-- not be queried directly this round).
--
-- Findings from a read-only audit of this repo's migration history, cross-
-- checked with 3 disposable, fully-rolled-back empirical probes against the
-- reachable "world-server-preview" project (same Postgres 17 engine; zero
-- residue left, verified via pg_namespace after each probe):
--
--   1. public.browser_ai_worker_heartbeat (both overloads) is genuinely
--      SECURITY DEFINER-by-design and correctly scoped: it does its own
--      inline token check against private.browser_ai_worker_tokens
--      (worker/active/expires_at/token_hash), and is GRANTed to
--      anon/authenticated/service_role — this is the correct, intentional
--      "publicly callable + internally authenticated" pattern (category A).
--      The only real gap: search_path lists `public` before `extensions`,
--      and calls the pgcrypto `digest()` function unqualified — if `public`
--      schema CREATE were ever re-granted to a non-privileged role, a
--      same-named function planted in public could shadow the real
--      extensions.digest() inside this SECURITY DEFINER function. Fixed
--      below by schema-qualifying the call (zero behavior change).
--
--   2. public.browser_ai_worker_claim and public.browser_ai_worker_complete,
--      AS CURRENTLY COMMITTED in supabase/migrations/20260903132521_browser_local_worker_token_auth.sql,
--      are SECURITY INVOKER and validate via a call to
--      private.browser_ai_validate_worker_token(text) — a SECURITY DEFINER
--      helper that is REVOKEd from public/anon/authenticated with no
--      compensating GRANT. Empirically proven (probe against
--      world-server-preview, rolled back, zero residue):
--
--        ERROR: 42501: permission denied for function definer_helper
--
--      i.e. a SECURITY INVOKER function calling a SECURITY DEFINER helper
--      the CALLER cannot directly EXECUTE fails with a permission error —
--      this is standard, documented PostgreSQL behavior (EXECUTE privilege
--      is checked against the currently-executing role at every call site,
--      nested or not; SECURITY DEFINER only changes which role's privileges
--      apply to the objects the definer function itself touches, not
--      whether external callers may invoke it). A second probe proved the
--      same failure mode when such a helper is referenced from an RLS
--      policy's USING clause instead of a plpgsql call.
--
--      Conclusion: the migration file's claim/complete definitions, AS
--      WRITTEN, cannot be working live for anon/authenticated callers.
--      Since scripts/browser-local-worker-live.cjs calls these RPCs with
--      only the publishable (anon) key and reports live E2E PASS, the ACTUAL
--      live definitions must differ from this repo's "reconstructed" source
--      — most likely already converted to the same SECURITY DEFINER +
--      inline private.browser_ai_worker_tokens check that heartbeat v3 uses
--      (the v3-parity migration's own comment says "Preserve LIVE security
--      model: SECURITY DEFINER, private.browser_ai_worker_tokens" for the
--      system as a whole), but that update was never written back as a
--      migration file the way heartbeat's was.
--
--      This migration proposes reconciling claim/complete to that same
--      proven-correct pattern (mirrors heartbeat exactly: SECURITY DEFINER,
--      inline check, no dependency on the private.browser_ai_worker_auth
--      singleton table or the validate_worker_token helper). The exact
--      SQL below (function bodies, not just the security posture) was
--      validated end-to-end against a disposable sandbox on
--      world-server-preview: wrong token -> exception, valid token ->
--      task actually claimed, second claim on an empty queue -> task: null.
--
--      *** THIS IS STILL A PROPOSAL, NOT A CONFIRMED MATCH FOR THE REAL
--      *** LIVE "Improve" PROJECT SCHEMA. Before applying: pull the actual
--      *** live definition via `select pg_get_functiondef(oid) from pg_proc
--      *** where proname in ('browser_ai_worker_claim','browser_ai_worker_complete')`
--      *** on project iphfwxjuhsucvdyluink and diff against this file.
--
--   3. public.browser_ai_reconcile_worker_health has NO source anywhere in
--      any of the ~15 worktrees of this repo searched (migrations, scripts,
--      docs, reports) — it is a live-only object. Its grants/logic cannot
--      be assessed, classified, or safely modified from this repo. Treated
--      as UNKNOWN (category D) pending recovery of its live source.
--
--   4. A live worker token (BROWSER_WORKER_TOKEN) was found committed in
--      cleartext in this repo (migration comment + a report JSON). Removed
--      from both files in this same change (see separate commit diff) —
--      git HISTORY still contains it, so production MUST rotate this token
--      independent of any of the SQL below. Not something a migration file
--      can fix.
--
-- What this migration does NOT do: touch browser_ai_reconcile_worker_health
-- (no source), touch the "story" domain SECURITY DEFINER functions (separate
-- feature area, already using the sound auth.uid()-ownership pattern per a
-- read-only review — not part of this P0's scope), or REVOKE/GRANT anything
-- on browser_ai_enqueue_task/get_task/get_result/list_workers/cancel_task/
-- claim_task/heartbeat/complete_task (original, service_role-only set) —
-- those are already correctly scoped (SECURITY INVOKER, revoked from
-- anon/authenticated, service_role only) and match their actual caller
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

commit;
