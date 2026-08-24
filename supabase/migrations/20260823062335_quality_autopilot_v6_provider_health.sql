begin;
create table if not exists private.quality_provider_health (
  provider text primary key,
  verified boolean not null default false,
  mode text not null default 'unknown',
  detail jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now()
);
revoke all on table private.quality_provider_health from public, anon, authenticated;

drop function if exists public.quality_record_provider_health(text,boolean,text,jsonb);
create function public.quality_record_provider_health(p_provider text,p_verified boolean,p_mode text,p_detail jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path=private,public as $$
begin
  insert into private.quality_provider_health(provider,verified,mode,detail,checked_at)
  values(left(p_provider,80),coalesce(p_verified,false),left(coalesce(p_mode,'unknown'),80),coalesce(p_detail,'{}'::jsonb),now())
  on conflict(provider) do update set verified=excluded.verified,mode=excluded.mode,detail=excluded.detail,checked_at=excluded.checked_at;
end $$;
revoke all on function public.quality_record_provider_health(text,boolean,text,jsonb) from public,anon,authenticated;
grant execute on function public.quality_record_provider_health(text,boolean,text,jsonb) to service_role;

drop function if exists public.quality_get_provider_health();
create function public.quality_get_provider_health()
returns table(provider text,verified boolean,mode text,detail jsonb,checked_at timestamptz)
language sql security definer set search_path=private,public as $$
  select h.provider,h.verified,h.mode,h.detail,h.checked_at from private.quality_provider_health h order by h.provider;
$$;
revoke all on function public.quality_get_provider_health() from public,anon,authenticated;
grant execute on function public.quality_get_provider_health() to service_role;
commit;
