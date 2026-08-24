alter table public.tasks add column if not exists skills text[] not null default '{}';
alter table public.tasks add column if not exists estimated_hours numeric(4,1);
alter table public.tasks add column if not exists is_onboarding boolean not null default false;
alter table public.tasks add column if not exists acceptance_criteria jsonb not null default '[]'::jsonb;

create index if not exists tasks_onboarding_idx on public.tasks(project_id, is_onboarding, status) where is_onboarding=true;
create index if not exists tasks_skills_idx on public.tasks using gin(skills);

create or replace function public.join_public_project(p_slug text)
returns public.project_members
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_project public.projects;
  v_member public.project_members;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_project from public.projects where slug=p_slug and visibility='public';
  if not found then raise exception 'Public project not found'; end if;
  insert into public.project_members(project_id,user_id,role)
  values(v_project.id,auth.uid(),'member')
  on conflict(project_id,user_id) do update set user_id=excluded.user_id
  returning * into v_member;
  return v_member;
end;
$$;

grant execute on function public.join_public_project(text) to authenticated;

create or replace function public.claim_project_task(p_task_id uuid)
returns public.tasks
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_task public.tasks;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_task from public.tasks where id=p_task_id for update;
  if not found then raise exception 'Task not found'; end if;
  if not public.is_project_member(v_task.project_id) then raise exception 'Project membership required'; end if;
  if v_task.status='done' then raise exception 'Task already completed'; end if;
  if v_task.assignee_id is not null and v_task.assignee_id <> auth.uid() then raise exception 'Task already claimed'; end if;
  update public.tasks
  set assignee_id=auth.uid(), status=case when status='todo' then 'in_progress' else status end
  where id=p_task_id
  returning * into v_task;
  return v_task;
end;
$$;

grant execute on function public.claim_project_task(uuid) to authenticated;

create or replace function public.set_my_task_status(p_task_id uuid,p_status text)
returns public.tasks
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_task public.tasks;
begin
  if p_status not in ('todo','in_progress','review','done') then raise exception 'Invalid task status'; end if;
  select * into v_task from public.tasks where id=p_task_id for update;
  if not found then raise exception 'Task not found'; end if;
  if v_task.assignee_id <> auth.uid() and not public.can_manage_project(v_task.project_id) then raise exception 'Only assignee or project admin can change status'; end if;
  update public.tasks set status=p_status where id=p_task_id returning * into v_task;
  return v_task;
end;
$$;

grant execute on function public.set_my_task_status(uuid,text) to authenticated;

create or replace function public.get_onboarding_tasks(p_slug text,p_skills text[] default '{}')
returns setof public.tasks
language sql
stable
security invoker
set search_path=''
as $$
  select t.*
  from public.tasks t
  join public.projects p on p.id=t.project_id
  where p.slug=p_slug
    and t.is_onboarding=true
    and t.status='todo'
    and t.assignee_id is null
    and (coalesce(array_length(p_skills,1),0)=0 or t.skills && p_skills)
  order by case when t.skills && p_skills then 0 else 1 end, t.priority asc, t.created_at asc
  limit 10;
$$;

grant execute on function public.get_onboarding_tasks(text,text[]) to anon,authenticated;
