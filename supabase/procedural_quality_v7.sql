alter table public.procedural_quality_learning add column if not exists native_coverage_pct double precision;
alter table public.procedural_quality_learning add column if not exists regression_free boolean not null default false;
alter table public.procedural_quality_learning add column if not exists promotion_state text not null default 'candidate';
alter table public.procedural_quality_learning add column if not exists style_profile jsonb not null default '{}'::jsonb;
alter table public.procedural_quality_learning add column if not exists baseline_id uuid;
alter table public.procedural_quality_learning alter column schema_version set default 7;
create index if not exists pql_v7_promoted on public.procedural_quality_learning(scene, device_class, promotion_state, verified, regression_free, score desc, created_at desc);
create table if not exists public.procedural_quality_baselines (
  id uuid primary key default gen_random_uuid(),
  scene text not null,
  device_class text not null default 'generic',
  render_backend text,
  style_fingerprint text,
  metrics jsonb not null default '{}'::jsonb,
  screenshot_sha256 text,
  source_url text,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.procedural_quality_baselines enable row level security;
create index if not exists pqb_scene_device_verified on public.procedural_quality_baselines(scene,device_class,verified,created_at desc);
create index if not exists pqb_style_backend on public.procedural_quality_baselines(style_fingerprint,render_backend,created_at desc);
