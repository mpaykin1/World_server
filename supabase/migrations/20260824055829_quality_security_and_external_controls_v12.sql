create table if not exists private.quality_security_definer_audits (
  signature text primary key,
  function_name text not null,
  anon_execute boolean not null default false,
  authenticated_execute boolean not null default false,
  classification text not null,
  guard_markers jsonb not null default '[]'::jsonb,
  definition_hash text not null,
  evidence jsonb not null default '{}'::jsonb,
  audited_at timestamptz not null default now()
);
alter table private.quality_security_definer_audits enable row level security;
revoke all on private.quality_security_definer_audits from public, anon, authenticated;

create table if not exists private.quality_external_controls (
  control_key text primary key,
  status boolean not null,
  source text not null,
  details jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table private.quality_external_controls enable row level security;
revoke all on private.quality_external_controls from public, anon, authenticated;

create or replace function public.quality_security_definer_audit()
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_catalog, pg_temp
as $$
declare
  r record;
  v_def text;
  v_class text;
  v_markers jsonb;
  v_total integer := 0;
  v_guarded integer := 0;
  v_public_read integer := 0;
  v_unexpected integer := 0;
  v_rows jsonb := '[]'::jsonb;
begin
  for r in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) args,
           has_function_privilege('anon',p.oid,'EXECUTE') anon_exec,
           has_function_privilege('authenticated',p.oid,'EXECUTE') auth_exec
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef
      and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'))
    order by p.proname, pg_get_function_identity_arguments(p.oid)
  loop
    v_total := v_total + 1;
    v_def := pg_get_functiondef(r.oid);
    v_markers := '[]'::jsonb;
    if v_def ilike '%auth.uid()%' then v_markers := v_markers || '"auth.uid"'::jsonb; end if;
    if v_def ilike '%private.story_can_edit%' then v_markers := v_markers || '"story_can_edit"'::jsonb; end if;
    if v_def ilike '%private.is_project_member%' then v_markers := v_markers || '"is_project_member"'::jsonb; end if;
    if v_def ilike '%private.can_manage_project%' then v_markers := v_markers || '"can_manage_project"'::jsonb; end if;
    if v_def ilike '%user_id=%auth.uid%' or v_def ilike '%user_id=(select auth.uid())%' then v_markers := v_markers || '"owner_filter"'::jsonb; end if;

    if r.anon_exec then
      if r.proname in ('get_story_catalog','get_story_public_snapshot')
         and v_def ilike '%status=''published''%'
         and v_def ilike '%visibility in (''public'',''project'')%'
      then
        v_class := 'intentional_public_read';
        v_public_read := v_public_read + 1;
      else
        v_class := 'unexpected_anon_execute';
        v_unexpected := v_unexpected + 1;
      end if;
    elsif r.auth_exec then
      if jsonb_array_length(v_markers) > 0 then
        v_class := 'authenticated_guarded';
        v_guarded := v_guarded + 1;
      else
        v_class := 'authenticated_guard_not_detected';
        v_unexpected := v_unexpected + 1;
      end if;
    else
      v_class := 'not_exposed';
    end if;

    insert into private.quality_security_definer_audits(
      signature,function_name,anon_execute,authenticated_execute,classification,guard_markers,definition_hash,evidence,audited_at
    ) values(
      r.proname||'('||r.args||')',r.proname,r.anon_exec,r.auth_exec,v_class,v_markers,
      encode(extensions.digest(v_def,'sha256'),'hex'),
      jsonb_build_object('searchPathFixed',v_def ilike '%set search_path to ''''%','securityDefiner',true),now()
    )
    on conflict(signature) do update set
      function_name=excluded.function_name,
      anon_execute=excluded.anon_execute,
      authenticated_execute=excluded.authenticated_execute,
      classification=excluded.classification,
      guard_markers=excluded.guard_markers,
      definition_hash=excluded.definition_hash,
      evidence=excluded.evidence,
      audited_at=excluded.audited_at;

    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'signature',r.proname||'('||r.args||')','classification',v_class,'markers',v_markers,
      'anonExecute',r.anon_exec,'authenticatedExecute',r.auth_exec));
  end loop;

  delete from private.quality_security_definer_audits a
  where not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef
      and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'))
      and a.signature=p.proname||'('||pg_get_function_identity_arguments(p.oid)||')'
  );

  if v_unexpected = 0 then
    update public.gap_closure_registry
       set status='closed',closed_at=now(),last_seen_at=now(),next_check_at=null,last_error=null,
           evidence=jsonb_build_object('auditedFunctions',v_total,'intentionalPublicRead',v_public_read,'authenticatedGuarded',v_guarded,'unexpected',0,'auditVersion','v12')
     where gap_key='supabase.security.security-definer-exposure';
    if found then
      insert into public.gap_closure_evidence(gap_key,evidence_type,source,passed,payload,observed_at)
      values('supabase.security.security-definer-exposure','authorization-audit','quality-security-v12',true,
             jsonb_build_object('total',v_total,'publicRead',v_public_read,'guarded',v_guarded,'unexpected',0),now());
    end if;
  else
    insert into public.gap_closure_registry(gap_key,domain,severity,source,title,description,status,auto_fixable,last_seen_at,next_check_at,evidence,fix_strategy)
    values('supabase.security.security-definer-exposure','security','major','quality-security-v12',
      'SECURITY DEFINER functions need authorization repair',
      'Only unexpected anonymous grants or authenticated functions without a detected authorization guard block readiness.',
      'detected',false,now(),now()+interval '1 hour',
      jsonb_build_object('auditedFunctions',v_total,'intentionalPublicRead',v_public_read,'authenticatedGuarded',v_guarded,'unexpected',v_unexpected,'auditVersion','v12'),
      jsonb_build_object('action','inspect-unexpected-security-definer-functions','autoRevoke',false))
    on conflict(gap_key) do update set status='detected',closed_at=null,last_seen_at=now(),next_check_at=now()+interval '1 hour',evidence=excluded.evidence,fix_strategy=excluded.fix_strategy,last_error=null;
  end if;

  return jsonb_build_object('version','v12','total',v_total,'intentionalPublicRead',v_public_read,'authenticatedGuarded',v_guarded,'unexpected',v_unexpected,'rows',v_rows,'auditedAt',now());
end;
$$;
revoke all on function public.quality_security_definer_audit() from public, anon, authenticated;
grant execute on function public.quality_security_definer_audit() to service_role;

create or replace function public.quality_security_definer_status()
returns jsonb
language sql
security definer
set search_path = private, public, pg_temp
as $$
  select jsonb_build_object(
    'version','v12',
    'total',count(*),
    'unexpected',count(*) filter(where classification in ('unexpected_anon_execute','authenticated_guard_not_detected')),
    'intentionalPublicRead',count(*) filter(where classification='intentional_public_read'),
    'authenticatedGuarded',count(*) filter(where classification='authenticated_guarded'),
    'latestAuditAt',max(audited_at),
    'rows',coalesce(jsonb_agg(jsonb_build_object('signature',signature,'classification',classification,'markers',guard_markers,'hash',definition_hash) order by signature),'[]'::jsonb)
  ) from private.quality_security_definer_audits;
$$;
revoke all on function public.quality_security_definer_status() from public, anon, authenticated;
grant execute on function public.quality_security_definer_status() to service_role;

create or replace function public.quality_record_external_control(p_key text,p_status boolean,p_source text,p_details jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare v_key text:=nullif(trim(p_key),'');
begin
  if v_key is null or char_length(v_key)>120 then raise exception 'valid control key required'; end if;
  insert into private.quality_external_controls(control_key,status,source,details,observed_at,updated_at)
  values(v_key,p_status,left(coalesce(nullif(trim(p_source),''),'unknown'),120),coalesce(p_details,'{}'::jsonb),now(),now())
  on conflict(control_key) do update set status=excluded.status,source=excluded.source,details=excluded.details,observed_at=excluded.observed_at,updated_at=excluded.updated_at;
  return jsonb_build_object('key',v_key,'status',p_status,'recordedAt',now());
end;
$$;
revoke all on function public.quality_record_external_control(text,boolean,text,jsonb) from public, anon, authenticated;
grant execute on function public.quality_record_external_control(text,boolean,text,jsonb) to service_role;

create or replace function public.quality_external_controls_status()
returns jsonb
language sql
security definer
set search_path = private, public, pg_temp
as $$
select jsonb_build_object('controls',coalesce(jsonb_agg(jsonb_build_object('key',control_key,'status',status,'source',source,'details',details,'observedAt',observed_at) order by control_key),'[]'::jsonb))
from private.quality_external_controls;
$$;
revoke all on function public.quality_external_controls_status() from public, anon, authenticated;
grant execute on function public.quality_external_controls_status() to service_role;

create or replace function public.quality_external_control_gap_cycle()
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare v record; v_present boolean; v_stale boolean; v_change integer;
begin
  select * into v from private.quality_external_controls where control_key='github.master.protected';
  v_stale := v.control_key is null or v.observed_at < now()-interval '24 hours';
  v_present := v_stale or not coalesce(v.status,false);
  v_change := private.gap_closure_sync_gap(
    'github.master.protection.disabled','release','blocker','GitHub master branch protection is not verified',
    'The production branch must reject unreviewed/direct unsafe changes and require the release checks.',
    v_present,false,
    jsonb_build_object('known',v.control_key is not null,'protected',coalesce(v.status,false),'observedAt',v.observed_at,'stale',v_stale,'details',coalesce(v.details,'{}'::jsonb)),
    jsonb_build_object('action','enable-and-verify-master-protection','requiredChecks',jsonb_build_array('check','quality-regression','supabase-schema-offline'),'closeOnlyAfter','fresh GitHub API evidence protected=true'),now());
  return jsonb_build_object('gapChange',v_change,'present',v_present,'stale',v_stale,'protected',coalesce(v.status,false));
end;
$$;
revoke all on function public.quality_external_control_gap_cycle() from public, anon, authenticated;
grant execute on function public.quality_external_control_gap_cycle() to service_role;

select public.quality_record_external_control(
  'github.master.protected',false,'chatgpt-github-read',
  jsonb_build_object('repo','mpaykin1/World_server','branch','master','sha','fa3445713f8f9f84130c2795421b9cb1ca2d6640','verifiedAt',now(),'protectionEnabled',false)
);
select public.quality_security_definer_audit();
select public.quality_external_control_gap_cycle();

update private.quality_runtime_state set version='2026-08-24.v12',updated_at=now() where singleton=true;

select cron.unschedule(jobid) from cron.job where jobname='quality-security-audit-v12';
select cron.schedule('quality-security-audit-v12','17 * * * *',$cmd$select public.quality_security_definer_audit();$cmd$);
select cron.unschedule(jobid) from cron.job where jobname='quality-external-controls-v12';
select cron.schedule('quality-external-controls-v12','*/15 * * * *',$cmd$select public.quality_external_control_gap_cycle();$cmd$);
