alter table public.quality_telemetry
  add column if not exists release_sha text,
  add column if not exists deployment_url text;
create index if not exists quality_telemetry_release_created_idx on public.quality_telemetry (release_sha, created_at desc);
