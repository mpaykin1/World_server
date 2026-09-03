-- BROWSER LOCAL CONTROL BRIDGE — Browser ChatGPT <-> Local World_server via Supabase queue
-- Worktree: ai/opencode/browser-local-control
-- Reuses pattern from quality_worker_jobs / quality_worker_heartbeats but domain-separated for typed browser tasks.
-- 2026-09-03

begin;

-- 1. Core queue table (typed contract per spec section 5)
create table if not exists public.browser_ai_tasks (
  id bigserial primary key,
  task_id text not null unique,                           -- uuid v4 string, client-generated idempotency-friendly
  requested_by text not null default 'browser-chatgpt' check (char_length(requested_by) between 1 and 120),
  capability text not null,                               -- must be in allowlist (checked in RPC)
  args jsonb not null default '{}'::jsonb,
  repo text not null default 'mpaykin1/World_server' check (repo = 'mpaykin1/World_server'),
  worktree_mode text not null default 'isolated' check (worktree_mode in ('isolated','shared')),
  risk text not null default 'low' check (risk in ('low','medium','high')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '1 hour'),
  idempotency_key text not null unique,
  status text not null default 'queued' check (status in ('queued','running','completed','failed','blocked','cancelled')),
  lease_owner text,
  lease_expires_at timestamptz,
  executor text,
  started_at timestamptz,
  finished_at timestamptz,
  result jsonb,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  updated_at timestamptz not null default now()
);
create index if not exists browser_ai_tasks_status_created_idx on public.browser_ai_tasks(status, created_at);
create index if not exists browser_ai_tasks_capability_idx on public.browser_ai_tasks(capability);
create index if not exists browser_ai_tasks_expires_idx on public.browser_ai_tasks(expires_at) where status in ('queued','running');
create index if not exists browser_ai_tasks_lease_idx on public.browser_ai_tasks(lease_expires_at) where status='running';

-- enable RLS but allow service_role full access (Browser ChatGPT uses service role / authenticated via RPC)
alter table public.browser_ai_tasks enable row level security;
revoke all on table public.browser_ai_tasks from anon, authenticated;
revoke all on sequence public.browser_ai_tasks_id_seq from anon, authenticated;
drop policy if exists browser_ai_tasks_service_only on public.browser_ai_tasks;
create policy browser_ai_tasks_service_only on public.browser_ai_tasks for all to service_role using (true) with check (true);

-- 2. Heartbeats (mirrors private.quality_worker_heartbeats but public for browser visibility)
create table if not exists public.browser_ai_heartbeats (
  worker text primary key check (char_length(worker) between 1 and 120),
  online boolean not null default true,
  version text not null default '2026-09-03.v1',
  capabilities jsonb not null default '[]'::jsonb,
  current_task text,
  last_seen timestamptz not null default now(),
  success_rate numeric not null default 0 check (success_rate between 0 and 1),
  avg_latency_ms integer not null default 0 check (avg_latency_ms >= 0),
  detail jsonb not null default '{}'::jsonb
);
alter table public.browser_ai_heartbeats enable row level security;
revoke all on table public.browser_ai_heartbeats from anon, authenticated;
drop policy if exists browser_ai_heartbeats_service_only on public.browser_ai_heartbeats;
create policy browser_ai_heartbeats_service_only on public.browser_ai_heartbeats for all to service_role using (true) with check (true);

-- allow authenticated read for browser chatgpt if needed (optional, disabled by default — service_role is preferred)
-- grant select on public.browser_ai_tasks to authenticated; grant select on public.browser_ai_heartbeats to authenticated;

-- 3. RPC: enqueue (idempotent on idempotency_key)
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
security definer
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
    'artifact.list','artifact.read','artifact.zip'
  ];
begin
  if p_capability is null or p_capability <> all(v_allowed) then
    raise exception 'capability % is not allowlisted', p_capability;
  end if;
  if p_risk not in ('low','medium','high') then raise exception 'invalid risk %', p_risk; end if;
  if p_worktree_mode not in ('isolated','shared') then raise exception 'invalid worktree_mode %', p_worktree_mode; end if;
  -- idempotent: if idempotency_key exists return existing
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

-- 4. RPC: get task / result
create or replace function public.browser_ai_get_task(p_task_id text) returns jsonb
language sql security definer set search_path = public, pg_temp as $$
  select case when t.task_id is null then jsonb_build_object('ok',false,'error','not found')
  else jsonb_build_object('ok',true,'task', jsonb_build_object('task_id',t.task_id,'requested_by',t.requested_by,'capability',t.capability,'args',t.args,'repo',t.repo,'worktree_mode',t.worktree_mode,'risk',t.risk,'created_at',t.created_at,'expires_at',t.expires_at,'idempotency_key',t.idempotency_key,'status',t.status,'lease_owner',t.lease_owner,'lease_expires_at',t.lease_expires_at,'executor',t.executor,'started_at',t.started_at,'finished_at',t.finished_at,'result',t.result,'attempts',t.attempts,'updated_at',t.updated_at))
  end from (select * from public.browser_ai_tasks where task_id = p_task_id limit 1) t;
$$;
revoke all on function public.browser_ai_get_task(text) from public, anon, authenticated;
grant execute on function public.browser_ai_get_task(text) to service_role;

create or replace function public.browser_ai_get_result(p_task_id text) returns jsonb
language sql security definer set search_path = public, pg_temp as $$
  select case when t.task_id is null then jsonb_build_object('ok',false,'error','not found')
  when t.status not in ('completed','failed','blocked','cancelled') then jsonb_build_object('ok',false,'error','not finished','status',t.status)
  else jsonb_build_object('ok',true,'task_id',t.task_id,'status',t.status,'executor',t.executor,'started_at',t.started_at,'finished_at',t.finished_at,'result',t.result)
  end from (select * from public.browser_ai_tasks where task_id = p_task_id limit 1) t;
$$;
revoke all on function public.browser_ai_get_result(text) from public, anon, authenticated;
grant execute on function public.browser_ai_get_result(text) to service_role;

-- 5. RPC: list workers (heartbeats)
create or replace function public.browser_ai_list_workers() returns jsonb
language sql security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('ok',true,'workers', coalesce((select jsonb_agg(jsonb_build_object('worker',worker,'online',online,'version',version,'capabilities',capabilities,'current_task',current_task,'last_seen',last_seen,'success_rate',success_rate,'avg_latency_ms',avg_latency_ms,'detail',detail) order by last_seen desc) from public.browser_ai_heartbeats where last_seen > now() - interval '10 minutes'), '[]'::jsonb),'generatedAt', now());
$$;
revoke all on function public.browser_ai_list_workers() from public, anon, authenticated;
grant execute on function public.browser_ai_list_workers() to service_role;

-- 6. RPC: cancel
create or replace function public.browser_ai_cancel_task(p_task_id text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row public.browser_ai_tasks;
begin
  update public.browser_ai_tasks set status='cancelled', updated_at=now(), finished_at=now(), result=coalesce(result,'{}'::jsonb) || jsonb_build_object('cancelledAt', now(), 'cancelReason','user request')
  where task_id = p_task_id and status in ('queued','running') returning * into v_row;
  if not found then
    return jsonb_build_object('ok',false,'error','not found or not cancellable');
  end if;
  return jsonb_build_object('ok',true,'task_id',v_row.task_id,'status',v_row.status);
end;
$$;
revoke all on function public.browser_ai_cancel_task(text) from public, anon, authenticated;
grant execute on function public.browser_ai_cancel_task(text) to service_role;

-- 7. Internal RPCs for worker: claim (SKIP LOCKED + lease reclaim) and heartbeat/complete
create or replace function public.browser_ai_claim_task(p_worker text, p_capabilities jsonb default '[]'::jsonb, p_lease_seconds integer default 300)
returns setof public.browser_ai_tasks
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_worker is null or char_length(trim(p_worker)) < 3 then raise exception 'worker id required'; end if;
  return query
  with picked as (
    select id from public.browser_ai_tasks
    where status in ('queued','running')
      and expires_at > now()
      and attempts < max_attempts
      and (capability = any (select jsonb_array_elements_text(coalesce(p_capabilities,'[]'::jsonb))) or coalesce(p_capabilities,'[]'::jsonb) = '[]'::jsonb)
      and (status='queued' or (status='running' and lease_expires_at is not null and lease_expires_at < now()))
    order by created_at asc
    for update skip locked limit 1
  )
  update public.browser_ai_tasks j
  set status='running', attempts=j.attempts+1, lease_owner=p_worker,
      lease_expires_at=now()+make_interval(secs=>greatest(30,least(p_lease_seconds,3600))),
      executor=p_worker, started_at=coalesce(j.started_at, now()), updated_at=now()
  from picked where j.id = picked.id returning j.*;
end;
$$;
revoke all on function public.browser_ai_claim_task(text,jsonb,integer) from public, anon, authenticated;
grant execute on function public.browser_ai_claim_task(text,jsonb,integer) to service_role;

create or replace function public.browser_ai_heartbeat(p_worker text, p_capabilities jsonb default '[]'::jsonb, p_detail jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_worker is null or char_length(trim(p_worker)) < 3 then raise exception 'worker required'; end if;
  insert into public.browser_ai_heartbeats(worker, capabilities, detail, last_seen, online)
  values(left(trim(p_worker),120), coalesce(p_capabilities,'[]'::jsonb), coalesce(p_detail,'{}'::jsonb), now(), true)
  on conflict(worker) do update set capabilities=excluded.capabilities, detail=excluded.detail, last_seen=now(), online=true;
  return jsonb_build_object('ok',true,'worker',p_worker,'at',now());
end;
$$;
revoke all on function public.browser_ai_heartbeat(text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.browser_ai_heartbeat(text,jsonb,jsonb) to service_role;

create or replace function public.browser_ai_complete_task(p_task_id text, p_status text, p_result jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row public.browser_ai_tasks;
begin
  if p_status not in ('completed','failed','blocked','cancelled') then raise exception 'invalid status %', p_status; end if;
  update public.browser_ai_tasks set status=p_status, result=coalesce(p_result,'{}'::jsonb), finished_at=now(), updated_at=now(), lease_expires_at=null
  where task_id = p_task_id returning * into v_row;
  if not found then return jsonb_build_object('ok',false,'error','not found'); end if;
  return jsonb_build_object('ok',true,'task_id',v_row.task_id,'status',v_row.status);
end;
$$;
revoke all on function public.browser_ai_complete_task(text,text,jsonb) from public, anon, authenticated;
grant execute on function public.browser_ai_complete_task(text,text,jsonb) to service_role;

-- realtime
do $$ begin
  perform 1 from pg_publication where pubname='supabase_realtime';
  if found then
    begin execute 'alter publication supabase_realtime add table public.browser_ai_tasks'; exception when duplicate_object then null; end;
    begin execute 'alter publication supabase_realtime add table public.browser_ai_heartbeats'; exception when duplicate_object then null; end;
  end if;
end $$;

commit;
