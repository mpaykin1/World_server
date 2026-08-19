create schema if not exists extensions;
alter extension citext set schema extensions;

create index if not exists chat_messages_user_id_idx on public.chat_messages(user_id) where user_id is not null;
create index if not exists sharabass_objects_owner_user_id_idx on public.sharabass_objects(owner_user_id) where owner_user_id is not null;
create index if not exists survival_buildings_owner_user_id_idx on public.survival_buildings(owner_user_id) where owner_user_id is not null;

-- These pre-existing project tables are also part of this Supabase application.
create index if not exists daily_improvements_task_id_idx on public.daily_improvements(task_id) where task_id is not null;
create index if not exists projects_created_by_idx on public.projects(created_by) where created_by is not null;
create index if not exists tasks_created_by_idx on public.tasks(created_by) where created_by is not null;
create index if not exists tasks_team_id_idx on public.tasks(team_id) where team_id is not null;
create index if not exists teams_created_by_idx on public.teams(created_by) where created_by is not null;

create or replace function public.game_sharabass_place(
  p_user_id uuid, p_guest_id uuid, p_owner_name text, p_object_type integer, p_position jsonb, p_size numeric
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare inserted public.sharabass_objects;
begin
  if p_user_id is null and p_guest_id is null then raise exception 'Игровая сессия не найдена.'; end if;
  if p_object_type not in (0,1) then raise exception 'Неизвестный тип объекта.'; end if;
  if (p_position ->> 'x')::numeric not between -1000 and 1000 or (p_position ->> 'z')::numeric not between -1000 and 1000 then raise exception 'Координаты вне игрового мира.'; end if;
  perform pg_advisory_xact_lock(hashtext('sharabass_objects'));
  if (select count(*) from public.sharabass_objects) >= 200 then raise exception 'Мир переполнен объектами, удали что-нибудь.'; end if;
  insert into public.sharabass_objects(owner_user_id, owner_guest_id, owner_name, object_type, position, size)
  values (p_user_id, p_guest_id, left(p_owner_name, 32), p_object_type, p_position, greatest(0.2, least(20, p_size))) returning * into inserted;
  return to_jsonb(inserted);
end;
$$;

revoke execute on function public.game_sharabass_place(uuid,uuid,text,integer,jsonb,numeric) from public, anon, authenticated;
grant execute on function public.game_sharabass_place(uuid,uuid,text,integer,jsonb,numeric) to service_role;

-- This maintenance trigger function was present before the game migration and
-- must never be reachable through the Data API.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
