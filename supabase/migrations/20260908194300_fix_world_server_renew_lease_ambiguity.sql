-- Fix PL/pgSQL output-column ambiguity in production lease renewal.
create or replace function public.world_server_renew_lease(
  p_lease_key text,
  p_holder_id text,
  p_fencing_token bigint,
  p_ttl_seconds integer default 30
) returns table(renewed boolean, fencing_token bigint, lease_until timestamptz)
language plpgsql security invoker set search_path=public as $$
declare r public.world_server_orchestrator_lease%rowtype;
begin
  update public.world_server_orchestrator_lease as l
  set lease_until=now()+make_interval(secs=>greatest(5,p_ttl_seconds)), updated_at=now()
  where l.lease_key=p_lease_key and l.holder_id=p_holder_id
    and l.fencing_token=p_fencing_token and l.lease_until>now()
  returning l.* into r;
  return query select (r.lease_key is not null), coalesce(r.fencing_token,p_fencing_token), r.lease_until;
end $$;
revoke execute on function public.world_server_renew_lease(text,text,bigint,integer) from public, anon, authenticated;
grant execute on function public.world_server_renew_lease(text,text,bigint,integer) to service_role;