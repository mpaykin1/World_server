alter table public.feature_backlog add column if not exists depends_on text[] not null default '{}';
alter table public.feature_backlog add column if not exists codex_ready boolean not null default false;
alter table public.tasks add column if not exists feature_key text;
create index if not exists tasks_feature_key_idx on public.tasks(project_id,feature_key) where feature_key is not null;

create or replace view public.codex_ready_queue
with (security_invoker=true)
as
select q.*
from public.codex_work_queue q
join public.projects p on p.slug=q.project_slug
join public.feature_backlog fb on fb.project_id=p.id and fb.feature_key=q.feature_key
where fb.codex_ready=true
  and not exists (
    select 1
    from unnest(fb.depends_on) dep(feature_key)
    left join public.feature_backlog d on d.project_id=fb.project_id and d.feature_key=dep.feature_key
    where d.status is distinct from 'done'
  );

grant select on public.codex_ready_queue to anon,authenticated;

create or replace function public.get_codex_packet(p_project_slug text, p_feature_key text default null)
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
with project_row as (
  select p.* from public.projects p where p.slug=p_project_slug limit 1
),
selected as (
  select q.*
  from public.codex_ready_queue q
  where q.project_slug=p_project_slug
    and (p_feature_key is null or q.feature_key=p_feature_key)
  order by q.queue_rank asc, q.priority asc, q.feature_key asc
  limit 1
),
docs as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'slug',d.slug,'type',d.document_type,'title',d.title,'content_md',d.content_md,'content_json',d.content_json,'version',d.version
  ) order by d.slug),'[]'::jsonb) value
  from public.project_documents d join project_row p on p.id=d.project_id
  where d.status='active'
),
principles as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'key',pp.key,'statement',pp.statement,'details',pp.details,'order',pp.sort_order
  ) order by pp.sort_order),'[]'::jsonb) value
  from public.project_principles pp join project_row p on p.id=pp.project_id
),
repo as (
  select to_jsonb(rc) - 'id' - 'project_id' - 'created_at' - 'updated_at' value
  from public.repository_context rc join project_row p on p.id=rc.project_id
)
select jsonb_build_object(
  'project', jsonb_build_object('slug',p.slug,'name',p.name,'description',p.description,'vision',p.vision),
  'repository', coalesce(r.value,'{}'::jsonb),
  'work_item', case when s.feature_key is null then null else to_jsonb(s) end,
  'documents', d.value,
  'principles', pr.value,
  'execution_rules', jsonb_build_object(
    'branch','Create a dedicated codex/* branch unless an existing task branch is explicitly provided.',
    'scope','Implement one work item completely; avoid unrelated refactors.',
    'database','Use existing Supabase schema/RPC first. Add migrations only for genuinely missing backend capability.',
    'deployment','Vercel deploys from GitHub; verify preview/CI before merge.',
    'security','Never expose service role/secret keys to browser code; preserve RLS.',
    'graphics','Never delete, simplify or regress existing game graphics/mechanics while implementing platform features.',
    'finish','Run verification commands, create PR to master, report PR URL and exact checks.'
  )
)
from project_row p
left join selected s on true
cross join docs d
cross join principles pr
left join repo r on true;
$$;

grant execute on function public.get_codex_packet(text,text) to anon,authenticated;
