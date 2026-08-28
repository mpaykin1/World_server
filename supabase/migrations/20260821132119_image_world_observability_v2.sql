alter table public.image_world_jobs add column if not exists reference_profile jsonb;
alter table public.image_world_jobs add column if not exists last_heartbeat_at timestamptz;
create table if not exists public.image_world_job_events (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.image_world_jobs(id) on delete cascade,
  stage text not null check (length(stage) between 2 and 64),
  level text not null default 'INFO' check (level in ('INFO','WARN','ERROR')),
  code text not null default 'OK' check (length(code) between 2 and 80),
  message text not null check (length(message) between 1 and 1200),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists image_world_job_events_job_created_idx on public.image_world_job_events(job_id,created_at desc);
alter table public.image_world_job_events enable row level security;
revoke all on table public.image_world_job_events from anon,authenticated;
grant all on table public.image_world_job_events to service_role;
do $$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='image_world_job_events' and policyname='image world events server only') then
    create policy "image world events server only" on public.image_world_job_events for all to anon,authenticated using(false) with check(false);
  end if;
end $$;
create or replace function public.claim_image_world_job(p_worker_id text)
returns setof public.image_world_jobs
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if p_worker_id is null or length(p_worker_id)<3 or length(p_worker_id)>80 then raise exception 'invalid_worker_id'; end if;
  update public.image_world_jobs
  set status='GPU_QUEUED',progress=42,worker_id=null,claimed_at=null,last_heartbeat_at=null,
      error='GPU worker lease expired; automatically requeued.',updated_at=now()
  where status='GPU_RUNNING' and coalesce(last_heartbeat_at,claimed_at,updated_at)<now()-interval '20 minutes';
  select id into v_id from public.image_world_jobs where status='GPU_QUEUED' order by created_at asc for update skip locked limit 1;
  if v_id is null then return; end if;
  return query update public.image_world_jobs
    set status='GPU_RUNNING',progress=55,worker_id=p_worker_id,claimed_at=now(),last_heartbeat_at=now(),updated_at=now(),error=null
    where id=v_id and status='GPU_QUEUED' returning *;
end;
$$;
revoke all on function public.claim_image_world_job(text) from public,anon,authenticated;
grant execute on function public.claim_image_world_job(text) to service_role;
