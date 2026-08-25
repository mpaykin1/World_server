-- WORLD FACTORY QUALITY CORE V7 durable quality-learning schema.
-- Idempotent additions only. Existing V6 tables remain authoritative and are not dropped.
create table if not exists quality_project_state (
  project_id text primary key,
  runtime_hash text,
  protection_pack_hash text,
  quality_genome_hash text,
  last_known_good_build text,
  release_blocked boolean not null default false,
  block_reason text,
  updated_at timestamptz not null default now()
);
create table if not exists quality_pattern_evidence (
  id bigserial primary key,
  trait text not null,
  project_id text not null,
  world_id text,
  build_id text,
  passed boolean not null,
  metric_before double precision,
  metric_after double precision,
  visual_regression double precision,
  source_regression boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists quality_pattern_evidence_trait_project_idx on quality_pattern_evidence(trait,project_id,created_at desc);
create table if not exists quality_rollout_events (
  id bigserial primary key,
  rollout_id text not null,
  project_id text not null,
  stage text not null,
  status text not null,
  runtime_hash text,
  protection_pack_hash text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists quality_rollout_events_rollout_idx on quality_rollout_events(rollout_id,created_at desc);
create table if not exists quality_quality_ratchet (
  metric text primary key,
  floor_value double precision not null,
  evidence_projects integer not null default 0,
  updated_at timestamptz not null default now()
);
