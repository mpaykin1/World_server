create or replace function public.quality_claim_worker_job_v11(
  p_worker text,
  p_capabilities jsonb default '[]'::jsonb,
  p_kinds jsonb default '[]'::jsonb,
  p_lease_seconds integer default 300
)
returns setof public.quality_worker_jobs
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
begin
  if p_worker is null or char_length(trim(p_worker)) < 3 then raise exception 'worker id required'; end if;
  if jsonb_typeof(coalesce(p_kinds,'[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_kinds,'[]'::jsonb))=0 then
    raise exception 'at least one allowed kind required';
  end if;
  return query
  with picked as (
    select j.id
    from public.quality_worker_jobs j
    where j.attempts < j.max_attempts
      and j.required_capabilities <@ coalesce(p_capabilities,'[]'::jsonb)
      and exists(select 1 from jsonb_array_elements_text(p_kinds) k(kind) where k.kind=j.kind)
      and (j.status='queued' or (j.status='running' and j.lease_expires_at is not null and j.lease_expires_at < now()))
    order by j.priority desc,j.created_at asc
    for update skip locked
    limit 1
  )
  update public.quality_worker_jobs j
  set status='running',attempts=j.attempts+1,lease_owner=p_worker,
      lease_expires_at=now()+make_interval(secs=>greatest(30,least(p_lease_seconds,3600))),
      updated_at=now(),error=case when j.status='running' then 'reclaimed-expired-lease' else j.error end
  from picked
  where j.id=picked.id
  returning j.*;
end;
$$;
revoke all on function public.quality_claim_worker_job_v11(text,jsonb,jsonb,integer) from public,anon,authenticated;
grant execute on function public.quality_claim_worker_job_v11(text,jsonb,jsonb,integer) to service_role;
