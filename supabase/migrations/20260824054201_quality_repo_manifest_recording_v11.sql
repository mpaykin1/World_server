create or replace function public.quality_record_schema_manifest(p_repo_sha text,p_migration_names jsonb)
returns jsonb
language plpgsql
security definer
set search_path='private','public','extensions','pg_temp'
as $$
declare
  v_count integer; v_latest text; v_hash text; v_names jsonb;
begin
  if p_repo_sha is null or p_repo_sha !~ '^[0-9a-fA-F]{40}$' then raise exception 'repo sha must be 40 hex chars'; end if;
  if jsonb_typeof(coalesce(p_migration_names,'[]'::jsonb))<>'array' then raise exception 'migration names must be array'; end if;
  select coalesce(jsonb_agg(x order by x),'[]'::jsonb),count(*) into v_names,v_count from jsonb_array_elements_text(coalesce(p_migration_names,'[]'::jsonb)) t(x);
  if v_count<1 then raise exception 'migration manifest must not be empty'; end if;
  select x into v_latest from jsonb_array_elements_text(v_names) t(x) order by x desc limit 1;
  v_hash:=encode(digest(v_names::text,'sha256'),'hex');
  insert into private.quality_schema_manifest(repo_sha,migration_count,latest_migration,manifest_hash,migration_names,recorded_at)
  values(lower(p_repo_sha),v_count,v_latest,v_hash,v_names,now());
  return public.quality_schema_drift_status();
end;
$$;
revoke all on function public.quality_record_schema_manifest(text,jsonb) from public,anon,authenticated;
grant execute on function public.quality_record_schema_manifest(text,jsonb) to service_role;
