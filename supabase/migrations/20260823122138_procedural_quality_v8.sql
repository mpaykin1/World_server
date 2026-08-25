alter table public.procedural_quality_learning add column if not exists skinned_velocity_pct double precision;
alter table public.procedural_quality_learning add column if not exists golden_verified boolean not null default false;
alter table public.procedural_quality_learning add column if not exists device_certified boolean not null default false;
alter table public.procedural_quality_learning alter column schema_version set default 8;
create index if not exists pql_v8_evidence on public.procedural_quality_learning(scene,device_class,device_certified,golden_verified,verified,regression_free,score desc,created_at desc);

create table if not exists public.procedural_quality_device_reports (
  id uuid primary key default gen_random_uuid(),
  schema_version integer not null default 8,
  device_class text not null,
  physical boolean not null default true,
  user_agent text,
  screen jsonb not null default '{}'::jsonb,
  hardware jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  app_path text,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.procedural_quality_device_reports enable row level security;
create index if not exists pqd_v8_class_time on public.procedural_quality_device_reports(device_class,physical,created_at desc);
create index if not exists pqd_v8_verified on public.procedural_quality_device_reports(verified,device_class,created_at desc);
