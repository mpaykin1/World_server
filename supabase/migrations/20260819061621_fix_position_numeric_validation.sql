create or replace function public.game_survival_update_position(
  p_player_id uuid, p_position jsonb, p_rotation_y double precision
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  player public.game_player_states;
  elapsed_seconds double precision;
  max_step double precision;
  current_x double precision;
  current_z double precision;
  requested_x double precision;
  requested_z double precision;
  next_position jsonb;
begin
  requested_x := (p_position ->> 'x')::double precision;
  requested_z := (p_position ->> 'z')::double precision;
  if requested_x in ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
     or requested_z in ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
     or abs(requested_x) > 10000 or abs(requested_z) > 10000 then
    raise exception 'Координаты вне игрового мира.';
  end if;

  select * into player from public.game_player_states where id = p_player_id for update;
  if not found then raise exception 'Игрок не найден.'; end if;

  current_x := coalesce((player.position ->> 'x')::double precision, 0);
  current_z := coalesce((player.position ->> 'z')::double precision, 0);
  elapsed_seconds := greatest(0.016, least(5.0, extract(epoch from (clock_timestamp() - player.last_position_at))));
  max_step := 18.0 * elapsed_seconds;
  next_position := jsonb_build_object(
    'x', current_x + greatest(-max_step, least(max_step, requested_x - current_x)),
    'y', 0,
    'z', current_z + greatest(-max_step, least(max_step, requested_z - current_z))
  );

  update public.game_player_states
  set position = next_position,
      rotation_y = coalesce(p_rotation_y, player.rotation_y),
      last_position_at = clock_timestamp(),
      updated_at = now()
  where id = p_player_id;
  return next_position;
end;
$$;

revoke execute on function public.game_survival_update_position(uuid,jsonb,double precision) from public, anon, authenticated;
grant execute on function public.game_survival_update_position(uuid,jsonb,double precision) to service_role;
