create or replace function private.profile_public_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(nullif(p.display_name,''), nullif(p.username::text,''), 'Contributor')
  from public.profiles p where p.id=p_user_id;
$$;
revoke all on function private.profile_public_name(uuid) from public;
grant execute on function private.profile_public_name(uuid) to anon,authenticated;

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
    'member_count', (select count(*) from public.team_members tm where tm.team_id = t.id),
    'open_tasks', (select count(*) from public.tasks tk where tk.team_id=t.id and tk.status<>'done')
  ) order by t.name), '[]'::jsonb) value
  from public.teams t join target p on p.id=t.project_id
),
task_data as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', x.id,
    'feature_key', x.feature_key,
    'title', x.title,
    'description', x.description,
    'status', x.status,
    'priority', x.priority,
    'team_id', x.team_id,
    'assignee_id', x.assignee_id,
    'assignee_name', case when x.assignee_id is null then null else private.profile_public_name(x.assignee_id) end,
    'skills', x.skills,
    'estimated_hours', x.estimated_hours,
    'is_onboarding', x.is_onboarding,
    'acceptance_criteria', x.acceptance_criteria,
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
    'author_name', private.profile_public_name(x.author_id),
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
    'visibility', p.visibility,
    'created_by', p.created_by,
    'creator_name', private.profile_public_name(p.created_by)
  ),
  'viewer', jsonb_build_object(
    'user_id', (select auth.uid()),
    'is_authenticated', ((select auth.uid()) is not null),
    'is_member', case when (select auth.uid()) is null then false else private.is_project_member(p.id) end,
    'role', (select pm.role from public.project_members pm where pm.project_id=p.id and pm.user_id=(select auth.uid()) limit 1)
  ),
  'stats', jsonb_build_object(
    'members', (select count(*) from public.project_members pm where pm.project_id=p.id),
    'teams', (select count(*) from public.teams t where t.project_id=p.id),
    'open_tasks', (select count(*) from public.tasks t where t.project_id=p.id and t.status <> 'done'),
    'done_tasks', (select count(*) from public.tasks t where t.project_id=p.id and t.status = 'done'),
    'onboarding_tasks_available', (select count(*) from public.tasks t where t.project_id=p.id and t.is_onboarding=true and t.status='todo' and t.assignee_id is null),
    'accepted_improvements', (select count(*) from public.daily_improvements d where d.project_id=p.id and d.status='accepted')
  ),
  'teams', td.value,
  'tasks', tk.value,
  'improvements', im.value,
  'progress', pg.value
)
from target p cross join team_data td cross join task_data tk cross join improvement_data im cross join progress_data pg;
$$;

grant execute on function public.get_project_dashboard(text) to anon,authenticated;
