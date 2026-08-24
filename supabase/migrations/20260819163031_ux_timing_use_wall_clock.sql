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
  v_elapsed_ms:=floor(extract(epoch from (clock_timestamp()-v_test.started_at))*1000)::integer;
  v_min_met:=v_elapsed_ms>=greatest(1000,v_min_ms-250);
  v_location_score:=case when p_location_answer_key=v_expect.expected_location_key then 1 else 0 end;
  select count(*) into v_expected_count from (select distinct x from unnest(v_expect.expected_action_keys) x) q;
  select count(*) into v_selected_count from (select distinct x from unnest(coalesce(p_action_answer_keys,'{}'::text[])) x) q;
  select count(*) into v_match_count from (select distinct x from unnest(v_expect.expected_action_keys) x) e where e.x=any(coalesce(p_action_answer_keys,'{}'::text[]));
  v_action_score:=case when greatest(v_expected_count,v_selected_count)=0 then 1 else v_match_count::numeric/greatest(v_expected_count,v_selected_count) end;
  v_primary_correct:=p_first_action_key=v_expect.expected_primary_action_key;
  update private.ux_screen_tests set answered_at=clock_timestamp(),location_answer_key=nullif(trim(p_location_answer_key),''),location_answer_text=left(nullif(trim(p_location_answer_text),''),1000),
    action_answer_keys=coalesce(p_action_answer_keys,'{}'::text[]),action_answer_text=left(nullif(trim(p_action_answer_text),''),1500),confidence=p_confidence,
    first_action_key=nullif(trim(p_first_action_key),''),first_action_target=left(nullif(trim(p_first_action_target),''),500),first_action_x=p_first_action_x,first_action_y=p_first_action_y,
    time_to_first_action_ms=p_time_to_first_action_ms,min_observation_met=v_min_met,location_score=v_location_score,action_score=v_action_score,
    primary_action_correct=v_primary_correct,updated_at=clock_timestamp() where id=v_test.id;
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
  update private.ux_screen_tests set guided_action_completed_at=coalesce(guided_action_completed_at,clock_timestamp()),updated_at=clock_timestamp() where id=v_test.id;
  insert into private.ux_interaction_events(session_id,screen_id,event_type,action_key,target,elapsed_ms)
  values(v_session.id,v_screen.id,'guided_action',nullif(trim(p_action_key),''),'guided_action_completed',floor(extract(epoch from (clock_timestamp()-v_test.started_at))*1000)::integer);
  update private.ux_tour_sessions set last_screen_key=p_screen_key,updated_at=clock_timestamp() where id=v_session.id;
  return jsonb_build_object('ok',true,'screen_key',p_screen_key);
end; $$;
