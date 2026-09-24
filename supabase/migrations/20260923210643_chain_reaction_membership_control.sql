-- Reconcile the old trusted Auth app_metadata grants into the authoritative
-- private membership table before runtime authorization stops reading JWT
-- metadata. After this one-time backfill, removing a row takes effect even
-- while a user's older access token is still valid.
insert into public.chain_reaction_world_members (world_id, user_id, role)
select distinct worlds.id, users.id, 'player'
from auth.users as users
cross join lateral jsonb_array_elements_text(
  case
    when jsonb_typeof(users.raw_app_meta_data -> 'chain_reaction_worlds') = 'array'
      then users.raw_app_meta_data -> 'chain_reaction_worlds'
    else '[]'::jsonb
  end
) as grant_world(world_id)
join public.voxel_worlds as worlds on worlds.id = grant_world.world_id
on conflict (world_id, user_id) do nothing;
