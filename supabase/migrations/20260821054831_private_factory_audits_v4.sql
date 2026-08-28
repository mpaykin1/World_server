create table if not exists private.factory_audits (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  feature_key text not null,
  submitted_by uuid,
  base_sha text not null,
  blockers integer not null default 0 check (blockers >= 0),
  unknown_mandatory_checks integer not null default 0 check (unknown_mandatory_checks >= 0),
  dimension_summary jsonb not null default '{}'::jsonb,
  report jsonb not null,
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, feature_key, base_sha)
);
revoke all on private.factory_audits from public, anon, authenticated;
grant select, insert, update, delete on private.factory_audits to service_role;
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
begin
  if p_project_id is null or p_feature_key is null or p_feature_key !~ '^[A-Za-z0-9][A-Za-z0-9-]{2,99}$' then
    raise exception 'factory_invalid_audit_identity' using errcode='22023';
  end if;
  if p_report is null or jsonb_typeof(p_report) <> 'object' or pg_column_size(p_report) > 60000 then
    raise exception 'factory_invalid_audit_report' using errcode='22023';
  end if;
  v_base_sha := coalesce(p_report->>'base_sha','');
  if v_base_sha !~ '^[0-9a-f]{7,64}$' then
    raise exception 'factory_invalid_audit_sha' using errcode='22023';
  end if;
  v_blockers := coalesce((p_report->>'blockers')::integer, 0);
  v_unknown := coalesce((p_report->>'unknown_mandatory_checks')::integer, 0);
  v_dimensions := coalesce(p_report->'dimensions','{}'::jsonb);
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
        'codex_audit_dimensions', v_dimensions
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
