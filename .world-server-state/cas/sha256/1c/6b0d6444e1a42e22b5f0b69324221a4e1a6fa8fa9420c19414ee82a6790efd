create or replace function private.get_ux_metrics(p_project_slug text)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare
  v_project_id uuid;
  v_version_id uuid;
  v_version integer;
  v_rows jsonb;
  v_sessions integer;
  v_completed integer;
  v_skipped integer;
begin
  select id into v_project_id from public.projects where slug=p_project_slug;
  if v_project_id is null then raise exception 'Project not found'; end if;
  if not private.can_manage_project(v_project_id) then raise exception 'Project admin required'; end if;

  select id,version into v_version_id,v_version from private.ux_tour_versions
  where project_id=v_project_id and status='active' order by version desc limit 1;
  if v_version_id is null then return jsonb_build_object('project_slug',p_project_slug,'screens','[]'::jsonb); end if;

  select count(*),count(*) filter (where status='completed'),count(*) filter (where status='skipped')
  into v_sessions,v_completed,v_skipped
  from private.ux_tour_sessions where tour_version_id=v_version_id;

  select coalesce(jsonb_agg(to_jsonb(q) order by q.sort_order),'[]'::jsonb) into v_rows
  from (
    select s.screen_key,s.title,s.route,s.sort_order,
      count(t.id) filter (where t.answered_at is not null)::integer attempts,
      round(100*(avg(t.location_score) filter (where t.answered_at is not null)),1) location_accuracy_pct,
      round(100*(avg(t.action_score) filter (where t.answered_at is not null)),1) action_recognition_pct,
      round(100*(avg(case when t.primary_action_correct then 1 else 0 end) filter (where t.answered_at is not null)),1) primary_action_discovery_pct,
      round(100*(1-(avg(case when t.primary_action_correct then 1 else 0 end) filter (where t.answered_at is not null))),1) wrong_first_click_pct,
      round((percentile_cont(0.5) within group(order by t.time_to_first_action_ms) filter (where t.time_to_first_action_ms is not null))::numeric,0)::integer median_first_action_ms,
      round(100*(avg(case when t.min_observation_met then 1 else 0 end) filter (where t.answered_at is not null)),1) observation_compliance_pct,
      round(100*(avg(case when t.guided_action_completed_at is not null then 1 else 0 end) filter (where t.answered_at is not null)),1) guided_completion_pct,
      case
        when count(t.id) filter (where t.answered_at is not null) < 5 then 'collecting_data'
        when coalesce(avg(t.location_score) filter (where t.answered_at is not null),0) < .85
          or coalesce(avg(t.action_score) filter (where t.answered_at is not null),0) < .80
          or coalesce(avg(case when t.primary_action_correct then 1 else 0 end) filter (where t.answered_at is not null),0) < .75 then 'needs_improvement'
        else 'healthy'
      end quality_status
    from private.ux_tour_screens s
    left join private.ux_screen_tests t on t.screen_id=s.id
    where s.tour_version_id=v_version_id and s.active=true
    group by s.id,s.screen_key,s.title,s.route,s.sort_order
  ) q;

  return jsonb_build_object(
    'project_slug',p_project_slug,
    'tour_version',v_version,
    'quality_bar',jsonb_build_object(
      'location_accuracy_pct',85,
      'action_recognition_pct',80,
      'primary_action_discovery_pct',75,
      'wrong_first_click_pct_max',15,
      'median_first_action_ms_target',8000
    ),
    'sessions',jsonb_build_object('total',v_sessions,'completed',v_completed,'skipped',v_skipped),
    'screens',v_rows
  );
end; $$;

create or replace function public.get_ux_metrics(p_project_slug text default 'improve-world')
returns jsonb language sql stable security invoker set search_path='' as $$ select private.get_ux_metrics(p_project_slug); $$;
grant execute on function private.get_ux_metrics(text) to authenticated;
grant execute on function public.get_ux_metrics(text) to authenticated;

with p as (select id from public.projects where slug='improve-world')
insert into private.ux_tour_versions(project_id,version,name,status,min_observation_ms)
select id,1,'Improve World — первый обзор и тест понятности','active',5000 from p
on conflict(project_id,version) do update set name=excluded.name,status='active',min_observation_ms=5000,updated_at=now();

insert into private.ux_tour_screens(tour_version_id,screen_key,title,route,sort_order,location_options,action_options,explanation_md,guided_action_instruction,primary_action_selector)
select v.id,x.screen_key,x.title,x.route,x.sort_order,x.location_options::jsonb,x.action_options::jsonb,x.explanation_md,x.guided_action_instruction,x.primary_action_selector
from private.ux_tour_versions v join public.projects p on p.id=v.project_id
cross join (values
('hub','Главная Improve World','/apps/improve-world/',1,
 '[{"key":"hub","label":"Главная Improve World"},{"key":"tasks","label":"Доска задач"},{"key":"world","label":"Игровой мир"},{"key":"unsure","label":"Не уверен"}]',
 '[{"key":"next_step","label":"Продолжить следующий шаг"},{"key":"see_progress","label":"Посмотреть прогресс"},{"key":"join_project","label":"Вступить в проект"},{"key":"open_world","label":"Перейти в мир"}]',
 'Это центр Improve World. Здесь видны смысл проекта, состояние команды, рост мира и самое важное — твой следующий шаг.',
 'Нажми на самый заметный блок «Мой следующий шаг».','[data-ux-id="next-step"]'),
('navigation','Навигация между мирами','/apps/catalog/',2,
 '[{"key":"catalog","label":"3D Каталог / хаб миров"},{"key":"hub","label":"Главная Improve World"},{"key":"chat","label":"Чат"},{"key":"unsure","label":"Не уверен"}]',
 '[{"key":"open_app","label":"Перейти в другой мир или приложение"},{"key":"move_3d","label":"Исследовать 3D-хаб"},{"key":"chat","label":"Открыть глобальный чат"}]',
 'Каталог — 3D-хаб. В мир можно войти физически через портал или открыть его обычной ссылкой справа.',
 'Выбери один портал в списке справа.','[data-ux-id="portal-link"]'),
('profile','Профиль и навыки','/apps/improve-world/#profile',3,
 '[{"key":"profile","label":"Профиль участника"},{"key":"teams","label":"Команды"},{"key":"tasks","label":"Задачи"},{"key":"unsure","label":"Не уверен"}]',
 '[{"key":"edit_skills","label":"Указать навыки и интересы"},{"key":"edit_name","label":"Изменить данные профиля"},{"key":"find_tasks","label":"Получить подходящие задачи"}]',
 'Профиль помогает системе подбирать задачи, которые подходят по навыкам и времени.',
 'Выбери хотя бы один навык и сохрани профиль.','[data-ux-id="save-profile"]'),
('teams','Команды','/apps/improve-world/#teams',4,
 '[{"key":"teams","label":"Команды проекта"},{"key":"profile","label":"Профиль"},{"key":"progress","label":"Лента прогресса"},{"key":"unsure","label":"Не уверен"}]',
 '[{"key":"see_teams","label":"Посмотреть направления и участников"},{"key":"see_team_tasks","label":"Посмотреть задачи команды"},{"key":"see_leads","label":"Увидеть лидов"}]',
 'Команды отвечают за области мира. У каждой есть цель, участники, лид и открытые задачи.',
 'Открой команду, которая тебе ближе всего.','[data-ux-id="team-card"]'),
('tasks','Доска задач','/apps/improve-world/#tasks',5,
 '[{"key":"tasks","label":"Доска задач"},{"key":"teams","label":"Команды"},{"key":"progress","label":"Лента прогресса"},{"key":"unsure","label":"Не уверен"}]',
 '[{"key":"claim_task","label":"Взять задачу"},{"key":"filter_tasks","label":"Отфильтровать задачи"},{"key":"open_task","label":"Открыть карточку задачи"}]',
 'Доска показывает маленькие законченные улучшения. Задачи проходят путь: можно взять → в работе → на проверке → готово.',
 'Открой задачу, которая выглядит подходящей.','[data-ux-id="task-card"]'),
('task_detail','Карточка задачи','/apps/improve-world/#task-detail',6,
 '[{"key":"task_detail","label":"Карточка конкретной задачи"},{"key":"tasks","label":"Доска задач"},{"key":"profile","label":"Профиль"},{"key":"unsure","label":"Не уверен"}]',
 '[{"key":"claim_task","label":"Взять задачу"},{"key":"read_acceptance","label":"Проверить критерии готовности"},{"key":"see_hours","label":"Понять оценку времени"}]',
 'Карточка задачи объясняет конкретный законченный результат: что сделать, сколько это займёт и как понять, что задача готова.',
 'Нажми «Взять задачу».','[data-ux-id="claim-task"]'),
('daily_improvement','Мой +1%','/apps/improve-world/#improvement',7,
 '[{"key":"improvement","label":"Форма ежедневного улучшения +1%"},{"key":"task_detail","label":"Карточка задачи"},{"key":"progress","label":"Лента прогресса"},{"key":"unsure","label":"Не уверен"}]',
 '[{"key":"submit_improvement","label":"Опубликовать сделанное улучшение"},{"key":"link_task","label":"Связать улучшение с задачей"},{"key":"add_proof","label":"Добавить результат / доказательство"}]',
 'Здесь фиксируется законченный вклад: что создано, почему мир стал лучше, результат и следующий логичный шаг.',
 'Заполни тестовый черновик и найди кнопку «Добавить мой +1%».','[data-ux-id="submit-improvement"]'),
('progress','Лента роста мира','/apps/improve-world/#progress',8,
 '[{"key":"progress","label":"Лента роста мира"},{"key":"tasks","label":"Доска задач"},{"key":"teams","label":"Команды"},{"key":"unsure","label":"Не уверен"}]',
 '[{"key":"see_improvements","label":"Посмотреть, что изменилось"},{"key":"see_authors","label":"Увидеть авторов"},{"key":"open_source_task","label":"Перейти к исходной задаче"}]',
 'Лента показывает историю развития: кто что улучшил, почему это важно и с какой задачей связан вклад.',
 'Открой одно улучшение и посмотри его автора и связанную задачу.','[data-ux-id="improvement-card"]'),
('authorship','Авторство объекта','/apps/improve-world/#authorship',9,
 '[{"key":"authorship","label":"История авторства объекта"},{"key":"progress","label":"Лента прогресса"},{"key":"world","label":"Игровой мир"},{"key":"unsure","label":"Не уверен"}]',
 '[{"key":"see_author","label":"Узнать автора"},{"key":"see_revisions","label":"Посмотреть историю изменений"},{"key":"open_task","label":"Перейти к связанной задаче"}]',
 'Значимые части мира имеют автора и историю. Это позволяет видеть реальный след каждого соавтора.',
 'Открой историю версий объекта.','[data-ux-id="entity-history"]'),
('world','Игровой мир','/apps/survival/',10,
 '[{"key":"world","label":"Игровой мир / Выживач"},{"key":"catalog","label":"3D Каталог"},{"key":"hub","label":"Главная Improve World"},{"key":"unsure","label":"Не уверен"}]',
 '[{"key":"play","label":"Играть и исследовать мир"},{"key":"build","label":"Строить и менять мир"},{"key":"return_hub","label":"Вернуться в Improve World"}]',
 'Это уже сам живой мир. Сделанные участниками изменения должны постепенно становиться здесь видимыми и сохранять авторство.',
 'Сделай одно безопасное игровое действие или вернись в Improve World через навигацию.','[data-ux-id="world-primary-action"]')
) as x(screen_key,title,route,sort_order,location_options,action_options,explanation_md,guided_action_instruction,primary_action_selector)
where p.slug='improve-world' and v.version=1
on conflict(tour_version_id,screen_key) do update set
 title=excluded.title,route=excluded.route,sort_order=excluded.sort_order,location_options=excluded.location_options,action_options=excluded.action_options,
 explanation_md=excluded.explanation_md,guided_action_instruction=excluded.guided_action_instruction,primary_action_selector=excluded.primary_action_selector,active=true,updated_at=now();

insert into private.ux_tour_screen_expectations(screen_id,expected_location_key,expected_action_keys,expected_primary_action_key)
select s.id,x.location_key,x.action_keys,x.primary_key
from private.ux_tour_screens s
join private.ux_tour_versions v on v.id=s.tour_version_id
join public.projects p on p.id=v.project_id
join (values
 ('hub','hub',array['next_step','see_progress']::text[],'next_step'),
 ('navigation','catalog',array['open_app','move_3d']::text[],'open_app'),
 ('profile','profile',array['edit_skills','find_tasks']::text[],'edit_skills'),
 ('teams','teams',array['see_teams','see_team_tasks']::text[],'see_teams'),
 ('tasks','tasks',array['claim_task','open_task']::text[],'open_task'),
 ('task_detail','task_detail',array['claim_task','read_acceptance']::text[],'claim_task'),
 ('daily_improvement','improvement',array['submit_improvement','link_task','add_proof']::text[],'submit_improvement'),
 ('progress','progress',array['see_improvements','see_authors']::text[],'see_improvements'),
 ('authorship','authorship',array['see_author','see_revisions']::text[],'see_revisions'),
 ('world','world',array['play','build']::text[],'play')
) x(screen_key,location_key,action_keys,primary_key) on x.screen_key=s.screen_key
where p.slug='improve-world' and v.version=1
on conflict(screen_id) do update set expected_location_key=excluded.expected_location_key,expected_action_keys=excluded.expected_action_keys,expected_primary_action_key=excluded.expected_primary_action_key;

update public.repository_context rc
set app_routes=rc.app_routes || jsonb_build_object('improve_world','/apps/improve-world/'),updated_at=now()
from public.projects p where p.id=rc.project_id and p.slug='improve-world';
