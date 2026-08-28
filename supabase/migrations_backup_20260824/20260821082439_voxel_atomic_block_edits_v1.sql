-- Serialize each player's block edits and commit player position + block state
-- atomically. The HTTP API authenticates the caller, while this server-only
-- function rechecks the bound database identity as defense in depth.
create or replace function public.apply_voxel_block_edit(
  p_player_state_id uuid,
  p_world_id text,
  p_x integer,
  p_y integer,
  p_z integer,
  p_block_type smallint,
  p_player_position jsonb,
  p_user_id uuid,
  p_guest_id uuid,
  p_guest_secret_hash text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_player public.voxel_player_states%rowtype;
  v_now timestamptz := clock_timestamp();
  v_cx integer;
  v_cz integer;
begin
  if p_world_id is null
     or p_x is null
     or p_y is null
     or p_z is null
     or p_block_type is null
     or p_world_id !~ '^[a-z0-9][a-z0-9_-]{0,63}$'
     or p_x not between -1000000 and 1000000
     or p_y not between -64 and 320
     or p_z not between -1000000 and 1000000
     or p_block_type not between 0 and 13 then
    raise exception 'voxel_block_invalid' using errcode = 'P0001';
  end if;

  if p_player_position is null
     or jsonb_typeof(p_player_position) <> 'object'
     or jsonb_typeof(p_player_position -> 'x') <> 'number'
     or jsonb_typeof(p_player_position -> 'y') <> 'number'
     or jsonb_typeof(p_player_position -> 'z') <> 'number'
     or abs((p_player_position ->> 'x')::numeric) > 1000000
     or (p_player_position ->> 'y')::numeric not between -64 and 400
     or abs((p_player_position ->> 'z')::numeric) > 1000000 then
    raise exception 'voxel_position_invalid' using errcode = 'P0001';
  end if;

  select *
  into v_player
  from public.voxel_player_states
  where id = p_player_state_id
  for update;

  if not found or v_player.world_id <> p_world_id then
    raise exception 'voxel_player_missing' using errcode = 'P0001';
  end if;

  if p_user_id is not null then
    if p_guest_id is not null
       or v_player.user_id is distinct from p_user_id
       or v_player.guest_id is not null then
      raise exception 'voxel_identity_mismatch' using errcode = 'P0001';
    end if;
  else
    if p_guest_id is null
       or p_guest_secret_hash !~ '^[0-9a-f]{64}$'
       or v_player.guest_id is distinct from p_guest_id
       or v_player.user_id is not null
       or v_player.guest_secret_hash is distinct from p_guest_secret_hash then
      raise exception 'voxel_identity_mismatch' using errcode = 'P0001';
    end if;
  end if;

  if v_player.last_block_at is not null
     and v_now - v_player.last_block_at < interval '45 milliseconds' then
    raise exception 'voxel_block_rate_limit' using errcode = 'P0001';
  end if;

  update public.voxel_player_states
  set position = p_player_position,
      last_block_at = v_now,
      updated_at = v_now
  where id = v_player.id;

  v_cx := floor(p_x / 16.0)::integer;
  v_cz := floor(p_z / 16.0)::integer;

  insert into public.voxel_block_overrides(
    world_id, cx, cz, x, y, z, block_type,
    updated_by_user, updated_by_guest, updated_at
  ) values (
    p_world_id, v_cx, v_cz, p_x, p_y, p_z, p_block_type,
    p_user_id, p_guest_id, v_now
  )
  on conflict (world_id, x, y, z) do update
  set cx = excluded.cx,
      cz = excluded.cz,
      block_type = excluded.block_type,
      updated_by_user = excluded.updated_by_user,
      updated_by_guest = excluded.updated_by_guest,
      updated_at = excluded.updated_at;

  return jsonb_build_object(
    'cx', v_cx,
    'cz', v_cz,
    'x', p_x,
    'y', p_y,
    'z', p_z,
    'block_type', p_block_type,
    'updated_at', v_now
  );
end;
$$;

revoke all on function public.apply_voxel_block_edit(
  uuid, text, integer, integer, integer, smallint, jsonb, uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.apply_voxel_block_edit(
  uuid, text, integer, integer, integer, smallint, jsonb, uuid, uuid, text
) to service_role;

comment on function public.apply_voxel_block_edit(
  uuid, text, integer, integer, integer, smallint, jsonb, uuid, uuid, text
) is 'Server-only atomic Voxel block mutation with identity recheck and per-player serialization.';
