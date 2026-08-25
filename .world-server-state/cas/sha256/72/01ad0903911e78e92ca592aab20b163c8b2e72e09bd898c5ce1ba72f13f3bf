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
  order by q.queue_rank asc,q.priority asc,q.feature_key asc
  limit 1
),
docs as (
  select coalesce(jsonb_agg(jsonb_build_object('slug',d.slug,'type',d.document_type,'title',d.title,'content_md',d.content_md,'content_json',d.content_json,'version',d.version) order by d.slug),'[]'::jsonb) value
  from public.project_documents d join project_row p on p.id=d.project_id where d.status='active'
),
principles as (
  select coalesce(jsonb_agg(jsonb_build_object('key',pp.key,'statement',pp.statement,'details',pp.details,'order',pp.sort_order) order by pp.sort_order),'[]'::jsonb) value
  from public.project_principles pp join project_row p on p.id=pp.project_id
),
repo as (
  select to_jsonb(rc)-'id'-'project_id'-'created_at'-'updated_at' value from public.repository_context rc join project_row p on p.id=rc.project_id
),
runs as (
  select coalesce(jsonb_agg(to_jsonb(x)-'project_id'-'updated_at' order by x.created_at desc),'[]'::jsonb) value
  from (select r.* from public.implementation_runs r join project_row p on p.id=r.project_id order by r.created_at desc limit 10) x
)
select jsonb_build_object(
  'project',jsonb_build_object('slug',p.slug,'name',p.name,'description',p.description,'vision',p.vision),
  'repository',coalesce(r.value,'{}'::jsonb),
  'work_item',case when s.feature_key is null then null else to_jsonb(s) end,
  'recent_runs',ru.value,
  'documents',d.value,
  'principles',pr.value,
  'execution_rules',jsonb_build_object(
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
left join repo r on true
cross join runs ru;
$$;
