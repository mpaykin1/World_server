do $$
declare
  v_project_id uuid;
  v_author_id uuid;
  v_story_id uuid;
  v_root uuid;
  v_truth uuid;
  v_lie uuid;
  v_tower uuid;
  v_shadow uuid;
  v_end_a uuid;
  v_end_b uuid;
  v_leya uuid;
  v_kai uuid;
begin
  select id,created_by into v_project_id,v_author_id from public.projects where slug='improve-world' limit 1;
  if v_project_id is null or v_author_id is null then return; end if;
  select id into v_story_id from private.stories where project_id=v_project_id and slug='first-infinite-story';
  if v_story_id is null then
    insert into private.stories(project_id,slug,title,premise,summary,genre_tags,status,visibility,author_id,settings)
    values(
      v_project_id,'first-infinite-story','Город, который помнит тебя',
      'Во время грозы город открывает ворота только тем, чьи истории он уже однажды видел — даже если сами люди этого не помнят.',
      'Короткая демонстрация Infinite Stories: одну историю можно проживать за разных персонажей, выборы меняют состояние героя, а любую сцену можно продолжить или превратить в альтернативную линию.',
      array['mystery','fantasy','memory'],'published','public',v_author_id,
      jsonb_build_object('demo',true,'supports_forks',true,'supports_community_continuations',true)
    ) returning id into v_story_id;

    insert into private.story_characters(story_id,name,description,playable,traits,initial_state,created_by)
    values(v_story_id,'Лея','Картограф памяти. Она рисует места, которые исчезают из чужих воспоминаний.',true,jsonb_build_object('role','исследователь','temperament','смелая и внимательная'),jsonb_build_object('courage',1,'city_trust',0,'secrecy',0),v_author_id) returning id into v_leya;
    insert into private.story_characters(story_id,name,description,playable,traits,initial_state,created_by)
    values(v_story_id,'Кай','Хранитель чужих историй. Он помнит события, которые никогда не происходили с ним.',true,jsonb_build_object('role','хранитель','temperament','спокойный и скрытный'),jsonb_build_object('courage',0,'city_trust',0,'secrecy',1),v_author_id) returning id into v_kai;

    insert into private.story_nodes(story_id,node_type,title,body_md,scene_data,is_start,created_by)
    values(v_story_id,'scene','Ворота под грозой','Городская стена вспыхивает в свете молнии. На воротах появляется фраза: «Назови себя — и я скажу, помню ли тебя».',jsonb_build_object('weather','storm','location','city_gate'),true,v_author_id) returning id into v_root;
    insert into private.story_nodes(story_id,node_type,title,body_md,scene_data,created_by)
    values(v_story_id,'event','Город отвечает','Камень под ладонью становится тёплым. За воротами зажигается одна-единственная улица, будто приглашая именно тебя.',jsonb_build_object('location','memory_street'),v_author_id) returning id into v_truth;
    insert into private.story_nodes(story_id,node_type,title,body_md,scene_data,created_by)
    values(v_story_id,'event','Тень знает правду','Ворота открываются, но твоя тень остаётся снаружи. Через секунду она поворачивает голову вслед за тобой.',jsonb_build_object('location','gate_shadow'),v_author_id) returning id into v_lie;
    insert into private.story_nodes(story_id,node_type,title,body_md,scene_data,created_by)
    values(v_story_id,'scene','Башня забытых карт','В башне висят тысячи карт. На одной из них твой почерк отмечает комнату, в которой ты уверен, что никогда не был.',jsonb_build_object('location','map_tower'),v_author_id) returning id into v_tower;
    insert into private.story_nodes(story_id,node_type,title,body_md,scene_data,created_by)
    values(v_story_id,'scene','Разговор с собственной тенью','Тень догоняет тебя на пустой площади и произносит твоим голосом: «Я могу вернуть то, что ты решил забыть».',jsonb_build_object('location','empty_square'),v_author_id) returning id into v_shadow;
    insert into private.story_nodes(story_id,node_type,title,body_md,scene_data,created_by)
    values(v_story_id,'ending','Карта открывается','Ты касаешься отметки на карте, и город достраивает вокруг тебя комнату из прошлого. Это конец этой ветки — или начало новой истории.',jsonb_build_object('ending_kind','memory_recovered'),v_author_id) returning id into v_end_a;
    insert into private.story_nodes(story_id,node_type,title,body_md,scene_data,created_by)
    values(v_story_id,'ending','Тень делает первый шаг','Ты соглашаешься выслушать тень. Она улыбается раньше тебя. Это конец этой ветки — или точка для альтернативной линии.',jsonb_build_object('ending_kind','shadow_alliance'),v_author_id) returning id into v_end_b;

    insert into private.story_edges(story_id,from_node_id,to_node_id,choice_key,label,requirements,consequences,sort_order,created_by) values
      (v_story_id,v_root,v_truth,'true_name','Назвать своё настоящее имя','{}',jsonb_build_object('courage',2,'city_trust',1),10,v_author_id),
      (v_story_id,v_root,v_lie,'false_name','Назвать вымышленное имя','{}',jsonb_build_object('secrecy',2,'shadow_attention',1),20,v_author_id),
      (v_story_id,v_truth,v_tower,'follow_light','Пойти по освещённой улице','{}',jsonb_build_object('city_trust',2),10,v_author_id),
      (v_story_id,v_lie,v_shadow,'face_shadow','Остановиться и дождаться тень','{}',jsonb_build_object('courage',1,'shadow_attention',2),10,v_author_id),
      (v_story_id,v_tower,v_end_a,'touch_map','Коснуться отметки своим почерком','{}',jsonb_build_object('memory_open',true),10,v_author_id),
      (v_story_id,v_shadow,v_end_b,'listen_shadow','Позволить тени рассказать правду','{}',jsonb_build_object('shadow_alliance',true),10,v_author_id);

    insert into private.story_node_perspectives(node_id,character_id,body_md,inner_voice_md,sensory_md,created_by) values
      (v_root,v_leya,'Городская стена вспыхивает в свете молнии. Ты автоматически ищешь взглядом линии старых улиц — и замечаешь на камне метку, которую когда-то рисовала только ты.','Если эта метка моя, значит карта города началась задолго до того, как я её нарисовала.','Озон, мокрый камень и едва слышный шорох бумаги, хотя бумаги рядом нет.',v_author_id),
      (v_root,v_kai,'Городская стена вспыхивает в свете молнии. Фраза на воротах кажется знакомой: ты уже слышал её в истории человека, которого никогда не встречал.','Я знаю правильный ответ. Вопрос лишь в том, мой ли он.','Гром гасит все звуки, кроме чужого шёпота прямо за воротами.',v_author_id);
  end if;
end $$;

insert into public.feature_backlog(project_id,feature_key,area,title,description,acceptance_criteria,priority,status,source,depends_on,codex_ready)
select p.id,'STORY-CORE-001','stories','Infinite Stories — backend','Граф бесконечных историй: авторство, персонажи, перспективы, выборы, состояние героя, игровые сессии, альтернативные линии и предложения продолжений.',
  '["автор создаёт историю и сцены","сцены соединяются выбором в произвольный граф","одну сцену можно проживать по-разному за разных персонажей","выборы меняют состояние героя","любую опубликованную сцену можно форкнуть в альтернативную историю","участник может предложить продолжение","авторство продолжения сохраняется"]'::jsonb,
  1,'done','conversation','{}'::text[],false
from public.projects p where p.slug='improve-world'
on conflict(project_id,feature_key) do update set description=excluded.description,acceptance_criteria=excluded.acceptance_criteria,status='done',updated_at=now();

insert into public.feature_backlog(project_id,feature_key,area,title,description,acceptance_criteria,priority,status,source,depends_on,codex_ready)
select p.id,'STORY-UI-001','stories','Infinite Stories — автор и игрок','Добавить в Improve World библиотеку историй, режим автора с графом сцен и режим проживания истории за выбранного персонажа.',
  '["в Hub есть раздел Истории","виден каталог опубликованных историй","можно выбрать персонажа и начать/продолжить прохождение","сцена показывает текст от перспективы выбранного персонажа","выбор реально переводит в следующую сцену и сохраняется","из любой сцены можно предложить продолжение или создать альтернативную линию","автор видит workspace: персонажи, сцены, связи, предложения","новую историю можно создать без SQL"]'::jsonb,
  1,'planned','conversation',array['STORY-CORE-001'],true
from public.projects p where p.slug='improve-world'
on conflict(project_id,feature_key) do update set description=excluded.description,acceptance_criteria=excluded.acceptance_criteria,priority=1,status=case when public.feature_backlog.status='done' then 'done' else 'planned' end,depends_on=excluded.depends_on,codex_ready=true,updated_at=now();

insert into public.feature_backlog(project_id,feature_key,area,title,description,acceptance_criteria,priority,status,source,depends_on,codex_ready)
select p.id,'STORY-AI-001','stories','AI-соавтор бесконечных историй','Опциональный слой генерации сцен, вариантов выбора, персонажей и продолжений с обязательным человеческим подтверждением перед публикацией.',
  '["AI никогда не публикует каноническую сцену без подтверждения автора","контекст включает историю, персонажа, путь игрока и состояние","варианты можно принять, изменить или отклонить","сохраняется человек, утвердивший результат"]'::jsonb,
  3,'idea','conversation',array['STORY-UI-001'],false
from public.projects p where p.slug='improve-world'
on conflict(project_id,feature_key) do nothing;

insert into public.project_documents(project_id,slug,document_type,title,content_md,content_json,version,status)
select p.id,'infinite-stories','design','Infinite Stories — система бесконечных историй',
'# Infinite Stories\n\n## Смысл\nПользователь может быть **автором** истории и одновременно **проживать** историю изнутри за выбранного персонажа. История — не книга с фиксированным концом, а бесконечный граф сцен, решений и альтернативных линий.\n\n## Два режима\n### Автор\nСоздаёт premise, персонажей, сцены и связи. Для одной сцены может написать отдельную перспективу каждого героя: что он замечает, думает и чувствует. Автор может пригласить coauthor/editor.\n\n### Игрок-персонаж\nВыбирает героя, входит в историю и получает сцену из его перспективы. Решения меняют session state: отношения, доверие, страх, знания, предметы, репутацию и любые другие JSON-состояния. Requirements скрывают/открывают варианты.\n\n## Бесконечность\n- у сцены сколько угодно выборов;\n- граф может ветвиться и снова сходиться;\n- любой участник может предложить continuation/branch;\n- любую опубликованную сцену можно fork в отдельную альтернативную timeline;\n- концовка — это только конец прохождения, но остаётся допустимой точкой новой авторской линии;\n- авторство каждого принятого community-продолжения сохраняется.\n\n## Связь с Improve World\nИстория может ссылаться на world_entities, задачи и daily +1%. Сценарист получает маленькие законченные story-задачи так же, как программист или художник.\n\n## AI позже\nAI — опциональный соавтор: предлагает варианты, но канон подтверждает человек. Это сохраняет авторство и не превращает мир в бесконтрольную генерацию.',
jsonb_build_object('tables_private',jsonb_build_array('stories','story_collaborators','story_characters','story_nodes','story_node_perspectives','story_edges','story_sessions','story_session_steps','story_continuations'),'modes',jsonb_build_array('author','play_as_character'),'infinite_mechanisms',jsonb_build_array('branch','merge','community_continuation','fork_timeline','replay_as_another_character')),
1,'active'
from public.projects p where p.slug='improve-world'
on conflict(project_id,slug) do update set content_md=excluded.content_md,content_json=excluded.content_json,version=public.project_documents.version+1,status='active',updated_at=now();

insert into public.feature_specs(project_id,feature_key,objective,implementation_plan,target_files,preserve_requirements,api_contract,data_contract,ux_contract,tests,verification_commands,completion_definition,codex_instruction,spec_status)
select p.id,'STORY-UI-001',
'Сделать Infinite Stories полноценным разделом Improve World: пользователь за один вход понимает разницу Автор / Проживать историю и может выполнить оба цикла без SQL.',
'[{"step":1,"action":"Добавить #stories в nav и основной Hub."},{"step":2,"action":"Каталог через get_story_catalog; карточка demo истории должна работать сразу."},{"step":3,"action":"Play mode: public snapshot → выбор персонажа → start_story_session → get/choose state."},{"step":4,"action":"Показать body, inner voice, sensory layer и choices; хранить session id."},{"step":5,"action":"На каждой сцене дать Предложить продолжение и Альтернативная линия."},{"step":6,"action":"Author mode: get_my_story_workspaces/create_story; workspace для characters/nodes/edges/perspectives/continuations."},{"step":7,"action":"Добавить Stories в UX tour v2 и smoke tests."}]'::jsonb,
'["apps/improve-world/index.html","apps/improve-world/style.css","apps/improve-world/client.js","apps/improve-world/tour.js"]'::jsonb,
'["не ломать Hub/tasks/+1%","не выносить private story data в публичные таблицы","не показывать target scene content до выбора","сохранять авторство community continuation","не добавлять AI-заглушку, выдающую себя за рабочую генерацию"]'::jsonb,
jsonb_build_object('catalog','get_story_catalog','snapshot','get_story_public_snapshot','play',jsonb_build_array('start_story_session','get_story_session_state','choose_story_edge','get_story_session_path'),'author',jsonb_build_array('create_story','get_my_story_workspaces','get_story_author_workspace','add_story_character','add_story_node','set_story_node_perspective','connect_story_nodes','update_story_meta','update_story_node','publish_story','add_story_collaborator_by_username'),'infinite',jsonb_build_array('propose_story_continuation','review_story_continuation','fork_story_from_node')),
jsonb_build_object('storage','private schema through SECURITY DEFINER RPC only','player_state','arbitrary jsonb merged by edge consequences','perspective','node + character override'),
jsonb_build_object('primary_question','Ты хочешь прожить историю или создать свою?','play_primary','Выбрать персонажа','author_primary','Создать историю','scene_primary','Сделать выбор'),
'["demo story appears in catalog","two playable characters show different root perspective","choice changes current scene and session path","replay as another character works","fork creates author-owned draft","continuation proposal reaches author workspace","accepted proposal becomes real node+edge with original proposer as node author","draft can be built and published from UI"]'::jsonb,
array['npm run check'],
'Полный вертикальный цикл работает: создать историю → персонаж → сцены → связи → publish → другой пользователь выбирает героя → проживает ветку → предлагает продолжение/форк → автор принимает → новая ветка доступна.',
'Используй уже развёрнутый STORY backend. Не создавай параллельную story schema. Реализуй весь STORY-UI-001 в существующем apps/improve-world и добавь в UX-tour.',
'ready'
from public.projects p where p.slug='improve-world'
on conflict(project_id,feature_key) do update set objective=excluded.objective,implementation_plan=excluded.implementation_plan,target_files=excluded.target_files,preserve_requirements=excluded.preserve_requirements,api_contract=excluded.api_contract,data_contract=excluded.data_contract,ux_contract=excluded.ux_contract,tests=excluded.tests,verification_commands=excluded.verification_commands,completion_definition=excluded.completion_definition,codex_instruction=excluded.codex_instruction,spec_status='ready',updated_at=now();

do $$
declare v_project_id uuid; v_old uuid; v_new uuid;
begin
  select id into v_project_id from public.projects where slug='improve-world';
  if v_project_id is null then return; end if;
  select id into v_new from private.ux_tour_versions where project_id=v_project_id and version=2;
  if v_new is null then
    insert into private.ux_tour_versions(project_id,version,name,status,min_observation_ms)
    values(v_project_id,2,'Improve World v2 — обзор + Infinite Stories','draft',5000) returning id into v_new;
    select id into v_old from private.ux_tour_versions where project_id=v_project_id and version=1;
    if v_old is not null then
      insert into private.ux_tour_screens(tour_version_id,screen_key,title,route,sort_order,observation_prompt,question_location,question_actions,question_first_action,location_options,action_options,explanation_md,guided_action_instruction,primary_action_selector,active)
      select v_new,screen_key,title,route,
        case when sort_order>=9 then sort_order+1 else sort_order end,
        observation_prompt,question_location,question_actions,question_first_action,location_options,action_options,explanation_md,guided_action_instruction,primary_action_selector,active
      from private.ux_tour_screens where tour_version_id=v_old;
    end if;
    insert into private.ux_tour_screens(tour_version_id,screen_key,title,route,sort_order,location_options,action_options,explanation_md,guided_action_instruction,primary_action_selector)
    values(v_new,'stories','Бесконечные истории','/apps/improve-world/#stories',9,
      '[{"key":"stories","label":"Библиотека историй"},{"key":"progress","label":"Лента роста"},{"key":"tasks","label":"Доска задач"},{"key":"unsure","label":"Не уверен"}]'::jsonb,
      '[{"key":"play_story","label":"Прожить историю за персонажа"},{"key":"author_story","label":"Создать свою историю"},{"key":"continue_story","label":"Продолжить начатую историю"}]'::jsonb,
      'Это Infinite Stories. Здесь можно выбрать готовую историю и проживать её изнутри за персонажа или перейти в режим автора и строить собственный граф сцен и развилок.',
      'Открой историю и выбери персонажа — либо создай собственную историю.',
      '[data-ux-id="play_story"]');
    update private.ux_tour_versions set status='archived' where project_id=v_project_id and status='active';
    update private.ux_tour_versions set status='active' where id=v_new;
  end if;
end $$;
