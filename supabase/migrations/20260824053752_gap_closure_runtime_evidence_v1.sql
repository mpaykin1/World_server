create or replace function public.run_gap_closure_db_cycle(p_trigger text default 'scheduled')
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_run_id bigint;
  v_detected integer := 0;
  v_reopened integer := 0;
  v_closed integer := 0;
  v_queued integer := 0;
  v_change integer := 0;
  v_latest_runtime_evidence timestamptz;
  v_latest_client_telemetry timestamptz;
  v_latest_synthetic_probe timestamptz;
  v_latest_runtime_state timestamptz;
  v_profiles bigint := 0;
  v_manifests bigint := 0;
  v_device_reports bigint := 0;
  v_stuck_jobs bigint := 0;
  v_anon_definer bigint := 0;
  v_auth_definer bigint := 0;
  v_now timestamptz := now();
  v_job_key text;
begin
  insert into public.gap_closure_runs(trigger) values(coalesce(nullif(p_trigger,''),'scheduled')) returning id into v_run_id;

  select max(created_at) into v_latest_client_telemetry from public.quality_telemetry;
  select max(created_at) into v_latest_synthetic_probe from private.quality_synthetic_probes;
  select max(updated_at) into v_latest_runtime_state from private.quality_runtime_state;
  select max(ts) into v_latest_runtime_evidence from (
    select v_latest_client_telemetry as ts
    union all select v_latest_synthetic_probe
    union all select v_latest_runtime_state
  ) s where ts is not null;

  v_change := private.gap_closure_sync_gap(
    'runtime.telemetry.stale','observability','major','Runtime evidence is stale',
    'At least one fresh runtime evidence channel (client telemetry, synthetic probe, or runtime state) is required before runtime quality can be considered verified.',
    v_latest_runtime_evidence is null or v_latest_runtime_evidence < v_now - interval '20 minutes',true,
    jsonb_build_object(
      'latestRuntimeEvidenceAt',v_latest_runtime_evidence,
      'latestClientTelemetryAt',v_latest_client_telemetry,
      'latestSyntheticProbeAt',v_latest_synthetic_probe,
      'latestRuntimeStateAt',v_latest_runtime_state,
      'requiredFreshnessMinutes',20),
    jsonb_build_object('action','refresh-runtime-probe','closeOnlyAfter','any accepted runtime evidence channel is fresh'),v_now);
  if v_change=1 then v_detected:=v_detected+1; elsif v_change=2 then v_detected:=v_detected+1; v_reopened:=v_reopened+1; elsif v_change=-1 then v_closed:=v_closed+1; end if;

  select count(*) into v_profiles from public.pixel_animation_profiles;
  select count(*) into v_manifests from public.pixel_animation_atlas_manifests;
  v_change := private.gap_closure_sync_gap(
    'pixel.animation.atlas.missing','animation','major','Pixel animation atlas is not materialized',
    'Animation profiles exist but no atlas manifest is recorded.',
    v_profiles > 0 and v_manifests = 0,true,
    jsonb_build_object('profiles',v_profiles,'atlasManifests',v_manifests),
    jsonb_build_object('action','build-pixel-atlas','closeOnlyAfter','manifest count > 0 and verification pass'),v_now);
  if v_change=1 then v_detected:=v_detected+1; elsif v_change=2 then v_detected:=v_detected+1; v_reopened:=v_reopened+1; elsif v_change=-1 then v_closed:=v_closed+1; end if;

  select count(*) into v_device_reports from public.procedural_quality_device_reports;
  v_change := private.gap_closure_sync_gap(
    'runtime.real-device.evidence.missing','devices','major','Physical device evidence is missing',
    'Production readiness must include evidence from real iOS and Android devices, not emulation only.',
    v_device_reports = 0,false,
    jsonb_build_object('deviceReports',v_device_reports),
    jsonb_build_object('action','run-real-device-provider','required','verified iOS + Android samples'),v_now);
  if v_change=1 then v_detected:=v_detected+1; elsif v_change=2 then v_detected:=v_detected+1; v_reopened:=v_reopened+1; elsif v_change=-1 then v_closed:=v_closed+1; end if;

  select count(*) into v_stuck_jobs
  from public.quality_worker_jobs
  where status in ('queued','running') and updated_at < v_now - interval '15 minutes';
  v_change := private.gap_closure_sync_gap(
    'quality.worker.queue.stuck','automation','blocker','Quality worker queue has stale jobs',
    'Queued or running quality work has not progressed within the allowed lease window.',
    v_stuck_jobs > 0,true,
    jsonb_build_object('staleJobs',v_stuck_jobs,'thresholdMinutes',15),
    jsonb_build_object('action','lease-recovery-and-requeue','closeOnlyAfter','no stale queued/running jobs'),v_now);
  if v_change=1 then v_detected:=v_detected+1; elsif v_change=2 then v_detected:=v_detected+1; v_reopened:=v_reopened+1; elsif v_change=-1 then v_closed:=v_closed+1; end if;

  select count(*) into v_anon_definer
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where p.prosecdef and n.nspname='public' and has_function_privilege('anon',p.oid,'EXECUTE')
    and p.proname <> 'run_gap_closure_db_cycle';
  select count(*) into v_auth_definer
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where p.prosecdef and n.nspname='public' and has_function_privilege('authenticated',p.oid,'EXECUTE')
    and p.proname <> 'run_gap_closure_db_cycle';
  v_change := private.gap_closure_sync_gap(
    'supabase.security.security-definer-exposure','security','major','SECURITY DEFINER functions have exposed EXECUTE grants',
    'Privileged database functions callable by anon/authenticated roles require explicit review and least-privilege grants.',
    v_anon_definer > 0 or v_auth_definer > 0,false,
    jsonb_build_object('anonExecutable',v_anon_definer,'authenticatedExecutable',v_auth_definer),
    jsonb_build_object('action','review-and-revoke-unnecessary-execute','autoRevoke',false),v_now);
  if v_change=1 then v_detected:=v_detected+1; elsif v_change=2 then v_detected:=v_detected+1; v_reopened:=v_reopened+1; elsif v_change=-1 then v_closed:=v_closed+1; end if;

  if v_latest_runtime_evidence is null or v_latest_runtime_evidence < v_now - interval '20 minutes' then
    v_job_key := 'gap-runtime-evidence-' || to_char(v_now,'YYYYMMDDHH24');
    insert into public.quality_worker_jobs(job_key,kind,priority,required_capabilities,payload,status,attempts,max_attempts,created_at,updated_at)
    select v_job_key,'runtime.telemetry.refresh',100,'[]'::jsonb,jsonb_build_object('gapKey','runtime.telemetry.stale'),'queued',0,3,v_now,v_now
    where not exists(select 1 from public.quality_worker_jobs where job_key=v_job_key);
    if found then v_queued := v_queued + 1; end if;
  end if;

  if v_profiles > 0 and v_manifests = 0 then
    v_job_key := 'gap-pixel-atlas-' || to_char(v_now,'YYYYMMDD');
    insert into public.quality_worker_jobs(job_key,kind,priority,required_capabilities,payload,status,attempts,max_attempts,created_at,updated_at)
    select v_job_key,'pixel.atlas.build',80,'[]'::jsonb,jsonb_build_object('gapKey','pixel.animation.atlas.missing'),'queued',0,3,v_now,v_now
    where not exists(select 1 from public.quality_worker_jobs where job_key=v_job_key);
    if found then v_queued := v_queued + 1; end if;
  end if;

  update public.gap_closure_runs
  set finished_at=v_now, detected=v_detected, reopened=v_reopened, closed=v_closed, queued=v_queued,
      result=jsonb_build_object(
        'latestRuntimeEvidenceAt',v_latest_runtime_evidence,
        'latestClientTelemetryAt',v_latest_client_telemetry,
        'latestSyntheticProbeAt',v_latest_synthetic_probe,
        'latestRuntimeStateAt',v_latest_runtime_state,
        'pixelProfiles',v_profiles,
        'pixelAtlasManifests',v_manifests,
        'deviceReports',v_device_reports,
        'staleWorkerJobs',v_stuck_jobs,
        'anonSecurityDefinerExecute',v_anon_definer,
        'authenticatedSecurityDefinerExecute',v_auth_definer)
  where id=v_run_id;

  return jsonb_build_object('ok',true,'runId',v_run_id,'detected',v_detected,'reopened',v_reopened,'closed',v_closed,'queued',v_queued);
end;
$$;
revoke all on function public.run_gap_closure_db_cycle(text) from public, anon, authenticated;
do $$ begin if exists (select 1 from pg_roles where rolname='service_role') then grant execute on function public.run_gap_closure_db_cycle(text) to service_role; end if; end $$;
