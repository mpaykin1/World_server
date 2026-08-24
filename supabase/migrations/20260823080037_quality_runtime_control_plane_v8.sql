create table if not exists private.quality_control_plane_meta (
  singleton boolean primary key default true check (singleton),
  version text not null,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table private.quality_control_plane_meta enable row level security;

insert into private.quality_control_plane_meta(singleton,version,config,updated_at)
values (true,'2026-08-23.v8',jsonb_build_object('scheduler','github-actions','identity','github-oidc','automerge','post-ci','rollback','vercel-canary'),now())
on conflict (singleton) do update set version=excluded.version,config=excluded.config,updated_at=now();

create or replace function public.quality_record_autopilot_run(p_run jsonb)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_run_key text := nullif(trim(p_run->>'runKey'),'');
  v_mode text := coalesce(nullif(trim(p_run->>'mode'),''),'autopilot');
  v_status text := coalesce(nullif(trim(p_run->>'status'),''),'unknown');
  v_id bigint;
begin
  if v_run_key is null then raise exception 'runKey required'; end if;
  if char_length(v_run_key) > 180 then raise exception 'runKey too long'; end if;
  insert into private.quality_autopilot_runs(run_key,mode,status,summary,evidence)
  values(v_run_key,left(v_mode,40),left(v_status,40),coalesce(p_run->'summary','{}'::jsonb),coalesce(p_run->'evidence','{}'::jsonb))
  on conflict(run_key) do update
    set mode=excluded.mode,status=excluded.status,summary=excluded.summary,evidence=excluded.evidence
  returning id into v_id;
  return jsonb_build_object('id',v_id,'runKey',v_run_key,'status',v_status);
end;
$$;

create or replace function public.quality_enqueue_worker_job(
  p_job_key text,
  p_kind text,
  p_priority integer default 0,
  p_required_capabilities jsonb default '[]'::jsonb,
  p_payload jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id bigint;
begin
  if p_job_key is null or char_length(trim(p_job_key)) < 3 then raise exception 'job key required'; end if;
  if p_kind is null or char_length(trim(p_kind)) < 2 then raise exception 'job kind required'; end if;
  insert into public.quality_worker_jobs(job_key,kind,priority,required_capabilities,payload,status)
  values(left(trim(p_job_key),180),left(trim(p_kind),80),greatest(-100,least(coalesce(p_priority,0),100)),coalesce(p_required_capabilities,'[]'::jsonb),coalesce(p_payload,'{}'::jsonb),'queued')
  on conflict(job_key) do update set
    priority=excluded.priority,
    required_capabilities=excluded.required_capabilities,
    payload=excluded.payload,
    status=case when public.quality_worker_jobs.status in ('complete','running') then public.quality_worker_jobs.status else 'queued' end,
    updated_at=now()
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.quality_complete_worker_job(
  p_id bigint,
  p_worker text,
  p_ok boolean,
  p_result jsonb default '{}'::jsonb,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_rows integer;
begin
  update public.quality_worker_jobs
  set status=case when p_ok then 'complete' else 'failed' end,
      result=coalesce(p_result,'{}'::jsonb),
      error=case when p_ok then null else left(coalesce(p_error,'worker failed'),500) end,
      lease_expires_at=null,
      updated_at=now()
  where id=p_id and status='running' and lease_owner=p_worker;
  get diagnostics v_rows = row_count;
  return v_rows=1;
end;
$$;

create or replace function public.quality_control_plane_status()
returns jsonb
language sql
security definer
set search_path = private, public, pg_temp
as $$
  select jsonb_build_object(
    'version',coalesce((select version from private.quality_control_plane_meta where singleton=true),'missing'),
    'serverTime',now(),
    'autopilotRuns',(select count(*) from private.quality_autopilot_runs),
    'improvementCycles',(select count(*) from private.quality_improvement_cycles),
    'workerJobs',(select count(*) from public.quality_worker_jobs),
    'queuedJobs',(select count(*) from public.quality_worker_jobs where status='queued'),
    'runningJobs',(select count(*) from public.quality_worker_jobs where status='running'),
    'telemetrySamples',(select count(*) from public.quality_telemetry_samples),
    'webTelemetry',(select count(*) from public.quality_telemetry),
    'lastRun',(select jsonb_build_object('runKey',run_key,'mode',mode,'status',status,'createdAt',created_at) from private.quality_autopilot_runs order by created_at desc limit 1)
  );
$$;

revoke all on function public.quality_record_autopilot_run(jsonb) from public, anon, authenticated;
revoke all on function public.quality_enqueue_worker_job(text,text,integer,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.quality_complete_worker_job(bigint,text,boolean,jsonb,text) from public, anon, authenticated;
revoke all on function public.quality_control_plane_status() from public, anon, authenticated;
grant execute on function public.quality_record_autopilot_run(jsonb) to service_role;
grant execute on function public.quality_enqueue_worker_job(text,text,integer,jsonb,jsonb) to service_role;
grant execute on function public.quality_complete_worker_job(bigint,text,boolean,jsonb,text) to service_role;
grant execute on function public.quality_control_plane_status() to service_role;

revoke execute on function public.claim_quality_autopilot_lease(text,text,integer) from public, anon, authenticated;
revoke execute on function public.release_quality_autopilot_lease(text,text) from public, anon, authenticated;
revoke execute on function public.claim_quality_worker_job(text,jsonb,integer) from public, anon, authenticated;
revoke execute on function public.quality_record_improvement_cycle(jsonb) from public, anon, authenticated;
grant execute on function public.claim_quality_autopilot_lease(text,text,integer) to service_role;
grant execute on function public.release_quality_autopilot_lease(text,text) to service_role;
grant execute on function public.claim_quality_worker_job(text,jsonb,integer) to service_role;
grant execute on function public.quality_record_improvement_cycle(jsonb) to service_role;
