#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;

create table public.world_canon_events (
  event_key text primary key,
  world_id text not null,
  event_type text not null,
  summary text not null,
  payload jsonb not null default '{}'::jsonb,
  cause_event_key text,
  source_world_id text not null,
  target_world_id text not null,
  created_at timestamptz not null default now()
);
SQL

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20261002230000_world_canon_social_lineage.sql

verify_immediate="do \$\$ declare row_count integer; winner record; begin select count(*) into row_count from public.world_canon_events where event_key = 'race-event'; if row_count <> 1 then raise exception 'writer immediate reread saw % rows', row_count; end if; select * into winner from public.world_canon_events where event_key = 'race-event'; if not ((winner.summary = 'actor-a' and winner.actor_ref = 'actor-111111111111111111111111' and winner.payload = '{\"region\":\"north\"}'::jsonb) or (winner.summary = 'actor-b' and winner.actor_ref = 'actor-222222222222222222222222' and winner.payload = '{\"region\":\"south\"}'::jsonb)) then raise exception 'writer immediate reread saw mixed row: %', row_to_json(winner); end if; end \$\$;"
insert_a="insert into public.world_canon_events (event_key,world_id,event_type,summary,payload,actor_ref,source_platform,visibility_scope,source_world_id,target_world_id) values ('race-event','main','dragon_arrival','actor-a','{\"region\":\"north\"}','actor-111111111111111111111111','browser','public','main','main') on conflict (event_key) do nothing; ${verify_immediate} select pg_sleep(0.35);"
insert_b="insert into public.world_canon_events (event_key,world_id,event_type,summary,payload,actor_ref,source_platform,visibility_scope,source_world_id,target_world_id) values ('race-event','main','dragon_arrival','actor-b','{\"region\":\"south\"}','actor-222222222222222222222222','telegram','public','main','main') on conflict (event_key) do nothing; ${verify_immediate} select pg_sleep(0.35);"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "$insert_a" >/dev/null &
pid_a=$!
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "$insert_b" >/dev/null &
pid_b=$!
wait "$pid_a"
wait "$pid_b"

# A third independent connection is the reconnect/reread. It must see one
# complete first-writer row, never a mixture of both candidates.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
do $$
declare
  row_count integer;
  winner record;
begin
  select count(*) into row_count from public.world_canon_events where event_key = 'race-event';
  if row_count <> 1 then raise exception 'expected one race winner, got %', row_count; end if;
  select * into winner from public.world_canon_events where event_key = 'race-event';
  if not ((winner.summary = 'actor-a' and winner.actor_ref = 'actor-111111111111111111111111' and winner.payload = '{"region":"north"}'::jsonb)
       or (winner.summary = 'actor-b' and winner.actor_ref = 'actor-222222222222222222222222' and winner.payload = '{"region":"south"}'::jsonb)) then
    raise exception 'race produced a mixed or unknown row: %', row_to_json(winner);
  end if;
end $$;

insert into public.world_canon_events (event_key,world_id,event_type,summary,payload,actor_ref,source_platform,visibility_scope,source_world_id,target_world_id)
values ('race-event','main','dragon_arrival','overwrite','{"damage":999}','actor-333333333333333333333333','browser','public','main','main')
on conflict (event_key) do nothing;

do $$
declare winner record;
begin
  select * into winner from public.world_canon_events where event_key = 'race-event';
  if winner.summary = 'overwrite' or winner.payload ? 'damage' then raise exception 'changed retry overwrote canon'; end if;
  begin
    update public.world_canon_events set summary = 'mutated' where event_key = 'race-event';
    raise exception 'direct update unexpectedly succeeded';
  exception when sqlstate '55000' then null;
  end;
  begin
    delete from public.world_canon_events where event_key = 'race-event';
    raise exception 'direct delete unexpectedly succeeded';
  exception when sqlstate '55000' then null;
  end;
end $$;

-- The append-only contract keeps ordinary rows immutable and exposes no purge
-- to public roles. Only a namespaced Fleet source and its causal children can
-- be removed by the service-role-only RPC.
do $$
begin
  if has_function_privilege('anon', 'public.purge_fleet_durable_canon(text)', 'execute')
     or has_function_privilege('authenticated', 'public.purge_fleet_durable_canon(text)', 'execute') then
    raise exception 'public role can execute Fleet purge';
  end if;
  if not has_function_privilege('service_role', 'public.purge_fleet_durable_canon(text)', 'execute') then
    raise exception 'service_role cannot execute Fleet purge';
  end if;
end $$;

insert into public.world_canon_events
  (event_key,world_id,event_type,summary,payload,cause_event_key,parent_event_key,actor_ref,source_platform,visibility_scope,source_world_id,target_world_id)
values
  (repeat('a',64),'main','player_world_change','fleet source','{"testNamespace":"fleet-durable-canon"}',null,null,'actor-111111111111111111111111','browser','public','main','main'),
  (repeat('b',64),'connected','cross_world_consequence','fleet child','{}',repeat('a',64),repeat('a',64),'actor-111111111111111111111111','browser','public','main','connected');

do $$
begin
  begin
    perform public.purge_fleet_durable_canon(repeat('c',64));
    raise exception 'non-namespaced purge unexpectedly succeeded';
  exception when sqlstate '42501' then null;
  end;
end $$;

set role service_role;
select public.purge_fleet_durable_canon(repeat('a',64));
reset role;

do $$
begin
  if exists (select 1 from public.world_canon_events where event_key in (repeat('a',64), repeat('b',64))) then
    raise exception 'Fleet purge left namespaced canon rows';
  end if;
  if not exists (select 1 from public.world_canon_events where event_key = 'race-event') then
    raise exception 'Fleet purge removed unrelated canon';
  end if;
end $$;
SQL

echo "world canon PostgreSQL race/reconnect/immutability: PASS"
