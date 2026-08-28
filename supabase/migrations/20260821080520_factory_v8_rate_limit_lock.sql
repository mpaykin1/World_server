create or replace function public.create_private_factory_request(
  p_project_id uuid,
  p_feature_key text,
  p_requested_by uuid,
  p_job_type text,
  p_prompt text,
  p_target jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_recent_count integer;
begin
  if p_project_id is null or p_requested_by is null then
    raise exception 'factory_invalid_identity' using errcode = '22023';
  end if;
  if p_feature_key is null or p_feature_key !~ '^[A-Za-z0-9][A-Za-z0-9-]{2,99}$' then
    raise exception 'factory_invalid_feature_key' using errcode = '22023';
  end if;
  if p_job_type is null or p_job_type not in (
    'WORLD_REGION', 'CHARACTER_CREATE', 'ASSET_CREATE', 'MECHANIC_CREATE', 'CODEX_AUDIT'
  ) then
    raise exception 'factory_invalid_job_type' using errcode = '22023';
  end if;
  if p_prompt is null or char_length(btrim(p_prompt)) < 8 or char_length(p_prompt) > 4000 then
    raise exception 'factory_invalid_prompt' using errcode = '22023';
  end if;
  if p_target is not null and jsonb_typeof(p_target) <> 'object' then
    raise exception 'factory_invalid_target' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_requested_by::text || ':factory-rate', 0)
  );

  select count(*) into v_recent_count
  from private.factory_requests
  where requested_by = p_requested_by
    and created_at >= pg_catalog.clock_timestamp() - interval '60 seconds';
  if v_recent_count >= 5 then
    raise exception 'factory_rate_limited' using errcode = '54000';
  end if;

  insert into private.factory_requests(
    project_id, feature_key, requested_by, job_type, prompt, target
  ) values (
    p_project_id,
    p_feature_key,
    p_requested_by,
    p_job_type,
    btrim(p_prompt),
    coalesce(p_target, '{}'::jsonb)
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.create_private_factory_request(
  uuid, text, uuid, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.create_private_factory_request(
  uuid, text, uuid, text, text, jsonb
) to service_role;
