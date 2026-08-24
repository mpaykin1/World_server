create or replace function public.get_my_profile()
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  select case when auth.uid() is null then null else coalesce((
    select jsonb_build_object(
      'id',p.id,
      'username',p.username,
      'display_name',p.display_name,
      'avatar_url',p.avatar_url,
      'bio',p.bio,
      'skills',p.skills,
      'created_at',p.created_at,
      'updated_at',p.updated_at
    ) from public.profiles p where p.id=auth.uid()
  ),jsonb_build_object('id',auth.uid(),'skills','[]'::jsonb)) end;
$$;

grant execute on function public.get_my_profile() to authenticated;

create or replace function public.update_my_profile(p_display_name text default null,p_bio text default null,p_skills text[] default '{}')
returns public.profiles
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_row public.profiles;
  v_skills text[];
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select coalesce(array_agg(x order by x),'{}'::text[]) into v_skills
  from (
    select distinct lower(trim(s)) x
    from unnest(coalesce(p_skills,'{}'::text[])) s
    where length(trim(s)) between 1 and 32
    limit 24
  ) q;

  update public.profiles
  set display_name=left(nullif(trim(p_display_name),''),80),
      bio=left(nullif(trim(p_bio),''),500),
      skills=v_skills,
      updated_at=now()
  where id=auth.uid()
  returning * into v_row;

  if not found then raise exception 'Profile not found'; end if;
  return v_row;
end;
$$;

grant execute on function public.update_my_profile(text,text,text[]) to authenticated;

create or replace function public.get_project_next_step(p_slug text default 'improve-world')
returns jsonb
language plpgsql
stable
security invoker
set search_path=''
as $$
declare
  v_project public.projects;
  v_task public.tasks;
  v_profile public.profiles;
begin
  select * into v_project from public.projects where slug=p_slug limit 1;
  if not found then raise exception 'Project not found'; end if;

  if auth.uid() is null then
    return jsonb_build_object(
      'action_key','sign_in',
      'title','Войди или зарегистрируйся',
      'description','Один аккаунт связывает задачи, вклад и игровой мир.',
      'href','#account'
    );
  end if;

  if not private.is_project_member(v_project.id) then
    return jsonb_build_object(
      'action_key','join_project',
      'title','Присоединиться к Improve World',
      'description','Стань соавтором и получи первую небольшую законченную задачу.',
      'href','#hub'
    );
  end if;

  select * into v_task from public.tasks
  where project_id=v_project.id and assignee_id=auth.uid() and status in ('todo','in_progress','review')
  order by case status when 'in_progress' then 0 when 'review' then 1 else 2 end,priority,updated_at desc limit 1;
  if found then
    return jsonb_build_object(
      'action_key','continue_task',
      'title',case when v_task.status='review' then 'Проверь отправленную задачу' else 'Продолжить: '||v_task.title end,
      'description',coalesce(v_task.description,'Продолжи свой текущий вклад.'),
      'href','#task-detail',
      'task_id',v_task.id,
      'task_status',v_task.status,
      'estimated_hours',v_task.estimated_hours
    );
  end if;

  select * into v_profile from public.profiles where id=auth.uid();
  select * into v_task from public.tasks
  where project_id=v_project.id and is_onboarding=true and status='todo' and assignee_id is null
    and (coalesce(array_length(v_profile.skills,1),0)=0 or skills && v_profile.skills)
  order by case when skills && coalesce(v_profile.skills,'{}'::text[]) then 0 else 1 end,priority,created_at limit 1;
  if found then
    return jsonb_build_object(
      'action_key','claim_task',
      'title','Возьми первую задачу: '||v_task.title,
      'description',coalesce(v_task.description,'Небольшая законченная задача, которая станет частью мира.'),
      'href','#task-detail',
      'task_id',v_task.id,
      'estimated_hours',v_task.estimated_hours,
      'skills',to_jsonb(v_task.skills)
    );
  end if;

  return jsonb_build_object(
    'action_key','browse_tasks',
    'title','Выбери следующее улучшение',
    'description','Открой доску и найди небольшой законченный вклад, который хочется сделать.',
    'href','#tasks'
  );
end;
$$;

grant execute on function public.get_project_next_step(text) to anon,authenticated;

create or replace function public.get_world_authorship_feed(p_slug text default 'improve-world',p_limit integer default 50)
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
with target as (
  select id from public.projects where slug=p_slug limit 1
), entities as (
  select e.* from public.world_entities e join target p on p.id=e.project_id
  order by e.updated_at desc limit greatest(1,least(coalesce(p_limit,50),100))
)
select coalesce(jsonb_agg(jsonb_build_object(
  'id',e.id,
  'entity_type',e.entity_type,
  'external_key',e.external_key,
  'title',e.title,
  'current_state',e.current_state,
  'created_by',e.created_by,
  'created_by_name',private.profile_public_name(e.created_by),
  'source_task_id',e.source_task_id,
  'created_at',e.created_at,
  'updated_at',e.updated_at,
  'revisions',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',r.id,
      'author_id',r.author_id,
      'author_name',private.profile_public_name(r.author_id),
      'task_id',r.task_id,
      'daily_improvement_id',r.daily_improvement_id,
      'summary',r.summary,
      'created_at',r.created_at
    ) order by r.created_at desc)
    from public.world_entity_revisions r where r.entity_id=e.id
  ),'[]'::jsonb)
) order by e.updated_at desc),'[]'::jsonb)
from entities e;
$$;

grant execute on function public.get_world_authorship_feed(text,integer) to anon,authenticated;

with p as (select id from public.projects where slug='improve-world')
update public.repository_context rc set
  architecture_notes = rc.architecture_notes || jsonb_build_object(
    'frontend_ready_rpcs',jsonb_build_array(
      'get_project_dashboard','get_project_next_step','get_my_profile','update_my_profile','join_public_project',
      'get_onboarding_tasks','claim_project_task','set_my_task_status','submit_daily_improvement','get_world_authorship_feed',
      'get_ux_tour_state','start_ux_tour','start_ux_screen_test','record_ux_event','submit_ux_screen_test',
      'complete_ux_guided_action','complete_ux_tour','skip_ux_tour','get_ux_metrics'
    )
  ),updated_at=now()
from p where rc.project_id=p.id;
