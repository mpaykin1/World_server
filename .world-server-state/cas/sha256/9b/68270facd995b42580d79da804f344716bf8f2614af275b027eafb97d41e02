
create table if not exists public.vehicle_feedback (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  source text not null default 'roblox_worlds_vehicles',
  version text not null,
  place_id bigint,
  job_id text,
  user_id bigint,
  display_name text,
  feedback_text text not null,
  runtime_context jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb
);
create table if not exists public.vehicle_feature_proposals (
  id text primary key,
  received_at timestamptz not null default now(),
  author_user_id bigint not null,
  author_name text,
  name text not null,
  body text not null,
  why text,
  category text not null default 'OTHER',
  status text not null default 'NEW',
  votes integer not null default 1 check (votes >= 1),
  source_version text,
  raw_payload jsonb not null default '{}'::jsonb
);
create table if not exists public.vehicle_feature_votes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id bigint not null,
  target_type text not null check (target_type in ('mechanic','proposal','poll')),
  target_id text not null,
  value smallint not null default 1 check (value = 1),
  source_version text,
  unique(user_id,target_type,target_id)
);
create table if not exists public.vehicle_polls (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  closes_at timestamptz,
  title text not null,
  body text,
  options jsonb not null default '[]'::jsonb,
  status text not null default 'DRAFT'
);
create table if not exists public.vehicle_experiment_results (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  experiment_id text not null,
  version text,
  place_id bigint,
  job_id text,
  metrics jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb
);
create table if not exists public.vehicle_bug_reports (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  user_id bigint,
  display_name text,
  version text,
  place_id bigint,
  job_id text,
  summary text not null,
  severity text not null default 'UNKNOWN',
  runtime_context jsonb not null default '{}'::jsonb,
  status text not null default 'NEW'
);
create table if not exists public.vehicle_build_health (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  version text not null,
  place_id bigint,
  job_id text,
  total_readiness integer check (total_readiness between 0 and 100),
  categories jsonb not null default '{}'::jsonb,
  failures jsonb not null default '[]'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb
);
create index if not exists vehicle_feedback_received_at_idx on public.vehicle_feedback(received_at desc);
create index if not exists vehicle_proposals_votes_idx on public.vehicle_feature_proposals(votes desc, received_at desc);
create index if not exists vehicle_votes_target_idx on public.vehicle_feature_votes(target_type,target_id);
create index if not exists vehicle_bug_reports_status_idx on public.vehicle_bug_reports(status,received_at desc);
create index if not exists vehicle_build_health_received_at_idx on public.vehicle_build_health(received_at desc);
alter table public.vehicle_feedback enable row level security;
alter table public.vehicle_feature_proposals enable row level security;
alter table public.vehicle_feature_votes enable row level security;
alter table public.vehicle_polls enable row level security;
alter table public.vehicle_experiment_results enable row level security;
alter table public.vehicle_bug_reports enable row level security;
alter table public.vehicle_build_health enable row level security;
revoke all on public.vehicle_feedback,public.vehicle_feature_proposals,public.vehicle_feature_votes,public.vehicle_polls,public.vehicle_experiment_results,public.vehicle_bug_reports,public.vehicle_build_health from anon,authenticated;
grant all on public.vehicle_feedback,public.vehicle_feature_proposals,public.vehicle_feature_votes,public.vehicle_polls,public.vehicle_experiment_results,public.vehicle_bug_reports,public.vehicle_build_health to service_role;
