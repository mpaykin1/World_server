create or replace function public.voxel_apply_block_edit_atomic(
  p_player_state_id uuid,
  p_expected_updated_at timestamptz,
  p_world_id text,
  p_position jsonb,
  p_x integer,
  p_y integer,
  p_z integer,
  p_block_type smallint,
  p_user_id uuid,
  p_guest_id uuid
)
returns table (
  cx integer,
  cz integer,
  x integer,
  y integer,
  z integer,
  block_type smallint,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_updated integer;
begin
  update public.voxel_player_states
  set position = p_position,
      last_block_at = v_now,
      updated_at = v_now
  where id = p_player_state_id
    and updated_at = p_expected_updated_at;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'voxel_state_conflict' using errcode = '40001';
  end if;
  return query
  insert into public.voxel_block_overrides(
    world_id, cx, cz, x, y, z, block_type,
    updated_by_user, updated_by_guest, updated_at
  ) values (
    p_world_id,
    floor(p_x::numeric / 16)::integer,
    floor(p_z::numeric / 16)::integer,
    p_x, p_y, p_z, p_block_type,
    p_user_id, p_guest_id, v_now
  )
  on conflict (world_id, x, y, z) do update set
    cx = excluded.cx,
    cz = excluded.cz,
    block_type = excluded.block_type,
    updated_by_user = excluded.updated_by_user,
    updated_by_guest = excluded.updated_by_guest,
    updated_at = excluded.updated_at
  returning
    voxel_block_overrides.cx,
    voxel_block_overrides.cz,
    voxel_block_overrides.x,
    voxel_block_overrides.y,
    voxel_block_overrides.z,
    voxel_block_overrides.block_type,
    voxel_block_overrides.updated_at;
end;
$$;
revoke all on function public.voxel_apply_block_edit_atomic(uuid,timestamptz,text,jsonb,integer,integer,integer,smallint,uuid,uuid) from public;
revoke all on function public.voxel_apply_block_edit_atomic(uuid,timestamptz,text,jsonb,integer,integer,integer,smallint,uuid,uuid) from anon;
revoke all on function public.voxel_apply_block_edit_atomic(uuid,timestamptz,text,jsonb,integer,integer,integer,smallint,uuid,uuid) from authenticated;
grant execute on function public.voxel_apply_block_edit_atomic(uuid,timestamptz,text,jsonb,integer,integer,integer,smallint,uuid,uuid) to service_role;
