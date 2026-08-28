create or replace function public.quality_record_real_device_report(p_report jsonb)
returns uuid
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  v_id uuid; v_class text:=lower(nullif(trim(p_report->>'deviceClass'),''));
  v_metrics jsonb:=coalesce(p_report->'metrics','{}'::jsonb);
  v_screen jsonb:=coalesce(p_report->'screen','{}'::jsonb);
  v_hardware jsonb:=coalesce(p_report->'hardware','{}'::jsonb);
begin
  if v_class not in ('ios','android') then raise exception 'deviceClass must be ios or android'; end if;
  if coalesce((p_report->>'physical')::boolean,false) is not true then raise exception 'physical device evidence required'; end if;
  if jsonb_typeof(v_metrics)<>'object' or v_metrics='{}'::jsonb then raise exception 'non-empty metrics required'; end if;
  insert into public.procedural_quality_device_reports(schema_version,device_class,physical,user_agent,screen,hardware,metrics,app_path,verified,created_at)
  values(11,v_class,true,left(p_report->>'userAgent',500),v_screen,v_hardware,v_metrics,left(p_report->>'appPath',240),false,now())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.quality_verify_real_device_report(p_id uuid,p_evidence jsonb)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  v_provider text:=nullif(trim(p_evidence->>'provider'),'');
  v_run text:=nullif(trim(p_evidence->>'runId'),'');
  v_artifact text:=nullif(trim(p_evidence->>'artifactUrl'),'');
  v_row public.procedural_quality_device_reports%rowtype;
begin
  if v_provider is null or v_run is null then raise exception 'provider and runId required'; end if;
  if v_artifact is null or not (v_artifact like 'https://%' or v_artifact like '/%') then raise exception 'artifactUrl required'; end if;
  update public.procedural_quality_device_reports
  set verified=true,
      hardware=coalesce(hardware,'{}'::jsonb)||jsonb_build_object('verification',jsonb_build_object('provider',v_provider,'runId',v_run,'artifactUrl',v_artifact,'verifiedAt',now()))
  where id=p_id and physical=true and device_class in ('ios','android')
  returning * into v_row;
  if v_row.id is null then raise exception 'eligible physical report not found'; end if;
  return jsonb_build_object('id',v_row.id,'deviceClass',v_row.device_class,'verified',v_row.verified,'createdAt',v_row.created_at);
end;
$$;

create or replace function public.quality_real_device_status()
returns jsonb
language sql
security definer
set search_path='public','pg_temp'
as $$
  select jsonb_build_object(
    'ready',(count(*) filter(where physical and verified and device_class='ios' and created_at>=now()-interval '30 days')>0 and count(*) filter(where physical and verified and device_class='android' and created_at>=now()-interval '30 days')>0),
    'verifiedIos30d',count(*) filter(where physical and verified and device_class='ios' and created_at>=now()-interval '30 days'),
    'verifiedAndroid30d',count(*) filter(where physical and verified and device_class='android' and created_at>=now()-interval '30 days'),
    'unverified',count(*) filter(where physical and not verified),
    'freshnessDays',30
  ) from public.procedural_quality_device_reports;
$$;

create or replace function public.quality_reconcile_real_device_gap()
returns jsonb
language plpgsql
security definer
set search_path='public','private','pg_temp'
as $$
declare v_status jsonb:=public.quality_real_device_status(); v_ready boolean; v_change integer; begin
  v_ready:=coalesce((v_status->>'ready')::boolean,false);
  v_change:=private.gap_closure_sync_gap(
    'runtime.real-device.evidence.missing','devices','major','Verified physical device evidence is missing',
    'Production readiness requires fresh verified evidence from both physical iOS and physical Android devices.',
    not v_ready,false,v_status,
    jsonb_build_object('action','run-real-device-provider','required','verified physical iOS + Android evidence within 30 days'),now()
  );
  return jsonb_build_object('ready',v_ready,'change',v_change,'status',v_status);
end;
$$;

revoke all on function public.quality_record_real_device_report(jsonb) from public,anon,authenticated;
revoke all on function public.quality_verify_real_device_report(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.quality_real_device_status() from public,anon,authenticated;
revoke all on function public.quality_reconcile_real_device_gap() from public,anon,authenticated;
grant execute on function public.quality_record_real_device_report(jsonb) to service_role;
grant execute on function public.quality_verify_real_device_report(uuid,jsonb) to service_role;
grant execute on function public.quality_real_device_status() to service_role;
grant execute on function public.quality_reconcile_real_device_gap() to service_role;

select public.quality_reconcile_real_device_gap();
select cron.schedule('quality-real-device-gap-v11','*/5 * * * *',$$select public.quality_reconcile_real_device_gap();$$);
