create table private.stories (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  slug text not null,
  title text not null,
  premise text,
  summary text,
  genre_tags text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft','published','archived')),
  visibility text not null default 'public' check (visibility in ('public','project','private')),
  author_id uuid not null references public.profiles(id) on delete restrict,
  origin_story_id uuid references private.stories(id) on delete set null,
  origin_node_id uuid,
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,slug)
);

create table private.story_collaborators (
  story_id uuid not null references private.stories(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'editor' check (role in ('coauthor','editor')),
  added_at timestamptz not null default now(),
  primary key(story_id,user_id)
);

create table private.story_characters (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references private.stories(id) on delete cascade,
  name text not null,
  description text,
  playable boolean not null default true,
  avatar_url text,
  traits jsonb not null default '{}',
  initial_state jsonb not null default '{}',
  world_entity_id uuid references public.world_entities(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table private.story_nodes (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references private.stories(id) on delete cascade,
  node_type text not null default 'scene' check (node_type in ('scene','event','ending')),
  title text not null,
  body_md text not null default '',
  scene_data jsonb not null default '{}',
  is_start boolean not null default false,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table private.stories
  add constraint stories_origin_node_fk foreign key(origin_node_id) references private.story_nodes(id) on delete set null;

create unique index story_nodes_one_start_idx on private.story_nodes(story_id) where is_start;

create table private.story_node_perspectives (
  node_id uuid not null references private.story_nodes(id) on delete cascade,
  character_id uuid not null references private.story_characters(id) on delete cascade,
  body_md text,
  inner_voice_md text,
  sensory_md text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now(),
  primary key(node_id,character_id)
);

create table private.story_edges (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references private.stories(id) on delete cascade,
  from_node_id uuid not null references private.story_nodes(id) on delete cascade,
  to_node_id uuid not null references private.story_nodes(id) on delete cascade,
  choice_key text not null,
  label text not null,
  requirements jsonb not null default '{}',
  consequences jsonb not null default '{}',
  sort_order integer not null default 0,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(from_node_id,choice_key)
);

create table private.story_sessions (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references private.stories(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  character_id uuid not null references private.story_characters(id) on delete restrict,
  current_node_id uuid not null references private.story_nodes(id) on delete restrict,
  status text not null default 'active' check (status in ('active','completed','abandoned')),
  state jsonb not null default '{}',
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table private.story_session_steps (
  id bigint generated always as identity primary key,
  session_id uuid not null references private.story_sessions(id) on delete cascade,
  node_id uuid not null references private.story_nodes(id) on delete restrict,
  edge_id uuid references private.story_edges(id) on delete set null,
  state_snapshot jsonb not null default '{}',
  arrived_at timestamptz not null default now()
);

create table private.story_continuations (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references private.stories(id) on delete cascade,
  base_node_id uuid not null references private.story_nodes(id) on delete cascade,
  proposed_by uuid not null references public.profiles(id) on delete cascade,
  contribution_type text not null default 'continuation' check (contribution_type in ('continuation','branch')),
  title text not null,
  body_md text not null,
  choice_label text not null,
  status text not null default 'submitted' check (status in ('submitted','accepted','rejected')),
  resulting_node_id uuid references private.story_nodes(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index stories_project_status_idx on private.stories(project_id,status,updated_at desc);
create index stories_author_idx on private.stories(author_id,updated_at desc);
create index story_collaborators_user_idx on private.story_collaborators(user_id,story_id);
create index story_characters_story_idx on private.story_characters(story_id,playable);
create index story_nodes_story_idx on private.story_nodes(story_id,created_at);
create index story_perspectives_character_idx on private.story_node_perspectives(character_id,node_id);
create index story_edges_story_from_idx on private.story_edges(story_id,from_node_id,sort_order);
create index story_edges_to_idx on private.story_edges(to_node_id);
create index story_sessions_user_idx on private.story_sessions(user_id,updated_at desc);
create index story_sessions_story_idx on private.story_sessions(story_id,updated_at desc);
create index story_steps_session_idx on private.story_session_steps(session_id,id);
create index story_continuations_story_status_idx on private.story_continuations(story_id,status,created_at desc);
create index story_continuations_author_idx on private.story_continuations(proposed_by,created_at desc);

create trigger stories_updated_at before update on private.stories for each row execute function public.set_updated_at();
create trigger story_characters_updated_at before update on private.story_characters for each row execute function public.set_updated_at();
create trigger story_nodes_updated_at before update on private.story_nodes for each row execute function public.set_updated_at();
create trigger story_perspectives_updated_at before update on private.story_node_perspectives for each row execute function public.set_updated_at();
create trigger story_sessions_updated_at before update on private.story_sessions for each row execute function public.set_updated_at();
create trigger story_continuations_updated_at before update on private.story_continuations for each row execute function public.set_updated_at();

create or replace function private.story_can_edit(p_story_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1 from private.stories s
    where s.id=p_story_id
      and (
        s.author_id=(select auth.uid())
        or exists(select 1 from private.story_collaborators c where c.story_id=s.id and c.user_id=(select auth.uid()))
        or private.can_manage_project(s.project_id)
      )
  );
$$;

create or replace function public.get_story_catalog(p_project_slug text default 'improve-world')
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
with p as (select id from public.projects where slug=p_project_slug),
rows as (
  select s.*,
    private.profile_public_name(s.author_id) author_name,
    (select count(*) from private.story_characters c where c.story_id=s.id and c.playable) playable_characters,
    (select count(*) from private.story_nodes n where n.story_id=s.id) node_count,
    (select count(*) from private.story_edges e where e.story_id=s.id) choice_count,
    (select count(*) from private.story_sessions ss where ss.story_id=s.id) play_count
  from private.stories s join p on p.id=s.project_id
  where s.status='published' and s.visibility in ('public','project')
  order by s.updated_at desc
)
select coalesce(jsonb_agg(jsonb_build_object(
  'id',id,'slug',slug,'title',title,'premise',premise,'summary',summary,'genre_tags',genre_tags,
  'author_id',author_id,'author_name',author_name,'origin_story_id',origin_story_id,'origin_node_id',origin_node_id,
  'playable_characters',playable_characters,'node_count',node_count,'choice_count',choice_count,'play_count',play_count,
  'updated_at',updated_at
)),'[]'::jsonb) from rows;
$$;

create or replace function public.create_story(
  p_project_slug text,
  p_title text,
  p_premise text default null,
  p_genre_tags text[] default '{}',
  p_root_title text default 'Начало',
  p_root_body text default ''
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_project_id uuid; v_story private.stories; v_root private.story_nodes; v_slug text;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  select id into v_project_id from public.projects where slug=p_project_slug;
  if v_project_id is null then raise exception 'Project not found'; end if;
  if not private.is_project_member(v_project_id) then raise exception 'Project membership required'; end if;
  if nullif(trim(p_title),'') is null then raise exception 'Story title required'; end if;
  v_slug := 'story-' || substr(replace(gen_random_uuid()::text,'-',''),1,12);
  insert into private.stories(project_id,slug,title,premise,genre_tags,author_id)
  values(v_project_id,v_slug,trim(p_title),nullif(trim(p_premise),''),coalesce(p_genre_tags,'{}'),(select auth.uid())) returning * into v_story;
  insert into private.story_nodes(story_id,node_type,title,body_md,is_start,created_by)
  values(v_story.id,'scene',coalesce(nullif(trim(p_root_title),''),'Начало'),coalesce(p_root_body,''),true,(select auth.uid())) returning * into v_root;
  return jsonb_build_object('story_id',v_story.id,'slug',v_story.slug,'root_node_id',v_root.id,'status',v_story.status);
end;
$$;

create or replace function public.add_story_character(
  p_story_id uuid,
  p_name text,
  p_description text default null,
  p_traits jsonb default '{}',
  p_initial_state jsonb default '{}',
  p_playable boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_row private.story_characters;
begin
  if not private.story_can_edit(p_story_id) then raise exception 'Story editor required'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'Character name required'; end if;
  insert into private.story_characters(story_id,name,description,traits,initial_state,playable,created_by)
  values(p_story_id,trim(p_name),nullif(trim(p_description),''),coalesce(p_traits,'{}'),coalesce(p_initial_state,'{}'),p_playable,(select auth.uid())) returning * into v_row;
  return to_jsonb(v_row)-'created_by';
end;
$$;

create or replace function public.add_story_node(
  p_story_id uuid,
  p_title text,
  p_body_md text,
  p_node_type text default 'scene',
  p_scene_data jsonb default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_row private.story_nodes;
begin
  if not private.story_can_edit(p_story_id) then raise exception 'Story editor required'; end if;
  if p_node_type not in ('scene','event','ending') then raise exception 'Invalid node type'; end if;
  if nullif(trim(p_title),'') is null then raise exception 'Node title required'; end if;
  insert into private.story_nodes(story_id,node_type,title,body_md,scene_data,created_by)
  values(p_story_id,p_node_type,trim(p_title),coalesce(p_body_md,''),coalesce(p_scene_data,'{}'),(select auth.uid())) returning * into v_row;
  return to_jsonb(v_row)-'created_by';
end;
$$;

create or replace function public.set_story_node_perspective(
  p_node_id uuid,
  p_character_id uuid,
  p_body_md text default null,
  p_inner_voice_md text default null,
  p_sensory_md text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_story_id uuid; v_row private.story_node_perspectives;
begin
  select n.story_id into v_story_id from private.story_nodes n where n.id=p_node_id;
  if v_story_id is null or not private.story_can_edit(v_story_id) then raise exception 'Story editor required'; end if;
  if not exists(select 1 from private.story_characters c where c.id=p_character_id and c.story_id=v_story_id) then raise exception 'Character does not belong to story'; end if;
  insert into private.story_node_perspectives(node_id,character_id,body_md,inner_voice_md,sensory_md,created_by)
  values(p_node_id,p_character_id,nullif(p_body_md,''),nullif(p_inner_voice_md,''),nullif(p_sensory_md,''),(select auth.uid()))
  on conflict(node_id,character_id) do update set body_md=excluded.body_md,inner_voice_md=excluded.inner_voice_md,sensory_md=excluded.sensory_md,created_by=excluded.created_by
  returning * into v_row;
  return to_jsonb(v_row)-'created_by';
end;
$$;

create or replace function public.connect_story_nodes(
  p_story_id uuid,
  p_from_node_id uuid,
  p_to_node_id uuid,
  p_label text,
  p_choice_key text default null,
  p_requirements jsonb default '{}',
  p_consequences jsonb default '{}',
  p_sort_order integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_row private.story_edges; v_key text;
begin
  if not private.story_can_edit(p_story_id) then raise exception 'Story editor required'; end if;
  if not exists(select 1 from private.story_nodes where id=p_from_node_id and story_id=p_story_id) or not exists(select 1 from private.story_nodes where id=p_to_node_id and story_id=p_story_id) then raise exception 'Nodes must belong to story'; end if;
  if nullif(trim(p_label),'') is null then raise exception 'Choice label required'; end if;
  v_key := coalesce(nullif(trim(p_choice_key),''),'choice-'||substr(replace(gen_random_uuid()::text,'-',''),1,8));
  insert into private.story_edges(story_id,from_node_id,to_node_id,choice_key,label,requirements,consequences,sort_order,created_by)
  values(p_story_id,p_from_node_id,p_to_node_id,v_key,trim(p_label),coalesce(p_requirements,'{}'),coalesce(p_consequences,'{}'),p_sort_order,(select auth.uid())) returning * into v_row;
  return to_jsonb(v_row)-'created_by';
end;
$$;

create or replace function public.publish_story(p_story_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_story private.stories;
begin
  if not private.story_can_edit(p_story_id) then raise exception 'Story editor required'; end if;
  if not exists(select 1 from private.story_nodes where story_id=p_story_id and is_start) then raise exception 'Start node required'; end if;
  if not exists(select 1 from private.story_characters where story_id=p_story_id and playable) then raise exception 'At least one playable character required'; end if;
  update private.stories set status='published' where id=p_story_id returning * into v_story;
  return jsonb_build_object('story_id',v_story.id,'status',v_story.status,'published',true);
end;
$$;

create or replace function public.add_story_collaborator_by_username(p_story_id uuid,p_username text,p_role text default 'editor')
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_user_id uuid;
begin
  if not private.story_can_edit(p_story_id) then raise exception 'Story editor required'; end if;
  if p_role not in ('coauthor','editor') then raise exception 'Invalid collaborator role'; end if;
  select id into v_user_id from public.profiles where username::text=p_username limit 1;
  if v_user_id is null then raise exception 'User not found'; end if;
  insert into private.story_collaborators(story_id,user_id,role) values(p_story_id,v_user_id,p_role)
  on conflict(story_id,user_id) do update set role=excluded.role;
  return jsonb_build_object('story_id',p_story_id,'user_id',v_user_id,'name',private.profile_public_name(v_user_id),'role',p_role);
end;
$$;

create or replace function public.get_story_author_workspace(p_story_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
select case when not private.story_can_edit(p_story_id) then null else jsonb_build_object(
  'story',to_jsonb(s)-'author_id' || jsonb_build_object('author_id',s.author_id,'author_name',private.profile_public_name(s.author_id)),
  'collaborators',coalesce((select jsonb_agg(jsonb_build_object('user_id',c.user_id,'name',private.profile_public_name(c.user_id),'role',c.role) order by c.added_at) from private.story_collaborators c where c.story_id=s.id),'[]'::jsonb),
  'characters',coalesce((select jsonb_agg(to_jsonb(c)-'created_by' order by c.created_at) from private.story_characters c where c.story_id=s.id),'[]'::jsonb),
  'nodes',coalesce((select jsonb_agg(to_jsonb(n)-'created_by' order by n.created_at) from private.story_nodes n where n.story_id=s.id),'[]'::jsonb),
  'perspectives',coalesce((select jsonb_agg(to_jsonb(sp)-'created_by') from private.story_node_perspectives sp join private.story_nodes n on n.id=sp.node_id where n.story_id=s.id),'[]'::jsonb),
  'edges',coalesce((select jsonb_agg(to_jsonb(e)-'created_by' order by e.from_node_id,e.sort_order,e.created_at) from private.story_edges e where e.story_id=s.id),'[]'::jsonb),
  'continuations',coalesce((select jsonb_agg(to_jsonb(c)-'proposed_by' || jsonb_build_object('proposed_by',c.proposed_by,'proposed_by_name',private.profile_public_name(c.proposed_by)) order by c.created_at desc) from private.story_continuations c where c.story_id=s.id),'[]'::jsonb)
) end
from private.stories s where s.id=p_story_id;
$$;

create or replace function public.start_story_session(p_story_id uuid,p_character_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_story private.stories; v_char private.story_characters; v_root private.story_nodes; v_session private.story_sessions;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  select * into v_story from private.stories where id=p_story_id and status='published';
  if not found then raise exception 'Published story not found'; end if;
  select * into v_char from private.story_characters where id=p_character_id and story_id=p_story_id and playable;
  if not found then raise exception 'Playable character not found'; end if;
  select * into v_root from private.story_nodes where story_id=p_story_id and is_start;
  if not found then raise exception 'Story start not found'; end if;
  insert into private.story_sessions(story_id,user_id,character_id,current_node_id,state)
  values(p_story_id,(select auth.uid()),p_character_id,v_root.id,coalesce(v_char.initial_state,'{}')) returning * into v_session;
  insert into private.story_session_steps(session_id,node_id,state_snapshot) values(v_session.id,v_root.id,v_session.state);
  return public.get_story_session_state(v_session.id);
end;
$$;

create or replace function public.get_story_session_state(p_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
with ss as (
  select x.* from private.story_sessions x where x.id=p_session_id and x.user_id=(select auth.uid())
), node_data as (
  select n.*,p.body_md perspective_body,p.inner_voice_md,p.sensory_md
  from ss join private.story_nodes n on n.id=ss.current_node_id
  left join private.story_node_perspectives p on p.node_id=n.id and p.character_id=ss.character_id
)
select jsonb_build_object(
  'session',jsonb_build_object('id',ss.id,'status',ss.status,'state',ss.state,'started_at',ss.started_at,'updated_at',ss.updated_at,'completed_at',ss.completed_at),
  'story',jsonb_build_object('id',s.id,'title',s.title,'premise',s.premise,'summary',s.summary,'genre_tags',s.genre_tags,'author_name',private.profile_public_name(s.author_id)),
  'character',jsonb_build_object('id',c.id,'name',c.name,'description',c.description,'traits',c.traits,'avatar_url',c.avatar_url),
  'node',jsonb_build_object('id',n.id,'type',n.node_type,'title',n.title,'body_md',coalesce(n.perspective_body,n.body_md),'inner_voice_md',n.inner_voice_md,'sensory_md',n.sensory_md,'scene_data',n.scene_data),
  'choices',coalesce((select jsonb_agg(jsonb_build_object('edge_id',e.id,'choice_key',e.choice_key,'label',e.label) order by e.sort_order,e.created_at) from private.story_edges e where e.from_node_id=n.id and e.story_id=ss.story_id and (e.requirements='{}'::jsonb or ss.state @> e.requirements)),'[]'::jsonb),
  'can_propose_continuation',(n.node_type<>'ending')
)
from ss join private.stories s on s.id=ss.story_id join private.story_characters c on c.id=ss.character_id join node_data n on true;
$$;

create or replace function public.choose_story_edge(p_session_id uuid,p_edge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_session private.story_sessions; v_edge private.story_edges; v_target private.story_nodes; v_state jsonb;
begin
  select * into v_session from private.story_sessions where id=p_session_id and user_id=(select auth.uid()) for update;
  if not found then raise exception 'Story session not found'; end if;
  if v_session.status<>'active' then raise exception 'Story session is not active'; end if;
  select * into v_edge from private.story_edges where id=p_edge_id and story_id=v_session.story_id and from_node_id=v_session.current_node_id;
  if not found then raise exception 'Choice is not available here'; end if;
  if v_edge.requirements<>'{}'::jsonb and not (v_session.state @> v_edge.requirements) then raise exception 'Choice requirements not met'; end if;
  select * into v_target from private.story_nodes where id=v_edge.to_node_id and story_id=v_session.story_id;
  if not found then raise exception 'Target scene not found'; end if;
  v_state := coalesce(v_session.state,'{}') || coalesce(v_edge.consequences,'{}');
  update private.story_sessions set current_node_id=v_target.id,state=v_state,status=case when v_target.node_type='ending' then 'completed' else 'active' end,completed_at=case when v_target.node_type='ending' then now() else null end where id=v_session.id;
  insert into private.story_session_steps(session_id,node_id,edge_id,state_snapshot) values(v_session.id,v_target.id,v_edge.id,v_state);
  return public.get_story_session_state(v_session.id);
end;
$$;

create or replace function public.get_my_story_sessions()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
select coalesce(jsonb_agg(jsonb_build_object(
  'session_id',ss.id,'story_id',s.id,'story_title',s.title,'character_id',c.id,'character_name',c.name,
  'current_node_id',ss.current_node_id,'status',ss.status,'started_at',ss.started_at,'updated_at',ss.updated_at
) order by ss.updated_at desc),'[]'::jsonb)
from private.story_sessions ss join private.stories s on s.id=ss.story_id join private.story_characters c on c.id=ss.character_id
where ss.user_id=(select auth.uid());
$$;

create or replace function public.fork_story_from_node(
  p_source_story_id uuid,
  p_source_node_id uuid,
  p_title text,
  p_premise text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_source private.stories; v_node private.story_nodes; v_new private.stories; v_root private.story_nodes; v_slug text;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  select * into v_source from private.stories where id=p_source_story_id and status='published';
  if not found then raise exception 'Source story not found'; end if;
  if not private.is_project_member(v_source.project_id) then raise exception 'Project membership required'; end if;
  select * into v_node from private.story_nodes where id=p_source_node_id and story_id=p_source_story_id;
  if not found then raise exception 'Source scene not found'; end if;
  v_slug := 'story-' || substr(replace(gen_random_uuid()::text,'-',''),1,12);
  insert into private.stories(project_id,slug,title,premise,genre_tags,author_id,origin_story_id,origin_node_id,settings)
  values(v_source.project_id,v_slug,trim(p_title),coalesce(nullif(trim(p_premise),''),v_source.premise),v_source.genre_tags,(select auth.uid()),v_source.id,v_node.id,jsonb_build_object('fork_kind','alternate_timeline')) returning * into v_new;
  insert into private.story_nodes(story_id,node_type,title,body_md,scene_data,is_start,created_by)
  values(v_new.id,'scene',v_node.title,v_node.body_md,v_node.scene_data || jsonb_build_object('forked_from_node_id',v_node.id),true,(select auth.uid())) returning * into v_root;
  insert into private.story_characters(story_id,name,description,playable,avatar_url,traits,initial_state,world_entity_id,created_by)
  select v_new.id,c.name,c.description,c.playable,c.avatar_url,c.traits,c.initial_state,c.world_entity_id,(select auth.uid()) from private.story_characters c where c.story_id=v_source.id;
  return jsonb_build_object('story_id',v_new.id,'root_node_id',v_root.id,'origin_story_id',v_source.id,'origin_node_id',v_node.id,'status','draft');
end;
$$;

create or replace function public.propose_story_continuation(
  p_story_id uuid,
  p_base_node_id uuid,
  p_title text,
  p_body_md text,
  p_choice_label text,
  p_contribution_type text default 'continuation'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_story private.stories; v_row private.story_continuations;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  select * into v_story from private.stories where id=p_story_id and status='published';
  if not found then raise exception 'Published story not found'; end if;
  if not private.is_project_member(v_story.project_id) then raise exception 'Project membership required'; end if;
  if not exists(select 1 from private.story_nodes where id=p_base_node_id and story_id=p_story_id) then raise exception 'Base scene not found'; end if;
  if p_contribution_type not in ('continuation','branch') then raise exception 'Invalid contribution type'; end if;
  insert into private.story_continuations(story_id,base_node_id,proposed_by,contribution_type,title,body_md,choice_label)
  values(p_story_id,p_base_node_id,(select auth.uid()),p_contribution_type,trim(p_title),coalesce(p_body_md,''),trim(p_choice_label)) returning * into v_row;
  return jsonb_build_object('proposal_id',v_row.id,'status',v_row.status,'story_id',v_row.story_id,'base_node_id',v_row.base_node_id);
end;
$$;

create or replace function public.review_story_continuation(p_proposal_id uuid,p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_prop private.story_continuations; v_node private.story_nodes; v_edge private.story_edges;
begin
  select * into v_prop from private.story_continuations where id=p_proposal_id for update;
  if not found then raise exception 'Proposal not found'; end if;
  if not private.story_can_edit(v_prop.story_id) then raise exception 'Story editor required'; end if;
  if v_prop.status<>'submitted' then raise exception 'Proposal already reviewed'; end if;
  if not p_accept then
    update private.story_continuations set status='rejected' where id=v_prop.id;
    return jsonb_build_object('proposal_id',v_prop.id,'status','rejected');
  end if;
  insert into private.story_nodes(story_id,node_type,title,body_md,scene_data,created_by)
  values(v_prop.story_id,'scene',v_prop.title,v_prop.body_md,jsonb_build_object('accepted_proposal_id',v_prop.id,'original_author_id',v_prop.proposed_by),v_prop.proposed_by) returning * into v_node;
  insert into private.story_edges(story_id,from_node_id,to_node_id,choice_key,label,sort_order,created_by)
  values(v_prop.story_id,v_prop.base_node_id,v_node.id,'community-'||substr(replace(v_prop.id::text,'-',''),1,8),v_prop.choice_label,100,v_prop.proposed_by) returning * into v_edge;
  update private.story_continuations set status='accepted',resulting_node_id=v_node.id where id=v_prop.id;
  return jsonb_build_object('proposal_id',v_prop.id,'status','accepted','node_id',v_node.id,'edge_id',v_edge.id,'author_id',v_prop.proposed_by,'author_name',private.profile_public_name(v_prop.proposed_by));
end;
$$;

revoke all on function private.story_can_edit(uuid) from public,anon,authenticated;

revoke all on function public.get_story_catalog(text) from public;
grant execute on function public.get_story_catalog(text) to anon,authenticated;

revoke all on function public.create_story(text,text,text,text[],text,text) from public;
grant execute on function public.create_story(text,text,text,text[],text,text) to authenticated;
revoke all on function public.add_story_character(uuid,text,text,jsonb,jsonb,boolean) from public;
grant execute on function public.add_story_character(uuid,text,text,jsonb,jsonb,boolean) to authenticated;
revoke all on function public.add_story_node(uuid,text,text,text,jsonb) from public;
grant execute on function public.add_story_node(uuid,text,text,text,jsonb) to authenticated;
revoke all on function public.set_story_node_perspective(uuid,uuid,text,text,text) from public;
grant execute on function public.set_story_node_perspective(uuid,uuid,text,text,text) to authenticated;
revoke all on function public.connect_story_nodes(uuid,uuid,uuid,text,text,jsonb,jsonb,integer) from public;
grant execute on function public.connect_story_nodes(uuid,uuid,uuid,text,text,jsonb,jsonb,integer) to authenticated;
revoke all on function public.publish_story(uuid) from public;
grant execute on function public.publish_story(uuid) to authenticated;
revoke all on function public.add_story_collaborator_by_username(uuid,text,text) from public;
grant execute on function public.add_story_collaborator_by_username(uuid,text,text) to authenticated;
revoke all on function public.get_story_author_workspace(uuid) from public;
grant execute on function public.get_story_author_workspace(uuid) to authenticated;
revoke all on function public.start_story_session(uuid,uuid) from public;
grant execute on function public.start_story_session(uuid,uuid) to authenticated;
revoke all on function public.get_story_session_state(uuid) from public;
grant execute on function public.get_story_session_state(uuid) to authenticated;
revoke all on function public.choose_story_edge(uuid,uuid) from public;
grant execute on function public.choose_story_edge(uuid,uuid) to authenticated;
revoke all on function public.get_my_story_sessions() from public;
grant execute on function public.get_my_story_sessions() to authenticated;
revoke all on function public.fork_story_from_node(uuid,uuid,text,text) from public;
grant execute on function public.fork_story_from_node(uuid,uuid,text,text) to authenticated;
revoke all on function public.propose_story_continuation(uuid,uuid,text,text,text,text) from public;
grant execute on function public.propose_story_continuation(uuid,uuid,text,text,text,text) to authenticated;
revoke all on function public.review_story_continuation(uuid,boolean) from public;
grant execute on function public.review_story_continuation(uuid,boolean) to authenticated;
