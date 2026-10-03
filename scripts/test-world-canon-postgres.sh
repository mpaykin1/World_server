#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
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

insert_a="insert into public.world_canon_events (event_key,world_id,event_type,summary,payload,actor_ref,source_platform,visibility_scope,source_world_id,target_world_id) values ('race-event','main','dragon_arrival','actor-a','{\"region\":\"north\"}','actor-111111111111111111111111','browser','public','main','main') on conflict (event_key) do nothing; select pg_sleep(0.35);"
insert_b="insert into public.world_canon_events (event_key,world_id,event_type,summary,payload,actor_ref,source_platform,visibility_scope,source_world_id,target_world_id) values ('race-event','main','dragon_arrival','actor-b','{\"region\":\"south\"}','actor-222222222222222222222222','telegram','public','main','main') on conflict (event_key) do nothing; select pg_sleep(0.35);"

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
SQL

echo "world canon PostgreSQL race/reconnect/immutability: PASS"
