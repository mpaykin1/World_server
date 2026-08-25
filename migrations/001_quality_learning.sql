create table if not exists quality_runtime_events (
  id bigserial primary key,
  project_id text not null,
  world_id text not null,
  build_id text not null,
  session_id text not null,
  reason text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists quality_runtime_events_world_created_idx on quality_runtime_events(world_id,created_at desc);

create table if not exists quality_runtime_incidents (
  fingerprint text primary key,
  project_id text not null,
  world_id text not null,
  error_id text not null,
  detail text not null,
  occurrences bigint not null default 1,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  protection_status text not null default 'needs-protection'
);
create index if not exists quality_runtime_incidents_status_seen_idx on quality_runtime_incidents(protection_status,last_seen desc);
