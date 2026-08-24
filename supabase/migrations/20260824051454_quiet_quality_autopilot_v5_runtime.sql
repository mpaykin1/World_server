alter table public.quality_telemetry
  add column if not exists sustained_fps double precision,
  add column if not exists fps_decay double precision,
  add column if not exists long_task_ratio double precision,
  add column if not exists browser_family text,
  add column if not exists device_class text,
  add column if not exists webgl_version integer,
  add column if not exists max_texture_size integer,
  add column if not exists max_renderbuffer_size integer,
  add column if not exists max_viewport_dimension integer,
  add column if not exists extensions_count integer,
  add column if not exists gpu_bench_first_ms double precision,
  add column if not exists gpu_bench_last_ms double precision,
  add column if not exists gpu_bench_decay double precision,
  add column if not exists thermal_pressure_proxy double precision,
  add column if not exists device_probe_sampled boolean,
  add column if not exists geo_country text,
  add column if not exists geo_region text,
  add column if not exists rollout_id text,
  add column if not exists rollout_stage double precision,
  add column if not exists rollout_bucket double precision,
  add column if not exists rollout_selected boolean,
  add column if not exists trace_id text,
  add column if not exists span_id text;
create index if not exists quality_telemetry_deployment_created_idx on public.quality_telemetry (deployment_url, created_at desc);
create index if not exists quality_telemetry_rollout_created_idx on public.quality_telemetry (rollout_id, rollout_stage, created_at desc);
create index if not exists quality_telemetry_geo_device_created_idx on public.quality_telemetry (geo_country, device_class, created_at desc);

create table if not exists public.quality_trace_spans (
  id bigint generated always as identity primary key,
  trace_id text not null check (trace_id ~ '^[0-9a-f]{32}$'),
  span_id text not null check (span_id ~ '^[0-9a-f]{16}$'),
  parent_span_id text,
  service_name text not null check (char_length(service_name) between 1 and 64),
  operation text not null check (char_length(operation) between 1 and 160),
  start_unix_nano text not null,
  end_unix_nano text not null,
  duration_ms double precision not null default 0,
  status text not null default 'OK' check (status in ('OK','ERROR')),
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists quality_trace_spans_trace_idx on public.quality_trace_spans (trace_id, created_at);
create index if not exists quality_trace_spans_service_idx on public.quality_trace_spans (service_name, created_at desc);
alter table public.quality_trace_spans enable row level security;
revoke all on table public.quality_trace_spans from anon, authenticated;
grant select, insert, update, delete on table public.quality_trace_spans to service_role;
grant usage, select on sequence public.quality_trace_spans_id_seq to service_role;

create table if not exists public.quality_rollout_state (
  project_key text primary key,
  rollout_id uuid not null,
  state text not null default 'inactive' check (state in ('inactive','active','ready_to_promote','complete','aborted')),
  stage_percent integer not null default 0 check (stage_percent in (0,1,10,50,100)),
  candidate_url text,
  candidate_sha text,
  base_sha text,
  pr_number integer,
  candidate_fingerprint text,
  stage_started_at timestamptz,
  started_at timestamptz not null default now(),
  expires_at timestamptz,
  failure_reason text,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.quality_rollout_state enable row level security;
revoke all on table public.quality_rollout_state from anon, authenticated;
grant select, insert, update, delete on table public.quality_rollout_state to service_role;

create table if not exists public.quality_rollout_stage_evidence (
  id bigint generated always as identity primary key,
  rollout_id uuid not null,
  stage_percent integer not null,
  decision text not null,
  candidate_sessions integer not null default 0,
  candidate_mobile_sessions integer not null default 0,
  countries integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists quality_rollout_stage_evidence_idx on public.quality_rollout_stage_evidence (rollout_id, stage_percent, created_at desc);
alter table public.quality_rollout_stage_evidence enable row level security;
revoke all on table public.quality_rollout_stage_evidence from anon, authenticated;
grant select, insert, update, delete on table public.quality_rollout_stage_evidence to service_role;
grant usage, select on sequence public.quality_rollout_stage_evidence_id_seq to service_role;
