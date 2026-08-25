create schema if not exists private;

create table if not exists private.factory_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  feature_key text unique,
  requested_by uuid,
  source text not null default 'godot-voxel-factory',
  job_type text not null,
  prompt text not null,
  target jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint factory_requests_job_type_check check (job_type in ('WORLD_REGION','CHARACTER_CREATE','ASSET_CREATE','MECHANIC_CREATE','CODEX_AUDIT'))
);

create index if not exists factory_requests_project_created_idx
  on private.factory_requests(project_id, created_at desc);

revoke all on table private.factory_requests from anon, authenticated;
grant select, insert, update, delete on table private.factory_requests to service_role;

comment on table private.factory_requests is 'Private raw prompts and targets for AI Game Factory jobs. Never expose through public project queue views.';
