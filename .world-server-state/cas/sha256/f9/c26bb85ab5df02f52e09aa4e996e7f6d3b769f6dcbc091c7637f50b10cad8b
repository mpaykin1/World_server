create table if not exists private.quality_runtime_scores (
  id bigserial primary key,
  score integer not null check (score between 0 and 100),
  status text not null check (status in ('healthy','degraded','critical')),
  components jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table private.quality_runtime_scores enable row level security;
create index if not exists quality_runtime_scores_created_at_idx on private.quality_runtime_scores(created_at desc);

create table if not exists private.quality_worker_heartbeats (
  worker text primary key,
  capabilities jsonb not null default '[]'::jsonb,
  detail jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now()
);
alter table private.quality_worker_heartbeats enable row level security;

create table if not exists private.quality_worker_auth (
  singleton boolean primary key default true check (singleton),
  token_hash text not null,
  updated_at timestamptz not null default now()
);
alter table private.quality_worker_auth enable row level security;

do $$
declare
  v_token text;
begin
  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name='quality_runtime_worker_token'
  order by created_at desc limit 1;

  if v_token is null then
    v_token := encode(extensions.gen_random_bytes(32),'hex');
    perform vault.create_secret(v_token,'quality_runtime_worker_token','World_server quality runtime worker token');
  end if;

  insert into private.quality_worker_auth(singleton,token_hash,updated_at)
  values(true,encode(extensions.digest(v_token,'sha256'),'hex'),now())
  on conflict(singleton) do update set token_hash=excluded.token_hash,updated_at=now();
end $$;

create or replace function public.quality_validate_worker_token(p_token text)
returns boolean
language sql
security definer
set search_path='private','extensions','pg_temp'
as $$
  select coalesce(
    (select token_hash = encode(digest(coalesce(p_token,''),'sha256'),'hex')
     from private.quality_worker_auth where singleton=true),
    false
  );
$$;

create or replace function public.quality_record_worker_heartbeat(
  p_worker text,
  p_capabilities jsonb default '[]'::jsonb,
  p_detail jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path='private','pg_temp'
as $$
begin
  if p_worker is null or char_length(trim(p_worker)) < 3 then raise exception 'worker required'; end if;
  insert into private.quality_worker_heartbeats(worker,capabilities,detail,checked_at)
  values(left(trim(p_worker),120),coalesce(p_capabilities,'[]'::jsonb),coalesce(p_detail,'{}'::jsonb),now())
  on conflict(worker) do update set capabilities=excluded.capabilities,detail=excluded.detail,checked_at=now();
end;
$$;

create or replace function public.quality_runtime_score()
returns jsonb
language plpgsql
security definer
set search_path='private','public','supabase_migrations','cron','pg_temp'
as $$
declare
  v_now timestamptz:=now();
  v_probe jsonb:=public.quality_latest_synthetic_probe();
  v_probe_at timestamptz;
  v_probe_ok boolean:=false;
  v_crons integer:=0;
  v_tick_at timestamptz;
  v_failures integer:=999;
  v_worker_at timestamptz;
  v_runtime_jobs integer:=0;
  v_drift jsonb:=public.quality_schema_drift_status();
  v_drifted boolean:=true;
  v_migrations integer:=0;
  v_digest jsonb;
  v_score integer:=0;
  v_components jsonb;
  v_status text;
begin
  begin v_probe_at:=nullif(v_probe->>'createdAt','')::timestamptz; exception when others then v_probe_at:=null; end;
  v_probe_ok:=coalesce(v_probe->>'status','')='healthy' and v_probe_at is not null and v_probe_at>=v_now-interval '10 minutes';

  select count(*) into v_crons from cron.job where active and jobname like 'quality-%';
  select last_tick_at,consecutive_failures into v_tick_at,v_failures from private.quality_runtime_state where singleton=true;
  select max(checked_at) into v_worker_at from private.quality_worker_heartbeats;
  select count(*) into v_runtime_jobs
  from public.quality_worker_jobs
  where status in ('queued','running','failed')
    and kind <> 'schema.drift'
    and updated_at >= v_now-interval '24 hours';
  v_drifted:=coalesce((v_drift->>'drift')::boolean,true);
  select count(*) into v_migrations from supabase_migrations.schema_migrations;
  v_digest:=public.quality_migration_history_digest();

  if v_probe_ok then v_score:=v_score+25; end if;
  if v_crons>=5 then v_score:=v_score+15; elsif v_crons>=4 then v_score:=v_score+10; end if;
  if v_tick_at is not null and v_tick_at>=v_now-interval '10 minutes' and coalesce(v_failures,0)=0 then v_score:=v_score+15; end if;
  if v_worker_at is not null and v_worker_at>=v_now-interval '10 minutes' then v_score:=v_score+15; end if;
  if v_runtime_jobs=0 then v_score:=v_score+10; elsif v_runtime_jobs<=2 then v_score:=v_score+5; end if;
  if not v_drifted then v_score:=v_score+15; end if;
  if v_migrations>=80 and coalesce(v_digest->>'digest','')<>'' then v_score:=v_score+5; end if;

  v_status:=case when v_score>=95 then 'healthy' when v_score>=80 then 'degraded' else 'critical' end;
  v_components:=jsonb_build_object(
    'productionProbe',jsonb_build_object('points',case when v_probe_ok then 25 else 0 end,'max',25,'ok',v_probe_ok,'probe',v_probe),
    'schedulers',jsonb_build_object('points',case when v_crons>=5 then 15 when v_crons>=4 then 10 else 0 end,'max',15,'active',v_crons),
    'autopilotTick',jsonb_build_object('points',case when v_tick_at is not null and v_tick_at>=v_now-interval '10 minutes' and coalesce(v_failures,0)=0 then 15 else 0 end,'max',15,'lastTickAt',v_tick_at,'consecutiveFailures',v_failures),
    'edgeWorker',jsonb_build_object('points',case when v_worker_at is not null and v_worker_at>=v_now-interval '10 minutes' then 15 else 0 end,'max',15,'lastHeartbeatAt',v_worker_at),
    'runtimeQueue',jsonb_build_object('points',case when v_runtime_jobs=0 then 10 when v_runtime_jobs<=2 then 5 else 0 end,'max',10,'unresolved24h',v_runtime_jobs),
    'schemaSync',jsonb_build_object('points',case when not v_drifted then 15 else 0 end,'max',15,'drift',v_drift),
    'migrationIntegrity',jsonb_build_object('points',case when v_migrations>=80 and coalesce(v_digest->>'digest','')<>'' then 5 else 0 end,'max',5,'count',v_migrations,'digest',v_digest)
  );
  return jsonb_build_object('score',v_score,'status',v_status,'at',v_now,'components',v_components);
end;
$$;

create or replace function public.quality_record_runtime_score()
returns jsonb
language plpgsql
security definer
set search_path='private','public','pg_temp'
as $$
declare v jsonb; begin
  v:=public.quality_runtime_score();
  insert into private.quality_runtime_scores(score,status,components)
  values((v->>'score')::integer,v->>'status',v->'components');
  return v;
end;
$$;

create or replace function public.quality_desktop_ai_work_packet()
returns jsonb
language sql
security definer
set search_path='private','public','pg_temp'
as $$
  select jsonb_build_object(
    'version','2026-08-24.v11',
    'generatedAt',now(),
    'runtime',public.quality_runtime_status(),
    'score',public.quality_runtime_score(),
    'migrationDigest',public.quality_migration_history_digest(),
    'jobs',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',id,'jobKey',job_key,'kind',kind,'priority',priority,
        'requiredCapabilities',required_capabilities,'payload',payload,
        'status',status,'attempts',attempts,'maxAttempts',max_attempts,
        'leaseOwner',lease_owner,'leaseExpiresAt',lease_expires_at,
        'updatedAt',updated_at
      ) order by priority desc,created_at asc),'[]'::jsonb)
      from public.quality_worker_jobs
      where status in ('queued','running','failed')
    ),
    'rules',jsonb_build_array(
      'Read AGENTS.md and DESKTOP_AI_INSTALL_AND_VERIFY.md before editing.',
      'Create or update WORK_IN_PROGRESS.md before changing project files.',
      'Claim one compatible quality job at a time and preserve its job id.',
      'After 2-3 failed attempts, change strategy and inspect evidence/logs instead of repeating the same action.',
      'Do not stop while a reproducible in-scope error remains unfixed or a changed behavior remains unverified.',
      'Every fix must add or update regression protection where technically possible.',
      'Never push directly to master; use a task branch and PR.',
      'Run release:gate plus relevant browser/runtime tests before marking a job complete.',
      'Re-read this work packet after every completed job until no compatible actionable jobs remain.'
    )
  );
$$;

revoke all on function public.quality_validate_worker_token(text) from public,anon,authenticated;
revoke all on function public.quality_record_worker_heartbeat(text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.quality_runtime_score() from public,anon,authenticated;
revoke all on function public.quality_record_runtime_score() from public,anon,authenticated;
revoke all on function public.quality_desktop_ai_work_packet() from public,anon,authenticated;
grant execute on function public.quality_validate_worker_token(text) to service_role;
grant execute on function public.quality_record_worker_heartbeat(text,jsonb,jsonb) to service_role;
grant execute on function public.quality_runtime_score() to service_role;
grant execute on function public.quality_record_runtime_score() to service_role;
grant execute on function public.quality_desktop_ai_work_packet() to service_role;

update private.quality_runtime_state set version='2026-08-24.v11',updated_at=now() where singleton=true;
