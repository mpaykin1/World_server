-- World Server V7.3: atomic leader lease + fencing tokens.
create table if not exists public.world_server_orchestrator_lease (
  lease_key text primary key,
  holder_id text not null,
  fencing_token bigint not null default 0,
  generation bigint not null default 0,
  lease_until timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.world_server_orchestrator_lease enable row level security;
revoke all on table public.world_server_orchestrator_lease from public, anon, authenticated;
grant select, insert, update, delete on table public.world_server_orchestrator_lease to service_role;

create or replace function public.world_server_acquire_lease(p_lease_key text,p_holder_id text,p_ttl_seconds int default 30)
returns table(acquired boolean, holder_id text, fencing_token bigint, generation bigint, lease_until timestamptz)
language plpgsql security invoker set search_path=public as $$
declare r public.world_server_orchestrator_lease%rowtype;
begin
  insert into public.world_server_orchestrator_lease(lease_key,holder_id,fencing_token,generation,lease_until)
  values(p_lease_key,p_holder_id,1,1,now()+make_interval(secs=>greatest(5,p_ttl_seconds)))
  on conflict (lease_key) do update set
    holder_id = case when world_server_orchestrator_lease.lease_until <= now() or world_server_orchestrator_lease.holder_id=p_holder_id then excluded.holder_id else world_server_orchestrator_lease.holder_id end,
    fencing_token = case when world_server_orchestrator_lease.lease_until <= now() and world_server_orchestrator_lease.holder_id<>p_holder_id then world_server_orchestrator_lease.fencing_token+1 else world_server_orchestrator_lease.fencing_token end,
    generation = case when world_server_orchestrator_lease.lease_until <= now() and world_server_orchestrator_lease.holder_id<>p_holder_id then world_server_orchestrator_lease.generation+1 else world_server_orchestrator_lease.generation end,
    lease_until = case when world_server_orchestrator_lease.lease_until <= now() or world_server_orchestrator_lease.holder_id=p_holder_id then excluded.lease_until else world_server_orchestrator_lease.lease_until end,
    updated_at = now()
  returning * into r;
  return query select (r.holder_id=p_holder_id and r.lease_until>now()),r.holder_id,r.fencing_token,r.generation,r.lease_until;
end $$;

create or replace function public.world_server_renew_lease(p_lease_key text,p_holder_id text,p_fencing_token bigint,p_ttl_seconds int default 30)
returns table(renewed boolean, fencing_token bigint, lease_until timestamptz)
language plpgsql security invoker set search_path=public as $$
declare r public.world_server_orchestrator_lease%rowtype;
begin
  update public.world_server_orchestrator_lease set lease_until=now()+make_interval(secs=>greatest(5,p_ttl_seconds)),updated_at=now()
  where lease_key=p_lease_key and holder_id=p_holder_id and fencing_token=p_fencing_token and lease_until>now()
  returning * into r;
  return query select (r.lease_key is not null),coalesce(r.fencing_token,p_fencing_token),r.lease_until;
end $$;

create or replace function public.world_server_release_lease(p_lease_key text,p_holder_id text,p_fencing_token bigint)
returns boolean language sql security invoker set search_path=public as $$
  update public.world_server_orchestrator_lease set lease_until=now(),updated_at=now()
  where lease_key=p_lease_key and holder_id=p_holder_id and fencing_token=p_fencing_token returning true;
$$;

revoke execute on function public.world_server_acquire_lease(text,text,int) from public, anon, authenticated;
revoke execute on function public.world_server_renew_lease(text,text,bigint,int) from public, anon, authenticated;
revoke execute on function public.world_server_release_lease(text,text,bigint) from public, anon, authenticated;
grant execute on function public.world_server_acquire_lease(text,text,int) to service_role;
grant execute on function public.world_server_renew_lease(text,text,bigint,int) to service_role;
grant execute on function public.world_server_release_lease(text,text,bigint) to service_role;
