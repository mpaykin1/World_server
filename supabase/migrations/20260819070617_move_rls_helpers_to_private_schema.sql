create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon,authenticated;

alter function public.is_project_member(uuid) set schema private;
alter function public.can_manage_project(uuid) set schema private;
alter function public.is_project_public(uuid) set schema private;

revoke all on function private.is_project_member(uuid) from public;
revoke all on function private.can_manage_project(uuid) from public;
revoke all on function private.is_project_public(uuid) from public;
grant execute on function private.is_project_member(uuid) to anon,authenticated;
grant execute on function private.can_manage_project(uuid) to authenticated;
grant execute on function private.is_project_public(uuid) to anon,authenticated;

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
  if not private.is_project_member(v_project_id) then raise exception 'Project membership required'; end if;
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
  if not private.is_project_member(v_task.project_id) then raise exception 'Project membership required'; end if;
  if v_task.status='done' then raise exception 'Task already completed'; end if;
  if v_task.assignee_id is not null and v_task.assignee_id <> auth.uid() then raise exception 'Task already claimed'; end if;
  update public.tasks
  set assignee_id=auth.uid(), status=case when status='todo' then 'in_progress' else status end
  where id=p_task_id
  returning * into v_task;
  return v_task;
end;
$$;

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
  if v_task.assignee_id <> auth.uid() and not private.can_manage_project(v_task.project_id) then raise exception 'Only assignee or project admin can change status'; end if;
  update public.tasks set status=p_status where id=p_task_id returning * into v_task;
  return v_task;
end;
$$;
