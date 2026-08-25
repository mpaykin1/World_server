create table if not exists public.implementation_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  feature_key text,
  title text not null,
  branch text,
  pr_url text,
  commit_sha text,
  status text not null default 'planned' check (status in ('planned','in_progress','review','merged','failed')),
  checks jsonb not null default '{}'::jsonb,
  notes text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists implementation_runs_project_idx on public.implementation_runs(project_id,created_at desc);
create index if not exists implementation_runs_feature_idx on public.implementation_runs(project_id,feature_key) where feature_key is not null;
create or replace trigger implementation_runs_set_updated_at before update on public.implementation_runs for each row execute function public.set_updated_at();
alter table public.implementation_runs enable row level security;
create policy "implementation_runs_read_visible" on public.implementation_runs for select to anon,authenticated using (private.is_project_public(project_id) or private.is_project_member(project_id));
create policy "implementation_runs_insert_admin" on public.implementation_runs for insert to authenticated with check (private.can_manage_project(project_id));
create policy "implementation_runs_update_admin" on public.implementation_runs for update to authenticated using (private.can_manage_project(project_id)) with check (private.can_manage_project(project_id));
create policy "implementation_runs_delete_admin" on public.implementation_runs for delete to authenticated using (private.can_manage_project(project_id));
grant select on public.implementation_runs to anon,authenticated;
grant insert,update,delete on public.implementation_runs to authenticated;
