create table if not exists public.quality_cpu_runtime_profiles_v11 (
  id bigserial primary key,
  project_id text not null,
  worker_id text not null,
  logical_cores integer not null check (logical_cores > 0),
  effective_parallelism integer not null check (effective_parallelism > 0),
  memory_bytes bigint not null check (memory_bytes > 0),
  benchmark_score numeric not null default 0,
  wasm_simd boolean not null default false,
  verified boolean not null default false,
  details jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now()
);
create index if not exists quality_cpu_profiles_project_checked_v11 on public.quality_cpu_runtime_profiles_v11(project_id, checked_at desc);
alter table public.quality_cpu_runtime_profiles_v11 enable row level security;
revoke all on public.quality_cpu_runtime_profiles_v11 from public, anon, authenticated;
grant select,insert,update,delete on public.quality_cpu_runtime_profiles_v11 to service_role;
grant usage,select on sequence public.quality_cpu_runtime_profiles_v11_id_seq to service_role;
drop policy if exists quality_cpu_runtime_profiles_v11_service on public.quality_cpu_runtime_profiles_v11;
create policy quality_cpu_runtime_profiles_v11_service on public.quality_cpu_runtime_profiles_v11 for all to service_role using (true) with check (true);
create table if not exists public.quality_cpu_cache_events_v11 (
  id bigserial primary key,
  project_id text not null,
  cache_key text not null,
  kind text not null,
  hit boolean not null,
  bytes bigint not null default 0,
  duration_ms numeric not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists quality_cpu_cache_project_created_v11 on public.quality_cpu_cache_events_v11(project_id, created_at desc);
create index if not exists quality_cpu_cache_key_v11 on public.quality_cpu_cache_events_v11(cache_key);
alter table public.quality_cpu_cache_events_v11 enable row level security;
revoke all on public.quality_cpu_cache_events_v11 from public, anon, authenticated;
grant select,insert,update,delete on public.quality_cpu_cache_events_v11 to service_role;
grant usage,select on sequence public.quality_cpu_cache_events_v11_id_seq to service_role;
drop policy if exists quality_cpu_cache_events_v11_service on public.quality_cpu_cache_events_v11;
create policy quality_cpu_cache_events_v11_service on public.quality_cpu_cache_events_v11 for all to service_role using (true) with check (true);
