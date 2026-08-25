create or replace function public.store_private_factory_audit(
  p_project_id uuid,
  p_feature_key text,
  p_submitted_by uuid,
  p_report jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_base_sha text;
  v_blockers integer;
  v_unknown integer;
  v_generated_at timestamptz;
  v_dimensions jsonb;
  v_readiness integer;
begin
  if p_project_id is null or p_feature_key is null or p_feature_key !~ '^[A-Za-z0-9][A-Za-z0-9-]{2,99}$' then
    raise exception 'factory_invalid_audit_identity' using errcode='22023';
  end if;
  if p_report is null or jsonb_typeof(p_report) <> 'object' or pg_column_size(p_report) > 60000 then
    raise exception 'factory_invalid_audit_report' using errcode='22023';
  end if;
  v_base_sha := coalesce(p_report->>'base_sha','');
  if v_base_sha !~ '^[0-9a-f]{40}$' then
    raise exception 'factory_invalid_audit_sha' using errcode='22023';
  end if;
  v_blockers := coalesce((p_report->>'blockers')::integer, 0);
  v_unknown := coalesce((p_report->>'unknown_mandatory_checks')::integer, 0);
  if v_blockers < 0 or v_unknown < 0 then
    raise exception 'factory_invalid_audit_counters' using errcode='22023';
  end if;
  select coalesce(
    jsonb_object_agg(e.key, jsonb_build_object('score', e.value->'score', 'status', e.value->'status')),
    '{}'::jsonb
  ) into v_dimensions
  from jsonb_each(coalesce(p_report->'dimensions','{}'::jsonb)) e
  where jsonb_typeof(e.value) = 'object';
  v_readiness := coalesce((v_dimensions->'overall_production_readiness'->>'score')::integer, 0);
  if v_readiness < 0 or v_readiness > 100 then
    raise exception 'factory_invalid_audit_readiness' using errcode='22023';
  end if;
  begin
    v_generated_at := (p_report->>'generated_at')::timestamptz;
  exception when others then
    raise exception 'factory_invalid_audit_timestamp' using errcode='22023';
  end;
  insert into private.factory_audits(
    project_id, feature_key, submitted_by, base_sha, blockers,
    unknown_mandatory_checks, dimension_summary, report, generated_at
  ) values (
    p_project_id, p_feature_key, p_submitted_by, v_base_sha, v_blockers,
    v_unknown, v_dimensions, p_report, v_generated_at
  )
  on conflict (project_id, feature_key, base_sha) do update set
    submitted_by=excluded.submitted_by,
    blockers=excluded.blockers,
    unknown_mandatory_checks=excluded.unknown_mandatory_checks,
    dimension_summary=excluded.dimension_summary,
    report=excluded.report,
    generated_at=excluded.generated_at,
    updated_at=now()
  returning id into v_id;
  update public.implementation_runs
  set checks = coalesce(checks,'{}'::jsonb) || jsonb_build_object(
        'codex_audit_report_id', v_id,
        'codex_audit_blockers', v_blockers,
        'codex_audit_unknown_mandatory_checks', v_unknown,
        'codex_audit_dimensions', v_dimensions,
        'production_readiness', v_readiness,
        'blockers', v_blockers,
        'unknown_mandatory_checks', v_unknown
      ),
      updated_at = now()
  where id = (
    select ir.id
    from public.implementation_runs ir
    where ir.project_id = p_project_id and ir.feature_key = p_feature_key
    order by ir.created_at desc
    limit 1
  );
  return v_id;
end;
$$;
revoke all on function public.store_private_factory_audit(uuid,text,uuid,jsonb) from public;
revoke all on function public.store_private_factory_audit(uuid,text,uuid,jsonb) from anon;
revoke all on function public.store_private_factory_audit(uuid,text,uuid,jsonb) from authenticated;
grant execute on function public.store_private_factory_audit(uuid,text,uuid,jsonb) to service_role;
