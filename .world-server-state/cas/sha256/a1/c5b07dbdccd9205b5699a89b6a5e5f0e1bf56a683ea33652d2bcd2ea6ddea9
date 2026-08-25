-- Close two remaining client-authoritative movement gaps:
-- 1. respawn is constrained to the bounded spawn volume, including height;
-- 2. the database repeats block reach and vertical movement checks so a
--    compromised server call cannot turn the service-only RPC into teleport/edit.

create or replace function public.save_voxel_player_state(
  p_player_state_id uuid,
  p_world_id text,
  p_position jsonb,
  p_yaw double precision,
  p_pitch double precision,
  p_selected_block smallint,
  p_respawn boolean,
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
  v_elapsed double precision;
  v_max_horizontal double precision;
  v_max_vertical double precision;
  v_horizontal double precision;
  v_vertical double precision;
  v_x double precision;
  v_y double precision;
  v_z double precision;
begin
  if p_world_id is null
     or p_world_id !~ '^[a-z0-9][a-z0-9_-]{0,63}$'
     or p_position is null
     or jsonb_typeof(p_position) is distinct from 'object'
     or jsonb_typeof(p_position -> 'x') is distinct from 'number'
     or jsonb_typeof(p_position -> 'y') is distinct from 'number'
     or jsonb_typeof(p_position -> 'z') is distinct from 'number'
     or p_yaw is null or p_yaw not between -100000 and 100000
     or p_pitch is null or p_pitch not between -1.55 and 1.55
     or p_selected_block is null or p_selected_block not between 0 and 13 then
    raise exception 'voxel_player_state_invalid' using errcode = 'P0001';
  end if;

  v_x := (p_position ->> 'x')::double precision;
  v_y := (p_position ->> 'y')::double precision;
  v_z := (p_position ->> 'z')::double precision;
  if v_x not between -1000000 and 1000000
     or v_y not between -64 and 400
     or v_z not between -1000000 and 1000000 then
    raise exception 'voxel_player_state_invalid' using errcode = 'P0001';
  end if;

  select * into v_player
  from public.voxel_player_states
  where id = p_player_state_id
  for update;

  if not found or v_player.world_id <> p_world_id then
    raise exception 'voxel_player_missing' using errcode = 'P0001';
  end if;
  if jsonb_typeof(v_player.position -> 'x') is distinct from 'number'
     or jsonb_typeof(v_player.position -> 'y') is distinct from 'number'
     or jsonb_typeof(v_player.position -> 'z') is distinct from 'number' then
    raise exception 'voxel_player_state_invalid' using errcode = 'P0001';
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

  if v_player.last_save_at is not null
     and v_now - v_player.last_save_at < interval '250 milliseconds' then
    raise exception 'voxel_save_rate_limit' using errcode = 'P0001';
  end if;

  v_elapsed := least(3.0, greatest(0.0, extract(epoch from v_now - v_player.updated_at)));
  v_max_horizontal := case when v_player.last_save_at is null then 32.0 else 0.75 + 12.0 * v_elapsed end;
  v_max_vertical := case when v_player.last_save_at is null then 64.0 else 4.0 + 36.0 * v_elapsed end;
  v_horizontal := sqrt(
    power(v_x - (v_player.position ->> 'x')::double precision, 2)
    + power(v_z - (v_player.position ->> 'z')::double precision, 2)
  );
  v_vertical := abs(v_y - (v_player.position ->> 'y')::double precision);

  if coalesce(p_respawn, false) then
    if abs(v_x) > 8.0 or abs(v_z) > 8.0 or v_y not between 0.0 and 128.0 then
      raise exception 'voxel_respawn_invalid' using errcode = 'P0001';
    end if;
  elsif v_horizontal > v_max_horizontal or v_vertical > v_max_vertical then
    raise exception 'voxel_movement_invalid' using errcode = 'P0001';
  end if;

  update public.voxel_player_states
  set position = p_position,
      yaw = p_yaw,
      pitch = p_pitch,
      selected_block = p_selected_block,
      last_save_at = v_now,
      updated_at = v_now
  where id = v_player.id;

  return jsonb_build_object('ok', true, 'server_time', v_now);
end;
$$;

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
  v_elapsed double precision;
  v_horizontal double precision;
  v_vertical double precision;
  v_px double precision;
  v_py double precision;
  v_pz double precision;
begin
  if p_world_id is null
     or p_x is null or p_y is null or p_z is null or p_block_type is null
     or p_world_id !~ '^[a-z0-9][a-z0-9_-]{0,63}$'
     or p_x not between -1000000 and 1000000
     or p_y not between -64 and 320
     or p_z not between -1000000 and 1000000
     or p_block_type not between 0 and 13
     or p_player_position is null
     or jsonb_typeof(p_player_position) is distinct from 'object'
     or jsonb_typeof(p_player_position -> 'x') is distinct from 'number'
     or jsonb_typeof(p_player_position -> 'y') is distinct from 'number'
     or jsonb_typeof(p_player_position -> 'z') is distinct from 'number' then
    raise exception 'voxel_block_invalid' using errcode = 'P0001';
  end if;

  v_px := (p_player_position ->> 'x')::double precision;
  v_py := (p_player_position ->> 'y')::double precision;
  v_pz := (p_player_position ->> 'z')::double precision;
  if v_px not between -1000000 and 1000000
     or v_py not between -64 and 400
     or v_pz not between -1000000 and 1000000
     or sqrt(
       power(v_px - (p_x + 0.5), 2)
       + power(v_py - (p_y + 0.5), 2)
       + power(v_pz - (p_z + 0.5), 2)
     ) > 8.2 then
    raise exception 'voxel_block_too_far' using errcode = 'P0001';
  end if;

  select * into v_player
  from public.voxel_player_states
  where id = p_player_state_id
  for update;

  if not found or v_player.world_id <> p_world_id then
    raise exception 'voxel_player_missing' using errcode = 'P0001';
  end if;
  if jsonb_typeof(v_player.position -> 'x') is distinct from 'number'
     or jsonb_typeof(v_player.position -> 'y') is distinct from 'number'
     or jsonb_typeof(v_player.position -> 'z') is distinct from 'number' then
    raise exception 'voxel_player_state_invalid' using errcode = 'P0001';
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

  v_elapsed := least(3.0, greatest(0.0, extract(epoch from v_now - v_player.updated_at)));
  v_horizontal := sqrt(
    power(v_px - (v_player.position ->> 'x')::double precision, 2)
    + power(v_pz - (v_player.position ->> 'z')::double precision, 2)
  );
  v_vertical := abs(v_py - (v_player.position ->> 'y')::double precision);
  if v_horizontal > 0.75 + 12.0 * v_elapsed
     or v_vertical > 4.0 + 36.0 * v_elapsed then
    raise exception 'voxel_movement_invalid' using errcode = 'P0001';
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
    'cx', v_cx, 'cz', v_cz, 'x', p_x, 'y', p_y, 'z', p_z,
    'block_type', p_block_type, 'updated_at', v_now
  );
end;
$$;

revoke all on function public.save_voxel_player_state(
  uuid, text, jsonb, double precision, double precision, smallint,
  boolean, uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.save_voxel_player_state(
  uuid, text, jsonb, double precision, double precision, smallint,
  boolean, uuid, uuid, text
) to service_role;

revoke all on function public.apply_voxel_block_edit(
  uuid, text, integer, integer, integer, smallint, jsonb, uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.apply_voxel_block_edit(
  uuid, text, integer, integer, integer, smallint, jsonb, uuid, uuid, text
) to service_role;

comment on function public.save_voxel_player_state(
  uuid, text, jsonb, double precision, double precision, smallint,
  boolean, uuid, uuid, text
) is 'Server-only Voxel save with row locking, bounded 3D movement and a bounded spawn volume.';

comment on function public.apply_voxel_block_edit(
  uuid, text, integer, integer, integer, smallint, jsonb, uuid, uuid, text
) is 'Server-only atomic Voxel edit with identity, 3D movement and block reach rechecks.';
