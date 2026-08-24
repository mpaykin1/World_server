create table private.ux_tour_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  version integer not null check (version > 0),
  name text not null,
  status text not null default 'draft' check (status in ('draft','active','archived')),
  min_observation_ms integer not null default 5000 check (min_observation_ms between 1000 and 30000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, version)
);
create unique index ux_one_active_tour_per_project_idx on private.ux_tour_versions(project_id) where status='active';

create table private.ux_tour_screens (
  id uuid primary key default gen_random_uuid(),
  tour_version_id uuid not null references private.ux_tour_versions(id) on delete cascade,
  screen_key text not null,
  title text not null,
  route text not null,
  sort_order integer not null,
  observation_prompt text not null default 'Посмотри на экран. Через 5 секунд появятся три вопроса.',
  question_location text not null default 'Где ты сейчас?',
  question_actions text not null default 'Что здесь можно сделать?',
  question_first_action text not null default 'Куда бы ты нажал первым делом?',
  location_options jsonb not null default '[]'::jsonb,
  action_options jsonb not null default '[]'::jsonb,
  explanation_md text not null,
  guided_action_instruction text not null,
  primary_action_selector text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tour_version_id, screen_key),
  unique(tour_version_id, sort_order)
);

create table private.ux_tour_screen_expectations (
  screen_id uuid primary key references private.ux_tour_screens(id) on delete cascade,
  expected_location_key text not null,
  expected_action_keys text[] not null default '{}',
  expected_primary_action_key text not null,
  created_at timestamptz not null default now()
);

create table private.ux_tour_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  tour_version_id uuid not null references private.ux_tour_versions(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  session_token uuid not null default gen_random_uuid(),
  status text not null default 'active' check (status in ('active','completed','skipped','abandoned')),
  device_type text,
  viewport_width integer,
  viewport_height integer,
  language text,
  last_screen_key text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  skipped_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(id, session_token)
);
create index ux_tour_sessions_project_version_idx on private.ux_tour_sessions(project_id, tour_version_id, started_at desc);
create index ux_tour_sessions_user_idx on private.ux_tour_sessions(user_id, started_at desc) where user_id is not null;

create table private.ux_screen_tests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references private.ux_tour_sessions(id) on delete cascade,
  screen_id uuid not null references private.ux_tour_screens(id) on delete cascade,
  started_at timestamptz not null default now(),
  answered_at timestamptz,
  guided_action_completed_at timestamptz,
  location_answer_key text,
  location_answer_text text,
  action_answer_keys text[] not null default '{}',
  action_answer_text text,
  confidence smallint check (confidence between 1 and 5),
  first_action_key text,
  first_action_target text,
  first_action_x numeric,
  first_action_y numeric,
  time_to_first_action_ms integer check (time_to_first_action_ms is null or time_to_first_action_ms >= 0),
  min_observation_met boolean,
  location_score numeric(5,4),
  action_score numeric(5,4),
  primary_action_correct boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(session_id, screen_id)
);
create index ux_screen_tests_screen_answered_idx on private.ux_screen_tests(screen_id, answered_at) where answered_at is not null;

create table private.ux_interaction_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references private.ux_tour_sessions(id) on delete cascade,
  screen_id uuid not null references private.ux_tour_screens(id) on delete cascade,
  event_type text not null check (event_type in ('click','key','focus','guided_action')),
  action_key text,
  target text,
  x numeric,
  y numeric,
  elapsed_ms integer check (elapsed_ms is null or elapsed_ms >= 0),
  created_at timestamptz not null default now()
);
create index ux_interaction_events_screen_idx on private.ux_interaction_events(screen_id, created_at desc);
create index ux_interaction_events_session_idx on private.ux_interaction_events(session_id, created_at);

revoke all on private.ux_tour_versions, private.ux_tour_screens, private.ux_tour_screen_expectations,
  private.ux_tour_sessions, private.ux_screen_tests, private.ux_interaction_events from anon, authenticated;

create or replace function private.get_ux_tour_state(p_project_slug text)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare
  v_project public.projects;
  v_version private.ux_tour_versions;
  v_previous_status text;
  v_previous_at timestamptz;
  v_screens jsonb;
begin
  select * into v_project from public.projects where slug=p_project_slug limit 1;
  if not found then raise exception 'Project not found'; end if;
  select * into v_version from private.ux_tour_versions where project_id=v_project.id and status='active' order by version desc limit 1;
  if not found then return jsonb_build_object('required',false,'reason','no_active_tour','project_slug',p_project_slug); end if;
  if auth.uid() is not null then
    select s.status,coalesce(s.completed_at,s.skipped_at,s.updated_at) into v_previous_status,v_previous_at
    from private.ux_tour_sessions s
    where s.project_id=v_project.id and s.tour_version_id=v_version.id and s.user_id=auth.uid() and s.status in ('completed','skipped')
    order by coalesce(s.completed_at,s.skipped_at,s.updated_at) desc limit 1;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'screen_key',s.screen_key,'title',s.title,'route',s.route,'sort_order',s.sort_order,
    'observation_prompt',s.observation_prompt,'question_location',s.question_location,'question_actions',s.question_actions,
    'question_first_action',s.question_first_action,'location_options',s.location_options,'action_options',s.action_options
  ) order by s.sort_order),'[]'::jsonb) into v_screens
  from private.ux_tour_screens s where s.tour_version_id=v_version.id and s.active=true;
  return jsonb_build_object(
    'required',case when auth.uid() is null then true else v_previous_status is null end,
    'previous_status',v_previous_status,'previous_at',v_previous_at,'project_slug',p_project_slug,
    'tour',jsonb_build_object('version',v_version.version,'name',v_version.name,'min_observation_ms',v_version.min_observation_ms,'screens',v_screens)
  );
end; $$;

create or replace function private.start_ux_tour(p_project_slug text,p_device_type text default null,p_viewport_width integer default null,p_viewport_height integer default null,p_language text default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_project public.projects; v_version private.ux_tour_versions; v_session private.ux_tour_sessions; v_state jsonb;
begin
  select * into v_project from public.projects where slug=p_project_slug limit 1;
  if not found then raise exception 'Project not found'; end if;
  select * into v_version from private.ux_tour_versions where project_id=v_project.id and status='active' order by version desc limit 1;
  if not found then raise exception 'No active UX tour'; end if;
  insert into private.ux_tour_sessions(project_id,tour_version_id,user_id,device_type,viewport_width,viewport_height,language)
  values(v_project.id,v_version.id,auth.uid(),nullif(trim(p_device_type),''),p_viewport_width,p_viewport_height,nullif(trim(p_language),'')) returning * into v_session;
  v_state:=private.get_ux_tour_state(p_project_slug);
  return jsonb_build_object('session_id',v_session.id,'session_token',v_session.session_token,'started_at',v_session.started_at,'tour',v_state->'tour');
end; $$;

create or replace function private.start_ux_screen_test(p_session_id uuid,p_session_token uuid,p_screen_key text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_session private.ux_tour_sessions; v_screen private.ux_tour_screens; v_test private.ux_screen_tests; v_min_ms integer;
begin
  select * into v_session from private.ux_tour_sessions where id=p_session_id and session_token=p_session_token and status='active';
  if not found then raise exception 'Invalid or inactive UX session'; end if;
  select * into v_screen from private.ux_tour_screens where tour_version_id=v_session.tour_version_id and screen_key=p_screen_key and active=true;
  if not found then raise exception 'Tour screen not found'; end if;
  select min_observation_ms into v_min_ms from private.ux_tour_versions where id=v_session.tour_version_id;
  insert into private.ux_screen_tests(session_id,screen_id) values(v_session.id,v_screen.id)
  on conflict(session_id,screen_id) do update set
    started_at=case when private.ux_screen_tests.answered_at is null then now() else private.ux_screen_tests.started_at end,
    updated_at=now()
  returning * into v_test;
  update private.ux_tour_sessions set last_screen_key=p_screen_key,updated_at=now() where id=v_session.id;
  return jsonb_build_object('test_id',v_test.id,'screen_key',v_screen.screen_key,'started_at',v_test.started_at,'already_answered',v_test.answered_at is not null,'min_observation_ms',v_min_ms);
end; $$;

create or replace function private.record_ux_event(p_session_id uuid,p_session_token uuid,p_screen_key text,p_event_type text,p_action_key text default null,p_target text default null,p_x numeric default null,p_y numeric default null,p_elapsed_ms integer default null)
returns bigint language plpgsql security definer set search_path=''
as $$
declare v_session private.ux_tour_sessions; v_screen_id uuid; v_id bigint;
begin
  if p_event_type not in ('click','key','focus','guided_action') then raise exception 'Invalid event type'; end if;
  select * into v_session from private.ux_tour_sessions where id=p_session_id and session_token=p_session_token and status='active';
  if not found then raise exception 'Invalid or inactive UX session'; end if;
  select id into v_screen_id from private.ux_tour_screens where tour_version_id=v_session.tour_version_id and screen_key=p_screen_key and active=true;
  if v_screen_id is null then raise exception 'Tour screen not found'; end if;
  insert into private.ux_interaction_events(session_id,screen_id,event_type,action_key,target,x,y,elapsed_ms)
  values(v_session.id,v_screen_id,p_event_type,nullif(trim(p_action_key),''),left(nullif(trim(p_target),''),500),p_x,p_y,p_elapsed_ms) returning id into v_id;
  return v_id;
end; $$;

create or replace function private.submit_ux_screen_test(
  p_session_id uuid,p_session_token uuid,p_screen_key text,p_location_answer_key text,p_location_answer_text text default null,
  p_action_answer_keys text[] default '{}',p_action_answer_text text default null,p_confidence smallint default null,
  p_first_action_key text default null,p_first_action_target text default null,p_first_action_x numeric default null,p_first_action_y numeric default null,
  p_time_to_first_action_ms integer default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_session private.ux_tour_sessions; v_screen private.ux_tour_screens; v_expect private.ux_tour_screen_expectations; v_test private.ux_screen_tests;
  v_min_ms integer; v_elapsed_ms integer; v_location_score numeric; v_action_score numeric; v_primary_correct boolean;
  v_expected_count integer; v_selected_count integer; v_match_count integer; v_min_met boolean;
begin
  if p_confidence is not null and (p_confidence<1 or p_confidence>5) then raise exception 'Confidence must be 1..5'; end if;
  select * into v_session from private.ux_tour_sessions where id=p_session_id and session_token=p_session_token and status='active';
  if not found then raise exception 'Invalid or inactive UX session'; end if;
  select * into v_screen from private.ux_tour_screens where tour_version_id=v_session.tour_version_id and screen_key=p_screen_key and active=true;
  if not found then raise exception 'Tour screen not found'; end if;
  select * into v_expect from private.ux_tour_screen_expectations where screen_id=v_screen.id;
  if not found then raise exception 'Tour expectations missing'; end if;
  select * into v_test from private.ux_screen_tests where session_id=v_session.id and screen_id=v_screen.id for update;
  if not found then raise exception 'Start screen test first'; end if;
  if v_test.answered_at is not null then raise exception 'Screen test already submitted'; end if;
  select min_observation_ms into v_min_ms from private.ux_tour_versions where id=v_session.tour_version_id;
  v_elapsed_ms:=floor(extract(epoch from (now()-v_test.started_at))*1000)::integer;
  v_min_met:=v_elapsed_ms>=greatest(1000,v_min_ms-250);
  v_location_score:=case when p_location_answer_key=v_expect.expected_location_key then 1 else 0 end;
  select count(*) into v_expected_count from (select distinct x from unnest(v_expect.expected_action_keys) x) q;
  select count(*) into v_selected_count from (select distinct x from unnest(coalesce(p_action_answer_keys,'{}'::text[])) x) q;
  select count(*) into v_match_count from (select distinct x from unnest(v_expect.expected_action_keys) x) e where e.x=any(coalesce(p_action_answer_keys,'{}'::text[]));
  v_action_score:=case when greatest(v_expected_count,v_selected_count)=0 then 1 else v_match_count::numeric/greatest(v_expected_count,v_selected_count) end;
  v_primary_correct:=p_first_action_key=v_expect.expected_primary_action_key;
  update private.ux_screen_tests set answered_at=now(),location_answer_key=nullif(trim(p_location_answer_key),''),location_answer_text=left(nullif(trim(p_location_answer_text),''),1000),
    action_answer_keys=coalesce(p_action_answer_keys,'{}'::text[]),action_answer_text=left(nullif(trim(p_action_answer_text),''),1500),confidence=p_confidence,
    first_action_key=nullif(trim(p_first_action_key),''),first_action_target=left(nullif(trim(p_first_action_target),''),500),first_action_x=p_first_action_x,first_action_y=p_first_action_y,
    time_to_first_action_ms=p_time_to_first_action_ms,min_observation_met=v_min_met,location_score=v_location_score,action_score=v_action_score,
    primary_action_correct=v_primary_correct,updated_at=now() where id=v_test.id;
  return jsonb_build_object('screen_key',v_screen.screen_key,'observation_ms',v_elapsed_ms,'min_observation_met',v_min_met,
    'scores',jsonb_build_object('location',v_location_score,'actions',v_action_score,'primary_action_correct',v_primary_correct),
    'explanation_md',v_screen.explanation_md,'guided_action_instruction',v_screen.guided_action_instruction,
    'expected_primary_action_key',v_expect.expected_primary_action_key,'primary_action_selector',v_screen.primary_action_selector);
end; $$;

create or replace function private.complete_ux_guided_action(p_session_id uuid,p_session_token uuid,p_screen_key text,p_action_key text default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_session private.ux_tour_sessions; v_screen private.ux_tour_screens; v_test private.ux_screen_tests;
begin
  select * into v_session from private.ux_tour_sessions where id=p_session_id and session_token=p_session_token and status='active';
  if not found then raise exception 'Invalid or inactive UX session'; end if;
  select * into v_screen from private.ux_tour_screens where tour_version_id=v_session.tour_version_id and screen_key=p_screen_key and active=true;
  if not found then raise exception 'Tour screen not found'; end if;
  select * into v_test from private.ux_screen_tests where session_id=v_session.id and screen_id=v_screen.id for update;
  if not found or v_test.answered_at is null then raise exception 'Submit screen test first'; end if;
  update private.ux_screen_tests set guided_action_completed_at=coalesce(guided_action_completed_at,now()),updated_at=now() where id=v_test.id;
  insert into private.ux_interaction_events(session_id,screen_id,event_type,action_key,target,elapsed_ms)
  values(v_session.id,v_screen.id,'guided_action',nullif(trim(p_action_key),''),'guided_action_completed',floor(extract(epoch from (now()-v_test.started_at))*1000)::integer);
  update private.ux_tour_sessions set last_screen_key=p_screen_key,updated_at=now() where id=v_session.id;
  return jsonb_build_object('ok',true,'screen_key',p_screen_key);
end; $$;

create or replace function private.complete_ux_tour(p_session_id uuid,p_session_token uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_session private.ux_tour_sessions; v_total integer; v_answered integer;
begin
  select * into v_session from private.ux_tour_sessions where id=p_session_id and session_token=p_session_token and status='active' for update;
  if not found then raise exception 'Invalid or inactive UX session'; end if;
  select count(*) into v_total from private.ux_tour_screens where tour_version_id=v_session.tour_version_id and active=true;
  select count(*) into v_answered from private.ux_screen_tests t join private.ux_tour_screens s on s.id=t.screen_id
  where t.session_id=v_session.id and s.active=true and t.answered_at is not null;
  if v_answered<v_total then raise exception 'Tour is incomplete (%/% screens answered)',v_answered,v_total; end if;
  update private.ux_tour_sessions set status='completed',completed_at=now(),updated_at=now() where id=v_session.id;
  return jsonb_build_object('ok',true,'status','completed','screens_answered',v_answered,'screens_total',v_total);
end; $$;

create or replace function private.skip_ux_tour(p_session_id uuid,p_session_token uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_session private.ux_tour_sessions;
begin
  select * into v_session from private.ux_tour_sessions where id=p_session_id and session_token=p_session_token and status='active' for update;
  if not found then raise exception 'Invalid or inactive UX session'; end if;
  update private.ux_tour_sessions set status='skipped',skipped_at=now(),updated_at=now() where id=v_session.id;
  return jsonb_build_object('ok',true,'status','skipped');
end; $$;

create or replace function public.get_ux_tour_state(p_project_slug text default 'improve-world') returns jsonb language sql stable security invoker set search_path='' as $$ select private.get_ux_tour_state(p_project_slug); $$;
create or replace function public.start_ux_tour(p_project_slug text default 'improve-world',p_device_type text default null,p_viewport_width integer default null,p_viewport_height integer default null,p_language text default null) returns jsonb language sql volatile security invoker set search_path='' as $$ select private.start_ux_tour(p_project_slug,p_device_type,p_viewport_width,p_viewport_height,p_language); $$;
create or replace function public.start_ux_screen_test(p_session_id uuid,p_session_token uuid,p_screen_key text) returns jsonb language sql volatile security invoker set search_path='' as $$ select private.start_ux_screen_test(p_session_id,p_session_token,p_screen_key); $$;
create or replace function public.record_ux_event(p_session_id uuid,p_session_token uuid,p_screen_key text,p_event_type text,p_action_key text default null,p_target text default null,p_x numeric default null,p_y numeric default null,p_elapsed_ms integer default null) returns bigint language sql volatile security invoker set search_path='' as $$ select private.record_ux_event(p_session_id,p_session_token,p_screen_key,p_event_type,p_action_key,p_target,p_x,p_y,p_elapsed_ms); $$;
create or replace function public.submit_ux_screen_test(p_session_id uuid,p_session_token uuid,p_screen_key text,p_location_answer_key text,p_location_answer_text text default null,p_action_answer_keys text[] default '{}',p_action_answer_text text default null,p_confidence smallint default null,p_first_action_key text default null,p_first_action_target text default null,p_first_action_x numeric default null,p_first_action_y numeric default null,p_time_to_first_action_ms integer default null) returns jsonb language sql volatile security invoker set search_path='' as $$ select private.submit_ux_screen_test(p_session_id,p_session_token,p_screen_key,p_location_answer_key,p_location_answer_text,p_action_answer_keys,p_action_answer_text,p_confidence,p_first_action_key,p_first_action_target,p_first_action_x,p_first_action_y,p_time_to_first_action_ms); $$;
create or replace function public.complete_ux_guided_action(p_session_id uuid,p_session_token uuid,p_screen_key text,p_action_key text default null) returns jsonb language sql volatile security invoker set search_path='' as $$ select private.complete_ux_guided_action(p_session_id,p_session_token,p_screen_key,p_action_key); $$;
create or replace function public.complete_ux_tour(p_session_id uuid,p_session_token uuid) returns jsonb language sql volatile security invoker set search_path='' as $$ select private.complete_ux_tour(p_session_id,p_session_token); $$;
create or replace function public.skip_ux_tour(p_session_id uuid,p_session_token uuid) returns jsonb language sql volatile security invoker set search_path='' as $$ select private.skip_ux_tour(p_session_id,p_session_token); $$;

grant usage on schema private to anon,authenticated;
grant execute on function private.get_ux_tour_state(text) to anon,authenticated;
grant execute on function private.start_ux_tour(text,text,integer,integer,text) to anon,authenticated;
grant execute on function private.start_ux_screen_test(uuid,uuid,text) to anon,authenticated;
grant execute on function private.record_ux_event(uuid,uuid,text,text,text,text,numeric,numeric,integer) to anon,authenticated;
grant execute on function private.submit_ux_screen_test(uuid,uuid,text,text,text,text[],text,smallint,text,text,numeric,numeric,integer) to anon,authenticated;
grant execute on function private.complete_ux_guided_action(uuid,uuid,text,text) to anon,authenticated;
grant execute on function private.complete_ux_tour(uuid,uuid) to anon,authenticated;
grant execute on function private.skip_ux_tour(uuid,uuid) to anon,authenticated;
grant execute on function public.get_ux_tour_state(text) to anon,authenticated;
grant execute on function public.start_ux_tour(text,text,integer,integer,text) to anon,authenticated;
grant execute on function public.start_ux_screen_test(uuid,uuid,text) to anon,authenticated;
grant execute on function public.record_ux_event(uuid,uuid,text,text,text,text,numeric,numeric,integer) to anon,authenticated;
grant execute on function public.submit_ux_screen_test(uuid,uuid,text,text,text,text[],text,smallint,text,text,numeric,numeric,integer) to anon,authenticated;
grant execute on function public.complete_ux_guided_action(uuid,uuid,text,text) to anon,authenticated;
grant execute on function public.complete_ux_tour(uuid,uuid) to anon,authenticated;
grant execute on function public.skip_ux_tour(uuid,uuid) to anon,authenticated;
