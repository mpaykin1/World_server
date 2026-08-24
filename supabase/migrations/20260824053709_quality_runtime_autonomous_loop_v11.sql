create or replace function public.quality_runtime_tick()
returns jsonb
language plpgsql
security definer
set search_path='private','public','pg_temp'
as $$
declare
  v_now timestamptz:=now(); v_run_key text; v_count bigint:=0; v_errors bigint:=0; v_avg_fps numeric; v_p95_load numeric; v_last_event timestamptz;
  v_user_quiet boolean; v_drift jsonb; v_probe jsonb; v_probe_status text; v_probe_at timestamptz; v_probe_duration integer; v_probe_bad boolean;
  v_health jsonb; v_status text; v_enqueued jsonb:='[]'::jsonb; v_job bigint;
begin
  v_run_key:='runtime-v11-'||to_char(v_now,'YYYYMMDDHH24MI');
  select count(*),coalesce(sum(coalesce(error_count,0)),0),round(avg(fps)::numeric,2),percentile_disc(0.95) within group(order by load_ms)
    into v_count,v_errors,v_avg_fps,v_p95_load from public.quality_telemetry where created_at>=v_now-interval '15 minutes';
  select max(created_at) into v_last_event from public.quality_telemetry;
  v_user_quiet:=v_last_event is null or v_last_event<v_now-interval '30 minutes';
  v_drift:=public.quality_schema_drift_status();
  v_probe:=public.quality_latest_synthetic_probe();
  v_probe_status:=coalesce(v_probe->>'status','missing');
  begin v_probe_at:=nullif(v_probe->>'createdAt','')::timestamptz; exception when others then v_probe_at:=null; end;
  v_probe_duration:=coalesce((v_probe->>'durationMs')::integer,0);
  v_probe_bad:=v_probe_at is null or v_probe_at<v_now-interval '15 minutes' or v_probe_status<>'healthy';

  if v_probe_bad then
    v_job:=public.quality_enqueue_worker_job(
      'runtime-synthetic-'||to_char(v_now,'YYYYMMDDHH24'),
      'runtime.synthetic.failed',100,
      '["runtime","supabase","http","probe"]'::jsonb,
      jsonb_build_object('probe',v_probe,'detectedAt',v_now)
    );
    v_enqueued:=v_enqueued||jsonb_build_array(jsonb_build_object('id',v_job,'kind','runtime.synthetic.failed'));
  elsif v_probe_duration>2500 then
    v_job:=public.quality_enqueue_worker_job(
      'runtime-synthetic-slow-'||to_char(v_now,'YYYYMMDDHH24'),
      'runtime.synthetic.slow',75,
      '["runtime","supabase","http","probe"]'::jsonb,
      jsonb_build_object('probe',v_probe,'thresholdMs',2500)
    );
    v_enqueued:=v_enqueued||jsonb_build_array(jsonb_build_object('id',v_job,'kind','runtime.synthetic.slow'));
  end if;

  if v_errors>0 then
    v_job:=public.quality_enqueue_worker_job(
      'runtime-errors-'||to_char(v_now,'YYYYMMDDHH24'),
      'runtime.errors',95,
      '["repo","node"]'::jsonb,
      jsonb_build_object('errors',v_errors,'samples',v_count,'detectedAt',v_now)
    );
    v_enqueued:=v_enqueued||jsonb_build_array(jsonb_build_object('id',v_job,'kind','runtime.errors'));
  end if;

  if v_count>0 and v_avg_fps is not null and v_avg_fps<45 then
    v_job:=public.quality_enqueue_worker_job(
      'runtime-performance-'||to_char(v_now,'YYYYMMDDHH24'),
      'runtime.performance',85,
      '["repo","node","playwright"]'::jsonb,
      jsonb_build_object('avgFps',v_avg_fps,'p95LoadMs',v_p95_load,'samples',v_count)
    );
    v_enqueued:=v_enqueued||jsonb_build_array(jsonb_build_object('id',v_job,'kind','runtime.performance'));
  end if;

  if coalesce((v_drift->>'drift')::boolean,false) then
    v_job:=public.quality_enqueue_worker_job(
      'schema-drift-'||to_char(v_now,'YYYYMMDD'),
      'schema.drift',100,
      '["repo","supabase"]'::jsonb,
      v_drift
    );
    v_enqueued:=v_enqueued||jsonb_build_array(jsonb_build_object('id',v_job,'kind','schema.drift'));
  end if;

  v_status:=case when coalesce((v_drift->>'drift')::boolean,false) or v_probe_bad or v_errors>0 then 'degraded' else 'healthy' end;
  v_health:=jsonb_build_object(
    'status',v_status,'at',v_now,'telemetry15m',v_count,'errors15m',v_errors,
    'avgFps15m',v_avg_fps,'p95LoadMs15m',v_p95_load,'lastTelemetryAt',v_last_event,
    'userTelemetryQuiet',v_user_quiet,'syntheticProbe',v_probe,'syntheticProbeBad',v_probe_bad,
    'schemaDrift',v_drift,'enqueued',v_enqueued
  );
  perform public.quality_record_autopilot_run(jsonb_build_object(
    'runKey',v_run_key,'mode','autopilot','status',v_status,'summary',v_health,
    'evidence',jsonb_build_object('source','pg_cron','version','v11')
  ));
  update private.quality_runtime_state
  set version='2026-08-24.v11',last_tick_at=v_now,last_health=v_health,last_error=null,
      consecutive_failures=0,total_ticks=total_ticks+1,updated_at=now()
  where singleton=true;
  perform public.quality_record_runtime_score();
  return v_health;
exception when others then
  update private.quality_runtime_state
  set last_tick_at=v_now,last_error=left(sqlerrm,500),consecutive_failures=consecutive_failures+1,
      total_ticks=total_ticks+1,updated_at=now()
  where singleton=true;
  raise;
end $$;

create or replace function public.quality_runtime_status()
returns jsonb
language sql
security definer
set search_path='private','public','pg_temp'
as $$
select jsonb_build_object(
  'version',s.version,
  'lastTickAt',s.last_tick_at,
  'totalTicks',s.total_ticks,
  'consecutiveFailures',s.consecutive_failures,
  'lastError',s.last_error,
  'health',s.last_health,
  'score',public.quality_runtime_score(),
  'latestSyntheticProbe',public.quality_latest_synthetic_probe(),
  'schemaDrift',public.quality_schema_drift_status(),
  'workers',(select coalesce(jsonb_agg(jsonb_build_object('worker',worker,'capabilities',capabilities,'detail',detail,'checkedAt',checked_at) order by checked_at desc),'[]'::jsonb) from private.quality_worker_heartbeats),
  'cronJobs',(select coalesce(jsonb_agg(jsonb_build_object('name',jobname,'schedule',schedule,'active',active) order by jobname),'[]'::jsonb) from cron.job where jobname like 'quality-%')
) from private.quality_runtime_state s where singleton=true;
$$;

select cron.schedule(
  'quality-runtime-worker-v11',
  '*/5 * * * *',
  $$ select net.http_post(
      url:='https://iphfwxjuhsucvdyluink.supabase.co/functions/v1/quality-runtime-worker',
      body:='{}'::jsonb,
      headers:=jsonb_build_object(
        'Content-Type','application/json',
        'x-quality-worker-token',(select decrypted_secret from vault.decrypted_secrets where name='quality_runtime_worker_token' order by created_at desc limit 1)
      ),
      timeout_milliseconds:=20000
    ); $$
);

update private.quality_runtime_state set version='2026-08-24.v11',updated_at=now() where singleton=true;
