create or replace function public.get_story_public_snapshot(p_story_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
select jsonb_build_object(
  'story',jsonb_build_object('id',s.id,'title',s.title,'premise',s.premise,'summary',s.summary,'genre_tags',s.genre_tags,'author_id',s.author_id,'author_name',private.profile_public_name(s.author_id),'origin_story_id',s.origin_story_id,'origin_node_id',s.origin_node_id),
  'characters',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'description',c.description,'avatar_url',c.avatar_url,'traits',c.traits) order by c.created_at) from private.story_characters c where c.story_id=s.id and c.playable),'[]'::jsonb),
  'start',coalesce((select jsonb_build_object('id',n.id,'title',n.title) from private.story_nodes n where n.story_id=s.id and n.is_start limit 1),'{}'::jsonb)
)
from private.stories s
where s.id=p_story_id and s.status='published' and s.visibility in ('public','project');
$$;

create or replace function public.get_my_story_workspaces(p_project_slug text default 'improve-world')
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
with p as (select id from public.projects where slug=p_project_slug)
select coalesce(jsonb_agg(jsonb_build_object(
  'id',s.id,'title',s.title,'premise',s.premise,'status',s.status,'visibility',s.visibility,'genre_tags',s.genre_tags,
  'author_id',s.author_id,'author_name',private.profile_public_name(s.author_id),
  'my_role',case when s.author_id=(select auth.uid()) then 'author' else (select c.role from private.story_collaborators c where c.story_id=s.id and c.user_id=(select auth.uid())) end,
  'node_count',(select count(*) from private.story_nodes n where n.story_id=s.id),
  'character_count',(select count(*) from private.story_characters c where c.story_id=s.id),
  'pending_continuations',(select count(*) from private.story_continuations q where q.story_id=s.id and q.status='submitted'),
  'updated_at',s.updated_at
) order by s.updated_at desc),'[]'::jsonb)
from private.stories s join p on p.id=s.project_id
where s.author_id=(select auth.uid()) or exists(select 1 from private.story_collaborators c where c.story_id=s.id and c.user_id=(select auth.uid()));
$$;

create or replace function public.update_story_meta(
  p_story_id uuid,
  p_title text default null,
  p_premise text default null,
  p_summary text default null,
  p_genre_tags text[] default null,
  p_visibility text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_row private.stories;
begin
  if not private.story_can_edit(p_story_id) then raise exception 'Story editor required'; end if;
  if p_visibility is not null and p_visibility not in ('public','project','private') then raise exception 'Invalid visibility'; end if;
  update private.stories set
    title=coalesce(nullif(trim(p_title),''),title),
    premise=case when p_premise is null then premise else nullif(trim(p_premise),'') end,
    summary=case when p_summary is null then summary else nullif(trim(p_summary),'') end,
    genre_tags=coalesce(p_genre_tags,genre_tags),
    visibility=coalesce(p_visibility,visibility)
  where id=p_story_id returning * into v_row;
  return to_jsonb(v_row)-'author_id';
end;
$$;

create or replace function public.update_story_node(
  p_node_id uuid,
  p_title text default null,
  p_body_md text default null,
  p_node_type text default null,
  p_scene_data jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_story_id uuid; v_row private.story_nodes;
begin
  select story_id into v_story_id from private.story_nodes where id=p_node_id;
  if v_story_id is null or not private.story_can_edit(v_story_id) then raise exception 'Story editor required'; end if;
  if p_node_type is not null and p_node_type not in ('scene','event','ending') then raise exception 'Invalid node type'; end if;
  update private.story_nodes set
    title=coalesce(nullif(trim(p_title),''),title),
    body_md=coalesce(p_body_md,body_md),
    node_type=coalesce(p_node_type,node_type),
    scene_data=coalesce(p_scene_data,scene_data)
  where id=p_node_id returning * into v_row;
  return to_jsonb(v_row)-'created_by';
end;
$$;

create or replace function public.delete_story_edge(p_edge_id uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_story_id uuid;
begin
  select story_id into v_story_id from private.story_edges where id=p_edge_id;
  if v_story_id is null then return false; end if;
  if not private.story_can_edit(v_story_id) then raise exception 'Story editor required'; end if;
  delete from private.story_edges where id=p_edge_id;
  return true;
end;
$$;

create or replace function public.archive_story(p_story_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
begin
  if not private.story_can_edit(p_story_id) then raise exception 'Story editor required'; end if;
  update private.stories set status='archived' where id=p_story_id;
  return jsonb_build_object('story_id',p_story_id,'status','archived');
end;
$$;

create or replace function public.get_story_session_path(p_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
select coalesce(jsonb_agg(jsonb_build_object(
  'step_id',st.id,'node_id',st.node_id,'node_title',n.title,'node_type',n.node_type,'edge_id',st.edge_id,
  'choice_label',e.label,'state_snapshot',st.state_snapshot,'arrived_at',st.arrived_at
) order by st.id),'[]'::jsonb)
from private.story_session_steps st
join private.story_sessions ss on ss.id=st.session_id and ss.user_id=(select auth.uid())
join private.story_nodes n on n.id=st.node_id
left join private.story_edges e on e.id=st.edge_id
where st.session_id=p_session_id;
$$;

revoke all on function public.get_story_public_snapshot(uuid) from public;
grant execute on function public.get_story_public_snapshot(uuid) to anon,authenticated;
revoke all on function public.get_my_story_workspaces(text) from public;
grant execute on function public.get_my_story_workspaces(text) to authenticated;
revoke all on function public.update_story_meta(uuid,text,text,text,text[],text) from public;
grant execute on function public.update_story_meta(uuid,text,text,text,text[],text) to authenticated;
revoke all on function public.update_story_node(uuid,text,text,text,jsonb) from public;
grant execute on function public.update_story_node(uuid,text,text,text,jsonb) to authenticated;
revoke all on function public.delete_story_edge(uuid) from public;
grant execute on function public.delete_story_edge(uuid) to authenticated;
revoke all on function public.archive_story(uuid) from public;
grant execute on function public.archive_story(uuid) to authenticated;
revoke all on function public.get_story_session_path(uuid) from public;
grant execute on function public.get_story_session_path(uuid) to authenticated;
