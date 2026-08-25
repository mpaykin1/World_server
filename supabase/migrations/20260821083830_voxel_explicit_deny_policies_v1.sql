-- RLS without a policy already defaults to deny. Keep the intent explicit so
-- future grants cannot silently expose server-owned Voxel state.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'voxel_block_overrides'
      and policyname = 'voxel blocks server only'
  ) then
    create policy "voxel blocks server only"
      on public.voxel_block_overrides
      for all to anon, authenticated
      using (false)
      with check (false);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'voxel_player_states'
      and policyname = 'voxel players server only'
  ) then
    create policy "voxel players server only"
      on public.voxel_player_states
      for all to anon, authenticated
      using (false)
      with check (false);
  end if;
end
$$;
