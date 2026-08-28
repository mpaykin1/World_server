do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='pixel_animation_device_baselines'
      and policyname='pixel_animation_device_baselines_deny_clients'
  ) then
    create policy pixel_animation_device_baselines_deny_clients
      on public.pixel_animation_device_baselines
      for all to anon, authenticated
      using (false)
      with check (false);
  end if;
end $$;
