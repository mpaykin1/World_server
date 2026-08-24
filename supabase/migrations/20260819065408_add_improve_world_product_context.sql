-- Canonical product context for Improve World / World_server.

create table if not exists public.project_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  slug text not null,
  document_type text not null check (document_type in ('vision','operations','architecture','roadmap','codex','design')),
  title text not null,
  content_md text not null,
  content_json jsonb not null default '{}'::jsonb,
  version integer not null default 1 check (version > 0),
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, slug)
);

create table if not exists public.project_principles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  key text not null,
  statement text not null,
  details text,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, key)
);

create table if not exists public.feature_backlog (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  feature_key text not null,
  area text not null,
  title text not null,
  description text not null,
  acceptance_criteria jsonb not null default '[]'::jsonb,
  priority smallint not null default 3 check (priority between 1 and 5),
  status text not null default 'idea' check (status in ('idea','planned','in_progress','review','done')),
  source text not null default 'conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, feature_key)
);

create index if not exists project_documents_project_id_idx on public.project_documents(project_id);
create index if not exists project_principles_project_id_sort_idx on public.project_principles(project_id, sort_order);
create index if not exists feature_backlog_project_status_priority_idx on public.feature_backlog(project_id, status, priority);

create or replace trigger project_documents_set_updated_at
before update on public.project_documents
for each row execute function public.set_updated_at();

create or replace trigger project_principles_set_updated_at
before update on public.project_principles
for each row execute function public.set_updated_at();

create or replace trigger feature_backlog_set_updated_at
before update on public.feature_backlog
for each row execute function public.set_updated_at();

alter table public.project_documents enable row level security;
alter table public.project_principles enable row level security;
alter table public.feature_backlog enable row level security;

create policy "project_documents_read_visible_project"
on public.project_documents for select
to anon, authenticated
using (public.is_project_public(project_id) or public.is_project_member(project_id));

create policy "project_documents_manage_admin"
on public.project_documents for all
to authenticated
using (public.can_manage_project(project_id))
with check (public.can_manage_project(project_id));

create policy "project_principles_read_visible_project"
on public.project_principles for select
to anon, authenticated
using (public.is_project_public(project_id) or public.is_project_member(project_id));

create policy "project_principles_manage_admin"
on public.project_principles for all
to authenticated
using (public.can_manage_project(project_id))
with check (public.can_manage_project(project_id));

create policy "feature_backlog_read_visible_project"
on public.feature_backlog for select
to anon, authenticated
using (public.is_project_public(project_id) or public.is_project_member(project_id));

create policy "feature_backlog_insert_member"
on public.feature_backlog for insert
to authenticated
with check (public.is_project_member(project_id));

create policy "feature_backlog_update_member"
on public.feature_backlog for update
to authenticated
using (public.is_project_member(project_id))
with check (public.is_project_member(project_id));

create policy "feature_backlog_delete_admin"
on public.feature_backlog for delete
to authenticated
using (public.can_manage_project(project_id));

grant select on public.project_documents, public.project_principles, public.feature_backlog to anon, authenticated;
grant insert, update, delete on public.project_documents, public.project_principles, public.feature_backlog to authenticated;

-- Create the canonical Improve World project for the registered founder account.
insert into public.projects(name, slug, description, vision, visibility, created_by)
select
  'Improve World',
  'improve-world',
  'Живой цифровой мир, который большая команда улучшает каждый день небольшими законченными вкладом.',
  'Создавать живой мир и набор взаимосвязанных приложений, где люди становятся соавторами, каждый вклад имеет автора и историю, а проект ежедневно становится лучше.',
  'public',
  p.id
from public.profiles p
where p.username = 'mpaykin'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  vision = excluded.vision,
  visibility = excluded.visibility,
  updated_at = now();

-- Product principles.
insert into public.project_principles(project_id, key, statement, details, sort_order)
select pr.id, v.key, v.statement, v.details, v.sort_order
from public.projects pr
cross join (values
  ('daily_one_percent', 'Каждый участник каждый день делает одно законченное улучшение мира.', 'Маленький завершённый вклад должен быть виден, иметь автора, результат и следующий возможный шаг.', 10),
  ('coauthors_not_hands', 'Участники — соавторы, а не безымянные исполнители.', 'Хорошие идеи могут приходить от любой роли и становиться частью проекта.', 20),
  ('visible_progress', 'Прогресс должен быть виден каждый день.', 'Демо, лента изменений, история объектов и вкладов показывают, как мир растёт.', 30),
  ('clear_first_task', 'У нового участника всегда есть понятное первое задание.', 'Первая задача небольшая, законченная и выполнима за несколько часов.', 40),
  ('preserve_quality', 'Готовую графику, WebGL-сцены, управление и игровые механики нельзя ломать или упрощать.', 'Изменения должны сохранять существующее качество и по возможности улучшать свет, детали, движение, звук и надёжность.', 50),
  ('persistent_world', 'Постоянные данные живут в Supabase, а не в локальных JSON-файлах или временной файловой системе.', 'Аккаунты, мир, чат, объекты, прогресс, задачи и история вкладов должны переживать деплои и перезапуски.', 60),
  ('scalable_architecture', 'Выбирается решение, которое масштабируется и требует минимум ручных действий.', 'Vercel отвечает за доставку и stateless API, Supabase — за Auth/Postgres/Realtime/Storage, GitHub — за код и историю изменений.', 70),
  ('direction_and_leads', 'Основатель держит общее направление, лидеры ведут области, специалисты владеют конкретными задачами.', 'Команда должна расти без необходимости вручную координировать каждый небольшой шаг.', 80),
  ('accessible_navigation', 'Основные действия интерфейса должны быть настоящими интерактивными элементами.', 'Ссылки — через href, кнопки — через button; всё должно работать мышью и клавиатурой.', 90)
) as v(key, statement, details, sort_order)
where pr.slug = 'improve-world'
on conflict (project_id, key) do update set
  statement = excluded.statement,
  details = excluded.details,
  sort_order = excluded.sort_order,
  updated_at = now();

-- Canonical documents.
insert into public.project_documents(project_id, slug, document_type, title, content_md, content_json)
select pr.id, d.slug, d.document_type, d.title, d.content_md, d.content_json
from public.projects pr
cross join (values
  (
    'vision-manifesto', 'vision', 'Видение и манифест',
    $md$# Improve World — живой мир

Мы создаём живой цифровой мир и набор связанных пространств, которые каждый день становятся лучше благодаря людям.

## Смысл
- Создавать проекты, которые люди помнят и в которые хотят возвращаться.
- Давать художникам, разработчикам, аниматорам, дизайнерам, инженерам, сценаристам, звукорежиссёрам, продюсерам и другим специалистам пространство для настоящего соавторства.
- Каждый объект, механика, сцена, задача и улучшение могут иметь автора и историю изменений.
- Лучшие идеи становятся частью мира независимо от должности автора.

## Главный ритм
Каждый участник делает одно законченное улучшение — условный «+1%» — и фиксирует:
1. что создано;
2. почему это улучшает мир;
3. что логично делать следующим.

Мир растёт как результат тысяч маленьких, видимых, качественных вкладов.$md$,
    '{"audience":["contributors","leaders","founder"],"core_loop":"one_finished_improvement_per_person_per_day"}'::jsonb
  ),
  (
    'operating-model', 'operations', 'Как организована работа команды',
    $md$# Операционная модель

## Роли
Основатель удерживает общее видение и направление. Лидеры направлений отвечают за свои области. Участники выбирают специализацию и получают конкретные законченные задачи.

Направления: код, графика, анимация, звук, дизайн, сценарий, AI, инженерия, продюсирование, маркетинг и сообщество.

## Первый день
Новый участник получает задачу на 2–4 часа, которая реально становится частью проекта:
- художник — законченный объект окружения;
- программист — одна механика;
- аниматор — одна живая анимация;
- звук — вариативный набор звуков;
- UI/UX — один законченный экран;
- сценарист — короткий диалог или событие.

## Ритм команды
- понятный backlog;
- короткие итерации;
- регулярные демо;
- видимая лента вкладов;
- предложения идей доступны всем;
- принятые изменения связываются с автором и задачей.$md$,
    '{"first_task_hours":[2,4],"cadence":"continuous_daily_progress_with_regular_demos"}'::jsonb
  ),
  (
    'technical-architecture', 'architecture', 'Техническая архитектура',
    $md$# Архитектура

## Платформы
- GitHub `mpaykin1/World_server` — исходный код и история изменений.
- Vercel `world-server` — production/preview deployment и stateless API.
- Supabase `Improve world Project` — Postgres, Auth, Realtime и постоянные данные.

## Правила
- Не полагаться на постоянную локальную файловую систему Vercel.
- Не хранить постоянные данные в `data/*.json`.
- Секреты только через environment variables.
- Сохранять существующие URL и API, где возможно.
- Realtime и multiplayer должны использовать архитектуру, совместимую с Vercel/Supabase.
- Сохранять `catalog`, `chat`, `survival`, `world-sharabass`, `shared` и существующие WebGL-сцены.
- Изменения должны проходить проверки до слияния в `master`.$md$,
    '{"frontend_host":"Vercel","backend_data":"Supabase","repository":"mpaykin1/World_server","production_branch":"master"}'::jsonb
  ),
  (
    'product-roadmap', 'roadmap', 'Продуктовая дорожная карта',
    $md$# Дорожная карта

Первый слой продукта — уже работающий общий мир и игры. Следующий слой превращает его в платформу совместного создания.

## Нужно построить
1. Профили участников и навыки.
2. Проекты/миры и публичное видение.
3. Команды и роли.
4. Backlog задач с назначением исполнителя.
5. Ежедневные улучшения «+1%» с доказательством результата.
6. Ленту прогресса мира.
7. Историю авторства объектов и изменений.
8. Публичные страницы вкладов.
9. Простой onboarding нового участника.
10. Кликабельную навигацию между приложениями и мирами.
11. Метрики: активные участники, принятые улучшения, вклад по областям, прогресс по дням.

Приоритет — сначала полностью рабочий вертикальный путь: зарегистрироваться → войти → выбрать задачу → сделать вклад → увидеть его в мире и в истории.$md$,
    '{"north_star_flow":["register","join_project","choose_task","submit_improvement","see_result_in_world","see_authorship_history"]}'::jsonb
  ),
  (
    'codex-context', 'codex', 'Обязательные правила для Codex',
    $md$# Контекст для Codex

Перед любым изменением прочитай этот контекст, `project_principles` и открытые элементы `feature_backlog` для проекта `improve-world`.

## Обязательно
- Не удалять и не упрощать готовую графику, WebGL, игровые механики и управление.
- Улучшать без регрессий.
- Постоянные данные хранить в Supabase.
- Vercel считать stateless средой.
- Не хардкодить секреты.
- При изменении API одновременно обновлять всех клиентов.
- Навигация должна быть кликабельной и доступной с клавиатуры.
- Перед PR запускать доступные тесты и проверки.
- Делать законченную реализацию, а не демонстрационный stub.
- Для новых функций использовать существующие `projects`, `teams`, `tasks`, `daily_improvements`, `feature_backlog` и `project_documents` вместо параллельных несовместимых систем.$md$,
    '{"source_of_truth_tables":["projects","project_members","teams","team_members","tasks","daily_improvements","project_documents","project_principles","feature_backlog"]}'::jsonb
  )
) as d(slug, document_type, title, content_md, content_json)
where pr.slug = 'improve-world'
on conflict (project_id, slug) do update set
  document_type = excluded.document_type,
  title = excluded.title,
  content_md = excluded.content_md,
  content_json = excluded.content_json,
  version = public.project_documents.version + 1,
  status = 'active',
  updated_at = now();

-- Structured backlog from the product discussion.
insert into public.feature_backlog(project_id, feature_key, area, title, description, acceptance_criteria, priority, status)
select pr.id, f.feature_key, f.area, f.title, f.description, f.acceptance_criteria, f.priority, f.status
from public.projects pr
cross join (values
  ('NAV-001','catalog','Сделать список порталов кликабельным','Пункты справа в каталоге должны быть настоящими ссылками на приложения.', '["Выживач ведёт на /apps/survival/","Глобальный чат ведёт на /apps/chat/","Мир Шарабасс ведёт на /apps/world-sharabass/","используются обычные ссылки href","есть hover/focus состояния","работает клавиатурная навигация"]'::jsonb, 1, 'planned'),
  ('HUB-001','platform','Панель живого проекта','Создать интерфейс Improve World поверх существующей системы проектов, команд и задач.', '["видно видение проекта","видно команды","видно открытые задачи","видно последние ежедневные улучшения"]'::jsonb, 1, 'planned'),
  ('ONBOARD-001','community','Первое задание участника','После входа участник должен быстро получить небольшую законченную задачу по своей специализации.', '["задача соответствует навыку","оценка 2-4 часа","есть критерий готовности","после выполнения предлагается следующий шаг"]'::jsonb, 2, 'planned'),
  ('IMPROVE-001','platform','Ежедневный вклад +1%','Сделать полный пользовательский поток создания daily_improvement.', '["участник выбирает или связывает задачу","описывает улучшение","прикладывает proof URL при необходимости","вклад виден в ленте","авторство сохраняется"]'::jsonb, 1, 'planned'),
  ('PROGRESS-001','platform','Лента роста мира','Показывать ежедневный прогресс, авторов и принятые улучшения.', '["группировка по дням","видны авторы","видно число принятых вкладов","есть ссылка на исходную задачу/изменение"]'::jsonb, 2, 'idea'),
  ('AUTHOR-001','platform','История авторства объектов','Связать значимые объекты/изменения мира с автором и историей.', '["у объекта есть автор","видна история изменений","можно перейти к связанным задачам и улучшениям"]'::jsonb, 3, 'idea'),
  ('TEAM-001','community','Команды и роли','Дать лидерам возможность формировать команды и распределять области ответственности.', '["owner/admin создаёт команды","участники входят в команды","роль lead/member видна","задачи можно привязать к команде"]'::jsonb, 2, 'planned'),
  ('TASKS-001','platform','Доска задач','Сделать понятный UI для todo/in_progress/review/done поверх существующей таблицы tasks.', '["фильтр по команде","назначение исполнителя","приоритет","статус","связь с ежедневными улучшениями"]'::jsonb, 1, 'planned'),
  ('AUTH-001','accounts','Единый аккаунт во всех приложениях','Сохранить единый Supabase Auth аккаунт и профиль во всех мирах и играх.', '["вход сохраняется между приложениями","ник берётся из профиля","выход работает везде"]'::jsonb, 1, 'done'),
  ('GAME-001','survival','Постоянный Survival-мир','Хранить состояние игрока, инвентарь, ресурсы и постройки в Supabase.', '["позиция сохраняется","инвентарь сохраняется","ресурсы и постройки общие","данные переживают redeploy"]'::jsonb, 1, 'done'),
  ('REALTIME-001','multiplayer','Supabase Realtime для общего мира','Использовать Broadcast/Presence/Postgres Changes вместо постоянного Node WebSocket процесса на Vercel.', '["присутствие игроков","обновления мира realtime","нет зависимости от постоянного server process"]'::jsonb, 1, 'done')
) as f(feature_key, area, title, description, acceptance_criteria, priority, status)
where pr.slug = 'improve-world'
on conflict (project_id, feature_key) do update set
  area = excluded.area,
  title = excluded.title,
  description = excluded.description,
  acceptance_criteria = excluded.acceptance_criteria,
  priority = excluded.priority,
  status = case when public.feature_backlog.status = 'done' then 'done' else excluded.status end,
  updated_at = now();

-- A compact machine-readable view for agents and tooling.
create or replace view public.codex_project_context
with (security_invoker = true)
as
select
  p.id as project_id,
  p.slug as project_slug,
  p.name as project_name,
  p.vision,
  coalesce((select jsonb_agg(jsonb_build_object(
    'key', pp.key,
    'statement', pp.statement,
    'details', pp.details,
    'sort_order', pp.sort_order
  ) order by pp.sort_order) from public.project_principles pp where pp.project_id = p.id), '[]'::jsonb) as principles,
  coalesce((select jsonb_agg(jsonb_build_object(
    'slug', pd.slug,
    'type', pd.document_type,
    'title', pd.title,
    'version', pd.version,
    'content_md', pd.content_md,
    'content_json', pd.content_json
  ) order by pd.slug) from public.project_documents pd where pd.project_id = p.id and pd.status = 'active'), '[]'::jsonb) as documents,
  coalesce((select jsonb_agg(jsonb_build_object(
    'feature_key', fb.feature_key,
    'area', fb.area,
    'title', fb.title,
    'description', fb.description,
    'acceptance_criteria', fb.acceptance_criteria,
    'priority', fb.priority,
    'status', fb.status
  ) order by fb.priority, fb.feature_key) from public.feature_backlog fb where fb.project_id = p.id and fb.status <> 'done'), '[]'::jsonb) as open_backlog
from public.projects p;

grant select on public.codex_project_context to anon, authenticated;
