create table if not exists quality_incident_evidence (
  id bigserial primary key,
  fingerprint text not null,
  project_id text not null,
  world_id text not null,
  build_id text not null,
  session_id text not null,
  device jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists quality_incident_evidence_fp_created_idx on quality_incident_evidence(fingerprint,created_at desc);
create index if not exists quality_incident_evidence_project_created_idx on quality_incident_evidence(project_id,created_at desc);
