begin;
create table if not exists private.quality_federated_patterns_v7 (
  fingerprint text primary key,
  lane text not null,
  issue_key text not null,
  engine text not null default 'generic',
  accepted_runs integer not null default 0,
  rejected_runs integer not null default 0,
  project_ids text[] not null default '{}',
  total_delta double precision not null default 0,
  updated_at timestamptz not null default now()
);
alter table private.quality_federated_patterns_v7 enable row level security;
revoke all on table private.quality_federated_patterns_v7 from public,anon,authenticated;

create table if not exists private.quality_visual_quorum_v7 (
  candidate_sha text primary key,
  result jsonb not null default '{}'::jsonb,
  pass_count integer not null default 0,
  reject_count integer not null default 0,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
alter table private.quality_visual_quorum_v7 enable row level security;
revoke all on table private.quality_visual_quorum_v7 from public,anon,authenticated;

drop function if exists public.quality_record_federated_result_v7(jsonb);
create function public.quality_record_federated_result_v7(p_cycle jsonb)
returns void language plpgsql security definer set search_path=private,public as $$
declare
  fp text := left(coalesce(p_cycle->>'fingerprint',''),160);
  ln text := left(coalesce(p_cycle->>'focusLane','unknown'),80);
  ik text := left(coalesce(p_cycle->>'issueKey','unknown'),160);
  eng text := left(coalesce(p_cycle#>>'{meta,engine}','generic'),80);
  proj text := left(coalesce(p_cycle->>'projectId','world-server'),160);
  accepted boolean := coalesce(p_cycle->>'status','')='accepted';
  rejected boolean := coalesce(p_cycle->>'status','')='rejected';
  delta double precision := coalesce((p_cycle->>'scoreDelta')::double precision,0);
begin
  if fp='' then return; end if;
  insert into private.quality_federated_patterns_v7(fingerprint,lane,issue_key,engine,accepted_runs,rejected_runs,project_ids,total_delta,updated_at)
  values(fp,ln,ik,eng,case when accepted then 1 else 0 end,case when rejected then 1 else 0 end,array[proj],case when accepted then delta else 0 end,now())
  on conflict(fingerprint) do update set
    lane=excluded.lane,
    issue_key=excluded.issue_key,
    engine=excluded.engine,
    accepted_runs=private.quality_federated_patterns_v7.accepted_runs + case when accepted then 1 else 0 end,
    rejected_runs=private.quality_federated_patterns_v7.rejected_runs + case when rejected then 1 else 0 end,
    project_ids=(select array(select distinct x from unnest(private.quality_federated_patterns_v7.project_ids || array[proj]) as x)),
    total_delta=private.quality_federated_patterns_v7.total_delta + case when accepted then delta else 0 end,
    updated_at=now();
end $$;
revoke all on function public.quality_record_federated_result_v7(jsonb) from public,anon,authenticated;
grant execute on function public.quality_record_federated_result_v7(jsonb) to service_role;

drop function if exists public.quality_get_federated_patterns_v7(integer);
create function public.quality_get_federated_patterns_v7(p_limit integer default 200)
returns table(fingerprint text,lane text,issue_key text,engine text,accepted_runs integer,rejected_runs integer,project_ids text[],project_count integer,total_delta double precision,avg_delta double precision,updated_at timestamptz)
language sql security definer set search_path=private,public as $$
 select p.fingerprint,p.lane,p.issue_key,p.engine,p.accepted_runs,p.rejected_runs,p.project_ids,cardinality(p.project_ids),p.total_delta,case when p.accepted_runs>0 then p.total_delta/p.accepted_runs else 0 end,p.updated_at
 from private.quality_federated_patterns_v7 p order by p.updated_at desc limit greatest(1,least(coalesce(p_limit,200),1000));
$$;
revoke all on function public.quality_get_federated_patterns_v7(integer) from public,anon,authenticated;
grant execute on function public.quality_get_federated_patterns_v7(integer) to service_role;

drop function if exists public.quality_record_visual_quorum_v7(text,jsonb);
create function public.quality_record_visual_quorum_v7(p_candidate_sha text,p_result jsonb)
returns void language plpgsql security definer set search_path=private,public as $$
begin
 insert into private.quality_visual_quorum_v7(candidate_sha,result,pass_count,reject_count,first_seen_at,last_seen_at)
 values(left(p_candidate_sha,160),coalesce(p_result,'{}'::jsonb),case when coalesce(p_result->>'status','')='PASS' then 1 else 0 end,case when coalesce(p_result->>'status','')='REJECT' then 1 else 0 end,now(),now())
 on conflict(candidate_sha) do update set result=excluded.result,pass_count=private.quality_visual_quorum_v7.pass_count+case when coalesce(p_result->>'status','')='PASS' then 1 else 0 end,reject_count=private.quality_visual_quorum_v7.reject_count+case when coalesce(p_result->>'status','')='REJECT' then 1 else 0 end,last_seen_at=now();
end $$;
revoke all on function public.quality_record_visual_quorum_v7(text,jsonb) from public,anon,authenticated;
grant execute on function public.quality_record_visual_quorum_v7(text,jsonb) to service_role;

drop function if exists public.quality_get_visual_quorum_v7(text);
create function public.quality_get_visual_quorum_v7(p_candidate_sha text)
returns table(candidate_sha text,result jsonb,pass_count integer,reject_count integer,first_seen_at timestamptz,last_seen_at timestamptz)
language sql security definer set search_path=private,public as $$
 select q.candidate_sha,q.result,q.pass_count,q.reject_count,q.first_seen_at,q.last_seen_at from private.quality_visual_quorum_v7 q where q.candidate_sha=p_candidate_sha;
$$;
revoke all on function public.quality_get_visual_quorum_v7(text) from public,anon,authenticated;
grant execute on function public.quality_get_visual_quorum_v7(text) to service_role;
commit;
