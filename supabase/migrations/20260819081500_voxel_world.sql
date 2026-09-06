-- Voxel World persistent backend. Idempotent so it is safe to record after the
-- production schema was provisioned interactively before this migration file existed.

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
  block_type smallint not null check (block_type between 0 and 13),
  updated_by_user uuid references auth.users(id) on delete set null,
  updated_by_guest uuid,
  updated_at timestamptz not null default now(),
  primary key (world_id, x, y, z),
  constraint voxel_block_x_range check (x between -1000000 and 1000000),
  constraint voxel_block_y_range check (y between -64 and 320),
  constraint voxel_block_z_range check (z between -1000000 and 1000000)
);

create table if not exists public.voxel_player_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  guest_id uuid,
  display_name text not null,
  world_id text not null default 'main' references public.voxel_worlds(id) on delete restrict,
  position jsonb not null default '{"x":0,"y":20,"z":0}'::jsonb,
  yaw double precision not null default 0,
  pitch double precision not null default 0,
  inventory jsonb not null default '{"dirt":64,"sand":32,"wood":32,"glass":16,"grass":64,"stone":64}'::jsonb,
  selected_block smallint not null default 1 check (selected_block between 0 and 13),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_block_at timestamptz,
  last_save_at timestamptz,
  constraint voxel_player_identity check ((user_id is not null) <> (guest_id is not null))
);

-- Harden schemas that may already exist from the pre-migration provisioning pass.
alter table public.voxel_block_overrides drop constraint if exists voxel_block_overrides_block_type_check;
alter table public.voxel_block_overrides add constraint voxel_block_overrides_block_type_check check (block_type between 0 and 13);
alter table public.voxel_player_states drop constraint if exists voxel_player_states_selected_block_check;
alter table public.voxel_player_states add constraint voxel_player_states_selected_block_check check (selected_block between 0 and 13);

create index if not exists voxel_block_overrides_chunk_idx on public.voxel_block_overrides(world_id, cx, cz);
create index if not exists voxel_block_overrides_updated_by_user_idx on public.voxel_block_overrides(updated_by_user) where updated_by_user is not null;
create unique index if not exists voxel_player_states_user_uidx on public.voxel_player_states(user_id) where user_id is not null;
create unique index if not exists voxel_player_states_guest_uidx on public.voxel_player_states(guest_id) where guest_id is not null;
create index if not exists voxel_player_states_world_id_idx on public.voxel_player_states(world_id);

alter table public.voxel_worlds enable row level security;
alter table public.voxel_block_overrides enable row level security;
alter table public.voxel_player_states enable row level security;

revoke all on table public.voxel_worlds from anon, authenticated;
revoke all on table public.voxel_block_overrides from anon, authenticated;
revoke all on table public.voxel_player_states from anon, authenticated;
grant select on table public.voxel_worlds to anon, authenticated;
grant all on table public.voxel_worlds to service_role;
grant all on table public.voxel_block_overrides to service_role;
grant all on table public.voxel_player_states to service_role;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='voxel_worlds' and policyname='voxel worlds readable'
  ) then
    create policy "voxel worlds readable" on public.voxel_worlds for select to anon, authenticated using (true);
  end if;
end $$;

-- Explicit deny policies keep private state private even if a future grant is
-- added accidentally. The service_role used by /api/voxel bypasses RLS.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='voxel_block_overrides' and policyname='voxel blocks server only'
  ) then
    create policy "voxel blocks server only" on public.voxel_block_overrides
      for all to anon, authenticated using (false) with check (false);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='voxel_player_states' and policyname='voxel players server only'
  ) then
    create policy "voxel players server only" on public.voxel_player_states
      for all to anon, authenticated using (false) with check (false);
  end if;
end $$;

insert into public.voxel_worlds(id, seed, settings)
values ('main', 73194217, '{"name":"Voxel World","chunkSize":16,"minY":-16,"maxY":96,"generatorVersion":1}'::jsonb)
on conflict (id) do update set
  seed = excluded.seed,
  settings = excluded.settings,
  updated_at = now();
