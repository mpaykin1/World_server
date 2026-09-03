create table if not exists public.world_feedback_resolution_v6 (
 id uuid primary key default gen_random_uuid(), feedback_id uuid null references public.world_feedback(id) on delete set null,
 cluster_key text null, gdd_spec_id uuid null, function_id text null, commit_sha text null,
 regression_evidence text null, sandbox_revision text null, production_revision text null,
 status text not null default 'investigating' check(status in ('investigating','planned','sandbox','canary','released','verified','reopened')),
 outcome_before jsonb not null default '{}'::jsonb, outcome_after jsonb not null default '{}'::jsonb,
 verified_better boolean null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.world_feedback_resolution_v6 enable row level security;
revoke all on public.world_feedback_resolution_v6 from anon, authenticated;
-- Server/admin pipeline writes the ledger. Users continue to see their feedback through the normal feedback API, not internal release metadata.
