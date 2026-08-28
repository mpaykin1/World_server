create or replace function public.quality_reconcile_oidc_bridge_gap()
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare v_last_success timestamptz; v_change integer; v_present boolean;
begin
  select max(created_at) into v_last_success from private.quality_github_bridge_events where ok;
  v_present := v_last_success is null or v_last_success < now()-interval '24 hours';
  v_change := private.gap_closure_sync_gap(
    'github.oidc.bridge.positive-path.unverified','automation','warning','GitHub OIDC bridge positive path is not yet verified',
    'The bridge rejects unauthenticated requests, but a real allowed GitHub Actions OIDC workflow must also complete successfully.',
    v_present,false,
    jsonb_build_object('lastSuccessAt',v_last_success,'negativeAuthTest',true,'requiredFreshnessHours',24),
    jsonb_build_object('action','run-quality-runtime-bridge-workflow','closeOnlyAfter','successful allowed GitHub OIDC bridge event'),now());
  return jsonb_build_object('present',v_present,'lastSuccessAt',v_last_success,'change',v_change);
end;
$$;
revoke all on function public.quality_reconcile_oidc_bridge_gap() from public, anon, authenticated;
grant execute on function public.quality_reconcile_oidc_bridge_gap() to service_role;

create or replace function public.run_gap_closure_db_cycle(p_trigger text default 'scheduled')
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_run_id bigint;
  v_now timestamptz := now();
  v_detected integer := 0;
  v_closed integer := 0;
  v_queued integer := 0;
  v_change integer := 0;
  v_latest_runtime_evidence timestamptz;
  v_latest_client_telemetry timestamptz;
  v_latest_synthetic_probe timestamptz;
  v_latest_runtime_state timestamptz;
  v_profiles bigint := 0;
  v_manifests bigint := 0;
  v_runtime_stuck bigint := 0;
  v_drift jsonb;
  v_security jsonb;
  v_device jsonb;
  v_external jsonb;
  v_bridge jsonb;
begin
  insert into public.gap_closure_runs(trigger)
  values(coalesce(nullif(p_trigger,''),'scheduled')) returning id into v_run_id;

  select max(created_at) into v_latest_client_telemetry from public.quality_telemetry;
  select max(created_at) into v_latest_synthetic_probe from private.quality_synthetic_probes;
  select max(updated_at) into v_latest_runtime_state from private.quality_runtime_state;
  select max(ts) into v_latest_runtime_evidence from (
    select v_latest_client_telemetry ts union all select v_latest_synthetic_probe union all select v_latest_runtime_state
  ) q where ts is not null;

  v_change := private.gap_closure_sync_gap(
    'runtime.telemetry.stale','observability','major','Runtime evidence is stale',
    'At least one accepted runtime evidence channel must be fresh.',
    v_latest_runtime_evidence is null or v_latest_runtime_evidence < v_now-interval '20 minutes',true,
    jsonb_build_object('latestRuntimeEvidenceAt',v_latest_runtime_evidence,'latestClientTelemetryAt',v_latest_client_telemetry,'latestSyntheticProbeAt',v_latest_synthetic_probe,'latestRuntimeStateAt',v_latest_runtime_state,'requiredFreshnessMinutes',20),
    jsonb_build_object('action','refresh-runtime-probe','closeOnlyAfter','any accepted runtime evidence channel is fresh'),v_now);
  if v_change>0 then v_detected:=v_detected+1; elsif v_change=-1 then v_closed:=v_closed+1; end if;

  select count(*) into v_profiles from public.pixel_animation_profiles where enabled;
  select count(*) into v_manifests from public.pixel_animation_atlas_manifests where enabled;
  v_change := private.gap_closure_sync_gap(
    'pixel.animation.atlas.missing','animation','major','Pixel animation atlas is not materialized',
    'Animation profiles exist but no verified atlas manifest is recorded.',
    v_profiles>0 and v_manifests=0,true,
    jsonb_build_object('profiles',v_profiles,'atlasManifests',v_manifests),
    jsonb_build_object('action','build-pixel-atlas','closeOnlyAfter','quality_register_pixel_atlas_manifest accepts a real atlas and verification passes'),v_now);
  if v_change>0 then v_detected:=v_detected+1; elsif v_change=-1 then v_closed:=v_closed+1; end if;

  select count(*) into v_runtime_stuck
  from public.quality_worker_jobs
  where (
    status='running' and lease_expires_at is not null and lease_expires_at < v_now
  ) or (
    status='queued' and kind in ('runtime.synthetic.failed','runtime.synthetic.slow') and updated_at < v_now-interval '15 minutes'
  );
  v_change := private.gap_closure_sync_gap(
    'quality.worker.queue.stuck','automation','blocker','Autonomous runtime worker queue has stale jobs',
    'Only jobs that the autonomous runtime worker can actually process count as a stuck runtime queue.',
    v_runtime_stuck>0,true,
    jsonb_build_object('staleRuntimeJobs',v_runtime_stuck,'thresholdMinutes',15,'externalRepoJobsExcluded',true),
    jsonb_build_object('action','lease-recovery-and-runtime-requeue','closeOnlyAfter','no stale compatible runtime jobs'),v_now);
  if v_change>0 then v_detected:=v_detected+1; elsif v_change=-1 then v_closed:=v_closed+1; end if;

  v_drift := public.quality_schema_drift_status();
  v_change := private.gap_closure_sync_gap(
    'supabase.schema.drift','release','blocker','Git repository does not match production Supabase migration history',
    'Every applied production migration must be reconstructable from the repository before release governance is complete.',
    coalesce((v_drift->>'drift')::boolean,true),true,
    v_drift,
    jsonb_build_object('action','sync-production-migrations-to-git','bridge','quality-github-bridge','closeOnlyAfter','quality_schema_drift_status.drift=false on merged master'),v_now);
  if v_change>0 then v_detected:=v_detected+1; elsif v_change=-1 then v_closed:=v_closed+1; end if;

  v_security := public.quality_security_definer_audit();
  v_device := public.quality_reconcile_real_device_gap();
  v_external := public.quality_external_control_gap_cycle();
  v_bridge := public.quality_reconcile_oidc_bridge_gap();

  perform public.quality_reconcile_closed_gap_jobs();

  update public.gap_closure_runs
     set finished_at=v_now,detected=v_detected,closed=v_closed,queued=v_queued,
         result=jsonb_build_object(
           'latestRuntimeEvidenceAt',v_latest_runtime_evidence,
           'pixelProfiles',v_profiles,'pixelAtlasManifests',v_manifests,
           'staleRuntimeJobs',v_runtime_stuck,'schemaDrift',v_drift,
           'securityAudit',v_security,'realDevice',v_device,'externalControls',v_external,'oidcBridge',v_bridge)
   where id=v_run_id;

  return jsonb_build_object('ok',true,'version','v12','runId',v_run_id,'detected',v_detected,'closed',v_closed,'queued',v_queued,
    'schemaDrift',v_drift,'security',v_security,'realDevice',v_device,'externalControls',v_external,'oidcBridge',v_bridge);
end;
$$;
revoke all on function public.run_gap_closure_db_cycle(text) from public, anon, authenticated;
grant execute on function public.run_gap_closure_db_cycle(text) to service_role;

select public.run_gap_closure_db_cycle('migration-v12');
update private.quality_runtime_state set version='2026-08-24.v12.3',updated_at=now() where singleton=true;
