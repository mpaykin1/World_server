-- BROWSER LOCAL WORKER TOKEN AUTH — complements 20260903132229_browser_local_control
-- Creates token-scoped worker authentication so Browser ChatGPT can grant desktop worker
-- limited claim/heartbeat/complete without exposing service_role.
-- Live applied in production as 20260903132521 by Browser ChatGPT via Supabase connector.
-- Source reconstructed to match live schema (verified via live RPC behavior: invalid token -> "invalid worker credentials").
-- 2026-09-03
begin;

create table if not exists private.browser_ai_worker_auth (
  singleton boolean primary key default true check (singleton),
  token_hash text not null,
  worker text not null default 'desktop-opencode',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table private.browser_ai_worker_auth enable row level security;
revoke all on table private.browser_ai_worker_auth from public, anon, authenticated;

-- P0 SECURITY AUDIT 2026-09-05: the cleartext worker token previously committed
-- here was removed from source control (it remains in git history and MUST be
-- rotated in production; do not treat the value below as still secret).
-- store hash of <REDACTED, rotate required> (sha256 e9c6807c00c6c7a248597f19637ad8037cd76614f7a777f4bf3aebe3533374c7)
insert into private.browser_ai_worker_auth(singleton, token_hash, worker, updated_at)
values (true, 'e9c6807c00c6c7a248597f19637ad8037cd76614f7a777f4bf3aebe3533374c7', 'desktop-opencode', now())
on conflict (singleton) do update set token_hash = excluded.token_hash, updated_at = now();

create or replace function private.browser_ai_validate_worker_token(p_token text)
returns boolean
language sql
security definer
set search_path = private, extensions, pg_temp
as $$
  select coalesce(
    (select token_hash = encode(digest(coalesce(p_token,''), 'sha256'), 'hex')
     from private.browser_ai_worker_auth where singleton = true),
    false);
$$;
revoke all on function private.browser_ai_validate_worker_token(text) from public, anon, authenticated;

-- Worker heartbeat (publishable + token)
create or replace function public.browser_ai_worker_heartbeat(
  p_worker text,
  p_token text,
  p_capabilities jsonb default '[]'::jsonb,
  p_current_task text default null,
  p_detail jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
begin
  if not private.browser_ai_validate_worker_token(p_token) then
    raise exception 'invalid worker credentials';
  end if;
  if p_worker is null or char_length(trim(p_worker)) < 3 then raise exception 'worker required'; end if;
  insert into public.browser_ai_heartbeats(worker, capabilities, detail, current_task, last_seen, online)
  values (left(trim(p_worker),120), coalesce(p_capabilities,'[]'::jsonb), coalesce(p_detail,'{}'::jsonb), p_current_task, now(), true)
  on conflict (worker) do update set capabilities = excluded.capabilities, detail = excluded.detail, current_task = excluded.current_task, last_seen = now(), online = true;
  return jsonb_build_object('ok', true, 'worker', p_worker, 'at', now());
end;
$$;
revoke all on function public.browser_ai_worker_heartbeat(text,text,jsonb,text,jsonb) from public;
grant execute on function public.browser_ai_worker_heartbeat(text,text,jsonb,text,jsonb) to anon, authenticated, service_role;

-- Worker claim (publishable + token, allowlisted capabilities, lease + reclaim)
create or replace function public.browser_ai_worker_claim(
  p_worker text,
  p_token text,
  p_capabilities jsonb default '[]'::jsonb,
  p_lease_seconds integer default 300
) returns jsonb
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  v_row public.browser_ai_tasks;
  v_found boolean := false;
begin
  if not private.browser_ai_validate_worker_token(p_token) then
    raise exception 'invalid worker credentials';
  end if;
  if p_worker is null or char_length(trim(p_worker)) < 3 then raise exception 'worker id required'; end if;

  -- try to claim one queued or expired lease, filtered by optional capabilities
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

-- Worker complete (publishable + token)
create or replace function public.browser_ai_worker_complete(
  p_worker text,
  p_token text,
  p_task_id text,
  p_status text,
  p_result jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare v_row public.browser_ai_tasks;
begin
  if not private.browser_ai_validate_worker_token(p_token) then
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

-- keep original service_role-only RPCs for backward compat but they are now invoker; token RPCs are the preferred path
commit;
