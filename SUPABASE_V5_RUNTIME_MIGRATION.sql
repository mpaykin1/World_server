-- Quiet Quality Autopilot V5 runtime schema (includes the V4 base schema).
-- Idempotent and compatible with the pre-existing quality_autopilot_leases(project_id, owner, lease_expires_at, updated_at) table.

alter table public.quality_telemetry
  add column if not exists lcp_ms double precision,
  add column if not exists cls double precision,
  add column if not exists inp_ms double precision,
  add column if not exists ttfb_ms double precision,
  add column if not exists long_task_ms double precision,
  add column if not exists memory_mb double precision,
  add column if not exists downlink_mbps double precision,
  add column if not exists effective_type text,
  add column if not exists device_memory_gb double precision,
  add column if not exists hardware_concurrency integer,
  add column if not exists platform text,
  add column if not exists edge_region text,
  add column if not exists session_id text,
  add column if not exists release_sha text,
  add column if not exists deployment_url text;

create index if not exists quality_telemetry_created_at_idx on public.quality_telemetry (created_at desc);
create index if not exists quality_telemetry_device_created_at_idx on public.quality_telemetry (coarse, created_at desc);
create index if not exists quality_telemetry_release_created_idx on public.quality_telemetry (release_sha, created_at desc);
alter table public.quality_telemetry enable row level security;
revoke all on table public.quality_telemetry from anon, authenticated;
grant select, insert, update, delete on table public.quality_telemetry to service_role;

create table if not exists public.quality_autopilot_leases (
  project_id text primary key check (char_length(project_id) between 1 and 120),
  owner text not null check (char_length(owner) between 3 and 200),
  lease_expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.quality_autopilot_leases
  add column if not exists lease_token uuid,
  add column if not exists heartbeat_at timestamptz not null default now(),
  add column if not exists payload jsonb not null default '{}'::jsonb;
create index if not exists quality_autopilot_leases_expiry_idx on public.quality_autopilot_leases (lease_expires_at);
alter table public.quality_autopilot_leases enable row level security;
revoke all on table public.quality_autopilot_leases from anon, authenticated;
grant select, insert, update, delete on table public.quality_autopilot_leases to service_role;

create table if not exists public.quality_autopilot_patch_outcomes (
  id bigint generated always as identity primary key,
  patch_fingerprint text not null,
  source_sha text,
  classification text not null,
  accepted boolean not null default false,
  perf_win_pct double precision,
  error_delta_pct double precision,
  changed_files integer,
  changed_lines integer,
  recipe_ids text[] not null default '{}',
  candidate_url text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists quality_autopilot_patch_outcomes_created_idx on public.quality_autopilot_patch_outcomes (created_at desc);
create index if not exists quality_autopilot_patch_outcomes_fingerprint_idx on public.quality_autopilot_patch_outcomes (patch_fingerprint, created_at desc);
alter table public.quality_autopilot_patch_outcomes enable row level security;
revoke all on table public.quality_autopilot_patch_outcomes from anon, authenticated;
grant select, insert, update, delete on table public.quality_autopilot_patch_outcomes to service_role;
grant usage, select on sequence public.quality_autopilot_patch_outcomes_id_seq to service_role;

create table if not exists public.quality_autopilot_queue (
  id bigint generated always as identity primary key,
  task_key text not null unique,
  kind text not null default 'quality',
  priority integer not null default 100,
  state text not null default 'queued' check (state in ('queued','leased','done','failed','cancelled')),
  available_at timestamptz not null default now(),
  lease_owner text,
  lease_token uuid,
  lease_until timestamptz,
  attempts integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists quality_autopilot_queue_claim_idx on public.quality_autopilot_queue (state, available_at, priority, id);
alter table public.quality_autopilot_queue enable row level security;
revoke all on table public.quality_autopilot_queue from anon, authenticated;
grant select, insert, update, delete on table public.quality_autopilot_queue to service_role;
grant usage, select on sequence public.quality_autopilot_queue_id_seq to service_role;

create or replace function public.quality_autopilot_claim_lease(
  p_key text,
  p_owner text,
  p_token uuid,
  p_ttl_seconds integer default 3600,
  p_payload jsonb default '{}'::jsonb
) returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare v_claimed boolean := false;
begin
  insert into public.quality_autopilot_leases(project_id, owner, lease_expires_at, updated_at, lease_token, heartbeat_at, payload)
  values(p_key, p_owner, now() + make_interval(secs => greatest(60, least(p_ttl_seconds, 21600))), now(), p_token, now(), coalesce(p_payload,'{}'::jsonb))
  on conflict (project_id) do update
  set owner = excluded.owner,
      lease_expires_at = excluded.lease_expires_at,
      updated_at = now(),
      lease_token = excluded.lease_token,
      heartbeat_at = now(),
      payload = excluded.payload
  where public.quality_autopilot_leases.lease_expires_at < now()
     or (public.quality_autopilot_leases.owner = p_owner and public.quality_autopilot_leases.lease_token = p_token)
  returning true into v_claimed;
  return coalesce(v_claimed, false);
end;
$$;
revoke all on function public.quality_autopilot_claim_lease(text,text,uuid,integer,jsonb) from public, anon, authenticated;
grant execute on function public.quality_autopilot_claim_lease(text,text,uuid,integer,jsonb) to service_role;

create or replace function public.quality_autopilot_release_lease(
  p_key text,
  p_owner text,
  p_token uuid
) returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare v_released boolean := false;
begin
  delete from public.quality_autopilot_leases
   where project_id = p_key and owner = p_owner and lease_token = p_token
   returning true into v_released;
  return coalesce(v_released, false);
end;
$$;
revoke all on function public.quality_autopilot_release_lease(text,text,uuid) from public, anon, authenticated;
grant execute on function public.quality_autopilot_release_lease(text,text,uuid) to service_role;

create or replace function public.quality_autopilot_claim_task(
  p_owner text,
  p_token uuid,
  p_ttl_seconds integer default 1800,
  p_kind text default null
) returns setof public.quality_autopilot_queue
language plpgsql
security invoker
set search_path = public
as $$
declare v_id bigint;
begin
  select q.id into v_id
  from public.quality_autopilot_queue q
  where ((q.state = 'queued' and q.available_at <= now()) or (q.state = 'leased' and q.lease_until < now()))
    and (p_kind is null or q.kind = p_kind)
  order by q.priority asc, q.id asc
  for update skip locked
  limit 1;
  if v_id is null then return; end if;
  return query
  update public.quality_autopilot_queue q
     set state='leased', lease_owner=p_owner, lease_token=p_token,
         lease_until=now()+make_interval(secs => greatest(60, least(p_ttl_seconds, 21600))),
         attempts=q.attempts+1, updated_at=now()
   where q.id=v_id
   returning q.*;
end;
$$;
revoke all on function public.quality_autopilot_claim_task(text,uuid,integer,text) from public, anon, authenticated;
grant execute on function public.quality_autopilot_claim_task(text,uuid,integer,text) to service_role;

-- V5: real-device geographic/GPU evidence, RUM-driven free rollout, and W3C/OpenTelemetry bridge.
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
