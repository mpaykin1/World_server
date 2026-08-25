-- Rich repository/implementation context for Codex
create table if not exists public.repository_context (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,
  repo_full_name text not null,
  default_branch text not null default 'master',
  production_url text,
  deployment_provider text not null default 'vercel',
  database_provider text not null default 'supabase',
  app_routes jsonb not null default '{}'::jsonb,
  important_paths jsonb not null default '{}'::jsonb,
  environment_contract jsonb not null default '{}'::jsonb,
  architecture_notes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.feature_specs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  feature_key text not null,
  objective text not null,
  implementation_plan jsonb not null default '[]'::jsonb,
  target_files jsonb not null default '[]'::jsonb,
  preserve_requirements jsonb not null default '[]'::jsonb,
  api_contract jsonb not null default '{}'::jsonb,
  data_contract jsonb not null default '{}'::jsonb,
  ux_contract jsonb not null default '{}'::jsonb,
  tests jsonb not null default '[]'::jsonb,
  verification_commands text[] not null default '{}',
  completion_definition text,
  codex_instruction text,
  spec_status text not null default 'ready' check (spec_status in ('draft','ready','obsolete')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, feature_key)
);

-- Generic authorship/provenance layer for future world objects.
create table if not exists public.world_entities (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  entity_type text not null,
  external_key text,
  title text not null,
  current_state jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles(id) on delete restrict,
  source_task_id uuid references public.tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, entity_type, external_key)
);

create table if not exists public.world_entity_revisions (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.world_entities(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  task_id uuid references public.tasks(id) on delete set null,
  daily_improvement_id uuid references public.daily_improvements(id) on delete set null,
  summary text not null,
  patch jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists feature_specs_project_idx on public.feature_specs(project_id, feature_key);
create index if not exists world_entities_project_idx on public.world_entities(project_id, entity_type);
create index if not exists world_entity_revisions_entity_idx on public.world_entity_revisions(entity_id, created_at desc);

create or replace trigger repository_context_set_updated_at
before update on public.repository_context
for each row execute function public.set_updated_at();

create or replace trigger feature_specs_set_updated_at
before update on public.feature_specs
for each row execute function public.set_updated_at();

create or replace trigger world_entities_set_updated_at
before update on public.world_entities
for each row execute function public.set_updated_at();

alter table public.repository_context enable row level security;
alter table public.feature_specs enable row level security;
alter table public.world_entities enable row level security;
alter table public.world_entity_revisions enable row level security;

create policy "repository_context_read_visible_project"
on public.repository_context for select to anon, authenticated
using (public.is_project_public(project_id) or public.is_project_member(project_id));

create policy "repository_context_manage_admin"
on public.repository_context for all to authenticated
using (public.can_manage_project(project_id))
with check (public.can_manage_project(project_id));

create policy "feature_specs_read_visible_project"
on public.feature_specs for select to anon, authenticated
using (public.is_project_public(project_id) or public.is_project_member(project_id));

create policy "feature_specs_manage_admin"
on public.feature_specs for all to authenticated
using (public.can_manage_project(project_id))
with check (public.can_manage_project(project_id));

create policy "world_entities_read_visible_project"
on public.world_entities for select to anon, authenticated
using (public.is_project_public(project_id) or public.is_project_member(project_id));

create policy "world_entities_insert_member"
on public.world_entities for insert to authenticated
with check (public.is_project_member(project_id) and created_by = auth.uid());

create policy "world_entities_update_author_or_admin"
on public.world_entities for update to authenticated
using (created_by = auth.uid() or public.can_manage_project(project_id))
with check (created_by = auth.uid() or public.can_manage_project(project_id));

create policy "world_entities_delete_author_or_admin"
on public.world_entities for delete to authenticated
using (created_by = auth.uid() or public.can_manage_project(project_id));

create policy "world_entity_revisions_read_visible"
on public.world_entity_revisions for select to anon, authenticated
using (exists (
  select 1 from public.world_entities e
  where e.id = entity_id
    and (public.is_project_public(e.project_id) or public.is_project_member(e.project_id))
));

create policy "world_entity_revisions_insert_member"
on public.world_entity_revisions for insert to authenticated
with check (
  author_id = auth.uid() and exists (
    select 1 from public.world_entities e
    where e.id = entity_id and public.is_project_member(e.project_id)
  )
);

grant select on public.repository_context, public.feature_specs, public.world_entities, public.world_entity_revisions to anon, authenticated;
grant insert, update, delete on public.repository_context, public.feature_specs to authenticated;
grant insert, update, delete on public.world_entities to authenticated;
grant insert on public.world_entity_revisions to authenticated;

-- One RPC gives the Improve World UI everything needed for its home/dashboard.
create or replace function public.get_project_dashboard(p_slug text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
with target as (
  select p.* from public.projects p where p.slug = p_slug limit 1
),
team_data as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'name', t.name,
    'description', t.description,
    'focus_area', t.focus_area,
    'member_count', (select count(*) from public.team_members tm where tm.team_id = t.id)
  ) order by t.name), '[]'::jsonb) value
  from public.teams t join target p on p.id=t.project_id
),
task_data as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', x.id,
    'title', x.title,
    'description', x.description,
    'status', x.status,
    'priority', x.priority,
    'team_id', x.team_id,
    'assignee_id', x.assignee_id,
    'due_at', x.due_at,
    'created_at', x.created_at
  ) order by x.priority asc, x.created_at desc), '[]'::jsonb) value
  from (select t.* from public.tasks t join target p on p.id=t.project_id order by t.priority, t.created_at desc limit 100) x
),
improvement_data as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', x.id,
    'task_id', x.task_id,
    'author_id', x.author_id,
    'date', x.improvement_date,
    'title', x.title,
    'description', x.description,
    'impact_percent', x.impact_percent,
    'proof_url', x.proof_url,
    'status', x.status,
    'created_at', x.created_at
  ) order by x.created_at desc), '[]'::jsonb) value
  from (select d.* from public.daily_improvements d join target p on p.id=d.project_id order by d.created_at desc limit 50) x
),
progress_data as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'date', q.improvement_date,
    'accepted_improvements', q.accepted_improvements,
    'contributors', q.contributors,
    'progress_percent', q.progress_percent
  ) order by q.improvement_date desc), '[]'::jsonb) value
  from (select dp.* from public.daily_project_progress dp join target p on p.id=dp.project_id order by dp.improvement_date desc limit 30) q
)
select jsonb_build_object(
  'project', jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'slug', p.slug,
    'description', p.description,
    'vision', p.vision,
    'visibility', p.visibility
  ),
  'stats', jsonb_build_object(
    'members', (select count(*) from public.project_members pm where pm.project_id=p.id),
    'teams', (select count(*) from public.teams t where t.project_id=p.id),
    'open_tasks', (select count(*) from public.tasks t where t.project_id=p.id and t.status <> 'done'),
    'done_tasks', (select count(*) from public.tasks t where t.project_id=p.id and t.status = 'done'),
    'accepted_improvements', (select count(*) from public.daily_improvements d where d.project_id=p.id and d.status='accepted')
  ),
  'teams', td.value,
  'tasks', tk.value,
  'improvements', im.value,
  'progress', pg.value
)
from target p cross join team_data td cross join task_data tk cross join improvement_data im cross join progress_data pg;
$$;

grant execute on function public.get_project_dashboard(text) to anon, authenticated;

-- Simple canonical write path for the daily +1% contribution.
create or replace function public.submit_daily_improvement(
  p_project_slug text,
  p_title text,
  p_description text default null,
  p_task_id uuid default null,
  p_proof_url text default null,
  p_impact_percent numeric default 1.00
)
returns public.daily_improvements
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_project_id uuid;
  v_row public.daily_improvements;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select id into v_project_id from public.projects where slug=p_project_slug;
  if v_project_id is null then raise exception 'Project not found'; end if;
  if not public.is_project_member(v_project_id) then raise exception 'Project membership required'; end if;
  if nullif(trim(p_title),'') is null then raise exception 'Title is required'; end if;
  if p_task_id is not null and not exists(select 1 from public.tasks where id=p_task_id and project_id=v_project_id) then
    raise exception 'Task does not belong to project';
  end if;
  insert into public.daily_improvements(project_id, task_id, author_id, title, description, impact_percent, proof_url, status)
  values(v_project_id, p_task_id, auth.uid(), trim(p_title), nullif(trim(p_description),''), greatest(0.01,least(100,p_impact_percent)), nullif(trim(p_proof_url),''), 'submitted')
  returning * into v_row;
  return v_row;
end;
$$;

grant execute on function public.submit_daily_improvement(text,text,text,uuid,text,numeric) to authenticated;

-- Codex reads a single row per backlog item with all implementation context.
create or replace view public.codex_work_queue
with (security_invoker=true)
as
select
  p.slug as project_slug,
  fb.feature_key,
  fb.area,
  fb.title,
  fb.description,
  fb.acceptance_criteria,
  fb.priority,
  fb.status,
  fs.objective,
  fs.implementation_plan,
  fs.target_files,
  fs.preserve_requirements,
  fs.api_contract,
  fs.data_contract,
  fs.ux_contract,
  fs.tests,
  fs.verification_commands,
  fs.completion_definition,
  fs.codex_instruction,
  rc.repo_full_name,
  rc.default_branch,
  rc.production_url,
  rc.app_routes,
  rc.important_paths,
  rc.environment_contract,
  rc.architecture_notes,
  row_number() over (
    partition by p.id
    order by case fb.status when 'planned' then 0 when 'idea' then 1 else 2 end, fb.priority asc, fb.feature_key asc
  ) as queue_rank
from public.feature_backlog fb
join public.projects p on p.id=fb.project_id
left join public.feature_specs fs on fs.project_id=fb.project_id and fs.feature_key=fb.feature_key and fs.spec_status='ready'
left join public.repository_context rc on rc.project_id=fb.project_id
where fb.status in ('planned','idea');

grant select on public.codex_work_queue to anon, authenticated;
