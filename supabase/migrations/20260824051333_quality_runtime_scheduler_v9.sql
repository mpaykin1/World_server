create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

create table if not exists private.quality_runtime_state (
  singleton boolean primary key default true check (singleton),
  version text not null,
  last_tick_at timestamptz,
  last_health jsonb not null default '{}'::jsonb,
  last_error text,
  consecutive_failures integer not null default 0,
  total_ticks bigint not null default 0,
  updated_at timestamptz not null default now()
);
insert into private.quality_runtime_state(singleton,version)
values(true,'2026-08-24.v9')
on conflict(singleton) do update set version=excluded.version,updated_at=now();

create table if not exists private.quality_schema_manifest (
  id bigserial primary key,
  repo_sha text not null,
  migration_count integer not null check (migration_count >= 0),
  latest_migration text,
  manifest_hash text not null,
  migration_names jsonb not null default '[]'::jsonb check (jsonb_typeof(migration_names)='array'),
  recorded_at timestamptz not null default now(),
  unique(repo_sha,manifest_hash)
);
create index if not exists quality_schema_manifest_recorded_idx on private.quality_schema_manifest(recorded_at desc);

create or replace function public.quality_record_schema_manifest(p_manifest jsonb)
returns jsonb language plpgsql security definer set search_path='private','public','pg_temp' as $$
declare v_sha text:=nullif(trim(p_manifest->>'repoSha'),''); v_names jsonb:=coalesce(p_manifest->'migrationNames','[]'::jsonb); v_hash text:=nullif(trim(p_manifest->>'manifestHash'),''); v_latest text:=nullif(trim(p_manifest->>'latestMigration'),''); v_id bigint;
begin
 if v_sha is null or char_length(v_sha)<7 then raise exception 'repoSha required'; end if;
 if jsonb_typeof(v_names)<>'array' then raise exception 'migrationNames must be array'; end if;
 if v_hash is null or char_length(v_hash)<8 then raise exception 'manifestHash required'; end if;
 insert into private.quality_schema_manifest(repo_sha,migration_count,latest_migration,manifest_hash,migration_names)
 values(left(v_sha,80),jsonb_array_length(v_names),left(v_latest,240),left(v_hash,128),v_names)
 on conflict(repo_sha,manifest_hash) do update set migration_count=excluded.migration_count,latest_migration=excluded.latest_migration,migration_names=excluded.migration_names,recorded_at=now()
 returning id into v_id;
 return jsonb_build_object('id',v_id,'repoSha',v_sha,'migrationCount',jsonb_array_length(v_names),'recordedAt',now());
end $$;

create or replace function public.quality_schema_drift_status()
returns jsonb language plpgsql security definer set search_path='private','public','supabase_migrations','pg_temp' as $$
declare v_manifest record; v_db jsonb; v_missing jsonb; v_repo_only jsonb;
begin
 select * into v_manifest from private.quality_schema_manifest order by recorded_at desc limit 1;
 select coalesce(jsonb_agg(version || '_' || name || '.sql' order by version),'[]'::jsonb) into v_db from supabase_migrations.schema_migrations;
 if v_manifest.id is null then return jsonb_build_object('status','manifest-missing','drift',true,'databaseCount',jsonb_array_length(v_db),'missingInRepo',v_db,'repoOnly','[]'::jsonb); end if;
 select coalesce(jsonb_agg(x),'[]'::jsonb) into v_missing from jsonb_array_elements_text(v_db) t(x) where not (v_manifest.migration_names ? x);
 select coalesce(jsonb_agg(x),'[]'::jsonb) into v_repo_only from jsonb_array_elements_text(v_manifest.migration_names) t(x) where not (v_db ? x);
 return jsonb_build_object('status',case when jsonb_array_length(v_missing)=0 and jsonb_array_length(v_repo_only)=0 then 'in-sync' else 'drift' end,'drift',jsonb_array_length(v_missing)>0 or jsonb_array_length(v_repo_only)>0,'repoSha',v_manifest.repo_sha,'repoCount',v_manifest.migration_count,'databaseCount',jsonb_array_length(v_db),'missingInRepo',v_missing,'repoOnly',v_repo_only,'recordedAt',v_manifest.recorded_at);
end $$;

create or replace function public.quality_recover_expired_jobs()
returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $$
declare v_requeued bigint:=0; v_failed bigint:=0;
begin
 with recovered as (update public.quality_worker_jobs set status=case when attempts<max_attempts then 'queued' else 'failed' end,lease_owner=null,lease_expires_at=null,error=case when attempts<max_attempts then 'recovered-expired-lease' else 'max-attempts-after-expired-lease' end,updated_at=now() where status='running' and lease_expires_at is not null and lease_expires_at<now() returning status)
 select count(*) filter(where status='queued'),count(*) filter(where status='failed') into v_requeued,v_failed from recovered;
 return jsonb_build_object('requeued',coalesce(v_requeued,0),'failed',coalesce(v_failed,0),'at',now());
end $$;

create or replace function public.quality_runtime_tick()
returns jsonb language plpgsql security definer set search_path='private','public','pg_temp' as $$
declare v_now timestamptz:=now(); v_run_key text; v_count bigint:=0; v_errors bigint:=0; v_avg_fps numeric; v_p95_load numeric; v_last_event timestamptz; v_stale boolean; v_drift jsonb; v_health jsonb; v_status text; v_enqueued jsonb:='[]'::jsonb; v_job bigint;
begin
 v_run_key:='runtime-v9-'||to_char(v_now,'YYYYMMDDHH24MI');
 select count(*),coalesce(sum(coalesce(error_count,0)),0),round(avg(fps)::numeric,2),percentile_disc(0.95) within group(order by load_ms) into v_count,v_errors,v_avg_fps,v_p95_load from public.quality_telemetry where created_at>=v_now-interval '15 minutes';
 select max(created_at) into v_last_event from public.quality_telemetry;
 v_stale:=v_last_event is null or v_last_event<v_now-interval '30 minutes';
 v_drift:=public.quality_schema_drift_status();
 if v_stale then v_job:=public.quality_enqueue_worker_job('runtime-telemetry-stale-'||to_char(v_now,'YYYYMMDDHH24'),'runtime.telemetry.stale',80,'["http"]'::jsonb,jsonb_build_object('lastEvent',v_last_event,'detectedAt',v_now)); v_enqueued:=v_enqueued||jsonb_build_array(jsonb_build_object('id',v_job,'kind','runtime.telemetry.stale')); end if;
 if v_errors>0 then v_job:=public.quality_enqueue_worker_job('runtime-errors-'||to_char(v_now,'YYYYMMDDHH24'),'runtime.errors',95,'["repo","node"]'::jsonb,jsonb_build_object('errors',v_errors,'samples',v_count,'detectedAt',v_now)); v_enqueued:=v_enqueued||jsonb_build_array(jsonb_build_object('id',v_job,'kind','runtime.errors')); end if;
 if v_count>0 and v_avg_fps is not null and v_avg_fps<45 then v_job:=public.quality_enqueue_worker_job('runtime-performance-'||to_char(v_now,'YYYYMMDDHH24'),'runtime.performance',85,'["repo","node","playwright"]'::jsonb,jsonb_build_object('avgFps',v_avg_fps,'p95LoadMs',v_p95_load,'samples',v_count)); v_enqueued:=v_enqueued||jsonb_build_array(jsonb_build_object('id',v_job,'kind','runtime.performance')); end if;
 if coalesce((v_drift->>'drift')::boolean,false) then v_job:=public.quality_enqueue_worker_job('schema-drift-'||to_char(v_now,'YYYYMMDD'),'schema.drift',100,'["repo","supabase"]'::jsonb,v_drift); v_enqueued:=v_enqueued||jsonb_build_array(jsonb_build_object('id',v_job,'kind','schema.drift')); end if;
 v_status:=case when coalesce((v_drift->>'drift')::boolean,false) or v_stale or v_errors>0 then 'degraded' else 'healthy' end;
 v_health:=jsonb_build_object('status',v_status,'at',v_now,'telemetry15m',v_count,'errors15m',v_errors,'avgFps15m',v_avg_fps,'p95LoadMs15m',v_p95_load,'lastTelemetryAt',v_last_event,'telemetryStale',v_stale,'schemaDrift',v_drift,'enqueued',v_enqueued);
 perform public.quality_record_autopilot_run(jsonb_build_object('runKey',v_run_key,'mode','autopilot','status',v_status,'summary',v_health,'evidence',jsonb_build_object('source','pg_cron','version','v9')));
 update private.quality_runtime_state set version='2026-08-24.v9',last_tick_at=v_now,last_health=v_health,last_error=null,consecutive_failures=0,total_ticks=total_ticks+1,updated_at=now() where singleton=true;
 return v_health;
exception when others then update private.quality_runtime_state set last_tick_at=v_now,last_error=left(sqlerrm,500),consecutive_failures=consecutive_failures+1,total_ticks=total_ticks+1,updated_at=now() where singleton=true; raise;
end $$;

create or replace function public.quality_runtime_status()
returns jsonb language sql security definer set search_path='private','public','pg_temp' as $$
select jsonb_build_object('version',s.version,'lastTickAt',s.last_tick_at,'totalTicks',s.total_ticks,'consecutiveFailures',s.consecutive_failures,'lastError',s.last_error,'health',s.last_health,'schemaDrift',public.quality_schema_drift_status(),'cronJobs',(select coalesce(jsonb_agg(jsonb_build_object('name',jobname,'schedule',schedule,'active',active) order by jobname),'[]'::jsonb) from cron.job where jobname like 'quality-%')) from private.quality_runtime_state s where singleton=true;
$$;

revoke all on function public.quality_record_schema_manifest(jsonb) from public,anon,authenticated;
revoke all on function public.quality_schema_drift_status() from public,anon,authenticated;
revoke all on function public.quality_recover_expired_jobs() from public,anon,authenticated;
revoke all on function public.quality_runtime_tick() from public,anon,authenticated;
revoke all on function public.quality_runtime_status() from public,anon,authenticated;
grant execute on function public.quality_record_schema_manifest(jsonb) to service_role;
grant execute on function public.quality_schema_drift_status() to service_role;
grant execute on function public.quality_recover_expired_jobs() to service_role;
grant execute on function public.quality_runtime_tick() to service_role;
grant execute on function public.quality_runtime_status() to service_role;
select cron.unschedule(jobid) from cron.job where jobname in ('quality-runtime-tick-v9','quality-runtime-recover-v9');
select cron.schedule('quality-runtime-tick-v9','*/5 * * * *','select public.quality_runtime_tick();');
select cron.schedule('quality-runtime-recover-v9','*/10 * * * *','select public.quality_recover_expired_jobs();');
