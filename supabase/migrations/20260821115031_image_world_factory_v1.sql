create table if not exists public.image_world_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_bucket text not null default 'image-world-sources',
  source_path text not null,
  source_mime text not null check (source_mime in ('image/png','image/jpeg','image/webp')),
  source_bytes bigint not null check (source_bytes between 1 and 25165824),
  style jsonb not null default '{}'::jsonb,
  server_profile jsonb,
  gpu_profile jsonb,
  mesh_bucket text,
  mesh_path text,
  world_id text references public.voxel_worlds(id) on delete set null,
  status text not null default 'UPLOADING' check (status in ('UPLOADING','SERVER_PREVIEW','GPU_QUEUED','GPU_RUNNING','FINALIZING','READY','READY_SERVER_ONLY','FAILED')),
  progress smallint not null default 0 check (progress between 0 and 100),
  worker_id text,
  claimed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists image_world_jobs_user_created_idx on public.image_world_jobs(user_id, created_at desc);
create index if not exists image_world_jobs_queue_idx on public.image_world_jobs(status, created_at) where status='GPU_QUEUED';
create unique index if not exists image_world_jobs_source_uidx on public.image_world_jobs(source_bucket,source_path);
alter table public.image_world_jobs enable row level security;
revoke all on table public.image_world_jobs from anon, authenticated;
grant all on table public.image_world_jobs to service_role;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='image_world_jobs' and policyname='image world jobs server only') then
    create policy "image world jobs server only" on public.image_world_jobs for all to anon, authenticated using (false) with check (false);
  end if;
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values
  ('image-world-sources','image-world-sources',false,25165824,array['image/png','image/jpeg','image/webp']::text[]),
  ('image-world-output','image-world-output',false,104857600,array['text/plain','application/octet-stream','model/obj']::text[])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create or replace function public.claim_image_world_job(p_worker_id text)
returns setof public.image_world_jobs
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if p_worker_id is null or length(p_worker_id) < 3 or length(p_worker_id) > 80 then raise exception 'invalid_worker_id'; end if;
  select id into v_id from public.image_world_jobs where status='GPU_QUEUED' order by created_at asc for update skip locked limit 1;
  if v_id is null then return; end if;
  return query update public.image_world_jobs set status='GPU_RUNNING',progress=55,worker_id=p_worker_id,claimed_at=now(),updated_at=now(),error=null where id=v_id and status='GPU_QUEUED' returning *;
end;
$$;
revoke all on function public.claim_image_world_job(text) from public, anon, authenticated;
grant execute on function public.claim_image_world_job(text) to service_role;
