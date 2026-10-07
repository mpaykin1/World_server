-- Player-authored text and actor provenance must never be stored in the
-- publicly readable voxel_worlds.settings document.
create table if not exists public.chain_reaction_private_events (
  world_id text not null references public.voxel_worlds(id) on delete cascade,
  revision bigint not null check (revision >= 0),
  actor_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('commit-plan', 'tick')),
  comment text check (comment is null or char_length(comment) <= 600),
  created_at timestamptz not null default now(),
  primary key (world_id, revision)
);

alter table public.chain_reaction_private_events enable row level security;
revoke all on table public.chain_reaction_private_events from public, anon, authenticated;
grant select, insert, update, delete on table public.chain_reaction_private_events to service_role;

-- Defense in depth for installations that already persisted pre-migration
-- states. Rebuild only the two arrays that could contain private fields.
update public.voxel_worlds
set settings = jsonb_set(
  settings,
  '{chainReaction}',
  jsonb_set(
    jsonb_set(
      settings->'chainReaction',
      '{projects}',
      coalesce((
        select jsonb_agg(
          case when project ? 'intent'
            then jsonb_set(project, '{intent}', (project->'intent') - 'comment')
            else project end
          order by ordinal
        )
        from jsonb_array_elements(coalesce(settings->'chainReaction'->'projects', '[]'::jsonb))
          with ordinality as projects(project, ordinal)
      ), '[]'::jsonb)
    ),
    '{history}',
    coalesce((
      select jsonb_agg((event - 'comment') - 'actorId' order by ordinal)
      from jsonb_array_elements(coalesce(settings->'chainReaction'->'history', '[]'::jsonb))
        with ordinality as events(event, ordinal)
    ), '[]'::jsonb)
  )
),
updated_at = greatest(clock_timestamp(), updated_at + interval '1 microsecond')
where settings ? 'chainReaction'
  and coalesce(settings->'chainReaction', '{}'::jsonb)::text ~ '"(comment|actorId)"';

-- This invariant closes both the migration/deploy window and every future
-- direct writer path, including service-role code that bypasses RLS.
alter table public.voxel_worlds
  add constraint voxel_worlds_chain_reaction_public_privacy
  check (
    not (settings ? 'chainReaction')
    or coalesce(settings->'chainReaction', '{}'::jsonb)::text !~ '"(comment|actorId)"[[:space:]]*:'
  ) not valid;
alter table public.voxel_worlds
  validate constraint voxel_worlds_chain_reaction_public_privacy;

create or replace function public.commit_chain_reaction_action(
  p_world_id text,
  p_expected_updated_at timestamptz,
  p_next_updated_at timestamptz,
  p_public_settings jsonb,
  p_actor_id uuid,
  p_action text,
  p_revision bigint,
  p_comment text default null
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_action not in ('commit-plan', 'tick')
    or p_revision < 0
    or char_length(coalesce(p_comment, '')) > 600
    or coalesce(p_public_settings->'chainReaction', '{}'::jsonb)::text like '%"actorId"%'
    or coalesce(p_public_settings->'chainReaction', '{}'::jsonb)::text like '%"comment"%'
  then
    raise exception 'invalid private Chain Reaction commit';
  end if;

  -- Lock the canonical grant through the commit so a concurrent revoke cannot
  -- succeed between application authorization and the CAS write.
  perform 1
    from public.chain_reaction_world_members
   where world_id = p_world_id
     and user_id = p_actor_id
     and role in ('owner', 'player')
   for key share;
  if not found then
    raise insufficient_privilege using message = 'World access denied';
  end if;

  update public.voxel_worlds
     set settings = p_public_settings,
         updated_at = p_next_updated_at
   where id = p_world_id
     and updated_at = p_expected_updated_at;
  if not found then return false; end if;

  insert into public.chain_reaction_private_events
    (world_id, revision, actor_id, action, comment)
  values
    (p_world_id, p_revision, p_actor_id, p_action,
     case when p_action = 'commit-plan' then coalesce(p_comment, '') else null end);
  return true;
end;
$$;

revoke all on function public.commit_chain_reaction_action(text,timestamptz,timestamptz,jsonb,uuid,text,bigint,text)
  from public, anon, authenticated;
grant execute on function public.commit_chain_reaction_action(text,timestamptz,timestamptz,jsonb,uuid,text,bigint,text)
  to service_role;

do $$
begin
  if exists (
    select 1 from public.voxel_worlds
    where settings ? 'chainReaction'
      and coalesce(settings->'chainReaction', '{}'::jsonb)::text ~ '"(comment|actorId)"'
  ) then
    raise exception 'Chain Reaction public privacy backfill was incomplete';
  end if;
end;
$$;
