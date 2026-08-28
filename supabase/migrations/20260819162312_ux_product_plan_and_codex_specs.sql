with p as (select id from public.projects where slug='improve-world')
insert into public.project_documents(project_id,slug,document_type,title,content_md,content_json,version,status)
select id,'ux-first-product-plan','roadmap','План разработки продукта: UX-first Improve World',
$$# UX-first Improve World

## Главный цикл
Запуск → 5 секунд чистого экрана → три вопроса → объяснение → реальное действие → следующий экран → задача → +1% → видимый результат → следующий шаг.

## Три вопроса каждого ключевого экрана
1. Где ты сейчас?
2. Что здесь можно сделать?
3. Куда бы ты нажал первым делом?

Третий ответ фиксируется реальным кликом/действием, а не только текстом.

## Первый запуск
- Активная версия тура определяется Supabase.
- Новый пользователь получает обзор примерно на 3–5 минут.
- Экскурсию можно пропустить мгновенно.
- Её можно повторить позже.
- При существенной новой версии интерфейса создаётся новая version тура / «Что нового».

## Последовательность
1. Improve World Hub.
2. Навигация между мирами.
3. Профиль и навыки.
4. Команды.
5. Доска задач.
6. Карточка задачи.
7. Ежедневный +1%.
8. Лента роста.
9. История авторства.
10. Игровой мир.

## Quality bar
- Где я? >= 85%.
- Что здесь делают? >= 80%.
- Главное действие выбрано первым >= 75%.
- Ошибочный первый клик <= 15%.
- Целевое медианное время поиска primary action <= 8 секунд.

Если экран не проходит порог, он становится кандидатом в UX backlog.

## Правило экрана
На каждом экране одно очевидное следующее действие. Кнопки выглядят как кнопки, ссылки как ссылки, кликабельные области большие, keyboard/focus обязательны, действие сразу даёт обратную связь.

## Защита игрового качества
UX-платформа не заменяет и не упрощает WebGL, сцены, управление, физические порталы, Realtime, постоянный мир и графику. Она добавляется поверх существующей системы.
$$,
jsonb_build_object('quality_bar',jsonb_build_object('location',85,'actions',80,'primary_action',75,'wrong_click_max',15,'median_ms',8000),'tour_version',1),2,'active'
from p
on conflict(project_id,slug) do update set content_md=excluded.content_md,content_json=excluded.content_json,version=excluded.version,status='active',updated_at=now();

with p as (select id from public.projects where slug='improve-world')
insert into public.project_documents(project_id,slug,document_type,title,content_md,content_json,version,status)
select id,'ux-backend-contract','architecture','UX Tour Backend Contract',
$$# UX Tour Backend Contract

Backend тестирования уже подготовлен в Supabase.

## RPC
- `get_ux_tour_state(project_slug)` — нужно ли запускать активный тур + безопасное описание экранов без ожидаемых ответов.
- `start_ux_tour(...)` — создаёт сессию, возвращает `session_id`, `session_token` и последовательность экранов.
- `start_ux_screen_test(session_id, token, screen_key)` — начинает 5-секундное наблюдение.
- `record_ux_event(...)` — пишет click/key/focus/guided_action.
- `submit_ux_screen_test(...)` — принимает три ответа и первый клик, считает серверные scores, после ответа возвращает объяснение и guided action.
- `complete_ux_guided_action(...)` — отмечает выполненное обучающее действие.
- `complete_ux_tour(...)` — завершает тур.
- `skip_ux_tour(...)` — мгновенный skip.
- `get_ux_metrics(project_slug)` — admin-only агрегаты понятности.

## Privacy/security
Сессии, ответы, координаты кликов и ожидаемые ответы находятся в schema `private`. Browser не читает private tables напрямую. Ожидаемые ответы не выдаются до submit.

## Active tour v1
10 экранов: hub, navigation, profile, teams, tasks, task_detail, daily_improvement, progress, authorship, world.
$$,
jsonb_build_object('schema','private','tour_version',1,'min_observation_ms',5000),1,'active'
from p
on conflict(project_id,slug) do update set content_md=excluded.content_md,content_json=excluded.content_json,version=excluded.version,status='active',updated_at=now();

with p as (select id from public.projects where slug='improve-world')
insert into public.feature_backlog(project_id,feature_key,area,title,description,acceptance_criteria,priority,status,source,depends_on,codex_ready)
select id,'UXTEST-001','platform','Первый запуск: 5-секундный UX-тест + интерактивная экскурсия',
'Подключить уже готовый Supabase UX backend к реальному интерфейсу. На каждом ключевом экране: 5 секунд без подсказок, три вопроса, реальный первый клик, объяснение и guided action. Tour можно skip/restart.',
'["тур автоматически предлагается на первом запуске активной версии","есть мгновенный Skip","5 секунд до появления вопросов","ровно три основных вопроса","третий ответ фиксируется реальным кликом","после submit показывается объяснение и guided action","ответы сохраняются через готовые RPC","повторный запуск доступен из Help","ожидаемые ответы не захардкожены во frontend"]'::jsonb,
1,'planned','conversation',array['NAV-001']::text[],true
from p
on conflict(project_id,feature_key) do update set area=excluded.area,title=excluded.title,description=excluded.description,acceptance_criteria=excluded.acceptance_criteria,priority=excluded.priority,status=case when public.feature_backlog.status='done' then 'done' else 'planned' end,depends_on=excluded.depends_on,codex_ready=true,updated_at=now();

with p as (select id from public.projects where slug='improve-world')
insert into public.feature_backlog(project_id,feature_key,area,title,description,acceptance_criteria,priority,status,source,depends_on,codex_ready)
select id,'UXMETRIC-001','platform','UX Dashboard: понятность каждого экрана',
'Admin-интерфейс поверх get_ux_metrics: location recognition, action recognition, primary action discovery, wrong click, median time, guided completion и quality status.',
'["admin видит все метрики по экрану","пороговые значения видны рядом","collecting_data отличается от needs_improvement","экраны ниже quality bar заметно выделены","нет доступа у обычного пользователя"]'::jsonb,
2,'planned','conversation',array['UXTEST-001']::text[],true
from p
on conflict(project_id,feature_key) do update set description=excluded.description,acceptance_criteria=excluded.acceptance_criteria,priority=excluded.priority,depends_on=excluded.depends_on,codex_ready=true,updated_at=now();

with p as (select id from public.projects where slug='improve-world')
insert into public.feature_backlog(project_id,feature_key,area,title,description,acceptance_criteria,priority,status,source,depends_on,codex_ready)
select id,'PROFILE-001','community','Профиль участника и навыки',
'Экран профиля для display name, bio и skills. Навыки используются onboarding-рекомендациями.',
'["навыки выбираются понятными chips","профиль сохраняется в profiles","данные сразу используются get_onboarding_tasks","есть UX data-ux-id для тура","keyboard/mobile доступны"]'::jsonb,
2,'planned','conversation',array['UXTEST-001']::text[],true
from p
on conflict(project_id,feature_key) do update set description=excluded.description,acceptance_criteria=excluded.acceptance_criteria,priority=excluded.priority,depends_on=excluded.depends_on,codex_ready=true,updated_at=now();

with p as (select id from public.projects where slug='improve-world')
update public.feature_backlog fb set
  depends_on=case fb.feature_key
    when 'HUB-001' then array['NAV-001']::text[]
    when 'IMPROVE-001' then array['HUB-001','PROFILE-001']::text[]
    when 'TASKS-001' then array['HUB-001']::text[]
    when 'ONBOARD-001' then array['PROFILE-001','TASKS-001']::text[]
    when 'PROGRESS-001' then array['IMPROVE-001']::text[]
    when 'TEAM-001' then array['HUB-001']::text[]
    when 'AUTHOR-001' then array['PROGRESS-001']::text[]
    else fb.depends_on end,
  codex_ready=case when fb.feature_key in ('HUB-001','IMPROVE-001','TASKS-001','ONBOARD-001','PROGRESS-001','TEAM-001','AUTHOR-001') then true else fb.codex_ready end,
  updated_at=now()
from p where fb.project_id=p.id and fb.feature_key in ('HUB-001','IMPROVE-001','TASKS-001','ONBOARD-001','PROGRESS-001','TEAM-001','AUTHOR-001');

with p as (select id from public.projects where slug='improve-world')
insert into public.feature_specs(project_id,feature_key,objective,implementation_plan,target_files,preserve_requirements,api_contract,data_contract,ux_contract,tests,verification_commands,completion_definition,codex_instruction,spec_status)
select id,'UXTEST-001',
'Сделать UX-тест и обзор встроенной частью первого запуска и каждого ключевого экрана Improve World.',
'[{"step":1,"action":"Создать reusable tour engine apps/improve-world/tour.js поверх готовых Supabase RPC."},{"step":2,"action":"На первом запуске вызвать get_ux_tour_state и предложить Начать обзор / Пропустить."},{"step":3,"action":"Для каждого screen_key запустить start_ux_screen_test, скрыть подсказки на 5 секунд, затем показать 3 вопроса."},{"step":4,"action":"Третий вопрос реализовать capture mode: следующий реальный click/keyboard activation по [data-ux-id] становится first_action_key."},{"step":5,"action":"После submit показать returned explanation_md и подсветить primary_action_selector."},{"step":6,"action":"После guided action вызвать complete_ux_guided_action и перейти к следующему screen."},{"step":7,"action":"Skip вызывает skip_ux_tour; Help → Повторить обзор запускает новый session."},{"step":8,"action":"Не хранить expected answers во frontend."}]'::jsonb,
'["apps/improve-world/index.html","apps/improve-world/client.js","apps/improve-world/tour.js","apps/improve-world/style.css","apps/catalog/client.js","apps/catalog/index.html"]'::jsonb,
'["не ломать AppCore/auth/chat","не трогать WebGL и игровую механику кроме data-ux-id/доступной навигации","не переносить private UX data во frontend","skip всегда доступен","не блокировать обычное использование после skip"]'::jsonb,
jsonb_build_object('rpc',jsonb_build_array('get_ux_tour_state','start_ux_tour','start_ux_screen_test','record_ux_event','submit_ux_screen_test','complete_ux_guided_action','complete_ux_tour','skip_ux_tour','get_ux_metrics')),
jsonb_build_object('private_tables',jsonb_build_array('private.ux_tour_versions','private.ux_tour_screens','private.ux_tour_screen_expectations','private.ux_tour_sessions','private.ux_screen_tests','private.ux_interaction_events'),'active_version',1),
jsonb_build_object('pattern','5 seconds -> 3 questions -> explanation -> guided real action -> next screen','skip',true,'restart',true,'questions',jsonb_build_array('Где ты сейчас?','Что здесь можно сделать?','Куда бы ты нажал первым делом?')),
'["first visit starts tour offer","questions appear only after observation period","click capture records data-ux-id and target","reload/skip does not corrupt app","keyboard Enter/Space counts as action","tour completion stored server-side for authenticated user","no expected answer appears in browser network payload before submit"]'::jsonb,
array['npm run check']::text[],
'Новый пользователь получает измеряемую интерактивную экскурсию по 10 функциям; команда получает серверные данные о понятности каждого экрана.',
'Backend UX tour уже полностью создан в Supabase. Не создавай новые UX tables. Используй существующие RPC. Реализуй только browser integration и безопасные data-ux-id hooks.',
'ready'
from p
on conflict(project_id,feature_key) do update set objective=excluded.objective,implementation_plan=excluded.implementation_plan,target_files=excluded.target_files,preserve_requirements=excluded.preserve_requirements,api_contract=excluded.api_contract,data_contract=excluded.data_contract,ux_contract=excluded.ux_contract,tests=excluded.tests,verification_commands=excluded.verification_commands,completion_definition=excluded.completion_definition,codex_instruction=excluded.codex_instruction,spec_status='ready',updated_at=now();

with p as (select id from public.projects where slug='improve-world')
insert into public.feature_specs(project_id,feature_key,objective,implementation_plan,target_files,preserve_requirements,api_contract,data_contract,ux_contract,tests,verification_commands,completion_definition,codex_instruction,spec_status)
select id,'UXMETRIC-001',
'Дать владельцу продукта прямую картину, какие экраны понятны, а какие нужно переделывать.',
'[{"step":1,"action":"Добавить admin UX section в Improve World."},{"step":2,"action":"Вызвать get_ux_metrics только для owner/admin."},{"step":3,"action":"Отрисовать quality bar и экранные метрики."},{"step":4,"action":"Красным/явно выделить needs_improvement; collecting_data показать нейтрально."}]'::jsonb,
'["apps/improve-world/client.js","apps/improve-world/style.css"]'::jsonb,
'["не показывать raw click coordinates обычным пользователям","не давать admin control без роли"]'::jsonb,
jsonb_build_object('rpc','get_ux_metrics'),jsonb_build_object('quality_bar',jsonb_build_object('location',85,'actions',80,'primary',75,'wrong_click_max',15,'median_ms',8000)),
jsonb_build_object('admin_only',true),
'["owner sees metrics","member gets permission error or no admin section","threshold state matches RPC quality_status"]'::jsonb,
array['npm run check']::text[],'Admin видит измеримую понятность каждого ключевого экрана и может принимать решение на данных.','Используй готовый get_ux_metrics; backend не переписывать.','ready'
from p
on conflict(project_id,feature_key) do update set objective=excluded.objective,implementation_plan=excluded.implementation_plan,target_files=excluded.target_files,preserve_requirements=excluded.preserve_requirements,api_contract=excluded.api_contract,data_contract=excluded.data_contract,ux_contract=excluded.ux_contract,tests=excluded.tests,verification_commands=excluded.verification_commands,completion_definition=excluded.completion_definition,codex_instruction=excluded.codex_instruction,spec_status='ready',updated_at=now();
