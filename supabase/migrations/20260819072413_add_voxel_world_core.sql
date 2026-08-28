create table if not exists public.voxel_worlds (
  id text primary key,
  seed bigint not null,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.voxel_block_overrides (
  world_id text not null references public.voxel_worlds(id) on delete cascade,
  cx integer not null,
  cz integer not null,
  x integer not null,
  y integer not null,
  z integer not null,
  block_type smallint not null check (block_type between 0 and 255),
  updated_by_user uuid null references auth.users(id) on delete set null,
  updated_by_guest uuid null,
  updated_at timestamptz not null default now(),
  primary key (world_id, x, y, z),
  constraint voxel_block_y_range check (y between -64 and 320),
  constraint voxel_block_x_range check (x between -1000000 and 1000000),
  constraint voxel_block_z_range check (z between -1000000 and 1000000)
);

create index if not exists voxel_block_overrides_chunk_idx
  on public.voxel_block_overrides(world_id, cx, cz);

create table if not exists public.voxel_player_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete cascade,
  guest_id uuid null,
  display_name text not null,
  world_id text not null default 'main' references public.voxel_worlds(id) on delete restrict,
  position jsonb not null default '{"x":0,"y":20,"z":0}'::jsonb,
  yaw double precision not null default 0,
  pitch double precision not null default 0,
  inventory jsonb not null default '{"grass":64,"dirt":64,"stone":64,"wood":32,"sand":32,"glass":16}'::jsonb,
  selected_block smallint not null default 1 check (selected_block between 0 and 255),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint voxel_player_identity check ((user_id is not null) <> (guest_id is not null))
);

create unique index if not exists voxel_player_states_user_uidx on public.voxel_player_states(user_id) where user_id is not null;
create unique index if not exists voxel_player_states_guest_uidx on public.voxel_player_states(guest_id) where guest_id is not null;

alter table public.voxel_worlds enable row level security;
alter table public.voxel_block_overrides enable row level security;
alter table public.voxel_player_states enable row level security;

revoke all on public.voxel_worlds from anon, authenticated;
revoke all on public.voxel_block_overrides from anon, authenticated;
revoke all on public.voxel_player_states from anon, authenticated;

grant select on public.voxel_worlds to anon, authenticated;

create policy "voxel worlds readable" on public.voxel_worlds
  for select to anon, authenticated using (true);

insert into public.voxel_worlds(id, seed, settings)
values ('main', 73194217, '{"name":"Voxel World","generatorVersion":1,"chunkSize":16,"minY":-16,"maxY":96}'::jsonb)
on conflict (id) do nothing;
