-- Durable, public, PII-free canon event ledger for player-created worlds and
-- cross-world lore consequences. Writes stay service-role only; clients may
-- subscribe/read the resulting canon through Realtime.
create table if not exists public.world_canon_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  world_id text not null,
  event_type text not null,
  summary text not null,
  payload jsonb not null default '{}'::jsonb,
  cause_event_key text,
  source_world_id text,
  target_world_id text,
  created_at timestamptz not null default now(),
  constraint world_canon_event_key_shape check (event_key ~ '^[0-9a-f]{64}$'),
  constraint world_canon_world_id_shape check (world_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint world_canon_event_type_shape check (event_type ~ '^[a-z0-9]+([_-][a-z0-9]+)*$' and length(event_type) <= 64),
  constraint world_canon_summary_size check (length(summary) between 1 and 500),
  constraint world_canon_payload_size check (octet_length(payload::text) <= 8192)
);

create index if not exists world_canon_events_world_time_idx
  on public.world_canon_events(world_id, created_at desc);
create index if not exists world_canon_events_cause_idx
  on public.world_canon_events(cause_event_key) where cause_event_key is not null;

alter table public.world_canon_events enable row level security;
revoke all on table public.world_canon_events from anon, authenticated;
grant select on table public.world_canon_events to anon, authenticated;
grant all on table public.world_canon_events to service_role;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='world_canon_events' and policyname='world canon public read'
  ) then
    create policy "world canon public read" on public.world_canon_events
      for select to anon, authenticated using (true);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='world_canon_events'
  ) then
    alter publication supabase_realtime add table public.world_canon_events;
  end if;
end $$;

alter table public.world_canon_events replica identity full;
