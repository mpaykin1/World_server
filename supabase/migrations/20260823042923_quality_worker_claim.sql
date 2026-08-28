begin;
create or replace function public.claim_quality_worker_job(p_worker text, p_capabilities jsonb default '[]'::jsonb, p_lease_seconds integer default 300)
returns setof public.quality_worker_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_worker is null or char_length(trim(p_worker)) < 3 then
    raise exception 'worker id required';
  end if;
  return query
  with picked as (
    select id
    from public.quality_worker_jobs
    where status='queued'
      and attempts < max_attempts
      and required_capabilities <@ coalesce(p_capabilities,'[]'::jsonb)
    order by priority desc, created_at asc
    for update skip locked
    limit 1
  )
  update public.quality_worker_jobs j
  set status='running',
      attempts=j.attempts+1,
      lease_owner=p_worker,
      lease_expires_at=now()+make_interval(secs=>greatest(30,least(p_lease_seconds,3600))),
      updated_at=now()
  from picked
  where j.id=picked.id
  returning j.*;
end;
$$;
revoke all on function public.claim_quality_worker_job(text,jsonb,integer) from public, anon, authenticated;
grant execute on function public.claim_quality_worker_job(text,jsonb,integer) to service_role;
commit;
