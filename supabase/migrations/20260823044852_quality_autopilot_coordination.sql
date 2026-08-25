begin;

create table if not exists public.quality_autopilot_leases (
  project_id text primary key check (char_length(project_id) between 1 and 120),
  owner text not null check (char_length(owner) between 3 and 200),
  lease_expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.quality_autopilot_leases enable row level security;
revoke all on table public.quality_autopilot_leases from anon, authenticated;
drop policy if exists quality_autopilot_leases_service_only on public.quality_autopilot_leases;
create policy quality_autopilot_leases_service_only on public.quality_autopilot_leases for all to service_role using (true) with check (true);

create table if not exists public.quality_compute_daily (
  project_id text not null check (char_length(project_id) between 1 and 120),
  usage_date date not null default current_date,
  cpu_seconds bigint not null default 0 check (cpu_seconds >= 0),
  gpu_seconds bigint not null default 0 check (gpu_seconds >= 0),
  cost_usd numeric(14,6) not null default 0 check (cost_usd >= 0),
  jobs integer not null default 0 check (jobs >= 0),
  updated_at timestamptz not null default now(),
  primary key (project_id, usage_date)
);
alter table public.quality_compute_daily enable row level security;
revoke all on table public.quality_compute_daily from anon, authenticated;
drop policy if exists quality_compute_daily_service_only on public.quality_compute_daily;
create policy quality_compute_daily_service_only on public.quality_compute_daily for all to service_role using (true) with check (true);

create or replace function public.claim_quality_autopilot_lease(p_project text, p_owner text, p_seconds integer default 3600)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare claimed boolean;
begin
  if p_project is null or char_length(trim(p_project)) < 1 then raise exception 'project id required'; end if;
  if p_owner is null or char_length(trim(p_owner)) < 3 then raise exception 'owner required'; end if;
  if p_seconds < 30 or p_seconds > 21600 then raise exception 'lease seconds out of range'; end if;
  insert into public.quality_autopilot_leases(project_id,owner,lease_expires_at,updated_at)
  values (p_project,p_owner,now()+make_interval(secs=>p_seconds),now())
  on conflict (project_id) do update
    set owner=excluded.owner,lease_expires_at=excluded.lease_expires_at,updated_at=now()
    where public.quality_autopilot_leases.lease_expires_at < now()
       or public.quality_autopilot_leases.owner = excluded.owner
  returning true into claimed;
  return coalesce(claimed,false);
end;
$$;
revoke all on function public.claim_quality_autopilot_lease(text,text,integer) from public, anon, authenticated;
grant execute on function public.claim_quality_autopilot_lease(text,text,integer) to service_role;

create or replace function public.release_quality_autopilot_lease(p_project text, p_owner text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare removed integer;
begin
  delete from public.quality_autopilot_leases where project_id=p_project and owner=p_owner;
  get diagnostics removed = row_count;
  return removed > 0;
end;
$$;
revoke all on function public.release_quality_autopilot_lease(text,text) from public, anon, authenticated;
grant execute on function public.release_quality_autopilot_lease(text,text) to service_role;

create or replace function public.reserve_quality_compute(
  p_project text,
  p_cpu_seconds bigint default 0,
  p_gpu_seconds bigint default 0,
  p_cost_usd numeric default 0,
  p_jobs integer default 1,
  p_max_cpu_seconds bigint default 21600,
  p_max_gpu_seconds bigint default 7200,
  p_max_cost_usd numeric default 5,
  p_max_jobs integer default 200
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare row_result public.quality_compute_daily%rowtype;
begin
  if p_project is null or char_length(trim(p_project)) < 1 then raise exception 'project id required'; end if;
  if least(p_cpu_seconds,p_gpu_seconds,p_jobs) < 0 or p_cost_usd < 0 then raise exception 'negative reservation not allowed'; end if;
  if p_cpu_seconds > p_max_cpu_seconds or p_gpu_seconds > p_max_gpu_seconds or p_cost_usd > p_max_cost_usd or p_jobs > p_max_jobs then
    return jsonb_build_object('ok',false,'reason','single-reservation-exceeds-limit');
  end if;
  insert into public.quality_compute_daily(project_id,usage_date,cpu_seconds,gpu_seconds,cost_usd,jobs,updated_at)
  values(p_project,current_date,p_cpu_seconds,p_gpu_seconds,p_cost_usd,p_jobs,now())
  on conflict(project_id,usage_date) do update set
    cpu_seconds=public.quality_compute_daily.cpu_seconds+excluded.cpu_seconds,
    gpu_seconds=public.quality_compute_daily.gpu_seconds+excluded.gpu_seconds,
    cost_usd=public.quality_compute_daily.cost_usd+excluded.cost_usd,
    jobs=public.quality_compute_daily.jobs+excluded.jobs,
    updated_at=now()
  where public.quality_compute_daily.cpu_seconds+excluded.cpu_seconds <= p_max_cpu_seconds
    and public.quality_compute_daily.gpu_seconds+excluded.gpu_seconds <= p_max_gpu_seconds
    and public.quality_compute_daily.cost_usd+excluded.cost_usd <= p_max_cost_usd
    and public.quality_compute_daily.jobs+excluded.jobs <= p_max_jobs
  returning * into row_result;
  if row_result.project_id is null then
    select * into row_result from public.quality_compute_daily where project_id=p_project and usage_date=current_date;
    return jsonb_build_object('ok',false,'reason','daily-budget-exceeded','state',to_jsonb(row_result));
  end if;
  return jsonb_build_object('ok',true,'state',to_jsonb(row_result));
end;
$$;
revoke all on function public.reserve_quality_compute(text,bigint,bigint,numeric,integer,bigint,bigint,numeric,integer) from public, anon, authenticated;
grant execute on function public.reserve_quality_compute(text,bigint,bigint,numeric,integer,bigint,bigint,numeric,integer) to service_role;

commit;
