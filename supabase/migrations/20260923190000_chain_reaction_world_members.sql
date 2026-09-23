-- Private authoritative membership for Chain Reaction worlds. The composite
-- primary key makes creator provisioning idempotent and prevents the lost
-- updates possible with a shared auth.users.app_metadata array.
create table if not exists public.chain_reaction_world_members (
  world_id text not null references public.voxel_worlds(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'player',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (world_id, user_id),
  constraint chain_reaction_member_role check (role in ('owner', 'player'))
);

create index if not exists chain_reaction_world_members_user_idx
  on public.chain_reaction_world_members(user_id, world_id);

alter table public.chain_reaction_world_members enable row level security;
revoke all on table public.chain_reaction_world_members from anon, authenticated;
grant all on table public.chain_reaction_world_members to service_role;

-- No client policy is intentional. The service-role API is the only owner of
-- grants, so clients cannot enumerate members or grant/revoke themselves.
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public'
      and tablename='chain_reaction_world_members'
      and policyname='chain reaction members server only'
  ) then
    create policy "chain reaction members server only"
      on public.chain_reaction_world_members for all to anon, authenticated
      using (false) with check (false);
  end if;
end $$;
