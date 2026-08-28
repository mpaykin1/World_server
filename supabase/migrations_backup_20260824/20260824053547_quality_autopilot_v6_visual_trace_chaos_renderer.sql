alter table public.quality_telemetry
  add column if not exists visual_sampled boolean,
  add column if not exists visual_mode text,
  add column if not exists visual_nonblank_ratio double precision,
  add column if not exists visual_luma_stddev double precision,
  add column if not exists visual_edge_density double precision,
  add column if not exists visual_signature text,
  add column if not exists visual_canvas_count integer,
  add column if not exists visual_tainted boolean,
  add column if not exists renderer_backend text,
  add column if not exists renderer_tuning_tier text,
  add column if not exists renderer_tuning_reason text,
  add column if not exists webgpu_available boolean,
  add column if not exists frame_pacing_ms double precision;
create index if not exists quality_telemetry_visual_created_idx on public.quality_telemetry (visual_sampled, created_at desc);
create index if not exists quality_telemetry_renderer_created_idx on public.quality_telemetry (renderer_tuning_tier, renderer_backend, created_at desc);
create table if not exists public.quality_trace_optimization_actions (
  id bigint generated always as identity primary key,
  trace_fingerprint text not null unique,
  service_name text not null,
  operation text not null,
  p95_duration_ms double precision,
  contribution_pct double precision,
  sample_count integer not null default 0,
  error_rate_pct double precision,
  status text not null default 'open' check (status in ('open','queued','fixed','dismissed')),
  recommendation jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists quality_trace_optimization_actions_rank_idx on public.quality_trace_optimization_actions (status, contribution_pct desc, p95_duration_ms desc);
alter table public.quality_trace_optimization_actions enable row level security;
revoke all on table public.quality_trace_optimization_actions from anon, authenticated;
grant select, insert, update, delete on table public.quality_trace_optimization_actions to service_role;
grant usage, select on sequence public.quality_trace_optimization_actions_id_seq to service_role;
create table if not exists public.quality_chaos_results (
  id bigint generated always as identity primary key,
  scenario text not null,
  target text not null,
  pass boolean not null,
  latency_ms double precision,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists quality_chaos_results_created_idx on public.quality_chaos_results (created_at desc);
alter table public.quality_chaos_results enable row level security;
revoke all on table public.quality_chaos_results from anon, authenticated;
grant select, insert, update, delete on table public.quality_chaos_results to service_role;
grant usage, select on sequence public.quality_chaos_results_id_seq to service_role;
alter table public.quality_visual_oracle_results enable row level security;
revoke all on table public.quality_visual_oracle_results from anon, authenticated;
grant select, insert, update, delete on table public.quality_visual_oracle_results to service_role;
