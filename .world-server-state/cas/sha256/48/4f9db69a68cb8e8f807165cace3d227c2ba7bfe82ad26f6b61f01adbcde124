create or replace function public.queue_factory_feature(
  p_project_id uuid,
  p_feature_key text,
  p_area text,
  p_title text,
  p_description text,
  p_acceptance_criteria jsonb,
  p_priority smallint,
  p_source text,
  p_depends_on text[],
  p_objective text,
  p_implementation_plan jsonb,
  p_target_files jsonb,
  p_preserve_requirements jsonb,
  p_api_contract jsonb,
  p_data_contract jsonb,
  p_ux_contract jsonb,
  p_tests jsonb,
  p_verification_commands text[],
  p_completion_definition text,
  p_codex_instruction text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_project_id is null then
    raise exception 'factory_project_required' using errcode='22023';
  end if;
  if p_feature_key is null or p_feature_key !~ '^[A-Za-z0-9][A-Za-z0-9-]{2,99}$' then
    raise exception 'factory_invalid_feature_key' using errcode='22023';
  end if;
  if p_priority is null or p_priority < 1 or p_priority > 5 then
    raise exception 'factory_invalid_priority' using errcode='22023';
  end if;
  if char_length(coalesce(p_title,'')) < 3 or char_length(coalesce(p_title,'')) > 200 then
    raise exception 'factory_invalid_title' using errcode='22023';
  end if;

  insert into public.feature_backlog(
    project_id, feature_key, area, title, description, acceptance_criteria,
    priority, status, source, depends_on, codex_ready
  ) values (
    p_project_id, p_feature_key, left(coalesce(p_area,''),120), left(p_title,200),
    left(coalesce(p_description,''),4000), coalesce(p_acceptance_criteria,'[]'::jsonb),
    p_priority, 'planned', left(coalesce(p_source,'godot-voxel-factory'),120),
    coalesce(p_depends_on,'{}'::text[]), true
  )
  on conflict (project_id, feature_key) do update set
    area=excluded.area,
    title=excluded.title,
    description=excluded.description,
    acceptance_criteria=excluded.acceptance_criteria,
    priority=excluded.priority,
    source=excluded.source,
    depends_on=excluded.depends_on,
    codex_ready=true,
    updated_at=now();

  insert into public.feature_specs(
    project_id, feature_key, objective, implementation_plan, target_files,
    preserve_requirements, api_contract, data_contract, ux_contract, tests,
    verification_commands, completion_definition, codex_instruction, spec_status
  ) values (
    p_project_id, p_feature_key, left(coalesce(p_objective,''),8000),
    coalesce(p_implementation_plan,'[]'::jsonb), coalesce(p_target_files,'[]'::jsonb),
    coalesce(p_preserve_requirements,'[]'::jsonb), coalesce(p_api_contract,'{}'::jsonb),
    coalesce(p_data_contract,'{}'::jsonb), coalesce(p_ux_contract,'{}'::jsonb),
    coalesce(p_tests,'[]'::jsonb), coalesce(p_verification_commands,'{}'::text[]),
    left(coalesce(p_completion_definition,''),8000), left(coalesce(p_codex_instruction,''),16000),
    'ready'
  )
  on conflict (project_id, feature_key) do update set
    objective=excluded.objective,
    implementation_plan=excluded.implementation_plan,
    target_files=excluded.target_files,
    preserve_requirements=excluded.preserve_requirements,
    api_contract=excluded.api_contract,
    data_contract=excluded.data_contract,
    ux_contract=excluded.ux_contract,
    tests=excluded.tests,
    verification_commands=excluded.verification_commands,
    completion_definition=excluded.completion_definition,
    codex_instruction=excluded.codex_instruction,
    spec_status='ready',
    updated_at=now();

  return p_feature_key;
end;
$$;

revoke all on function public.queue_factory_feature(uuid,text,text,text,text,jsonb,smallint,text,text[],text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text[],text,text) from public;
revoke all on function public.queue_factory_feature(uuid,text,text,text,text,jsonb,smallint,text,text[],text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text[],text,text) from anon;
revoke all on function public.queue_factory_feature(uuid,text,text,text,text,jsonb,smallint,text,text[],text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text[],text,text) from authenticated;
grant execute on function public.queue_factory_feature(uuid,text,text,text,text,jsonb,smallint,text,text[],text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text[],text,text) to service_role;
