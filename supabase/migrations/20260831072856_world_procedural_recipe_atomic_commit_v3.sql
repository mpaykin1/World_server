create or replace function public.world_procedural_recipe_commit_v3(
  p_world_id text,
  p_expected_revision bigint,
  p_recipe jsonb,
  p_content_hash text,
  p_delta jsonb default '{}'::jsonb,
  p_idempotency_key text default null,
  p_source text default 'navigator',
  p_created_by_user uuid default null,
  p_created_by_guest uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_next_revision bigint;
  v_event_id uuid;
  v_current jsonb;
  v_existing public.voxel_world_events%rowtype;
begin
  if p_world_id is null or p_world_id !~ '^[A-Za-z0-9_-]{1,40}$' then
    raise exception 'invalid world id' using errcode = '22023';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'invalid expected revision' using errcode = '22023';
  end if;
  if p_recipe is null or jsonb_typeof(p_recipe) <> 'object' then
    raise exception 'recipe must be a json object' using errcode = '22023';
  end if;
  if p_content_hash is null or p_content_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'content hash must be lowercase sha256 hex' using errcode = '22023';
  end if;
  if p_idempotency_key is not null and length(p_idempotency_key) > 160 then
    raise exception 'idempotency key too long' using errcode = '22023';
  end if;

  if p_idempotency_key is not null then
    select * into v_existing
    from public.voxel_world_events
    where world_id = p_world_id and idempotency_key = p_idempotency_key
    limit 1;
    if found then
      return jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'worldId', p_world_id,
        'revision', v_existing.revision,
        'eventId', v_existing.id,
        'contentHash', coalesce(v_existing.payload->>'recipeHash', v_existing.event_checksum)
      );
    end if;
  end if;

  v_next_revision := p_expected_revision + 1;

  update public.voxel_worlds
  set settings = jsonb_set(
        jsonb_set(coalesce(settings, '{}'::jsonb), '{proceduralRecipe}', p_recipe, true),
        '{proceduralRecipeHash}', to_jsonb(p_content_hash), true
      ),
      revision = v_next_revision,
      updated_at = now()
  where id = p_world_id and revision = p_expected_revision;

  if not found then
    select jsonb_build_object(
      'revision', revision,
      'contentHash', settings->>'proceduralRecipeHash',
      'recipe', settings->'proceduralRecipe'
    ) into v_current
    from public.voxel_worlds
    where id = p_world_id;

    return jsonb_build_object(
      'ok', false,
      'reason', case when v_current is null then 'world_not_found' else 'revision_conflict' end,
      'worldId', p_world_id,
      'current', v_current
    );
  end if;

  insert into public.voxel_world_events(
    world_id, revision, event_type, cx, cz, radius_chunks, payload, source,
    created_by_user, created_by_guest, idempotency_key, event_checksum
  ) values (
    p_world_id,
    v_next_revision,
    'procedural_recipe_patch',
    0,
    0,
    0,
    jsonb_build_object(
      'engine', 'world-procedural-recipe-engine-v3',
      'recipeHash', p_content_hash,
      'delta', coalesce(p_delta, '{}'::jsonb),
      'recipe', p_recipe
    ),
    left(coalesce(nullif(p_source, ''), 'navigator'), 64),
    p_created_by_user,
    p_created_by_guest,
    p_idempotency_key,
    p_content_hash
  ) returning id into v_event_id;

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'worldId', p_world_id,
    'revision', v_next_revision,
    'eventId', v_event_id,
    'contentHash', p_content_hash
  );
exception
  when unique_violation then
    if p_idempotency_key is not null then
      select * into v_existing
      from public.voxel_world_events
      where world_id = p_world_id and idempotency_key = p_idempotency_key
      limit 1;
      if found then
        return jsonb_build_object(
          'ok', true,
          'idempotent', true,
          'worldId', p_world_id,
          'revision', v_existing.revision,
          'eventId', v_existing.id,
          'contentHash', coalesce(v_existing.payload->>'recipeHash', v_existing.event_checksum)
        );
      end if;
    end if;

    select jsonb_build_object(
      'revision', revision,
      'contentHash', settings->>'proceduralRecipeHash',
      'recipe', settings->'proceduralRecipe'
    ) into v_current
    from public.voxel_worlds
    where id = p_world_id;

    return jsonb_build_object(
      'ok', false,
      'reason', 'revision_conflict',
      'worldId', p_world_id,
      'current', v_current
    );
end;
$$;

revoke all on function public.world_procedural_recipe_commit_v3(text,bigint,jsonb,text,jsonb,text,text,uuid,uuid) from public;
revoke all on function public.world_procedural_recipe_commit_v3(text,bigint,jsonb,text,jsonb,text,text,uuid,uuid) from anon;
revoke all on function public.world_procedural_recipe_commit_v3(text,bigint,jsonb,text,jsonb,text,text,uuid,uuid) from authenticated;
grant execute on function public.world_procedural_recipe_commit_v3(text,bigint,jsonb,text,jsonb,text,text,uuid,uuid) to service_role;

comment on function public.world_procedural_recipe_commit_v3(text,bigint,jsonb,text,jsonb,text,text,uuid,uuid)
is 'Server-only atomic compare-and-swap commit for World Procedural Recipe Engine V3 using existing voxel_worlds + voxel_world_events; no client authority.';
