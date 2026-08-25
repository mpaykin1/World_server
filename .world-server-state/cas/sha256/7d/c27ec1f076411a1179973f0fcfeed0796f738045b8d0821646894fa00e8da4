create table if not exists public.procedural_quality_learning (
  id uuid primary key,
  scene text not null,
  device text not null,
  score double precision not null default 0,
  settings jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists pql_scene_device_score on public.procedural_quality_learning(scene,device,score desc);
