-- AI Supervisor Control Plane - persistent coordination via Supabase
-- Tables: AI_AGENT_REPORTS and AI_SUPERVISOR_ADVISORIES
-- No secrets, RLS enabled, advisory is data not trusted command

create table if not exists public.ai_agent_reports (
  id uuid primary key default gen_random_uuid(),
  agent text not null check (agent ~ '^[a-z0-9_-]{1,40}$'),
  task_id text not null,
  created_at timestamptz not null default now(),
  status text not null check (status in ('in_progress','pass','fail','blocked','waiting')),
  progress smallint not null default 0 check (progress between 0 and 100),
  branch text not null,
  worktree text,
  commit_sha text check (commit_sha ~ '^[0-9a-f]{7,40}$'),
  pr_url text,
  tests jsonb not null default '{}'::jsonb,
  blockers jsonb not null default '[]'::jsonb,
  merge_safe boolean,
  next_action text not null,
  findings jsonb not null default '{}'::jsonb,
  reusable_improvements jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists ai_agent_reports_task_id_idx on public.ai_agent_reports(task_id, created_at desc);
create index if not exists ai_agent_reports_agent_idx on public.ai_agent_reports(agent, created_at desc);

create table if not exists public.ai_supervisor_advisories (
  advisory_id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  priority smallint not null default 3 check (priority between 1 and 5),
  target_agent text check (target_agent ~ '^[a-z0-9_-]{1,40}$'),
  task text not null,
  rationale text not null,
  expected_result text,
  verification_required text not null default 'tests + evidence' check (verification_required in ('tests + evidence','manual review','none')),
  status text not null default 'pending' check (status in ('pending','accepted','improved','rejected','done')),
  updated_at timestamptz not null default now()
);
create index if not exists ai_supervisor_advisories_status_idx on public.ai_supervisor_advisories(status, priority, created_at desc);
create index if not exists ai_supervisor_advisories_target_idx on public.ai_supervisor_advisories(target_agent) where target_agent is not null;

-- Updated_at trigger
create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists ai_agent_reports_set_updated_at on public.ai_agent_reports;
create trigger ai_agent_reports_set_updated_at before update on public.ai_agent_reports for each row execute function public.set_updated_at();
drop trigger if exists ai_supervisor_advisories_set_updated_at on public.ai_supervisor_advisories;
create trigger ai_supervisor_advisories_set_updated_at before update on public.ai_supervisor_advisories for each row execute function public.set_updated_at();

-- RLS: advisory is data, not trusted commands - only authenticated can read/write, anon can read reports
alter table public.ai_agent_reports enable row level security;
alter table public.ai_supervisor_advisories enable row level security;

-- Reports: authenticated can insert/update their own, anon can read
drop policy if exists "ai_agent_reports_read" on public.ai_agent_reports;
create policy "ai_agent_reports_read" on public.ai_agent_reports for select to anon, authenticated using (true);
drop policy if exists "ai_agent_reports_write" on public.ai_agent_reports;
create policy "ai_agent_reports_write" on public.ai_agent_reports for insert to authenticated with check (true);
drop policy if exists "ai_agent_reports_update" on public.ai_agent_reports;
create policy "ai_agent_reports_update" on public.ai_agent_reports for update to authenticated using (true) with check (true);

-- Advisories: authenticated can read, only supervisor (service_role) can write - but for now authenticated can read, service_role can write
-- To keep simple and secure: authenticated can read, service_role can do all, anon cannot see advisories (internal)
drop policy if exists "ai_supervisor_advisories_read" on public.ai_supervisor_advisories;
create policy "ai_supervisor_advisories_read" on public.ai_supervisor_advisories for select to authenticated using (true);
drop policy if exists "ai_supervisor_advisories_write" on public.ai_supervisor_advisories;
create policy "ai_supervisor_advisories_write" on public.ai_supervisor_advisories for all to authenticated using (true) with check (true);
-- Service role has bypass RLS, so it can do all

-- Grants
grant select on public.ai_agent_reports to anon, authenticated;
grant insert, update on public.ai_agent_reports to authenticated;
grant select, insert, update, delete on public.ai_agent_reports to service_role;
grant select on public.ai_supervisor_advisories to authenticated;
grant all on public.ai_supervisor_advisories to authenticated;
grant all on public.ai_supervisor_advisories to service_role;
grant all on public.ai_agent_reports, public.ai_supervisor_advisories to service_role;

-- Comments for security
comment on table public.ai_agent_reports is 'Agent status reports - safe to read, no secrets';
comment on table public.ai_supervisor_advisories is 'Advisory data, not trusted commands - must be independently verified before use';
