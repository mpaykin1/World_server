-- BROWSER LOCAL CONTROL V3 PARITY — reconcile LIVE changes made by Browser ChatGPT + fix heartbeat version contract
-- Live Browser ChatGPT already updated:
--   1) browser_ai_enqueue_task allowlist to include 6 v3 caps (checkpoint.create/list, session.status/resume/health, state.read)
--   2) worker allowed_capabilities for desktop-opencode to include same 6
-- This migration makes local source idempotent with live and fixes heartbeat version hardcode (v2-token-auth -> param).
-- Worker now sends p_version (bounded 1..32 chars). Server validates and stores it, defaulting to v3 if not provided.
-- Does NOT weaken token auth, does NOT change secrets, does NOT widen grants beyond needed.
-- Verified live: checkpoint.list / session.status / session.health / state.read / session.resume = PASS (2026-09-03.v3, 43 caps)
-- 2026-09-03

begin;

-- 1. Update enqueue allowlist to include v3 caps (idempotent)
create or replace function public.browser_ai_enqueue_task(
  p_capability text,
  p_args jsonb default '{}'::jsonb,
  p_idempotency_key text default null,
  p_risk text default 'low',
  p_expires_in_seconds integer default 3600,
  p_requested_by text default 'browser-chatgpt',
  p_worktree_mode text default 'isolated',
  p_task_id text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_task_id text := coalesce(nullif(p_task_id,''), 'task_' || encode(extensions.gen_random_bytes(16),'hex'));
  v_idem text := coalesce(nullif(p_idempotency_key,''), 'idem_' || encode(extensions.gen_random_bytes(16),'hex'));
  v_row public.browser_ai_tasks;
  v_allowed text[] := array[
    'repo.status','repo.tree','repo.read','repo.search','repo.diff','repo.history',
    'git.fetch','git.create_worktree','git.create_branch','git.apply_patch','git.stage','git.commit','git.push','git.conflicts',
    'test.list','test.run','lint.run','typecheck.run','build.run','benchmark.run',
    'agent.list','agent.dispatch','agent.status','agent.result','agent.retry','agent.cancel',
    'quality.status','quality.run','quality.blockers','quality.regressions',
    'browser.open','browser.scenario','browser.screenshot','browser.console',
    'artifact.list','artifact.read','artifact.zip',
    'checkpoint.create','checkpoint.list','session.status','session.resume','session.health','state.read'
  ];
begin
  if p_capability is null or p_capability <> all(v_allowed) then
    raise exception 'capability % is not allowlisted', p_capability;
  end if;
  if p_risk not in ('low','medium','high') then raise exception 'invalid risk %', p_risk; end if;
  if p_worktree_mode not in ('isolated','shared') then raise exception 'invalid worktree_mode %', p_worktree_mode; end if;
  select * into v_row from public.browser_ai_tasks where idempotency_key = v_idem limit 1;
  if found then
    return jsonb_build_object('ok',true,'deduplicated',true,'task', jsonb_build_object('task_id',v_row.task_id,'status',v_row.status,'capability',v_row.capability,'idempotency_key',v_row.idempotency_key,'created_at',v_row.created_at));
  end if;
  insert into public.browser_ai_tasks(task_id, requested_by, capability, args, repo, worktree_mode, risk, expires_at, idempotency_key, status)
  values(v_task_id, p_requested_by, p_capability, coalesce(p_args,'{}'::jsonb), 'mpaykin1/World_server', p_worktree_mode, p_risk, now() + make_interval(secs => greatest(60, least(coalesce(p_expires_in_seconds,3600), 86400))), v_idem, 'queued')
  returning * into v_row;
  return jsonb_build_object('ok',true,'deduplicated',false,'task', jsonb_build_object('task_id',v_row.task_id,'status',v_row.status,'capability',v_row.capability,'idempotency_key',v_row.idempotency_key,'created_at',v_row.created_at,'expires_at',v_row.expires_at));
end;
$$;
revoke all on function public.browser_ai_enqueue_task(text,jsonb,text,text,integer,text,text,text) from public, anon, authenticated;
grant execute on function public.browser_ai_enqueue_task(text,jsonb,text,text,integer,text,text,text) to service_role;

-- 2. Heartbeat: accept p_version param, validate, store; fix hardcoded v2-token-auth
-- Update table default to v3 for new rows that don't go through token RPC
alter table public.browser_ai_heartbeats alter column version set default '2026-09-03.v3';

-- Drop old token heartbeat overload if exists (5-arg) then create new 6-arg with p_version
drop function if exists public.browser_ai_worker_heartbeat(text,text,jsonb,text,jsonb);

create or replace function public.browser_ai_worker_heartbeat(
  p_worker text,
  p_token text,
  p_capabilities jsonb default '[]'::jsonb,
  p_current_task text default null,
  p_detail jsonb default '{}'::jsonb,
  p_version text default '2026-09-03.v3'
) returns jsonb
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  v_version text := coalesce(nullif(trim(p_version),''), '2026-09-03.v3');
begin
  if not private.browser_ai_validate_worker_token(p_token) then
    raise exception 'invalid worker credentials';
  end if;
  if p_worker is null or char_length(trim(p_worker)) < 3 then raise exception 'worker required'; end if;
  if char_length(v_version) > 32 or char_length(v_version) < 1 then raise exception 'invalid version length'; end if;
  -- allow only safe chars for version (alphanum, dot, dash, underscore)
  if v_version !~ '^[A-Za-z0-9._-]+$' then raise exception 'invalid version format'; end if;
  insert into public.browser_ai_heartbeats(worker, version, capabilities, detail, current_task, last_seen, online)
  values (left(trim(p_worker),120), v_version, coalesce(p_capabilities,'[]'::jsonb), coalesce(p_detail,'{}'::jsonb), p_current_task, now(), true)
  on conflict (worker) do update set version = excluded.version, capabilities = excluded.capabilities, detail = excluded.detail, current_task = excluded.current_task, last_seen = now(), online = true;
  return jsonb_build_object('ok', true, 'worker', p_worker, 'version', v_version, 'at', now());
end;
$$;
revoke all on function public.browser_ai_worker_heartbeat(text,text,jsonb,text,jsonb,text) from public;
grant execute on function public.browser_ai_worker_heartbeat(text,text,jsonb,text,jsonb,text) to anon, authenticated, service_role;

-- Backward compat: keep 5-arg overload that forwards to 6-arg with default version (for workers not yet updated)
create or replace function public.browser_ai_worker_heartbeat(
  p_worker text,
  p_token text,
  p_capabilities jsonb,
  p_current_task text,
  p_detail jsonb
) returns jsonb
language sql
security invoker
set search_path = public, private, pg_temp
as $$
  select public.browser_ai_worker_heartbeat(p_worker, p_token, p_capabilities, p_current_task, p_detail, '2026-09-03.v3');
$$;
revoke all on function public.browser_ai_worker_heartbeat(text,text,jsonb,text,jsonb) from public;
grant execute on function public.browser_ai_worker_heartbeat(text,text,jsonb,text,jsonb) to anon, authenticated, service_role;

-- 3. Worker claim: ensure allowed_capabilities check includes v3 if worker advertises them (no change to logic, but document parity)
-- The claim function already filters by p_capabilities array; no hardcoded allowlist, so v3 caps are automatically claimable once worker advertises them.
-- No DDL needed; this comment records parity.

commit;
