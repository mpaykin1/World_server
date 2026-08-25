drop policy if exists "project_members_insert_admin" on public.project_members;
create policy "project_members_insert_admin_or_self_join" on public.project_members for insert to authenticated
with check (
  private.can_manage_project(project_id)
  or (user_id=(select auth.uid()) and role='member' and private.is_project_public(project_id))
);

create or replace function public.review_daily_improvement(p_improvement_id uuid,p_status text)
returns public.daily_improvements
language plpgsql
security invoker
set search_path=''
as $$
declare v_row public.daily_improvements;
begin
  if p_status not in ('accepted','rejected') then raise exception 'Status must be accepted or rejected'; end if;
  select * into v_row from public.daily_improvements where id=p_improvement_id for update;
  if not found then raise exception 'Improvement not found'; end if;
  if not private.can_manage_project(v_row.project_id) then raise exception 'Project admin required'; end if;
  update public.daily_improvements set status=p_status where id=p_improvement_id returning * into v_row;
  return v_row;
end;
$$;
grant execute on function public.review_daily_improvement(uuid,text) to authenticated;

create or replace function public.create_project_team(p_project_slug text,p_name text,p_description text default null,p_focus_area text default null)
returns public.teams
language plpgsql
security invoker
set search_path=''
as $$
declare v_project_id uuid; v_row public.teams;
begin
  select id into v_project_id from public.projects where slug=p_project_slug;
  if v_project_id is null then raise exception 'Project not found'; end if;
  if not private.can_manage_project(v_project_id) then raise exception 'Project admin required'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'Team name required'; end if;
  insert into public.teams(project_id,name,description,focus_area,created_by)
  values(v_project_id,trim(p_name),nullif(trim(p_description),''),nullif(trim(p_focus_area),''),(select auth.uid()))
  returning * into v_row;
  return v_row;
end;
$$;
grant execute on function public.create_project_team(text,text,text,text) to authenticated;

create or replace function public.upsert_team_member(p_team_id uuid,p_user_id uuid,p_role text default 'member')
returns public.team_members
language plpgsql
security invoker
set search_path=''
as $$
declare v_project_id uuid; v_row public.team_members;
begin
  if p_role not in ('lead','member') then raise exception 'Invalid team role'; end if;
  select project_id into v_project_id from public.teams where id=p_team_id;
  if v_project_id is null then raise exception 'Team not found'; end if;
  if not private.can_manage_project(v_project_id) then raise exception 'Project admin required'; end if;
  if not exists(select 1 from public.project_members pm where pm.project_id=v_project_id and pm.user_id=p_user_id) then
    raise exception 'User must join project first';
  end if;
  insert into public.team_members(team_id,user_id,role)
  values(p_team_id,p_user_id,p_role)
  on conflict(team_id,user_id) do update set role=excluded.role
  returning * into v_row;
  return v_row;
end;
$$;
grant execute on function public.upsert_team_member(uuid,uuid,text) to authenticated;

create or replace function public.remove_team_member(p_team_id uuid,p_user_id uuid)
returns boolean
language plpgsql
security invoker
set search_path=''
as $$
declare v_project_id uuid;
begin
  select project_id into v_project_id from public.teams where id=p_team_id;
  if v_project_id is null then raise exception 'Team not found'; end if;
  if not private.can_manage_project(v_project_id) then raise exception 'Project admin required'; end if;
  delete from public.team_members where team_id=p_team_id and user_id=p_user_id;
  return found;
end;
$$;
grant execute on function public.remove_team_member(uuid,uuid) to authenticated;

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
member_data as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',pm.user_id,
    'name',private.profile_public_name(pm.user_id),
    'role',pm.role,
    'joined_at',pm.joined_at
  ) order by case pm.role when 'owner' then 0 when 'admin' then 1 else 2 end, pm.joined_at),'[]'::jsonb) value
  from public.project_members pm join target p on p.id=pm.project_id
),
team_data as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'name', t.name,
    'description', t.description,
    'focus_area', t.focus_area,
    'member_count', (select count(*) from public.team_members tm where tm.team_id = t.id),
    'open_tasks', (select count(*) from public.tasks tk where tk.team_id=t.id and tk.status<>'done'),
    'members', coalesce((select jsonb_agg(jsonb_build_object('user_id',tm.user_id,'name',private.profile_public_name(tm.user_id),'role',tm.role) order by case tm.role when 'lead' then 0 else 1 end, private.profile_public_name(tm.user_id)) from public.team_members tm where tm.team_id=t.id),'[]'::jsonb)
  ) order by t.name), '[]'::jsonb) value
  from public.teams t join target p on p.id=t.project_id
),
task_data as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', x.id,'feature_key',x.feature_key,'title',x.title,'description',x.description,'status',x.status,'priority',x.priority,
    'team_id',x.team_id,'assignee_id',x.assignee_id,'assignee_name',case when x.assignee_id is null then null else private.profile_public_name(x.assignee_id) end,
    'skills',x.skills,'estimated_hours',x.estimated_hours,'is_onboarding',x.is_onboarding,'acceptance_criteria',x.acceptance_criteria,
    'due_at',x.due_at,'created_at',x.created_at
  ) order by x.priority asc,x.created_at desc),'[]'::jsonb) value
  from (select t.* from public.tasks t join target p on p.id=t.project_id order by t.priority,t.created_at desc limit 100) x
),
improvement_data as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',x.id,'task_id',x.task_id,'author_id',x.author_id,'author_name',private.profile_public_name(x.author_id),'date',x.improvement_date,
    'title',x.title,'description',x.description,'impact_percent',x.impact_percent,'proof_url',x.proof_url,'status',x.status,'created_at',x.created_at
  ) order by x.created_at desc),'[]'::jsonb) value
  from (select d.* from public.daily_improvements d join target p on p.id=d.project_id order by d.created_at desc limit 50) x
),
progress_data as (
  select coalesce(jsonb_agg(jsonb_build_object('date',q.improvement_date,'accepted_improvements',q.accepted_improvements,'contributors',q.contributors,'progress_percent',q.progress_percent) order by q.improvement_date desc),'[]'::jsonb) value
  from (select dp.* from public.daily_project_progress dp join target p on p.id=dp.project_id order by dp.improvement_date desc limit 30) q
)
select jsonb_build_object(
  'project',jsonb_build_object('id',p.id,'name',p.name,'slug',p.slug,'description',p.description,'vision',p.vision,'visibility',p.visibility,'created_by',p.created_by,'creator_name',private.profile_public_name(p.created_by)),
  'viewer',jsonb_build_object('user_id',(select auth.uid()),'is_authenticated',((select auth.uid()) is not null),'is_member',case when (select auth.uid()) is null then false else private.is_project_member(p.id) end,'role',(select pm.role from public.project_members pm where pm.project_id=p.id and pm.user_id=(select auth.uid()) limit 1)),
  'stats',jsonb_build_object('members',(select count(*) from public.project_members pm where pm.project_id=p.id),'teams',(select count(*) from public.teams t where t.project_id=p.id),'open_tasks',(select count(*) from public.tasks t where t.project_id=p.id and t.status<>'done'),'done_tasks',(select count(*) from public.tasks t where t.project_id=p.id and t.status='done'),'onboarding_tasks_available',(select count(*) from public.tasks t where t.project_id=p.id and t.is_onboarding=true and t.status='todo' and t.assignee_id is null),'accepted_improvements',(select count(*) from public.daily_improvements d where d.project_id=p.id and d.status='accepted')),
  'members',md.value,'teams',td.value,'tasks',tk.value,'improvements',im.value,'progress',pg.value
)
from target p cross join member_data md cross join team_data td cross join task_data tk cross join improvement_data im cross join progress_data pg;
$$;
