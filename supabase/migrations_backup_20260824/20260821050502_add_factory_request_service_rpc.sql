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
declare v_id uuid;
begin
  insert into private.factory_requests(project_id, feature_key, requested_by, job_type, prompt, target)
  values (p_project_id, p_feature_key, p_requested_by, p_job_type, p_prompt, coalesce(p_target, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.create_private_factory_request(uuid,text,uuid,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.create_private_factory_request(uuid,text,uuid,text,text,jsonb) to service_role;

comment on function public.create_private_factory_request(uuid,text,uuid,text,text,jsonb) is 'Service-role-only bridge for storing raw AI Factory requests in private schema.';
