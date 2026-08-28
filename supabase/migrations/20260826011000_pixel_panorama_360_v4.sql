create table if not exists public.pixel_panorama_projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null default '',
  manifest_url text not null,
  preview_url text not null default '',
  frame_count integer not null default 0 check (frame_count >= 0),
  fps integer not null default 8 check (fps between 1 and 60),
  quality_tiers jsonb not null default '[]'::jsonb,
  quality_report jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_pixel_panorama_projects_updated on public.pixel_panorama_projects(updated_at desc);
alter table public.pixel_panorama_projects enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='pixel_panorama_projects' and policyname='pixel_panorama_projects_read') then
    create policy pixel_panorama_projects_read on public.pixel_panorama_projects for select using (true);
  end if;
end $$;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('panorama360','panorama360',true,1073741824,array['image/png','image/webp','application/json','video/mp4','video/webm','application/zip'])
on conflict (id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
