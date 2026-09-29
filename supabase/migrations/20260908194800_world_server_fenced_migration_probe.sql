create table if not exists public.world_server_migration_evidence (
  migration_id text primary key,
  lease_key text not null,
  holder_id text not null,
  fencing_token bigint not null,
  applied_at timestamptz not null default now()
);
alter table public.world_server_migration_evidence enable row level security;
revoke all on table public.world_server_migration_evidence from public, anon, authenticated;
grant select, insert, update, delete on table public.world_server_migration_evidence to service_role;

create or replace function public.world_server_fenced_migration_probe(
  p_migration_id text, p_lease_key text, p_holder_id text, p_fencing_token bigint
) returns table(applied boolean, migration_id text, fencing_token bigint)
language plpgsql security invoker set search_path=public as $$
declare l public.world_server_orchestrator_lease%rowtype;
begin
  select * into l from public.world_server_orchestrator_lease as lease where lease.lease_key=p_lease_key;
  if l.lease_key is null or l.holder_id<>p_holder_id or l.fencing_token<>p_fencing_token or l.lease_until<=now() then
    return query select false,p_migration_id,p_fencing_token; return;
  end if;
  insert into public.world_server_migration_evidence(migration_id,lease_key,holder_id,fencing_token,applied_at)
  values(p_migration_id,p_lease_key,p_holder_id,p_fencing_token,now())
  on conflict on constraint world_server_migration_evidence_pkey do update
  set lease_key=excluded.lease_key,holder_id=excluded.holder_id,fencing_token=excluded.fencing_token,applied_at=excluded.applied_at;
  return query select true,p_migration_id,p_fencing_token;
end $$;
revoke execute on function public.world_server_fenced_migration_probe(text,text,text,bigint) from public, anon, authenticated;
grant execute on function public.world_server_fenced_migration_probe(text,text,text,bigint) to service_role;