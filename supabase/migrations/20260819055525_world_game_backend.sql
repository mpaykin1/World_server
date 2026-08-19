create extension if not exists citext;

alter table public.profiles add column if not exists username citext;
create unique index if not exists profiles_username_key on public.profiles (username) where username is not null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_name text;
begin
  requested_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'username', new.raw_user_meta_data ->> 'display_name', '')), '');
  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    lower(requested_name),
    coalesce(requested_name, new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
    set username = coalesce(excluded.username, public.profiles.username),
        display_name = coalesce(excluded.display_name, public.profiles.display_name),
        avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url);
  return new;
end;
$$;

create table public.game_player_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  guest_id uuid,
  display_name text not null check (char_length(display_name) between 1 and 32),
  inventory jsonb not null,
  health smallint not null default 100 check (health between 0 and 100),
  hunger smallint not null default 100 check (hunger between 0 and 100),
  thirst smallint not null default 100 check (thirst between 0 and 100),
  selected_hotbar_slot smallint not null default 0 check (selected_hotbar_slot between 0 and 8),
  position jsonb not null default '{"x":0,"y":0,"z":0}'::jsonb,
  rotation_y double precision not null default 0,
  last_hit_at timestamptz,
  last_build_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint game_player_identity check ((user_id is not null)::int + (guest_id is not null)::int = 1),
  constraint game_inventory_is_array check (jsonb_typeof(inventory) = 'array' and jsonb_array_length(inventory) = 36)
);
create unique index game_player_states_user_key on public.game_player_states(user_id) where user_id is not null;
create unique index game_player_states_guest_key on public.game_player_states(guest_id) where guest_id is not null;

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  guest_id uuid,
  author_name text not null check (char_length(author_name) between 1 and 32),
  app text not null default 'global' check (app ~ '^[a-zA-Z0-9_-]{1,40}$'),
  message text not null check (char_length(message) between 1 and 220),
  created_at timestamptz not null default now(),
  constraint chat_message_identity check (user_id is not null or guest_id is not null)
);
create index chat_messages_created_at_idx on public.chat_messages(created_at desc);

create table public.sharabass_objects (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references public.profiles(id) on delete set null,
  owner_guest_id uuid,
  owner_name text not null check (char_length(owner_name) between 1 and 32),
  object_type smallint not null check (object_type in (0, 1)),
  position jsonb not null,
  size numeric(8,2) not null check (size between 0.2 and 20),
  created_at timestamptz not null default now(),
  constraint sharabass_object_identity check (owner_user_id is not null or owner_guest_id is not null)
);
create index sharabass_objects_created_at_idx on public.sharabass_objects(created_at);

create table public.game_world_state (
  key text primary key check (key ~ '^[a-z0-9_-]{1,64}$'),
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.game_world_state(key, value)
values ('sharabass_weather', '{"rain":0,"lightning":0,"clouds":0.2,"wind":0.1,"snow":0,"smoke":0.4}'::jsonb)
on conflict (key) do nothing;

create table public.survival_resource_states (
  resource_id text primary key check (resource_id ~ '^r:-?[0-9]+:-?[0-9]+:[0-9]+$'),
  resource_type text not null check (resource_type in ('tree', 'stone', 'metal_ore', 'bush')),
  remaining integer not null check (remaining >= 0),
  updated_at timestamptz not null default now()
);

create table public.survival_buildings (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references public.profiles(id) on delete set null,
  owner_guest_id uuid,
  owner_name text not null check (char_length(owner_name) between 1 and 32),
  piece text not null check (piece in ('foundation', 'wall', 'doorway', 'door', 'stairs', 'campfire', 'storage_box')),
  position jsonb not null,
  rotation_y double precision not null default 0,
  support_id uuid references public.survival_buildings(id) on delete restrict,
  slot text not null check (char_length(slot) between 1 and 120),
  hp integer not null default 1000 check (hp between 0 and 1000),
  created_at timestamptz not null default now(),
  constraint survival_building_identity check (owner_user_id is not null or owner_guest_id is not null),
  constraint survival_building_slot_key unique (slot)
);
create index survival_buildings_created_at_idx on public.survival_buildings(created_at);
create index survival_buildings_support_id_idx on public.survival_buildings(support_id) where support_id is not null;

alter table public.game_player_states enable row level security;
alter table public.chat_messages enable row level security;
alter table public.sharabass_objects enable row level security;
alter table public.game_world_state enable row level security;
alter table public.survival_resource_states enable row level security;
alter table public.survival_buildings enable row level security;

create policy chat_messages_read on public.chat_messages for select to anon, authenticated using (true);
create policy sharabass_objects_read on public.sharabass_objects for select to anon, authenticated using (true);
create policy game_world_state_read on public.game_world_state for select to anon, authenticated using (true);
create policy survival_resource_states_read on public.survival_resource_states for select to anon, authenticated using (true);
create policy survival_buildings_read on public.survival_buildings for select to anon, authenticated using (true);

revoke all on public.game_player_states from anon, authenticated;
grant select on public.chat_messages, public.sharabass_objects, public.game_world_state,
  public.survival_resource_states, public.survival_buildings to anon, authenticated;
grant all on public.game_player_states, public.chat_messages, public.sharabass_objects,
  public.game_world_state, public.survival_resource_states, public.survival_buildings to service_role;

create or replace function public.game_inventory_count(p_inventory jsonb, p_item text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select coalesce(sum(case when slot ->> 'item' = p_item then (slot ->> 'count')::integer else 0 end), 0)::integer
  from jsonb_array_elements(p_inventory) as slot;
$$;

create or replace function public.game_inventory_add(p_inventory jsonb, p_item text, p_count integer)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  result jsonb := p_inventory;
  slot jsonb;
  current_count integer;
  added integer;
  remaining integer := greatest(0, p_count);
  stack_max integer := case p_item when 'food' then 64 when 'stone_hatchet' then 1 when 'pickaxe' then 1 when 'campfire' then 16 when 'storage_box' then 16 when 'door' then 16 else 999 end;
  i integer;
begin
  for i in 0..35 loop
    exit when remaining = 0;
    slot := result -> i;
    if slot <> 'null'::jsonb and slot ->> 'item' = p_item then
      current_count := coalesce((slot ->> 'count')::integer, 0);
      if current_count < stack_max then
        added := least(stack_max - current_count, remaining);
        result := jsonb_set(result, array[i::text], jsonb_build_object('item', p_item, 'count', current_count + added), false);
        remaining := remaining - added;
      end if;
    end if;
  end loop;
  for i in 0..35 loop
    exit when remaining = 0;
    slot := result -> i;
    if slot = 'null'::jsonb then
      added := least(stack_max, remaining);
      result := jsonb_set(result, array[i::text], jsonb_build_object('item', p_item, 'count', added), false);
      remaining := remaining - added;
    end if;
  end loop;
  return result;
end;
$$;

create or replace function public.game_inventory_remove(p_inventory jsonb, p_item text, p_count integer)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  result jsonb := p_inventory;
  slot jsonb;
  current_count integer;
  taken integer;
  remaining integer := greatest(0, p_count);
  i integer;
begin
  if public.game_inventory_count(result, p_item) < remaining then
    raise exception 'Не хватает ресурсов.';
  end if;
  for i in 0..35 loop
    exit when remaining = 0;
    slot := result -> i;
    if slot <> 'null'::jsonb and slot ->> 'item' = p_item then
      current_count := (slot ->> 'count')::integer;
      taken := least(current_count, remaining);
      current_count := current_count - taken;
      remaining := remaining - taken;
      result := jsonb_set(result, array[i::text], case when current_count = 0 then 'null'::jsonb else jsonb_build_object('item', p_item, 'count', current_count) end, false);
    end if;
  end loop;
  return result;
end;
$$;

create or replace function public.game_survival_move_inventory(p_player_id uuid, p_from integer, p_to integer)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  inv jsonb;
  from_slot jsonb;
  to_slot jsonb;
begin
  if p_from < 0 or p_from > 35 or p_to < 0 or p_to > 35 then raise exception 'Некорректный слот.'; end if;
  select inventory into inv from public.game_player_states where id = p_player_id for update;
  if inv is null then raise exception 'Игрок не найден.'; end if;
  from_slot := inv -> p_from;
  to_slot := inv -> p_to;
  inv := jsonb_set(inv, array[p_from::text], to_slot, false);
  inv := jsonb_set(inv, array[p_to::text], from_slot, false);
  update public.game_player_states set inventory = inv, updated_at = now() where id = p_player_id;
  return inv;
end;
$$;

create or replace function public.game_survival_craft(p_player_id uuid, p_item text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  inv jsonb;
  recipe jsonb;
  entry record;
begin
  recipe := case p_item
    when 'stone_hatchet' then '{"wood":10,"stone":5}'::jsonb
    when 'pickaxe' then '{"wood":15,"stone":10}'::jsonb
    when 'campfire' then '{"wood":20,"stone":5}'::jsonb
    when 'storage_box' then '{"wood":40}'::jsonb
    when 'door' then '{"wood":25}'::jsonb
    else null end;
  if recipe is null then raise exception 'Нет такого рецепта.'; end if;
  select inventory into inv from public.game_player_states where id = p_player_id for update;
  if inv is null then raise exception 'Игрок не найден.'; end if;
  for entry in select key, value from jsonb_each_text(recipe) loop
    inv := public.game_inventory_remove(inv, entry.key, entry.value::integer);
  end loop;
  inv := public.game_inventory_add(inv, p_item, 1);
  update public.game_player_states set inventory = inv, updated_at = now() where id = p_player_id;
  return inv;
end;
$$;

create or replace function public.game_survival_hit_resource(
  p_player_id uuid, p_resource_id text, p_resource_type text, p_initial_remaining integer, p_tool text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  player public.game_player_states;
  resource public.survival_resource_states;
  damage integer;
  reward_item text;
  reward_count integer;
  next_inventory jsonb;
begin
  if p_resource_id !~ '^r:-?[0-9]+:-?[0-9]+:[0-9]+$' or p_resource_type not in ('tree','stone','metal_ore','bush') then
    raise exception 'Некорректный ресурс.';
  end if;
  select * into player from public.game_player_states where id = p_player_id for update;
  if not found then raise exception 'Игрок не найден.'; end if;
  if player.last_hit_at is not null and clock_timestamp() - player.last_hit_at < interval '500 milliseconds' then raise exception 'Подожди cooldown добычи.'; end if;
  insert into public.survival_resource_states(resource_id, resource_type, remaining)
  values (p_resource_id, p_resource_type, greatest(1, p_initial_remaining)) on conflict (resource_id) do nothing;
  select * into resource from public.survival_resource_states where resource_id = p_resource_id for update;
  if resource.remaining <= 0 then raise exception 'Ресурс уже добыт.'; end if;
  damage := case when p_tool in ('pickaxe', 'stone_hatchet') then 34 else 20 end;
  resource.remaining := greatest(0, resource.remaining - damage);
  reward_item := case resource.resource_type when 'tree' then 'wood' when 'metal_ore' then 'metal_ore' when 'stone' then 'stone' else case when random() > 0.5 then 'cloth' else 'food' end end;
  reward_count := case resource.resource_type when 'tree' then 25 when 'metal_ore' then 18 when 'bush' then 5 else 20 end;
  next_inventory := public.game_inventory_add(player.inventory, reward_item, reward_count);
  update public.survival_resource_states set remaining = resource.remaining, updated_at = now() where resource_id = p_resource_id;
  update public.game_player_states set inventory = next_inventory, last_hit_at = clock_timestamp(), updated_at = now() where id = p_player_id;
  return jsonb_build_object('inventory', next_inventory, 'resource', jsonb_build_object('id', p_resource_id, 'remaining', resource.remaining));
end;
$$;

create or replace function public.game_survival_commit_building(
  p_player_id uuid, p_piece text, p_position jsonb, p_rotation_y double precision, p_support_id uuid, p_slot text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  player public.game_player_states;
  building public.survival_buildings;
  cost jsonb;
  entry record;
  next_inventory jsonb;
begin
  cost := case p_piece
    when 'foundation' then '{"wood":50}'::jsonb when 'wall' then '{"wood":30}'::jsonb
    when 'doorway' then '{"wood":35}'::jsonb when 'door' then '{"wood":25}'::jsonb
    when 'stairs' then '{"wood":45}'::jsonb when 'campfire' then '{"wood":20,"stone":5}'::jsonb
    when 'storage_box' then '{"wood":40}'::jsonb else null end;
  if cost is null then raise exception 'Нет такого строительного элемента.'; end if;
  if char_length(p_slot) < 1 or char_length(p_slot) > 120 then raise exception 'Некорректная строительная ячейка.'; end if;
  if (p_position ->> 'x')::numeric not between -10000 and 10000 or (p_position ->> 'z')::numeric not between -10000 and 10000 then raise exception 'Координаты вне игрового мира.'; end if;
  if p_piece in ('wall','doorway') and not exists (select 1 from public.survival_buildings where id = p_support_id and piece = 'foundation') then raise exception 'Сначала поставь фундамент, потом крепи стену к краю.'; end if;
  if p_piece = 'door' and not exists (select 1 from public.survival_buildings where id = p_support_id and piece = 'doorway') then raise exception 'Дверь ставится в doorway-проём.'; end if;
  if p_piece = 'stairs' and p_support_id is not null and not exists (select 1 from public.survival_buildings where id = p_support_id and piece = 'foundation') then raise exception 'Лестнице нужна опора.'; end if;
  perform pg_advisory_xact_lock(hashtext('survival_buildings'));
  if (select count(*) from public.survival_buildings) >= 2000 then raise exception 'Мир переполнен постройками.'; end if;
  select * into player from public.game_player_states where id = p_player_id for update;
  if not found then raise exception 'Игрок не найден.'; end if;
  if player.last_build_at is not null and clock_timestamp() - player.last_build_at < interval '300 milliseconds' then raise exception 'Подожди cooldown строительства.'; end if;
  next_inventory := player.inventory;
  for entry in select key, value from jsonb_each_text(cost) loop
    next_inventory := public.game_inventory_remove(next_inventory, entry.key, entry.value::integer);
  end loop;
  insert into public.survival_buildings(owner_user_id, owner_guest_id, owner_name, piece, position, rotation_y, support_id, slot)
  values (player.user_id, player.guest_id, player.display_name, p_piece, p_position, coalesce(p_rotation_y, 0), p_support_id, p_slot)
  returning * into building;
  update public.game_player_states set inventory = next_inventory, last_build_at = clock_timestamp(), updated_at = now() where id = p_player_id;
  return jsonb_build_object('inventory', next_inventory, 'building', to_jsonb(building));
exception when unique_violation then
  raise exception 'На этом месте уже есть постройка.';
end;
$$;

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
  if (select count(*) from public.sharabass_objects) >= 50 then raise exception 'Мир переполнен объектами, удали что-нибудь.'; end if;
  insert into public.sharabass_objects(owner_user_id, owner_guest_id, owner_name, object_type, position, size)
  values (p_user_id, p_guest_id, left(p_owner_name, 32), p_object_type, p_position, greatest(0.2, least(20, p_size))) returning * into inserted;
  return to_jsonb(inserted);
end;
$$;

create or replace function public.game_sharabass_remove(p_object_id uuid, p_user_id uuid, p_guest_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  delete from public.sharabass_objects
  where id = p_object_id and ((p_user_id is not null and owner_user_id = p_user_id) or (p_guest_id is not null and owner_guest_id = p_guest_id));
  if not found then raise exception 'Не найден объект для удаления.'; end if;
  return true;
end;
$$;

revoke execute on function public.game_inventory_count(jsonb,text) from public, anon, authenticated;
revoke execute on function public.game_inventory_add(jsonb,text,integer) from public, anon, authenticated;
revoke execute on function public.game_inventory_remove(jsonb,text,integer) from public, anon, authenticated;
revoke execute on function public.game_survival_move_inventory(uuid,integer,integer) from public, anon, authenticated;
revoke execute on function public.game_survival_craft(uuid,text) from public, anon, authenticated;
revoke execute on function public.game_survival_hit_resource(uuid,text,text,integer,text) from public, anon, authenticated;
revoke execute on function public.game_survival_commit_building(uuid,text,jsonb,double precision,uuid,text) from public, anon, authenticated;
revoke execute on function public.game_sharabass_place(uuid,uuid,text,integer,jsonb,numeric) from public, anon, authenticated;
revoke execute on function public.game_sharabass_remove(uuid,uuid,uuid) from public, anon, authenticated;

grant execute on function public.game_inventory_count(jsonb,text) to service_role;
grant execute on function public.game_inventory_add(jsonb,text,integer) to service_role;
grant execute on function public.game_inventory_remove(jsonb,text,integer) to service_role;
grant execute on function public.game_survival_move_inventory(uuid,integer,integer) to service_role;
grant execute on function public.game_survival_craft(uuid,text) to service_role;
grant execute on function public.game_survival_hit_resource(uuid,text,text,integer,text) to service_role;
grant execute on function public.game_survival_commit_building(uuid,text,jsonb,double precision,uuid,text) to service_role;
grant execute on function public.game_sharabass_place(uuid,uuid,text,integer,jsonb,numeric) to service_role;
grant execute on function public.game_sharabass_remove(uuid,uuid,uuid) to service_role;

alter table public.chat_messages replica identity full;
alter table public.sharabass_objects replica identity full;
alter table public.game_world_state replica identity full;
alter table public.survival_resource_states replica identity full;
alter table public.survival_buildings replica identity full;

alter publication supabase_realtime add table public.chat_messages;
alter publication supabase_realtime add table public.sharabass_objects;
alter publication supabase_realtime add table public.game_world_state;
alter publication supabase_realtime add table public.survival_resource_states;
alter publication supabase_realtime add table public.survival_buildings;
