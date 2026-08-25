-- WORLD FACTORY QUALITY CORE V8 durable non-destructive performance evidence.
-- Idempotent, additive only. Existing quality history remains authoritative and is never dropped.
create table if not exists quality_performance_evidence (
  id bigserial primary key,
  project_id text not null,
  world_id text,
  build_id text,
  device_profile text not null,
  avg_fps double precision,
  p95_frame_ms double precision,
  p99_frame_ms double precision,
  hitch_count integer not null default 0,
  source_fidelity double precision not null default 100,
  near_field_fidelity double precision not null default 100,
  visual_score double precision,
  schedule jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists quality_performance_evidence_device_idx
  on quality_performance_evidence(device_profile, created_at desc);

create table if not exists quality_device_schedules (
  device_profile text primary key,
  schedule jsonb not null,
  source_fidelity_floor double precision not null default 100,
  near_field_fidelity_floor double precision not null default 100,
  evidence_samples integer not null default 0,
  evidence_projects integer not null default 0,
  ratchet_approved boolean not null default false,
  updated_at timestamptz not null default now()
);
