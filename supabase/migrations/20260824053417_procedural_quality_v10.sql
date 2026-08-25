create table if not exists public.procedural_quality_canary_runs(
 id uuid primary key default gen_random_uuid(),
 schema_version integer not null default 10,
 scene text not null,
 stage text not null default 'preview-canary',
 status text not null default 'candidate',
 metrics jsonb not null default '{}'::jsonb,
 evidence jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
alter table public.procedural_quality_canary_runs enable row level security;
create index if not exists pqc_v10_scene_stage on public.procedural_quality_canary_runs(scene,stage,status,created_at desc);

create table if not exists public.procedural_quality_runtime_health(
 id uuid primary key default gen_random_uuid(),
 schema_version integer not null default 10,
 app_path text not null,
 temporal_score double precision,
 p95_frame_ms double precision,
 jank_rate double precision,
 possible_leak boolean not null default false,
 thermal_tier double precision,
 shader_prewarm_failed integer not null default 0,
 metrics jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
alter table public.procedural_quality_runtime_health enable row level security;
create index if not exists pqrh_v10_app_time on public.procedural_quality_runtime_health(app_path,created_at desc);
