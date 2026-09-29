-- Remote CAS schema. Bearer hashes are provisioned out-of-band; no secret material belongs in Git.
create table if not exists public.world_server_cas_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.world_server_cas_config enable row level security;
revoke all on table public.world_server_cas_config from public, anon, authenticated;
grant select, insert, update, delete on table public.world_server_cas_config to service_role;

create table if not exists public.world_server_cas_objects (
  digest text primary key check (digest ~ '^[0-9a-f]{64}$'),
  payload_base64 text not null,
  size_bytes integer not null check (size_bytes >= 0 and size_bytes <= 1048576),
  created_at timestamptz not null default now()
);
alter table public.world_server_cas_objects enable row level security;
revoke all on table public.world_server_cas_objects from public, anon, authenticated;
grant select, insert, update, delete on table public.world_server_cas_objects to service_role;